'use client'

/**
 * client.tsx — Client Component wrapper for the Kingdom Map
 *
 * `next/dynamic` with `ssr: false` must live inside a Client Component.
 * This wrapper handles that, then gets rendered by the Server Component page.tsx.
 *
 * 🏛️ ARCHAEOLOGICAL RECORD // WebGL Pre-Flight Gate
 * 🗓️ 2026-02-27 | Session 132
 * ISSUE: R3F Canvas throws in useIsomorphicLayoutEffect when WebGL context creation fails.
 *        React Error Boundaries do NOT catch errors from effects — only from render.
 *        The error bypasses the boundary and crashes the page.
 * RESOLUTION: Pre-flight WebGL check runs synchronously before Canvas mounts.
 *             If WebGL unavailable → show fallback. Never attempt Canvas creation.
 * LAW: Always gate 3D Canvas on a synchronous WebGL availability check.
 *      Error boundaries alone are insufficient for effect-phase throws.
 * 🦖 X-RAY: If fallback shows after Chrome restart, check chrome://settings/system
 *           → "Use hardware acceleration when available" must be ON.
 *           GL_VENDOR=Disabled means Chrome GPU process is sandboxed/disabled — not code.
 */

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ProductionQueueHUD } from '@/components/kingdom/ProductionQueueHUD'
import { KingdomErrorBoundary } from '@/components/kingdom/KingdomErrorBoundary'
import { TokenHUD } from '@/components/kingdom/TokenHUD'
import { PresenceStrip, ClaudeStatusBadge } from '@/components/kingdom/PresenceHUD'
import { HeraldTicker } from '@/components/kingdom/HeraldTicker'
import { AgentPanel } from '@/components/kingdom/AgentPanel'
import { KingdomLiveProvider, useKingdomLive } from '@/lib/kingdom-live-context'
import { useKingdomStore } from '@/lib/kingdom-store'
import { SinnerKingRadio } from '@/components/sinnerking-radio/SinnerKingRadio'
import { MissionClock } from '@/components/kingdom/MissionClock'
import { SystemLog } from '@/components/kingdom/SystemLog'
import { TokenBurnHUD } from '@/components/kingdom/TokenBurnHUD'
import { RavenArrivalFlash } from '@/components/kingdom/RavenArrivalFlash'
import { useBrandonPresenceDetector } from '@/hooks/useBrandonPresenceDetector'
import {
  startPatternEngine,
  stopPatternEngine,
  setPatternEngineIntensity,
  setPatternEngineBrandon,
} from '@/lib/pattern-engine'

// ---------------------------------------------------------------------------
// WebGL availability check (runs synchronously on client mount)
// ---------------------------------------------------------------------------

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const ctx =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    if (!ctx) return false
    // Clean up the test context
    const ext = (ctx as WebGLRenderingContext).getExtension('WEBGL_lose_context')
    ext?.loseContext()
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Fallback UI — shown when WebGL is unavailable
// ---------------------------------------------------------------------------

function WebGLUnavailable() {
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        gap: 12,
      }}
    >
      <div style={{ color: '#7000ff', fontSize: 13, letterSpacing: '0.15em' }}>
        THE KINGDOM MAP
      </div>
      <div style={{ color: '#ff006e', fontSize: 11, letterSpacing: '0.12em' }}>
        ⬡ WebGL context unavailable
      </div>
      <div
        style={{
          color: '#504840',
          fontSize: 10,
          maxWidth: 320,
          textAlign: 'center',
          lineHeight: 1.7,
          marginTop: 4,
        }}
      >
        Enable hardware acceleration in Chrome:
        <br />
        <span style={{ color: '#a09888' }}>chrome://settings/system</span>
        <br />→ &quot;Use hardware acceleration when available&quot; → ON → Relaunch
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading screen — animated 3-state indicator (CONNECTING → KINGDOM LOADING → READY)
// ---------------------------------------------------------------------------

