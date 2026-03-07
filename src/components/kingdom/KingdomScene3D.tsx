'use client'

/**
 * KingdomScene3D.tsx
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
 * No art needed for Phase 1. Shape first. Art later. Data always real.
 */

import React, { useRef, useMemo, useCallback, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useKingdomStore, usePartyKitSync } from '@/lib/kingdom-store'
import type { AgentState } from '@/lib/kingdom-agents'
import { TERRITORY_TO_AGENT } from '@/lib/kingdom-agents'
import { DroneSwarms } from './DroneSwarm'
import { SignalPulses } from './SignalPulse'
import { TimeStream } from './TimeStream'
import { SystemHeartbeat } from './SystemHeartbeat'
import { TERRITORIES, TERRITORY_MAP, EDGES, getTerrainY, getWorldY } from '@/lib/kingdom-layout'
import type { TerritoryLayout } from '@/lib/kingdom-layout'

// ---------------------------------------------------------------------------
// BUILDING STATES
// ---------------------------------------------------------------------------
// Three states derived from live territory status. Each has distinct visuals.
// OFFLINE = dark, static. STABLE = steady glow, static. WORKING = dramatic pulse.

type BuildingState = 'offline' | 'stable' | 'working'

// Maps 9-state agent model → 3-state building visual.
// 'online' = territory is alive but idle → stable glow.
// Any active state = running/writing/etc → hot pulsing.
// Territories without agents (core_lore, the_scryer) return 'online' from getAgentState().
function deriveBuildingState(agentState: AgentState): BuildingState {
  if (agentState === 'offline') return 'offline'
  if (agentState === 'online') return 'stable'
  return 'working'  // thinking | reading | working | writing | running | searching | swarming
}

interface BuildingStateConfig {
  emissiveBase: number
  breatheAmplitude: number
  breatheFreq: number
  lightIntensityMul: number
  stateLabel: string
  stateLabelColor: string
}

// Per-territory flat-shaded base colors — module scope so they aren't re-allocated on every
// TerritoryNode render. Bright enough to read through the warm-white directional fill.
// Neon emissive stays territory.color (separate channel).
const TERRITORY_BASE_COLORS: Record<string, string> = {
  claude_house: '#BB88FF',  // bright lavender   → warm rose-pink under orange fill
  the_throne:   '#FF88CC',  // hot pink          → warm coral under orange fill
  the_forge:    '#FFD966',  // warm gold          → stays gold — loves orange light
  the_tower:    '#88AAFF',  // periwinkle         → soft lilac under orange fill
  the_scryer:   '#44EECC',  // cyan-teal          → warm teal-white under orange fill
  core_lore:    '#FFEECC',  // warm ivory         → bright cream — sacred/warm
}

// Ring constants — decoupled from agent state.
// Ring = "this territory exists" (always true). Emissive/label = current activity.
// All 6 territories show the same idle ring. Selected ring elevated to mark selection.
const RING_OPACITY_BASE  = 0.55
const RING_BREATHE_AMP   = 0.04
const RING_BREATHE_FREQ  = 0.6    // rad/s — gentle ~10s cycle, like a slow pulse

// 🏛️ ARCHAEOLOGICAL RECORD // EMISSIVE_FLOOR Color Physics
// 🗓️ 2026-03-06 | Session 166 | FIX-B
// ISSUE: The Forge appeared to glow while Claude's House and The Tower looked dark.
//        Hypothesis H2 confirmed: this is color physics, not data pipeline failure.
//        Three.js MeshStandardMaterial emissive at intensity 0.18 behaves differently
//        per hue: Gold (#f0a500) has high luminance (R=240, G=165, B=0) — visible even
//        at low intensity. Purple (#7000ff, #9b30ff) has low perceived luminance — below
//        ~0.30 intensity it disappears into the void scene's dark background.
//        Result: Forge (gold, activity=85) blazed. Tower (purple, activity=40) was
//        invisible. Created a false "Forge is special" effect.
// RESOLUTION: Raised EMISSIVE_FLOOR from 0.18 to 0.35. All territory emissives now
//             perceptible at idle regardless of hue.
// LAW: When adding a new territory color, verify it's visible at EMISSIVE_FLOOR in the
//      void scene (#03000A bg). Low-luminance hues (purple, navy, deep red) are at risk.
//
// REGRESSION GUARD: emissive floor — same philosophy as RING_OPACITY_BASE: territory existing ≠ darkness.
// Applied to stable/working states only. Offline (cfg.emissiveBase=0.015) is intentionally
// dark — that state conveys absence. Idle agents (state=online, activity=0) are present,
// so they hold a faint identity glow.
const EMISSIVE_FLOOR = 0.35

