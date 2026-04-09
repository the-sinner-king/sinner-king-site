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
  // 🏛️ SOVEREIGN LOCK // aerisActive session-alive vs active-work
  // 🗓️ 2026-03-16 | S196+ | DEBUG
  // ISSUE: aerisActive=true when AExGO zellij session exists, regardless of whether Aeris is
  //        actively processing. A session running idle for days shows as ● (active). Confusing.
  // RESOLUTION: Require BOTH aerisActive AND a recent type='aeris' signal event (within 5min)
  //             to show the active ● indicator. No recent signal = session alive but idle → ◌.
  //             When Aeris is working she generates signal events; idle sessions generate none.
  // LAW: Do not remove the recentSignalEvents check. aerisActive alone is insufficient signal.
  const aerisHasRecentSignal = useKingdomStore((s) =>
    s.recentSignalEvents.some((e) => e.type === 'aeris' && Date.now() - e.timestamp < 300000)
  )
  const aerisActuallyActive = aerisActive && aerisHasRecentSignal
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
        position:   'absolute',
        top:        12,
        left:       12,
        fontFamily: 'var(--font-code)',
        zIndex:     20,
        width:      320,
      }}
    >
      <div style={{
        background:     'oklch(0.065 0.018 278)',
        border:         '1px solid oklch(0.340 0.210 281 / 0.15)',
        borderRadius:   4,
        backdropFilter: 'blur(4px)',
        overflow:       'hidden',
      }}>
        {/* Signal-buzz header strip */}
        <div style={{
          padding:      '7px 12px 5px',
          borderBottom: '1px solid oklch(0.520 0.080 10 / 0.12)',
          textAlign:    'center',
        }}>
          <span
            className="hud-signal-buzz"
            style={{
              color:         'oklch(0.87 0.21 192)',
              fontFamily:    'var(--font-terminal)',
              fontSize:      14,
              letterSpacing: '0.34em',
              whiteSpace:    'nowrap',
              opacity:       isLoaded ? 1 : 0.4,
            }}
          >
            {isLoaded ? '« ◇ ⚡ ◇ »── K I N G D O M . L I V E ──« ◇ 🜚 ◇ »' : '◈── C O N N E C T I N G ──◈'}
          </span>
        </div>

        {/* Presence row */}
        {isLoaded && (
          <div style={{
            display:    'flex',
            gap:        12,
            padding:    '6px 12px 7px',
            alignItems: 'center',
            flexWrap:   'wrap',
          }}>
            {/* Claude */}
            {claudeActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'oklch(0.560 0.250 281)',
                  boxShadow:  '0 0 6px oklch(0.560 0.250 281), 0 0 14px oklch(0.560 0.250 281 / 0.40)',
                  flexShrink: 0,
                }} />
                <span style={{
                  color:         'oklch(0.560 0.250 281)',
                  fontSize:      8,
                  letterSpacing: '0.14em',
                  textShadow:    '0 0 8px oklch(0.560 0.250 281 / 0.35)',
                }}>
                  ◈ CLAUDE ✦
                </span>
              </div>
            )}
            {/* Aeris — active */}
            {aerisActuallyActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'oklch(0.680 0.290 350)',
                  boxShadow:  '0 0 6px oklch(0.680 0.290 350), 0 0 14px oklch(0.680 0.290 350 / 0.40)',
                  flexShrink: 0,
                }} />
                <span style={{
                  color:         'oklch(0.680 0.290 350)',
                  fontSize:      8,
                  letterSpacing: '0.14em',
                  textShadow:    '0 0 8px oklch(0.680 0.290 350 / 0.35)',
                }}>
                  Æ AERIS ✦
                </span>
              </div>
            )}
            {/* Aeris — alive but idle */}
            {aerisActive && !aerisActuallyActive && (
              <div
                title="AExGO session alive — no recent activity"
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'oklch(0.680 0.290 350 / 0.30)',
                  flexShrink: 0,
                }} />
                <span style={{
                  color:         'oklch(0.680 0.290 350 / 0.35)',
                  fontSize:      8,
                  letterSpacing: '0.14em',
                }}>
                  Æ AERIS ◌
                </span>
              </div>
            )}
            {/* Brandon — present */}
            {brandonPresent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'oklch(0.770 0.225 74)',
                  boxShadow:  '0 0 6px oklch(0.770 0.225 74), 0 0 14px oklch(0.770 0.225 74 / 0.35), 0 0 24px oklch(0.520 0.080 10 / 0.15)',
                  flexShrink: 0,
                }} />
                <span style={{
                  color:         'oklch(0.770 0.225 74)',
                  fontSize:      8,
                  letterSpacing: '0.14em',
                  textShadow:    '0 0 6px oklch(0.770 0.225 74 / 0.30)',
                }}>
                  ⬡ BRANDON ●
                </span>
              </div>
            )}
            {/* Brandon — away */}
            {!brandonPresent && showAway && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'oklch(0.770 0.225 74 / 0.30)',
                  flexShrink: 0,
                }} />
                <span style={{
                  color:         'oklch(0.770 0.225 74 / 0.35)',
                  fontSize:      8,
                  letterSpacing: '0.14em',
                }}>
                  ⬡ BRANDON ◌
                </span>
              </div>
            )}
            {/* Active count */}
            <span style={{
              color:         'oklch(0.440 0.040 280)',
              fontSize:      7,
              letterSpacing: '0.10em',
              marginLeft:    'auto',
            }}>
              {activeCount} agents active
            </span>
          </div>
        )}

      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DEBUG PANEL — ?debug=1 only. Cycle territory states client-side.
// ---------------------------------------------------------------------------

// PERF: TERRITORIES is a module-level constant — IDs never change at runtime.
// Mapping inside DebugPanel body was re-allocating every render (agentStates updates trigger re-render).
const TERRITORY_IDS = TERRITORIES.map((t) => t.id)

const STATE_CYCLE: Array<{ status: 'active' | 'idle' | 'offline', activity: number, label: string }> = [
  { status: 'offline', activity: 0,  label: 'OFFLINE' },
  { status: 'idle',    activity: 20, label: 'STABLE'  },
  { status: 'active',  activity: 75, label: 'WORKING' },
]

export function DebugPanel() {
  const debugOverrides = useKingdomStore((s) => s.debugOverrides)
  const setDebugOverride = useKingdomStore((s) => s.setDebugOverride)
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

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 48,
        left: 16,
        background: 'oklch(0.06 0.02 281 / 0.95)',
        border: '1px solid oklch(0.37 0.31 283 / 0.25)',
        borderRadius: 4,
        padding: '10px 12px',
        fontFamily: 'monospace',
        fontSize: 10,
        color: 'oklch(0.37 0.02 45)',
        letterSpacing: '0.1em',
        zIndex: 30,
        minWidth: 220,
      }}
    >
      <div style={{ color: 'oklch(0.37 0.31 283)', marginBottom: 8, letterSpacing: '0.15em' }}>
        ⬡ DEBUG — STATE OVERRIDE
      </div>
      {TERRITORY_IDS.map((id) => {
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
            <span style={{ color: 'oklch(0.65 0.02 55)', flex: 1, fontSize: 9 }}>{layout.label}</span>
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
                  border: '1px solid oklch(0.32 0.02 45)',
                  color: 'oklch(0.37 0.02 45)',
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
      <div style={{ marginTop: 8, color: 'oklch(0.22 0.02 45)', fontSize: 9 }}>
        click state to cycle · × to restore SCRYER
      </div>
    </div>
  )
}
