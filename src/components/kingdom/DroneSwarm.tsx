'use client'

/**
 * DroneSwarm.tsx — v5 (Session 202 glide upgrade)
 * Code is my art. I iterate until it sings. — CODE_AS_ART_MANIFESTO
 *
 * ARCHITECTURE: Manager pattern — single component owns ALL swarm geometry.
 *
 *   v5 improvements over v4 (S202 — eliminate shimmy, achieve glide):
 *   - Analytical orbit heading: tangent(-sin, 0, cos) replaces history delta
 *     → eliminates shimmy from breathe-amplitude/orbital-velocity ratio jitter
 *   - EMA heading smoothing (α=0.12) — residual discontinuities damped over 8 frames
 *   - Spring softened K:36→12, D:12→7 (τ=0.29s) — elastic formation holding
 *   - Breathe amplitude 0.12→0.04, breatheFreq 7-11→1.5-3.0 rad/s — slow breath
 *   - MAX_SPEED 3.75→2.2 — unhurried glide
 *   - LAG_FRAMES [0,5,5,10,10]→[0,8,8,18,18] — graceful wing trailing
 *   - BOB_FREQ 0.32→0.18 Hz, BOB_AMP 0.035→0.025 — subtle slow breath
 *   - Slerp rates reduced: leader 8→4.5, followers 6→3.5 — lazy banking
 *   - SEP_WEIGHT 2.0→0.5 — gentle nudge not violent push
 *
 *   v4 improvements over v3 (S137 bird-flock upgrade):
 *   - 5 individual Mesh refs — elegant, not fog
 *   - Leader-follower formation: loose V (inner ±0.45 / outer ±0.85)
 *   - Per-drone position history ring buffer — lagged followers trail naturally
 *   - Critically damped spring (replaces velocity lerp) — zero overshoot
 *   - Phase-offset bob — organic breathing across the formation
 *   - Separation Boids (XZ only) — prevents clumping
 *   - Velocity-based orientation via quaternion slerp — smooth banking
 *
 *   Pool: MAX_SWARMS slots pre-allocated at mount.
 *   React never creates or destroys 3D objects per swarm.
 *   Bob is visual-only — applied at mesh level, never fed back into physics.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE 4 UPGRADE PATH → DroneSwarmInstanced.tsx (drop-in replacement):
 *
 *   Replace 5 Mesh refs with InstancedMesh + PlaneGeometry quad.
 *   Custom ShaderMaterial: billboard vert + UV atlas frag.
 *
 *   Billboard vert — strip rotation via MV column magnitudes:
 *     scaleX/Y/Z = length(mvMatrix[N].xyz)  [N = 0 / 1 / 2]
 *     Reset upper 3x3 to scaled identity — camera rotation fully removed.
 *
 *   Heading: separate InstancedBufferAttribute (float instanceHeading):
 *     headingArray[i] = Math.atan2(drone.velocity.x, drone.velocity.z)
 *     setMatrixAt: position + scale only, rotation.set(0,0,0)
 *     Eliminates the current quaternion slerp from the physics loop.
 *
 *   Critical gotchas from R3F + NotebookLM research (Session 148):
 *   ① alphaTest: 0.5 (NOT transparent: true) — mobile fill-rate cliff.
 *   ② InstancedBufferAttribute heading: needsUpdate = true each frame.
 *   ③ useKTX2 from drei — NOT useLoader(KTX2Loader) — memory leak.
 *      useKTX2.preload() in global scope. WASM in public/basis/.
 *   ④ Init ALL instance matrices with identity — zeros = invisible at origin.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two swarm modes:
 *
 *   direction: "to_territory"
 *     0.00–0.60 : fly from source → target (V formation, bird-flock physics)
 *     0.60–0.80 : hover at target (orbiting leader, followers trail in arc)
 *     0.80–1.00 : fade out
 *
 *   direction: "off_screen" (search swarm)
 *     0.00–0.35 : fly from source → void (V formation outbound, purple)
 *     0.35–0.55 : GONE — opacity 0, meshes offscreen
 *     0.55–1.00 : return from void → source (cyan, formation reassembles)
 */

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useKingdomStore } from '@/lib/kingdom-store'
import type { DroneSwarm } from '@/lib/kingdom-store'
import { TERRITORY_MAP, getTerrainY } from '@/lib/kingdom-layout'

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const DRONE_COUNT     = 5
const MAX_SWARMS      = 10  // 4 orbit (one per agent) + 4 SCRYER to_territory + 2 spare
const HISTORY_SIZE    = 100       // ring buffer frames (≈ 1.67s @ 60fps — more trail)
const MAX_SPEED       = 2.2       // units/second — unhurried glide (was 3.75)
const BOB_FREQ_RADS   = 0.18 * Math.PI * 2  // 0.18 Hz → slow breath every ~5.6s (was 0.32)
const BOB_AMP         = 0.025     // subtler drift (was 0.035)
const SEP_RADIUS      = 0.5       // tighter separation trigger
const SEP_WEIGHT      = 0.5       // gentle nudge through spring (was 2.0 raw impulse)
const VOID_DISTANCE   = 22

