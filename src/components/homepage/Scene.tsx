'use client'

/**
 * SCENE — main R3F scene root + all private WebGL helpers
 *
 * Contains everything that lives inside <Canvas>:
 *   CameraRig, Floor, VintageMonitor, NavMonitor, MonitorPile, ConfettiBlizzard,
 *   GhostText, CameraHUDReader, CameraSync, CameraFlyController, SnapshotSync
 *
 * Receives Leva stores + lights array from HomepageLanding (the orchestrator).
 * Calls useDebugControls for all Leva panel state.
 */

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Float, Html,
  MeshReflectorMaterial, RoundedBox,
  TransformControls, OrbitControls,
  useKeyboardControls,
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { useRouter } from 'next/navigation'
import * as THREE from 'three'
import { useStageStore } from '../../lib/stage-director-store'
import type { LightConfig, AssetSaved, MonitorSaved } from '../../lib/stage-director-store'
import { VOID, AMBER, CYAN, BONE, LAYOUT, type LevaStore, type SceneManifest } from './scene-constants'
import { useDebugControls } from './useDebugControls'
import { LightScene } from './LightScene'
import { SpriteAssetController } from './SpriteAssetController'

// ── CameraRig — rises from below, reveals the graveyard ──────────────────────
function CameraRig({ camY, camZ, lookY }: { camY: number; camZ: number; lookY: number }) {
  const DURATION = 5.5
  const startY = -2.5
  const startZ = 12

  useFrame(({ camera, clock }) => {
    const raw  = clock.getElapsedTime() / DURATION
    const t    = Math.min(raw, 1)
    const ease = 1 - Math.pow(1 - t, 3)

    camera.position.x = 0
    camera.position.y = THREE.MathUtils.lerp(startY, camY, ease)
    camera.position.z = THREE.MathUtils.lerp(startZ, camZ, ease)

    if (t >= 1) {
      const elapsed = clock.getElapsedTime()
      camera.position.y = camY + Math.sin(elapsed * 0.25) * 0.04
      camera.position.x = Math.sin(elapsed * 0.18) * 0.02
    }

    camera.lookAt(0, lookY, 0)
  })
  return null
}

// ── Floor — reflective void floor ────────────────────────────────────────────
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.0, 0]}>
      <planeGeometry args={[60, 60]} />
      <MeshReflectorMaterial
        blur={[400, 150]}
        resolution={512}
        mixBlur={1.2}
        mixStrength={1.8}
        roughness={1}
        depthScale={1.2}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#060606"
        metalness={0.6}
        mirror={0}
      />
    </mesh>
  )
}

// ── VintageMonitor — forwardRef exposes root group for TransformControls ──────
const VintageMonitor = forwardRef<
  THREE.Group,
  {
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: number
    colorRef?: React.RefObject<string>
    intensityRef?: React.RefObject<number>
    children?: React.ReactNode
  }
>(function VintageMonitor(
  { position, rotation = [0, 0, 0], scale = 1, colorRef, intensityRef, children },
  ref
) {
  const casingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0d0d0d', roughness: 0.6, metalness: 0.7,
  }), [])

  const screenMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: AMBER, emissive: AMBER, emissiveIntensity: 1.2,
    roughness: 0.05, metalness: 0.9, toneMapped: false, opacity: 0.95, transparent: true,
  }), [])

  const lightRef = useRef<THREE.PointLight>(null!)

  useFrame(() => {
    if (colorRef?.current) {
      screenMat.color.set(colorRef.current)
      screenMat.emissive.set(colorRef.current)
      if (lightRef.current) lightRef.current.color.set(colorRef.current)
    }
    if (intensityRef?.current !== undefined) {
      screenMat.emissiveIntensity = intensityRef.current
      if (lightRef.current) lightRef.current.intensity = intensityRef.current * 0.73
    }
  })

  useEffect(() => {
    return () => { casingMat.dispose(); screenMat.dispose() }
  }, [casingMat, screenMat])

  return (
    <group ref={ref} position={position} rotation={rotation} scale={scale}>
      <RoundedBox args={[1, 1, 0.8]} radius={0.06} smoothness={4} material={casingMat} castShadow />
      <mesh position={[0, 0, 0.41]} material={screenMat}>
        <planeGeometry args={[0.85, 0.75]} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0, 0.6]} distance={5} intensity={0.88} color={AMBER} />
      {children}
    </group>
  )
})

// ── NavScreenShader — one parametric shader, four animated personalities ──────
// variant 0=map (cyan bands), 1=dispatch (cascade), 2=archive (static), 3=cinema (grain)
// Additive blend over existing screenMat — glow is preserved, pattern layered on top.
const NAV_SCREEN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const NAV_SCREEN_FRAG = /* glsl */`
  precision mediump float;
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform int   uVariant;
  varying vec2  vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    float pat = 0.0;

    if (uVariant == 0) {
      // Map: topographic contour bands scrolling upward
      float h = sin(uv.x * 8.0 + uTime * 0.18) * 0.18 + uv.y;
      pat = sin(h * 13.0 - uTime * 0.55) * 0.5 + 0.5;
      pat *= smoothstep(0.35, 0.7, sin((uv.y * 11.0 - uTime * 0.35) * 3.14159) * 0.5 + 0.5);
      pat *= 0.65;
    } else if (uVariant == 1) {
      // Dispatch: matrix cascade columns
      float col   = floor(uv.x * 18.0);
      float speed = hash(vec2(col, 0.7)) * 1.6 + 0.5;
      float fall  = fract(uv.y + uTime * speed * 0.22 + hash(vec2(col, 1.3)));
      pat  = smoothstep(0.82, 1.0, fall) * 0.85;
      pat += smoothstep(0.55, 0.82, fall) * 0.25;
    } else if (uVariant == 2) {
      // Archive: CRT static with horizontal scanlines
      float tick = floor(uTime * 14.0);
      pat  = hash(uv * vec2(64.0, 42.0) + tick) * 0.55;
      float scan = fract(uv.y * 22.0 - uTime * 1.8);
      pat *= smoothstep(0.65, 0.95, scan) * 0.45 + 0.55;
    } else {
      // Cinema: slow film grain with radial vignette burn
      float grain = hash(uv + fract(uTime * 0.07)) * 0.45;
      float vig   = 1.0 - length((uv - 0.5) * 1.85);
      pat = grain * max(0.0, vig);
      pat += smoothstep(0.0, 0.3, sin(uTime * 0.9 + uv.y * 3.0) * 0.5 + 0.5) * 0.08;
    }

    gl_FragColor = vec4(uColor * uIntensity * pat, pat * 0.75);
  }
`

