/**
 * kingdom-agents.ts
 *
 * Canonical agent registry — single source of truth for all 4 Claude instances.
 * All components iterate AGENT_REGISTRY. All lookups use getAgent().
 * Never hardcode agent key strings in components.
 */

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const AGENT_REGISTRY = [
  { key: 'forge_claude',  label: 'FORGE',  territory: 'the_forge'   },
  { key: 'tower_claude',  label: 'TOWER',  territory: 'the_tower'   },
  { key: 'claude_house',  label: 'HOUSE',  territory: 'claude_house' },
  { key: 'throne_claude', label: 'THRONE', territory: 'the_throne'  },
] as const

export type AgentKey = typeof AGENT_REGISTRY[number]['key']

// Maps territory IDs → agent keys for the 4 Claude-inhabited territories.
// Territories without agents (core_lore, the_scryer) are absent — callers default to 'online'.
// Shared mood shape — both kingdom-store and kingdom-live-context use this type.
// Defined here (not in either consumer) so they stay in sync and TypeScript catches drift.
export interface MoodState {
  voltage:         number | null
  state:           string | null
  synesthesia_hex: string | null
  texture:         string | null
  drive:           string | null
}

export const TERRITORY_TO_AGENT: Partial<Record<string, AgentKey>> = {
  the_forge:    'forge_claude',
  the_tower:    'tower_claude',
  claude_house: 'claude_house',
  the_throne:   'throne_claude',
}

// ---------------------------------------------------------------------------
// Agent status — mirrors the 9-state model from token_api.py
// ---------------------------------------------------------------------------

export type AgentState =
  | 'offline'
  | 'online'
  | 'thinking'
  | 'reading'
  | 'working'
  | 'writing'
  | 'running'
  | 'searching'
  | 'swarming'

export interface AgentStatus {
  state:        AgentState
  activity:     number       // 0–100
  tool:         string | null
  display_name: string
  cwd_project:  string
  age_seconds:  number
  last_updated: string
  session_id:   string
  data_source:  string
}

// Safe fallback — returned by getAgent() when a key is missing
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

// Safe lookup — never throws, never returns undefined
export function getAgent(agents: Record<string, AgentStatus>, key: string): AgentStatus {
  return agents[key] ?? OFFLINE_AGENT
}

// ---------------------------------------------------------------------------
// 9-state color palette
// ---------------------------------------------------------------------------

export const STATE_COLORS: Record<AgentState, string> = {
  offline:   '#1a1520',
  online:    '#7000ff',
  thinking:  '#a833ff',
  reading:   '#00d4ff',
  working:   '#f0a500',
  writing:   '#ff3d7f',
  running:   '#ff6b35',
  searching: '#3dff00',
  swarming:  '#00f3ff',
}

// Pulse animation duration in ms — 0 means no pulse
export const PULSE_MS: Record<AgentState, number> = {
  offline:   0,
  online:    0,
  thinking:  2000,
  reading:   1250,
  working:   833,
  writing:   714,
  running:   833,
  searching: 625,
  swarming:  556,
}

// Roll-up priority order — highest intensity first
export const STATE_ORDER: AgentState[] = [
  'swarming', 'searching', 'writing', 'running', 'working',
  'reading', 'thinking', 'online', 'offline',
]

// Aggregate highest state across an agent map
export function rollupState(agents: Record<string, AgentStatus>): AgentState {
  const states = AGENT_REGISTRY.map((a) => getAgent(agents, a.key).state)
  for (const s of STATE_ORDER) {
    if (states.includes(s)) return s
  }
  return 'offline'
}

// ---------------------------------------------------------------------------
// Tool badge codes — omit badge for unknown tools (don't show [??])
// ---------------------------------------------------------------------------

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