function KingdomLoadingScreen() {
  return (
    <>
      <style href="kingdom-loading-anim" precedence="default">{`
        @keyframes waking-title {
          0%   { opacity: 0; letter-spacing: 0.4em; }
          100% { opacity: 1; letter-spacing: 0.22em; }
        }
        @keyframes waking-sub {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes waking-dots {
          0%   { opacity: 0.2; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.2; }
        }
      `}</style>
      <div style={{
        width:          '100%',
        height:         '100vh',
        background:     '#0a0a0f',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'monospace',
        gap:            12,
      }}>
        <div style={{
          color:       '#7000ff',
          fontSize:    11,
          letterSpacing: '0.22em',
          animation:   'waking-title 1.8s ease-out forwards',
        }}>
          T H E &nbsp; K I N G D O M
        </div>
        <div style={{
          color:       '#3a3438',
          fontSize:    10,
          letterSpacing: '0.18em',
          animation:   'waking-sub 2.4s ease-out forwards',
        }}>
          I S &nbsp; W A K I N G
        </div>
        <div style={{
          color:       '#504840',
          fontSize:    9,
          letterSpacing: '0.3em',
          marginTop:   8,
          animation:   'waking-dots 1.6s ease-in-out infinite',
        }}>
          · · ·
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Dynamic import — deferred until browser, never on server
// ---------------------------------------------------------------------------

const KingdomScene3D = dynamic(
  () =>
    import('@/components/kingdom/KingdomScene3D').then((mod) => ({
      default: mod.KingdomScene3D,
    })),
  {
    ssr: false,
    loading: KingdomLoadingScreen,
  }
)

// ---------------------------------------------------------------------------
// KingdomLiveSync — bridges KingdomLiveContext → KingdomStore
//
// Pure side-effect component. Must render inside <KingdomLiveProvider>.
// Fires on every 15s context update and hydrates the 3D scene's Zustand store
// with fresh agent states + mood. This is what makes buildings glow.
// ---------------------------------------------------------------------------

function KingdomLiveSync() {
  const { data } = useKingdomLive()

  useEffect(() => {
    if (!data) return
    const store = useKingdomStore.getState()
    store.hydrateMood(data.mood)
    store.hydrateAgentStates(data.agents)
  }, [data])

  return null
}

// ---------------------------------------------------------------------------
// PatternEngineBridge — feeds external values into the pattern engine singleton
// and manages its lifecycle. Must render inside <KingdomLiveProvider>.
// ---------------------------------------------------------------------------

function PatternEngineBridge() {
  const { data } = useKingdomLive()
  const storeBrandonPresent = useKingdomStore((s) => s.brandonPresent)
  const localBrandonPresent = useBrandonPresenceDetector()
  const effectiveBrandonPresent = storeBrandonPresent || localBrandonPresent

  useEffect(() => {
    startPatternEngine()
    return () => stopPatternEngine()
  }, [])

  useEffect(() => {
    if (data?.tokens?.intensity) {
      setPatternEngineIntensity(data.tokens.intensity as 'quiet' | 'low' | 'med' | 'high')
    }
  }, [data?.tokens?.intensity])

  useEffect(() => {
    setPatternEngineBrandon(effectiveBrandonPresent)
  }, [effectiveBrandonPresent])

  return null
}

// ---------------------------------------------------------------------------
// Export — gates on WebGL before mounting Canvas
// ---------------------------------------------------------------------------

export function KingdomMapClient() {
  // 🏛️ ARCHAEOLOGICAL RECORD // SSR-Safe WebGL Pre-Flight Gate
  // 🗓️ 2026-03-03 | Session 154
  // ISSUE: useState(() => checkWebGL()) runs on the server where document is undefined.
  //        Server renders WebGLUnavailable, client renders 3D scene → hydration mismatch.
  // RESOLUTION: Initialize as null (matches on both server and first client render).
  //             useEffect fires after mount, sets real value, triggers correct re-render.
  // LAW: Never put browser-only checks in useState lazy initializers — use useEffect.
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null)
  // sceneReady: false until R3F has had time to paint its first frame.
  // Overlay fades out via CSS transition — never unmounted, just pointerEvents: none.
  const [sceneReady, setSceneReady] = useState(false)
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setWebglAvailable(checkWebGL())
  }, [])

  useEffect(() => {
    if (!webglAvailable) return
    // Give R3F ~1s to compile shaders and paint the first frame, then fade the overlay.
    readyTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => setSceneReady(true))
    }, 1000)
    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current)
    }
  }, [webglAvailable])

  // null = first render (server + client agree) → show loading screen
  if (webglAvailable === null) return <KingdomLoadingScreen />
  if (!webglAvailable) return <WebGLUnavailable />

  return (
    <KingdomErrorBoundary>
      <KingdomLiveProvider>
        <KingdomLiveSync />
        <PatternEngineBridge />
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <KingdomScene3D className="w-full h-full" />
          {/* Mission clock — top-right corner, above HUD stack */}
          <MissionClock />
          {/* System log — bottom-left corner */}
          <SystemLog />
          {/* Token burn rate — bottom-left, above system log */}
          <TokenBurnHUD />
          {/* Raven arrival flash — fixed position, manages its own layout */}
          <RavenArrivalFlash />
          {/* Right-side HUD stack — shifted down to clear MissionClock */}
          <div style={{
            position:      'absolute',
            top:           60,
            right:         24,
            zIndex:        20,
            display:       'flex',
            flexDirection: 'column',
            gap:           8,
            pointerEvents: 'none',
          }}>
            <TokenHUD />
            <PresenceStrip />
            <ClaudeStatusBadge />
            <AgentPanel />
          </div>
          <ProductionQueueHUD />
          <HeraldTicker />
          {/* Sinner King Radio — bottom-left */}
          <div style={{
            position:      'absolute',
            bottom:        16,
            left:          16,
            zIndex:        25,
            pointerEvents: 'auto',
          }}>
            <SinnerKingRadio initialTrackId="eternal-rick" autoPlay={true} />
          </div>
          {/* Boot overlay — fades out 1s after WebGL context is ready */}
          <div style={{
            position:      'absolute',
            inset:         0,
            zIndex:        50,
            pointerEvents: sceneReady ? 'none' : 'auto',
            opacity:       sceneReady ? 0 : 1,
            transition:    'opacity 0.9s ease',
          }}>
            <KingdomLoadingScreen />
          </div>
        </div>
      </KingdomLiveProvider>
    </KingdomErrorBoundary>
  )
}
