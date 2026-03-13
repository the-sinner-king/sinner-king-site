'use client'

/**
 * HOMEPAGE LANDING — sinner-king.com
 * S173 — Stage Director Phase 1B
 *
 * DEBUG MODE: press ` (backtick) to toggle
 *   - Leva panel: color pickers, intensity, scale, rotation, atmosphere, SNAPSHOT
 *   - OrbitControls: free camera orbit + WASD fly (W/A/D + arrow keys)
 *   - TransformControls: object-prop pattern — monitors never unmount/remount
 *   - Monitor click → auto-expands that monitor's Leva panel (collapses others)
 *   - Dynamic lights: add/remove lights with individual panels
 *   - CameraSync: camera sliders now move camera in debug mode
 *   - SNAPSHOT button: builds Scene Manifest JSON → clipboard
 *
 * ORACLE-CONFIRMED PATTERNS (Session 173, 10 loops):
 *   - useControls callback form () => schema → [values, set, get] tuple
 *   - onChange: (v) => ref.current = v — bypass React scheduler for per-frame mutations
 *   - material.color.set(v) — mutates in-place, zero GC
 *   - useMemo with [] deps — material never rebuilds
 *   - TransformControls object prop — sibling, not wrapper
 *   - onMouseUp → set({ x, y, z }) — sync Leva on drag release only
 *   - Store bridges R3F + DOM reconcilers: create in parent, pass to both useControls({ store }) inside Canvas AND <LevaPanel> outside
 *   - KeyboardControls outside Canvas — drei bridges the reconciler gap
 *   - LightStoreProvider pattern: pre-allocate stores in HomepageLanding, assign by storeIndex
 */

import { Component, Suspense, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Float, Html,
  MeshReflectorMaterial, RoundedBox,
  TransformControls, OrbitControls,
  KeyboardControls, useKeyboardControls,
  useTexture,
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { useControls, button, useCreateStore, LevaPanel } from 'leva'
import { useRouter } from 'next/navigation'
import * as THREE from 'three'
import { getRandomTrack } from '../sinnerking-radio/radio-tracks'
import type { RadioTrack } from '../sinnerking-radio/radio-tracks'
import { useStageStore, DEFAULT_LIGHTS } from '../../lib/stage-director-store'
import type { LightType, LightConfig, AssetSaved, MonitorSaved } from '../../lib/stage-director-store'
import {
  VOID, AMBER, ORCHID, BONE, CYAN, GREEN,
  LAYOUT, MAX_LIGHTS, WASD_MAP, DISPATCHES,
  type LevaStore, type SceneManifest,
} from './scene-constants'
import { LightScene } from './LightScene'
import { SpriteAssetController } from './SpriteAssetController'
import { useDebugControls } from './useDebugControls'
import { Scene } from './Scene'

// ── ErrorBoundary — catches Canvas render errors, shows glitch fallback ──────
interface ErrorBoundaryState { hasError: boolean }
class CanvasErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CanvasErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0,
          background: '#030303', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', color: '#00f3ff',
          flexDirection: 'column', gap: '12px',
        }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.4em', opacity: 0.9 }}>
            ⊘ SIGNAL LOST
          </div>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', opacity: 0.4 }}>
            reload to restore the void
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── SceneLoadingFallback — R3F fallback while textures suspend ───────────────
// Renders inside Canvas — must be R3F JSX, not HTML
function SceneLoadingFallback() {
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const t = clock.getElapsedTime()
      ;(meshRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.3 + Math.sin(t * 2) * 0.15
    }
  })
  return (
    <>
      <ambientLight intensity={0.1} />
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#00f3ff" transparent opacity={0.3} />
      </mesh>
    </>
  )
}

// ── Constants + types — imported from scene-constants.ts ──────────────────────
// VOID, AMBER, ORCHID, BONE, CYAN, GREEN, LAYOUT, MAX_LIGHTS, WASD_MAP, DISPATCHES
// LevaStore, SceneManifest — all live in ./scene-constants.ts
// LightType, LightConfig, AssetSaved, MonitorSaved — from stage-director-store


