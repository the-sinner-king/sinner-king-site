'use client'

/**
 * WorldDebugHUD — toggleable live debug overlay, rendered OUTSIDE the Canvas.
 *
 * Toggle with backtick (`). Shows camera state, FPS, frame health, and errors.
 * Uses setInterval to poll WorldDebugStore every 100ms — no React state in the
 * hot path, no useFrame dependency.
 *
 * If frameCount stops incrementing: the render loop stalled (useFrame not firing).
 * If rotX is not ≈ -1.571: camera orientation is wrong.
 * If zoom is 0 or NaN: camera.updateProjectionMatrix() may not have fired.
 */

import { useEffect, useState } from 'react'
import { WorldDebugStore } from './WorldDebugStore'

export function WorldDebugHUD() {
  const [visible, setVisible] = useState(false)
  const [snap, setSnap] = useState('')
  const [prevFrame, setPrevFrame] = useState(0)

  useEffect(() => {
    const toggle = (e: KeyboardEvent) => {
      if (e.key === '`') setVisible(v => !v)
    }
    window.addEventListener('keydown', toggle)
    return () => window.removeEventListener('keydown', toggle)
  }, [])

  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => {
      const s = WorldDebugStore
      const stalled = s.frameCount === prevFrame && s.frameCount > 0 ? ' ⚠ STALLED' : ''
      setPrevFrame(s.frameCount)

      const lines = [
        '⬡ WORLD DEBUG — ` to hide',
        '─────────────────────────────',
        `POS    x: ${Math.round(s.pos.x).toString().padStart(8)}  z: ${Math.round(s.pos.z).toString().padStart(8)}`,
        `ZOOM   ${s.zoom.toFixed(5)}`,
        `ROT.X  ${(s.rotX / Math.PI).toFixed(4)}π  (target: -0.5000π)`,
        `FRAME  ${s.frameCount}  fps: ${s.fps.toFixed(1)}  t: ${s.tick.toFixed(2)}s${stalled}`,
      ]

      if (s.errors.length > 0) {
        lines.push('─────────────────────────────')
        lines.push(`ERRORS (${s.errors.length}):`)
        s.errors.slice(-5).forEach(e => lines.push('  ' + e))
      }

      setSnap(lines.join('\n'))
    }, 100)
    return () => clearInterval(id)
  }, [visible, prevFrame])

  if (!visible) return null

  return (
    <div
      style={{
        position:    'fixed',
        top:         12,
        left:        12,
        zIndex:      99998,
        background:  'rgba(0, 3, 8, 0.88)',
        color:       '#00EEFF',
        fontFamily:  '"JetBrains Mono", "Fira Code", "Courier New", monospace',
        fontSize:    11,
        lineHeight:  1.8,
        padding:     '10px 14px',
        whiteSpace:  'pre',
        border:      '1px solid rgba(0, 238, 255, 0.25)',
        textShadow:  '0 0 6px rgba(0,238,255,0.35)',
        pointerEvents: 'none',
        borderRadius: 2,
        userSelect:  'none',
      }}
    >
      {snap}
    </div>
  )
}
