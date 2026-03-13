'use client'

/**
 * KingdomHUD.tsx — DOM-layer HUD overlays
 *
 * Extracted from KingdomScene3D.tsx (Loop 3, MAINTENANCE 2026-03-13).
 *
 * Owns:
 *   - STATE_CYCLE constant (debug state progression)
 *   - StatusBar: top-left overlay (KINGDOM LIVE / agent count / operator presence)
 *   - DebugPanel: bottom-left overlay (?debug=1 only, cycles territory states)
 *
 * Consumers: KingdomScene3D renders both inside the canvas wrapper div.
 */

import React, { useState, useEffect } from 'react'
import { useKingdomStore } from '@/lib/kingdom-store'
import type { AgentState } from '@/lib/kingdom-agents'
import { TERRITORY_TO_AGENT } from '@/lib/kingdom-agents'
import { TERRITORIES, TERRITORY_MAP } from '@/lib/kingdom-layout'
import { useBrandonPresenceDetector } from '@/hooks/useBrandonPresenceDetector'
import {
  BuildingState,
  deriveBuildingState,
  BUILDING_STATE_CONFIG,
} from './TerritoryNode'

// ---------------------------------------------------------------------------
// STATUS BAR (DOM overlay — top of canvas)
// ---------------------------------------------------------------------------

export function StatusBar() {
  const isLoaded = useKingdomStore((s) => s.isLoaded)
  const scraperStatus = useKingdomStore((s) => s.scraperStatus)
  const claudeActive = useKingdomStore((s) => s.claudeActive)
  const aerisActive = useKingdomStore((s) => s.aerisActive)
  const storeBrandonPresent = useKingdomStore((s) => s.brandonPresent)
  // BUGFIX: t.status is always 'unknown' in prod — territories slice never gets status field from SCRYER.
  // Use agentStates to count agents that are genuinely active (not idle/offline).
  const activeCount = useKingdomStore((s) =>
    Object.values(s.agentStates).filter((a) => a.state !== 'offline' && a.state !== 'online').length
  )
  // OR logic: machine signal (30s latency) + browser signal (immediate input detection)
  const localBrandonPresent = useBrandonPresenceDetector()
  const brandonPresent = storeBrandonPresent || localBrandonPresent
  // Show AWAY only after store has confirmed brandon is not present (not on initial load)
  const [showAway, setShowAway] = useState(false)
  useEffect(() => {
    if (!brandonPresent && isLoaded) {
      const t = setTimeout(() => setShowAway(true), 5_000)
      return () => clearTimeout(t)
    } else {
      setShowAway(false)
    }
  }, [brandonPresent, isLoaded])

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        fontFamily: 'monospace',
        fontSize: 10,
        color: '#504840',
        letterSpacing: '0.12em',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isLoaded ? '#00f3ff' : '#504840',
          }}
        />
        <span style={{ color: isLoaded ? '#e8e0d0' : '#504840' }}>
          {isLoaded ? 'KINGDOM LIVE' : 'CONNECTING'}
        </span>
      </div>
      {isLoaded && (
        <>
          <div>{activeCount} territories active</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {claudeActive && (
              <span style={{ color: '#7000ff' }}>CLAUDE ●</span>
            )}
            {aerisActive && (
              <span style={{ color: '#ff006e' }}>AERIS ●</span>
            )}
            {brandonPresent
              ? <span style={{ color: '#f0a500' }}>BRANDON ●</span>
              : showAway
                ? <span style={{ color: '#f0a50055' }}>BRANDON ◌ AWAY</span>
                : null
            }
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DEBUG PANEL — ?debug=1 only. Cycle territory states client-side.
// ---------------------------------------------------------------------------

const STATE_CYCLE: Array<{ status: 'active' | 'idle' | 'offline', activity: number, label: string }> = [
  { status: 'offline', activity: 0,  label: 'OFFLINE' },
  { status: 'idle',    activity: 20, label: 'STABLE'  },
  { status: 'active',  activity: 75, label: 'WORKING' },
]

export function DebugPanel() {
  const debugOverrides = useKingdomStore((s) => s.debugOverrides)
  const setDebugOverride = useKingdomStore((s) => s.setDebugOverride)
  const territories = useKingdomStore((s) => s.territories)
  const getActivity = useKingdomStore((s) => s.getActivity)
  // Subscribe to agentStates directly (not the getter function ref) so DebugPanel re-renders
  // when agent states update. Derive building state inline from the raw data.
  const agentStates = useKingdomStore((s) => s.agentStates)

  // Only render when ?debug=1 is in the URL
  const [show, setShow] = React.useState(false)
  React.useEffect(() => {
    setShow(new URLSearchParams(window.location.search).get('debug') === '1')
  }, [])

  if (!show) return null

  const ids = TERRITORIES.map((t) => t.id)

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 48,
        left: 16,
        background: 'rgba(10,10,15,0.95)',
        border: '1px solid #7000ff40',
        borderRadius: 4,
        padding: '10px 12px',
        fontFamily: 'monospace',
        fontSize: 10,
        color: '#504840',
        letterSpacing: '0.1em',
        zIndex: 30,
        minWidth: 220,
      }}
    >
      <div style={{ color: '#7000ff', marginBottom: 8, letterSpacing: '0.15em' }}>
        ⬡ DEBUG — STATE OVERRIDE
      </div>
      {ids.map((id) => {
        const layout = TERRITORY_MAP[id]
        if (!layout) return null
        const hasOverride = id in debugOverrides
        const currentActivity = getActivity(id)
        const agentKey = TERRITORY_TO_AGENT[id]
        const agentStateVal: AgentState = agentKey ? (agentStates[agentKey]?.state ?? 'offline') : 'online'
        const bs = deriveBuildingState(agentStateVal)
        const cfg = BUILDING_STATE_CONFIG[bs]

        const cycleNext = () => {
          // REGRESSION GUARD: derive current building state from debugOverride if active,
          // not from live agentStates. Without this, a second cycle click always reads
          // live bs (unchanged), computing the same next index — cycle never advances.
          const bsToSlot: Record<BuildingState, number> = { offline: 0, stable: 1, working: 2 }
          const currentOverride = debugOverrides[id]
          const currentBs: BuildingState = currentOverride
            ? deriveBuildingState(
                currentOverride.status === 'offline' ? 'offline'
                  : currentOverride.status === 'idle' ? 'online'
                  : 'working'
              )
            : bs
          const nextIdx = (bsToSlot[currentBs] + 1) % STATE_CYCLE.length
          setDebugOverride(id, STATE_CYCLE[nextIdx])
        }

        const clear = () => setDebugOverride(id, null)

        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: layout.color, flexShrink: 0 }} />
            <span style={{ color: '#a09888', flex: 1, fontSize: 9 }}>{layout.label}</span>
            <button
              onClick={cycleNext}
              style={{
                background: 'none',
                border: `1px solid ${layout.color}50`,
                color: cfg.stateLabelColor,
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 2,
                letterSpacing: '0.08em',
              }}
            >
              {cfg.stateLabel}
            </button>
            {hasOverride && (
              <button
                onClick={clear}
                style={{
                  background: 'none',
                  border: '1px solid #504840',
                  color: '#504840',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: 9,
                  padding: '1px 5px',
                  borderRadius: 2,
                }}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <div style={{ marginTop: 8, color: '#302820', fontSize: 9 }}>
        click state to cycle · × to restore SCRYER
      </div>
    </div>
  )
}