// ── DispatchTicker ─────────────────────────────────────────────────────────────
function DispatchTicker() {
  const [idx, setIdx]         = useState(() => Math.floor(Math.random() * DISPATCHES.length))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Store inner timeout so it can be cleared if component unmounts during the 500ms fade
    let innerId: ReturnType<typeof setTimeout> | null = null
    const interval = setInterval(() => {
      setVisible(false)
      innerId = setTimeout(() => {
        setIdx(i => (i + 1) % DISPATCHES.length)
        setVisible(true)
      }, 500)
    }, 8000)
    return () => { clearInterval(interval); if (innerId) clearTimeout(innerId) }
  }, [])

  return (
    <div id="dispatch-ticker" style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '8px 20px', background: 'rgba(3, 3, 3, 0.88)',
      borderTop: '1px solid rgba(255, 204, 0, 0.12)',
      display: 'flex', alignItems: 'center', gap: '14px', zIndex: 20,
    }}>
      <span style={{ color: AMBER, fontFamily: 'monospace', fontSize: '9px', letterSpacing: '0.35em', opacity: 0.45, flexShrink: 0 }}>
        KINGDOM DISPATCH
      </span>
      <span style={{
        color: BONE, fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.08em',
        opacity: visible ? 0.8 : 0, transition: 'opacity 0.45s ease',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        ▸ {DISPATCHES[idx]}
      </span>
    </div>
  )
}

// ── RadioMiniPlayer ────────────────────────────────────────────────────────────
function RadioMiniPlayer() {
  const audioRef              = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [track, setTrack]     = useState<RadioTrack>(() => getRandomTrack())

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current             = new Audio(`/audio/${track.filename}`)
      audioRef.current.crossOrigin = 'anonymous'
      audioRef.current.onended     = () => {
        const next = getRandomTrack()
        setTrack(next)
        setPlaying(false)
      }
    }
    if (playing) {
      audioRef.current.pause(); setPlaying(false)
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {})
    }
  }

  useEffect(() => {
    if (audioRef.current && playing) {
      audioRef.current.pause()
      audioRef.current             = new Audio(`/audio/${track.filename}`)
      audioRef.current.crossOrigin = 'anonymous'
      // Re-attach onended so auto-advance works on every track, not just the first
      audioRef.current.onended = () => {
        const next = getRandomTrack()
        setTrack(next)
        setPlaying(false)
      }
      audioRef.current.play().catch(() => {})
    }
  }, [track]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return () => { audioRef.current?.pause() } }, [])

  return (
    <div style={{
      position: 'absolute', top: 18, right: 18, zIndex: 20,
      display: 'flex', alignItems: 'center', gap: '10px',
      background: 'rgba(3, 3, 3, 0.85)',
      border: `1px solid rgba(255, 204, 0, ${playing ? '0.35' : '0.12'})`,
      padding: '7px 14px 7px 10px', fontFamily: 'monospace', transition: 'border-color 0.3s',
    }}>
      <button
        onClick={toggle}
        style={{
          color: AMBER, background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '13px', padding: 0, lineHeight: 1,
          textShadow: playing ? `0 0 8px ${AMBER}` : 'none',
        }}
        title={playing ? 'Pause radio' : 'Play Sinner King Radio'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ color: AMBER, fontSize: '8px', letterSpacing: '0.3em', opacity: 0.4 }}>
          {playing ? 'NOW PLAYING' : 'SINNER KING RADIO'}
        </span>
        {playing && (
          <span style={{ color: BONE, fontSize: '10px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>
            {track.title}
          </span>
        )}
      </div>
    </div>
  )
}

