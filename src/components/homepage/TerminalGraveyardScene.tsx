'use client'

/**
 * TERMINAL GRAVEYARD — sinner-king.com landing scene
 *
 * Design: Aeris (AExMUSE) — DESIGN_BIBLE + LANDING_PAGE_MASTER_PLAN
 * Build:  Claude (Claude's House) — Session #162
 *
 * A room full of dead machines glowing with the one screen that still matters.
 *
 * Aeris's prototype used three/webgpu + MeshStandardNodeMaterial → WebGPU black screen.
 * This build: standard WebGL, MeshStandardMaterial, same geometry and instancing logic.
 *
 * DO NOT TOUCH:
 *   - Color palette (Aeris's DESIGN_BIBLE)
 *   - Altar position/scale (she specified [0,-0.8,0], scale 1.6)
 *   - MonitorPile instancing logic (only way to hit 60fps at count=60)
 *   - Confetti fallSpeed (Aeris: "dust motes, not a blizzard")
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Html } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ── Palette (Aeris DESIGN_BIBLE) ──────────────────────────────────────────────
const VOID    = '#030303'
const AMBER   = '#ffcc00'
const ORCHID  = '#bf00ff'
const BONE    = '#e8e0d0'

// ── VintageMonitor ────────────────────────────────────────────────────────────
// Ported from Aeris's VintageMonitor.jsx. Accepts children for screen content.
function VintageMonitor({
  position,
  rotation = [0, 0, 0] as [number, number, number],
  scale = 1,
  screenColor = AMBER,
  intensity = 2,
  children,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  screenColor?: string
  intensity?: number
  children?: React.ReactNode
}) {
  const casingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#111111',
    roughness: 0.4,
    metalness: 0.8,
  }), [])

  const screenMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: screenColor,
    emissive: screenColor,
    emissiveIntensity: intensity,
    roughness: 0.1,
    metalness: 0.9,
    opacity: 0.9,
    transparent: true,
  }), [screenColor, intensity])

  useEffect(() => {
    return () => {
      casingMat.dispose()
      screenMat.dispose()
    }
  }, [casingMat, screenMat])

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* MONITOR CASING */}
      <mesh material={casingMat}>
        <boxGeometry args={[1, 1, 0.8]} />
      </mesh>

      {/* THE GLASS SCREEN */}
      <mesh position={[0, 0, 0.41]} material={screenMat}>
        <planeGeometry args={[0.85, 0.75]} />
      </mesh>

      {/* SCREEN GLOW — point light from inside the bezel */}
      <pointLight position={[0, 0, 0.6]} distance={4} intensity={1.5} color={screenColor} />

      {children}
    </group>
  )
}

// ── MonitorPile ───────────────────────────────────────────────────────────────
// Instanced graveyard — 60 dead machines. Ported from Aeris's MonitorPile.jsx.
// MeshStandardNodeMaterial → MeshStandardMaterial (WebGL compatible).
function MonitorPile({ count = 60 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)

  const casingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#111111',
    roughness: 0.4,
    metalness: 0.8,
  }), [])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  const instances = useMemo(() => {
    // Seed the layout so it doesn't regenerate on re-render
    const seeded = (n: number) => Math.sin(n * 127.1 + 311.7) * 0.5 + 0.5
    return Array.from({ length: count }, (_, i) => ({
      position: [
        (seeded(i * 3)     - 0.5) * 25,
        (seeded(i * 3 + 1) - 0.5) * 10 - 5,
        (seeded(i * 3 + 2) - 0.5) * 20 - 10,
      ] as [number, number, number],
      rotation: [
        seeded(i * 7)     * Math.PI * 0.2,
        seeded(i * 7 + 1) * Math.PI * 2,
        (seeded(i * 7 + 2) - 0.5) * 0.5,
      ] as [number, number, number],
      scale: 0.5 + seeded(i * 13) * 0.8,
    }))
  }, [count])

  useEffect(() => {
    instances.forEach((inst, i) => {
      dummy.position.set(...inst.position)
      dummy.rotation.set(...inst.rotation)
      dummy.scale.setScalar(inst.scale)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [instances, dummy])

  useEffect(() => {
    return () => casingMat.dispose()
  }, [casingMat])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
      <boxGeometry args={[1, 1, 0.8]} />
      <primitive object={casingMat} attach="material" />
    </instancedMesh>
  )
}

// ── ConfettiBlizzard ──────────────────────────────────────────────────────────
// Rejection letters, falling like dust motes in an abandoned church.
// Aeris: opacity 0.2, fallSpeed slowed. Ported from ConfettiBlizzard.jsx.
function ConfettiBlizzard({ count = 150 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const dummy   = useMemo(() => new THREE.Object3D(), [])

  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BONE,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.2,  // Aeris: dust motes, not a blizzard
  }), [])

  const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x:          (Math.sin(i * 1.7) * 0.5 + 0.5 - 0.5) * 20,
    y:          (Math.sin(i * 3.1) * 0.5 + 0.5) * 20,
    z:          (Math.sin(i * 5.3) * 0.5 + 0.5 - 0.5) * 15,
    rotSpeed:   (Math.sin(i * 2.9) * 0.5 + 0.5 - 0.5) * 0.02,
    fallSpeed:  0.004 + (Math.sin(i * 7.1) * 0.5 + 0.5) * 0.008,
  })), [count])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    particles.forEach((p, i) => {
      p.y -= p.fallSpeed
      if (p.y < -10) p.y = 15
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(t * p.rotSpeed, t * p.rotSpeed, 0)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  useEffect(() => () => mat.dispose(), [mat])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} material={mat}>
      <planeGeometry args={[0.08, 0.12]} />
    </instancedMesh>
  )
}

