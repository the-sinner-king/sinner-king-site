/**
 * @module kingdom-agents
 *
 * Canonical agent registry — single source of truth for all 4 Claude instances.
 *
 * ## Architecture
 * This module defines the static shape of every agent the Kingdom Map knows
 * about: their key (API identifier), display label, and home territory. All
 * components that render agent data import from here — no string literals for
 * agent keys elsewhere in the codebase.
 *
 * ## AgentStatus vs AgentState — why two separate types?
 * `AgentState` is a narrow discriminated union of the 9 possible activity
 * modes (offline, online, thinking, …). It is used by:
 *   - PatternEngine — to detect state-change edges
 *   - MapMemory — to store tick-level snapshots
 *   - KingdomStore — as the state field inside AgentStatus
 *   - CSS helpers (STATE_COLORS, PULSE_MS) — for visual rendering
 *
 * `AgentStatus` is the full runtime payload returned by `/api/local/agents/status`.
 * It wraps `AgentState` and adds metadata that is only useful for display:
 * activity level, current tool, working directory, session ID, etc.
 *
 * Keeping them separate means PatternEngine and MapMemory work with lean
 * `AgentState` strings (fast equality checks, tiny snapshots), while display
 * components that need the rich payload import `AgentStatus` directly.
 * TypeScript catches any drift between the two because `AgentStatus.state`
 * is typed as `AgentState`.
 *
 * ## MoodState co-location
 * `MoodState` is defined here (not in kingdom-store or kingdom-live-context)
 * because both of those modules consume it. Defining it at this shared leaf
 * node prevents a circular import and keeps both consumers in sync.
 *
 * ## Lifecycle
 * Pure constants + pure functions — no side effects on import.
 */

// ─── REGISTRY ──────────────────────────────────────────────────────────────

/**
 * Static registry of all Claude agent instances in the Kingdom.
 *
 * - `key` — matches the key used by `/api/local/agents/status` JSON response.
 *   Never hardcode these strings in components; use `AgentKey` and
 *   `AGENT_REGISTRY` instead.
 * - `label` — short display name for HUD components.
 * - `territory` — the Kingdom territory this agent inhabits (used by
 *   `TERRITORY_TO_AGENT` for reverse lookups).
 *
 * `as const` makes the array and all nested objects `readonly`, which lets
 * TypeScript derive the narrowest possible types for `AgentKey` below.
 */
export const AGENT_REGISTRY = [
  { key: 'forge_claude',  label: 'FORGE',  territory: 'the_forge'   },
  { key: 'tower_claude',  label: 'TOWER',  territory: 'the_tower'   },
  { key: 'claude_house',  label: 'HOUSE',  territory: 'claude_house' },
  { key: 'throne_claude', label: 'THRONE', territory: 'the_throne'  },
] as const

/**
 * Union of all valid agent key strings, derived from the registry.
 * TypeScript will catch typos at compile time.
 */
export type AgentKey = typeof AGENT_REGISTRY[number]['key']

// ─── MOOD STATE ────────────────────────────────────────────────────────────

/**
 * Shared mood payload shape.
 *
 * Populated by `/api/local/kingdom/live` (local Super API) or the PartyKit
 * fallback snapshot. Both `kingdom-store` and `kingdom-live-context` import
 * this type so TypeScript catches any drift between the two consumers.
 *
 * All fields are nullable — the mood pipeline may not have fired yet on a
 * fresh session or may be temporarily unavailable.
 */
export interface MoodState {
  /** Current activation level. Range varies by implementation; null = unknown. */
  voltage:         number | null
  /** Textual mood label (e.g. "focused", "restless"). */
  state:           string | null
  /** CSS hex colour derived from the active mood via synesthesia mapping. */
  synesthesia_hex: string | null
  /** Tactile/textural description of the current mood (e.g. "smooth", "jagged"). */
  texture:         string | null
  /** Current motivational drive state (e.g. "building", "exploring"). */
  drive:           string | null
}

// ─── TERRITORY LOOKUP ──────────────────────────────────────────────────────

/**
 * Maps territory IDs to agent keys for the 4 Claude-inhabited territories.
 *
 * Territories without agents (`core_lore`, `the_scryer`) are absent — callers
 * that do a lookup and get `undefined` should default the display to `'online'`
 * (territory is alive, just not agent-driven).
 *
 * `Partial<Record<string, AgentKey>>` instead of `Record<AgentKey, string>` because
 * the lookup direction is territory → agent (not every string is a territory, and
 * not every territory has an agent).
 */
