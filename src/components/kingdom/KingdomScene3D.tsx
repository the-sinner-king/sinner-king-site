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
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useKingdomStore, usePartyKitSync } from '@/lib/kingdom-store'
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

function deriveBuildingState(status: string): BuildingState {
  if (status === 'offline' || status === 'unknown') return 'offline'
  if (status === 'idle') return 'stable'
  return 'working'  // status === 'active'
}

interface BuildingStateConfig {
  emissiveBase: number
  breatheAmplitude: number
  breatheFreq: number
  ringOpacityBase: number
  ringOpacityAmplitude: number
  lightIntensityMul: number
  stateLabel: string
  stateLabelColor: string
}

const BUILDING_STATE_CONFIG: Record<BuildingState, BuildingStateConfig> = {
  offline: {
    emissiveBase:       0.015,
    breatheAmplitude:   0,
    breatheFreq:        0,
    ringOpacityBase:    0.03,
    ringOpacityAmplitude: 0,
    lightIntensityMul:  0.02,
    stateLabel:         'OFFLINE',
    stateLabelColor:    '#201810',
  },
  stable: {
    // Barely-perceptible slow pulse — the territory is present, not dead.
    // 0.6 rad/s ≈ 0.10 Hz (~10s cycle) — tuned by eye; amplitude nearly invisible.
    emissiveBase:       0.13,
    breatheAmplitude:   0.025,
    breatheFreq:        0.6,
    ringOpacityBase:    0.15,
    ringOpacityAmplitude: 0.015,
    lightIntensityMul:  0.30,
    stateLabel:         'STABLE',
    stateLabelColor:    '#706050',
  },
  working: {
    // 2.8 rad/s ≈ 0.45 Hz (~2.2s cycle) — tuned by eye. Painfully obvious working state.
    // Note: breatheFreq is in rad/s. Period = 2π / freq. 2.8 rad/s → ~2.24s cycle.
    // Emissive cranked high (1.4 base + 0.6 amp = 2.0 peak) — no mistaking active.
    // Ring also hot (0.65 base, 0.30 amp = 0.95 peak) — AdditiveBlending still OK
    // because the building shapes are distinct enough it doesn't blur into noise.
    emissiveBase:       1.4,
    breatheAmplitude:   0.6,
    breatheFreq:        2.8,
    ringOpacityBase:    0.65,
    ringOpacityAmplitude: 0.30,
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
  const floatGroupRef = useRef<THREE.Group>(null)
  const meshRef       = useRef<THREE.Mesh>(null)    // main shape — used for material access
  const ringRef       = useRef<THREE.Mesh>(null)
  const lightRef      = useRef<THREE.PointLight>(null)
  const labelRef      = useRef<HTMLDivElement>(null)

  // Derived selector — only re-renders THIS node when ITS selection state changes.
  // Without this, all 6 nodes re-render on every click (they all subscribed to selectedId).
  const isSelected = useKingdomStore((s) => s.selectedId === territory.id)
  // World Y = terrain surface at this XZ + shape clearance (position[1])
  const baseY      = getWorldY(territory)
  const params     = SHAPE_PARAMS[territory.id] ?? DEFAULT_SHAPE_PARAMS

  // Shared material — one instance, all sub-meshes (forge pair, tower balls) reference it
  const color    = useMemo(() => new THREE.Color(territory.color), [territory.color])
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color:            territory.color,
    emissive:         color,
    emissiveIntensity: 0.2,
    roughness:        0.55,
    metalness:        0.25,
  }), [territory.color, color])
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

    const status        = useKingdomStore.getState().getStatus(territory.id)
    const buildingState = deriveBuildingState(status)
    const cfg           = BUILDING_STATE_CONFIG[buildingState]

    // Breathing pulse — modifies shared material (all sub-meshes update)
    const breathe = cfg.breatheAmplitude > 0
      ? Math.sin(t * cfg.breatheFreq + offset * 0.5) * cfg.breatheAmplitude
      : 0
    const targetIntensity = cfg.emissiveBase + breathe

    // Frame-rate independent exponential approach — same convergence at any FPS
    const lerpFactor = 1 - Math.pow(EMISSIVE_LERP_BASE, delta * 60)
    material.emissiveIntensity += (targetIntensity - material.emissiveIntensity) * lerpFactor

    // Core Lore: always pulse regardless of status (truth never sleeps)
    if (territory.id === 'core_lore') {
      material.emissiveIntensity = Math.max(material.emissiveIntensity,
        0.08 + Math.sin(t * 1.8 + offset) * 0.06)
    }

    // Ring opacity — selected holds at full, unselected breathes with state.
    // Mutate ringMaterial directly (stable useMemo instance) — no cast needed.
    if (ringRef.current) {
      if (isSelected) {
        ringMaterial.opacity = 0.55
      } else {
        const ringBreathe = cfg.ringOpacityAmplitude > 0
          ? Math.sin(t * cfg.breatheFreq + offset * 0.5) * cfg.ringOpacityAmplitude
          : 0
        ringMaterial.opacity = cfg.ringOpacityBase + ringBreathe
      }
    }

    // Point light — position is fixed relative to float group, just update intensity
    if (lightRef.current) {
      lightRef.current.intensity = targetIntensity * cfg.lightIntensityMul
    }

    // Label color — direct DOM update, no re-render
    if (labelRef.current) {
      const labelColor = buildingState === 'offline'
        ? '#252018'
        : buildingState === 'stable'
        ? '#504840'
        : territory.color
      labelRef.current.style.color = isSelected ? territory.color : labelColor
      labelRef.current.style.borderColor = isSelected
        ? `${territory.color}40`
        : buildingState === 'offline' ? 'transparent' : `${territory.color}20`
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
              color: '#504840',
              background: 'rgba(10,10,15,0.7)',
              padding: '2px 6px',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
              border: '1px solid transparent',
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
    const mat = new THREE.LineBasicMaterial({
      color: '#7000ff',
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return { lineObj: new THREE.Line(geometry, mat), material: mat }
    // `from`/`to` come from TERRITORY_MAP — a module-level const, never mutated.
    // Positions are fixed at load time; empty deps is correct.
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
    material.opacity = 0.04 + (combined / 100) * 0.35
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
          color="#070710"
          roughness={0.98}
          metalness={0.0}
          emissive="#0c0820"
          emissiveIntensity={0.9}
        />
      </mesh>
      {/* Glowing wireframe grid overlay — the digital landscape.
          AdditiveBlending: grid lines glow against dark terrain (not painted on). */}
      <mesh geometry={groundGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <meshBasicMaterial
          color="#2a0870"
          wireframe
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
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
    active:          false,
    lastInteraction: Date.now(),   // start paused; cinematic kicks in after 8s of stillness
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

  const IDLE_MS    = 20000  // ms of stillness before cinematic engages (20s — safe for demo setup)
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
      cs.current.active = true
      if (orbitRef.current) orbitRef.current.enabled = false
    }

    // Advance azimuth
    cs.current.theta += ORBIT_SPD * delta

    // Compute elevation with vertical sinusoidal wave
    const phi    = PHI_BASE + Math.sin(clock.elapsedTime * VERT_FREQ) * VERT_AMP
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
      {/* Lighting */}
      <ambientLight intensity={0.03} color="#0a0a1f" />
      <directionalLight position={[10, 20, 10]} intensity={0.08} color="#ffffff" />

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
    </>
  )
}

// ---------------------------------------------------------------------------
// TERRITORY DETAIL PANEL (DOM overlay)
// ---------------------------------------------------------------------------

function TerritoryDetailPanel() {
  const selectedId = useKingdomStore((s) => s.selectedId)
  const selectTerritory = useKingdomStore((s) => s.selectTerritory)
  const territories = useKingdomStore((s) => s.territories)
  const currentActivity = useKingdomStore((s) => s.currentActivity)
  const activeProject = useKingdomStore((s) => s.activeProject)

  if (!selectedId) return null

  const layout = TERRITORY_MAP[selectedId]
  const liveData = territories.find((t) => t.id === selectedId)

  if (!layout) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 280,
        background: 'rgba(10,10,15,0.92)',
        border: `1px solid ${layout.color}40`,
        borderRadius: 4,
        padding: '16px',
        fontFamily: 'monospace',
        color: '#e8e0d0',
        zIndex: 20,
        backdropFilter: 'blur(8px)',
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
        const bState = deriveBuildingState(liveData.status)
        const bCfg = BUILDING_STATE_CONFIG[bState]
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
  const territories = useKingdomStore((s) => s.territories)

  const activeCount = territories.filter((t) => t.status === 'active').length

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
  const getStatus = useKingdomStore((s) => s.getStatus)
  const getActivity = useKingdomStore((s) => s.getActivity)

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
        const currentStatus = getStatus(id)
        const currentActivity = getActivity(id)
        const bs = deriveBuildingState(currentStatus)
        const cfg = BUILDING_STATE_CONFIG[bs]

        const cycleNext = () => {
          // Find which slot we're in (by label match)
          const bsToSlot: Record<BuildingState, number> = { offline: 0, stable: 1, working: 2 }
          const nextIdx = (bsToSlot[bs] + 1) % STATE_CYCLE.length
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
      style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a0f' }}
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
          alpha: false,
          powerPreference: 'default',
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <SceneContents />
      </Canvas>

      {/* DOM overlays */}
      <StatusBar />
      <TerritoryDetailPanel />
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