const BUILDING_STATE_CONFIG: Record<BuildingState, BuildingStateConfig> = {
  offline: {
    emissiveBase:       0.015,
    breatheAmplitude:   0,
    breatheFreq:        0,
    lightIntensityMul:  0.02,
    stateLabel:         'OFFLINE',
    stateLabelColor:    '#201810',
  },
  stable: {
    // Visible resting glow — territory is present and alive at rest.
    // Raised from 0.13 → 0.45 so the scene reads as a living kingdom, not a void,
    // even when no agent activity data is available (e.g. production with no local API).
    emissiveBase:       0.45,
    breatheAmplitude:   0.06,
    breatheFreq:        0.6,
    lightIntensityMul:  0.50,
    stateLabel:         'STABLE',
    stateLabelColor:    '#706050',
  },
  working: {
    // 2.8 rad/s ≈ 0.45 Hz (~2.2s cycle) — tuned by eye. Painfully obvious working state.
    // Note: breatheFreq is in rad/s. Period = 2π / freq. 2.8 rad/s → ~2.24s cycle.
    // Emissive cranked high (1.4 base + 0.6 amp = 2.0 peak) — no mistaking active.
    emissiveBase:       1.4,
    breatheAmplitude:   0.6,
    breatheFreq:        2.8,
    lightIntensityMul:  2.0,
    stateLabel:         'WORKING',
    stateLabelColor:    '#00f3ff',
  },
}

// Frame-rate independent exponential approach lerp.
// Equivalent to *= 0.05 at exactly 60 fps but stable at any refresh rate.
// At delta=1/60: factor≈0.050. At delta=1/30: factor≈0.097. At delta=1/144: factor≈0.021.
// All converge to the same target in the same wall-clock time.
const EMISSIVE_LERP_BASE = 0.92  // per-(1/60 s) factor — 0.92 tracks fast 2.8 Hz pulse

// ---------------------------------------------------------------------------
// SHAPE PARAMS — per-territory geometry configuration
// ---------------------------------------------------------------------------

interface ShapeParams {
  boxSize?: [number, number, number]
  ringRadius: number
  ringY: number
  labelHeight: number
}

const SHAPE_PARAMS: Record<string, ShapeParams> = {
  claude_house: { boxSize: [1.2, 1.2, 1.2], ringRadius: 1.15, ringY:  0.0,  labelHeight: 1.2 },
  the_throne:   { boxSize: [1.5, 1.5, 1.5], ringRadius: 1.42, ringY:  0.0,  labelHeight: 1.4 },
  the_forge:    {                             ringRadius: 1.35, ringY:  0.0,  labelHeight: 0.9 },
  core_lore:    {                             ringRadius: 0.65, ringY: -0.35, labelHeight: 0.85},
  the_scryer:   {                             ringRadius: 0.65, ringY: -0.95, labelHeight: 1.35},
  the_tower:    {                             ringRadius: 0.55, ringY: -0.1,  labelHeight: 1.85},
}
const DEFAULT_SHAPE_PARAMS: ShapeParams = { ringRadius: 0.9, ringY: 0, labelHeight: 1.2 }

// ---------------------------------------------------------------------------
// TERRITORY NODE
// ---------------------------------------------------------------------------

interface TerritoryNodeProps {
  territory: TerritoryLayout
}

