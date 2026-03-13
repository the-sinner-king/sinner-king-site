'use client'

/**
 * SPRITE ASSET CONTROLLER — textured plane with Stage Director controls
 *
 * Oracle-confirmed patterns (Session 173):
 *   - Oracle Q3 material toggle: pre-instantiate ALL three materials with useMemo([]).
 *     Assign via mesh.material prop. NO JSX conditional — avoids GPU recompilation.
 *   - transient: false on ALL useControls fields read from the values tuple.
 *     Without it, onChange fields are excluded and ctrl.x/ctrl.lit = undefined.
 *   - hasBlur=true → 3rd material (ShaderMaterial 5×5 box blur), used when lit=false.
 *   - savedAsset: initial values from Zustand persist store. valuesRef: owned by parent,
 *     updated via onChange for SAVE LAYOUT.
 */

import { useEffect, useMemo, useRef } from 'react'
import { TransformControls, useTexture } from '@react-three/drei'
import { useControls } from 'leva'
import * as THREE from 'three'
import type { LevaStore } from './scene-constants'
import type { AssetSaved } from '../../lib/stage-director-store'

// ── Blur ShaderMaterial shaders (for background silo) ────────────────────────
// 5×5 box blur — uBlurRadius + uOpacity updated imperatively via onChange.
const BLUR_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const BLUR_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uBlurRadius;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 color = vec4(0.0);
    vec2 texelSize = 1.0 / uResolution;
    float count = 0.0;
    for (float x = -2.0; x <= 2.0; x++) {
      for (float y = -2.0; y <= 2.0; y++) {
        color += texture2D(tDiffuse, vUv + vec2(x, y) * texelSize * uBlurRadius);
        count++;
      }
    }
    gl_FragColor = color / count;
    gl_FragColor.a *= uOpacity;
  }
`

export function SpriteAssetController({
  url,
  name,
  store,
  debug,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
  hasBlur = false,
  renderOrderVal = 1,
  savedAsset,
  valuesRef,
}: {
  url: string
  name: string
  store: LevaStore
  debug: boolean
  selected: boolean
  onSelect: () => void
  onDragStart: () => void
  onDragEnd: () => void
  hasBlur?: boolean
  renderOrderVal?: number
  savedAsset: AssetSaved
  valuesRef: React.MutableRefObject<AssetSaved>
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const texture = useTexture(url)

  // Blur uniforms — stable ref, updated imperatively via onChange. Never recreates material.
  const blurUniforms = useRef({
    tDiffuse:    { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1024, 1024) },
    uBlurRadius: { value: savedAsset.blur },
    uOpacity:    { value: savedAsset.opacity },
  })

  // Oracle Q3: pre-instantiate all three materials once. Swap via mesh.material prop.
  // No JSX conditional = no GPU recompilation on toggle.
  const litMat = useMemo(() => new THREE.MeshStandardMaterial({
    roughness: 1.0, metalness: 0.0,
    transparent: true, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide,
    opacity: savedAsset.opacity,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const unlitMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide,
    opacity: savedAsset.opacity,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const blurMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: BLUR_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: blurUniforms.current,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Wire texture into all materials when loaded
  useEffect(() => {
    const img = texture.image as HTMLImageElement | null
    litMat.map = texture;   litMat.needsUpdate = true
    unlitMat.map = texture; unlitMat.needsUpdate = true
    blurUniforms.current.tDiffuse.value = texture
    if (img?.naturalWidth) blurUniforms.current.uResolution.value.set(img.naturalWidth, img.naturalHeight)
  }, [texture, litMat, unlitMat])

  // transient: false on ALL fields read from ctrl — without it, onChange fields are
  // excluded from the values tuple (Leva default: transient=true when onChange present).
  const [ctrl, setCtrl] = useControls(name, () => ({
    x:       { value: savedAsset.x,       min: -20, max: 20,          step: 0.05, transient: false,
               onChange: (v: number) => { valuesRef.current.x = v } },
    y:       { value: savedAsset.y,       min: -6,  max: 12,          step: 0.05, transient: false,
               onChange: (v: number) => { valuesRef.current.y = v } },
    z:       { value: savedAsset.z,       min: -20, max: 20,          step: 0.05, transient: false,
               onChange: (v: number) => { valuesRef.current.z = v } },
    scale:   { value: savedAsset.scale,   min: 0.1, max: 30,          step: 0.1,  transient: false,
               onChange: (v: number) => { valuesRef.current.scale = v } },
    rotX:    { value: savedAsset.rotX,    min: -Math.PI, max: Math.PI, step: 0.01, transient: false,
               onChange: (v: number) => { valuesRef.current.rotX = v } },
    rotY:    { value: savedAsset.rotY,    min: -Math.PI, max: Math.PI, step: 0.01, transient: false,
               onChange: (v: number) => { valuesRef.current.rotY = v } },
    lit:     { value: savedAsset.lit,     label: '💡 lit (receives lights)', transient: false,
               onChange: (v: boolean) => { valuesRef.current.lit = v } },
    opacity: { value: savedAsset.opacity, min: 0,   max: 1,            step: 0.01, transient: false,
               onChange: (v: number) => {
                 valuesRef.current.opacity = v
                 litMat.opacity = v; unlitMat.opacity = v
                 blurUniforms.current.uOpacity.value = v
               }},
    blur:    { value: savedAsset.blur,    min: 0, max: 20, step: 0.1, transient: false,
               render: () => hasBlur,
               onChange: (v: number) => { valuesRef.current.blur = v; blurUniforms.current.uBlurRadius.value = v } },
  }), { store })

  // Active material: lit=true → litMat. lit=false + hasBlur → blurMat. lit=false → unlitMat.
  const activeMat = useMemo(() => {
    if (ctrl.lit) return litMat
    if (hasBlur)  return blurMat
    return unlitMat
  }, [ctrl.lit, litMat, hasBlur, blurMat, unlitMat])

  // Aspect ratio from loaded image dimensions
  const aspect = useMemo(() => {
    const img = texture.image as HTMLImageElement | null
    if (img?.naturalWidth && img?.naturalHeight) return img.naturalWidth / img.naturalHeight
    return 1
  }, [texture])

  return (
    <>
      <mesh
        ref={meshRef}
        material={activeMat}
        position={[ctrl.x, ctrl.y, ctrl.z]}
        rotation={[ctrl.rotX, ctrl.rotY, 0]}
        scale={ctrl.scale}
        renderOrder={renderOrderVal}
        onClick={debug ? (e) => { e.stopPropagation(); onSelect() } : undefined}
      >
        <planeGeometry args={[aspect, 1]} />
      </mesh>

      {debug && selected && (
        <TransformControls
          object={meshRef as React.RefObject<THREE.Object3D>}
          mode="translate"
          onMouseDown={onDragStart}
          onMouseUp={() => {
            if (!meshRef.current) return
            const { x, y, z } = meshRef.current.position
            setCtrl({ x, y, z })
            valuesRef.current.x = x; valuesRef.current.y = y; valuesRef.current.z = z
            onDragEnd()
          }}
        />
      )}
    </>
  )
}
