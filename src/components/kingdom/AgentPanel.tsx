'use client'

/**
 * @file AgentPanel.tsx
 *
 * @description
 * Renders a DOM overlay listing all four Claude instances (FORGE / TOWER / HOUSE / THRONE)
 * with per-state ASCII faceplate expressions, CHROMA_BLEED glow, daemon process labels,
 * and optional tool badges. Positioned inside the Kingdom Map canvas by the parent layout.
 *
 * @dataSource
 * `useKingdomLive()` → `data.agents` (Record<string, AgentStatus>).
 * The context polls `/api/local/agents/status` every 15 s and falls back to the
 * PartyKit snapshot; agents are never read from the Zustand store directly here.
 * Iterates `AGENT_REGISTRY` (4 entries) so the rendered list is always structurally
 * complete even when some agents are offline — `getAgent()` returns `OFFLINE_AGENT`
 * as a safe fallback rather than undefined.
 *
 * @lifecycle
 * - Renders null during 'loading' and 'error' states.
 * - `StaleWrapper` dims to 50% opacity and shows a STALE badge when status === 'stale'.
 * - `<style href="agent-panel-anim">` uses React 19's deduplicated style hoisting —
 *   the same href is only injected once regardless of how many instances mount.
 *   The 'agent-dot-pulse' keyframe animates faceplate opacity for states that have a
 *   non-zero PULSE_MS but no dedicated CSS animation class.
 *
 * @gotcha
 * `STATE_ANIM[state]` and the inline `animation` prop on the faceplate span are
 * mutually exclusive by design. When `animClass` is non-empty the inline animation
 * is suppressed (`undefined`) so the two don't fight each other.
 */

import { useKingdomLive, StaleWrapper } from '@/lib/kingdom-live-context'
import {
  AGENT_REGISTRY,
  STATE_COLORS,
  PULSE_MS,
  TOOL_CODES,
  getAgent,
} from '@/lib/kingdom-agents'
import type { AgentState, AgentStatus } from '@/lib/kingdom-agents'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** Minimum width of the panel card in pixels — enough for all labels + tool badge. */
const PANEL_MIN_WIDTH = 210

/** Left-border accent: 2px structural rule separating each agent row by state color. */
const AGENT_ROW_BORDER_WIDTH = 2

/** Width of the faceplate character column — fixed so label column aligns across rows. */
const FACEPLATE_MIN_WIDTH = 22

/** Width of the agent label column (FORGE / TOWER etc.) — fixed for alignment. */
const LABEL_MIN_WIDTH = 36

/** Opacity applied to agent rows in 'offline' state — dimmed but not hidden. */
const OFFLINE_OPACITY = 0.45

/** Faceplate font size in px — smaller than labels to emphasize the ASCII glyph shape. */
const FACEPLATE_FONT_SIZE = 9

/** Agent name label font size in px. */
const LABEL_FONT_SIZE = 8

/** Daemon state label font size in px. */
const STATE_LABEL_FONT_SIZE = 7

/** Tool badge font size in px. */
const TOOL_BADGE_FONT_SIZE = 6

/** Header glyph + title font size in px. */
const HEADER_FONT_SIZE = 9

/** Hot-pink used for agent name labels and tool badge borders throughout this panel. */
const LABEL_COLOR = '#ff006e'

/** Hot-pink at 40% alpha — the dimmed `.inst` suffix beside each agent name. */
const INST_SUFFIX_COLOR = 'rgba(255, 0, 110, 0.40)'

/** Panel background: near-black with a violet tint matching the Kingdom palette. */
const PANEL_BG = 'oklch(0.040 0.035 281)'

/** Panel border: low-alpha violet to define the card without overpowering the content. */
const PANEL_BORDER = '1px solid oklch(0.495 0.310 281 / 0.30)'

/** Left accent border: higher-alpha violet structural stripe. */
const PANEL_BORDER_LEFT = '2px solid oklch(0.495 0.310 281 / 0.50)'

/** Outer glow on the panel card. Two layers: tight + diffuse. */
const PANEL_BOX_SHADOW = '0 0 18px oklch(0.495 0.310 281 / 0.12), 0 0 40px oklch(0.495 0.310 281 / 0.05)'