export const TERRITORY_TO_AGENT: Partial<Record<string, AgentKey>> = {
  the_forge:    'forge_claude',
  the_tower:    'tower_claude',
  claude_house: 'claude_house',
  the_throne:   'throne_claude',
}

// ─── AGENT STATE ───────────────────────────────────────────────────────────

/**
 * The 9 possible activity states for a Claude agent.
 *
 * Mirrors the 9-state model defined in `token_api.py` on the Super API side.
 * Any change here must be reflected there, and vice versa.
 *
 * States are ordered conceptually from quiescent to most active:
 *   offline < online < thinking < reading < working < writing < running < searching < swarming
 *
 * This ordering is encoded explicitly in `STATE_ORDER` for rollup purposes.
 */
export type AgentState =
  | 'offline'    // No active Claude session detected
  | 'online'     // Session open, idle — no tool use or generation
  | 'thinking'   // Generating a response (LLM inference in progress)
  | 'reading'    // Read/Glob/Grep tool in flight
  | 'working'    // Edit/Write/Bash tool in flight
  | 'writing'    // Extended write operation (multi-file, large output)
  | 'running'    // Long-running subprocess (npm, tests, builds)
  | 'searching'  // WebSearch/WebFetch or knowledge retrieval tool active
  | 'swarming'   // Agent/Task tool spawning sub-agents (drone deployment)

// ─── AGENT STATUS ──────────────────────────────────────────────────────────

/**
 * Full runtime agent payload from `/api/local/agents/status`.
 *
 * This is the "fat" version of agent data — used by display components that
 * need metadata beyond the raw state. PatternEngine and MapMemory work with
 * the leaner `AgentState` type extracted from this struct's `state` field.
 *
 * All string fields that can be absent are typed `string | null` so callers
 * are forced to handle the missing case rather than rendering empty strings.
 */
export interface AgentStatus {
  /** Current activity mode — the narrow state enum. */
  state:        AgentState
  /** Activity intensity. Range: 0–100. Used to drive visual effects. */
  activity:     number
  /** Name of the tool currently in use, or null if none. */
  tool:         string | null
  /** Human-readable name for the current session (e.g. project folder name). */
  display_name: string
  /** Working directory / project name inferred from the session's cwd. */
  cwd_project:  string
  /** Seconds since the last state update from token_api.py. */
  age_seconds:  number
  /** ISO timestamp of the last update from the API (informational). */
  last_updated: string
  /** Unique session identifier assigned by Claude Code. */
  session_id:   string
  /** How the data was sourced (e.g. 'live', 'file', 'file_missing'). */
  data_source:  string
}

// ─── SAFE FALLBACK ─────────────────────────────────────────────────────────

/**
 * Safe fallback value returned by `getAgent()` when a key is missing from
 * the agents map.
 *
 * `age_seconds: 9999` signals "very stale / definitely not live" to any
 * consumer that checks freshness.
 * `data_source: 'file_missing'` surfaces in diagnostic views to indicate
 * the agent's state file was not found by the API.
 */
export const OFFLINE_AGENT: AgentStatus = {
  state:        'offline',
  activity:     0,
  tool:         null,
  display_name: '',
  cwd_project:  '',
  age_seconds:  9999,
  last_updated: '',
  session_id:   '',
  data_source:  'file_missing',
}

/**
 * Safe lookup into an agents map.
 *
 * Never throws, never returns `undefined`. Falls back to `OFFLINE_AGENT`
 * when the key is absent — e.g. before the first API response arrives or
 * when a new agent key is added to the registry before the API is updated.
 *
 * @param agents - The agents map from the API response or Zustand store
 * @param key    - Agent key to look up (should be an `AgentKey`, but typed
 *                 as `string` so callers don't need a cast when key comes
 *                 from a dynamic source)
 * @returns      The agent's current `AgentStatus`, or `OFFLINE_AGENT`
 */
export function getAgent(agents: Record<string, AgentStatus>, key: string): AgentStatus {
  return agents[key] ?? OFFLINE_AGENT
}

// ─── STATE COLORS ──────────────────────────────────────────────────────────