// 🏛️ ARCHITECTURAL PLAQUE — Spring Softening (S202)
// 🗓️ 2026-03-19 | S202 | GLIDE UPGRADE
// ISSUE: SPRING_K=36 (ω₀=6 rad/s, τ=0.17s) was too stiff — aggressively chased
//        jittery formation targets, amplifying heading oscillation shimmy.
// RESOLUTION: Soften to K=12/D=7 (ω₀=3.46 rad/s, τ=0.29s, still critically damped).
//             Followers drift into formation over ~0.3s — elastic and organic.
//             Critical damping preserved: SPRING_DAMP = 2 * sqrt(SPRING_K) = 6.93 ≈ 7.
// LAW: Do not raise SPRING_K above 16 — stiff springs amplify heading jitter → shimmy.
const SPRING_K    = 12.0
const SPRING_DAMP = 7.0
const DRONE_COLOR_OUT  = '#7000ff'
const DRONE_COLOR_BACK = '#00f3ff'

// Orbit mode constants
const ORBIT_SPEED       = 0.59     // rad/s — stately (~10.6s lap)
const ORBIT_HOVER_Y     = 0.35     // world units above territory world-Y
// 🏛️ ARCHITECTURAL PLAQUE — Breathe Amplitude Fix (S202)
// 🗓️ 2026-03-19 | S202 | SHIMMY ROOT CAUSE FIX
// ISSUE: ORBIT_BREATHE_AMP=0.12 at breatheFreq=11.31 rad/s produced radial velocity
//        amplitude of 1.36 units/s — nearly equal to orbital tangential velocity ~1.48 u/s.
//        Heading computed from (waypoint - prevWaypoint) oscillated between tangential and
//        radial directions with the breathe phase, causing formation targets to shimmy.
//        ALL drones shimmied visibly because _right = cross(up, heading) oscillated with it.
// RESOLUTION: Two-pronged:
//   1) Reduce ORBIT_BREATHE_AMP 0.12→0.04 (radial vel now 0.12 u/s — 8% of tangential)
//   2) Slow breatheFreq dramatically (was 7.54–11.31, now 1.5–3.0 rad/s)
//   3) Compute orbit heading ANALYTICALLY (tangent formula) — bypasses delta entirely
// LAW: Never let ORBIT_BREATHE_AMP * breatheFreq exceed 20% of orbital tangential velocity.
const ORBIT_BREATHE_AMP = 0.04    // radius pulse (±0.04 — barely perceptible, was 0.12)

// Per-state orbit radius multiplier (applied to territory ring radius from SHAPE_PARAMS)
// working/writing/running → loose outer orbit. swarming → tight inner orbit.
const ORBIT_RADIUS_WORKING  = 2.2
const ORBIT_RADIUS_SWARMING = 1.5

// Per-territory base ring radii (mirrors SHAPE_PARAMS ringRadius in KingdomScene3D)
// Needed here so orbit math doesn't depend on the scene file.
const TERRITORY_RING_RADII: Record<string, number> = {
  claude_house: 1.15,
  the_throne:   1.42,
  the_forge:    1.35,
  core_lore:    0.65,
  the_scryer:   0.65,
  the_tower:    0.55,
}

