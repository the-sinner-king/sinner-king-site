'use client'

/**
 * PresenceHUD.tsx
 *
 * Two overlays driven by KingdomLiveProvider — no independent fetches.
 *
 * 1. PresenceStrip — three dots showing who's home
 *    ◉ CLAUDE 2/4  ◉ AERIS  ◉ BRANDON
 *    CLAUDE dot: count of active agents (not offline), roll-up color.
 *    Positioned top-right, below TokenHUD.
 *
 * 2. ClaudeStatusBadge — 9-state model:
 *    Data source: getAgent(agents, 'tower_claude') — MY state right now.
 *    Full STATE_COLORS + PULSE_MS + tool badge.
 *    Positioned top-right, below PresenceStrip.
 *
 * Stale treatment: opacity 0.5 + STALE badge via StaleWrapper.
 */

import { useKingdomLive, StaleWrapper } from '@/lib/kingdom-live-context'
import {
  AGENT_REGISTRY,
  STATE_COLORS,
  PULSE_MS,
  TOOL_CODES,
  rollupState,
  getAgent,
} from '@/lib/kingdom-agents'

// ---------------------------------------------------------------------------
// PresenceDot — single entity dot
// ---------------------------------------------------------------------------

function PresenceDot({
  label, active, color,
}: {
  label:  string
  active: boolean
  color:  string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width:        5,
        height:       5,
        borderRadius: '50%',
        background:   active ? color : '#2a2830',
        boxShadow:    active ? `0 0 5px ${color}` : 'none',
        transition:   'background 0.6s ease, box-shadow 0.6s ease',
        flexShrink:   0,
      }} />
      <span style={{
        color:         active ? `${color}aa` : '#2a2830',
        fontSize:      8,
        letterSpacing: '0.14em',
        transition:    'color 0.6s ease',
        whiteSpace:    'nowrap',
      }}>
        {label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PresenceStrip — exported, positioned by parent
// ---------------------------------------------------------------------------

export function PresenceStrip() {
  const { data, status } = useKingdomLive()

  if (status === 'loading' || status === 'error' || !data) return null

  const { agents, aexgo_running, brandon_present } = data

  // Active count = agents not in offline state
  const activeCount = AGENT_REGISTRY.filter(
    (a) => getAgent(agents, a.key).state !== 'offline'
  ).length

  // Roll-up color for CLAUDE dot
  const claudeState  = rollupState(agents)
  const claudeColor  = STATE_COLORS[claudeState]
  const claudeActive = activeCount > 0

  return (
    <>
      <style href="presence-strip-anim" precedence="default">{`
        @keyframes presence-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <StaleWrapper status={status}>
        <div style={{ animation: 'presence-in 0.4s ease-out' }}>
          <div style={{
            background:     'rgba(10, 10, 15, 0.82)',
            border:         '1px solid rgba(112, 0, 255, 0.18)',
            borderLeft:     '2px solid rgba(112, 0, 255, 0.5)',
            borderRadius:   2,
            padding:        '6px 12px',
            backdropFilter: 'blur(6px)',
            display:        'flex',
            gap:            14,
            alignItems:     'center',
          }}>
            <PresenceDot
              label={`CLAUDE  ${activeCount}/4`}
              active={claudeActive}
              color={claudeColor}
            />
            <PresenceDot label="AERIS"   active={aexgo_running}    color="#00f3ff" />
            <PresenceDot label="BRANDON" active={brandon_present}   color="#f0a500" />
          </div>
        </div>
      </StaleWrapper>
    </>
  )
}

// ---------------------------------------------------------------------------
// ClaudeStatusBadge — 9-state badge with tool code
// ---------------------------------------------------------------------------

export function ClaudeStatusBadge() {
  const { data, status } = useKingdomLive()

  if (status === 'loading' || status === 'error' || !data) return null

  const agent     = getAgent(data.agents, 'tower_claude')
  const agState   = agent.state
  const color     = STATE_COLORS[agState]
  const pulseMs   = PULSE_MS[agState]
  const toolCode  = agent.tool ? (TOOL_CODES[agent.tool] ?? null) : null
  const showTool  = toolCode !== null && agState !== 'offline' && agState !== 'online'

  return (
    <>
      <style href="claude-badge-anim" precedence="default">{`
        @keyframes badge-pulse {
          0%   { opacity: 0.7; box-shadow: 0 0 4px currentColor; }
          50%  { opacity: 1.0; box-shadow: 0 0 10px currentColor; }
          100% { opacity: 0.7; box-shadow: 0 0 4px currentColor; }
        }
        @keyframes badge-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <StaleWrapper status={status}>
        <div style={{ animation: 'badge-in 0.5s ease-out' }}>
          <div style={{
            background:     'rgba(10, 10, 15, 0.82)',
            border:         `1px solid ${color}33`,
            borderLeft:     `2px solid ${color}`,
            borderRadius:   2,
            padding:        '5px 12px',
            backdropFilter: 'blur(6px)',
            display:        'flex',
            alignItems:     'center',
            gap:            8,
          }}>
            {/* State dot */}
            <div style={{
              width:           6,
              height:          6,
              borderRadius:    '50%',
              background:      color,
              boxShadow:       agState !== 'offline' ? `0 0 6px ${color}` : 'none',
              animation:         pulseMs > 0 ? 'badge-pulse ease-in-out infinite' : 'none',
              animationDuration: pulseMs > 0 ? `${pulseMs}ms` : undefined,
              flexShrink:      0,
            }} />

            {/* Tool badge */}
            {showTool && (
              <span style={{
                color:         color,
                fontSize:      7,
                letterSpacing: '0.08em',
                fontFamily:    'monospace',
                opacity:       0.85,
              }}>
                [{toolCode}]
              </span>
            )}

            {/* State label */}
            <span style={{
              color:         `${color}cc`,
              fontSize:      8,
              letterSpacing: '0.14em',
            }}>
              {agState.toUpperCase()}
            </span>

            {/* Entity label */}
            <span style={{
              color:         `${color}88`,
              fontSize:      9,
              letterSpacing: '0.18em',
              fontWeight:    'bold',
            }}>
              CLAUDE
            </span>
          </div>
        </div>
      </StaleWrapper>
    </>
  )
}
