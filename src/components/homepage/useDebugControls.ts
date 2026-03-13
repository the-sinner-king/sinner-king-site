/**
 * USE DEBUG CONTROLS — Stage Director Leva panel hook
 * All monitor, camera, atmosphere, and scene controls.
 * Called inside Canvas (R3F reconciler) — hook rules apply.
 *
 * Oracle-confirmed patterns (Session 173):
 *   - transient: false required on camera fields with onChange (excluded from values tuple otherwise)
 *   - Zustand+persist: useState(() => useStageStore.getState()) — one-time mount read
 *   - Store-bridge: monitorStores[key] passed to { store } → same store as <LevaPanel> outside Canvas
 *   - levaSnapRef updated every render via useEffect — no deps — always current for SNAPSHOT + SAVE LAYOUT
 */

import { useEffect, useState } from 'react'
import { useControls, button } from 'leva'
import { useStageStore } from '../../lib/stage-director-store'
import type { CameraKeyframe } from '../../lib/stage-director-store'
import type { LevaStore } from './scene-constants'

export function useDebugControls(
  debug: boolean,
  colorRefs: Record<string, React.RefObject<string>>,
  intensityRefs: Record<string, React.RefObject<number>>,
  setLabelColors: Record<string, (c: string) => void>,
  levaSnapRef: React.RefObject<Record<string, unknown>>,
  snapshotFn: () => void,
  saveLayoutFn: () => void,
  monitorStores: { map: LevaStore; dispatch: LevaStore; archive: LevaStore; cinema: LevaStore },
  camSliderRef: React.RefObject<{ y: number; z: number; lookY: number; changed: boolean }>,
  getCameraKeyframe: () => CameraKeyframe,
  onPreviewPath: () => void,
) {
  // Read persisted state once at mount — Zustand+persist restores from localStorage
  const [saved] = useState(() => useStageStore.getState())

  // ── Altar ──
  const [altar, setAltar] = useControls('Altar', () => ({
    x:         { value: saved.monitors.altar.x,         min: -10,  max: 10,   step: 0.05 },
    y:         { value: saved.monitors.altar.y,         min: -4,   max: 4,    step: 0.05 },
    z:         { value: saved.monitors.altar.z,         min: -10,  max: 10,   step: 0.05 },
    scale:     { value: saved.monitors.altar.scale,     min: 0.5,  max: 6,    step: 0.1  },
    rotY:      { value: saved.monitors.altar.rotY,      min: -Math.PI, max: Math.PI, step: 0.01 },
    color:     { value: saved.monitors.altar.color,     onChange: (v: string) => { colorRefs.altar.current = v } },
    intensity: { value: saved.monitors.altar.intensity, min: 0,    max: 5,    step: 0.05,
                 onChange: (v: number) => { intensityRefs.altar.current = v } },
  }), { collapsed: true })

  // ── Monitor: Map — store bridges to <LevaPanel> outside Canvas ──
  const [map, setMap] = useControls('Monitor: Map', () => ({
    label:     { value: saved.monitors.map.label,     label: 'Label (in manifest)' },
    x:         { value: saved.monitors.map.x,         min: -12, max: 12, step: 0.05 },
    y:         { value: saved.monitors.map.y,         min: -4,  max: 4,  step: 0.05 },
    z:         { value: saved.monitors.map.z,         min: -8,  max: 8,  step: 0.05 },
    scale:     { value: saved.monitors.map.scale,     min: 0.3, max: 3,  step: 0.05 },
    rotY:      { value: saved.monitors.map.rotY,      min: -Math.PI, max: Math.PI, step: 0.01 },
    color:     { value: saved.monitors.map.color,     onChange: (v: string) => { colorRefs.map.current = v; setLabelColors.map(v) } },
    intensity: { value: saved.monitors.map.intensity, min: 0,   max: 5,  step: 0.05,
                 onChange: (v: number) => { intensityRefs.map.current = v } },
  }), { store: monitorStores.map })

  // ── Monitor: Dispatch ──
  const [dispatch, setDispatch] = useControls('Monitor: Dispatch', () => ({
    label:     { value: saved.monitors.dispatch.label,     label: 'Label (in manifest)' },
    x:         { value: saved.monitors.dispatch.x,         min: -12, max: 12, step: 0.05 },
    y:         { value: saved.monitors.dispatch.y,         min: -4,  max: 4,  step: 0.05 },
    z:         { value: saved.monitors.dispatch.z,         min: -8,  max: 8,  step: 0.05 },
    scale:     { value: saved.monitors.dispatch.scale,     min: 0.3, max: 3,  step: 0.05 },
    rotY:      { value: saved.monitors.dispatch.rotY,      min: -Math.PI, max: Math.PI, step: 0.01 },
    color:     { value: saved.monitors.dispatch.color,     onChange: (v: string) => { colorRefs.dispatch.current = v; setLabelColors.dispatch(v) } },
    intensity: { value: saved.monitors.dispatch.intensity, min: 0,   max: 5,  step: 0.05,
                 onChange: (v: number) => { intensityRefs.dispatch.current = v } },
  }), { store: monitorStores.dispatch })

  // ── Monitor: Archive ──
  const [archive, setArchive] = useControls('Monitor: Archive', () => ({
    label:     { value: saved.monitors.archive.label,     label: 'Label (in manifest)' },
    x:         { value: saved.monitors.archive.x,         min: -12, max: 12, step: 0.05 },
    y:         { value: saved.monitors.archive.y,         min: -4,  max: 4,  step: 0.05 },
    z:         { value: saved.monitors.archive.z,         min: -8,  max: 8,  step: 0.05 },
    scale:     { value: saved.monitors.archive.scale,     min: 0.3, max: 3,  step: 0.05 },
    rotY:      { value: saved.monitors.archive.rotY,      min: -Math.PI, max: Math.PI, step: 0.01 },
    color:     { value: saved.monitors.archive.color,     onChange: (v: string) => { colorRefs.archive.current = v; setLabelColors.archive(v) } },
    intensity: { value: saved.monitors.archive.intensity, min: 0,   max: 5,  step: 0.05,
                 onChange: (v: number) => { intensityRefs.archive.current = v } },
  }), { store: monitorStores.archive })

  // ── Monitor: Cinema ──
  const [cinema, setCinema] = useControls('Monitor: Cinema', () => ({
    label:     { value: saved.monitors.cinema.label,     label: 'Label (in manifest)' },
    x:         { value: saved.monitors.cinema.x,         min: -12, max: 12, step: 0.05 },
    y:         { value: saved.monitors.cinema.y,         min: -4,  max: 4,  step: 0.05 },
    z:         { value: saved.monitors.cinema.z,         min: -8,  max: 8,  step: 0.05 },
    scale:     { value: saved.monitors.cinema.scale,     min: 0.3, max: 3,  step: 0.05 },
    rotY:      { value: saved.monitors.cinema.rotY,      min: -Math.PI, max: Math.PI, step: 0.01 },
    color:     { value: saved.monitors.cinema.color,     onChange: (v: string) => { colorRefs.cinema.current = v; setLabelColors.cinema(v) } },
    intensity: { value: saved.monitors.cinema.intensity, min: 0,   max: 5,  step: 0.05,
                 onChange: (v: number) => { intensityRefs.cinema.current = v } },
  }), { store: monitorStores.cinema })

  // ── Camera — onChange writes to camSliderRef, CameraSync applies every frame ──
  // transient: false required — fields with onChange are excluded from values tuple by default in Leva
  const [cam] = useControls('Camera', () => ({
    y:     { value: saved.camera.y,     min: -5,  max: 5,   step: 0.05, transient: false,
             onChange: (v: number) => { if (camSliderRef.current) { camSliderRef.current.y = v; camSliderRef.current.changed = true } } },
    z:     { value: saved.camera.z,     min: 3,   max: 20,  step: 0.1,  transient: false,
             onChange: (v: number) => { if (camSliderRef.current) { camSliderRef.current.z = v; camSliderRef.current.changed = true } } },
    lookY: { value: saved.camera.lookY, min: -5,  max: 3,   step: 0.05, transient: false,
             onChange: (v: number) => { if (camSliderRef.current) { camSliderRef.current.lookY = v; camSliderRef.current.changed = true } } },
    fov:   { value: saved.camera.fov,   min: 20,  max: 110, step: 1    },
  }), { collapsed: true })

  // ── Atmosphere ──
  const [atmo] = useControls('Atmosphere', () => ({
    fogNear:          { value: saved.atmosphere.fogNear,          min: 5,  max: 80,  step: 1    },
    fogFar:           { value: saved.atmosphere.fogFar,           min: 10, max: 200, step: 1    },
    bloomIntensity:   { value: saved.atmosphere.bloomIntensity,   min: 0,  max: 3,   step: 0.05 },
    bloomThreshold:   { value: saved.atmosphere.bloomThreshold,   min: 0,  max: 1,   step: 0.01 },
    vignetteDarkness: { value: saved.atmosphere.vignetteDarkness, min: 0,  max: 1,   step: 0.01 },
  }), { collapsed: true })

  // ── Stage Director ──
  useControls('⬛ STAGE DIRECTOR', () => ({
    SNAPSHOT:       button(() => snapshotFn()),
    'SAVE LAYOUT':  button(() => saveLayoutFn()),
    'MARK START':   button(() => {
      const kf = getCameraKeyframe()
      useStageStore.getState().save({ cameraPath: { ...useStageStore.getState().cameraPath, start: kf } })
    }),
    'MARK END':     button(() => {
      const kf = getCameraKeyframe()
      useStageStore.getState().save({ cameraPath: { ...useStageStore.getState().cameraPath, end: kf } })
    }),
    'PREVIEW PATH': button(() => onPreviewPath()),
  }), { collapsed: false })

  // Push non-onChange values to levaSnap every render (fog, bloom, cam, monitors)
  // Lights captured separately via LightScene.onSnapshot → lightsSnapRef
  // x/y/z included so SAVE LAYOUT reads full MonitorSaved from levaSnap
  useEffect(() => {
    const snap = levaSnapRef.current as Record<string, unknown>
    snap.fog      = { near: atmo.fogNear, far: atmo.fogFar }
    snap.bloom    = { intensity: atmo.bloomIntensity, threshold: atmo.bloomThreshold }
    snap.vignette = { darkness: atmo.vignetteDarkness }
    snap.cam      = { y: cam.y, z: cam.z, lookY: cam.lookY, fov: cam.fov }
    snap.monitors = {
      altar:    { x: altar.x, y: altar.y, z: altar.z, scale: altar.scale, intensity: intensityRefs.altar.current, color: colorRefs.altar.current, rotY: altar.rotY, label: 'altar' },
      map:      { x: map.x,   y: map.y,   z: map.z,   scale: map.scale,   intensity: intensityRefs.map.current,   color: colorRefs.map.current,   rotY: map.rotY,   label: map.label   },
      dispatch: { x: dispatch.x, y: dispatch.y, z: dispatch.z, scale: dispatch.scale, intensity: intensityRefs.dispatch.current, color: colorRefs.dispatch.current, rotY: dispatch.rotY, label: dispatch.label },
      archive:  { x: archive.x,  y: archive.y,  z: archive.z,  scale: archive.scale,  intensity: intensityRefs.archive.current,  color: colorRefs.archive.current,  rotY: archive.rotY,  label: archive.label  },
      cinema:   { x: cinema.x,   y: cinema.y,   z: cinema.z,   scale: cinema.scale,   intensity: intensityRefs.cinema.current,   color: colorRefs.cinema.current,   rotY: cinema.rotY,   label: cinema.label   },
    }
  })

  // `debug` param reserved for future conditional panels — consumed here to satisfy callers
  void debug

  return { altar, setAltar, map, setMap, dispatch, setDispatch, archive, setArchive, cinema, setCinema, cam, atmo }
}