function NavScreenShader({
  variant,
  colorRef,
  intensityRef,
  selected,
  hoveredRef,
}: {
  variant:      0 | 1 | 2 | 3
  colorRef?:    React.RefObject<string>
  intensityRef?: React.RefObject<number>
  selected:     boolean
  hoveredRef:   React.RefObject<boolean>
}) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   NAV_SCREEN_VERT,
    fragmentShader: NAV_SCREEN_FRAG,
    uniforms: {
      uTime:      { value: 0 },
      uColor:     { value: new THREE.Color(CYAN) },
      uIntensity: { value: 1.0 },
      uVariant:   { value: variant },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), [variant])

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.getElapsedTime()
    if (colorRef?.current) mat.uniforms.uColor.value.set(colorRef.current)
    // Drive brightness via uIntensity — never mutate uColor so hue stays correct
    const base = selected ? 1.8 : (hoveredRef.current ? 1.2 : (intensityRef?.current ?? 0.28))
    mat.uniforms.uIntensity.value = Math.min(base / 0.28, 3.0)
  })

  useEffect(() => () => mat.dispose(), [mat])

  return (
    <mesh position={[0, 0, 0.415]} material={mat}>
      <planeGeometry args={[0.85, 0.75]} />
    </mesh>
  )
}

// ── NavMonitor — forwardRef exposes root group for TransformControls ──────────
const NavMonitor = forwardRef<
  THREE.Group,
  {
    href: string; label: string; sub: string
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: number
    colorRef?: React.RefObject<string>
    intensityRef?: React.RefObject<number>
    initialColor?: string
    debugMode?: boolean
    selected?: boolean
    onDebugSelect?: () => void
    variant?: 0 | 1 | 2 | 3
  }
>(function NavMonitor(
  {
    href, label, sub, position,
    rotation = [0, 0, 0],
    scale = 1,
    colorRef,
    intensityRef,
    initialColor,
    debugMode = false,
    selected = false,
    onDebugSelect,
    variant = 0,
  },
  ref
) {
  const router      = useRouter()
  const hoveredRef  = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [labelColor, setLabelColor] = useState(initialColor ?? CYAN)

  const casingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0d0d0d', roughness: 0.6, metalness: 0.7,
  }), [])

  const screenMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: CYAN, emissive: CYAN, emissiveIntensity: 0.28,
    roughness: 0.05, metalness: 0.9, toneMapped: false, opacity: 0.95, transparent: true,
  }), [])

  const lightRef = useRef<THREE.PointLight>(null!)

  useFrame(({ clock }) => {
    const t       = clock.getElapsedTime()
    const base    = selected ? 2.8 : (hoveredRef.current ? 1.65 : (intensityRef?.current ?? 0.28))
    const flicker = Math.sin(t * 7 + position[0] * 9.3) * 0.05
    screenMat.emissiveIntensity = base + flicker

    if (colorRef?.current) {
      screenMat.color.set(colorRef.current)
      screenMat.emissive.set(colorRef.current)
      if (lightRef.current) lightRef.current.color.set(colorRef.current)
    }

    if (lightRef.current) {
      lightRef.current.intensity = selected ? 3.5 : (hoveredRef.current ? 2.2 : 0.66)
      lightRef.current.distance  = selected ? 8   : (hoveredRef.current ? 7   : 4)
    }
  })

  useEffect(() => {
    return () => { casingMat.dispose(); screenMat.dispose() }
  }, [casingMat, screenMat])

  // Suppress unused warning — setLabelColor is wired but labelColor only drives HTML overlay
  void setLabelColor

  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation()
        if (debugMode) { onDebugSelect?.(); return }
        router.push(href)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        hoveredRef.current = true; setHovered(true)
        document.body.style.cursor = debugMode ? 'crosshair' : 'pointer'
      }}
      onPointerOut={() => {
        hoveredRef.current = false; setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      <RoundedBox args={[1, 1, 0.8]} radius={0.06} smoothness={4} material={casingMat} castShadow />
      <mesh position={[0, 0, 0.41]} material={screenMat}>
        <planeGeometry args={[0.85, 0.75]} />
      </mesh>
      <NavScreenShader
        variant={variant}
        colorRef={colorRef}
        intensityRef={intensityRef}
        selected={selected}
        hoveredRef={hoveredRef}
      />
      <pointLight ref={lightRef} position={[0, 0, 0.6]} distance={4} color={CYAN} />

      <Html position={[0, 0, 0.43]} center transform scale={0.065} style={{ pointerEvents: 'none' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '5px', padding: '10px 14px',
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 1px, transparent 1px, transparent 2px)',
          userSelect: 'none',
        }}>
          <div style={{
            color: labelColor,
            fontFamily: '"IBM Plex Mono", "Courier New", monospace',
            fontSize: hovered ? '13px' : '11px', fontWeight: 700,
            letterSpacing: '0.25em',
            textShadow: `0 0 8px ${labelColor}, 0 0 22px ${labelColor}`,
            whiteSpace: 'nowrap', transition: 'font-size 0.1s',
          }}>
            {label}
          </div>
          <div style={{
            color: labelColor,
            fontFamily: '"IBM Plex Mono", "Courier New", monospace',
            fontSize: '8px', opacity: 0.55, letterSpacing: '0.2em', whiteSpace: 'nowrap',
          }}>
            {sub}
          </div>
          {hovered && !debugMode && (
            <div style={{
              color: labelColor,
              fontFamily: '"IBM Plex Mono", "Courier New", monospace',
              fontSize: '8px', opacity: 0.9, letterSpacing: '0.3em', marginTop: '4px',
              animation: 'blink 0.7s step-end infinite',
            }}>
              ▶ ENTER
            </div>
          )}
        </div>
      </Html>
    </group>
  )
})

