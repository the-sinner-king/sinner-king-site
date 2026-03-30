/**
 * OvmindRing.tsx — Expanding broadcast rings from THE_SCRYER on overmind events
 *
 * Architecture mirrors CoreLoreCascade in KingdomScene3D.tsx.
 * Pool of 3 pre-allocated torus meshes. On overmind signal event:
 *   - Assign to free pool slot (oldest recycled if all 3 active)
 *   - useFrame: expand ring 0→8 radius over 1.2s, fade opacity 0.7→0
 *   - When ring radius sweeps past a territory, flash that territory's emissive +20% for 300ms
 *
 * Territory brightening via module-level Map — no Zustand, no React state, no re-renders.
 * TerritoryNode reads overmindBrightBoost in its own useFrame.
 */

import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useKingdomStore } from '@/lib/kingdom-store'
import { TERRITORIES, TERRITORY_MAP, getWorldY } from '@/lib/kingdom-layout'

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const OVERMIND_RING_POOL     = 3
const OVERMIND_RING_DURATION = 1.2   // seconds
const OVERMIND_RING_MAX_RADIUS = 8
const OVERMIND_RING_TUBE     = 0.03
const OVERMIND_RING_SEGS     = 64
const OVERMIND_COLOR         = '#00f3ff'

const SCRYER_LAYOUT = TERRITORY_MAP['the_scryer']
const OVERMIND_ANCHOR: [number, number, number] = [
  SCRYER_LAYOUT.position[0],
  getWorldY(SCRYER_LAYOUT) + 0.06,
  SCRYER_LAYOUT.position[2],
]

// ---------------------------------------------------------------------------
// TERRITORY BRIGHT BOOST — module-level Map, no React state
// key = territory.id, value = expiry timestamp (Date.now() + 300ms)
// TerritoryNode reads this in its own useFrame — no subscription, no re-renders
// ---------------------------------------------------------------------------

export const overmindBrightBoost = new Map<string, number>()

// ---------------------------------------------------------------------------
// PRE-COMPUTED TERRITORY DISTANCES FROM SCRYER (XZ plane)
//
// PERF: Territory positions are module-level constants — they never change at runtime.
// Computing Math.sqrt(dx*dx + dz*dz) for all 6 territories inside useFrame was
// running those sqrt calls on every frame during ring animation. Pre-compute once.
// ---------------------------------------------------------------------------

const TERRITORY_SCRYER_DISTS = TERRITORIES.map((t) => {
  const dx = t.position[0] - SCRYER_LAYOUT.position[0]
  const dz = t.position[2] - SCRYER_LAYOUT.position[2]
  return Math.sqrt(dx * dx + dz * dz)
})

// ---------------------------------------------------------------------------
// OVERMIND WAVE POOL
// ---------------------------------------------------------------------------

interface OvmindWave {
  active: boolean
  startTime: number  // clock.elapsedTime at spawn
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export function OvmindRing() {
  const pool = useRef<OvmindWave[]>(
    Array.from({ length: OVERMIND_RING_POOL }, () => ({ active: false, startTime: 0 }))
  )
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: OVERMIND_RING_POOL }, () => null)
  )
  const clockRef = useRef(0)   // updated every frame so useEffect can read clock time
  const lastEventCount = useRef(0)

  const recentSignalEvents = useKingdomStore((s) => s.recentSignalEvents)

  // Detect new overmind events and spawn rings
  useEffect(() => {
    const overmindEvents = recentSignalEvents.filter((e) => e.type === 'overmind')
    const newCount = overmindEvents.length

    if (newCount <= lastEventCount.current) {
      lastEventCount.current = newCount
      return
    }

    const newEventCount = newCount - lastEventCount.current
    lastEventCount.current = newCount

    const waves = pool.current
    const now = clockRef.current

    for (let n = 0; n < newEventCount; n++) {
      // Find a free slot
      let slot = waves.findIndex((w) => !w.active)

      // If all active, recycle the one that started earliest (oldest)
      if (slot === -1) {
        let oldestTime = Infinity
        let oldestIdx = 0
        for (let i = 0; i < OVERMIND_RING_POOL; i++) {
          if (waves[i].startTime < oldestTime) {
            oldestTime = waves[i].startTime
            oldestIdx = i
          }
        }
        slot = oldestIdx
      }

      waves[slot].active = true
      waves[slot].startTime = now
    }
  }, [recentSignalEvents])

  useFrame(({ clock }) => {
    clockRef.current = clock.elapsedTime
    const now = clock.elapsedTime

    const waves = pool.current
    const meshes = meshRefs.current

    for (let i = 0; i < OVERMIND_RING_POOL; i++) {
      const wave = waves[i]
      const mesh = meshes[i]
      if (!mesh) continue

      if (!wave.active) {
        mesh.scale.set(0, 0, 0)
        continue
      }

      const progress = (now - wave.startTime) / OVERMIND_RING_DURATION

      if (progress >= 1) {
        wave.active = false
        mesh.scale.set(0, 0, 0)
        continue
      }

      const radius = progress * OVERMIND_RING_MAX_RADIUS
      const opacity = 0.7 * (1 - progress)

      // Flat ring on XZ plane — scale X and Z, keep Y=1
      mesh.scale.set(radius, radius, 1)

      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.opacity = opacity
      }

      // Territory brightening — when ring sweeps past a territory, flash emissive +20%
      // PERF: distXZ values are pre-computed at module scope (territory positions are constant).
      for (let ti = 0; ti < TERRITORIES.length; ti++) {
        if (Math.abs(radius - TERRITORY_SCRYER_DISTS[ti]) < 0.8) {
          overmindBrightBoost.set(TERRITORIES[ti].id, Date.now() + 300)
        }
      }
    }
  })

  return (
    <group position={OVERMIND_ANCHOR}>
      {Array.from({ length: OVERMIND_RING_POOL }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el }}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[0, 0, 0]}
        >
          <torusGeometry args={[1, OVERMIND_RING_TUBE, 3, OVERMIND_RING_SEGS]} />
          <meshStandardMaterial
            color={OVERMIND_COLOR}
            emissive={OVERMIND_COLOR}
            emissiveIntensity={2.0}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