function TerritoryNode({ territory }: TerritoryNodeProps) {
  // floatGroupRef animates Y — all children float together (fixes Y double-count bug)
  const floatGroupRef    = useRef<THREE.Group>(null)
  const meshRef          = useRef<THREE.Mesh>(null)    // main shape — used for material access
  const ringRef          = useRef<THREE.Mesh>(null)
  const lightRef         = useRef<THREE.PointLight>(null)
  const labelRef         = useRef<HTMLDivElement>(null)
  const labelColorRef    = useRef<string>('')          // change-track: skip DOM write when unchanged
  const labelBorderRef   = useRef<string>('')          // change-track: skip DOM write when unchanged

  // Derived selector — only re-renders THIS node when ITS selection state changes.
  // Without this, all 6 nodes re-render on every click (they all subscribed to selectedId).
  const isSelected = useKingdomStore((s) => s.selectedId === territory.id)
  // World Y = terrain surface at this XZ + shape clearance (position[1])
  const baseY      = getWorldY(territory)
  const params     = SHAPE_PARAMS[territory.id] ?? DEFAULT_SHAPE_PARAMS

  // Shared material — one instance, all sub-meshes (forge pair, tower balls) reference it.
  // Patch 4: flat-shaded low-poly look. Per-territory base colors, bright enough to read
  // through the orange directional light. Neon emissive stays territory.color.
  // PERF: BASE_COLORS hoisted to module scope — was re-allocated as a new object literal
  // on every render for all 6 TerritoryNode instances.
  const baseColor = useMemo(() => TERRITORY_BASE_COLORS[territory.id] ?? '#CCBBFF', [territory.id])

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color:             baseColor,
    emissive:          territory.color,  // neon emissive stays the territory color
    emissiveIntensity: 0.2,              // animated in useFrame — initial value only
    roughness:         0.85,
    metalness:         0.0,
    flatShading:       true,             // faceted low-poly look — each face gets solid fill
  }), [baseColor, territory.color])
  useEffect(() => () => material.dispose(), [material])

  // Ring material — stable instance across renders. Inline JSX <meshBasicMaterial> would
  // create a new Three.js material object on every re-render and never dispose the old one.
  // useMemo + useEffect cleanup matches the pattern used above for the shape material.
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color:       territory.color,
    transparent: true,
    opacity:     0.15,
    side:        THREE.DoubleSide,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), [territory.color])
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial])

  // Glow corona color — territory color lerped 50% toward white so dark colors
  // (purple #7000ff, amber #f0a500) produce a visible bright corona regardless of
  // their original luminance. Crisp main ring keeps territory.color for identity.
  const glowColor = useMemo(() => {
    const col = new THREE.Color(territory.color)
    col.lerp(new THREE.Color('#ffffff'), 0.5)
    return col
  }, [territory.color])

  // Glow corona — single soft halo, tube just barely wider than the main ring.
  // tube=0.055 (vs main 0.04) = 37% wider — a slim bleeding edge, not a fat disc.
  // Opacity driven in useFrame at 50% of main ring opacity.
  const glowRingMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color:       glowColor,
    transparent: true,
    opacity:     0.08,
    side:        THREE.DoubleSide,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), [glowColor])
  useEffect(() => () => glowRingMaterial.dispose(), [glowRingMaterial])

  // Stable callback — reads current selection from store directly, not from subscription.
  // isSelected is not in deps: we call getState() to get the live value at click time,
  // which avoids re-creating this function every time selection changes.
  const handleClick = useCallback(() => {
    const { selectTerritory: sel, selectedId } = useKingdomStore.getState()
    sel(selectedId === territory.id ? null : territory.id)
  }, [territory.id])

  useFrame(({ clock }, delta) => {
    if (!floatGroupRef.current) return

    const t      = clock.elapsedTime
    const offset = territory.position[0] * 0.7 + territory.position[2] * 0.3

    // Grounded — no float. baseY = terrain surface + shape clearance.
    floatGroupRef.current.position.y = baseY

    if (!meshRef.current) return

    // 🏛️ ARCHAEOLOGICAL RECORD // DebugPanel Override Gate
    // 🗓️ 2026-03-06 | Session 166 | FIX-A
    // ISSUE: DebugPanel called setDebugOverride(id, override) but buildings never responded.
    //        This useFrame block read store.agentStates directly — debugOverrides slice was
    //        written but never consulted. DebugPanel had never worked from the first day it
    //        was built.
    // RESOLUTION: Check store.debugOverrides[territory.id] first. Override takes priority
    //             with explicit status→AgentState mapping. Without override, fall back to
    //             getAgentState() (normal live path).
    // LAW: Any code path that drives building visual state MUST read debugOverrides first.
    //      getAgentState() alone is insufficient — it has no knowledge of the debug layer.
    const store         = useKingdomStore.getState()
    const debugOverride = store.debugOverrides[territory.id]
    // REGRESSION GUARD: debugOverride must take priority over agentStates for DebugPanel to work.
    // DebugOverride.status maps: 'active'→'working', 'idle'→'online', 'offline'→'offline'.
    // Without this, setDebugOverride() writes to a store slice TerritoryNode never reads.
    const agentState: AgentState = debugOverride
      ? (debugOverride.status === 'offline' ? 'offline' : debugOverride.status === 'idle' ? 'online' : 'working')
      : store.getAgentState(territory.id)
    const buildingState = deriveBuildingState(agentState)
    const cfg           = BUILDING_STATE_CONFIG[buildingState]

    // Activity-scaled emissive with state-dependent ceiling and floor.
    // offline  → cfg.emissiveBase (0.015) — dark, static — conveys absence intentionally
    // stable   → EMISSIVE_FLOOR (0.18) min → scales to 0.50 ceiling at activity=100
    // working  → EMISSIVE_FLOOR (0.18) min → scales to 1.40 ceiling at activity=100
    //   stable:  idle(0)→0.18(floor)  online(40)→0.20  reading(70)→0.35
    //   working: working(80)→1.12  swarming(100)→1.40 (neon dominates)
    const agentKey  = TERRITORY_TO_AGENT[territory.id]
    const activity  = debugOverride
      ? debugOverride.activity
      : agentKey ? (store.agentStates[agentKey]?.activity ?? 0) : 40
    const emissiveCeiling  = buildingState === 'working' ? 1.4 : 0.50
    const activityBase     = buildingState === 'offline'
      ? cfg.emissiveBase
      : Math.max(EMISSIVE_FLOOR, (activity / 100) * emissiveCeiling)

    // Breathing pulse — modifies shared material (all sub-meshes update)
    const breathe = cfg.breatheAmplitude > 0
      ? Math.sin(t * cfg.breatheFreq + offset * 0.5) * cfg.breatheAmplitude
      : 0
    const targetIntensity = activityBase + breathe

    // Frame-rate independent exponential approach — same convergence at any FPS
    const lerpFactor = 1 - Math.pow(EMISSIVE_LERP_BASE, delta * 60)
    material.emissiveIntensity += (targetIntensity - material.emissiveIntensity) * lerpFactor

    // Core Lore: always pulse regardless of status (truth never sleeps)
    if (territory.id === 'core_lore') {
      material.emissiveIntensity = Math.max(material.emissiveIntensity,
        0.08 + Math.sin(t * 1.8 + offset) * 0.06)
    }

    // Ring opacity — identity marker, state-blind. Ring = territory is present (always true).
    // All 6 territories share the same idle ring. Selected ring elevated slightly above
    // idle peak (BASE + AMP = 0.59) → selected = 0.65, a clear but not jarring step up.
    if (ringRef.current) {
      ringMaterial.opacity = isSelected
        ? 0.65  // BASE(0.55) + AMP(0.04) = 0.59 idle peak → 0.65 is ~10% above, marks selection
        : RING_OPACITY_BASE + Math.sin(t * RING_BREATHE_FREQ + offset * 0.5) * RING_BREATHE_AMP
    }
    // Glow corona — slim halo just outside the crisp ring edge.
    // 50% of main opacity keeps it visible but subordinate to the crisp wire.
    glowRingMaterial.opacity = ringMaterial.opacity * 0.50

    // Point light — position is fixed relative to float group, just update intensity
    if (lightRef.current) {
      lightRef.current.intensity = targetIntensity * cfg.lightIntensityMul
    }

    // Label color — direct DOM update, change-tracked to eliminate 6 string allocs/frame at rest
    // FIX (S167 audit): previously wrote to style on every frame regardless of state change.
    if (labelRef.current) {
      const labelColor = buildingState === 'offline'
        ? '#2a1830'
        : buildingState === 'stable'
        ? '#8a7090'
        : territory.color
      const nextColor  = isSelected ? territory.color : labelColor
      const nextBorder = isSelected
        ? `${territory.color}40`
        : buildingState === 'offline' ? 'transparent' : `${territory.color}20`
      if (nextColor !== labelColorRef.current) {
        labelRef.current.style.color = nextColor
        labelColorRef.current = nextColor
      }
      if (nextBorder !== labelBorderRef.current) {
        labelRef.current.style.borderColor = nextBorder
        labelBorderRef.current = nextBorder
      }
    }
  })

  // Shape geometry — switch on territory.id
  const shapeGeometry = (() => {
    switch (territory.id) {
      case 'the_forge':
        // Two close blocks side by side — Aeris (left) + Claude (right)
        // Shared material means both pulse in sync
        return (
          <>
            <mesh material={material} position={[-0.65, 0, 0]} onClick={handleClick}>
              <boxGeometry args={[0.7, 0.7, 0.7]} />
            </mesh>
            <mesh ref={meshRef} material={material} position={[0.65, 0, 0]} onClick={handleClick}>
              <boxGeometry args={[0.7, 0.7, 0.7]} />
            </mesh>
          </>
        )

      case 'the_scryer':
        // Tall 4-sided pyramid
        return (
          <mesh ref={meshRef} material={material} onClick={handleClick}>
            <coneGeometry args={[0.55, 2.0, 4]} />
          </mesh>
        )

      case 'core_lore':
        // Equilateral triangular prism — 3 sides
        return (
          <mesh ref={meshRef} material={material} onClick={handleClick}>
            <coneGeometry args={[0.55, 0.85, 3]} />
          </mesh>
        )

      case 'the_tower':
        // Cylinder body + two balls stacked on top
        return (
          <group onClick={handleClick}>
            <mesh ref={meshRef} material={material}>
              <cylinderGeometry args={[0.30, 0.50, 1.4, 8]} />
            </mesh>
            {/* Big ball */}
            <mesh material={material} position={[0, 0.92, 0]}>
              <sphereGeometry args={[0.22, 10, 8]} />
            </mesh>
            {/* Small ball */}
            <mesh material={material} position={[0, 1.32, 0]}>
              <sphereGeometry args={[0.16, 10, 8]} />
            </mesh>
          </group>
        )

      default: {
        // claude_house and the_throne — boxes, sized from SHAPE_PARAMS
        const size = params.boxSize ?? [1.0, 1.0, 1.0]
        return (
          <mesh ref={meshRef} material={material} onClick={handleClick}>
            <boxGeometry args={size} />
          </mesh>
        )
      }
    }
  })()

  return (
    // Outer group: XZ position only (no Y — prevents double-count when floatGroup animates Y)
    <group position={[territory.position[0], 0, territory.position[2]]}>
      {/* Float group: Y animated in useFrame. All children drift together. */}
      <group ref={floatGroupRef}>

        {shapeGeometry}

        {/* Glow halo ring — horizontal, state-driven opacity.
            AdditiveBlending: composites as light (consistent with signal pulses + SCRYER ring).
            Opacity managed entirely in useFrame via ringMaterial ref — stable useMemo instance. */}
        <mesh
          ref={ringRef}
          position={[0, params.ringY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[params.ringRadius, 0.04, 8, 32]} />
          <primitive object={ringMaterial} />
        </mesh>
        {/* Glow corona — tube=0.055, barely wider than main (0.04).
            Additive blending on dark void: slim colored bleed at ring edge, not a disc. */}
        <mesh
          position={[0, params.ringY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[params.ringRadius, 0.055, 8, 32]} />
          <primitive object={glowRingMaterial} />
        </mesh>

        {/* Point light — fixed above shape center */}
        <pointLight
          ref={lightRef}
          color={territory.color}
          intensity={0.3}
          distance={5}
          decay={2}
          position={[0, 0.8, 0]}
        />

        {/* Label */}
        <Html
          position={[0, params.labelHeight, 0]}
          center
          distanceFactor={12}
          style={{ pointerEvents: 'none' }}
        >
          <div
            ref={labelRef}
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: '#6a5a70',
              background: 'rgba(13,2,33,0.75)',
              padding: '2px 6px',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
              border: '1px solid rgba(100,60,180,0.15)',
            }}
          >
            {territory.label}
          </div>
        </Html>

      </group>
    </group>
  )
}

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
// WASD CAMERA PAN  +  CINEMATIC ORBIT
// ---------------------------------------------------------------------------
// Pans both the camera and OrbitControls target together so orbit pivot follows.
// Forward/back = along the XZ-projected camera direction.
// Left/right = along camera's right vector.

