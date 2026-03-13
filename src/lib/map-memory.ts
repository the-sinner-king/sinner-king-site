/**
 * map-memory.ts — Kingdom Map temporal ring buffer
 *
 * Stores the last 20 state snapshots (one per PatternEngine tick, ~10s each).
 * Enables duration detection: "Claude has been in 'searching' for 3 ticks (30s)".
 * Will feed Haiku context when MapVoice is built (deferred — separate design session).
 *
 * Module-level singleton. No React deps.
 */

import type { AgentState } from './kingdom-agents'

export interface MapMemoryEntry {
  timestamp: number
  agentStates: Record<string, AgentState>  // territoryId → state only (not activity)
  swarmCount: number
  brandonPresent: boolean
  tokenIntensity: 'quiet' | 'low' | 'med' | 'high'
  selectedTerritoryId: string | null
  observation: string | null  // MapVoice text if fired this tick (reserved for future use)
}

const MAX_ENTRIES = 20
const _ring: MapMemoryEntry[] = []

/** Add a snapshot to the ring buffer. Oldest entry evicted at 20 entries. */
export function addMemoryEntry(entry: MapMemoryEntry): void {
  _ring.push(entry)
  if (_ring.length > MAX_ENTRIES) _ring.splice(0, _ring.length - MAX_ENTRIES)
}

/** Get all stored entries, oldest-first. Read-only. */
export function getMemoryHistory(): readonly MapMemoryEntry[] {
  return _ring
}

/**
 * Returns how many consecutive ticks the given territory has been in the given state.
 * Returns 0 if not currently in that state or no history.
 */
export function getConsecutiveTicks(territoryId: string, state: AgentState): number {
  let count = 0
  for (let i = _ring.length - 1; i >= 0; i--) {
    if (_ring[i].agentStates[territoryId] === state) {
      count++
    } else {
      break
    }
  }
  return count
}
