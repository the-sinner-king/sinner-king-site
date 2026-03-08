'use client'

/**
 * DroneSwarm.tsx — v4 (Session 137 bird-flock upgrade)
 * Code is my art. I iterate until it sings. — CODE_AS_ART_MANIFESTO
 *
 * ARCHITECTURE: Manager pattern — single component owns ALL swarm geometry.
 *
 *   v4 improvements over v3 (InstancedMesh helix with 18 drones):
 *   - 5 individual Mesh refs — elegant, not fog
 *   - Leader-follower formation: loose V (inner ±1.5 / outer ±3.0)
 *   - Per-drone position history ring buffer — lagged followers trail naturally
 *   - Velocity lerp + arrive deceleration — smooth, no snapping
 *   - Phase-offset bob (0.9 Hz, ±0.07) — organic breathing across the formation
 *   - Separation Boids (weight 0.04, XZ only) — prevents clumping
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
const HISTORY_SIZE    = 80        // ring buffer frames (≈ 1.3s @ 60fps)
const RESPONSIVENESS  = 3.0       // follower velocity lerp factor
const MAX_SPEED       = 5.0       // units/second (followers catch-up)
const BOB_FREQ_RADS   = 0.9 * Math.PI * 2  // 0.9 Hz in rad/s
const BOB_AMP         = 0.07
const SEP_RADIUS      = 0.8       // separation trigger distance
const SEP_WEIGHT      = 0.04
const ARRIVE_DIST     = 2.5       // deceleration zone radius
const VOID_DISTANCE   = 22
const DRONE_COLOR_OUT  = '#7000ff'
const DRONE_COLOR_BACK = '#00f3ff'

// Orbit mode constants
const ORBIT_SPEED      = 0.785    // rad/s — one full orbit in ~8s
const ORBIT_HOVER_Y    = 0.55     // world units above territory world-Y
const ORBIT_BREATHE_AMP = 0.18    // radius pulse amplitude (±0.18 world units)

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
// Loose V: inner ±1.5 / 1.2, outer ±3.0 / 2.4
const FORMATION_OFFSETS: readonly [number, number, number][] = [
  [0,    0, 0],    // 0: leader (front center)
  [-1.5, 0, 1.2],  // 1: inner left wing
  [1.5,  0, 1.2],  // 2: inner right wing
  [-3.0, 0, 2.4],  // 3: outer left wing
  [3.0,  0, 2.4],  // 4: outer right wing
]

// History lag per slot — followers trail the leader's past positions
const LAG_FRAMES = [0, 10, 10, 20, 20] as const

// Evenly spaced bob phases across the formation
const BOB_PHASES = Array.from({ length: DRONE_COUNT }, (_, i) =>
  (i / DRONE_COUNT) * Math.PI * 2
)

// Speed variation ±3% — subtle organic desync
const SPEED_FACTORS = [1.0, 0.98, 1.02, 0.97, 1.03] as const

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
  leaderHeading: THREE.Vector3        // last known leader heading (unit vector)
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
    positions:     Array.from({ length: DRONE_COUNT }, () => new THREE.Vector3(0, -1000, 0)),
    velocities:    Array.from({ length: DRONE_COUNT }, () => new THREE.Vector3()),
    quats:         Array.from({ length: DRONE_COUNT }, () => new THREE.Quaternion()),
    leaderHistory: Array.from({ length: HISTORY_SIZE }, () => new THREE.Vector3()),
    historyHead:   0,
    leaderHeading: new THREE.Vector3(0, 0, 1),
    wasGone:       false,
    inUse:         false,
    swarmId:       null,
    lastColor:     'out',
    voidPos:       null,
  }
}

// ---------------------------------------------------------------------------
// LEADER WAYPOINT — computed directly from phase (no physics for leader)
// Leader positions are stored in history; followers do velocity-physics toward slots.
// ---------------------------------------------------------------------------

function computeLeaderWaypoint(
  swarm: DroneSwarm,
  phase: number,
  t: number,
  out: THREE.Vector3,
): void {
  if (swarm.direction === 'off_screen') {
    if (phase < 0.35) {
      out.lerpVectors(_source, _void, phase / 0.35)
    } else if (phase < 0.55) {
      out.copy(_void)  // GONE — held at void; caller hides meshes
    } else {
      const returnT = (phase - 0.55) / 0.45
      out.lerpVectors(_void, _source, Math.min(returnT, 1.0))
    }
  } else if (swarm.direction === 'orbit') {
    // Orbit mode: leader circles source territory in XZ plane.
    // _source is pre-set to territory world position (terrain Y + clearance) before this call.
    // Radius breathes at orbit frequency — drones pulse with the bot's working rhythm.
    const ringRadius   = TERRITORY_RING_RADII[swarm.sourceTerritoryId] ?? 0.9
    const radiusMul    = swarm.label === 'swarming' ? ORBIT_RADIUS_SWARMING : ORBIT_RADIUS_WORKING
    const baseRadius   = ringRadius * radiusMul
    const breatheFreq  = swarm.label === 'swarming' ? 11.31 : (swarm.label === 'writing' ? 8.80 : 7.54)
    // 11.31 = 2π/556ms, 8.80 = 2π/714ms, 7.54 = 2π/833ms
    const radius = baseRadius + Math.sin(t * breatheFreq) * ORBIT_BREATHE_AMP
    const angle  = t * ORBIT_SPEED

    out.set(
      _source.x + Math.cos(angle) * radius,
      _source.y + ORBIT_HOVER_Y,             // world Y — uses _source.y, never territory.position[1] alone
      _source.z + Math.sin(angle) * radius,
    )
  } else {
    // to_territory
    if (phase < 0.6) {
      out.lerpVectors(_source, _target, phase / 0.6)
    } else if (phase < 0.8) {
      // Hover: orbit target
      const hoverT = (phase - 0.6) / 0.2
      const radius = 0.55 - hoverT * 0.15
      const angle  = t * 1.8
      out.copy(_target)
      out.x += Math.cos(angle) * radius
      out.z += Math.sin(angle) * radius
    } else {
      // Fade: drift outward
      const fadeT = (phase - 0.8) / 0.2
      const angle = t * 1.8
      out.copy(_target)
      out.x += Math.cos(angle) * (0.40 + fadeT * 0.6)
      out.z += Math.sin(angle) * (0.40 + fadeT * 0.6)
      out.y += fadeT * 0.5
    }
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

    poolRef.current.forEach(slot => {
      if (!slot.inUse || !slot.swarmId) return

      const swarm = swarmDataRef.current.get(slot.swarmId)
      if (!swarm) return

      const srcTerritory = TERRITORY_MAP[swarm.sourceTerritoryId]
      if (!srcTerritory) return

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
        return
      }

      // ── Resume from GONE — snap formation to void position ───────────────
      if (slot.wasGone && slot.voidPos) {
        for (let h = 0; h < HISTORY_SIZE; h++) {
          slot.leaderHistory[h].copy(slot.voidPos)
        }
        for (let i = 0; i < DRONE_COUNT; i++) {
          slot.positions[i].copy(slot.voidPos)
          slot.velocities[i].set(0, 0, 0)
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
        if (!tgtTerritory) return
        const tp = tgtTerritory.position
        _target.set(tp[0], getTerrainY(tp[0], tp[2]) + tp[1], tp[2])
      }

      if (swarm.direction === 'off_screen') {
        if (!slot.voidPos) return  // defensive: off_screen swarm must have a void destination
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
      computeLeaderWaypoint(swarm, phase, t, _waypoint)

      // Update leader heading from history delta
      const prevIdx = (slot.historyHead - 1 + HISTORY_SIZE) % HISTORY_SIZE
      _forward.subVectors(_waypoint, slot.leaderHistory[prevIdx])
      if (_forward.lengthSq() > 0.0001) {
        slot.leaderHeading.copy(_forward.normalize())
      }

      // Write leader waypoint to history
      slot.leaderHistory[slot.historyHead].copy(_waypoint)
      slot.historyHead = (slot.historyHead + 1) % HISTORY_SIZE

      // Leader mesh — direct placement, bob applied at mesh level
      slot.positions[0].copy(_waypoint)

      if (slot.leaderHeading.lengthSq() > 0.0001) {
        _qTarget.setFromUnitVectors(_zAxis, slot.leaderHeading)
        slot.quats[0].slerp(_qTarget, Math.min(1, dt * 8.0))
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

        // Desired velocity toward slot with arrive deceleration
        _desired.subVectors(_slotTarget, slot.positions[i])
        const dist = _desired.length()
        if (dist > 0.001) {
          const speed = MAX_SPEED * SPEED_FACTORS[i] * Math.min(1.0, dist / ARRIVE_DIST)
          _desired.normalize().multiplyScalar(speed)
        } else {
          _desired.set(0, 0, 0)
        }

        // Separation force (XZ only — prevent clumping without fighting Y bob)
        _sepForce.set(0, 0, 0)
        for (let j = 0; j < DRONE_COUNT; j++) {
          if (j === i) continue
          _diff.subVectors(slot.positions[i], slot.positions[j])
          _diff.y = 0  // XZ separation only
          const d = _diff.length()
          if (d < SEP_RADIUS && d > 0.001) {
            _sepForce.addScaledVector(_diff.normalize(), (SEP_RADIUS - d) / SEP_RADIUS)
          }
        }

        // Combine forces and lerp velocity
        _desired.addScaledVector(_sepForce, SEP_WEIGHT)
        slot.velocities[i].lerp(_desired, Math.min(1, dt * RESPONSIVENESS))

        // Integrate position (base — no bob yet)
        slot.positions[i].addScaledVector(slot.velocities[i], dt)

        // Orientation from velocity via quaternion slerp — smooth banking
        const velLen = slot.velocities[i].length()
        if (velLen > 0.05) {
          _velNorm.copy(slot.velocities[i]).divideScalar(velLen)
          _qTarget.setFromUnitVectors(_zAxis, _velNorm)
          slot.quats[i].slerp(_qTarget, Math.min(1, dt * RESPONSIVENESS * 2))
        }

        // Bob applied at mesh level only — not fed back into physics
        const bob = BOB_AMP * Math.sin(t * BOB_FREQ_RADS + BOB_PHASES[i])
        slot.meshes[i].position.copy(slot.positions[i])
        slot.meshes[i].position.y += bob
        slot.meshes[i].quaternion.copy(slot.quats[i])
      }
    })
  })

  return null
}