interface WASDProps {
  orbitRef: React.RefObject<OrbitControlsImpl | null>
}

// Kingdom center — cinematic always orbits this point.
// Module-level const: zero allocations in render/frame loops.
const CINEMATIC_TARGET = new THREE.Vector3(0, 0.5, 0)

// ---------------------------------------------------------------------------
// CINEMATIC ORBIT
// ---------------------------------------------------------------------------
// Slowly orbits the camera around the Kingdom on a non-planar path.
// The camera gently rises and falls while circling so the view is never flat.
//
// Lifecycle:
//   Load → 8s idle → cinematic engages (OrbitControls disabled)
//   User touches (pointer / wheel / key) → hands control back → 8s idle → repeats
//
// Path math (spherical coords, Y-up):
//   theta = continuously incrementing azimuth  → horizontal orbit
//   phi   = PHI_BASE + sin(t * VERT_FREQ) * VERT_AMP  → gentle up/down wave
//   radius = preserved from wherever user left it (clamp 14–35)
//
//   PHI_BASE=0.85rad → camera sits ~41° above horizon
//   VERT_AMP=0.20rad → ±~11° elevation swing
//   So camera Y oscillates between ~11 and ~17.5 over ~3.5-min cycles
//   while theta completes a full revolution every ~2.6 minutes.
//   The two periods are incommensurate: no orbit ever looks the same.
// ---------------------------------------------------------------------------

