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

// Shared state: FlyToController writes, other components read.
// - slowOrbitActive: prevents CinematicOrbit from engaging (B5 fix)
// - flyProgress: 0→1 during fly-in, panel uses this to coordinate fade-in
export const flyToState = { slowOrbitActive: false, flyProgress: 0 }

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
          // B2: Skip update() here — FlyToController's useFrame will be the first
          // to touch the camera on the next frame, preventing the 1-2 frame orientation
          // twitch caused by OrbitControls' damping engine reconciling stale spherical state.
        }
      }
    }

    // Drag detection — only fires when mouse moves while a button is held
    let pointerHeld = false
    const onPointerDown   = () => { pointerHeld = true }
    const onPointerUp     = () => { pointerHeld = false }
    const onPointerCancel = () => { pointerHeld = false }
    const onPointerMove   = () => { if (pointerHeld) pauseOrbit() }

    // WASD only — not every keydown (close buttons, shortcuts, etc.)
    const onKeyDown = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd'].includes(e.key.toLowerCase())) pauseOrbit()
    }

    window.addEventListener('pointerdown',   onPointerDown)
    window.addEventListener('pointerup',     onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('pointermove',   onPointerMove)
    window.addEventListener('wheel',         pauseOrbit, { passive: true })
    window.addEventListener('keydown',       onKeyDown)
    return () => {
      window.removeEventListener('pointerdown',   onPointerDown)
      window.removeEventListener('pointerup',     onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('pointermove',   onPointerMove)
      window.removeEventListener('wheel',         pauseOrbit)
      window.removeEventListener('keydown',       onKeyDown)
    }
  }, [orbitRef])

  const IDLE_MS    = 15000  // ms of stillness before cinematic engages (15s)
  const ORBIT_SPD  = 0.040  // rad/s horizontal — full lap in ~157s (~2.6 min)
  const VERT_FREQ  = 0.027  // rad/s vertical wave — full cycle ~233s (~3.9 min)
  const VERT_AMP   = 0.20   // ± radians of elevation swing (≈ ±11°)
  const PHI_BASE   = 0.85   // polar angle base — ~41° above horizon

  useFrame(({ clock }, delta) => {
    if (Date.now() - cs.current.lastInteraction < IDLE_MS) return
    // B5: Don't engage while FlyToController's slow orbit is active
    if (flyToState.slowOrbitActive) return

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
// FLY-TO CONTROLLER (v2 — S207 Opus audit rewrite)
//
// When the user clicks a territory, smoothly flies the camera and orbit pivot
// toward that territory using a cubic ease-out curve (~1.8s).
//
// Fixes applied (Opus red flag audit S207):
//   A1: OrbitControls disabled during FLYING — no damping fight
//   A2: Cubic ease-out replaces aggressive exponential — smooth arc, not jump-then-ooze
//   A3: No one-frame gap — slow orbit begins on same frame as convergence
//   A4: Gaze leads position — look-target converges faster than camera for cinematic feel
//   A5: Time-based progress — no world-space convergence threshold
//   B1: Return-to-overview on deselect — camera flies back to overview position
//   B5: CinematicOrbit guard — checks flyto slow orbit before engaging
//
// Four-phase lifecycle:
//   FLYING   → cubic ease-out toward targetPos/targetLook (~1.8s)
//   ORBITING → slow circular orbit around selected territory (~0.008 rad/s)
//   RETURNING → cubic ease-out back to overview position (~1.8s) on deselect
//   STOPPED  → user dragged/scrolled, or idle
// ---------------------------------------------------------------------------

const SLOW_ORBIT_SPD = 0.006  // rad/s — gentle orbit at ground level
const FLY_DURATION   = 2.2    // seconds — slightly longer for dramatic low-angle approach

export function FlyToController({ orbitRef }: WASDProps) {
  const { camera } = useThree()

  const fly = useRef({
    phase: 'stopped' as 'flying' | 'orbiting' | 'returning' | 'stopped',
    // Fly-in state
    startPos:   new THREE.Vector3(),
    startLook:  new THREE.Vector3(),
    targetPos:  new THREE.Vector3(),
    targetLook: new THREE.Vector3(),
    startTime:  0,
    // Return-to-overview state
    overviewPos:  new THREE.Vector3(10, 14, 14),  // default overview camera position
    overviewLook: new THREE.Vector3(0, 0.5, 0),   // CINEMATIC_TARGET
    // Slow orbit
    slowOrbit: {
      theta:       0,
      radius:      10,
      pausedByUser: false,
      arrivedAt:   0,  // timestamp when orbit phase began — orbit starts after 2s delay
    },
    orbitDisabledByUs: false,
  })

  // Scratch — zero alloc per frame
  const _horizOffset = useMemo(() => new THREE.Vector3(), [])
  const _soOffset    = useMemo(() => new THREE.Vector3(), [])

  const selectedId = useKingdomStore((s) => s.selectedId)

  // Pause slow orbit on drag/scroll
  useEffect(() => {
    let pointerHeld = false
    const onDown   = () => { pointerHeld = true }
    const onUp     = () => { pointerHeld = false }
    const onCancel = () => { pointerHeld = false }
    const releaseOrbit = () => {
      fly.current.slowOrbit.pausedByUser = true
      if (orbitRef.current && fly.current.orbitDisabledByUs) {
        orbitRef.current.enabled = true
        fly.current.orbitDisabledByUs = false
        flyToState.slowOrbitActive = false
      }
    }
    const onMove = () => { if (pointerHeld) releaseOrbit() }

    window.addEventListener('pointerdown',   onDown)
    window.addEventListener('pointerup',     onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('pointermove',   onMove)
    window.addEventListener('wheel',         releaseOrbit, { passive: true })
    return () => {
      window.removeEventListener('pointerdown',   onDown)
      window.removeEventListener('pointerup',     onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('pointermove',   onMove)
      window.removeEventListener('wheel',         releaseOrbit)
    }
  }, [])

  useEffect(() => {
    // Release OrbitControls ownership on any selection change
    if (fly.current.orbitDisabledByUs && orbitRef.current) {
      orbitRef.current.enabled = true
      fly.current.orbitDisabledByUs = false
      flyToState.slowOrbitActive = false
    }

    if (!selectedId) {
      // B1: Deselect → fly back to overview (if we were close to a territory)
      if (fly.current.phase === 'flying' || fly.current.phase === 'orbiting') {
        fly.current.startPos.copy(camera.position)
        fly.current.startLook.copy(fly.current.targetLook)
        fly.current.targetPos.copy(fly.current.overviewPos)
        fly.current.targetLook.copy(fly.current.overviewLook)
        fly.current.startTime = -1  // sentinel: set on first frame
        fly.current.phase = 'returning'
        // Disable OrbitControls during return flight (A1)
        if (orbitRef.current) {
          orbitRef.current.enabled = false
          fly.current.orbitDisabledByUs = true
        }
      } else {
        fly.current.phase = 'stopped'
      }
      flyToState.slowOrbitActive = false
      return
    }

    const layout = TERRITORY_MAP[selectedId]
    if (!layout) return

    const [px, , pz] = layout.position
    const worldY     = getWorldY(layout)

    // Look target — slightly above the building's top. Camera is LOW and tilts UP,
    // so the look target must be above the building to create the "standing in front
    // of a monument looking up" effect. The building looms above you.
    const newLook = new THREE.Vector3(px, worldY + 2.5, pz)

    // Save overview position on first fly (for return-to-overview)
    if (fly.current.phase === 'stopped' || fly.current.phase === 'returning') {
      fly.current.overviewPos.copy(camera.position)
      fly.current.overviewLook.copy(orbitRef.current?.target ?? CINEMATIC_TARGET)
    }

    // A2: Record start positions for time-based easing
    fly.current.startPos.copy(camera.position)
    fly.current.startLook.copy(orbitRef.current?.target ?? CINEMATIC_TARGET)

    // Camera destination: LOW ANGLE — near ground, looking UP at the building.
    // Back off 7 units horizontally, camera at worldY + 1.2 (just above terrain).
    // The look target at worldY+2.5 is ABOVE the camera → tilt-up framing.
    // This creates the "standing in front of a monument" feeling.
    _horizOffset.set(camera.position.x - px, 0, camera.position.z - pz)
    if (_horizOffset.length() > 0.1) _horizOffset.normalize()
    else _horizOffset.set(1, 0, 0)

    fly.current.targetPos.set(px + _horizOffset.x * 7, worldY + 1.2, pz + _horizOffset.z * 7)
    fly.current.targetLook.copy(newLook)
    fly.current.startTime = -1  // sentinel: set on first frame
    fly.current.phase = 'flying'
    fly.current.slowOrbit.pausedByUser = false
    flyToState.slowOrbitActive = false

    // A1: Disable OrbitControls immediately — no damping fight during flight
    if (orbitRef.current) {
      orbitRef.current.enabled = false
      fly.current.orbitDisabledByUs = true
    }
  }, [selectedId, camera, _horizOffset])

  useFrame(({ clock }, delta) => {
    if (!orbitRef.current) return
    // Don't fight CinematicOrbit — unless we own the disable
    if (!orbitRef.current.enabled && !fly.current.orbitDisabledByUs) return

    const f = fly.current

    // ── PHASE 1: FLYING / RETURNING ─────────────────────────────────────
    if (f.phase === 'flying' || f.phase === 'returning') {
      // Set start time on first frame (avoids stale clock from useEffect)
      if (f.startTime < 0) f.startTime = clock.elapsedTime

      const elapsed  = clock.elapsedTime - f.startTime
      const progress = Math.min(elapsed / FLY_DURATION, 1.0)

      // Expose progress so the detail panel can coordinate its entrance
      flyToState.flyProgress = progress

      // A2: Cubic ease-out — smooth departure, fast middle, gentle arrival
      const easedPos  = 1 - Math.pow(1 - progress, 3)
      // A4: Gaze leads position — quartic converges faster, camera "looks first"
      const easedLook = 1 - Math.pow(1 - progress, 4.5)

      // A1: Direct camera writes — OrbitControls is disabled, no fight
      camera.position.lerpVectors(f.startPos, f.targetPos, easedPos)
      orbitRef.current.target.lerpVectors(f.startLook, f.targetLook, easedLook)
      camera.lookAt(orbitRef.current.target)

      // A5: Time-based completion — no world-space threshold needed
      if (progress >= 1.0) {
        if (f.phase === 'returning') {
          // Return complete — hand back to manual/cinematic
          f.phase = 'stopped'
          orbitRef.current.target.copy(f.targetLook)
          orbitRef.current.enabled = true
          f.orbitDisabledByUs = false
          flyToState.slowOrbitActive = false
          return
        }

        // A3: Enter slow orbit on SAME frame — no one-frame gap
        flyToState.flyProgress = 1
        camera.position.copy(f.targetPos)  // snap to exact destination
        _soOffset.subVectors(camera.position, f.targetLook)
        f.slowOrbit.theta  = Math.atan2(_soOffset.z, _soOffset.x)
        f.slowOrbit.radius = Math.sqrt(_soOffset.x * _soOffset.x + _soOffset.z * _soOffset.z)
        f.phase = 'orbiting'
        f.slowOrbit.arrivedAt = Date.now()
        flyToState.slowOrbitActive = true
        // OrbitControls stays disabled (orbitDisabledByUs already true from flight start)
        // Fall through to slow orbit below — no return
      } else {
        return  // still flying
      }
    }

    // ── PHASE 2: SLOW ORBIT ─────────────────────────────────────────────
    if (f.phase !== 'orbiting' || f.slowOrbit.pausedByUser) return

    // 2-second pause after arriving before orbit begins — let the visitor take in the view
    if (Date.now() - f.slowOrbit.arrivedAt < 2000) return

    f.slowOrbit.theta += SLOW_ORBIT_SPD * delta

    const camY = camera.position.y
    const look = f.targetLook

    camera.position.set(
      look.x + f.slowOrbit.radius * Math.cos(f.slowOrbit.theta),
      camY,
      look.z + f.slowOrbit.radius * Math.sin(f.slowOrbit.theta),
    )
    camera.lookAt(look)
  })

  return null
}
