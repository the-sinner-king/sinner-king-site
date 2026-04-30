'use client'

/**
 * WorldScene — The infinite world. The full site. The thing itself.
 *
 * One seamless CRT screen, straight down, forever.
 * Orthographic camera: true map feel, no perspective distortion.
 *
 * TECHNICAL NOTES (earned in blood, S246):
 *
 * 1. Camera rotation prop suppresses R3F's lookAt
 *    R3F v9 calls camera.lookAt(0,0,0) during init unless the camera prop
 *    includes `rotation`. Camera at [0,2000,0] looking at origin produces a
 *    degenerate up-vector → gimbal lock. Fix: pass rotation:[-π/2,0,0] in
 *    the Canvas camera prop (ref: events-5a94e5eb.esm.js line 15631).
 *
 * 2. Bloom luminanceThreshold must clear the ground's luminance floor
 *    Ground base luminance ≈ 0.002 (linear, post S246 kill). With threshold=0.2,
 *    only HELLO WORLD (#FF3366 ≈ 0.255 luminance) blooms. Ground is silent.
 *    Keep intensity ≤ 1.0 — mipmapBlur pyramids HELLO WORLD bloom across the
 *    scene if the ground floor rises above threshold.
 *
 * 3. reactStrictMode disabled in next.config.js
 *    Next.js 15 StrictMode double-mounts components. R3F's Canvas uses
 *    useMeasure which resets to {0,0} on remount, causing a window where
 *    the scene won't reconfigure. For Three.js/R3F, StrictMode provides
 *    no benefit and causes visible flicker in dev.
 *
 * 4. gl.alpha: false is mandatory
 *    R3F defaults to alpha:true WebGL context. The body's bg-kingdom-void
 *    (#0d0b16 oklch) bleeds through the canvas wherever the GPU hasn't
 *    rendered fully opaque pixels. Fix: alpha:false in Canvas gl prop.
 *
 * 5. CRT approach: world-space ground + screen-space scanline glass
 *    World-space CRT on the ground mesh moves with pan/zoom — correct physical
 *    behavior. Aperture-grille mask (Lottes) is sub-pixel at zoom=0.5 and
 *    reveals RGB columns at zoom≥3. A separate CSS scanline overlay sits above
 *    the Canvas as "screen glass" — fixed to the viewport, overlays text too.
 *
 * 6. DO NOT add <colorspace_fragment> to ShaderMaterial with EffectComposer
 *    EffectComposer (postprocessing v3) sets renderer.outputColorSpace =
 *    LinearSRGBColorSpace on its FBOs and handles sRGB conversion in its final
 *    pass. Adding <colorspace_fragment> to the shader = double sRGB encoding =
 *    values appear 3-4× brighter. The ground was burning blue for 10+ attempts
 *    because of this. Output raw linear values; EC converts at the end.
 *
 * 7. Ground shader values must be ÷10 vs naive research estimates
 *    Two raptors were stacking: (A) ground values too loud for the pipeline,
 *    (B) HELLO WORLD mipmapBlur bloom bleeding purple across the sky — masked
 *    by (A)'s brightness so FENCE 1 (text→black) showed no change. Fixed via
 *    Raptor Protocol fence campaign, S246.
 *
 * 8. Never symlink node_modules inside a Turbopack project root
 *    Turbopack uses file paths as module IDs. A symlink that changes the
 *    resolution path (node_modules/ → node_modules.nosync/) changes EVERY
 *    library's ID. The HMR SharedWorker re-evaluates all "new" modules on load.
 *    R3F and Three.js access window at module scope — worker has no window →
 *    crash. iCloud .nosync workaround is valid only OUTSIDE the project root.
 *    Regression guard: regression-test-turbopack-window.sh, S247.
 *
 * Palette: BG #000000 · PRIMARY #FF3366 · SECONDARY #00EEFF
 */

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { WorldCamera } from './WorldCamera'
import { WorldDebugStore } from './WorldDebugStore'
import { WorldDebugHUD } from './WorldDebugHUD'

// ---------------------------------------------------------------------------
// SHADERS — world-space CRT phosphor surface
//
// Philosophy: the world IS the CRT screen. Scanlines and aperture-grille move
// with the world as you pan (not screen-fixed). At zoom=0.5 (default) the
// pattern is sub-pixel and reads as a uniform tint. Zoom in and individual
// phosphor rows and RGB columns emerge — exactly how a real CRT looks at
// different viewing distances.
//
// Adapted from Timothy Lottes' crt-lottes.glsl (public domain):
//   Aperture-grille shadow mask type 2 — vertical RGB stripe pattern.
//
// 🏛️ ARCHAEOLOGICAL RECORD // RAPTOR KILL — THE LUMINOUS VOID
// 🗓️ 2026-04-30 | Session 246
// ISSUE: Ground rendered bright blue despite shader values reading as dark.
//        Two culprits stacking: (A) raw linear values too high for EC pipeline,
//        (B) HELLO WORLD mipmapBlur bloom spreading across the scene.
//        Culprit B was masked during FENCE 1 because A dominated. Only visible
//        after A was fixed (÷10), causing B to become the new dominant signal.
// RESOLUTION: (A) Shader values ÷10. (B) Values kept at ÷10 so bloom from
//        HELLO WORLD stays within its halo and doesn't taint the ground.
//        Removed <colorspace_fragment> from shader — EC owns that conversion.
// LAW: Never add <colorspace_fragment> to ShaderMaterial when EffectComposer
//        is mounted. EC sets LinearSRGBColorSpace on FBOs; adding the chunk
//        double-encodes sRGB → exponential brightness on dark values.
// 🦖 X-RAY: If blue returns — check (1) shader values crept up, (2) Bloom
//        threshold dropped below ground luminance, (3) <colorspace_fragment>
//        was re-added. Ground luminance must stay well below 0.2.
// ---------------------------------------------------------------------------