function CinematicOrbit({ orbitRef }: WASDProps) {
  const { camera } = useThree()

  // All per-frame mutable state in a single ref — no re-renders, no closures.
  const cs = useRef({
    theta:           0,
    radius:          22,
    phiTimeOffset:   0,   // clock offset so phi wave starts at current camera elevation (no jump)
    active:          false,
    lastInteraction: Date.now(),
  })

  // Scratch objects — allocated once, reused every frame (no garbage)
  const _offset    = useMemo(() => new THREE.Vector3(),  [])
  const _spherical = useMemo(() => new THREE.Spherical(), [])

  // Seed theta/radius from the camera's actual starting position
  useEffect(() => {
    _offset.subVectors(camera.position, CINEMATIC_TARGET)
    _spherical.setFromVector3(_offset)
    cs.current.theta  = _spherical.theta
    cs.current.radius = _spherical.radius
  }, [camera, _offset, _spherical])

  // Any user touch → pause cinematic, re-enable OrbitControls
  useEffect(() => {
    const onInteract = () => {
      cs.current.lastInteraction = Date.now()
      if (cs.current.active) {
        cs.current.active = false
        if (orbitRef.current) {
          orbitRef.current.target.copy(CINEMATIC_TARGET)
          orbitRef.current.enabled = true
          orbitRef.current.update()
        }
      }
    }
    window.addEventListener('pointerdown', onInteract)
    window.addEventListener('wheel',       onInteract, { passive: true })
    window.addEventListener('keydown',     onInteract)
    return () => {
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('wheel',       onInteract)
      window.removeEventListener('keydown',     onInteract)
    }
  }, [orbitRef])

  const IDLE_MS    = 15000  // ms of stillness before cinematic engages (15s)
  const ORBIT_SPD  = 0.040  // rad/s horizontal — full lap in ~157s (~2.6 min)
  const VERT_FREQ  = 0.027  // rad/s vertical wave — full cycle ~233s (~3.9 min)
  const VERT_AMP   = 0.20   // ± radians of elevation swing (≈ ±11°)
  const PHI_BASE   = 0.85   // polar angle base — ~41° above horizon

  useFrame(({ clock }, delta) => {
    if (Date.now() - cs.current.lastInteraction < IDLE_MS) return

    // Engage — read camera's current spherical coords so first frame has zero jump
    if (!cs.current.active) {
      _offset.subVectors(camera.position, CINEMATIC_TARGET)
      _spherical.setFromVector3(_offset)
      cs.current.theta  = _spherical.theta
      cs.current.radius = Math.max(14, Math.min(35, _spherical.radius))
      // Seed phi time offset so elevation wave starts exactly at current camera elevation.
      // Solves: PHI_BASE + sin((t + offset) * VERT_FREQ) * VERT_AMP = currentPhi
      const currentPhi = Math.max(PHI_BASE - VERT_AMP, Math.min(PHI_BASE + VERT_AMP, _spherical.phi))
      const phiNorm    = (currentPhi - PHI_BASE) / VERT_AMP
      cs.current.phiTimeOffset = Math.asin(Math.max(-1, Math.min(1, phiNorm))) / VERT_FREQ - clock.elapsedTime
      cs.current.active = true
      if (orbitRef.current) orbitRef.current.enabled = false
    }

    // Advance azimuth
    cs.current.theta += ORBIT_SPD * delta

    // Compute elevation with vertical sinusoidal wave (offset ensures no elevation jump on engage)
    const phi    = PHI_BASE + Math.sin((clock.elapsedTime + cs.current.phiTimeOffset) * VERT_FREQ) * VERT_AMP
    const sinPhi = Math.sin(phi)
    const cosPhi = Math.cos(phi)
    const r      = cs.current.radius

    camera.position.set(
      CINEMATIC_TARGET.x + r * sinPhi * Math.cos(cs.current.theta),
      CINEMATIC_TARGET.y + r * cosPhi,
      CINEMATIC_TARGET.z + r * sinPhi * Math.sin(cs.current.theta),
    )
    camera.lookAt(CINEMATIC_TARGET)
  })

  return null
}