// Formation offsets per drone [right, up, back-from-leader]
// Swarm V: inner ±0.45 / 0.40, outer ±0.85 / 0.80 — tight enough to read as one organism.
// v5.1: halved from v5.0 (inner was ±0.9/0.75, outer was ±1.7/1.50) per Brandon feedback.
const FORMATION_OFFSETS: readonly [number, number, number][] = [
  [0,     0,    0   ],  // 0: leader (front center)
  [-0.45, 0,    0.40],  // 1: inner left wing
  [0.45,  0,    0.40],  // 2: inner right wing
  [-0.85, 0,    0.80],  // 3: outer left wing
  [0.85,  0,    0.80],  // 4: outer right wing
]

// History lag per slot — longer trailing for graceful V formation (was [0,5,5,10,10])
// Increased so wings drift behind the leader with more organic delay.
const LAG_FRAMES = [0, 8, 8, 18, 18] as const

// Evenly spaced bob phases across the formation
const BOB_PHASES = Array.from({ length: DRONE_COUNT }, (_, i) =>
  (i / DRONE_COUNT) * Math.PI * 2
)


// ---------------------------------------------------------------------------
// MODULE-LEVEL SCRATCH VECTORS
//
// Shared across ALL swarm updates per frame.
// Safe: JS is single-threaded; useFrame callbacks are sequential.
// ---------------------------------------------------------------------------

const _source       = new THREE.Vector3()
const _target       = new THREE.Vector3()
const _void         = new THREE.Vector3()
const _up           = new THREE.Vector3(0, 1, 0)
const _right        = new THREE.Vector3()
const _forward      = new THREE.Vector3()
const _zAxis        = new THREE.Vector3(0, 0, 1)
const _waypoint     = new THREE.Vector3()
const _lagged       = new THREE.Vector3()
const _slotTarget   = new THREE.Vector3()
const _desired      = new THREE.Vector3()
const _sepForce     = new THREE.Vector3()
const _diff         = new THREE.Vector3()
const _velNorm      = new THREE.Vector3()
const _qTarget      = new THREE.Quaternion()
const _colorOut     = new THREE.Color(DRONE_COLOR_OUT)
const _colorBack    = new THREE.Color(DRONE_COLOR_BACK)
const _offscreenPos = new THREE.Vector3(0, -1000, 0)

// ---------------------------------------------------------------------------
// POOL SLOT — pre-allocated per swarm, never grows at runtime
// ---------------------------------------------------------------------------

interface PoolSlot {
  geometry:      THREE.BoxGeometry
  material:      THREE.MeshBasicMaterial
  meshes:        THREE.Mesh[]
  positions:     THREE.Vector3[]      // base world positions (no bob) — physics input/output
  velocities:    THREE.Vector3[]      // current velocities per drone
  quats:         THREE.Quaternion[]   // current orientations per drone (for slerp)
  leaderHistory: THREE.Vector3[]      // ring buffer of leader base positions
  historyHead:   number               // write cursor into ring buffer
  leaderHeading: THREE.Vector3        // last known leader heading (unit vector, smoothed)
  prevSlotTargets: THREE.Vector3[]    // previous frame's formation slot targets (for v_goal)
  wasGone:       boolean              // off_screen GONE phase was active last frame
  inUse:         boolean
  swarmId:       string | null
  lastColor:     'out' | 'back'
  voidPos:       THREE.Vector3 | null
}

function createPoolSlot(): PoolSlot {
  // Dart shape: 0.24 long on Z (flight axis), 0.09 wide, 0.055 tall
  const geometry = new THREE.BoxGeometry(0.09, 0.055, 0.24)

  const material = new THREE.MeshBasicMaterial({
    color:       DRONE_COLOR_OUT,
    transparent: true,
    opacity:     0.0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  })

  const meshes: THREE.Mesh[] = []
  for (let i = 0; i < DRONE_COUNT; i++) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.position.copy(_offscreenPos)
    meshes.push(mesh)
  }

  return {
    geometry,
    material,
    meshes,
    positions:       Array.from({ length: DRONE_COUNT }, () => new THREE.Vector3(0, -1000, 0)),
    velocities:      Array.from({ length: DRONE_COUNT }, () => new THREE.Vector3()),
    quats:           Array.from({ length: DRONE_COUNT }, () => new THREE.Quaternion()),
    leaderHistory:   Array.from({ length: HISTORY_SIZE }, () => new THREE.Vector3()),
    historyHead:     0,
    leaderHeading:   new THREE.Vector3(0, 0, 1),
    prevSlotTargets: Array.from({ length: DRONE_COUNT }, () => new THREE.Vector3()),
    wasGone:         false,
    inUse:           false,
    swarmId:         null,
    lastColor:       'out',
    voidPos:         null,
  }
}

