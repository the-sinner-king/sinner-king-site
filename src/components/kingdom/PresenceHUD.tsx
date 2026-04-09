'use client'

/**
 * @file PresenceHUD.tsx
 *
 * @description
 * Two co-located overlay components driven by `KingdomLiveProvider`.
 * Neither component fetches independently — all data arrives through the shared
 * `useKingdomLive()` context which polls every 15 s and falls back to PartyKit.
 *
 * **PresenceStrip** — three presence dots, one per Kingdom entity:
 *   - CLAUDE dot: active (non-offline) agent count shown as "n/4", colored by
 *     the highest-intensity rollup state across all four Claude instances.
 *   - AERIS dot: `aexgo_running` boolean from the agents status endpoint.
 *   - BRANDON dot: `brandon_present` boolean derived from desktop sensor data.
 *
 * **ClaudeStatusBadge** — single-agent badge for `tower_claude` specifically.
 *   Shows state dot (pulsing when active), optional tool code, state label,
 *   and "CLAUDE" entity label. This is MY state — the Tower instance reading this.
 *
 * @dataSource
 * Both components read from `useKingdomLive()`:
 *   - `data.agents`         — Record<string, AgentStatus> for all 4 Claude instances
 *   - `data.aexgo_running`  — boolean, AExGO process alive on Brandon's machine
 *   - `data.brandon_present`— boolean, Brandon active at workstation
 *
 * @lifecycle
 * - Renders null during 'loading' and 'error' states.
 * - `StaleWrapper` dims to 50% opacity + STALE badge when status === 'stale'.
 * - Keyframes injected via React 19 `<style href>` deduplication.
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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Diameter of each presence dot in pixels. */
const DOT_SIZE = 5

/** Diameter of the state dot in ClaudeStatusBadge. Slightly larger for prominence. */
const BADGE_DOT_SIZE = 6

/** Gap between dots in the strip. */
const STRIP_DOT_GAP = 5

/** Gap between dots in the strip row. */
const STRIP_ROW_GAP = 14

/** Background for both overlays: near-black with slight warm offset. */
const OVERLAY_BG = 'oklch(0.06 0.02 281 / 0.82)'

/** Inactive dot fill — dark enough to recede, warm enough to read as "off". */
const DOT_INACTIVE_COLOR = 'oklch(0.19 0.02 281)'

/** Strip border accent — violet at low alpha. */
const STRIP_BORDER = '1px solid oklch(0.37 0.31 283 / 0.18)'

/** Strip left structural stripe. */
const STRIP_BORDER_LEFT = '2px solid oklch(0.37 0.31 283 / 0.50)'

/** Presence label font size in px. */
const PRESENCE_LABEL_FONT_SIZE = 8

/** Entity label letter-spacing for presence labels. */
const PRESENCE_LABEL_TRACKING = '0.14em'

/** Badge state label font size in px. */
const BADGE_STATE_FONT_SIZE = 8

/** Badge entity label font size in px — slightly larger for prominence. */
const BADGE_ENTITY_FONT_SIZE = 9

/** Badge tool code font size in px. */
const BADGE_TOOL_FONT_SIZE = 7

/** Transition duration for dot color/glow changes. */
const DOT_TRANSITION = 'background 0.6s ease, box-shadow 0.6s ease'

/** Transition duration for label color changes. */
const LABEL_TRANSITION = 'color 0.6s ease'

/** Cyan used for the AERIS dot — matches AExGO's territory droneColor. */
const AERIS_COLOR = '#00f3ff'

/** Amber used for the BRANDON dot — warm human presence color. */
const BRANDON_COLOR = '#f0a500'

// ─── PRESENCE DOT ─────────────────────────────────────────────────────────────

/** Props for the PresenceDot sub-component. */
interface PresenceDotProps {
  /** Text label shown beside the dot (e.g. "CLAUDE  2/4"). */
  label:  string
  /** Whether this entity is currently active/present. Controls dot color and glow. */
  active: boolean
  /** Hex or CSS color for the active state. Inactive always uses DOT_INACTIVE_COLOR. */
  color:  string
}

/**
 * Single entity dot + label.
 * Inactive state uses a fixed dark color regardless of the entity's active color,
 * so all three dots read as equally "off" when nothing is running.
 */
function PresenceDot({ label, active, color }: PresenceDotProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: STRIP_DOT_GAP }}>
      <div style={{
        width:        DOT_SIZE,
        height:       DOT_SIZE,
        borderRadius: '50%',
        background:   active ? color : DOT_INACTIVE_COLOR,
        boxShadow:    active ? `0 0 5px ${color}` : 'none',
        transition:   DOT_TRANSITION,
        flexShrink:   0,
      }} />
      <span style={{
        // Active label: entity's color at 67% alpha (hex 'aa') — present but not dominant.
        // Inactive label: same flat dark as the dot — both elements recede together.
        color:         active ? `${color}aa` : DOT_INACTIVE_COLOR,
        fontSize:      PRESENCE_LABEL_FONT_SIZE,
        letterSpacing: PRESENCE_LABEL_TRACKING,
        transition:    LABEL_TRANSITION,
        whiteSpace:    'nowrap',
      }}>
        {label}
      </span>
    </div>
  )
}

