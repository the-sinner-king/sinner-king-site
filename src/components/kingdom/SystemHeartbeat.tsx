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
 *   SCRYER WATCH RING (60s scan cycle) — S196 redesign
 *     Visual: fast burst ring (1→3× in 0.6s) followed by 24 particle fragments
 *             that bloom from the ring edge, drift outward + float upward,
 *             shrinking and dissolving over 2.5s.
 *     Voice: "The Scryer sees." — a breath exhaled, not an alarm.
 *     Color: #00f3ff (scryer cyan)
 *     Timing: fires at every 60s wall-clock boundary
 *     Meaning: THE_SCRYER completes a watch cycle, scan data returns to the void
 *
 * Architecture:
 * - R3F component — lives inside the Canvas, not the DOM
 * - useFrame handles timing: checks clock boundaries via ref, no setInterval
 * - Refs track last-fired time — no state, no re-renders from useFrame
 * - GOLDFISH: queued via ref in useFrame, drained to store in useEffect (50ms)
 * - SCRYER ring: one THREE.Mesh, scale + opacity animated in useFrame
 * - SCRYER particles: Float32Array positions computed analytically (frame-rate
 *   independent). spawnPositions + velocities pre-allocated — zero allocs in
 *   useFrame. Position set via spawn + velocity * easeOut(t), needsUpdate = true.
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

// ─── Timing constants ───────────────────────────────────────────────────────
const GOLDFISH_INTERVAL_MS  = 5 * 60 * 1000  // 5 minutes
const SCRYER_INTERVAL_MS    = 60 * 1000       // 60 seconds

// Ring: fast burst — snaps out like a camera flash
const RING_DURATION_MS      = 800             // full fade in 0.8s (was 1500ms)
const RING_MAX_SCALE        = 3.0             // 1→3× (was 4×)

// Particles: slow dissolution — scan data returning to the void
const PARTICLE_COUNT        = 24
const PARTICLE_DURATION_MS  = 2500            // drift + fade over 2.5s
const PARTICLE_SPAWN_RADIUS = 2.7             // ≈ ring base(0.9) × max scale(3)
const PARTICLE_MAX_DRIFT    = 0.5             // max outward travel in world units
const PARTICLE_MAX_RISE     = 0.35            // max upward travel in world units