// ---------------------------------------------------------------------------
// LEADER WAYPOINT — computed directly from phase (no physics for leader)
// Leader positions are stored in history; followers do velocity-physics toward slots.
//
// Returns the orbit angle (in radians) for orbit mode so the caller can compute
// heading analytically via tangent formula (-sin, 0, cos) — bypassing history delta
// entirely. Returns 0 for non-orbit modes (caller falls back to history delta).
// ---------------------------------------------------------------------------

function computeLeaderWaypoint(
  swarm: DroneSwarm,
  phase: number,
  t: number,
  out: THREE.Vector3,
): number {   // returns orbitAngle (0 for non-orbit modes)
  if (swarm.direction === 'off_screen') {
    if (phase < 0.35) {
      out.lerpVectors(_source, _void, phase / 0.35)
    } else if (phase < 0.55) {
      out.copy(_void)  // GONE — held at void; caller hides meshes
    } else {
      const returnT = (phase - 0.55) / 0.45
      out.lerpVectors(_void, _source, Math.min(returnT, 1.0))
    }
    return 0
  } else if (swarm.direction === 'orbit') {
    // Orbit mode: leader circles source territory in XZ plane.
    // _source is pre-set to territory world position (terrain Y + clearance) before this call.
    //
    // GLIDE UPGRADE (S202): breatheFreq slowed dramatically.
    // Was 7.54–11.31 rad/s (1.2–1.8 Hz — nervous ticking).
    // Now 1.5–3.0 rad/s (0.24–0.48 Hz) — slow, breathing pulse.
    const ringRadius   = TERRITORY_RING_RADII[swarm.sourceTerritoryId] ?? 0.9
    const radiusMul    = swarm.label === 'swarming' ? ORBIT_RADIUS_SWARMING : ORBIT_RADIUS_WORKING
    const baseRadius   = ringRadius * radiusMul
    const breatheFreq  = swarm.label === 'swarming' ? 3.0 : (swarm.label === 'writing' ? 2.5 : 2.0)
    const radius = baseRadius + Math.sin(t * breatheFreq) * ORBIT_BREATHE_AMP
    const angle  = t * ORBIT_SPEED

    out.set(
      _source.x + Math.cos(angle) * radius,
      _source.y + ORBIT_HOVER_Y,
      _source.z + Math.sin(angle) * radius,
    )
    return angle   // ← caller uses this for analytical tangent heading
  } else {
    // to_territory
    if (phase < 0.6) {
      out.lerpVectors(_source, _target, phase / 0.6)
      return 0  // linear path — history delta heading is stable here
    }
    const angle = t * 1.1   // gentle hover orbit (was 1.35) — used by both hover and fade
    if (phase < 0.8) {
      // Hover: tight orbit at target — closer, slower
      const hoverT = (phase - 0.6) / 0.2
      const radius = 0.38 - hoverT * 0.10
      out.copy(_target)
      out.x += Math.cos(angle) * radius
      out.z += Math.sin(angle) * radius
    } else {
      // Fade: drift outward
      const fadeT = (phase - 0.8) / 0.2
      out.copy(_target)
      out.x += Math.cos(angle) * (0.28 + fadeT * 0.5)
      out.z += Math.sin(angle) * (0.28 + fadeT * 0.5)
      out.y += fadeT * 0.5
    }
    return angle  // analytical heading for hover and fade orbit phases
  }
}

