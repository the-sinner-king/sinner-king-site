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

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { ProductionQueueHUD } from '@/components/kingdom/ProductionQueueHUD'
import { SwarmLauncher } from '@/components/kingdom/SwarmLauncher'
import { KingdomErrorBoundary } from '@/components/kingdom/KingdomErrorBoundary'
import { TokenHUD } from '@/components/kingdom/TokenHUD'
import { PresenceStrip, ClaudeStatusBadge } from '@/components/kingdom/PresenceHUD'
import { HeraldTicker } from '@/components/kingdom/HeraldTicker'
import { AgentPanel } from '@/components/kingdom/AgentPanel'
import { KingdomLiveProvider } from '@/lib/kingdom-live-context'

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
      <style>{`
        @keyframes kingdom-pulse {
          0% {
            opacity: 0.4;
            text-shadow: 0 0 8px rgba(112, 0, 255, 0.6);
          }
          50% {
            opacity: 1;
            text-shadow: 0 0 16px rgba(112, 0, 255, 0.9);
          }
          100% {
            opacity: 0.4;
            text-shadow: 0 0 8px rgba(112, 0, 255, 0.6);
          }
        }

        @keyframes kingdom-glow {
          0% {
            opacity: 0.5;
            filter: blur(0px);
          }
          50% {
            opacity: 1;
            filter: blur(2px);
          }
          100% {
            opacity: 0.5;
            filter: blur(0px);
          }
        }

        @keyframes kingdom-rotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .kingdom-hex {
          font-size: 32px;
          animation: kingdom-rotate 8s linear infinite;
          margin-bottom: 16px;
        }

        .kingdom-title {
          color: #7000ff;
          font-size: 13px;
          letter-spacing: 0.15em;
          margin-bottom: 8px;
          animation: kingdom-pulse 2s ease-in-out infinite;
        }

        .kingdom-subtitle {
          color: #504840;
          font-size: 10px;
          letter-spacing: 0.12em;
          margin-bottom: 12px;
        }

        .kingdom-status {
          color: #a09888;
          font-size: 9px;
          letter-spacing: 0.1em;
          animation: kingdom-glow 1.5s ease-in-out infinite;
        }
      `}</style>
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
        }}
      >
        <div className="kingdom-hex">◈</div>
        <div className="kingdom-title">KINGDOM MAP</div>
        <div className="kingdom-subtitle">INITIALIZING SIGNAL FEEDS...</div>
        <div className="kingdom-status">CONNECTING</div>
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

  useEffect(() => {
    setWebglAvailable(checkWebGL())
  }, [])

  // null = first render (server + client agree) → show loading screen
  if (webglAvailable === null) return <KingdomLoadingScreen />
  if (!webglAvailable) return <WebGLUnavailable />

  return (
    <KingdomErrorBoundary>
      <KingdomLiveProvider>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <KingdomScene3D className="w-full h-full" />
          {/* Right-side HUD stack — flex column so height changes never overlap */}
          <div style={{
            position:      'absolute',
            top:           24,
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
          <SwarmLauncher />
          <HeraldTicker />
        </div>
      </KingdomLiveProvider>
    </KingdomErrorBoundary>
  )
}