// ── GhostText ─────────────────────────────────────────────────────────────────
// Delay-type animation. Text bleeds onto the altar screen like a ghost typing.
// Aeris: "the text should feel like it's being bled onto the screen"
function GhostText() {
  const [displayed, setDisplayed] = useState('')
  const target = 'SINNER_KING.COM'

  useEffect(() => {
    let i = 0
    // Start after a short delay so the room loads first
    const start = setTimeout(() => {
      const tick = setInterval(() => {
        i++
        setDisplayed(target.slice(0, i))
        if (i >= target.length) clearInterval(tick)
      }, 110)
      return () => clearInterval(tick)
    }, 1200)
    return () => clearTimeout(start)
  }, [])

  return (
    <Html
      position={[0, 0, 0.43]}
      center
      transform
      scale={0.065}
      style={{
        color: AMBER,
        fontFamily: '"IBM Plex Mono", "Courier New", Courier, monospace',
        fontSize: '18px',
        fontWeight: 700,
        letterSpacing: '0.3em',
        textShadow: `0 0 12px ${AMBER}, 0 0 24px ${AMBER}`,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {displayed}
      <span style={{ animation: 'blink 0.8s step-end infinite' }}>_</span>
    </Html>
  )
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene() {
  return (
    <>
      <color attach="background" args={[VOID]} />

      {/* AMBIENT — the graveyard is nearly dark */}
      <ambientLight intensity={0.12} />

      {/* ALTAR LIGHT — the one source of life in the room */}
      <pointLight position={[0, -0.5, 2.5]} distance={14} intensity={4} color={AMBER} />

      {/* ORCHID ACCENT — Aeris's signal color from the void */}
      <pointLight position={[-8, 2, -6]} distance={18} intensity={1} color={ORCHID} />

      {/* THE GRAVEYARD — 60 dead machines, haphazard shrine */}
      <MonitorPile count={60} />

      {/* THE ALTAR — the one screen that still matters */}
      <Float speed={1.5} rotationIntensity={0.08} floatIntensity={0.25}>
        <VintageMonitor
          position={[0, -0.8, 0]}
          scale={1.6}
          screenColor={AMBER}
          intensity={2.5}
        >
          <GhostText />
        </VintageMonitor>
      </Float>

      {/* DUST — rejection letters, slow as snowfall in an abandoned church */}
      <ConfettiBlizzard count={150} />

      {/* POST-PROCESSING */}
      <EffectComposer>
        <Bloom intensity={1.0} luminanceThreshold={0.35} luminanceSmoothing={0.85} mipmapBlur />
        <Vignette offset={0.3} darkness={0.75} />
      </EffectComposer>
    </>
  )
}

// ── TerminalGraveyardScene ────────────────────────────────────────────────────
// Exported component. SSR guard + Canvas shell.
export function TerminalGraveyardScene() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: VOID,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'oklch(0.87 0.21 192 / 0.40)',
        fontFamily: 'monospace',
        fontSize: '11px',
        letterSpacing: '0.3em',
      }}>
        INITIALIZING SIGNAL...
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: VOID }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 6], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        shadows
      >
        <Scene />
      </Canvas>
    </div>
  )
}