// ---------------------------------------------------------------------------
// SLOT INIT — called when a free slot is assigned to a new swarm
// ---------------------------------------------------------------------------

function initSlotForSwarm(slot: PoolSlot, sourcePos: THREE.Vector3, swarmColor?: string): void {
  // Pre-fill history with source — followers start at source, not at old garbage positions
  for (let h = 0; h < HISTORY_SIZE; h++) {
    slot.leaderHistory[h].copy(sourcePos)
  }
  slot.historyHead = 0
  slot.leaderHeading.set(0, 0, 1)
  slot.wasGone = false

  for (let i = 0; i < DRONE_COUNT; i++) {
    slot.positions[i].copy(sourcePos)
    slot.velocities[i].set(0, 0, 0)
    slot.quats[i].identity()
    slot.prevSlotTargets[i].copy(sourcePos)  // seed previous slot = source (no phantom v_goal at spawn)
    slot.meshes[i].position.copy(_offscreenPos)
    slot.meshes[i].quaternion.identity()
    slot.meshes[i].visible = true  // re-enable visibility (cleared on slot release)
  }

  // Use territory drone color if provided, otherwise fall back to default purple
  if (swarmColor) {
    slot.material.color.set(swarmColor)
  } else {
    slot.material.color.copy(_colorOut)
  }
  slot.material.opacity = 0.0
  slot.lastColor = 'out'
}

// ---------------------------------------------------------------------------
// DRONE SWARM MANAGER
// ---------------------------------------------------------------------------

