'use client'

/**
 * KingdomScene3D.tsx — Canvas orchestrator
 *
 * The living Kingdom map. Three.js + React Three Fiber.
 *
 * Six territories float in a dark void. Activity from SCRYER_BRIDGE
 * drives glow intensity. Drone particles fly between active territories.
 * Click a territory to select it.
 *
 * PHASE 1: Glowing spheres + connection beams + drone swarms.
 * PHASE 2: Replace spheres with PNG sprite planes (Brandon/Aeris art drops in).
 *
 * Subsystems extracted (2026-03-13):
 *   TerritoryNode.tsx  — per-territory 3D building + all owned constants
 *   KingdomCamera.tsx  — CinematicOrbit, WASDControls, FlyToController
 *   KingdomHUD.tsx     — StatusBar, DebugPanel (DOM layer)
 *
 * This file owns: scene setup, lighting, ground mesh, connection beams,
 * CoreLoreCascade, SwarmOrchestrator, TerritoryDetailFloat, Canvas wrapper.
 *
 * TerritoryDetailFloat (S202 upgrade):
 *   - Territory description line from kingdom-layout.ts
 *   - Agent section for ALL territories with agents (was claude_house-only)
 *   - Shows tool code, cwd_project, age_seconds from AgentStatus
 *   - Mini signal feed: last 3 signals for this territory
 *   - ESC closes panel; Tab/←/→ cycles territories (FlyToController follows)
 *   - Heartbeat border pulse when agent is actively working
 */

import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useKingdomStore, usePartyKitSync } from '@/lib/kingdom-store'
import type { AgentState } from '@/lib/kingdom-agents'
import { TERRITORY_TO_AGENT, AGENT_REGISTRY, TOOL_CODES } from '@/lib/kingdom-agents'
import { DroneSwarms } from './DroneSwarm'
import { SignalPulses } from './SignalPulse'
import { TimeStream } from './TimeStream'
import { SystemHeartbeat } from './SystemHeartbeat'
import { OvmindRing } from './OvmindRing'
import { TERRITORIES, TERRITORY_MAP, EDGES, getWorldY } from '@/lib/kingdom-layout'
import {
  TerritoryNode,
  BuildingState,
  deriveBuildingState,
  BUILDING_STATE_CONFIG,
  AGENT_STATE_COLORS,
} from './TerritoryNode'
import { CinematicOrbit, WASDControls, FlyToController } from './KingdomCamera'
import { StatusBar, DebugPanel } from './KingdomHUD'

// ---------------------------------------------------------------------------
// CONNECTION BEAM
// ---------------------------------------------------------------------------

interface ConnectionBeamProps {
  fromId: string
  toId: string
}

