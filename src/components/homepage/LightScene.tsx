'use client'

/**
 * LIGHT SCENE — dynamic light with debug sphere + TransformControls
 * Oracle-confirmed pattern (Session 173):
 *   - Imperative position via useEffect — never JSX position on TC-controlled group
 *   - useControls with { store } — bridges R3F and DOM reconcilers
 *   - onMouseUp (not onObjectChange) for TC → Leva sync
 */

import { useEffect, useRef } from 'react'
import { TransformControls } from '@react-three/drei'
import { useControls, button } from 'leva'
import * as THREE from 'three'
import type { LevaStore } from './scene-constants'
import type { LightConfig, LightType } from '../../lib/stage-director-store'

export function LightScene({
  config,
  store,
  debug,
  selected,
  onSelect,
  onRemove,
  onSnapshot,
  onDragStart,
  onDragEnd,
}: {
  config: LightConfig
  store: LevaStore
  debug: boolean
  selected: boolean
  onSelect: () => void
  onRemove: (id: string) => void
  onSnapshot: (id: string, values: LightConfig) => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const onRemoveRef = useRef(onRemove)
  onRemoveRef.current = onRemove

  const groupRef = useRef<THREE.Group>(null)

  const [lc, setLc] = useControls(config.label, () => ({
    label:     { value: config.label, label: 'Name' },
    type:      { value: config.type, options: { Point: 'point' as const, Spot: 'spot' as const, Directional: 'directional' as const } },
    x:         { value: config.x, min: -30, max: 30, step: 0.1 },
    y:         { value: config.y, min: -10, max: 20, step: 0.1 },
    z:         { value: config.z, min: -30, max: 30, step: 0.1 },
    color:     { value: config.color },
    intensity: { value: config.intensity, min: 0, max: 20, step: 0.1 },
    distance:  { value: config.distance, min: 0, max: 50, step: 0.5, label: 'distance (0=∞)' },
    REMOVE:    button(() => onRemoveRef.current(config.id)),
  }), { store })

  // Keep lightsSnapRef current after every render
  useEffect(() => {
    onSnapshot(config.id, {
      ...config,
      x: lc.x, y: lc.y, z: lc.z,
      color: lc.color,
      intensity: lc.intensity,
      distance: lc.distance,
      type: lc.type as LightType,
      label: lc.label,
    })
  })

  // Imperative position — avoids JSX-controlled vs TransformControls race condition.
  // TC drag mutates groupRef.current.position directly. Any React re-render with
  // position={[lc.x, lc.y, lc.z]} would snap light back to pre-drag values.
  useEffect(() => {
    if (groupRef.current) groupRef.current.position.set(lc.x, lc.y, lc.z)
  }, [lc.x, lc.y, lc.z])

  return (
    <>
      {/* Group has no JSX position — set imperatively via useEffect above */}
      <group ref={groupRef}>
        {lc.type === 'point'       && <pointLight       color={lc.color} intensity={lc.intensity} distance={lc.distance} />}
        {lc.type === 'spot'        && <spotLight        color={lc.color} intensity={lc.intensity} distance={lc.distance} angle={Math.PI / 6} penumbra={0.2} />}
        {lc.type === 'directional' && <directionalLight color={lc.color} intensity={lc.intensity} />}
        {/* Debug helper — wireframe sphere, clickable to select */}
        {debug && (
          <mesh onClick={(e) => { e.stopPropagation(); onSelect() }}>
            <sphereGeometry args={[0.22, 10, 10]} />
            <meshBasicMaterial
              color={selected ? '#ffffff' : lc.color}
              transparent opacity={selected ? 1.0 : 0.85}
              wireframe
            />
          </mesh>
        )}
      </group>

      {/* TransformControls — translate mode, sibling of group (object prop pattern) */}
      {debug && selected && (
        <TransformControls
          object={groupRef as React.RefObject<THREE.Object3D>}
          mode="translate"
          onMouseDown={onDragStart}
          onMouseUp={() => {
            if (!groupRef.current) return
            const { x, y, z } = groupRef.current.position
            setLc({ x, y, z })
            onDragEnd()
          }}
        />
      )}
    </>
  )
}