/** Cyan used for the header glyph and AGENTS.log title. */
const HEADER_COLOR = '#00f3ff'

// ─── FACEPLATE GLOW MAP ───────────────────────────────────────────────────────

/**
 * Per-state text-shadow for the ASCII faceplate glyph.
 * CHROMA_BLEED doctrine: 2–5 layers, each adding a larger diffuse halo.
 * States with high energy (swarming, searching) get chromatic aberration via
 * split red/green offsets (1px / -1px) on the outer layers.
 */
const FACEPLATE_GLOW: Record<AgentState, string> = {
  offline:   '0 0 2px oklch(0.160 0.028 281 / 0.30)',
  online:    '0 0 6px oklch(0.495 0.310 281), 0 0 14px oklch(0.495 0.310 281 / 0.30)',
  thinking:  '0 0 8px oklch(0.560 0.250 281), 0 0 18px oklch(0.560 0.250 281 / 0.25)',
  reading:   '0 0 8px oklch(0.820 0.140 194), 0 0 16px oklch(0.820 0.140 194 / 0.30)',
  working:   '0 0 10px oklch(0.770 0.225 74), 0 0 20px oklch(0.770 0.225 74 / 0.35), 0 0 4px oklch(0.640 0.300 350 / 0.15)',
  writing:   '0 0 10px oklch(0.680 0.290 350), 0 0 22px oklch(0.680 0.290 350 / 0.40), 0 0 40px oklch(0.680 0.290 350 / 0.12)',
  running:   '0 0 8px oklch(0.670 0.210 43), 0 0 16px oklch(0.670 0.210 43 / 0.30), 1px 0 3px oklch(0.670 0.210 43 / 0.25)',
  searching: '0 0 12px oklch(0.905 0.305 142), 0 0 26px oklch(0.905 0.305 142 / 0.40), 1px 0 3px oklch(0.640 0.300 350 / 0.20), -1px 0 3px oklch(0.640 0.300 350 / 0.20)',
  swarming:  '0 0 14px oklch(0.930 0.140 194), 0 0 30px oklch(0.930 0.140 194 / 0.45), 0 0 50px oklch(0.930 0.140 194 / 0.15), 2px 0 4px oklch(0.770 0.225 74 / 0.20), -2px 0 4px oklch(0.770 0.225 74 / 0.20)',
}

// ─── STATE DISPLAY MAPS ──────────────────────────────────────────────────────

/**
 * TYPE_WEAVER daemon process name shown to the right of each faceplate.
 * Mimics Unix process list aesthetics: suffix indicates process class.
 */
const STATE_LABELS: Record<AgentState, string> = {
  offline:   '×_OFFLINE',
  online:    'IDLE.sys',
  thinking:  'THINK.proc',
  reading:   'READ.stream',
  working:   'WORK.exe',
  writing:   'WRITE.out',
  running:   'RUN.daemon',
  searching: 'SCAN.deep',
  swarming:  '▓▓ SWARM.max',
}

/** ASCII face expression per agent state — rendered as the visual "avatar". */
const FACEPLATE: Record<AgentState, string> = {
  offline:   'x_x',
  online:    '-_-',
  thinking:  'o_o',
  reading:   'o_o',
  working:   '>_<',
  writing:   ';_;',
  running:   '>_>',
  searching: 'O_O',
  swarming:  '*_*',
}

/**
 * KINETIC v2 CSS animation class applied to the faceplate span.
 * All classes are defined in globals.css under the `.hud-anim-*` namespace.
 * Empty string → no keyframe animation; the faceplate may still get the
 * `agent-dot-pulse` inline animation when PULSE_MS[state] > 0.
 *
 * The `hud-anim-*` classes bind to `@keyframes state-*` rules in globals.css.
 * They are intentionally *not* inline styles so the browser can GPU-composite
 * opacity/transform without triggering layout.
 */
const STATE_ANIM: Record<AgentState, string> = {
  offline:   '',
  online:    '',
  thinking:  'hud-anim-think',
  reading:   'hud-anim-reading-eyes',
  working:   'hud-anim-heartbeat',
  writing:   'hud-anim-write-pulse',
  running:   'hud-anim-running',
  searching: 'hud-anim-searching',
  swarming:  'hud-anim-swarming',
}