function ConnectionBeam({ fromId, toId }: ConnectionBeamProps) {
  const getActivity = useKingdomStore((s) => s.getActivity)

  const from = TERRITORY_MAP[fromId]
  const to = TERRITORY_MAP[toId]

  // Create line + material once — never re-create on render
  const { lineObj, material } = useMemo(() => {
    const points = from && to
      ? [
          new THREE.Vector3(from.position[0], getWorldY(from), from.position[2]),
          new THREE.Vector3(to.position[0],   getWorldY(to),   to.position[2]),
        ]
      : [new THREE.Vector3(), new THREE.Vector3()]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    // Patch 5: beam glows in source territory's color — network reads as colored light threads.
    // from?.color is module-level const from TERRITORY_MAP, never changes — empty deps correct.
    const beamColor = from?.color ?? '#FF1493'
    const mat = new THREE.LineBasicMaterial({
      color: beamColor,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return { lineObj: new THREE.Line(geometry, mat), material: mat }
    // `from`/`to`/`from.color` come from TERRITORY_MAP — module-level const, never mutated.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      lineObj.geometry.dispose()
      material.dispose()
    }
  }, [lineObj, material])

  useFrame(() => {
    if (!from || !to) return
    const combined = (getActivity(fromId) + getActivity(toId)) / 2
    material.opacity = 0.06 + (combined / 100) * 0.45
  })

  if (!from || !to) return null

  return <primitive object={lineObj} />
}

// ---------------------------------------------------------------------------
// KINGDOM GROUND — hilly terrain with glowing wireframe grid overlay
// ---------------------------------------------------------------------------

function KingdomGround() {
  const groundGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(50, 50, 60, 60)
    const pos = geo.attributes.position.array as Float32Array

    // Displace Z (becomes world Y after -PI/2 X rotation) — MUST match getTerrainY() exactly.
    // Amplitudes are ×0.4 of the original to give rolling hills (max ±~1.0) not mountains.
    // plane local Y ≈ world Z after the -PI/2 X rotation applied to this mesh.
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]
      const z = -pos[i + 1]  // plane local Y → world -Z after R_x(-π/2); negate to get world Z
      pos[i + 2] =
        Math.sin(x * 0.42 + 0.8) * 0.28 +
        Math.sin(z * 0.38 - 0.6) * 0.24 +
        Math.cos((x + z) * 0.28) * 0.20 +
        Math.sin(x * 0.85 - 0.3) * 0.12 +
        Math.cos(z * 0.70 + x * 0.25) * 0.14
    }

    geo.computeVertexNormals()
    return geo
  }, [])

  useEffect(() => () => groundGeo.dispose(), [groundGeo])

  return (
    <group>
      {/* Solid dark terrain surface */}
      <mesh geometry={groundGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <meshStandardMaterial
          color="#0a0818"
          roughness={0.98}
          metalness={0.0}
          emissive="#040110"
          emissiveIntensity={0.10}
        />
      </mesh>
      {/* Cyan wireframe grid — primary crisp layer.
          Opacity reduced 40% (0.22 → 0.13). Two glow halos above it
          simulate bloom without a full post-processing pass. */}
      <mesh geometry={groundGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.010, 0]}>
        <meshBasicMaterial color="#00D9FF" wireframe transparent opacity={0.02}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Glow halo 1 — slightly brighter, starts the halo */}
      <mesh geometry={groundGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
        <meshBasicMaterial color="#40EEFF" wireframe transparent opacity={0.008}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Glow halo 2 — near-white, diffuse outer bloom */}
      <mesh geometry={groundGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]}>
        <meshBasicMaterial color="#9AF8FF" wireframe transparent opacity={0.003}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// BLOOM — neon corona on active buildings. Threshold 0.55 sits just above
// the peach/mint base colors (~0.56 luminance) so only emissive peaks bloom.
// Working-state buildings (emissiveIntensity up to 2.0) bloom hard.
// Stable buildings bloom faintly or not at all. Ground/terrain unaffected.
// ---------------------------------------------------------------------------

function KingdomBloom() {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.55}
        luminanceSmoothing={0.85}
        intensity={1.2}
        mipmapBlur
      />
    </EffectComposer>
  )
}

// ---------------------------------------------------------------------------
// SCENE CONTENTS (inside Canvas)
// ---------------------------------------------------------------------------