export function DroneSwarms() {
  const { scene }         = useThree()
  const activeDroneSwarms = useKingdomStore((s) => s.activeDroneSwarms)

  const poolRef      = useRef<PoolSlot[]>([])
  const swarmDataRef = useRef<Map<string, DroneSwarm>>(new Map())

  // ── Initialize pool once on mount ──────────────────────────────────────────
  useEffect(() => {
    const slots: PoolSlot[] = []
    for (let i = 0; i < MAX_SWARMS; i++) {
      const slot = createPoolSlot()
      slot.meshes.forEach(m => scene.add(m))
      slots.push(slot)
    }
    poolRef.current = slots

    return () => {
      slots.forEach(slot => {
        slot.meshes.forEach(m => scene.remove(m))
        slot.geometry.dispose()
        slot.material.dispose()
      })
      poolRef.current = []
    }
  }, [scene])

  // ── Sync pool when active swarms change ───────────────────────────────────
  useEffect(() => {
    const pool    = poolRef.current
    const now     = Date.now()
    const live    = activeDroneSwarms.filter(s => now < s.expiresAt && s.active)
    const liveIds = new Set(live.map(s => s.id))

    swarmDataRef.current = new Map(live.map(s => [s.id, s]))

    // Release slots for expired swarms
    pool.forEach(slot => {
      if (!slot.inUse || !slot.swarmId) return
      if (liveIds.has(slot.swarmId)) return
      slot.inUse   = false
      slot.swarmId = null
      slot.voidPos = null
      slot.material.opacity = 0
      slot.meshes.forEach(m => {
        m.position.copy(_offscreenPos)
        m.visible = false  // exclude from Three.js render list while parked
      })
    })

    // Assign new swarms to free slots
    const assignedIds = new Set(pool.filter(s => s.inUse).map(s => s.swarmId!))
    live.forEach(swarm => {
      if (assignedIds.has(swarm.id)) return
      const freeSlot = pool.find(s => !s.inUse)
      if (!freeSlot) return  // pool exhausted — gracefully skip

      const srcTerritory = TERRITORY_MAP[swarm.sourceTerritoryId]
      if (!srcTerritory) return

      const sp = srcTerritory.position
      const srcWorldY = getTerrainY(sp[0], sp[2]) + sp[1]
      const sourcePos = new THREE.Vector3(sp[0], srcWorldY, sp[2])

      freeSlot.inUse   = true
      freeSlot.swarmId = swarm.id

      if (swarm.direction === 'off_screen') {
        freeSlot.voidPos = sourcePos.length() < 0.001
          ? new THREE.Vector3(VOID_DISTANCE, srcWorldY, 0)
          : sourcePos.clone().normalize().multiplyScalar(VOID_DISTANCE).setY(srcWorldY)
      } else {
        freeSlot.voidPos = null
      }

      // Pass drone color — orbit swarms use territory droneColor, others use swarm.color or default
      initSlotForSwarm(freeSlot, sourcePos, swarm.color)
    })
  }, [activeDroneSwarms])

  // ── Per-frame animation ────────────────────────────────────────────────────
  useFrame(({ clock }, delta) => {
    const t  = clock.elapsedTime
    const dt = Math.min(delta, 0.05)  // cap — no physics explosion on tab restore
    const now = Date.now()

    // for-loop avoids forEach closure + iterator allocation per frame
    const pool = poolRef.current
    for (let si = 0; si < pool.length; si++) {
      const slot = pool[si]
      if (!slot.inUse || !slot.swarmId) continue

      const swarm = swarmDataRef.current.get(slot.swarmId)
      if (!swarm) continue

      const srcTerritory = TERRITORY_MAP[swarm.sourceTerritoryId]
      if (!srcTerritory) continue

      const duration = swarm.expiresAt - swarm.startedAt
      const phase    = Math.min(1.0, (now - swarm.startedAt) / duration)

      const sp = srcTerritory.position
      _source.set(sp[0], getTerrainY(sp[0], sp[2]) + sp[1], sp[2])

      // ── GONE phase (off_screen 0.35–0.55) — hide + mark ─────────────────
      // Orbit mode has no GONE phase — it holds continuously until TTL.
      if (swarm.direction === 'off_screen' && phase >= 0.35 && phase < 0.55) {
        slot.material.opacity = 0
        slot.meshes.forEach(m => m.position.copy(_offscreenPos))
        slot.wasGone = true
        continue
      }

      // ── Resume from GONE — snap formation to void position ───────────────
      if (slot.wasGone && slot.voidPos) {
        for (let h = 0; h < HISTORY_SIZE; h++) {
          slot.leaderHistory[h].copy(slot.voidPos)
        }
        for (let i = 0; i < DRONE_COUNT; i++) {
          slot.positions[i].copy(slot.voidPos)
          slot.velocities[i].set(0, 0, 0)
          slot.prevSlotTargets[i].copy(slot.voidPos)  // reset v_goal baseline — no phantom velocity
        }
        // Reset heading to point toward source — avoids 1-2 frame stale outbound heading
        // on return journey. _source is already set above.
        _forward.subVectors(_source, slot.voidPos)
        if (_forward.lengthSq() > 0.0001) {
          slot.leaderHeading.copy(_forward.normalize())
        }
        slot.wasGone = false
      }

      // ── Set up world-space vectors ────────────────────────────────────────
      // Orbit mode: no target or void needed — leader circles _source
      if (swarm.direction === 'to_territory') {
        const tgtTerritory = TERRITORY_MAP[swarm.targetTerritoryId]
        if (!tgtTerritory) continue
        const tp = tgtTerritory.position
        _target.set(tp[0], getTerrainY(tp[0], tp[2]) + tp[1], tp[2])
      }

      if (swarm.direction === 'off_screen') {
        if (!slot.voidPos) continue  // defensive: off_screen swarm must have a void destination
        _void.copy(slot.voidPos)
      }

      // ── Opacity ───────────────────────────────────────────────────────────
      let opacity: number
      if (swarm.direction === 'orbit') {
        // Fade in over first 5% of TTL, hold at 0.82, fade out in last 8%.
        // (Orbit swarms have 60s TTL; last 8% = last ~5s for graceful fade on renewal/expiry.)
        opacity =
          phase < 0.05 ? phase / 0.05 :
          phase > 0.92 ? Math.max(0, 1.0 - (phase - 0.92) / 0.08) :
          0.82
      } else if (swarm.direction === 'to_territory') {
        opacity =
          phase < 0.05 ? phase / 0.05 :
          phase < 0.80 ? 1.0 :
          Math.max(0, 1.0 - (phase - 0.80) / 0.20)
      } else {
        if (phase < 0.35) {
          // Fade in over first 5% then fade out toward void (dim to 0.15 by 0.35)
          const fadeIn = Math.min(1.0, phase / 0.05)
          opacity = fadeIn * Math.max(0, 1.0 - (phase / 0.35) * 0.85)
        } else {
          const returnT = (phase - 0.55) / 0.45
          opacity =
            returnT < 0.20 ? returnT / 0.20 :
            returnT < 0.82 ? 1.0 :
            Math.max(0, 1.0 - (returnT - 0.82) / 0.18)
        }
      }
      slot.material.opacity = opacity

      // ── Color switch purple → cyan on return (off_screen only) ───────────
      // Orbit swarms keep their territory drone color for the full lifetime.
      if (swarm.direction === 'off_screen' && phase >= 0.55 && slot.lastColor !== 'back') {
        slot.material.color.copy(_colorBack)
        slot.lastColor = 'back'
      }

      // ── Leader waypoint (direct placement, no physics) ───────────────────
      const returnedAngle = computeLeaderWaypoint(swarm, phase, t, _waypoint)

      // ── Leader heading ────────────────────────────────────────────────────
      // GLIDE UPGRADE (S202): Use analytical tangent for circular orbits.
      // Old approach: _forward = waypoint - prevWaypoint (numerical diff).
      // Problem: breathe oscillation made radial velocity ≈ tangential velocity,
      //   causing heading to oscillate between tangential and radial directions.
      // New approach: when orbitAngle > 0, compute exact tangent (-sin, 0, cos).
      //   For linear paths (off_screen, to_territory transit): history delta is stable.
      if (returnedAngle !== 0) {
        // Analytical tangent to circular orbit — exact, zero jitter
        _forward.set(-Math.sin(returnedAngle), 0, Math.cos(returnedAngle))
        // EMA smooth: blend toward analytical heading over ~8 frames (α=0.12)
        // Prevents any residual discontinuity when transitioning to/from orbit.
        slot.leaderHeading.lerp(_forward, 0.12)
        if (slot.leaderHeading.lengthSq() > 0.0001) slot.leaderHeading.normalize()
      } else {
        // History delta for linear paths — stable since direction is constant
        const prevIdx = (slot.historyHead - 1 + HISTORY_SIZE) % HISTORY_SIZE
        _forward.subVectors(_waypoint, slot.leaderHistory[prevIdx])
        if (_forward.lengthSq() > 0.0001) {
          // EMA smooth heading to dampen any residual numerical noise
          slot.leaderHeading.lerp(_forward.normalize(), 0.15)
          if (slot.leaderHeading.lengthSq() > 0.0001) slot.leaderHeading.normalize()
        }
      }

      // Write leader waypoint to history
      slot.leaderHistory[slot.historyHead].copy(_waypoint)
      slot.historyHead = (slot.historyHead + 1) % HISTORY_SIZE

      // Leader mesh — direct placement, bob applied at mesh level
      slot.positions[0].copy(_waypoint)

      if (slot.leaderHeading.lengthSq() > 0.0001) {
        _qTarget.setFromUnitVectors(_zAxis, slot.leaderHeading)
        // Slerp rate 4.5 (was 8.0) — smoother banking, less snap
        slot.quats[0].slerp(_qTarget, Math.min(1, dt * 4.5))
      }

      const leaderBob = BOB_AMP * Math.sin(t * BOB_FREQ_RADS + BOB_PHASES[0])
      slot.meshes[0].position.copy(slot.positions[0])
      slot.meshes[0].position.y += leaderBob
      slot.meshes[0].quaternion.copy(slot.quats[0])

      // Formation right vector (XZ, perpendicular to heading)
      // cross(up, heading) = Y×Z = +X — correct right vector (not mirrored V)
      _right.crossVectors(_up, slot.leaderHeading).normalize()
      if (_right.lengthSq() < 0.01) _right.set(1, 0, 0)

      // ── Followers (i = 1..4) ─────────────────────────────────────────────
      for (let i = 1; i < DRONE_COUNT; i++) {
        // Lagged leader position from history
        const lagIdx = (slot.historyHead - 1 - LAG_FRAMES[i] + HISTORY_SIZE * 2) % HISTORY_SIZE
        _lagged.copy(slot.leaderHistory[lagIdx])

        // Formation slot target: lagged leader + rotated V offset
        const [offR, offU, offB] = FORMATION_OFFSETS[i]
        _slotTarget.copy(_lagged)
        _slotTarget.addScaledVector(_right, offR)
        _slotTarget.y += offU
        _slotTarget.addScaledVector(slot.leaderHeading, -offB)  // behind = -forward

        // Displacement to formation slot
        _desired.subVectors(_slotTarget, slot.positions[i])

        // v_goal: formation slot velocity from finite difference of slot target.
        // Research insight (S202): when v_goal=0 on a moving slot, spring damps
        // velocity toward zero while chasing a moving target → persistent lag + overshoot.
        // Fix: damp toward slot velocity, not zero.
        // v_goal = (_slotTarget - prevSlot) / dt — clamped to MAX_SPEED to avoid
        // large spurious jumps on first frame or GONE→resume transitions.
        const vgx = Math.min(Math.max((_slotTarget.x - slot.prevSlotTargets[i].x) / dt, -MAX_SPEED), MAX_SPEED)
        const vgy = Math.min(Math.max((_slotTarget.y - slot.prevSlotTargets[i].y) / dt, -MAX_SPEED), MAX_SPEED)
        const vgz = Math.min(Math.max((_slotTarget.z - slot.prevSlotTargets[i].z) / dt, -MAX_SPEED), MAX_SPEED)

        // Critically damped spring (Game Programming Gem 4 — Thomas Lowe)
        // F = k*(target - pos) + damp*(v_goal - vel)  →  ω₀=3.46 rad/s, ζ=1 (no overshoot).
        // Softened from K=36/D=12 (τ=0.17s) to K=12/D=7 (τ=0.29s) — elastic glide.
        slot.velocities[i].x += (SPRING_K * _desired.x + SPRING_DAMP * (vgx - slot.velocities[i].x)) * dt
        slot.velocities[i].y += (SPRING_K * _desired.y + SPRING_DAMP * (vgy - slot.velocities[i].y)) * dt
        slot.velocities[i].z += (SPRING_K * _desired.z + SPRING_DAMP * (vgz - slot.velocities[i].z)) * dt

        // Update previous slot target for next frame's v_goal computation
        slot.prevSlotTargets[i].copy(_slotTarget)

        // Separation — XZ only, applied as a gentle velocity impulse (not through spring)
        _sepForce.set(0, 0, 0)
        for (let j = 0; j < DRONE_COUNT; j++) {
          if (j === i) continue
          _diff.subVectors(slot.positions[i], slot.positions[j])
          _diff.y = 0
          const d = _diff.length()
          if (d < SEP_RADIUS && d > 0.001) {
            _sepForce.addScaledVector(_diff.normalize(), (SEP_RADIUS - d) / SEP_RADIUS)
          }
        }
        slot.velocities[i].x += _sepForce.x * SEP_WEIGHT * dt
        slot.velocities[i].z += _sepForce.z * SEP_WEIGHT * dt

        // Speed cap
        const spd = slot.velocities[i].length()
        if (spd > MAX_SPEED) slot.velocities[i].multiplyScalar(MAX_SPEED / spd)

        // Integrate position (base — no bob yet)
        slot.positions[i].addScaledVector(slot.velocities[i], dt)

        // Orientation from velocity via quaternion slerp — smooth banking
        // Slerp rate 3.5 (was 6.0) — followers bank lazily into turns, trailing grace
        const velLen = slot.velocities[i].length()
        if (velLen > 0.04) {
          _velNorm.copy(slot.velocities[i]).divideScalar(velLen)
          _qTarget.setFromUnitVectors(_zAxis, _velNorm)
          slot.quats[i].slerp(_qTarget, Math.min(1, dt * 3.5))
        }

        // Bob applied at mesh level only — not fed back into physics
        const bob = BOB_AMP * Math.sin(t * BOB_FREQ_RADS + BOB_PHASES[i])
        slot.meshes[i].position.copy(slot.positions[i])
        slot.meshes[i].position.y += bob
        slot.meshes[i].quaternion.copy(slot.quats[i])
      }
    }
  })

  return null
}