function WASDControls({ orbitRef }: WASDProps) {
  const { camera } = useThree()
  const keys = useRef<Record<string, boolean>>({})

  // Scratch vectors — allocated once, reused every frame
  const fwd       = useMemo(() => new THREE.Vector3(), [])
  const right     = useMemo(() => new THREE.Vector3(), [])
  const move      = useMemo(() => new THREE.Vector3(), [])
  const targetVel = useMemo(() => new THREE.Vector3(), [])
  const velocity  = useRef(new THREE.Vector3())

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Don't steal keys when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      keys.current[e.key.toLowerCase()] = true
    }
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_state, delta) => {
    if (!orbitRef.current) return
    // Cinematic orbit disables OrbitControls — don't fight it with WASD
    if (!orbitRef.current.enabled) return
    const k = keys.current

    // ── Q/E horizontal orbit ────────────────────────────────────────────────
    // Rotates the camera around the orbit target's Y axis — RTS-style pivot.
    // No vector allocation: pure 2D XZ rotation math on camera position.
    const rotDir = (k['q'] ? 1 : 0) + (k['e'] ? -1 : 0)
    if (rotDir !== 0) {
      const rotSpeed = 1.0  // rad/s — full rotation in ~6s of hold
      const angle = rotDir * rotSpeed * delta
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const tx = orbitRef.current.target.x
      const tz = orbitRef.current.target.z
      const cx = camera.position.x - tx
      const cz = camera.position.z - tz
      camera.position.x = tx + cx * cos - cz * sin
      camera.position.z = tz + cx * sin + cz * cos
      orbitRef.current.update()
    }

    // ── WASD pan ────────────────────────────────────────────────────────────
    const maxSpeed = 9

    // Forward vector projected onto XZ plane
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()

    // Right vector
    right.crossVectors(fwd, camera.up).normalize()

    // Build desired velocity from pressed keys
    targetVel.set(0, 0, 0)
    if (k['w']) targetVel.addScaledVector(fwd, maxSpeed)
    if (k['s']) targetVel.addScaledVector(fwd, -maxSpeed)
    if (k['d']) targetVel.addScaledVector(right, maxSpeed)
    if (k['a']) targetVel.addScaledVector(right, -maxSpeed)

    // Smooth exponential lerp toward target — frame-rate independent, ~0.14/frame at 60fps
    const smoothing = 1 - Math.pow(0.001, delta * 6)
    velocity.current.lerp(targetVel, smoothing)

    // Skip micro-jitter when effectively idle
    if (velocity.current.lengthSq() < 0.0002) return

    // Apply velocity × delta as frame displacement (reuses `move` scratch)
    move.copy(velocity.current).multiplyScalar(delta)
    camera.position.add(move)
    orbitRef.current.target.add(move)
    orbitRef.current.update()
  })

  return null
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

      {/* Cinematic auto-orbit — engages after 8s idle, yields to any user input */}
      <CinematicOrbit orbitRef={orbitRef} />

      {/* WASD pan */}
      <WASDControls orbitRef={orbitRef} />

      {/* Camera controls — allow user to orbit/zoom */}
      <OrbitControls
        ref={orbitRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={4}
        maxDistance={40}
      />

      {/* Territory detail popup — floats in 3D space near clicked territory */}
      <TerritoryDetailFloat />
    </>
  )
}