const VERT = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Luminance budget: ground peaks at ~0.002 linear — well below Bloom threshold (0.2).
// EC owns colorspace conversion — output raw linear values only.
const FRAG = /* glsl */ `
  varying vec2 vWorld;
  uniform float uTime;

  void main() {
    vec3 col = vec3(0.0);

    // --- WORLD-SPACE SCANLINES ---
    // Period: 2 world units. At zoom=0.5 → ~1 CSS px; reveals at zoom≥1.
    float scan = sin(vWorld.y * 3.14159) * 0.5 + 0.5;
    scan = pow(scan, 1.5); // push toward dark: more gap than glow

    // --- APERTURE GRILLE (Lottes shadow mask type 2, world-space) ---
    // 3-column RGB triad, period 3 world units.
    // Sub-pixel at zoom=0.5; RGB dots emerge at zoom≥3.
    float mp = fract(vWorld.x * 0.33333) * 3.0;
    float maskR = smoothstep(0.1, 0.4, mp) - smoothstep(0.6, 0.9, mp);
    float maskG = smoothstep(1.1, 1.4, mp) - smoothstep(1.6, 1.9, mp);
    float maskB = smoothstep(2.1, 2.4, mp) - smoothstep(2.6, 2.9, mp);

    // Blue-violet phosphor base — inactive CRT screen glow
    col += vec3(0.0018, 0.0007, 0.0052) * scan;

    // Aperture-grille RGB tint per phosphor column
    col += vec3(maskR * 0.0012, maskG * 0.0005, maskB * 0.0040) * scan;

    // Phosphor breath: the screen is alive, barely
    float pulse = sin(uTime * 0.22) * 0.5 + 0.5;
    col += vec3(0.0004, 0.0002, 0.0012) * (0.6 + 0.4 * pulse);

    gl_FragColor = vec4(col, 1.0);
    // DO NOT add <colorspace_fragment> here — see note 6 in file header.
  }
`

// ---------------------------------------------------------------------------
// GROUND — the world's surface
// ---------------------------------------------------------------------------

function WorldGround() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime()
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      {/* 200,000 unit plane — you will never reach the edge */}
      <planeGeometry args={[200000, 200000]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={{ uTime: { value: 0 } }}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// HELLO WORLD — origin marker. Luminance ≈ 0.255 → blooms pink. VT323 TTF.
// (woff2 not supported by troika-three-text's opentype.js — TTF required)
// ---------------------------------------------------------------------------

function HelloWorld() {
  return (
    <Text
      position={[0, 1, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      font="/fonts/VT323-Regular.ttf"
      fontSize={200}
      color="#FF3366"
      anchorX="center"
      anchorY="middle"
      letterSpacing={0.06}
    >
      HELLO WORLD
    </Text>
  )
}

// ---------------------------------------------------------------------------
// DEBUG WRITER — feeds WorldDebugStore from inside the render loop
// ---------------------------------------------------------------------------

function DebugWriter() {
  const frameAccum = useRef(0)
  const lastFpsCalc = useRef(0)

  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime()

    WorldDebugStore.pos.x  = camera.position.x
    WorldDebugStore.pos.z  = camera.position.z
    WorldDebugStore.zoom   = (camera as THREE.OrthographicCamera).zoom
    WorldDebugStore.rotX   = camera.rotation.x
    WorldDebugStore.tick   = t
    WorldDebugStore.frameCount++

    frameAccum.current++
    const elapsed = t - lastFpsCalc.current
    if (elapsed >= 1.0) {
      WorldDebugStore.fps  = frameAccum.current / elapsed
      frameAccum.current   = 0
      lastFpsCalc.current  = t
    }
  })

  return null
}

// ---------------------------------------------------------------------------
// SCENE CONTENTS (inside Canvas)
// ---------------------------------------------------------------------------

function SceneContents() {
  return (
    <>
      <WorldGround />
      <HelloWorld />
      <WorldCamera />
      {/*
        multisampling=0  → disables MSAA on EC render targets (4x cost reduction)
        depthBuffer=false → flat scene, depth buffer is wasted memory bandwidth
        levels=4         → halves mip passes (default ~8 → 4), still quality bloom
        threshold=0.2    → only blooms HELLO WORLD (lum≈0.255), ground stays silent
      */}
      <EffectComposer multisampling={0} depthBuffer={false}>
        <Bloom
          intensity={0.6}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.5}
          mipmapBlur
          levels={4}
        />
      </EffectComposer>
      <DebugWriter />
    </>
  )
}

// ---------------------------------------------------------------------------
// CANVAS — orthographic, straight down, forever
// ---------------------------------------------------------------------------

export function WorldScene() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        orthographic
        camera={{
          position: [0, 2000, 0],
          // rotation suppresses R3F's lookAt(0,0,0) — see note 1 in header
          rotation: [-Math.PI / 2, 0, 0],
          zoom:     0.5,
          near:     1,
          far:      10000,
        }}
        gl={{
          antialias:           true,
          alpha:               false, // opaque — body bg cannot bleed through (note 4)
          powerPreference:     'high-performance',
          toneMapping:         THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        frameloop="always"
      >
        <color attach="background" args={['#000000']} />
        <SceneContents />
      </Canvas>

      {/*
        Screen-glass scanline overlay — sits above the Canvas so lines cut
        through world objects (text) too. Screen-fixed is correct here: this
        simulates the physical CRT glass, not the phosphor surface beneath.
        Opacity kept low so it reads as texture, not obstruction.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)',
          zIndex: 10,
        }}
      />

      {/* Debug HUD lives outside Canvas — toggle with backtick */}
      <WorldDebugHUD />
    </div>
  )
}