// ─── PRESENCE STRIP ───────────────────────────────────────────────────────────

/**
 * Three-dot presence row: CLAUDE (agent rollup) · AERIS · BRANDON.
 *
 * The CLAUDE dot count uses `AGENT_REGISTRY.length` as the denominator (currently 4)
 * rather than a hardcoded literal. This ensures the "n/4" fraction stays correct
 * if the registry ever gains a fifth agent — a hardcoded "4" would silently lie.
 *
 * `rollupState(agents)` returns the highest-intensity state across all agents,
 * so the CLAUDE dot color reflects the most active instance rather than averaging.
 */
export function PresenceStrip() {
  const { data, status } = useKingdomLive()

  if (status === 'loading' || status === 'error' || !data) return null

  const { agents, aexgo_running, brandon_present } = data

  // Count agents not in the 'offline' state — "active" means alive on Brandon's machine.
  const activeCount = AGENT_REGISTRY.filter(
    (a) => getAgent(agents, a.key).state !== 'offline'
  ).length

  // AGENT_REGISTRY.length as denominator: correct even if the registry grows beyond 4.
  const claudeLabel  = `CLAUDE  ${activeCount}/${AGENT_REGISTRY.length}`
  const claudeState  = rollupState(agents)
  const claudeColor  = STATE_COLORS[claudeState]
  // The CLAUDE dot is active whenever at least one agent is running.
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
            background:     OVERLAY_BG,
            border:         STRIP_BORDER,
            borderLeft:     STRIP_BORDER_LEFT,
            borderRadius:   2,
            padding:        '6px 12px',
            backdropFilter: 'blur(6px)',
            display:        'flex',
            gap:            STRIP_ROW_GAP,
            alignItems:     'center',
          }}>
            <PresenceDot label={claudeLabel}  active={claudeActive}    color={claudeColor}   />
            <PresenceDot label="AERIS"        active={aexgo_running}   color={AERIS_COLOR}   />
            <PresenceDot label="BRANDON"      active={brandon_present} color={BRANDON_COLOR} />
          </div>
        </div>
      </StaleWrapper>
    </>
  )
}

// ─── CLAUDE STATUS BADGE ─────────────────────────────────────────────────────

/**
 * Single-agent status badge scoped to `tower_claude` — the running Tower instance.
 *
 * Reads `data.agents['tower_claude']` via `getAgent()`, which returns `OFFLINE_AGENT`
 * if the key is absent (e.g. during the first poll cycle), keeping the badge visible
 * but showing the 'offline' state rather than crashing or returning null.
 *
 * The badge dot pulses via `badge-pulse` CSS keyframes when `PULSE_MS[state] > 0`.
 * The animation duration is set inline (`animationDuration`) because the same keyframe
 * definition is reused across all states — only the timing changes per state.
 */
export function ClaudeStatusBadge() {
  const { data, status } = useKingdomLive()

  if (status === 'loading' || status === 'error' || !data) return null

  const agent     = getAgent(data.agents, 'tower_claude')
  const agState   = agent.state
  const color     = STATE_COLORS[agState]
  const pulseMs   = PULSE_MS[agState]
  const toolCode  = agent.tool ? (TOOL_CODES[agent.tool] ?? null) : null
  // Tool badge suppressed for offline/online — no meaningful tool in those states.
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
            background:     OVERLAY_BG,
            // Border color tracks agent state — the card visually breathes with the agent.
            border:         `1px solid ${color}33`,
            borderLeft:     `2px solid ${color}`,
            borderRadius:   2,
            padding:        '5px 12px',
            backdropFilter: 'blur(6px)',
            display:        'flex',
            alignItems:     'center',
            gap:            8,
          }}>
            {/* State dot — pulsing when active.
                `animationDuration` set inline because `badge-pulse` is a single keyframe
                definition reused for all pulse-worthy states. The duration (from PULSE_MS)
                varies per state but the shape of the animation doesn't. */}
            <div style={{
              width:           BADGE_DOT_SIZE,
              height:          BADGE_DOT_SIZE,
              borderRadius:    '50%',
              background:      color,
              boxShadow:       agState !== 'offline' ? `0 0 6px ${color}` : 'none',
              animation:         pulseMs > 0 ? 'badge-pulse ease-in-out infinite' : 'none',
              animationDuration: pulseMs > 0 ? `${pulseMs}ms` : undefined,
              flexShrink:      0,
            }} />

            {/* Tool badge — shown only for active tool-using states */}
            {showTool && (
              <span style={{
                color:         color,
                fontSize:      BADGE_TOOL_FONT_SIZE,
                letterSpacing: '0.08em',
                fontFamily:    'var(--font-code)',
                opacity:       0.85,
              }}>
                [{toolCode}]
              </span>
            )}

            {/* State label at 80% alpha — readable but subordinate to the entity label */}
            <span style={{
              color:         `${color}cc`,
              fontSize:      BADGE_STATE_FONT_SIZE,
              letterSpacing: '0.14em',
            }}>
              {agState.toUpperCase()}
            </span>

            {/* Entity label at 53% alpha — present without competing with the state */}
            <span style={{
              color:         `${color}88`,
              fontSize:      BADGE_ENTITY_FONT_SIZE,
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