/**
 * TYPE_WEAVER kerning values per state.
 * Higher letter-spacing = scanner / surveillance aesthetic (searching: 0.22em).
 * Compressed spacing = raw throughput / dense execution (swarming: -0.01em).
 */
const STATE_KERNING: Record<AgentState, string> = {
  offline:   '0.14em',
  online:    '0.10em',
  thinking:  '0.14em',
  reading:   '0.10em',
  working:   '0.06em',
  writing:   '0.06em',
  running:   '0.08em',
  searching: '0.22em',
  swarming:  '-0.01em',
}

/**
 * Icon character shown inside the tool badge, keyed by Claude tool name.
 * Falls back to '◈' for any tool not in this map so the badge always renders something.
 */
const TOOL_ICON: Record<string, string> = {
  Task: '⚙', Write: '✍', Grep: '◎', Read: '◈',
  Bash: '⚡', Edit: '✦', Agent: '⬡', WebSearch: '◇',
}

/**
 * States that apply the `hud-anim-name` CSS class to the agent name label.
 * `hud-anim-name` runs `name-shimmer` (globals.css) — a subtle luminance sweep
 * that signals the agent is actively producing output, not just alive.
 * Applied to output-heavy states (working, writing) and high-activity states
 * (searching, swarming) but NOT to passive states (thinking, reading, running)
 * where the faceplate animation is the primary activity signal.
 */
const SHIMMER_STATES = new Set<AgentState>(['working', 'writing', 'searching', 'swarming'])

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** Props for the internal AgentRow sub-component. */
interface AgentRowProps {
  /** Live status object from the agents map; may be OFFLINE_AGENT if key is absent. */
  agent: AgentStatus
  /** Registry entry providing the stable label string and territory key. */
  entry: typeof AGENT_REGISTRY[number]
}

// ─── AGENT ROW ────────────────────────────────────────────────────────────────

/**
 * Renders a single agent row: faceplate | label.inst | daemon state | [tool badge].
 * Internal to AgentPanel — not exported.
 */