// ── HomepageLanding ────────────────────────────────────────────────────────────
export function HomepageLanding() {
  const [mounted,   setMounted]   = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const camHudRef = useRef<HTMLPreElement>(null)

  // ── Monitor stores — created above Canvas so <LevaPanel> can render outside ──
  // Store bridges R3F + DOM reconcilers: same instance powers useControls({ store })
  // inside Canvas AND <LevaPanel> outside. Oracle-confirmed pattern.
  const mapStore      = useCreateStore()
  const dispatchStore = useCreateStore()
  const archiveStore  = useCreateStore()
  const cinemaStore   = useCreateStore()
  const monitorStores = useMemo(
    () => ({ map: mapStore, dispatch: dispatchStore, archive: archiveStore, cinema: cinemaStore }),
    [mapStore, dispatchStore, archiveStore, cinemaStore],
  )

  // ── Sprite asset stores — bridges Canvas useControls → DOM LevaPanels ──────
  const cablesStore  = useCreateStore()
  const monitorStore = useCreateStore()
  const siloStore    = useCreateStore()
  const assetStores  = useMemo(
    () => ({ cables: cablesStore, monitor: monitorStore, silo: siloStore }),
    [cablesStore, monitorStore, siloStore],
  )

  // ── Pre-allocated light stores (MAX_LIGHTS = 8) ────────────────────────────
  // Hooks can't be in loops/conditionals — pre-allocate all 8, assign by storeIndex.
  // GN-01: freed storeIndex retains orphaned data in store (cosmetic — won't be shown).
  const ls0 = useCreateStore(); const ls1 = useCreateStore()
  const ls2 = useCreateStore(); const ls3 = useCreateStore()
  const ls4 = useCreateStore(); const ls5 = useCreateStore()
  const ls6 = useCreateStore(); const ls7 = useCreateStore()
  const lightStores = useMemo(
    () => [ls0, ls1, ls2, ls3, ls4, ls5, ls6, ls7],
    [ls0, ls1, ls2, ls3, ls4, ls5, ls6, ls7],
  )

  // ── Selected monitor — lifted so <LevaPanel collapsed> can react ───────────
  const [selectedMonitor, setSelectedMonitor] = useState<string | null>(null)

  // ── Dynamic lights — init from persisted store (restores across refreshes) ──
  const [lights, setLights] = useState<LightConfig[]>(() => useStageStore.getState().lights)

  const addLight = () => {
    const used = new Set(lights.map(l => l.storeIndex))
    const nextIdx = [0,1,2,3,4,5,6,7].find(i => !used.has(i))
    if (nextIdx === undefined) return
    setLights(prev => [...prev, {
      id: crypto.randomUUID(),
      storeIndex: nextIdx,
      label: `Light ${prev.length + 1}`,
      type: 'point' as LightType,
      x: 0, y: 3, z: 0,
      color: '#ffffff',
      intensity: 2,
      distance: 0,
    }])
  }

  const removeLight = (id: string) => setLights(prev => prev.filter(l => l.id !== id))

  useEffect(() => { setMounted(true) }, [])

  // ` toggles debug mode. S fires SNAPSHOT (only when not typing in a Leva input).
  const snapshotRef    = useRef<(() => void) | null>(null)
  const resetCameraRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`') setDebugMode(d => !d)
      // Snapshot is Leva button only — S is now WASD backward
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!mounted) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: VOID,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(0, 243, 255, 0.4)', fontFamily: 'monospace',
        fontSize: '11px', letterSpacing: '0.3em',
      }}>
        INITIALIZING SIGNAL...
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: VOID }}>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @media (max-width: 640px) {
          #dispatch-ticker { display: none !important; }
        }
      `}</style>

      {/* KeyboardControls wraps Canvas — drei bridges the reconciler gap internally */}
      <CanvasErrorBoundary>
        <KeyboardControls map={WASD_MAP}>
          <Canvas
            dpr={[1, 2]}
            camera={{ position: [0, -2.5, 12], fov: 52 }}
            gl={{ antialias: true, alpha: false }}
            shadows
            onPointerLeave={() => { document.body.style.cursor = 'auto' }}
            onPointerMissed={() => setSelectedMonitor(null)}
          >
            {/* Suspense catches useTexture and other async resource loads */}
            <Suspense fallback={<SceneLoadingFallback />}>
              <Scene
                debug={debugMode}
                camHudRef={camHudRef}
                snapshotRef={snapshotRef}
                resetCameraRef={resetCameraRef}
                selectedMonitor={selectedMonitor}
                onMonitorSelect={setSelectedMonitor}
                monitorStores={monitorStores}
                lights={lights}
                lightStores={lightStores}
                onRemoveLight={removeLight}
                assetStores={assetStores}
              />
            </Suspense>
          </Canvas>
        </KeyboardControls>
      </CanvasErrorBoundary>

      {/* ── Monitor LevaPanels — left side, collapse/expand with selection ─── */}
      {debugMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, zIndex: 1000,
          overflow: 'auto', maxHeight: '100vh',
        }}>
          {/* z-index: selected panel jumps to front (z=100), others stay at z=1 */}
          {([
            { key: 'map',      store: mapStore,      title: '📺 Monitor: Map' },
            { key: 'dispatch', store: dispatchStore,  title: '📺 Monitor: Dispatch' },
            { key: 'archive',  store: archiveStore,   title: '📺 Monitor: Archive' },
            { key: 'cinema',   store: cinemaStore,    title: '📺 Monitor: Cinema' },
          ] as const).map(({ key, store, title }) => (
            <div key={key} style={{ position: 'relative', zIndex: selectedMonitor === key ? 100 : 1 }}>
              <LevaPanel
                store={store}
                collapsed={{ collapsed: selectedMonitor !== key, onChange: (c) => { if (!c) setSelectedMonitor(key) } }}
                titleBar={{ title }}
              />
            </div>
          ))}

          {/* ── Light LevaPanels — one per dynamic light ── */}
          {lights.map(cfg => (
            <div key={cfg.id} style={{ position: 'relative', zIndex: selectedMonitor === `light-${cfg.id}` ? 100 : 1 }}>
              <LevaPanel
                store={lightStores[cfg.storeIndex]}
                titleBar={{ title: `💡 ${cfg.label}` }}
              />
            </div>
          ))}

          {/* ── Asset LevaPanels — one per sprite asset ── */}
          {([
            { key: 'asset-cables',  store: cablesStore,  title: '🖼 Asset: Cables' },
            { key: 'asset-monitor', store: monitorStore, title: '🖼 Asset: Monitor' },
            { key: 'asset-silo',    store: siloStore,    title: '🖼 Asset: Silo' },
          ] as const).map(({ key, store, title }) => (
            <div key={key} style={{ position: 'relative', zIndex: selectedMonitor === key ? 100 : 1 }}>
              <LevaPanel
                store={store}
                collapsed={{ collapsed: selectedMonitor !== key, onChange: (c) => { if (!c) setSelectedMonitor(key) } }}
                titleBar={{ title }}
              />
            </div>
          ))}

          {/* Add Light button */}
          {lights.length < MAX_LIGHTS && (
            <button
              onClick={addLight}
              style={{
                display: 'block', width: '100%',
                background: 'rgba(3,3,3,0.9)', border: `1px solid ${CYAN}44`,
                color: CYAN, fontFamily: 'monospace', fontSize: '10px',
                letterSpacing: '0.2em', padding: '8px 12px', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              + ADD LIGHT
            </button>
          )}
        </div>
      )}

      {/* SNAPSHOT flash overlay */}
      <div
        id="snapshot-flash"
        style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: CYAN, fontFamily: 'monospace', fontSize: '14px',
          letterSpacing: '0.3em', background: 'rgba(3,3,3,0.92)',
          border: `1px solid ${CYAN}66`, padding: '14px 28px',
          zIndex: 50, opacity: 0, transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
        }}
      >
        ◉ SNAPSHOT COPIED TO CLIPBOARD
      </div>

      {/* DEBUG: camera position HUD */}
      {debugMode && (
        <pre ref={camHudRef} style={{
          position: 'absolute', bottom: 48, left: 16, zIndex: 30,
          color: CYAN, fontFamily: 'monospace', fontSize: '11px',
          lineHeight: 1.6, background: 'rgba(3, 3, 3, 0.88)',
          border: `1px solid ${CYAN}33`, padding: '8px 12px',
          userSelect: 'all', pointerEvents: 'none', whiteSpace: 'pre',
        }}>
          loading camera...
        </pre>
      )}

      {/* DEBUG: mode indicator + camera reset */}
      {debugMode && (
        <div style={{
          position: 'absolute', top: 16, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30, display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <div style={{
            color: CYAN, fontFamily: 'monospace',
            fontSize: '10px', letterSpacing: '0.3em',
            background: 'rgba(3, 3, 3, 0.88)',
            border: `1px solid ${CYAN}66`, padding: '6px 12px',
          }}>
            ◉ STAGE DIRECTOR — ` to exit · click to select · drag to move · WASD+arrows=fly
          </div>
          <button
            onClick={() => resetCameraRef.current?.()}
            style={{
              background: 'rgba(3, 3, 3, 0.88)', border: `1px solid ${CYAN}66`,
              color: CYAN, fontFamily: 'monospace', fontSize: '10px',
              letterSpacing: '0.2em', padding: '6px 12px', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            RESET CAM
          </button>
        </div>
      )}

      {/* Radio hides in debug mode — Leva occupies top-right */}
      {!debugMode && <RadioMiniPlayer />}
      <DispatchTicker />

      {/* ── Coming Soon overlay — ominous bottom anchor ───────────── */}
      {!debugMode && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '18px 16px 22px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: '9px',
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            color: 'rgba(112, 0, 255, 0.5)',
            marginBottom: '6px',
          }}>
            sinner-king.com
          </div>
          <div style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: 'rgba(224, 221, 240, 0.15)',
          }}>
            something is coming
          </div>
        </div>
      )}
    </div>
  )
}