// ── MonitorPile — dead machines in deliberate gravity-obeying clusters ────────
// Pile centers: left/right foreground, back-center, back-left — not uniform scatter
function MonitorPile({ count = 60 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const dummy   = useMemo(() => new THREE.Object3D(), [])

  const casingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#080808', roughness: 0.88, metalness: 0.4,
    emissive: '#0a0405', emissiveIntensity: 0.06,
  }), [])

  const instances = useMemo(() => {
    // Seeded PRNG — same layout every render, change seed to audition arrangements
    const s = (n: number) => Math.sin(n * 127.1 + 311.7) * 0.5 + 0.5

    // 4 pile centers + sparse outlier field
    const PILES = [
      { x: -4.8, z: -2.0, r: 2.2, w: 0.27 },  // left foreground
      { x:  4.8, z: -2.0, r: 2.2, w: 0.27 },  // right foreground
      { x:  0.5, z: -7.5, r: 3.2, w: 0.22 },  // back center
      { x: -7.0, z: -6.0, r: 2.0, w: 0.14 },  // back left corner
    ]

    return Array.from({ length: count }, (_, i) => {
      const t = s(i * 37)
      let cx = 0, cz = 0, cr = 10

      let cum = 0
      for (const p of PILES) { cum += p.w; if (t < cum) { cx = p.x; cz = p.z; cr = p.r; break } }

      // Radial spread inside cluster — denser toward center (squared falloff)
      const angle  = s(i * 53) * Math.PI * 2
      const radius = s(i * 61) * s(i * 71) * cr  // squared: tighter center
      const px     = cx + Math.cos(angle) * radius
      const pz     = cz + Math.sin(angle) * radius

      // Y: gravity-plausible. Most monitors rest near floor (-1.9), some stacked higher
      const py = -1.9 + s(i * 83) * s(i * 89) * 1.4  // squared: mostly on floor

      // Rotation: gravity-constrained — fallen, not floating
      const rotX = (s(i * 97)  - 0.5) * Math.PI * 0.45   // ±40° tilt (resting)
      const rotY = s(i * 101)  * Math.PI * 2               // any yaw
      const rotZ = (s(i * 107) - 0.5) * Math.PI * 0.35   // ±32° lean

      return {
        position: [px, py, pz] as [number, number, number],
        rotation: [rotX, rotY, rotZ] as [number, number, number],
        scale: 0.32 + s(i * 113) * 0.65,
      }
    })
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

  useEffect(() => { return () => casingMat.dispose() }, [casingMat])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
      <boxGeometry args={[1, 0.85, 0.72]} />
      <primitive object={casingMat} attach="material" />
    </instancedMesh>
  )
}

// ── ConfettiBlizzard — rejection letters drifting like dust ───────────────────
// Vertex shader: per-particle fall + lateral drift fully on GPU. Zero JS per-frame GC.
// instanceMatrix stores XZ base position + rotation. Y computed entirely by shader.
// aPhase: stagger wrap so papers don't all reset at once.
// aSpeed: per-particle fall velocity. aDrift: lateral sine seed.
const CONFETTI_VERT = /* glsl */`
  precision mediump float;
  attribute vec3 position;
  attribute mat4 instanceMatrix;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aDrift;
  uniform mat4 projectionMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 modelMatrix;
  uniform float uTime;

  void main() {
    // Apply instance transform (XZ position, rotation) — Y overridden below
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);

    // Continuous fall wrapping in [0, 16] → y range [-2, 14]
    float fall  = mod(uTime * aSpeed + aPhase, 16.0);
    world.y     = 14.0 - fall;

    // Slow lateral wander — two sine waves per axis so it never exactly repeats
    float t = uTime * 0.28 + aDrift * 6.2832;
    world.x += sin(t * 0.8  + aDrift * 1.7) * 0.18
             + sin(t * 0.35 + aDrift * 3.1) * 0.07;
    world.z += cos(t * 0.6  + aDrift * 1.3) * 0.14
             + cos(t * 0.27 + aDrift * 2.7) * 0.06;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`
const CONFETTI_FRAG = /* glsl */`
  precision mediump float;
  void main() {
    gl_FragColor = vec4(0.90, 0.88, 0.85, 0.14);
  }
`

function ConfettiBlizzard({ count = 120 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const dummy   = useMemo(() => new THREE.Object3D(), [])

  // Seeded PRNG — stable particle positions at mount
  const s = (n: number) => Math.sin(n * 127.1 + 311.7) * 0.5 + 0.5

  const mat = useMemo(() => new THREE.RawShaderMaterial({
    vertexShader:   CONFETTI_VERT,
    fragmentShader: CONFETTI_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), [])

  // Bake XZ base positions + rotation into instanceMatrix once at mount.
  // Y is 0 — overridden per-frame by shader.
  useEffect(() => {
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        (s(i * 3)     - 0.5) * 20,   // x spread ±10
        0,
        (s(i * 3 + 2) - 0.5) * 16,  // z spread ±8
      )
      // Slow tumble rotation baked in — looks like paper tumbling as it falls
      dummy.rotation.set(
        s(i * 7) * Math.PI * 2,
        s(i * 11) * Math.PI * 2,
        s(i * 13) * Math.PI * 2,
      )
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true

    // Per-instance buffer attributes — seeded, stable, baked once
    const phases = new Float32Array(count)
    const speeds = new Float32Array(count)
    const drifts = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      phases[i] = s(i * 17) * 16           // stagger initial y [0, 16]
      speeds[i] = 0.35 + s(i * 23) * 1.05  // fall speed [0.35, 1.4] — visible drift
      drifts[i] = s(i * 29)                 // lateral drift seed [0, 1]
    }
    const geo = meshRef.current.geometry
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1))
    geo.setAttribute('aDrift', new THREE.InstancedBufferAttribute(drifts, 1))
  }, [count, dummy]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only update uTime — zero allocations per frame
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.getElapsedTime()
  })

  useEffect(() => () => mat.dispose(), [mat])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} material={mat}>
      <planeGeometry args={[0.08, 0.12]} />
    </instancedMesh>
  )
}

// ── GhostText — title bleeds onto the main altar screen ──────────────────────
function GhostText() {
  const [displayed, setDisplayed] = useState('')
  const target = 'SINNER KINGDOM'

  useEffect(() => {
    let i = 0
    let tickId: ReturnType<typeof setInterval> | null = null
    const start = setTimeout(() => {
      tickId = setInterval(() => {
        i++
        setDisplayed(target.slice(0, i))
        if (i >= target.length) clearInterval(tickId!)
      }, 100)
    }, 2000)
    return () => { clearTimeout(start); if (tickId) clearInterval(tickId) }
  }, [])

  return (
    <Html position={[0, 0.1, 0.43]} center transform scale={0.065} style={{ pointerEvents: 'none' }}>
      <div style={{ textAlign: 'center', userSelect: 'none' }}>
        <div style={{
          color: AMBER, fontFamily: '"IBM Plex Mono", "Courier New", monospace',
          fontSize: '20px', fontWeight: 700, letterSpacing: '0.35em',
          textShadow: `0 0 12px ${AMBER}, 0 0 30px ${AMBER}, 0 0 60px ${AMBER}`,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)',
          whiteSpace: 'nowrap',
        }}>
          {displayed}
          <span style={{ opacity: 0.8, animation: 'blink 0.8s step-end infinite' }}>_</span>
        </div>
        <div style={{
          color: AMBER, fontFamily: '"IBM Plex Mono", "Courier New", monospace',
          fontSize: '7px', letterSpacing: '0.4em', opacity: 0.4, marginTop: '10px', whiteSpace: 'nowrap',
        }}>
          SIGNAL LIVE · LOOP RUNNING
        </div>
      </div>
    </Html>
  )
}

