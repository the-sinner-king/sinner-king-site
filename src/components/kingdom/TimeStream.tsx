'use client'

/**
 * TimeStream.tsx
 *
 * Data cables running across the terrain toward THE_SCRYER.
 *
 * Each beam is a FIXED wire laid on the ground — a CatmullRomCurve with
 * two gentle lateral bends, endpoints and midpoints pinned to terrain height
 * so the wire hugs the landscape. The shape is baked to a position LUT at
 * mount and never changes.
 *
 * Particles travel along the wire at a uniform speed — like water in a creek.
 * No faster/slower particles in the same beam. All particles in all active
 * beams move at the same rate. Status multiplier still applies:
 *   active  → full FLOW_SPEED
 *   idle    → 0.35× (trickle)
 *   offline → frozen
 *
 * Performance:
 *   - LUT pre-baked at mount (128 pts per beam): zero allocations in useFrame
 *   - CatmullRomCurve3 object GC'd after LUT is built — not stored
 *   - Particles evenly distributed [0, 1/N, 2/N, …] for uniform creek density
 *
 * Uses useEffect + scene.add/remove (not useMemo) to survive React Strict Mode
 * double-invocation without breaking the geometry ref sync.
 */

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useKingdomStore } from '@/lib/kingdom-store'
import { TERRITORY_MAP, SCRYER_BEAMS, getTerrainY } from '@/lib/kingdom-layout'

