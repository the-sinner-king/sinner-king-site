'use client'

/**
 * WorldClient — dynamic import wrapper (ssr: false required for R3F Canvas)
 *
 * WebGL pre-flight check before mounting the Canvas.
 * If WebGL unavailable: show dark fallback instead of crashing.
 *
 * Law (inherited from kingdom-map): Error boundaries don't catch effect-phase
 * throws. Always gate Canvas on a synchronous WebGL availability check.
 */

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

const WorldScene = dynamic(
  () => import('@/components/world/WorldScene').then((m) => ({ default: m.WorldScene })),
  { ssr: false, loading: () => null }
)

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    )
  } catch {
    return false
  }
}

export function WorldClient() {
  const [webgl, setWebgl] = useState<boolean | null>(null)

  useEffect(() => {
    setWebgl(checkWebGL())
  }, [])

  if (webgl === null) return null

  if (!webgl) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#030109', color: '#4a1a8a',
        fontFamily: 'monospace', fontSize: '14px', letterSpacing: '0.1em',
      }}>
        webgl unavailable — the world cannot render here
      </div>
    )
  }

  return <WorldScene />
}