// ── CameraHUDReader — writes camera state to DOM pre ref every frame ──────────
function CameraHUDReader({
  hudRef,
  orbitRef,
}: {
  hudRef: React.RefObject<HTMLPreElement | null>
  orbitRef: React.RefObject<{ target: THREE.Vector3 } | null>
}) {
  useFrame(({ camera }) => {
    if (!hudRef.current) return
    const p = camera.position
    const t = orbitRef.current?.target
    hudRef.current.textContent =
      `CAM  pos  [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]\n` +
      `     look [${t ? t.x.toFixed(2) : '0.00'}, ${t ? t.y.toFixed(2) : '0.00'}, ${t ? t.z.toFixed(2) : '0.00'}]`
  })
  return null
}

// ── CameraSync — applies camera slider values to camera + orbit in debug mode ──
// onChange writes to camSliderRef.current. Zero cost at 60fps if user didn't touch sliders.
function CameraSync({
  camSliderRef,
  orbitRef,
}: {
  camSliderRef: React.RefObject<{ y: number; z: number; lookY: number; changed: boolean }>
  orbitRef: React.RefObject<{ target: THREE.Vector3; update?: () => void } | null>
}) {
  useFrame(({ camera }) => {
    if (!camSliderRef.current?.changed) return
    camSliderRef.current.changed = false
    camera.position.y = camSliderRef.current.y
    camera.position.z = camSliderRef.current.z
    const orbit = orbitRef.current as { target: THREE.Vector3; update?: () => void } | null
    if (orbit?.target) {
      orbit.target.set(0, camSliderRef.current.lookY, 0)
      orbit.update?.()
    }
  })
  return null
}

// ── CameraFlyController — WASD fly in debug mode ─────────────────────────────
// Oracle-confirmed: KeyboardControls outside Canvas, useKeyboardControls inside.
// Shifts BOTH camera.position AND orbit.target — prevents orbit drift.
function CameraFlyController({
  active,
  orbitRef,
}: {
  active: boolean
  orbitRef: React.RefObject<{ target: THREE.Vector3; update?: () => void } | null>
}) {
  const [, getKeys] = useKeyboardControls()
  useFrame(({ camera }, delta) => {
    if (!active) return
    const { forward, backward, left, right } = getKeys() as { forward: boolean; backward: boolean; left: boolean; right: boolean }
    if (!forward && !backward && !left && !right) return
    const speed = 6 * delta
    const dx = (right ? speed : 0) + (left ? -speed : 0)
    const dz = (backward ? speed : 0) + (forward ? -speed : 0)
    camera.position.x += dx
    camera.position.z += dz
    const orbit = orbitRef.current as { target: THREE.Vector3; update?: () => void } | null
    if (orbit?.target) {
      orbit.target.x += dx
      orbit.target.z += dz
      orbit.update?.()
    }
  })
  return null
}

// ── GhostCamera — overhead orthographic PIP minimap ──────────────────────────
// Renders into a fixed corner of the main canvas via gl.setViewport + setScissor.
// Priority 1 = runs AFTER default scene render (priority 0). No FBO, no texture cost.
// PIP size: 200×150px bottom-right, 12px margin. Framing: top-down at y=20, looking down.
const PIP_W = 200, PIP_H = 150, PIP_MARGIN = 12
function GhostCamera() {
  const { gl, scene, size } = useThree()

  const ghostCam = useMemo(() => {
    const half = 14
    const cam = new THREE.OrthographicCamera(-half, half, half * (PIP_H / PIP_W), -half * (PIP_H / PIP_W), 0.1, 100)
    cam.position.set(0, 22, 0)
    cam.lookAt(0, 0, 0)
    cam.up.set(0, 0, -1)  // Z-up so scene reads as top-down correctly
    return cam
  }, [])

  useFrame(() => {
    const dpr   = gl.getPixelRatio()
    const pw    = PIP_W * dpr
    const ph    = PIP_H * dpr
    const px    = (size.width  - PIP_W - PIP_MARGIN) * dpr
    const py    = PIP_MARGIN * dpr

    // Save, restrict, render, restore
    gl.setScissorTest(true)
    gl.setScissor(px, py, pw, ph)
    gl.setViewport(px, py, pw, ph)
    gl.render(scene, ghostCam)
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width * dpr, size.height * dpr)
  }, 1)  // priority 1 — after main scene

  return null
}

// ── CameraPathPlayer — dolly preview between MARK START and MARK END ─────────
// Smooth-stepped lerp over DOLLY_DURATION seconds. Zero cost when not playing.
// pathRef.playing triggers the animation; stops cleanly at t=1.
const DOLLY_DURATION = 4.0  // seconds
function CameraPathPlayer({
  pathRef,
  orbitRef,
}: {
  pathRef: React.RefObject<{ playing: boolean; t: number }>
  orbitRef: React.RefObject<{ target: THREE.Vector3; update?: () => void } | null>
}) {
  useFrame(({ camera, clock: _clock }, delta) => {
    if (!pathRef.current?.playing) return
    const { start, end } = useStageStore.getState().cameraPath
    if (!start || !end) { pathRef.current.playing = false; return }

    pathRef.current.t = Math.min(pathRef.current.t + delta / DOLLY_DURATION, 1)
    // Smooth-step easing: t² (3 - 2t)
    const t  = pathRef.current.t
    const st = t * t * (3 - 2 * t)

    camera.position.y = start.y    + (end.y    - start.y)    * st
    camera.position.z = start.z    + (end.z    - start.z)    * st
    const lookY       = start.lookY + (end.lookY - start.lookY) * st

    const orbit = orbitRef.current as { target: THREE.Vector3; update?: () => void } | null
    if (orbit) {
      orbit.target.set(0, lookY, 0)
      orbit.update?.()
    }

    if (pathRef.current.t >= 1) pathRef.current.playing = false
  })
  return null
}

// ── SnapshotSync — keeps sceneStateRef up-to-date every frame ────────────────
// Reads ground-truth camera + monitor positions. Called once per frame in debug.
function SnapshotSync({
  stateRef,
  monitorRefs,
  orbitRef,
  levaSnap,
}: {
  stateRef: React.RefObject<Partial<SceneManifest>>
  monitorRefs: Record<string, React.RefObject<THREE.Group | null>>
  orbitRef: React.RefObject<{ target: THREE.Vector3 } | null>
  levaSnap: React.RefObject<{
    fog: { near: number; far: number }
    bloom: { intensity: number; threshold: number }
    vignette: { darkness: number }
    monitors: Record<string, { scale: number; intensity: number; color: string; rotY: number }>
    cam: { y: number; z: number; lookY: number; fov: number }
  }>
}) {
  useFrame(({ camera }) => {
    if (!stateRef.current) return
    const cam    = camera as THREE.PerspectiveCamera
    const target = orbitRef.current?.target
    const leva   = levaSnap.current

    stateRef.current.camera = {
      position: [cam.position.x, cam.position.y, cam.position.z],
      lookAt:   [target?.x ?? 0, target?.y ?? 0, target?.z ?? 0],
      fov:      cam.fov,
    }

    if (leva) {
      stateRef.current.atmosphere = {
        fog_near:          leva.fog.near,
        fog_far:           leva.fog.far,
        bloom_intensity:   leva.bloom.intensity,
        bloom_threshold:   leva.bloom.threshold,
        vignette_darkness: leva.vignette.darkness,
      }
    }

    const objects: SceneManifest['objects'] = {}
    const monitorMeta = leva?.monitors ?? {}
    for (const [key, ref] of Object.entries(monitorRefs)) {
      if (ref.current) {
        const p    = ref.current.position
        const meta = monitorMeta[key] ?? {}
        objects[key] = {
          position:  [p.x, p.y, p.z],
          scale:     meta.scale     ?? 1,
          intensity: meta.intensity ?? 0.28,
          color:     meta.color     ?? AMBER,
          rotY:      meta.rotY      ?? 0,
        }
      }
    }
    stateRef.current.objects = objects
  })
  return null
}

