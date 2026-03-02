'use client'

/**
 * SceneEffects — Visual atmosphere layer for the homepage tunnel.
 *
 * Exports:
 *   PostProcessingEffects  — Bloom + Vignette (inside Canvas)
 *   TunnelFormation        — Particles explode from origin on mount
 *   WarpLines              — Radial velocity lines on fast scroll
 *   GlitchText             — HTML text that decodes on mount
 *
 * Session: 149 / DRONE A (SHIMMER)
 */

import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useScroll } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, DepthOfField } from '@react-three/postprocessing'
import * as THREE from 'three'

// ── Post-Processing ─────────────────────────────────────────────────────────
// Bloom makes bright particles glow. Vignette frames the tunnel.
export function PostProcessingEffects() {
  return (
    <EffectComposer>
      <DepthOfField
        focusDistance={0}
        focalLength={0.02}
        bokehScale={2}
        height={480}
      />
      <Bloom
        luminanceThreshold={0.15}
        luminanceSmoothing={0.9}
        intensity={0.8}
        mipmapBlur
      />
      <Vignette darkness={0.5} offset={0.1} />
    </EffectComposer>
  )
}

// ── Tunnel Formation ────────────────────────────────────────────────────────
// On mount, 300 particles explode from [0,0,0] to their final positions
// over 1.5 seconds with cubic ease-out. After settling, behaves like
// the standard TunnelParticles (slow z-rotation).
export function TunnelFormation() {
  const pointsRef = useRef<THREE.Points>(null)
  const animTime = useRef(0)
  const settled = useRef(false)

  const { finalPositions, colors, geo } = useMemo(() => {
    const count = 300
    const finals = new Float32Array(count * 3)
    const cols = new Float32Array(count * 3)
    const palette = [
      new THREE.Color('#7000ff'),
      new THREE.Color('#00f3ff'),
      new THREE.Color('#ff006e'),
      new THREE.Color('#3a0090'),
    ]
    for (let i = 0; i < count; i++) {
      finals[i * 3]     = (Math.random() - 0.5) * 10
      finals[i * 3 + 1] = (Math.random() - 0.5) * 10
      finals[i * 3 + 2] = -(Math.random() * 56 + 2)
      const c = palette[Math.floor(Math.random() * palette.length)]
      cols[i * 3]     = c.r
      cols[i * 3 + 1] = c.g
      cols[i * 3 + 2] = c.b
    }
    const g = new THREE.BufferGeometry()
    // Start all positions at origin
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    return { finalPositions: finals, colors: cols, geo: g }
  }, [])

  useEffect(() => () => geo.dispose(), [geo])

  useFrame((_, delta) => {
    if (!pointsRef.current) return

    if (!settled.current) {
      animTime.current += delta
      const progress = Math.min(animTime.current / 1.5, 1)
      // Cubic ease-out
      const t = 1 - Math.pow(1 - progress, 3)

      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
      const pos = posAttr.array as Float32Array
      for (let i = 0; i < pos.length; i++) {
        pos[i] = THREE.MathUtils.lerp(0, finalPositions[i], t)
      }
      posAttr.needsUpdate = true

      if (progress >= 1) {
        settled.current = true
      }
    }

    // Slow rotation (same as original TunnelParticles)
    pointsRef.current.rotation.z += delta * 0.01
  })

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        size={0.025}
        vertexColors
        transparent
        opacity={0.45}
        sizeAttenuation
      />
    </points>
  )
}

// ── Warp Lines ──────────────────────────────────────────────────────────────
// 16 radial velocity lines from center. Opacity tied to scroll velocity.
// Only visible during fast scrolling — creates a hyperspace feel.
export function WarpLines() {
  const scroll = useScroll()
  const groupRef = useRef<THREE.Group>(null)

  const lineObjects = useMemo(() => {
    const count = 16
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2
      const x = Math.cos(angle)
      const y = Math.sin(angle)
      const points = [
        new THREE.Vector3(x * 0.3, y * 0.3, -2),
        new THREE.Vector3(x * 6, y * 6, -8),
      ]
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const mat = new THREE.LineBasicMaterial({ color: '#7000ff', transparent: true, opacity: 0 })
      return new THREE.Line(geo, mat)
    })
  }, [])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    lineObjects.forEach((l) => group.add(l))
    return () => {
      lineObjects.forEach((l) => {
        group.remove(l)
        l.geometry.dispose()
        ;(l.material as THREE.LineBasicMaterial).dispose()
      })
    }
  }, [lineObjects])

  useFrame(() => {
    const velocity = Math.abs(scroll.delta)
    const targetOpacity = Math.min(velocity * 120, 0.55)
    lineObjects.forEach((l) => {
      const mat = l.material as THREE.LineBasicMaterial
      mat.opacity += (targetOpacity - mat.opacity) * 0.2
    })
  })

  return <group ref={groupRef} />
}

// ── Glitch Text ─────────────────────────────────────────────────────────────
// HTML component: on mount, characters cycle through random glyphs then
// resolve left-to-right over 900ms. Supports line breaks via '\n'.
const GLITCH_CHARS = '!@#$%^&*░▒▓█▄▀■□▪▫◆◇○●'

export function GlitchText({
  text,
  className,
  style,
}: {
  text: string
  className?: string
  style?: React.CSSProperties
}) {
  const [display, setDisplay] = useState(
    text.replace(/[^\n ]/g, () => GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)])
  )
  const [glitching, setGlitching] = useState(true)

  useEffect(() => {
    if (!glitching) return
    let elapsed = 0
    const duration = 900
    const interval = setInterval(() => {
      elapsed += 40
      const progress = elapsed / duration
      const resolved = Math.floor(progress * text.length)
      setDisplay(
        text
          .split('')
          .map((char, i) => {
            if (char === '\n' || char === ' ') return char
            if (i < resolved) return char
            return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
          })
          .join('')
      )
      if (elapsed >= duration) {
        setDisplay(text)
        setGlitching(false)
        clearInterval(interval)
      }
    }, 40)
    return () => clearInterval(interval)
  }, [glitching, text])

  // Split on newlines to produce <br /> elements
  const parts = display.split('\n')

  return (
    <span style={style} className={className}>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && <br />}
        </span>
      ))}
    </span>
  )
}