// ---------------------------------------------------------------------------
// TERRITORY DETAIL FLOAT (R3F Html — floats in 3D space near clicked territory)
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
  const currentActivity = useKingdomStore((s) => s.currentActivity)
  const activeProject   = useKingdomStore((s) => s.activeProject)
  // Reactive building state — see REGRESSION GUARD above.
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

  if (!selectedId) return null

  const layout = TERRITORY_MAP[selectedId]
  if (!layout) return null

  const [px, , pz] = layout.position
  // Float panel ~5 world units above the territory's XZ position.
  // y=5 clears the tallest buildings and terrain variation on all islands.
  const anchorY = 5

  return (
    <Html
      position={[px, anchorY, pz]}
      center
      style={{ pointerEvents: 'auto' }}
      zIndexRange={[50, 0]}
    >
      <div
        style={{
          width: 240,
          background: 'rgba(8,6,14,0.97)',
          border: `1px solid ${layout.color}50`,
          borderRadius: 4,
          padding: '14px',
          fontFamily: 'monospace',
          color: '#e8e0d0',
          backdropFilter: 'blur(12px)',
          boxShadow: `0 0 24px ${layout.color}25, 0 6px 32px rgba(0,0,0,0.7)`,
          userSelect: 'none',
        }}
      >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: layout.color, fontSize: 11, letterSpacing: '0.15em', marginBottom: 4 }}>
            TERRITORY
          </div>
          <div style={{ fontSize: 14, fontWeight: 'bold', letterSpacing: '0.08em' }}>
            {layout.label}
          </div>
        </div>
        <button
          onClick={() => selectTerritory(null)}
          style={{
            background: 'none',
            border: 'none',
            color: '#504840',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 0 0 8px',
          }}
        >
          ×
        </button>
      </div>

      <div style={{ height: 1, background: `${layout.color}20`, margin: '12px 0' }} />

      {liveData && (() => {
        const bCfg = BUILDING_STATE_CONFIG[detailBuildingState]
        return (
          <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                <span style={{ color: '#a09888', fontSize: 10 }}>
                  {new Date(liveData.lastSignal).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        )
      })()}

      {(currentActivity || activeProject) && selectedId === 'claude_house' && (
        <>
          <div style={{ height: 1, background: '#7000ff20', margin: '12px 0' }} />
          <div style={{ fontSize: 10, color: '#504840', lineHeight: 1.4 }}>
            {activeProject && (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: '#7000ff' }}>PROJECT</span>{' '}
                <span style={{ color: '#a09888' }}>{activeProject}</span>
              </div>
            )}
            {currentActivity && (
              <div style={{ color: '#a09888', fontStyle: 'italic' }}>{currentActivity}</div>
            )}
          </div>
        </>
      )}

      <div style={{ height: 1, background: `${layout.color}10`, margin: '12px 0' }} />
      <div
        style={{
          fontSize: 9,
          color: '#504840',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
        }}
      >
        {layout.connections.map((cId) => {
          const c = TERRITORY_MAP[cId]
          return c ? (
            <span
              key={cId}
              style={{
                border: `1px solid ${c.color}30`,
                padding: '1px 5px',
                borderRadius: 2,
                color: c.color,
                cursor: 'pointer',
              }}
              onClick={() => selectTerritory(cId)}
            >
              {c.label}
            </span>
          ) : null
        })}
      </div>
      </div>
    </Html>
  )
}

// ---------------------------------------------------------------------------
// STATUS BAR (DOM overlay — top of canvas)
// ---------------------------------------------------------------------------