function AgentRow({ agent, entry }: AgentRowProps) {
  const { state, tool } = agent
  const color     = STATE_COLORS[state]
  const pulseMs   = PULSE_MS[state]
  const toolCode  = tool ? (TOOL_CODES[tool] ?? null) : null
  // Tool badge only shown when: a recognized tool code exists AND the agent is doing real work.
  // Omitting the badge for 'offline' / 'online' prevents a confusing "[◈ RD]" on an idle agent.
  const showTool  = toolCode !== null && state !== 'offline' && state !== 'online'
  const isOffline = state === 'offline'
  const animClass = STATE_ANIM[state]
  // TOOL_ICON fallback '◈' used for any tool not in the map so the badge shape is consistent.
  const icon      = tool ? (TOOL_ICON[tool] ?? '◈') : '◈'
  const shimmer   = SHIMMER_STATES.has(state)

  return (
    <div style={{
      display:       'flex',
      alignItems:    'center',
      gap:           7,
      marginBottom:  6,
      paddingLeft:   6,
      borderLeft:    `${AGENT_ROW_BORDER_WIDTH}px solid ${color}`,
      opacity:       isOffline ? OFFLINE_OPACITY : 1,
      transition:    'opacity 0.4s ease',
    }}>
      {/* Faceplate — ASCII face with per-state CHROMA_BLEED glow.
          animClass takes priority: when a dedicated CSS keyframe exists for this state,
          the inline `animation` prop is set to `undefined` to avoid a conflict where
          two animation declarations target the same element — only one would win. */}
      <span
        className={animClass}
        style={{
          color:         color,
          fontSize:      FACEPLATE_FONT_SIZE,
          fontFamily:    '"JetBrains Mono", monospace',
          letterSpacing: '0.02em',
          textShadow:    FACEPLATE_GLOW[state],
          minWidth:      FACEPLATE_MIN_WIDTH,
          flexShrink:    0,
          animation:     pulseMs > 0 && !animClass
            ? `agent-dot-pulse ${pulseMs}ms ease-in-out infinite`
            : undefined,
        }}
      >
        {FACEPLATE[state]}
      </span>

      {/* Agent label — hot pink with dimmed .inst suffix.
          `hud-anim-name` (globals.css → name-shimmer keyframe) is only applied for
          SHIMMER_STATES — a luminance sweep that reads as "actively producing output". */}
      <span
        className={shimmer ? 'hud-anim-name' : ''}
        style={{
          color:         LABEL_COLOR,
          fontSize:      LABEL_FONT_SIZE,
          letterSpacing: '0.14em',
          minWidth:      LABEL_MIN_WIDTH,
          flexShrink:    0,
        }}
      >
        {entry.label}
        <span style={{ color: INST_SUFFIX_COLOR, fontSize: STATE_LABEL_FONT_SIZE }}>.inst</span>
      </span>

      {/* Daemon state label — TYPE_WEAVER process name with per-state kerning */}
      <span style={{
        color:         `${color}cc`,
        fontSize:      STATE_LABEL_FONT_SIZE,
        letterSpacing: STATE_KERNING[state],
        flex:          1,
        fontFamily:    '"JetBrains Mono", monospace',
        whiteSpace:    'nowrap',
        overflow:      'hidden',
      }}>
        {STATE_LABELS[state]}
      </span>

      {/* Tool badge — [⚙ TOOL] in pink border. Only shown for active tool-using states. */}
      {showTool && (
        <span style={{
          color:         LABEL_COLOR,
          border:        '1px solid rgba(255, 0, 110, 0.27)',
          borderRadius:  2,
          fontSize:      TOOL_BADGE_FONT_SIZE,
          letterSpacing: '0.08em',
          padding:       '0 3px',
          fontFamily:    '"JetBrains Mono", monospace',
          flexShrink:    0,
          whiteSpace:    'nowrap',
        }}>
          [{icon} {toolCode}]
        </span>
      )}
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

/**
 * AgentPanel — full faceplate system for all 4 Claude instances.
 *
 * Renders null during loading/error. Wraps in StaleWrapper for the stale-data
 * opacity treatment. Iterates AGENT_REGISTRY (not the agents map keys) so the
 * row count is always stable at 4 regardless of what the API returns.
 */
export function AgentPanel() {
  const { data, status } = useKingdomLive()

  if (status === 'loading' || status === 'error' || !data) return null

  const { agents } = data

  return (
    <>
      {/* React 19 deduplication: href+precedence ensures these keyframes are hoisted
          to the document exactly once even if AgentPanel mounts multiple times. */}
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
          fontFamily: '"JetBrains Mono", monospace',
          animation:  'agent-panel-in 0.5s ease-out',
        }}>
          <div style={{
            background:     PANEL_BG,
            border:         PANEL_BORDER,
            borderLeft:     PANEL_BORDER_LEFT,
            borderRadius:   3,
            padding:        '8px 10px 7px',
            backdropFilter: 'blur(8px)',
            minWidth:       PANEL_MIN_WIDTH,
            boxShadow:      PANEL_BOX_SHADOW,
          }}>
            {/* Header — « ◇ » AGENTS.log with cyan glyph breathing animation */}
            <div style={{
              display:       'flex',
              alignItems:    'center',
              gap:           5,
              paddingBottom: 6,
              marginBottom:  6,
            }}>
              {/* hud-anim-glyph (globals.css) → glyph-breathe keyframe: slow opacity pulse */}
              <span
                className="hud-anim-glyph"
                style={{ color: HEADER_COLOR, fontSize: HEADER_FONT_SIZE, letterSpacing: '0.06em' }}
              >
                «◇»
              </span>
              <span style={{
                color:         HEADER_COLOR,
                fontSize:      HEADER_FONT_SIZE,
                letterSpacing: '0.20em',
                opacity:       0.80,
              }}>
                AGENTS.log
              </span>
            </div>

            {/* hud-divider (globals.css) — traveling cyan→pink scanline light strip */}
            <div className="hud-divider" style={{ marginBottom: 7 }} />

            {/* Agent rows — driven by AGENT_REGISTRY, not by Object.keys(agents).
                This guarantees a stable 4-row layout even when agents are partially
                populated (e.g., only tower_claude present during boot). */}
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