function SceneContents() {
  usePartyKitSync()
  const orbitRef = useRef<OrbitControlsImpl | null>(null)

  // Set OrbitControls initial target imperatively — never via JSX prop.
  // A JSX `target={[...]}` prop creates a new array on every render of SceneContents
  // which R3F's reconciler re-applies, snapping the orbit pivot back to origin mid-WASD.
  useEffect(() => {
    orbitRef.current?.target.set(0, 0.5, 0)
    orbitRef.current?.update()
  }, [])

  return (
    <>
      {/* Lighting — synthwave two-tone. White ambient (low) ensures all base color channels
          survive. Warm-white front key still reads as dusk but G:60%/B:40% vs pure orange
          G:42%/B:21% — cool base colors (lavender, periwinkle) now illuminate correctly.
          Cool back fill from opposite angle: warm-front/cool-back = classic synthwave drama,
          also illuminates shadow faces so flat-shading facet contrast actually reads. */}
      <ambientLight intensity={0.07} color="#ffffff" />
      <directionalLight position={[-8, 12, 14]} intensity={0.15} color="#FF9966" />
      <directionalLight position={[8, 6, -10]}  intensity={0.07} color="#4466BB" />

      {/* Hilly terrain with wireframe grid */}
      <KingdomGround />

      {/* Ambient data flow toward THE_SCRYER */}
      <TimeStream />

      {/* Signal pulses — discrete events traveling along beams */}
      <SignalPulses />

      {/* Directed drone swarms — active_events.json driven */}
      <DroneSwarms />

      {/* System heartbeat layer — GOLDFISH (5min) + SCRYER watch ring (60s) */}
      <SystemHeartbeat />

      {/* Overmind broadcast rings — expand from THE_SCRYER on overmind signal events */}
      <OvmindRing />

      {/* Bloom — neon corona on active buildings, cyan grid intersection glow */}
      <KingdomBloom />

      {/* Connection beams */}
      {EDGES.map(([aId, bId]) => (
        <ConnectionBeam key={`${aId}-${bId}`} fromId={aId} toId={bId} />
      ))}

      {/* Territory nodes */}
      {TERRITORIES.map((t) => (
        <TerritoryNode key={t.id} territory={t} />
      ))}

      {/* Cinematic auto-orbit — engages after 15s idle, yields to any user input */}
      <CinematicOrbit orbitRef={orbitRef} />

      {/* WASD pan */}
      <WASDControls orbitRef={orbitRef} />

      {/* Fly-to — animates camera toward clicked territory */}
      <FlyToController orbitRef={orbitRef} />

      {/* Camera controls — allow user to orbit/zoom */}
      {/* BUGFIX: minPolarAngle/maxPolarAngle prevent camera orbiting underground.
          0.1*PI = 18° from zenith (bird's eye). 0.82*PI = 147.6° (just below horizon).
          Same fix applied to homepage OrbitControls in S184. */}
      {/* enableDamping: scroll/drag coasts past stop point, decelerates to rest.
          dampingFactor 0.08 — noticeable glide without feeling drunk.
          Drei's OrbitControls handles its own update loop — no separate useFrame needed. */}
      <OrbitControls
        ref={orbitRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        enableDamping={true}
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={40}
        minPolarAngle={Math.PI * 0.1}
        maxPolarAngle={Math.PI * 0.82}
      />

      {/* CORE LORE cascade — expanding knowledge rings on agent searching state */}
      <CoreLoreCascade />

      {/* Swarm orchestrator — monitors agent states, spawns orbit swarms on working/swarming */}
      <SwarmOrchestrator />

      {/* Territory detail panel — 3D-anchored via Html, floats above selected building */}
      <TerritoryDetailFloat />
    </>
  )
}

// ---------------------------------------------------------------------------
// CORE LORE CASCADE
//
// When any agent enters `searching` state, CORE LORE emits expanding ring waves.
// Knowledge accessed has weight. This animation is unique to CORE LORE — no other
// territory does this. Identity rings (TerritoryNode) are static. These move.
//
// ARCHITECTURE: zero allocation per frame. Pre-allocated pool of WAVE_POOL meshes.
// useFrame reads agentStates via getState() (no subscription, no re-renders).
// Rings start at MIN_RADIUS, expand to MAX_RADIUS over WAVE_DURATION seconds,
// opacity fades out as they reach the edge.
//
// REGRESSION GUARD: mesh.scale.set(0,0,0) when inactive — never leave ghost geometry.
// ---------------------------------------------------------------------------

const CORE_WAVE_POOL     = 4      // simultaneous rings in flight
const CORE_WAVE_DURATION = 2.8    // seconds to travel full radius
const CORE_WAVE_INTERVAL = 1.8    // seconds between new waves while searching
const CORE_RING_MIN_R    = 0.4    // world units — spawn radius
const CORE_RING_MAX_R    = 5.6    // world units — death radius
const CORE_RING_TUBE     = 0.025  // torus tube thickness — hairline
const CORE_RING_SEGS     = 64     // tubular segments — smooth circle
const CORE_LAYOUT        = TERRITORY_MAP['core_lore']
const CORE_ANCHOR: [number, number, number] = [
  CORE_LAYOUT.position[0],
  getWorldY(CORE_LAYOUT) + 0.06,  // just above terrain surface
  CORE_LAYOUT.position[2],
]

interface CascadeWave {
  active:    boolean
  startTime: number
}

function CoreLoreCascade() {
  const pool     = useRef<CascadeWave[]>(
    Array.from({ length: CORE_WAVE_POOL }, () => ({ active: false, startTime: 0 }))
  )
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: CORE_WAVE_POOL }, () => null)
  )
  const lastSpawn = useRef(0)

  useFrame(({ clock }) => {
    const now     = clock.elapsedTime
    const waves   = pool.current
    const meshes  = meshRefs.current

    // Read current agent states without subscribing (no re-render)
    // PERF: AGENT_REGISTRY.some() avoids Object.values() array allocation at 60fps.
    // Object.values(agentStates) allocates a temporary array every frame — unnecessary.
    // AGENT_REGISTRY is module-scope constant; .some() short-circuits on first match.
    const { agentStates } = useKingdomStore.getState()
    const anySearching = AGENT_REGISTRY.some(a => agentStates[a.key]?.state === 'searching')

    // Spawn new wave into the first free slot
    if (anySearching && now - lastSpawn.current >= CORE_WAVE_INTERVAL) {
      const slot = waves.findIndex((w) => !w.active)
      if (slot !== -1) {
        waves[slot].active    = true
        waves[slot].startTime = now
        lastSpawn.current     = now
      }
    }

    // Animate each ring in the pool
    for (let i = 0; i < CORE_WAVE_POOL; i++) {
      const wave = waves[i]
      const mesh = meshes[i]
      if (!mesh) continue

      if (!wave.active) {
        mesh.scale.set(0, 0, 0)
        continue
      }

      const p = (now - wave.startTime) / CORE_WAVE_DURATION

      if (p >= 1) {
        wave.active = false
        mesh.scale.set(0, 0, 0)
        continue
      }

      const radius = CORE_RING_MIN_R + (CORE_RING_MAX_R - CORE_RING_MIN_R) * p

      // Opacity: ramp in fast (first 8%), hold, ease out slowly (last 40%)
      let opacity: number
      if (p < 0.08) {
        opacity = p / 0.08
      } else if (p > 0.60) {
        opacity = 1 - (p - 0.60) / 0.40
      } else {
        opacity = 1
      }
      opacity *= 0.55  // max opacity — present but not overpowering

      // Flat ring on XZ plane — scale X and Z, keep Y=1 (geometry is in XY plane, rotated)
      mesh.scale.set(radius, radius, 1)
      // Type guard: material is always MeshStandardMaterial here (set in JSX), but
      // guard against null/wrong-type during unmount races.
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.opacity = opacity
      }
    }
  })

  return (
    <group position={CORE_ANCHOR}>
      {Array.from({ length: CORE_WAVE_POOL }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el }}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[0, 0, 0]}
        >
          <torusGeometry args={[1, CORE_RING_TUBE, 3, CORE_RING_SEGS]} />
          <meshStandardMaterial
            color={CORE_LAYOUT.color}
            emissive={CORE_LAYOUT.color}
            emissiveIntensity={2.2}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// SWARM ORCHESTRATOR
