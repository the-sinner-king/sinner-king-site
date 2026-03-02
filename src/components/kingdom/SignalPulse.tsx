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
// ACTIVE PULSE DATA
// ---------------------------------------------------------------------------

const POOL_SIZE = 50

interface PulseInstance {
  id: string
  type: SignalType
  sourcePos: THREE.Vector3
  targetPos: THREE.Vector3
  startTime: number    // performance.now() / 1000 — for animation math only
  expiresAtMs: number  // Date.now() + TTL — compared to Date.now() for expiry
  duration: number     // travel time in seconds
}

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

  // Scratch vector — reused every frame, no per-frame allocation
  const scratchPos = useMemo(() => new THREE.Vector3(), [])

  const recentSignalEvents = useKingdomStore((s) => s.recentSignalEvents)

  // Initialize mesh pool — unified effect owns both creation and cleanup.
  // Single effect prevents StrictMode double-mount leaving pool orphaned on scene.
  // geometry is local so cleanup can always dispose it without useMemo staleness.
  useEffect(() => {
    if (!groupRef.current) return
    const geom = new THREE.SphereGeometry(0.15, 6, 6)
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
      if (pulsesRef.current.some((p) => p.id === event.id)) return
      newSignals.push(event)
    })

    // C1: Build new pulses with per-batch stagger offset (150ms each)
    newSignals.forEach((event, idx) => {
      const sourceTerritory = event.territory ? TERRITORY_MAP[event.territory] : undefined
      if (!sourceTerritory) return

      const targetTerritory = TERRITORY_MAP['the_scryer']
      if (!targetTerritory) return

      const sourcePos = new THREE.Vector3(sourceTerritory.position[0], getWorldY(sourceTerritory), sourceTerritory.position[2])
      const targetPos = new THREE.Vector3(targetTerritory.position[0], getWorldY(targetTerritory), targetTerritory.position[2])
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
      }

      // C2: Assign a stable mesh slot for this pulse's entire lifetime
      const slot = freeSlotsRef.current.shift()
      if (slot !== undefined) {
        slotMapRef.current.set(pulse.id, slot)
      }

      pulsesRef.current.push(pulse)
    })

    // Expire pulses — compare Unix ms to Unix ms (same time domain)
    const expired = pulsesRef.current.filter((p) => p.expiresAtMs <= nowMs)
    expired.forEach((p) => {
      // C2: Release the slot back to the free pool when the pulse expires
      const slot = slotMapRef.current.get(p.id)
      if (slot !== undefined) {
        meshPoolRef.current[slot].visible = false
        freeSlotsRef.current.push(slot)
        // Keep sorted so lowest index is always taken first (deterministic assignment)
        freeSlotsRef.current.sort((a, b) => a - b)
        slotMapRef.current.delete(p.id)
      }
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
        freeSlotsRef.current.push(slot)
        freeSlotsRef.current.sort((a, b) => a - b)
        slotMapRef.current.delete(p.id)
      }
    })
    pulsesRef.current = pulsesRef.current.filter((p) => p.expiresAtMs > nowMs)

    // C2: Iterate by stable slot assignment rather than positional array index.
    // A pulse's slot never changes during its lifetime — no teleport on expiry.
    for (const [pulseId, slot] of slotMapRef.current) {
      const pulse = pulsesRef.current.find((p) => p.id === pulseId)
      if (!pulse) continue
      if (slot >= meshPoolRef.current.length) continue

      const elapsed = Math.max(0, now - pulse.startTime)
      const t = Math.min(1, elapsed / pulse.duration)

      scratchPos.lerpVectors(pulse.sourcePos, pulse.targetPos, t)

      const fadeFactor = Math.sin(t * Math.PI)

      const mesh = meshPoolRef.current[slot]
      const mat = mesh.material as THREE.MeshBasicMaterial
      // Set color and opacity on this mesh's own material — no shared mutation
      mat.color.set(SIGNAL_COLORS[pulse.type])
      mat.opacity = Math.min(1.0, fadeFactor)

      mesh.position.copy(scratchPos)
      mesh.scale.setScalar(0.10 + fadeFactor * 0.075)
      mesh.visible = fadeFactor > 0.01
    }
  })

  // Always render the group so groupRef is set and mesh pool initializes correctly.
  return <group ref={groupRef} />
}
