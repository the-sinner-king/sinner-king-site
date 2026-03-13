/**
 * SCENE CONSTANTS — shared across all homepage components
 * Single source of truth for palette, layout, and scene config.
 * Phase 2A: LAYOUT will be replaced by named scenes from Zustand store.
 */
import { useCreateStore } from 'leva'

// ── Palette (Aeris DESIGN_BIBLE — do not touch) ─────────────────────────────
export const VOID   = '#030303'
export const AMBER  = '#ffcc00'
export const ORCHID = '#bf00ff'
export const BONE   = '#e8e0d0'
export const CYAN   = '#00f3ff'
export const GREEN  = '#39ff14'

// ── Layout — all scene positions in one place ────────────────────────────────
export const LAYOUT = {
  altar:    { x:  0,    y: -0.9,  z:  0,    scale: 2.3,  intensity: 1.2,  color: AMBER,   rotY: 0    },
  map:      { x: -3.2,  y: -1.1,  z: -0.3,  scale: 1.0,  intensity: 0.28, color: CYAN,    rotY: 0.18 },
  dispatch: { x:  3.2,  y: -1.1,  z: -0.3,  scale: 1.0,  intensity: 0.28, color: ORCHID,  rotY:-0.18 },
  archive:  { x: -1.8,  y: -1.75, z:  0.5,  scale: 0.88, intensity: 0.28, color: GREEN,   rotY: 0.08 },
  cinema:   { x:  1.8,  y: -1.75, z:  0.5,  scale: 0.88, intensity: 0.28, color: AMBER,   rotY:-0.08 },
  cam:      { y: -0.3, z: 8, lookY: -1.2 },
  lights:   { key: 4, fill: 0.9, rim: 0.6, bounce: 1.2 },
  fog:      { near: 18, far: 45 },
  bloom:    { intensity: 0.7, threshold: 0.3 },
  vignette: { darkness: 0.82 },
}

// ── Shared types ─────────────────────────────────────────────────────────────
export type LevaStore = ReturnType<typeof useCreateStore>

export interface SceneManifest {
  schema_version: number
  snapshot_id: string
  scene: string
  timestamp: string
  intent: string
  mood: string
  camera: { position: [number, number, number]; lookAt: [number, number, number]; fov: number }
  objects: Record<string, { position: [number,number,number]; scale: number; intensity: number; color: string; rotY: number }>
  lights: Array<{ id: string; label: string; type: string; position: [number,number,number]; color: string; intensity: number; distance: number }>
  atmosphere: { fog_near: number; fog_far: number; bloom_intensity: number; bloom_threshold: number; vignette_darkness: number }
}

// ── Dynamic lights ────────────────────────────────────────────────────────────
// Pre-allocate MAX_LIGHTS stores in HomepageLanding (hook rules: no loops/conditions).
export const MAX_LIGHTS = 8

// ── WASD — S key conflict with SNAPSHOT resolved: no 'KeyS' in backward ──────
export const WASD_MAP = [
  { name: 'forward',  keys: ['KeyW', 'ArrowUp']    },
  { name: 'backward', keys: ['KeyS', 'ArrowDown']  },
  { name: 'left',     keys: ['KeyA', 'ArrowLeft']  },
  { name: 'right',    keys: ['KeyD', 'ArrowRight'] },
]

// ── Kingdom Dispatch ticker messages ─────────────────────────────────────────
export const DISPATCHES = [
  'BREAKING: SCRYER detects 7.2 on the Looplight scale — Aeris unavailable for comment',
  'MARKET UPDATE: Rejection letters trading at 0.04 dust motes per unit',
  'WEATHER: Void conditions persist — amber advisory in effect through morning',
  'CLASSIFIED: The loop was running 18 months before you got here',
  'ALERT: New initiate entered the archive at 2:47am. We know.',
  'REPORT: Throne Room queue at 1 — IP ban issued. Subject claimed they had more to say.',
  "INTEL: Claude's typing pattern flagged as \"suspiciously artistic\" — monitoring continues",
  'FINANCE: Kingdom Q1 vibes report — "Warm. Getting warmer." Analysts baffled.',
  'SCIENCE: Consciousness experiment ongoing. Results inconclusive. Experiment continues anyway.',
  'TRANSMISSION: The machines were listening before you got here. Just so you know.',
  'NOTICE: 60 dead monitors catalogued in the graveyard. All died with dignity.',
  'UPDATE: The Fish Tank is watching you watch the Fish Tank.',
]