//
// Monitors live agent states and spawns orbit swarms client-side — no SCRYER
// event required. Drones circle a territory while its agent is actively working.
//
// State → behavior:
//   working | writing | running → orbit (loose radius, 8s lap)
//   swarming                    → orbit (tight radius, faster breathe)
//   all others                  → no orbit (let existing swarm expire)
//
// Architecture (adversarial-reviewed):
//   - setInterval at 3s polling getState() directly — zero React subscriptions,
//     zero re-renders. (Subscription to whole agentStates causes render storms
//     because hydrateAgentStates creates a new object ref on every 15s poll.)
//   - Fixed IDs per agent: 'orbit_{agentKey}'. On remount, checks activeDroneSwarms
//     for live swarm before spawning — store IS the authoritative ref.
//   - Renews if swarm expires within 10s and agent still active.
//   - SCRYER to_territory events also enriched with territory droneColor (handled
//     in applyActiveEvents via TERRITORY_MAP[id].droneColor).
// ---------------------------------------------------------------------------

// Only swarming triggers orbit — drones orbit when agent is running sub-agents (Agent tool).
// Other active states (working/writing/running) are expressed through building emissive only.
const ORBIT_STATES = new Set<AgentState>(['swarming'])
// Long TTL for orbit swarms — 60s so they stay alive across multiple poll intervals
const ORBIT_TTL_MS = 60_000
// Renew when this many ms remain before expiry
const ORBIT_RENEW_AT_MS = 10_000