/**
 * CHROMA_BLEED colour palette — one colour per `AgentState`.
 *
 * Colours were chosen and tuned by CHROMA_BLEED (Glitchswarm) to maximise
 * perceptual separation between states while staying within the Kingdom's
 * dark-violet aesthetic. Values are final unless CHROMA_BLEED revises them.
 *
 * Inline comments note the OKLCH coordinates and tuning rationale for each
 * colour, so future revisions can start from a precise perceptual baseline
 * rather than guessing in hex.
 */
export const STATE_COLORS: Record<AgentState, string> = {
  offline:   '#1c1030',  // Dormant violet glow — not dead black, still "present"
  online:    '#7700ff',  // CHROMA_BLEED: L 0.495 C 0.310 — electric idle
  thinking:  '#9a40ff',  // CHROMA_BLEED: L 0.56 C 0.250 H 281 — soft inference glow
  reading:   '#00d4ff',  // Held — already correct cyan for data ingestion
  working:   '#f5aa00',  // CHROMA_BLEED: C 0.225 — forge fires at full temperature
  writing:   '#ff3d85',  // CHROMA_BLEED: hottest pink — generation in progress
  running:   '#ff6b35',  // Held — correct orange for subprocess execution
  searching: '#44ff00',  // CHROMA_BLEED: C 0.305 — intentional violence (acid green)
  swarming:  '#72faff',  // CHROMA_BLEED: L 0.93 — near-maximum luminance, ablaze
}

// ─── PULSE TIMING ──────────────────────────────────────────────────────────

/**
 * Glow pulse animation durations in milliseconds. `0` means no pulse.
 *
 * Each active state has a distinct cadence so multiple agents are visually
 * distinguishable at a glance. Rates were slowed from original values to
 * remove "nuttymode" flicker while preserving cadence hierarchy:
 *
 *   swarming (900ms) → searching (1100ms) → writing (1400ms) →
 *   working/running (1600ms) → reading (2200ms) → thinking (3000ms)
 *
 * The hierarchy maps to perceived urgency: swarming is the most frenetic,
 * thinking is the most languid.
 */
export const PULSE_MS: Record<AgentState, number> = {
  offline:   0,
  online:    0,
  thinking:  3000,
  reading:   2200,
  working:   1600,
  writing:   1400,
  running:   1600,
  searching: 1100,
  swarming:  900,
}

// ─── STATE ROLLUP ──────────────────────────────────────────────────────────

/**
 * Priority order for state rollup — highest intensity first.
 *
 * Used by `rollupState()` to find the most interesting state currently active
 * across all agents. The order reflects real urgency: swarming (multi-agent
 * deployment) outranks everything; offline is the fallback of last resort.
 */
export const STATE_ORDER: AgentState[] = [
  'swarming', 'searching', 'writing', 'running', 'working',
  'reading', 'thinking', 'online', 'offline',
]

/**
 * Aggregate the highest-priority active state across all known agents.
 *
 * Used by the fish tank to drive a single "Kingdom pulse" visual when a
 * per-agent breakdown is not needed (e.g. the overview glow).
 *
 * @param agents - Current agents map from the API or Zustand store
 * @returns      The most intense `AgentState` currently active across all
 *               agents in `AGENT_REGISTRY`, or `'offline'` if all are idle.
 */
export function rollupState(agents: Record<string, AgentStatus>): AgentState {
  const states = AGENT_REGISTRY.map((a) => getAgent(agents, a.key).state)
  for (const s of STATE_ORDER) {
    if (states.includes(s)) return s
  }
  return 'offline'
}

// ─── TOOL BADGE CODES ──────────────────────────────────────────────────────

/**
 * Short two-character display codes for known Claude Code tool names.
 *
 * Used by HUD components to render a compact badge (e.g. "[RD]") next to an
 * agent that is currently using a tool. Keys must match the `tool` field
 * strings returned by `token_api.py`.
 *
 * Tools not present in this map are intentionally omitted — unknown tools
 * render no badge rather than a confusing `[??]`.
 */
export const TOOL_CODES: Record<string, string> = {
  Edit:         'ED',
  Write:        'WR',
  NotebookEdit: 'NB',
  Read:         'RD',
  Grep:         'GR',
  Glob:         'GL',
  Bash:         'BH',
  Task:         'TS',
  WebSearch:    'WS',
  WebFetch:     'WF',
  Agent:        'AG',
}
