'use client'

/**
 * WorldCamera — RTS input controller. Pure input, zero setup.
 *
 * Camera initialization (position, rotation, zoom, near, far) is owned entirely
 * by the Canvas `camera` prop in WorldScene. This component exists only to
 * respond to WASD and scroll wheel.
 *
 * Why rotation not lookAt:
 *   camera.lookAt() from directly above causes gimbal lock. The Canvas camera
 *   prop carries `rotation: [-π/2, 0, 0]` which tells R3F v9 to skip the
 *   default lookAt(0,0,0) call (checked in events-5a94e5eb.esm.js line 15631).
 *
 * Why pan speed ÷ zoom:
 *   Orthographic zoom scales the frustum, not the camera position. Without
 *   compensating, a zoomed-in camera would pan across a thousand units per
 *   keystroke while zoomed out. Dividing by zoom makes the apparent pan speed
 *   constant at all zoom levels.
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

const ZOOM_MIN   = 0.08   // ~24,000 world units visible at 1920px
const ZOOM_MAX   = 8.0    // ~240 world units visible — readable text distance
const ZOOM_START = 0.5    // ~3,840 world units visible — "above it all" default
const PAN_SPEED  = 900    // world units/sec at zoom=1

export function WorldCamera() {
  const { camera } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const zoomTarget = useRef(ZOOM_START)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      keys.current[e.key.toLowerCase()] = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false
    }
    const onWheel = (e: WheelEvent) => {
      // Scroll up = zoom in (larger zoom value = more magnification)
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      zoomTarget.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomTarget.current * factor))
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])

  useFrame((_, delta) => {
    const k  = keys.current
    const dt = Math.min(delta, 0.05)

    const speed = PAN_SPEED / camera.zoom
    if (k['w']) camera.position.z -= speed * dt
    if (k['s']) camera.position.z += speed * dt
    if (k['a']) camera.position.x -= speed * dt
    if (k['d']) camera.position.x += speed * dt

    // Smooth zoom via lerp — feels like momentum
    if (Math.abs(camera.zoom - zoomTarget.current) > 0.0005) {
      camera.zoom += (zoomTarget.current - camera.zoom) * 0.1
      camera.updateProjectionMatrix()
    }
  })

  return null
}
