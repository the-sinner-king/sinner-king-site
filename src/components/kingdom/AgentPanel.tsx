'use client'

/**
 * AgentPanel.tsx
 *
 * Compact HUD showing all 4 Claude instances in real time.
 * Data from KingdomLiveProvider — no independent fetch.
 *
 * Layout:
 *   ┌─ AGENTS ─────────────────────────┐
 *   │ FORGE    [BH]  ● RUNNING    85   │
 *   │ TOWER    [WS]  ● SEARCHING  90   │
 *   │ HOUSE    ···   ● ONLINE     40   │
 *   │ THRONE   ···   ◌ OFFLINE     0   │
 *   └──────────────────────────────────┘
 *
 * Stale treatment: opacity 0.5 + STALE badge via StaleWrapper.
 */

import { useKingdomLive, StaleWrapper } from '@/lib/kingdom-live-context'
import {
  AGENT_REGISTRY,
  STATE_COLORS,
  PULSE_MS,
  TOOL_CODES,
  getAgent,
} from '@/lib/kingdom-agents'
import type { AgentStatus } from '@/lib/kingdom-agents'

// ---------------------------------------------------------------------------
// Agent row
// ---------------------------------------------------------------------------

function AgentRow({ agent, entry }: {
  agent: AgentStatus
  entry: typeof AGENT_REGISTRY[number]
}) {
  const { state, activity, tool } = agent
  const color    = STATE_COLORS[state]
  const pulseMs  = PULSE_MS[state]
  const toolCode = tool ? (TOOL_CODES[tool] ?? null) : null
  const showTool = toolCode !== null && state !== 'offline' && state !== 'online'
  const isOffline = state === 'offline'

  return (
    <div style={{
      display:       'flex',
      alignItems:    'center',
      gap:           6,
      marginBottom:  5,
    }}>
      {/* Agent label */}
      <span style={{
        color:         '#504840',
        fontSize:      8,
        letterSpacing: '0.14em',
        minWidth:      38,
      }}>
        {entry.label}
      </span>

      {/* Tool badge — takes reserved space even when hidden for alignment */}
      <span style={{
        color:         color,
        fontSize:      7,
        letterSpacing: '0.06em',
        fontFamily:    'monospace',
        minWidth:      20,
        opacity:       showTool ? 0.85 : 0,
      }}>
        {showTool ? `[${toolCode}]` : '···'}
      </span>

      {/* State dot */}
      <div style={{
        width:           5,
        height:          5,
        borderRadius:    '50%',
        background:      isOffline ? 'transparent' : color,
        border:          isOffline ? `1px solid ${color}` : 'none',
        boxShadow:       !isOffline && activity > 0
          ? `0 0 ${activity * 0.12}px ${color}`
          : 'none',
        animation:         pulseMs > 0 ? 'agent-dot-pulse ease-in-out infinite' : 'none',
        animationDuration: pulseMs > 0 ? `${pulseMs}ms` : undefined,
        flexShrink:      0,
      }} />

      {/* State label */}
      <span style={{
        color:         `${color}b3`,
        fontSize:      8,
        letterSpacing: '0.1em',
        flex:          1,
      }}>
        {state.toUpperCase()}
      </span>

      {/* Activity score — hidden when zero */}
      {activity > 0 && (
        <span style={{
          color:              '#504840',
          fontSize:           8,
          letterSpacing:      '0.06em',
          fontVariantNumeric: 'tabular-nums',
          minWidth:           20,
          textAlign:          'right',
        }}>
          {activity}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentPanel() {
  const { data, status } = useKingdomLive()

  if (status === 'loading' || status === 'error' || !data) return null

  const { agents } = data

  return (
    <>
      <style href="agent-panel-anim" precedence="default">{`
        @keyframes agent-panel-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes agent-dot-pulse {
          0%   { opacity: 0.7; }
          50%  { opacity: 1.0; }
          100% { opacity: 0.7; }
        }
      `}</style>

      <StaleWrapper status={status}>
        <div style={{
          fontFamily: 'monospace',
          animation:  'agent-panel-in 0.5s ease-out',
        }}>
          <div style={{
            background:    'rgba(10, 10, 15, 0.82)',
            border:        '1px solid rgba(112, 0, 255, 0.18)',
            borderLeft:    '2px solid rgba(112, 0, 255, 0.35)',
            borderRadius:  2,
            padding:       '8px 12px 6px',
            backdropFilter: 'blur(6px)',
            minWidth:      200,
          }}>
            {/* Header */}
            <div style={{
              color:         '#504840',
              fontSize:      10,
              letterSpacing: '0.18em',
              paddingBottom: 6,
              borderBottom:  '1px solid rgba(255,255,255,0.06)',
              marginBottom:  7,
            }}>
              AGENTS
            </div>

            {/* Agent rows — iterate registry, unknown keys from API are ignored */}
            {AGENT_REGISTRY.map((entry) => (
              <AgentRow
                key={entry.key}
                entry={entry}
                agent={getAgent(agents, entry.key)}
              />
            ))}
          </div>
        </div>
      </StaleWrapper>
    </>
  )
}
