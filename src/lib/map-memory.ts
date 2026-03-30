/**
 * @module map-memory
 *
 * Kingdom Map temporal ring buffer — short-term state history for PatternEngine.
 *
 * ## Purpose
 * PatternEngine runs one tick every 10 seconds. Most rules only need to compare
 * "now" vs "previous tick" (a two-snapshot window). But some rules need deeper
 * history — specifically, duration detection: "has agent X been in state Y for
 * at least N consecutive ticks?"
 *
 * `map-memory` stores the last MAX_ENTRIES tick snapshots in a ring buffer and
 * exposes `getConsecutiveTicks()` so PatternEngine can ask duration questions
 * without re-implementing accumulation logic itself.
 *
 * ## Ring buffer mechanics
 * Entries are appended at the tail. When the buffer reaches MAX_ENTRIES, the
 * oldest entry (head) is evicted via `splice(0, overflow)`. This keeps the
 * module's memory footprint constant regardless of how long the engine runs.
 *
 * At 20 entries × 10 s/entry the buffer covers a 200-second (≈3.3 minute)
 * look-back window — enough for the current rules and a reasonable amount of
 * future ones without consuming meaningful memory.
 *
 * ## Consecutive ticks concept
 * `getConsecutiveTicks(agentKey, state)` scans the ring backwards (newest to
 * oldest) and counts how many trailing entries have `agentStates[agentKey] ===
 * state`. The scan stops as soon as it finds a mismatch. This gives PatternEngine
 * a cheap "how long has this been true?" answer measured in tick counts (multiply
 * by 10 for seconds).
 *
 * Example: if the last 5 entries all show forge_claude='searching', consecutive
 * ticks = 5 = 50 seconds of continuous searching.
 *
 * Rule 13 in PatternEngine uses this to emit `extended_op` exactly once when an
 * agent first crosses the 5-tick (40-second) threshold — an edge trigger, not a
 * level trigger.
 *
 * ## MapVoice reservation
 * The `observation` field on each entry is reserved for the future MapVoice
 * feature (Haiku-powered natural language commentary). It is always `null`
 * for now. When MapVoice is built it will write its output into the current
 * tick's entry after PatternEngine snapshots it.
 *
 * ## Lifecycle
 * Module-level singleton, no React dependencies. Initializes on import.
 * `clearMemoryHistory()` is called by PatternEngine on stop/restart to
 * prevent stale state from bleeding into the next engine lifecycle.
 */

import type { AgentState } from './kingdom-agents'

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

/**
 * Maximum number of tick snapshots retained in the ring buffer.
 * 20 entries × 10 s/tick = 200 s (≈3.3 min) of look-back history.
 * Sized to cover the longest current rule duration (Rule 13: 5 ticks = 50 s)
 * with ample headroom for future rules.
 */
const MAX_ENTRIES = 20

// ─── TYPES ─────────────────────────────────────────────────────────────────

/**
 * A single tick snapshot stored in the ring buffer.
 *
 * Captured by PatternEngine at the start of each tick, before any rules fire.
 * This means the snapshot represents ground truth state at tick time, not a
 * post-rule view.
 *
 * Note: `agentStates` keys are agent keys (matching `AGENT_REGISTRY[n].key`),
 * not territory IDs — the comment in the original code said "territoryId →
 * state" but the actual keys come from `AGENT_REGISTRY`.
 */
export interface MapMemoryEntry {
  /** Unix timestamp (ms) when this snapshot was taken. */
  timestamp: number

  /**
   * Agent key → `AgentState` at this tick.
   * Only the state is stored (not the full `AgentStatus`) to keep entries lean.
   * PatternEngine reconstructs full status from the Zustand store when needed.
   */
  agentStates: Record<string, AgentState>

  /** Number of active drone swarms at this tick. */
  swarmCount: number

  /** Whether Brandon was detected as present at this tick. */
  brandonPresent: boolean

  /** Token consumption intensity level at this tick. */
  tokenIntensity: 'quiet' | 'low' | 'med' | 'high'

  /** The currently selected territory ID, or null if none selected. */
  selectedTerritoryId: string | null

  /**
   * Reserved for MapVoice (future feature).
   * When MapVoice is implemented, it will populate this field with its
   * natural-language commentary for the tick. Always null for now.
   */
  observation: string | null
}

// ─── SINGLETON STATE ───────────────────────────────────────────────────────

/** The ring buffer itself. Index 0 = oldest entry; tail = newest entry. */
const _ring: MapMemoryEntry[] = []

// ─── PUBLIC API ────────────────────────────────────────────────────────────

/**
 * Append a new tick snapshot to the ring buffer.
 *
 * If the buffer is already at MAX_ENTRIES, the oldest entry is evicted
 * before the new one is appended, keeping the buffer at a fixed maximum size.
 *
 * Called by PatternEngine at the top of every `tick()` call, before rules
 * are evaluated, so rules always see the current tick in the history.
 *
 * @param entry - The snapshot to store
 */
export function addMemoryEntry(entry: MapMemoryEntry): void {
  _ring.push(entry)
  if (_ring.length > MAX_ENTRIES) {
    _ring.splice(0, _ring.length - MAX_ENTRIES)
  }
}

/**
 * Get a read-only view of all stored tick snapshots, oldest entry first.
 *
 * The returned array is typed `readonly` to prevent callers from mutating
 * the internal buffer. Consumers should treat this as a snapshot — the
 * contents may change on the next tick.
 *
 * @returns All stored entries in chronological order (oldest at index 0)
 */
export function getMemoryHistory(): readonly MapMemoryEntry[] {
  return _ring
}

/**
 * Clear all stored entries.
 *
 * Called by PatternEngine in `stopPatternEngine()` to prevent stale history
 * from bleeding into the next engine lifecycle (e.g. after a React Strict
 * Mode double-mount or a manual engine restart).
 */
export function clearMemoryHistory(): void {
  _ring.splice(0, _ring.length)
}

/**
 * Count how many consecutive trailing ticks an agent has been in a given state.
 *
 * Scans the ring buffer backwards from the newest entry, counting entries
 * where `agentStates[agentKey] === state`. Stops at the first mismatch.
 *
 * This implements the "consecutive ticks" concept: because entries are
 * appended chronologically and the scan is backwards, the result directly
 * answers "how many ticks in a row, ending right now, has this agent been in
 * this state?"
 *
 * @example
 * // forge_claude has been 'searching' for the last 5 ticks (50 seconds)
 * getConsecutiveTicks('forge_claude', 'searching') // → 5
 *
 * // Used by PatternEngine Rule 13 to emit extended_op exactly once when an
 * // agent first crosses the 5-tick (40 s) threshold.
 *
 * @param agentKey - The agent key to check (e.g. 'forge_claude')
 * @param state    - The `AgentState` to count consecutive occurrences of
 * @returns        Number of trailing entries (0 if not in that state or no history)
 */
export function getConsecutiveTicks(agentKey: string, state: AgentState): number {
  let count = 0
  for (let i = _ring.length - 1; i >= 0; i--) {
    if (_ring[i].agentStates[agentKey] === state) {
      count++
    } else {
      // First mismatch — streak is broken. Do not continue scanning.
      break
    }
  }
  return count
}