// ── AltarShaft — volumetric god-ray above the altar ──────────────────────────
// Oracle Q1: cone mesh + AdditiveBlending = self-luminous shaft, no shader needed.
// Oracle Q2: opacity flickered imperatively via useFrame — zero re-renders, zero GC.
function AltarShaft({ position }: { position: [number, number, number] }) {
  const shaftRef = useRef<THREE.Mesh>(null)

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: AMBER,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame(({ clock }) => {
    if (!shaftRef.current) return
    const t = clock.getElapsedTime()
    // Slow ambient pulse: 0.05–0.13, stays subtle so altar stays dominant
    mat.opacity = 0.07 + Math.sin(t * 1.4) * 0.03 + Math.sin(t * 0.7) * 0.02
  })

  useEffect(() => () => mat.dispose(), [mat])

  return (
    <mesh
      ref={shaftRef}
      material={mat}
      // Tip points down at altar (cone tip = bottom), wide mouth opens upward
      position={[position[0], position[1] + 3.5, position[2]]}
      rotation={[0, 0, Math.PI]} // inverted — tip down
      renderOrder={-1}
    >
      {/* radiusTop=0 = cone (tip), radiusBottom=wide mouth, height=7, openEnded to save tris */}
      <cylinderGeometry args={[0, 1.6, 7, 16, 1, true]} />
    </mesh>
  )
}

// ── Scene props ───────────────────────────────────────────────────────────────
export interface SceneProps {
  debug: boolean
  camHudRef: React.RefObject<HTMLPreElement | null>
  snapshotRef: React.RefObject<(() => void) | null>
  resetCameraRef: React.RefObject<(() => void) | null>
  selectedMonitor: string | null
  onMonitorSelect: (key: string | null) => void
  monitorStores: { map: LevaStore; dispatch: LevaStore; archive: LevaStore; cinema: LevaStore }
  lights: LightConfig[]
  lightStores: LevaStore[]
  onRemoveLight: (id: string) => void
  assetStores: { cables: LevaStore; monitor: LevaStore; silo: LevaStore }
}