function StatusBar() {
  const isLoaded = useKingdomStore((s) => s.isLoaded)
  const scraperStatus = useKingdomStore((s) => s.scraperStatus)
  const claudeActive = useKingdomStore((s) => s.claudeActive)
  const aerisActive = useKingdomStore((s) => s.aerisActive)
  const brandonPresent = useKingdomStore((s) => s.brandonPresent)
  const activeCount = useKingdomStore((s) => s.territories.filter((t) => t.status === 'active').length)

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        fontFamily: 'monospace',
        fontSize: 10,
        color: '#504840',
        letterSpacing: '0.12em',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isLoaded ? '#00f3ff' : '#504840',
          }}
        />
        <span style={{ color: isLoaded ? '#e8e0d0' : '#504840' }}>
          {isLoaded ? 'KINGDOM LIVE' : 'CONNECTING'}
        </span>
      </div>
      {isLoaded && (
        <>
          <div>{activeCount} territories active</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {claudeActive && (
              <span style={{ color: '#7000ff' }}>CLAUDE ●</span>
            )}
            {aerisActive && (
              <span style={{ color: '#ff006e' }}>AERIS ●</span>
            )}
            {brandonPresent && (
              <span style={{ color: '#f0a500' }}>BRANDON ●</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DEBUG PANEL — ?debug=1 only. Cycle territory states client-side.
// ---------------------------------------------------------------------------

const STATE_CYCLE: Array<{ status: 'active' | 'idle' | 'offline', activity: number, label: string }> = [
  { status: 'offline', activity: 0,  label: 'OFFLINE' },
  { status: 'idle',    activity: 20, label: 'STABLE'  },
  { status: 'active',  activity: 75, label: 'WORKING' },
]

function DebugPanel() {
  const debugOverrides = useKingdomStore((s) => s.debugOverrides)
  const setDebugOverride = useKingdomStore((s) => s.setDebugOverride)
  const territories = useKingdomStore((s) => s.territories)
  const getActivity = useKingdomStore((s) => s.getActivity)
  // Subscribe to agentStates directly (not the getter function ref) so DebugPanel re-renders
  // when agent states update. Derive building state inline from the raw data.
  const agentStates = useKingdomStore((s) => s.agentStates)

  // Only render when ?debug=1 is in the URL
  const [show, setShow] = React.useState(false)
  React.useEffect(() => {
    setShow(new URLSearchParams(window.location.search).get('debug') === '1')
  }, [])

  if (!show) return null

  const ids = TERRITORIES.map((t) => t.id)

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 48,
        left: 16,
        background: 'rgba(10,10,15,0.95)',
        border: '1px solid #7000ff40',
        borderRadius: 4,
        padding: '10px 12px',
        fontFamily: 'monospace',
        fontSize: 10,
        color: '#504840',
        letterSpacing: '0.1em',
        zIndex: 30,
        minWidth: 220,
      }}
    >
      <div style={{ color: '#7000ff', marginBottom: 8, letterSpacing: '0.15em' }}>
        ⬡ DEBUG — STATE OVERRIDE
      </div>
      {ids.map((id) => {
        const layout = TERRITORY_MAP[id]
        if (!layout) return null
        const hasOverride = id in debugOverrides
        const currentActivity = getActivity(id)
        const agentKey = TERRITORY_TO_AGENT[id]
        const agentStateVal: AgentState = agentKey ? (agentStates[agentKey]?.state ?? 'offline') : 'online'
        const bs = deriveBuildingState(agentStateVal)
        const cfg = BUILDING_STATE_CONFIG[bs]

        const cycleNext = () => {
          // REGRESSION GUARD: derive current building state from debugOverride if active,
          // not from live agentStates. Without this, a second cycle click always reads
          // live bs (unchanged), computing the same next index — cycle never advances.
          const bsToSlot: Record<BuildingState, number> = { offline: 0, stable: 1, working: 2 }
          const currentOverride = debugOverrides[id]
          const currentBs: BuildingState = currentOverride
            ? deriveBuildingState(
                currentOverride.status === 'offline' ? 'offline'
                  : currentOverride.status === 'idle' ? 'online'
                  : 'working'
              )
            : bs
          const nextIdx = (bsToSlot[currentBs] + 1) % STATE_CYCLE.length
          setDebugOverride(id, STATE_CYCLE[nextIdx])
        }

        const clear = () => setDebugOverride(id, null)

        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: layout.color, flexShrink: 0 }} />
            <span style={{ color: '#a09888', flex: 1, fontSize: 9 }}>{layout.label}</span>
            <button
              onClick={cycleNext}
              style={{
                background: 'none',
                border: `1px solid ${layout.color}50`,
                color: cfg.stateLabelColor,
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 2,
                letterSpacing: '0.08em',
              }}
            >
              {cfg.stateLabel}
            </button>
            {hasOverride && (
              <button
                onClick={clear}
                style={{
                  background: 'none',
                  border: '1px solid #504840',
                  color: '#504840',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: 9,
                  padding: '1px 5px',
                  borderRadius: 2,
                }}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <div style={{ marginTop: 8, color: '#302820', fontSize: 9 }}>
        click state to cycle · × to restore SCRYER
      </div>
    </div>
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
          powerPreference: 'default',
        }}
        style={{ width: '100%', height: '100%' }}
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
