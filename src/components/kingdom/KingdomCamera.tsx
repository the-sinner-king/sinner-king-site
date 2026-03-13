'use client'

/**
 * KingdomCamera.tsx — camera controller trio
 *
 * Extracted from KingdomScene3D.tsx (Loop 2, MAINTENANCE 2026-03-13).
 *
 * Owns:
 *   - WASDProps interface
 *   - CINEMATIC_TARGET constant
 *   - CinematicOrbit: auto-orbit after 15s idle, yields on user input
 *   - WASDControls: WASD pan + Q/E horizontal orbit
 *   - FlyToController: smooth camera fly-to on territory selection
 *
 * All three components accept `{ orbitRef }` and are pure side-effect (return null).
 * Rendered inside SceneContents which owns the OrbitControls ref.
 */

import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useKingdomStore } from '@/lib/kingdom-store'
import { TERRITORY_MAP, getWorldY } from '@/lib/kingdom-layout'

// ---------------------------------------------------------------------------
// SHARED TYPES + CONSTANTS
// ---------------------------------------------------------------------------

export interface WASDProps {
  orbitRef: React.RefObject<OrbitControlsImpl | null>
}

// Kingdom center — cinematic always orbits this point.
// Module-level const: zero allocations in render/frame loops.
export const CINEMATIC_TARGET = new THREE.Vector3(0, 0.5, 0)

// ---------------------------------------------------------------------------
// CINEMATIC ORBIT
// ---------------------------------------------------------------------------
// Slowly orbits the camera around the Kingdom on a non-planar path.
// The camera gently rises and falls while circling so the view is never flat.
//
// Lifecycle:
//   Load → 15s idle → cinematic engages (OrbitControls disabled)
//   User touches (pointer / wheel / key) → hands control back → 15s idle → repeats
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

export function CinematicOrbit({ orbitRef }: WASDProps) {
  const { camera } = useThree()

  // All per-frame mutable state in a single ref — no re-renders, no closures.
  // lastInteraction: 0 → orbit begins on the very first frame (no idle wait on arrival).
  const cs = useRef({
    theta:           0,
    radius:          22,
    phiTimeOffset:   0,   // clock offset so phi wave starts at current camera elevation (no jump)
    active:          false,
    lastInteraction: 0,
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

  // Only genuine navigation gestures pause cinematic — plain clicks pass through.
  // Drag (pointermove while button held), scroll (wheel), and WASD kill the orbit.
  // All other key/click events (territory clicks, close button, etc.) are ignored.
  useEffect(() => {
    const pauseOrbit = () => {
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

    // Drag detection — only fires when mouse moves while a button is held
    let pointerHeld = false
    const onPointerDown = () => { pointerHeld = true }
    const onPointerUp   = () => { pointerHeld = false }
    const onPointerMove = () => { if (pointerHeld) pauseOrbit() }

    // WASD only — not every keydown (close buttons, shortcuts, etc.)
    const onKeyDown = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd'].includes(e.key.toLowerCase())) pauseOrbit()
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup',   onPointerUp)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('wheel',       pauseOrbit, { passive: true })
    window.addEventListener('keydown',     onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup',   onPointerUp)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('wheel',       pauseOrbit)
      window.removeEventListener('keydown',     onKeyDown)
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

// ---------------------------------------------------------------------------
// WASD CONTROLS
// ---------------------------------------------------------------------------
// Pans both the camera and OrbitControls target together so orbit pivot follows.
// Forward/back = along the XZ-projected camera direction.
// Left/right = along camera's right vector.
// Q/E = horizontal orbit around the pivot (RTS-style).
// ---------------------------------------------------------------------------

export function WASDControls({ orbitRef }: WASDProps) {
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
// FLY-TO CONTROLLER
//
// When the user clicks a territory, smoothly lerps the camera and orbit pivot
// toward that territory over ~1.5s. Converts the map from "dashboard you watch"
// to "world you move through."
//
// Architecture:
//   - Subscribes to selectedId via useKingdomStore (React — triggers on click)
//   - useEffect computes targetPos + targetLook when selectedId changes
//   - useFrame lerps camera + orbitRef.target each frame until arrival
//   - Does NOT fight CinematicOrbit: the territory click fires onPointerDown
//     which pauseOrbit() catches first → OrbitControls re-enabled → fly runs.
//     The guard `if (!orbitRef.current.enabled) return` handles any race.
//   - No re-enable on deselect — user regains manual control immediately.
//
// Camera destination: approach azimuth preserved from click moment. Back off
// 10 units, elevate to worldY + 7. Orbit target = territory center + 0.5Y.
// ---------------------------------------------------------------------------

export function FlyToController({ orbitRef }: WASDProps) {
  const { camera } = useThree()

  const fly = useRef({
    active:     false,
    targetPos:  new THREE.Vector3(),
    targetLook: new THREE.Vector3(),
  })

  // Scratch — zero alloc per frame
  const _horizOffset = useMemo(() => new THREE.Vector3(), [])

  const selectedId = useKingdomStore((s) => s.selectedId)

  useEffect(() => {
    if (!selectedId) {
      fly.current.active = false
      return
    }
    const layout = TERRITORY_MAP[selectedId]
    if (!layout) return

    const [px, , pz] = layout.position
    const worldY     = getWorldY(layout)

    // Orbit target — slightly above territory center
    fly.current.targetLook.set(px, worldY + 0.5, pz)

    // Camera position: preserve current approach azimuth, back off 10 units, up 7
    _horizOffset.set(camera.position.x - px, 0, camera.position.z - pz)
    const horizDist = _horizOffset.length()
    if (horizDist > 0.1) _horizOffset.normalize()
    else _horizOffset.set(1, 0, 0)  // fallback if camera is directly overhead

    fly.current.targetPos.set(
      px + _horizOffset.x * 10,
      worldY + 7,
      pz + _horizOffset.z * 10,
    )
    fly.current.active = true
  }, [selectedId, camera, _horizOffset])

  useFrame((_, delta) => {
    if (!fly.current.active || !orbitRef.current) return
    // Don't fight CinematicOrbit — it disables OrbitControls while active
    if (!orbitRef.current.enabled) return

    // Exponential approach — 1 - 0.04^delta gives ~95% convergence in ~1.5s at 60fps
    const t = 1 - Math.pow(0.04, delta)

    camera.position.lerp(fly.current.targetPos, t)
    orbitRef.current.target.lerp(fly.current.targetLook, t)
    orbitRef.current.update()

    // Stop when within 0.3 world units of target (imperceptible remainder)
    if (camera.position.distanceToSquared(fly.current.targetPos) < 0.09) {
      fly.current.active = false
    }
  })

  return null
}