// Deterministic LCG seeded from beam IDs — stable wire shapes across remounts
function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = Math.imul((h << 5) + h, 1) ^ s.charCodeAt(i)
  return h >>> 0
}
function seededRand(seed: number) {
  let s = seed
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 12     // per beam
const FLOW_SPEED     = 0.055  // progress/sec at full speed (~18s to traverse)
const LUT_POINTS     = 128    // baked curve resolution — smooth, cheap
const WIRE_HEIGHT    = 0.08   // units above terrain surface (wire just off ground)
const SNAKE_AMP      = 0.55   // max lateral offset for each bend (±0.55 units)

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface Particle {
  progress: number   // 0–1 along wire
}

interface Beam {
  lut:       Float32Array         // baked [x,y,z] positions (LUT_POINTS × 3)
  geometry:  THREE.BufferGeometry
  material:  THREE.PointsMaterial
  mesh:      THREE.Points
  particles: Particle[]
  sourceId:  string
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export function TimeStream() {
  const { scene } = useThree()
  const beams     = useRef<Beam[]>([])

  useEffect(() => {
    const built: Beam[] = []

    SCRYER_BEAMS.forEach(([fromId, toId]) => {
      const from = TERRITORY_MAP[fromId]
      const to   = TERRITORY_MAP[toId]
      if (!from || !to) return

      // ── Build wire path ─────────────────────────────────────────────────
      // Endpoints pinned to terrain surface (not territory center).
      // Two intermediate waypoints with lateral snake offsets, also pinned
      // to terrain height so the wire lays across the landscape.

      const fx = from.position[0], fz = from.position[2]
      const tx = to.position[0],   tz = to.position[2]

      const fromVec = new THREE.Vector3(fx, getTerrainY(fx, fz) + WIRE_HEIGHT, fz)
      const toVec   = new THREE.Vector3(tx, getTerrainY(tx, tz) + WIRE_HEIGHT, tz)

      // Perpendicular in XZ plane for lateral bends
      const dx   = tx - fx, dz = tz - fz
      const len  = Math.sqrt(dx * dx + dz * dz) || 1
      const px   = -dz / len, pz = dx / len       // unit perp vector

      // Deterministic lateral offsets — seeded from beam IDs so wire shape is stable
      // across page loads, HMR, and React Strict Mode double-mounts.
      const rand = seededRand(hashStr(fromId + toId))
      const s1 = (rand() < 0.5 ? 1 : -1) * (SNAKE_AMP * 0.6 + rand() * SNAKE_AMP * 0.4)
      const s2 = (rand() < 0.5 ? 1 : -1) * (SNAKE_AMP * 0.6 + rand() * SNAKE_AMP * 0.4)

      const m1x = fx + dx * 0.35 + px * s1
      const m1z = fz + dz * 0.35 + pz * s1
      const m2x = fx + dx * 0.70 + px * s2
      const m2z = fz + dz * 0.70 + pz * s2

      const mid1 = new THREE.Vector3(m1x, getTerrainY(m1x, m1z) + WIRE_HEIGHT, m1z)
      const mid2 = new THREE.Vector3(m2x, getTerrainY(m2x, m2z) + WIRE_HEIGHT, m2z)

      // CatmullRom gives smooth cable-like curves through the four control points.
      // We immediately bake it into a flat LUT and let the curve object GC.
      const curve = new THREE.CatmullRomCurve3([fromVec, mid1, mid2, toVec])

      const lut = new Float32Array(LUT_POINTS * 3)
      for (let i = 0; i < LUT_POINTS; i++) {
        const pt = curve.getPoint(i / (LUT_POINTS - 1))
        lut[i * 3]     = pt.x
        lut[i * 3 + 1] = pt.y
        lut[i * 3 + 2] = pt.z
      }

      // ── Particles evenly spaced along wire ──────────────────────────────
      // Uniform spacing = constant creek density (no bunching or gaps)
      const particles: Particle[] = []
      const positions = new Float32Array(PARTICLE_COUNT * 3)

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const progress = i / PARTICLE_COUNT
        particles.push({ progress })
        // Set initial positions from LUT
        const idx   = progress * (LUT_POINTS - 1)
        const i0    = Math.floor(idx)
        const i1    = Math.min(i0 + 1, LUT_POINTS - 1)
        const frac  = idx - i0
        positions[i * 3]     = lut[i0 * 3]     + (lut[i1 * 3]     - lut[i0 * 3])     * frac
        positions[i * 3 + 1] = lut[i0 * 3 + 1] + (lut[i1 * 3 + 1] - lut[i0 * 3 + 1]) * frac
        positions[i * 3 + 2] = lut[i0 * 3 + 2] + (lut[i1 * 3 + 2] - lut[i0 * 3 + 2]) * frac
      }

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      const material = new THREE.PointsMaterial({
        color:           '#00f3ff',
        size:            0.12,
        sizeAttenuation: true,
        transparent:     true,
        opacity:         0.0,   // set each frame; start hidden
        blending:        THREE.AdditiveBlending,
        depthWrite:      false,
        fog:             false,
      })

      const mesh = new THREE.Points(geometry, material)
      scene.add(mesh)

      built.push({ lut, geometry, material, mesh, particles, sourceId: fromId })
    })

    beams.current = built

    return () => {
      built.forEach((b) => {
        scene.remove(b.mesh)
        b.geometry.dispose()
        b.material.dispose()
      })
      beams.current = []
    }
  }, [scene])

  useFrame((_state, delta) => {
    beams.current.forEach((beam) => {
      const positions    = beam.geometry.attributes.position.array as Float32Array
      const sourceStatus = useKingdomStore.getState().getStatus(beam.sourceId)

      // All particles in a beam move at the same speed — no variation.
      const speedMul =
        sourceStatus === 'active' ? 1.00 :
        sourceStatus === 'idle'   ? 0.35 :
        0.0

      beam.particles.forEach((p, i) => {
        if (speedMul > 0) {
          p.progress += delta * FLOW_SPEED * speedMul
          if (p.progress >= 1) p.progress -= 1
        }

        // LUT lookup with linear interpolation — zero allocations
        const idx  = p.progress * (LUT_POINTS - 1)
        const i0   = Math.floor(idx)
        const i1   = Math.min(i0 + 1, LUT_POINTS - 1)
        const frac = idx - i0
        const b0   = i0 * 3
        const b1   = i1 * 3
        positions[i * 3]     = beam.lut[b0]     + (beam.lut[b1]     - beam.lut[b0])     * frac
        positions[i * 3 + 1] = beam.lut[b0 + 1] + (beam.lut[b1 + 1] - beam.lut[b0 + 1]) * frac
        positions[i * 3 + 2] = beam.lut[b0 + 2] + (beam.lut[b1 + 2] - beam.lut[b0 + 2]) * frac
      })

      // Additive blending accumulates at THE_SCRYER — keep opacity modest
      beam.material.opacity = 0.08 + speedMul * 0.25
      beam.geometry.attributes.position.needsUpdate = true
    })
  })

  return null
}