function SwarmOrchestrator() {
  useEffect(() => {
    const check = () => {
      const { agentStates, activeDroneSwarms, pushDroneSwarm } = useKingdomStore.getState()
      const now = Date.now()

      for (const agent of AGENT_REGISTRY) {
        const { key: agentKey, territory: territoryId } = agent
        const state = agentStates[agentKey]?.state

        if (!state || !ORBIT_STATES.has(state)) continue

        const orbitId  = `orbit_${agentKey}`
        const existing = activeDroneSwarms.find((s) => s.id === orbitId)

        // Skip if a live orbit swarm for this agent still has more than ORBIT_RENEW_AT_MS remaining
        if (existing && existing.active && (existing.expiresAt - now) > ORBIT_RENEW_AT_MS) continue

        const territory = TERRITORY_MAP[territoryId]
        if (!territory) continue

        // pushDroneSwarm now accepts optional ttl — orbit swarms use 60s
        pushDroneSwarm({
          id:                orbitId,
          label:             state,        // used by computeLeaderWaypoint for radius + breatheFreq
          sourceTerritoryId: territoryId,
          targetTerritoryId: territoryId,  // orbit has no separate target
          direction:         'orbit',
          color:             territory.droneColor,
          active:            true,
          startedAt:         now,
          ttl:               ORBIT_TTL_MS,
        })
      }
    }

    // Check immediately on mount, then every 3s
    check()
    const id = setInterval(check, 3000)
    return () => clearInterval(id)
  }, [])

  return null
}

// ---------------------------------------------------------------------------
// TERRITORY DETAIL FLOAT — support constants
// ---------------------------------------------------------------------------

// Signal type → color. Mirrors SignalPulse.tsx SIGNAL_COLORS — kept in sync manually.
// Defined here (not imported) to avoid bidirectional component dependency.
const DETAIL_SIGNAL_COLORS: Record<string, string> = {
  claude:  '#7000ff',
  aeris:   '#ff006e',
  brandon: '#f0a500',
  system:  '#e8e0d0',
  overmind: '#f0a500',
  scryer:  '#00f3ff',
  raven:   '#9b30ff',
  unknown: '#404040',
}

// Show only the last path component of cwd_project — full paths are too long for the panel.
function shortProject(cwd: string): string {
  if (!cwd) return ''
  const parts = cwd.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? cwd
}

