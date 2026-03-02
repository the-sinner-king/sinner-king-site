'use client'

/**
 * SystemHeartbeat.tsx
 *
 * Phase 3 — System Heartbeat Layer.
 * Every Kingdom system gets a visual signature. None fabricated — all synced
 * to real clock boundaries so all clients see the same events at the same time.
 *
 * Systems implemented:
 *
 *   GOLDFISH (5-min screen capture)
 *     Visual: bone-white signal pulse from THE_FORGE → THE_SCRYER
 *     Color: #e8e0d0 (system type in SignalPulse)
 *     Timing: fires at every 5-minute wall-clock boundary
 *     Meaning: GOLDFISH captures the screen, data flows to THE_SCRYER for ingestion
 *
 *   SCRYER WATCH RING (60s scan cycle)
 *     Visual: thin cyan torus expanding outward from THE_SCRYER, fades in 1.5s
 *     Color: #00f3ff (scryer cyan)
 *     Timing: fires at every 60s wall-clock boundary
 *     Meaning: THE_SCRYER completes a watch cycle, scans all territory signals
 *
 * Architecture:
 * - R3F component — lives inside the Canvas, not the DOM
 * - useFrame handles timing: checks clock boundaries via ref, no setInterval
 * - Refs track last-fired time — no state, no re-renders from useFrame
 * - GOLDFISH: queued via ref in useFrame, drained to store in useEffect (50ms)
 * - SCRYER ring: one THREE.Mesh, scale + opacity animated in useFrame, zero allocations
 *
 * Bug fixes applied:
 * - Boundary refs init to current boundary (not 0) — prevents immediate fire on mount
 * - pushSignalEvent() decoupled from useFrame via ref queue + useEffect drain
 * - torusGeometry radial segments: 8 (was 4 — blocky)
 *
 * Spec: KINGDOM_MAP/NORTH_STAR.md § Phase 3 — System Heartbeat Layer
 */

import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useKingdomStore } from '@/lib/kingdom-store'
import type { SignalEvent } from '@/lib/kingdom-store'
import { TERRITORY_MAP, getWorldY } from '@/lib/kingdom-layout'

type PushableEvent = Omit<SignalEvent, 'expiresAt'>

const GOLDFISH_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
const SCRYER_INTERVAL_MS   = 60 * 1000       // 60 seconds
const RING_DURATION_MS     = 1500             // expand + fade over 1.5s

export function SystemHeartbeat() {
  const pushSignalEvent = useKingdomStore((s) => s.pushSignalEvent)

  // Initialize to current boundary — prevents immediate fire on mount.
  // On first useFrame, goldBoundary === lastGoldfishBoundary.current, so no event fires.
  const now0 = Date.now()
  const lastGoldfishBoundary = useRef(Math.floor(now0 / GOLDFISH_INTERVAL_MS) * GOLDFISH_INTERVAL_MS)
  const lastScryerBoundary   = useRef(Math.floor(now0 / SCRYER_INTERVAL_MS)   * SCRYER_INTERVAL_MS)

  // Event queue — useFrame enqueues, useEffect drains to Zustand store.
  // Keeps Zustand set() outside the R3F render loop.
  const eventQueueRef = useRef<PushableEvent[]>([])

  // SCRYER ring animation state — all in refs, never allocate in useFrame
  const ringRef    = useRef<THREE.Mesh>(null)
  const ringActive = useRef(false)
  const ringStart  = useRef(0)

  const scryerTerritory = TERRITORY_MAP['the_scryer']
  const forgeTerritory  = TERRITORY_MAP['the_forge']

  // Drain event queue to store — decoupled from render loop
  useEffect(() => {
    const id = setInterval(() => {
      const queue = eventQueueRef.current.splice(0)
      for (const ev of queue) pushSignalEvent(ev)
    }, 50)
    return () => clearInterval(id)
  }, [pushSignalEvent])

  useFrame(() => {
    const now = Date.now()

    // ── GOLDFISH: bone-white signal from the_forge every 5 minutes ───────────
    // Synchronized to wall clock — all clients fire at the same boundary.
    const goldBoundary = Math.floor(now / GOLDFISH_INTERVAL_MS) * GOLDFISH_INTERVAL_MS
    if (goldBoundary > lastGoldfishBoundary.current && forgeTerritory) {
      lastGoldfishBoundary.current = goldBoundary
      // Queue — drained to store in useEffect above, never calling set() here
      eventQueueRef.current.push({
        id:        `goldfish-${goldBoundary}`,
        type:      'system',
        territory: 'the_forge',
        timestamp: now,
      })
    }

    // ── SCRYER watch ring: expanding torus every 60 seconds ──────────────────
    const scryerBoundary = Math.floor(now / SCRYER_INTERVAL_MS) * SCRYER_INTERVAL_MS
    if (scryerBoundary > lastScryerBoundary.current && scryerTerritory) {
      lastScryerBoundary.current = scryerBoundary
      ringActive.current = true
      ringStart.current  = now
    }

    // Animate ring (expand + fade) — no allocations
    if (ringRef.current) {
      if (!ringActive.current) {
        ringRef.current.visible = false
      } else {
        const elapsed = now - ringStart.current
        const t = Math.min(1.0, elapsed / RING_DURATION_MS)

        if (t >= 1.0) {
          ringActive.current = false
          ringRef.current.visible = false
        } else {
          ringRef.current.visible = true
          // Expand from 1× to 4× radius
          const scale = 1.0 + t * 3.0
          ringRef.current.scale.setScalar(scale)
          // Fade: bright at start, gone by end
          ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity =
            Math.max(0, (1.0 - t) * 0.55)
        }
      }
    }
  })

  if (!scryerTerritory) return null

  return (
    <mesh
      ref={ringRef}
      position={[scryerTerritory.position[0], getWorldY(scryerTerritory), scryerTerritory.position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
    >
      {/* Thin torus: radius=0.9, tube=0.03 — 8 radial segments for smooth ring */}
      <torusGeometry args={[0.9, 0.03, 8, 64]} />
      <meshBasicMaterial
        color="#00f3ff"
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}
