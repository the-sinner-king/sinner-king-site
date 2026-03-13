/**
 * STAGE DIRECTOR STORE
 * Zustand+persist store for Stage Director state.
 * Oracle Q4: Zustand+persist is the correct pattern for persisting complex R3F scene state.
 * All Stage Director positions/colors/intensities/settings persist across page refreshes.
 * Key: 'sk-stage-v1'
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ────────────────────────────────────────────────────────────────────

export type LightType = 'point' | 'spot' | 'directional'

export interface LightConfig {
  id: string
  storeIndex: number
  label: string
  type: LightType
  x: number; y: number; z: number
  color: string
  intensity: number
  distance: number
}

export interface MonitorSaved {
  x: number; y: number; z: number
  scale: number; rotY: number; color: string; intensity: number; label: string
}

export interface AssetSaved {
  x: number; y: number; z: number
  scale: number; rotX: number; rotY: number
  opacity: number; lit: boolean; blur: number
}

export interface CameraKeyframe {
  y: number; z: number; lookY: number
}

export interface StageSaved {
  monitors: Record<string, MonitorSaved>
  assets: { cables: AssetSaved; monitor: AssetSaved; silo: AssetSaved }
  lights: LightConfig[]
  camera: { y: number; z: number; lookY: number; fov: number }
  atmosphere: {
    fogNear: number; fogFar: number
    bloomIntensity: number; bloomThreshold: number; vignetteDarkness: number
  }
  cameraPath: { start: CameraKeyframe | null; end: CameraKeyframe | null }
}

// ── Defaults — mirror LAYOUT in HomepageLanding (hex strings = palette values) ──

export const DEFAULT_LIGHTS: LightConfig[] = [
  { id: 'key',    storeIndex: 0, label: 'Key',    type: 'point', x:  0,   y:  1,   z:  3,   color: '#ffcc00', intensity: 4,   distance: 0 },
  { id: 'fill',   storeIndex: 1, label: 'Fill',   type: 'point', x: -10,  y:  3,   z: -8,   color: '#bf00ff', intensity: 0.9, distance: 0 },
  { id: 'rim',    storeIndex: 2, label: 'Rim',    type: 'point', x:  8,   y: -1,   z: -12,  color: '#00f3ff', intensity: 0.6, distance: 0 },
  { id: 'bounce', storeIndex: 3, label: 'Bounce', type: 'point', x:  0,   y: -1.8, z:  2,   color: '#ffcc00', intensity: 1.2, distance: 0 },
]

const DEFAULT_STAGE: StageSaved = {
  monitors: {
    altar:    { x: 0,    y: -0.9,  z: 0,    scale: 2.3,  rotY: 0,      color: '#ffcc00', intensity: 1.2,  label: 'altar'            },
    map:      { x: -3.2, y: -1.1,  z: -0.3, scale: 1.0,  rotY: 0.18,   color: '#00f3ff', intensity: 0.28, label: 'monitor_map'      },
    dispatch: { x:  3.2, y: -1.1,  z: -0.3, scale: 1.0,  rotY: -0.18,  color: '#bf00ff', intensity: 0.28, label: 'monitor_dispatch'  },
    archive:  { x: -1.8, y: -1.75, z:  0.5, scale: 0.88, rotY: 0.08,   color: '#39ff14', intensity: 0.28, label: 'monitor_archive'   },
    cinema:   { x:  1.8, y: -1.75, z:  0.5, scale: 0.88, rotY: -0.08,  color: '#ffcc00', intensity: 0.28, label: 'monitor_cinema'    },
  },
  assets: {
    cables:  { x: -3, y: -1.5, z:  1,  scale: 4, rotX: 0, rotY: 0, opacity: 1, lit: true,  blur: 0 },
    monitor: { x:  2, y: -1,   z:  0,  scale: 3, rotX: 0, rotY: 0, opacity: 1, lit: true,  blur: 0 },
    silo:    { x:  0, y:  0.5, z: -5,  scale: 7, rotX: 0, rotY: 0, opacity: 1, lit: false, blur: 0 },
  },
  lights:      DEFAULT_LIGHTS,
  camera:      { y: -0.3, z: 8, lookY: -1.2, fov: 52 },
  atmosphere:  { fogNear: 18, fogFar: 45, bloomIntensity: 0.7, bloomThreshold: 0.3, vignetteDarkness: 0.82 },
  cameraPath:  { start: null, end: null },
}

// ── Store ─────────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50

interface StageStore extends StageSaved {
  // History for undo stack — NOT persisted to localStorage (partialize below)
  _history: StageSaved[]
  save:          (state: Partial<StageSaved>) => void
  saveWithUndo:  (state: Partial<StageSaved>) => void  // pushes current to history first
  undo:          () => void
  reset:         () => void
}

function stageSavedSnapshot(s: StageStore): StageSaved {
  return {
    monitors:   s.monitors,
    assets:     s.assets,
    lights:     s.lights,
    camera:     s.camera,
    atmosphere: s.atmosphere,
    cameraPath: s.cameraPath,
  }
}

export const useStageStore = create<StageStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STAGE,
      _history: [],
      save: (state) => set((s) => ({ ...s, ...state })),
      saveWithUndo: (state) => set((s) => ({
        ...s,
        ...state,
        _history: [
          stageSavedSnapshot(s),
          ...s._history,
        ].slice(0, MAX_HISTORY),
      })),
      undo: () => {
        const { _history } = get()
        if (_history.length === 0) return
        const [prev, ...rest] = _history
        set({ ...prev, _history: rest })
      },
      reset: () => set({ ...DEFAULT_STAGE, _history: [] }),
    }),
    {
      name: 'sk-stage-v1',
      // Exclude undo history from localStorage — it's session-only
      partialize: (s) => ({
        monitors:    s.monitors,
        assets:      s.assets,
        lights:      s.lights,
        camera:      s.camera,
        atmosphere:  s.atmosphere,
        cameraPath:  s.cameraPath,
      }),
    },
  ),
)