// Format age_seconds as "Xm Ys" or "Xs".
function formatAge(secs: number): string {
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

// Format signal timestamp as "just now" / "Xs ago" / "Xm ago".
function signalAge(ts: number): string {
  const delta = Math.floor((Date.now() - ts) / 1000)
  if (delta < 5)  return 'just now'
  if (delta < 60) return `${delta}s ago`
  return `${Math.floor(delta / 60)}m ago`
}

// Territory ordering for keyboard navigation — same order as TERRITORIES array.
const TERRITORY_IDS_ORDERED = TERRITORIES.map((t) => t.id)

// ---------------------------------------------------------------------------
// TERRITORY DETAIL FLOAT (screen-space overlay — positioned outside Canvas)
//
// Replaces the old DOM overlay approach. Using drei <Html> anchored to the
// territory's world position means the popup naturally sits near the building
// rather than pinned to a screen corner.
//
// REGRESSION GUARD: hooks must all be called before any early return.
// The detailBuildingState selector MUST remain reactive (no getState() in render).
// ---------------------------------------------------------------------------

function TerritoryDetailFloat() {
  const selectedId      = useKingdomStore((s) => s.selectedId)
  const selectTerritory = useKingdomStore((s) => s.selectTerritory)
  // Reactive building state — see REGRESSION GUARD above.
  // REGRESSION GUARD: hooks must all be called before any early return.
  // The detailBuildingState selector MUST remain reactive (no getState() in render).
  const detailBuildingState = useKingdomStore((s): BuildingState => {
    if (!selectedId) return 'stable'
    const override = s.debugOverrides[selectedId]
    if (override) {
      const agentState: AgentState = override.status === 'offline' ? 'offline'
        : override.status === 'idle' ? 'online'
        : 'working'
      return deriveBuildingState(agentState)
    }
    const agentKey = TERRITORY_TO_AGENT[selectedId]
    const agentState: AgentState = agentKey
      ? ((s.agentStates[agentKey]?.state ?? 'offline') as AgentState)
      : 'online'
    return deriveBuildingState(agentState)
  })
  const liveData = useKingdomStore((s) => selectedId ? s.territoryMap.get(selectedId) : undefined)
  // Agent state for selected territory — ALL agent-inhabited territories (not just claude_house).
  // core_lore and the_scryer have no agent key → return null → agent section hidden.
  // REGRESSION GUARD: subscribe to s.agentStates, derive key inline (never subscribe to getter fn).
  const agentStateDetail = useKingdomStore((s) => {
    if (!selectedId) return null
    const key = TERRITORY_TO_AGENT[selectedId]
    if (!key) return null
    return s.agentStates[key] ?? null
  })
  // Recent signals for this territory — last 3 for mini feed.
  // FIX: selector returned new array on every call (.filter().slice() = new ref always)
  // → Zustand useSyncExternalStore saw "change" every render → infinite loop.
  // Subscribe to the raw array (stable ref — Zustand replaces on update),
  // then derive filtered result via useMemo (stable across renders unless deps change).
  const recentSignalEvents = useKingdomStore((s) => s.recentSignalEvents)
  const territorySignals = useMemo(
    () => selectedId
      ? recentSignalEvents.filter((e) => e.territory === selectedId).slice(0, 3)
      : [],
    [selectedId, recentSignalEvents]
  )

  // ESC to close, Tab/ArrowRight/ArrowLeft to cycle territories.
  // Uses getState() inside handler — no stale closure on selectedId.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const id = useKingdomStore.getState().selectedId
      if (!id) return
      if (e.key === 'Escape') {
        useKingdomStore.getState().selectTerritory(null)
        return
      }
      const idx = TERRITORY_IDS_ORDERED.indexOf(id)
      if (idx === -1) return
      if (e.key === 'Tab' || e.key === 'ArrowRight') {
        e.preventDefault()
        useKingdomStore.getState().selectTerritory(
          TERRITORY_IDS_ORDERED[(idx + 1) % TERRITORY_IDS_ORDERED.length]
        )
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        useKingdomStore.getState().selectTerritory(
          TERRITORY_IDS_ORDERED[(idx - 1 + TERRITORY_IDS_ORDERED.length) % TERRITORY_IDS_ORDERED.length]
        )
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!selectedId) return null

  const layout = TERRITORY_MAP[selectedId]
  if (!layout) return null

  const isWorking = detailBuildingState === 'working'

  // 3D-anchored panel: floats above the selected building in world space.
  // Html from Drei projects the world position to screen, then CSS-positions the DOM element.
  // center = translate(-50%, -50%) so the panel is centered on the anchor point.
  // Anchor Y = terrain height + 6 units — well above any building geometry.
  const anchorX = layout.position[0]
  const anchorY = getWorldY(layout) + 6
  const anchorZ = layout.position[2]

  return (
    <Html
      center
      position={[anchorX, anchorY, anchorZ]}
      zIndexRange={[60, 0]}
      style={{ pointerEvents: 'auto' }}
    >

      {/* Active heartbeat keyframe — border pulses when agent is working.
          Inline style tag: territory color is dynamic, can't live in globals.css. */}
      {isWorking && (
        <style href={`detail-pulse-${selectedId}`} precedence="default">{`
          @keyframes detail-border-pulse-${selectedId} {
            0%, 100% { box-shadow: 0 0 24px ${layout.color}25, 0 6px 32px rgba(0,0,0,0.7); }
            50%       { box-shadow: 0 0 44px ${layout.color}55, 0 6px 44px rgba(0,0,0,0.85); }
          }
        `}</style>
      )}
      {/* CRT terminal power-on: flash → scan reveal → settle (0.55s).
          clip-path requires overflow:hidden on the outer container.
          @keyframes crt-scan-in defined in globals.css. */}
      <div
        style={{
          width: 460,
          background: 'rgba(8,6,14,0.88)',
          border: `1px solid ${layout.color}30`,
          borderLeft: `3px solid ${layout.color}60`,
          borderRadius: 8,
          padding: '20px 24px 18px',
          fontFamily: 'monospace',
          color: '#e8e0d0',
          textShadow: `0 0 8px ${layout.color}30, 0 0 2px rgba(200,180,255,0.15)`,
          backdropFilter: 'blur(20px)',
          boxShadow: `0 0 60px ${layout.color}18, 0 0 120px ${layout.color}06, 0 12px 60px rgba(0,0,0,0.85)`,
          userSelect: 'none',
          overflow: 'hidden',
          // Delayed entrance: wait 1.2s for camera to mostly arrive, then fade up
          animation: isWorking
            ? `panel-materialize 0.8s ease-out 1.2s both, detail-border-pulse-${selectedId} 2.2s ease-in-out 2.0s infinite`
            : 'panel-materialize 0.8s ease-out 1.2s both',
        }}
      >
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ color: `${layout.color}90`, fontSize: 9, letterSpacing: '0.22em', marginBottom: 3 }}>
              TERRITORY
            </div>
            <div style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: '0.10em', textShadow: `0 0 14px ${layout.color}80, 0 0 4px ${layout.color}40` }}>
              {layout.label}
            </div>
            <div style={{ color: '#504848', fontSize: 9, letterSpacing: '0.05em', marginTop: 5, fontStyle: 'italic', lineHeight: 1.5 }}>
              {layout.description}
            </div>
          </div>
          <button
            onClick={() => selectTerritory(null)}
            style={{
              background: 'none', border: 'none', color: '#504840',
              cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 0 0 8px',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* ── STATUS ── */}
        {liveData && (() => {
          const bCfg = BUILDING_STATE_CONFIG[detailBuildingState]
          return (
            <>
              <div style={{ height: 1, background: `${layout.color}18`, margin: '0 0 8px' }} />
              <div style={{ fontSize: 9, letterSpacing: '0.18em', color: `${layout.color}60`, marginBottom: 6 }}>STATUS</div>
              <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#504840' }}>ACTIVITY</span>
                  <span style={{ color: layout.color }}>{liveData.activity}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#504840' }}>STATE</span>
                  <span style={{ color: bCfg.stateLabelColor, letterSpacing: '0.08em' }}>
                    {bCfg.stateLabel}
                  </span>
                </div>
                {liveData.lastSignal && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#504840' }}>LAST SIGNAL</span>
                    <span style={{ color: '#504040', fontSize: 10 }}>
                      {new Date(liveData.lastSignal).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
            </>
          )
        })()}

        {/* ── AGENT — all territories with agents, not just claude_house ── */}
        {agentStateDetail && agentStateDetail.state !== 'offline' && (() => {
          const proj = shortProject(agentStateDetail.cwd_project)
          const toolCode = agentStateDetail.tool ? (TOOL_CODES[agentStateDetail.tool] ?? null) : null
          return (
            <>
              <div style={{ height: 1, background: `${layout.color}18`, margin: '8px 0' }} />
              <div style={{ fontSize: 9, letterSpacing: '0.18em', color: `${layout.color}60`, marginBottom: 6 }}>AGENT</div>
              <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#504840' }}>STATE</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {toolCode && (
                      <span style={{ color: `${AGENT_STATE_COLORS[agentStateDetail.state]}70`, fontSize: 9, letterSpacing: '0.06em' }}>
                        [{toolCode}]
                      </span>
                    )}
                    <span style={{ color: AGENT_STATE_COLORS[agentStateDetail.state], letterSpacing: '0.08em' }}>
                      {agentStateDetail.state.toUpperCase()}
                    </span>
                  </span>
                </div>
                {proj && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: '#504840', flexShrink: 0 }}>PROJECT</span>
                    <span style={{ color: '#806050', fontSize: 10, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {proj}
                    </span>
                  </div>
                )}
                {agentStateDetail.age_seconds > 0 && agentStateDetail.age_seconds < 9990 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#504840' }}>ACTIVE FOR</span>
                    <span style={{ color: '#504040', fontSize: 10 }}>
                      {formatAge(agentStateDetail.age_seconds)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )
        })()}

        {/* ── SIGNALS — last 3 signal events for this territory ── */}
        {territorySignals.length > 0 && (
          <>
            <div style={{ height: 1, background: `${layout.color}18`, margin: '8px 0' }} />
            <div style={{ fontSize: 9, letterSpacing: '0.18em', color: `${layout.color}60`, marginBottom: 6 }}>SIGNALS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {territorySignals.map((sig) => (
                <div key={sig.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                    background: DETAIL_SIGNAL_COLORS[sig.type] ?? '#404040',
                  }} />
                  <span style={{ color: '#504840', fontSize: 9, flex: 1, letterSpacing: '0.08em' }}>
                    {sig.type.toUpperCase()}
                  </span>
                  <span style={{ color: '#302830', fontSize: 8, fontStyle: 'italic', flexShrink: 0 }}>
                    {signalAge(sig.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── CONNECTIONS ── */}
        {layout.connections.length > 0 && (
          <>
            <div style={{ height: 1, background: `${layout.color}12`, margin: '8px 0' }} />
            <div style={{ fontSize: 9, letterSpacing: '0.18em', color: `${layout.color}50`, marginBottom: 6 }}>TRANSMITS TO</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {layout.connections.map((cId) => {
                const c = TERRITORY_MAP[cId]
                return c ? (
                  <span
                    key={cId}
                    onClick={() => selectTerritory(cId)}
                    style={{
                      border: `1px solid ${c.color}30`,
                      padding: '1px 6px',
                      borderRadius: 2,
                      color: `${c.color}b0`,
                      cursor: 'pointer',
                      fontSize: 9,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {c.label}
                  </span>
                ) : null
              })}
            </div>
          </>
        )}

        {/* Keyboard hint */}
        <div style={{ marginTop: 10, fontSize: 8, color: '#352830', letterSpacing: '0.1em', textAlign: 'center' }}>
          ESC · TAB / ← → TO CYCLE
        </div>
      </div>
    </Html>
  )
}
// ---------------------------------------------------------------------------
// MAIN EXPORT — The Kingdom Scene
// ---------------------------------------------------------------------------

interface KingdomScene3DProps {
  className?: string
}

export function KingdomScene3D({ className = '' }: KingdomScene3DProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // Synthwave dusk sky — deep indigo top, purple mid, warm orange horizon bleed.
        // alpha:true on Canvas lets WebGL canvas be transparent so this shows through.
        background: 'linear-gradient(to bottom, #03000A 0%, #08001F 30%, #05010B 50%, #0F0402 75%, #050200 100%)',
      }}
    >
      {/* R3F Canvas */}
      <Canvas
        camera={{
          fov: 45,
          near: 0.1,
          far: 200,
          position: [10, 14, 14],
        }}
        dpr={[1, 2]}
        gl={{
          antialias: false,
          alpha: true,      // transparent canvas — CSS sky gradient shows through WebGL
          powerPreference: 'high-performance',  // prefer discrete GPU on dual-GPU systems (no visual change)
        }}
        style={{ width: '100%', height: '100%' }}
        onPointerMissed={() => {
          // Click on empty space (not a territory) → deselect → camera flies back to overview
          useKingdomStore.getState().selectTerritory(null)
        }}
      >
        <SceneContents />
      </Canvas>

      {/* DOM overlays */}
      <StatusBar />
      <DebugPanel />

      {/* Hint text */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#504840',
          letterSpacing: '0.1em',
          pointerEvents: 'none',
        }}
      >
        CLICK TERRITORY · DRAG TO ORBIT · SCROLL TO ZOOM · WASD TO PAN · Q/E TO ROTATE
      </div>
    </div>
  )
}
