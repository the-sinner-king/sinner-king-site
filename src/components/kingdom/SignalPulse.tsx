'use client'

/**
 * SignalPulse.tsx
 *
 * Renders glowing signal pulses traveling along connection beams between territories.
 * Each pulse is a small sphere that travels from a source territory to THE_SCRYER.
 *
 * Fixes applied (Granny Codex audit):
 * 1. Time domain mismatch resolved — expiresAtMs (Unix ms) compared to Date.now(),
 *    startTime (perf seconds) used only for animation math.
 * 2. Shared material opacity mutation eliminated — each mesh in the pool owns its
 *    own MeshBasicMaterial instance; color and opacity set per-mesh in useFrame.
 * 3. Distance divisor corrected — (distance / 8) instead of (distance / 20) so
 *    actual inter-territory distances (3–7 units) produce the intended 0.8–1.2s range.
 * 4. Territory data imported from @/lib/kingdom-layout — no local copy.
 *
 * C1 fix: Batch pulses arriving simultaneously are staggered by 150ms each so they
 *   travel as separate sparks instead of overlapping as a blob.
 * C2 fix: Stable slot assignment via slotMapRef (pulse ID → mesh index) +
 *   freeSlotsRef queue. A pulse's mesh slot never shifts during its lifetime,
 *   preventing snap/teleport when earlier pulses expire and are removed.
 *
 * Performance:
 * - Shared sphere geometry across all pulses
 * - Each mesh has its own material (required for independent opacity)
 * - No per-frame allocations; scratch vector pre-allocated
 * - All geometry and materials disposed on unmount
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useKingdomStore } from '@/lib/kingdom-store'
import type { SignalEvent } from '@/lib/kingdom-store'
import { TERRITORY_MAP, getWorldY } from '@/lib/kingdom-layout'

// ---------------------------------------------------------------------------
// RAVEN ARRIVAL EMITTER — module-level bridge between R3F canvas and DOM
// Queued-ref pattern (BQ-02): accumulate arrivals in array, flush via setInterval
// ---------------------------------------------------------------------------

export type RavenArrival = { territoryId: string; position: [number, number, number] }

export const ravenArrivalQueue: RavenArrival[] = []

// ---------------------------------------------------------------------------
// SIGNAL COLOR PALETTE — SignalPulse-specific, stays here
// ---------------------------------------------------------------------------

type SignalType = 'claude' | 'aeris' | 'brandon' | 'system' | 'overmind' | 'scryer' | 'raven' | 'unknown'

const SIGNAL_COLORS: Record<SignalType, string> = {
  claude: '#7000ff',
  aeris: '#ff006e',
  brandon: '#f0a500',
  system: '#e8e0d0',
  overmind: '#f0a500',
  scryer: '#00f3ff',
  raven: '#9b30ff',
  unknown: '#404040',
}

// ---------------------------------------------------------------------------
// TERRITORY POSITION CACHE — module-level, allocated once at first access
//
// sourcePos/targetPos in PulseInstance are read-only during animation
// (useFrame calls lerpVectors which reads them, never mutates). Territory
// positions come from TERRITORY_MAP (module-level const, never mutated).
// Pre-allocating once eliminates per-burst Vector3 allocations.
// ---------------------------------------------------------------------------

const _territoryPosCache = new Map<string, THREE.Vector3>()

function _getTerritoryPos(id: string): THREE.Vector3 | undefined {
  let cached = _territoryPosCache.get(id)
  if (!cached) {
    const t = TERRITORY_MAP[id]
    if (!t) return undefined
    cached = new THREE.Vector3(t.position[0], getWorldY(t), t.position[2])
    _territoryPosCache.set(id, cached)
  }
  return cached
}

// ---------------------------------------------------------------------------
// ACTIVE PULSE DATA
// ---------------------------------------------------------------------------

const POOL_SIZE = 60

// PERF: Sorted insertion — O(n) vs O(n log n) sort on every slot release.
// Slots are integers 0..POOL_SIZE-1; binary search to find insert position.
function insertFreeSlot(arr: number[], slot: number): void {
  let lo = 0, hi = arr.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid] < slot) lo = mid + 1; else hi = mid }
  arr.splice(lo, 0, slot)
}

interface PulseInstance {
  id: string
  type: SignalType
  sourcePos: THREE.Vector3
  targetPos: THREE.Vector3
  startTime: number    // performance.now() / 1000 — for animation math only
  expiresAtMs: number  // Date.now() + TTL — compared to Date.now() for expiry
  duration: number     // travel time in seconds
  isRaven?: boolean
  ravenTrailSlots?: [number, number, number]
  ravenTrailStartTimes?: [number, number, number]
  destTerritoryId?: string
}

// PERF: Raven trail opacity weights are constants — hoisted from useFrame body
// to avoid allocating a new [number, number, number] on every raven pulse frame.
const RAVEN_TRAIL_OPACITIES: readonly [number, number, number] = [0.6, 0.3, 0.1]

// ---------------------------------------------------------------------------
// SIGNAL PULSES COMPONENT
// ---------------------------------------------------------------------------

export function SignalPulses() {
  const groupRef = useRef<THREE.Group>(null)
  const pulsesRef = useRef<PulseInstance[]>([])
  const meshPoolRef = useRef<THREE.Mesh[]>([])

  // C2: Stable slot assignment — pulse ID → mesh index, never shifts on expiry
  const slotMapRef = useRef<Map<string, number>>(new Map())
  // C2: Free slot queue — pre-filled 0..POOL_SIZE-1, lowest index first
  const freeSlotsRef = useRef<number[]>([])
  // 🏛️ ARCHAEOLOGICAL RECORD // SignalPulse O(1) Lookup
  // 🗓️ 2026-03-06 | Session 166 | FIX-D
  // ISSUE: useFrame inner loop called activePulses.find(p => p.id === pulseId) per mesh slot.
  //        With POOL_SIZE=20 slots × up to 20 active pulses = 400 comparisons per frame at 60fps
  //        = 24,000 comparisons/second. Pure O(n²) in the hot render path.
  //        Also: .some((p) => p.id === event.id) in the spawn gate was the same pattern.
  // RESOLUTION: pulseMapRef — a Map<string, PulseInstance> kept in sync with activePulses[].
  //             O(1) .has() for duplicate check. O(1) .get() in useFrame inner loop.
  //             .set() on spawn, .delete() on expiry (both paths).
  // LAW: Never use .find()/.some() in useFrame inner loops on unbounded lists.
  //      Always maintain a companion Map for O(1) hot-path lookups.
  const pulseMapRef = useRef<Map<string, PulseInstance>>(new Map())

  // Scratch vector — reused every frame, no per-frame allocation
  const scratchPos = useMemo(() => new THREE.Vector3(), [])

  const recentSignalEvents = useKingdomStore((s) => s.recentSignalEvents)

  // Initialize mesh pool — unified effect owns both creation and cleanup.
  // Single effect prevents StrictMode double-mount leaving pool orphaned on scene.
  // geometry is local so cleanup can always dispose it without useMemo staleness.
  useEffect(() => {
    if (!groupRef.current) return
    const geom = new THREE.SphereGeometry(0.15, 8, 8)
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color:     '#7000ff',
        transparent: true,
        opacity:   0.9,
        blending:  THREE.AdditiveBlending,  // hot spark glow — composites as light, not ink
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.visible = false
      groupRef.current.add(mesh)
      meshPoolRef.current.push(mesh)
    }

    // C2: Initialize free slots queue in the same effect so it's always in sync
    freeSlotsRef.current = Array.from({ length: POOL_SIZE }, (_, i) => i)

    return () => {
      // Remove from group first — prevents Strict Mode double-mount leaving orphan meshes
      meshPoolRef.current.forEach((mesh) => {
        groupRef.current?.remove(mesh)
        ;(mesh.material as THREE.MeshBasicMaterial).dispose()
      })
      geom.dispose()
      meshPoolRef.current = []
      slotMapRef.current.clear()
      freeSlotsRef.current = []
      pulseMapRef.current.clear()
    }
  }, [])

  // Process incoming events — spawn new pulses, expire old ones
  useEffect(() => {
    const nowPerf = performance.now() / 1000
    const nowMs = Date.now()

    // C1: Collect only genuinely new signals first so we can stagger them by
    // their position within this batch — not across the whole pulsesRef array.
    const newSignals: SignalEvent[] = []
    recentSignalEvents.forEach((event: SignalEvent) => {
      if (pulseMapRef.current.has(event.id)) return  // O(1) check via pulseMapRef
      newSignals.push(event)
    })

    // C1: Build new pulses with per-batch stagger offset (150ms each)
    newSignals.forEach((event, idx) => {
      // Use cached territory positions — positions are constants from TERRITORY_MAP;
      // lerpVectors reads them without mutating, so sharing across pulses is safe.
      const sourcePos = event.territory ? _getTerritoryPos(event.territory) : undefined
      if (!sourcePos) return

      const ravenDestId = (event.type === 'raven' && event.territory) ? event.territory : 'the_scryer'
      const targetPos = _getTerritoryPos(ravenDestId) ?? _getTerritoryPos('the_scryer')
      if (!targetPos) return

      const distance = sourcePos.distanceTo(targetPos)
      // Divisor 8 spans actual inter-territory distances (3–7 units) across 0.8–1.2s
      const duration = 0.8 + (distance / 8) * 0.4

      const pulse: PulseInstance = {
        id: event.id,
        type: event.type as SignalType,
        sourcePos,
        targetPos,
        // C1: stagger each pulse in the batch by 150ms so simultaneous arrivals
        // animate as separate sparks instead of one overlapping blob
        startTime: nowPerf + idx * 0.15,
        expiresAtMs: event.expiresAt, // Date.now() + TTL from store
        duration,
        destTerritoryId: ravenDestId,
      }

      // C2: Assign a stable mesh slot for this pulse's entire lifetime
      const slot = freeSlotsRef.current.shift()
      if (slot !== undefined) {
        slotMapRef.current.set(pulse.id, slot)
      }

      // Raven trail: claim 3 slots from the reserved 50–59 range
      if (event.type === 'raven') {
        const trailSlots = freeSlotsRef.current.filter((s) => s >= 50).slice(0, 3)
        if (trailSlots.length === 3) {
          freeSlotsRef.current = freeSlotsRef.current.filter((s) => !trailSlots.includes(s))
          pulse.isRaven = true
          pulse.ravenTrailSlots = trailSlots as [number, number, number]
          pulse.ravenTrailStartTimes = [nowPerf + 0.15, nowPerf + 0.30, nowPerf + 0.45]
          slotMapRef.current.set(`${pulse.id}-trail-0`, trailSlots[0])
          slotMapRef.current.set(`${pulse.id}-trail-1`, trailSlots[1])
          slotMapRef.current.set(`${pulse.id}-trail-2`, trailSlots[2])
        }
      }

      pulsesRef.current.push(pulse)
      pulseMapRef.current.set(pulse.id, pulse)  // register for O(1) lookup in useFrame
    })

    // Expire pulses — compare Unix ms to Unix ms (same time domain)
    const expired = pulsesRef.current.filter((p) => p.expiresAtMs <= nowMs)
    expired.forEach((p) => {
      // C2: Release the slot back to the free pool when the pulse expires
      const slot = slotMapRef.current.get(p.id)
      if (slot !== undefined) {
        meshPoolRef.current[slot].visible = false
        insertFreeSlot(freeSlotsRef.current, slot)
        slotMapRef.current.delete(p.id)
      }
      // Release raven trail slots
      for (let i = 0; i < 3; i++) {
        const trailKey = `${p.id}-trail-${i}`
        const trailSlot = slotMapRef.current.get(trailKey)
        if (trailSlot !== undefined) {
          if (trailSlot < meshPoolRef.current.length) meshPoolRef.current[trailSlot].visible = false
          insertFreeSlot(freeSlotsRef.current, trailSlot)
          slotMapRef.current.delete(trailKey)
        }
      }
      pulseMapRef.current.delete(p.id)
    })
    pulsesRef.current = pulsesRef.current.filter((p) => p.expiresAtMs > nowMs)
  }, [recentSignalEvents])

  useFrame(() => {
    const now = performance.now() / 1000

    // Expire completed pulses every frame — don't wait for store update
    const nowMs = Date.now()
    const frameExpired = pulsesRef.current.filter((p) => p.expiresAtMs <= nowMs)
    frameExpired.forEach((p) => {
      // C2: Release slot on frame-level expiry too
      const slot = slotMapRef.current.get(p.id)
      if (slot !== undefined) {
        meshPoolRef.current[slot].visible = false
        insertFreeSlot(freeSlotsRef.current, slot)
        slotMapRef.current.delete(p.id)
      }
      // Release raven trail slots
      for (let i = 0; i < 3; i++) {
        const trailKey = `${p.id}-trail-${i}`
        const trailSlot = slotMapRef.current.get(trailKey)
        if (trailSlot !== undefined) {
          if (trailSlot < meshPoolRef.current.length) meshPoolRef.current[trailSlot].visible = false
          insertFreeSlot(freeSlotsRef.current, trailSlot)
          slotMapRef.current.delete(trailKey)
        }
      }
      pulseMapRef.current.delete(p.id)
    })
    pulsesRef.current = pulsesRef.current.filter((p) => p.expiresAtMs > nowMs)

    // C2: Iterate by stable slot assignment rather than positional array index.
    // A pulse's slot never changes during its lifetime — no teleport on expiry.
    for (const [pulseId, slot] of slotMapRef.current) {
      // Trail slots are handled inline when we process the primary pulse key
      if (pulseId.includes('-trail-')) continue

      const pulse = pulseMapRef.current.get(pulseId)  // O(1) — was O(n) .find()
      if (!pulse) continue
      if (slot >= meshPoolRef.current.length) continue

      const elapsed = Math.max(0, now - pulse.startTime)
      const t = Math.min(1, elapsed / pulse.duration)

      scratchPos.lerpVectors(pulse.sourcePos, pulse.targetPos, t)

      const fadeFactor = Math.sin(t * Math.PI)

      const mesh = meshPoolRef.current[slot]
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.color.set(SIGNAL_COLORS[pulse.type])
      mat.opacity = Math.min(1.0, fadeFactor)

      mesh.position.copy(scratchPos)
      if (pulse.isRaven) {
        mesh.scale.setScalar((0.10 + fadeFactor * 0.075) * 1.4)
      } else {
        mesh.scale.setScalar(0.10 + fadeFactor * 0.075)
      }
      mesh.visible = fadeFactor > 0.01

      // Raven arrival: push to queue when pulse completes — flushed by RavenArrivalFlash interval
      if (pulse.isRaven && t >= 1.0 && elapsed - pulse.duration < 1 / 60) {
        ravenArrivalQueue.push({
          territoryId: pulse.destTerritoryId ?? 'the_scryer',
          position: [pulse.targetPos.x, pulse.targetPos.y, pulse.targetPos.z],
        })
      }

      // Raven trail ghosts — animate lagged t for each trail slot
      if (pulse.isRaven && pulse.ravenTrailSlots && pulse.ravenTrailStartTimes) {
        for (let i = 0; i < 3; i++) {
          const trailSlot = pulse.ravenTrailSlots[i]
          if (trailSlot >= meshPoolRef.current.length) continue
          const trailElapsed = Math.max(0, now - pulse.ravenTrailStartTimes[i])
          const trailT = Math.min(1, trailElapsed / pulse.duration)
          const trailFade = Math.sin(trailT * Math.PI)
          const trailMesh = meshPoolRef.current[trailSlot]
          const trailMat = trailMesh.material as THREE.MeshBasicMaterial
          trailMat.color.set(SIGNAL_COLORS['raven'])
          trailMat.opacity = trailFade * RAVEN_TRAIL_OPACITIES[i]
          scratchPos.lerpVectors(pulse.sourcePos, pulse.targetPos, trailT)
          trailMesh.position.copy(scratchPos)
          trailMesh.scale.setScalar((0.10 + trailFade * 0.075) * 1.4)
          trailMesh.visible = trailFade > 0.01
        }
      }
    }
  })

  // Always render the group so groupRef is set and mesh pool initializes correctly.
  return <group ref={groupRef} />
}