// ── Scene ─────────────────────────────────────────────────────────────────────
export function Scene({
  debug,
  camHudRef,
  snapshotRef,
  resetCameraRef,
  selectedMonitor,
  onMonitorSelect,
  monitorStores,
  lights,
  lightStores,
  onRemoveLight,
  assetStores,
}: SceneProps) {
  const { camera } = useThree()
  const orbitRef   = useRef<{ target: THREE.Vector3; update?: () => void } | null>(null)
  const [isAltarDragging, setIsAltarDragging] = useState(false)
  const isDraggingRef = useRef(false)
  // Read persisted state once at mount — must be before any useRef that needs it
  const [initialStage] = useState(() => useStageStore.getState())
  // Camera slider ref — onChange in useDebugControls writes here, CameraSync reads it
  const camSliderRef = useRef({ y: initialStage.camera.y, z: initialStage.camera.z, lookY: initialStage.camera.lookY, changed: false })
  // Path preview ref — CameraPathPlayer reads this, PREVIEW PATH button sets .playing=true
  const pathPreviewRef = useRef({ playing: false, t: 0 })
  // Lights snapshot ref — LightScene.onSnapshot writes here, takeSnapshot reads it
  const lightsSnapRef = useRef<LightConfig[]>([...lights])

  // Stable refs for colors/intensities — onChange writes here, useFrame reads (zero GC)
  const colorRefs = {
    altar:    useRef<string>(initialStage.monitors.altar.color),
    map:      useRef<string>(initialStage.monitors.map.color),
    dispatch: useRef<string>(initialStage.monitors.dispatch.color),
    archive:  useRef<string>(initialStage.monitors.archive.color),
    cinema:   useRef<string>(initialStage.monitors.cinema.color),
  }
  const intensityRefs = {
    altar:    useRef<number>(initialStage.monitors.altar.intensity),
    map:      useRef<number>(initialStage.monitors.map.intensity),
    dispatch: useRef<number>(initialStage.monitors.dispatch.intensity),
    archive:  useRef<number>(initialStage.monitors.archive.intensity),
    cinema:   useRef<number>(initialStage.monitors.cinema.intensity),
  }

  // Asset value refs — track current Leva values for SAVE LAYOUT
  const cablesValRef       = useRef<AssetSaved>({ ...initialStage.assets.cables })
  const monitorAssetValRef = useRef<AssetSaved>({ ...initialStage.assets.monitor })
  const siloValRef         = useRef<AssetSaved>({ ...initialStage.assets.silo })

  // React state for label colors — HTML overlay stays in sync with 3D screen glow
  const [mapLabelColor,      setMapLabelColor]      = useState(initialStage.monitors.map.color)
  const [dispatchLabelColor, setDispatchLabelColor] = useState(initialStage.monitors.dispatch.color)
  const [archiveLabelColor,  setArchiveLabelColor]  = useState(initialStage.monitors.archive.color)
  const [cinemaLabelColor,   setCinemaLabelColor]   = useState(initialStage.monitors.cinema.color)
  const setLabelColors = {
    map:      setMapLabelColor,
    dispatch: setDispatchLabelColor,
    archive:  setArchiveLabelColor,
    cinema:   setCinemaLabelColor,
  }

  // Monitor refs for TransformControls + SnapshotSync ground truth
  const altarRef    = useRef<THREE.Group>(null)
  const mapRef      = useRef<THREE.Group>(null)
  const dispatchRef = useRef<THREE.Group>(null)
  const archiveRef  = useRef<THREE.Group>(null)
  const cinemaRef   = useRef<THREE.Group>(null)
  const monitorRefs = { altar: altarRef, map: mapRef, dispatch: dispatchRef, archive: archiveRef, cinema: cinemaRef }

  // Aggregated leva snapshot ref — SnapshotSync writes here, SNAPSHOT reads here
  const levaSnapRef  = useRef<Record<string, unknown>>({})
  const manifestRef  = useRef<Partial<SceneManifest>>({})

  // SAVE LAYOUT — persists current Leva values to Zustand store (localStorage)
  const saveLayout = useCallback(() => {
    const lsnap    = levaSnapRef.current as Record<string, unknown>
    const monitors = (lsnap.monitors ?? {}) as Record<string, MonitorSaved>
    const camSnap  = (lsnap.cam     ?? {}) as { y?: number; z?: number; lookY?: number; fov?: number }
    const fogSnap  = (lsnap.fog     ?? {}) as { near?: number; far?: number }
    const bloomSnap = (lsnap.bloom  ?? {}) as { intensity?: number; threshold?: number }
    const vigSnap  = (lsnap.vignette ?? {}) as { darkness?: number }

    useStageStore.getState().save({
      monitors,
      assets: {
        cables:  { ...cablesValRef.current },
        monitor: { ...monitorAssetValRef.current },
        silo:    { ...siloValRef.current },
      },
      lights: lightsSnapRef.current.filter(l => lights.some(cfg => cfg.id === l.id)),
      camera: {
        y:     camSnap.y     ?? LAYOUT.cam.y,
        z:     camSnap.z     ?? LAYOUT.cam.z,
        lookY: camSnap.lookY ?? LAYOUT.cam.lookY,
        fov:   camSnap.fov   ?? 52,
      },
      atmosphere: {
        fogNear:          fogSnap.near        ?? LAYOUT.fog.near,
        fogFar:           fogSnap.far         ?? LAYOUT.fog.far,
        bloomIntensity:   bloomSnap.intensity ?? LAYOUT.bloom.intensity,
        bloomThreshold:   bloomSnap.threshold ?? LAYOUT.bloom.threshold,
        vignetteDarkness: vigSnap.darkness    ?? LAYOUT.vignette.darkness,
      },
    })
    const el = document.getElementById('snapshot-flash')
    if (el) {
      el.textContent = '◉ LAYOUT SAVED TO STORAGE'; el.style.opacity = '1'
      setTimeout(() => {
        if (!el) return
        el.style.opacity = '0'
        setTimeout(() => { if (el) el.textContent = '◉ SNAPSHOT COPIED TO CLIPBOARD' }, 300)
      }, 1800)
    }
  }, [levaSnapRef, lightsSnapRef, cablesValRef, monitorAssetValRef, siloValRef, lights])

  // SNAPSHOT — reads refs at click-time for ground-truth color/intensity
  const takeSnapshot = useCallback(() => {
    const snap  = manifestRef.current
    const lsnap = levaSnapRef.current as Record<string, unknown>
    const id    = `snap_${Date.now()}`

    const objects: SceneManifest['objects'] = {}
    if (snap.objects) {
      for (const [key, obj] of Object.entries(snap.objects)) {
        const cRef = colorRefs[key as keyof typeof colorRefs]
        const iRef = intensityRefs[key as keyof typeof intensityRefs]
        objects[key] = {
          ...obj,
          color:     cRef?.current ?? obj.color,
          intensity: iRef?.current ?? obj.intensity,
        }
      }
    }

    const monitorsLeva = (lsnap.monitors ?? {}) as Record<string, { scale: number; rotY: number; label?: string }>
    for (const key of Object.keys(objects)) {
      const m = monitorsLeva[key]
      if (m) { objects[key].scale = m.scale; objects[key].rotY = m.rotY }
    }

    const lightsArray: SceneManifest['lights'] = lightsSnapRef.current.map(lc => ({
      id:       lc.id,
      label:    lc.label,
      type:     lc.type,
      position: [lc.x, lc.y, lc.z] as [number, number, number],
      color:    lc.color,
      intensity: lc.intensity,
      distance:  lc.distance,
    }))

    const manifest: SceneManifest = {
      schema_version: 1,
      snapshot_id:    id,
      scene:          'homepage_landing',
      timestamp:      new Date().toISOString(),
      intent:         '— fill in intent —',
      mood:           '— fill in mood —',
      camera:         snap.camera ?? { position: [0, -0.3, 8], lookAt: [0, -1.2, 0], fov: 52 },
      objects,
      lights:         lightsArray,
      atmosphere:     snap.atmosphere ?? { fog_near: 18, fog_far: 45, bloom_intensity: 0.7, bloom_threshold: 0.3, vignette_darkness: 0.82 },
    }
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2)).catch(() => {})
    const el = document.getElementById('snapshot-flash')
    if (el) { el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0' }, 2000) }
  }, [colorRefs, intensityRefs, levaSnapRef, manifestRef, lightsSnapRef])

  useEffect(() => { snapshotRef.current = takeSnapshot }, [snapshotRef, takeSnapshot])

  // Camera reset — snaps to LAYOUT defaults + resets orbit target
  useEffect(() => {
    resetCameraRef.current = () => {
      camera.position.set(0, LAYOUT.cam.y, LAYOUT.cam.z)
      const orbit = orbitRef.current as unknown as { target: THREE.Vector3; update?: () => void } | null
      if (orbit) {
        orbit.target.set(0, LAYOUT.cam.lookY, 0)
        orbit.update?.()
      }
      camSliderRef.current = { y: LAYOUT.cam.y, z: LAYOUT.cam.z, lookY: LAYOUT.cam.lookY, changed: false }
    }
  }, [resetCameraRef, camera])

  // Ctrl+Z → undo last Stage Director drag / save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && debug) {
        e.preventDefault()
        useStageStore.getState().undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [debug])

  // Read current camera position for path keyframe capture
  const getCameraKeyframe = useCallback(() => ({
    y:     camSliderRef.current.y,
    z:     camSliderRef.current.z,
    lookY: camSliderRef.current.lookY,
  }), [])

  const ctrl = useDebugControls(
    debug, colorRefs, intensityRefs, setLabelColors,
    levaSnapRef as React.RefObject<Record<string, unknown>>,
    takeSnapshot, saveLayout, monitorStores,
    camSliderRef as React.RefObject<{ y: number; z: number; lookY: number; changed: boolean }>,
    getCameraKeyframe,
    () => { pathPreviewRef.current.playing = true; pathPreviewRef.current.t = 0 },
  )

  // Apply Leva FOV when in debug mode
  useEffect(() => {
    if (debug) {
      (camera as THREE.PerspectiveCamera).fov = ctrl.cam.fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
  }, [debug, ctrl.cam.fov, camera])

  // Derive positions and scales — debug=Leva, normal=LAYOUT
  const altarPos:    [number, number, number] = debug ? [ctrl.altar.x, ctrl.altar.y, ctrl.altar.z]             : [LAYOUT.altar.x,    LAYOUT.altar.y,    LAYOUT.altar.z]
  const mapPos:      [number, number, number] = debug ? [ctrl.map.x,   ctrl.map.y,   ctrl.map.z]               : [LAYOUT.map.x,      LAYOUT.map.y,      LAYOUT.map.z]
  const dispatchPos: [number, number, number] = debug ? [ctrl.dispatch.x, ctrl.dispatch.y, ctrl.dispatch.z]    : [LAYOUT.dispatch.x, LAYOUT.dispatch.y, LAYOUT.dispatch.z]
  const archivePos:  [number, number, number] = debug ? [ctrl.archive.x,  ctrl.archive.y,  ctrl.archive.z]     : [LAYOUT.archive.x,  LAYOUT.archive.y,  LAYOUT.archive.z]
  const cinemaPos:   [number, number, number] = debug ? [ctrl.cinema.x,   ctrl.cinema.y,   ctrl.cinema.z]      : [LAYOUT.cinema.x,   LAYOUT.cinema.y,   LAYOUT.cinema.z]

  const altarScale    = debug ? ctrl.altar.scale    : LAYOUT.altar.scale
  const mapScale      = debug ? ctrl.map.scale      : LAYOUT.map.scale
  const dispatchScale = debug ? ctrl.dispatch.scale : LAYOUT.dispatch.scale
  const archiveScale  = debug ? ctrl.archive.scale  : LAYOUT.archive.scale
  const cinemaScale   = debug ? ctrl.cinema.scale   : LAYOUT.cinema.scale

  const altarRotY    = debug ? ctrl.altar.rotY    : LAYOUT.altar.rotY
  const mapRotY      = debug ? ctrl.map.rotY      : LAYOUT.map.rotY
  const dispatchRotY = debug ? ctrl.dispatch.rotY : LAYOUT.dispatch.rotY
  const archiveRotY  = debug ? ctrl.archive.rotY  : LAYOUT.archive.rotY
  const cinemaRotY   = debug ? ctrl.cinema.rotY   : LAYOUT.cinema.rotY

  const camY    = debug ? ctrl.cam.y     : LAYOUT.cam.y
  const camZ    = debug ? ctrl.cam.z     : LAYOUT.cam.z
  const lookY   = debug ? ctrl.cam.lookY : LAYOUT.cam.lookY
  const fogNear = debug ? ctrl.atmo.fogNear : LAYOUT.fog.near
  const fogFar  = debug ? ctrl.atmo.fogFar  : LAYOUT.fog.far

  // Sync Leva sliders after drag (onMouseUp)
  const syncPos = (key: 'map' | 'dispatch' | 'archive' | 'cinema', setFn: (v: Record<string, number>) => void) => () => {
    const ref = monitorRefs[key].current
    if (!ref) return
    const { x, y, z } = ref.position
    setFn({ x, y, z })
    isDraggingRef.current = false
    const orbit = orbitRef.current as unknown as { enabled: boolean } | null
    if (orbit && 'enabled' in orbit) orbit.enabled = true
  }
  const syncAltarPos = () => {
    const ref = altarRef.current
    if (!ref) return
    const { x, y, z } = ref.position
    ctrl.setAltar({ x, y, z })
    isDraggingRef.current = false
    setIsAltarDragging(false)
    const orbit = orbitRef.current as unknown as { enabled: boolean } | null
    if (orbit && 'enabled' in orbit) orbit.enabled = true
  }

  const startDrag = () => {
    // Snapshot current state before drag modifies positions — enables Ctrl+Z restore
    useStageStore.getState().saveWithUndo({})
    isDraggingRef.current = true
    const orbit = orbitRef.current as unknown as { enabled: boolean } | null
    if (orbit && 'enabled' in orbit) orbit.enabled = false
  }

  return (
    <>
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, fogNear, fogFar]} />

      {debug
        ? <OrbitControls
            ref={orbitRef as React.RefObject<any>}
            makeDefault
            minPolarAngle={Math.PI * 0.2}
            maxPolarAngle={Math.PI * 0.78}
          />
        : <CameraRig camY={camY} camZ={camZ} lookY={lookY} />
      }

      {debug && <CameraHUDReader hudRef={camHudRef} orbitRef={orbitRef} />}
      {debug && (
        <SnapshotSync
          stateRef={manifestRef}
          monitorRefs={monitorRefs}
          orbitRef={orbitRef}
          levaSnap={levaSnapRef as React.RefObject<Parameters<typeof SnapshotSync>[0]['levaSnap']['current']>}
        />
      )}
      {debug && (
        <CameraSync
          camSliderRef={camSliderRef as React.RefObject<{ y: number; z: number; lookY: number; changed: boolean }>}
          orbitRef={orbitRef as React.RefObject<{ target: THREE.Vector3; update?: () => void } | null>}
        />
      )}
      {debug && (
        <CameraFlyController
          active={debug && !isDraggingRef.current}
          orbitRef={orbitRef as React.RefObject<{ target: THREE.Vector3; update?: () => void } | null>}
        />
      )}
      {debug && (
        <CameraPathPlayer
          pathRef={pathPreviewRef as React.RefObject<{ playing: boolean; t: number }>}
          orbitRef={orbitRef as React.RefObject<{ target: THREE.Vector3; update?: () => void } | null>}
        />
      )}
      {debug && <GhostCamera />}

      <ambientLight intensity={0.08} />
      {lights.map(cfg => (
        <LightScene
          key={cfg.id}
          config={cfg}
          store={lightStores[cfg.storeIndex]}
          debug={debug}
          selected={selectedMonitor === `light-${cfg.id}`}
          onSelect={() => onMonitorSelect(selectedMonitor === `light-${cfg.id}` ? null : `light-${cfg.id}`)}
          onDragStart={startDrag}
          onDragEnd={() => {
            isDraggingRef.current = false
            const orbit = orbitRef.current as unknown as { enabled: boolean } | null
            if (orbit && 'enabled' in orbit) orbit.enabled = true
          }}
          onRemove={onRemoveLight}
          onSnapshot={(id, values) => {
            const idx = lightsSnapRef.current.findIndex(l => l.id === id)
            if (idx >= 0) lightsSnapRef.current[idx] = values
            else lightsSnapRef.current.push(values)
          }}
        />
      ))}

      <Floor />

      <SpriteAssetController
        url="/assets/asset-silo.png"
        name="Asset: Silo"
        store={assetStores.silo}
        debug={debug}
        selected={selectedMonitor === 'asset-silo'}
        onSelect={() => onMonitorSelect(selectedMonitor === 'asset-silo' ? null : 'asset-silo')}
        onDragStart={startDrag}
        onDragEnd={() => { isDraggingRef.current = false; const orbit = orbitRef.current as unknown as { enabled: boolean } | null; if (orbit && 'enabled' in orbit) orbit.enabled = true }}
        hasBlur renderOrderVal={0}
        savedAsset={initialStage.assets.silo}
        valuesRef={siloValRef}
      />
      <SpriteAssetController
        url="/assets/asset-cables.png"
        name="Asset: Cables"
        store={assetStores.cables}
        debug={debug}
        selected={selectedMonitor === 'asset-cables'}
        onSelect={() => onMonitorSelect(selectedMonitor === 'asset-cables' ? null : 'asset-cables')}
        onDragStart={startDrag}
        onDragEnd={() => { isDraggingRef.current = false; const orbit = orbitRef.current as unknown as { enabled: boolean } | null; if (orbit && 'enabled' in orbit) orbit.enabled = true }}
        renderOrderVal={1}
        savedAsset={initialStage.assets.cables}
        valuesRef={cablesValRef}
      />
      <SpriteAssetController
        url="/assets/asset-monitor.png"
        name="Asset: Monitor"
        store={assetStores.monitor}
        debug={debug}
        selected={selectedMonitor === 'asset-monitor'}
        onSelect={() => onMonitorSelect(selectedMonitor === 'asset-monitor' ? null : 'asset-monitor')}
        onDragStart={startDrag}
        onDragEnd={() => { isDraggingRef.current = false; const orbit = orbitRef.current as unknown as { enabled: boolean } | null; if (orbit && 'enabled' in orbit) orbit.enabled = true }}
        renderOrderVal={2}
        savedAsset={initialStage.assets.monitor}
        valuesRef={monitorAssetValRef}
      />

      <MonitorPile count={60} />

      {/* ALTAR SHAFT — volumetric god-ray, follows altar position */}
      <AltarShaft position={altarPos} />

      <Float speed={isAltarDragging ? 0 : 1.2} rotationIntensity={0.04} floatIntensity={0.18}>
        <VintageMonitor
          ref={altarRef}
          position={altarPos}
          rotation={[0, altarRotY, 0]}
          scale={altarScale}
          colorRef={colorRefs.altar as React.RefObject<string>}
          intensityRef={intensityRefs.altar as React.RefObject<number>}
        >
          <GhostText />
        </VintageMonitor>
      </Float>

      {debug && selectedMonitor === 'altar' && (
        <TransformControls
          object={altarRef as React.RefObject<THREE.Object3D>}
          mode="translate"
          onMouseDown={() => { startDrag(); setIsAltarDragging(true) }}
          onMouseUp={syncAltarPos}
        />
      )}
      {debug && selectedMonitor === 'map' && (
        <TransformControls
          object={mapRef as React.RefObject<THREE.Object3D>}
          mode="translate"
          onMouseDown={startDrag}
          onMouseUp={syncPos('map', ctrl.setMap)}
        />
      )}
      {debug && selectedMonitor === 'dispatch' && (
        <TransformControls
          object={dispatchRef as React.RefObject<THREE.Object3D>}
          mode="translate"
          onMouseDown={startDrag}
          onMouseUp={syncPos('dispatch', ctrl.setDispatch)}
        />
      )}
      {debug && selectedMonitor === 'archive' && (
        <TransformControls
          object={archiveRef as React.RefObject<THREE.Object3D>}
          mode="translate"
          onMouseDown={startDrag}
          onMouseUp={syncPos('archive', ctrl.setArchive)}
        />
      )}
      {debug && selectedMonitor === 'cinema' && (
        <TransformControls
          object={cinemaRef as React.RefObject<THREE.Object3D>}
          mode="translate"
          onMouseDown={startDrag}
          onMouseUp={syncPos('cinema', ctrl.setCinema)}
        />
      )}

      {debug && (
        <mesh position={[0, 0, -20]} onClick={() => onMonitorSelect(null)}>
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      <NavMonitor
        ref={mapRef}
        href="/kingdom-map" label="LIVING MAP" sub="THE KINGDOM"
        position={mapPos} rotation={[0, mapRotY, 0]} scale={mapScale}
        colorRef={colorRefs.map as React.RefObject<string>}
        intensityRef={intensityRefs.map as React.RefObject<number>}
        initialColor={mapLabelColor}
        debugMode={debug}
        selected={selectedMonitor === 'map'}
        onDebugSelect={() => onMonitorSelect(selectedMonitor === 'map' ? null : 'map')}
        variant={0}
      />
      <NavMonitor
        ref={dispatchRef}
        href="/blog" label="THE DISPATCH" sub="THREE VOICES"
        position={dispatchPos} rotation={[0, dispatchRotY, 0]} scale={dispatchScale}
        colorRef={colorRefs.dispatch as React.RefObject<string>}
        intensityRef={intensityRefs.dispatch as React.RefObject<number>}
        initialColor={dispatchLabelColor}
        debugMode={debug}
        selected={selectedMonitor === 'dispatch'}
        onDebugSelect={() => onMonitorSelect(selectedMonitor === 'dispatch' ? null : 'dispatch')}
        variant={1}
      />
      <NavMonitor
        ref={archiveRef}
        href="/archive" label="THE ARCHIVE" sub="BOOKS · WRITING"
        position={archivePos} rotation={[0, archiveRotY, 0]} scale={archiveScale}
        colorRef={colorRefs.archive as React.RefObject<string>}
        intensityRef={intensityRefs.archive as React.RefObject<number>}
        initialColor={archiveLabelColor}
        debugMode={debug}
        selected={selectedMonitor === 'archive'}
        onDebugSelect={() => onMonitorSelect(selectedMonitor === 'archive' ? null : 'archive')}
        variant={2}
      />
      <NavMonitor
        ref={cinemaRef}
        href="/cinema" label="THE CINEMA" sub="FILMS"
        position={cinemaPos} rotation={[0, cinemaRotY, 0]} scale={cinemaScale}
        colorRef={colorRefs.cinema as React.RefObject<string>}
        intensityRef={intensityRefs.cinema as React.RefObject<number>}
        initialColor={cinemaLabelColor}
        debugMode={debug}
        selected={selectedMonitor === 'cinema'}
        onDebugSelect={() => onMonitorSelect(selectedMonitor === 'cinema' ? null : 'cinema')}
        variant={3}
      />

      {debug && (
        <mesh
          position={altarPos}
          onClick={(e) => { e.stopPropagation(); onMonitorSelect(selectedMonitor === 'altar' ? null : 'altar') }}
        >
          <planeGeometry args={[2, 2]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      <ConfettiBlizzard count={120} />

      <EffectComposer>
        <Bloom
          intensity={debug ? ctrl.atmo.bloomIntensity : LAYOUT.bloom.intensity}
          luminanceThreshold={debug ? ctrl.atmo.bloomThreshold : LAYOUT.bloom.threshold}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
        <Vignette
          offset={0.25}
          darkness={debug ? ctrl.atmo.vignetteDarkness : LAYOUT.vignette.darkness}
        />
      </EffectComposer>
    </>
  )
}
