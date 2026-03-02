'use client'

/**
 * ProductionQueueHUD.tsx
 *
 * Game-style DOM overlay showing active swarm events as a progress queue.
 * Positioned bottom-right, fades in when events are active, disappears when empty.
 *
 * Reads activeDroneSwarms from the Zustand store (same source as DroneSwarms 3D).
 * Re-renders every 500ms to update progress bars.
 *
 * Layout:
 *   ┌──────────────────────────────────┐
 *   │ Debug Swarm → THE FORGE  [████░] 73% │
 *   │ Web Search  → void       [███░░] 52% │
 *   └──────────────────────────────────┘
 *
 * Bug fixes applied:
 * - Replaced void tick anti-pattern with useReducer force-update
 * - Extracted static style objects outside component to prevent re-creation each render
 *
 * Spec: KINGDOM_MAP/NORTH_STAR.md § Phase 2.5
 */

import { useEffect, useReducer } from 'react'
import { useKingdomStore } from '@/lib/kingdom-store'
import type { DroneSwarm } from '@/lib/kingdom-store'

// ---------------------------------------------------------------------------
// Static styles — defined once, outside component
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 24,
  right: 24,
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  minWidth: 240,
  maxWidth: 320,
  fontFamily: 'monospace',
  pointerEvents: 'none',
  animation: 'hud-fade-in 0.3s ease-out',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: 3,
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  marginBottom: 2,
}

const headerLabelStyle: React.CSSProperties = {
  color: '#504840',
  fontSize: 8,
  letterSpacing: '0.18em',
}

const headerCountStyle: React.CSSProperties = {
  color: '#504840',
  fontSize: 8,
  letterSpacing: '0.12em',
}

const labelRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 5,
}

const trackStyle: React.CSSProperties = {
  height: 2,
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 1,
  overflow: 'hidden',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getColor(swarm: DroneSwarm): string {
  // Off-screen search swarms return cyan — matching their 3D return color
  if (swarm.direction === 'off_screen') return '#00f3ff'

  // Otherwise color by source territory
  const map: Record<string, string> = {
    claude_house: '#7000ff',
    the_forge:    '#f0a500',
    the_scryer:   '#00f3ff',
    the_tower:    '#9b30ff',  // Tower Violet — was incorrectly set to Throne Pink
    the_throne:   '#ff006e',
    core_lore:    '#e8e0d0',
  }
  return map[swarm.sourceTerritoryId] ?? '#7000ff'
}

function getTargetLabel(swarm: DroneSwarm): string {
  if (swarm.direction === 'off_screen') return 'VOID'
  if (!swarm.targetTerritoryId) return '?'
  return swarm.targetTerritoryId.replace(/_/g, ' ').toUpperCase()
}

// ---------------------------------------------------------------------------
// Single row
// ---------------------------------------------------------------------------

function QueueRow({ swarm, now }: { swarm: DroneSwarm; now: number }) {
  const elapsed  = now - swarm.startedAt
  const duration = swarm.expiresAt - swarm.startedAt
  const pct      = Math.min(100, Math.round((elapsed / duration) * 100))
  const color    = getColor(swarm)
  const target   = getTargetLabel(swarm)

  return (
    <div style={{
      background: 'rgba(10, 10, 15, 0.88)',
      border: `1px solid ${color}33`,
      borderLeft: `2px solid ${color}`,
      borderRadius: 2,
      padding: '7px 10px 6px',
      backdropFilter: 'blur(6px)',
      willChange: 'transform, opacity, backdrop-filter',
      contain: 'layout style paint',
    }}>
      {/* Label row */}
      <div style={labelRowStyle}>
        <span style={{ color, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {swarm.label}
        </span>
        <span style={{ color: `${color}88`, fontSize: 8, letterSpacing: '0.1em', marginLeft: 8 }}>
          → {target}
        </span>
        <span style={{ color: `${color}99`, fontSize: 8, letterSpacing: '0.08em', marginLeft: 'auto', paddingLeft: 10 }}>
          {pct}%
        </span>
      </div>
      {/* Progress bar */}
      <div style={trackStyle}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}aa, ${color})`,
          boxShadow: `0 0 6px ${color}66`,
          transition: 'width 0.5s linear',
        }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function ProductionQueueHUD() {
  const activeDroneSwarms = useKingdomStore((s) => s.activeDroneSwarms)

  // Force re-render every 500ms to update progress percentages.
  // useReducer is the idiomatic force-update pattern — no side effects, no anti-patterns.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    const id = setInterval(forceUpdate, 500)
    return () => clearInterval(id)
  }, [])

  const now        = Date.now()
  const liveSwarms = activeDroneSwarms.filter((s) => now < s.expiresAt && s.active)

  if (liveSwarms.length === 0) return null

  return (
    <div style={panelStyle}>
      {/* React 19: href+precedence deduplicates injection — keyframes hoisted once */}
      <style href="hud-fade-in" precedence="default">{`
        @keyframes hud-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={headerStyle}>
        <span style={headerLabelStyle}>ACTIVE OPERATIONS</span>
        <span style={headerCountStyle}>{liveSwarms.length}</span>
      </div>

      {liveSwarms.map((swarm) => (
        <QueueRow key={swarm.id} swarm={swarm} now={now} />
      ))}
    </div>
  )
}