export function SystemHeartbeat() {
  const pushSignalEvent = useKingdomStore((s) => s.pushSignalEvent)

  // Initialize to current boundary — prevents immediate fire on mount
  const now0 = Date.now()
  const lastGoldfishBoundary = useRef(Math.floor(now0 / GOLDFISH_INTERVAL_MS) * GOLDFISH_INTERVAL_MS)
  const lastScryerBoundary   = useRef(Math.floor(now0 / SCRYER_INTERVAL_MS)   * SCRYER_INTERVAL_MS)

  // Event queue — useFrame enqueues, useEffect drains to Zustand store
  const eventQueueRef = useRef<PushableEvent[]>([])

  // ── Ring refs ──────────────────────────────────────────────────────────────
  const ringRef    = useRef<THREE.Mesh>(null)
  const ringActive = useRef(false)
  const ringStart  = useRef(0)

  // ── Particle refs — all pre-allocated, zero allocs in useFrame ─────────────
  const pointsRef      = useRef<THREE.Points>(null)
  const geomRef        = useRef<THREE.BufferGeometry>(null)
  const matRef         = useRef<THREE.PointsMaterial>(null)
  // spawnPositions: where each particle starts when the ring fires
  const spawnPositions = useRef(new Float32Array(PARTICLE_COUNT * 3))
  // velocities: normalized drift direction vectors (outward XZ + upward Y)
  // Each component is in world-units — controls total displacement at t=1
  const velocities     = useRef(new Float32Array(PARTICLE_COUNT * 3))
  // positions: current world-space positions, computed analytically in useFrame
  const positions      = useRef(new Float32Array(PARTICLE_COUNT * 3))
  const particleActive = useRef(false)
  const particleStart  = useRef(0)

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

    // ── GOLDFISH: bone-white signal from the_forge every 5 minutes ─────────
    const goldBoundary = Math.floor(now / GOLDFISH_INTERVAL_MS) * GOLDFISH_INTERVAL_MS
    if (goldBoundary > lastGoldfishBoundary.current && forgeTerritory) {
      lastGoldfishBoundary.current = goldBoundary
      eventQueueRef.current.push({
        id:        `goldfish-${goldBoundary}`,
        type:      'system',
        territory: 'the_forge',
        timestamp: now,
      })
    }

    // ── SCRYER watch ring + particle spawn ─────────────────────────────────
    const scryerBoundary = Math.floor(now / SCRYER_INTERVAL_MS) * SCRYER_INTERVAL_MS
    if (scryerBoundary > lastScryerBoundary.current && scryerTerritory) {
      lastScryerBoundary.current = scryerBoundary
      ringActive.current = true
      ringStart.current  = now

      // Spawn particle positions — runs once per 60s, Math.random() is fine here
      // Particles at Y + 0.05, just below OvmindRing (Y + 0.06)
      const wx = scryerTerritory.position[0]
      const wy = getWorldY(scryerTerritory) + 0.05
      const wz = scryerTerritory.position[2]

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Evenly distributed around the ring + small angular jitter
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
        // Slight radial spread so particles aren't a perfect circle
        const r = PARTICLE_SPAWN_RADIUS + (Math.random() - 0.5) * 0.5

        spawnPositions.current[i * 3 + 0] = wx + Math.cos(angle) * r
        spawnPositions.current[i * 3 + 1] = wy
        spawnPositions.current[i * 3 + 2] = wz + Math.sin(angle) * r

        // Velocity = drift direction × total displacement (world units, not per-frame)
        // outward speed: 0.3–0.5 units total travel; upward: 0.15–0.35 units total
        const outSpeed = PARTICLE_MAX_DRIFT * (0.6 + Math.random() * 0.8)
        const upSpeed  = PARTICLE_MAX_RISE  * (0.4 + Math.random() * 0.6)
        velocities.current[i * 3 + 0] = Math.cos(angle) * outSpeed
        velocities.current[i * 3 + 1] = upSpeed
        velocities.current[i * 3 + 2] = Math.sin(angle) * outSpeed
      }

      // Snap to spawn positions before first frame renders
      positions.current.set(spawnPositions.current)
      if (geomRef.current) {
        (geomRef.current.attributes.position as THREE.BufferAttribute).needsUpdate = true
      }

      particleActive.current = true
      particleStart.current  = now
    }

    // ── Animate ring: fast burst ───────────────────────────────────────────
    if (ringRef.current) {
      if (!ringActive.current) {
        ringRef.current.visible = false
      } else {
        const t = Math.min(1.0, (now - ringStart.current) / RING_DURATION_MS)
        if (t >= 1.0) {
          ringActive.current = false
          ringRef.current.visible = false
        } else {
          ringRef.current.visible = true
          ringRef.current.scale.setScalar(1.0 + t * (RING_MAX_SCALE - 1.0))
          ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity =
            Math.max(0, (1.0 - t) * 0.6)
        }
      }
    }

    // ── Animate particles: drift + float + dissolve ─────────────────────────
    // Positions computed analytically — frame-rate independent.
    // f(pt) = ease-out quadratic: fast start, coasts to rest.
    if (particleActive.current && matRef.current && geomRef.current && pointsRef.current) {
      const pt = Math.min(1.0, (now - particleStart.current) / PARTICLE_DURATION_MS)

      if (pt >= 1.0) {
        particleActive.current = false
        pointsRef.current.visible = false
        matRef.current.opacity = 0
      } else {
        pointsRef.current.visible = true

        // Ease-out quadratic: f = t(2−t). Starts at 0, ends at 1. Fast→slow.
        const f = pt * (2.0 - pt)

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          positions.current[i * 3 + 0] = spawnPositions.current[i * 3 + 0] + velocities.current[i * 3 + 0] * f
          positions.current[i * 3 + 1] = spawnPositions.current[i * 3 + 1] + velocities.current[i * 3 + 1] * f
          positions.current[i * 3 + 2] = spawnPositions.current[i * 3 + 2] + velocities.current[i * 3 + 2] * f
        }
        ;(geomRef.current.attributes.position as THREE.BufferAttribute).needsUpdate = true

        // Opacity: stays bright for first half, then dissolves — smooth cubic feel
        matRef.current.opacity = Math.max(0, (1.0 - pt * pt) * 0.72)
        // Size: shrinks as particles dissolve — from 0.07 down to ~0.02
        matRef.current.size = Math.max(0.015, 0.07 * (1.0 - pt * 0.75))
      }
    }
  })

  if (!scryerTerritory) return null

  const ringPos: [number, number, number] = [
    scryerTerritory.position[0],
    getWorldY(scryerTerritory),
    scryerTerritory.position[2],
  ]

  return (
    <>
      {/* ── Burst ring ─────────────────────────────────────────────────────── */}
      <mesh
        ref={ringRef}
        position={ringPos}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <torusGeometry args={[0.9, 0.03, 8, 64]} />
        <meshBasicMaterial
          color="#00f3ff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/*
       * ── Particle dissolution cloud ───────────────────────────────────────
       * Points mesh at world origin — positions in buffer are absolute world-space.
       * Pre-allocated Float32Array mutated in-place each frame. Zero GC pressure.
       */}
      <points ref={pointsRef} visible={false}>
        <bufferGeometry ref={geomRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[positions.current, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={matRef}
          color="#00f3ff"
          size={0.07}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={true}
        />
      </points>
    </>
  )
}
