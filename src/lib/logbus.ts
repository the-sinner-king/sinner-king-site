/**
 * logbus.ts — Kingdom Map system log event bus
 *
 * Module-level singleton. Zero React subscriptions on emit.
 * PatternEngine, BrandonDetector, and future emitters call logEmit().
 * SystemLog.tsx calls logSubscribe() once on mount — DOM mutation from there.
 *
 * No external deps. Initializes on import.
 */

export type LogEntryType =
  | 'agent'      // Agent state change
  | 'signal'     // Signal pulse event
  | 'swarm'      // Drone swarm deployed/dissolved
  | 'sync'       // State sync heartbeat
  | 'voice'      // Map voice AI observation
  | 'ops'        // Operator presence change
  | 'access'     // Territory accessed/selected
  | 'alive'      // Keepalive — system is breathing
  | 'system'     // General system event

export interface LogEntry {
  id: string
  type: LogEntryType
  text: string
  timestamp: number  // Date.now()
}

type LogSub = (entry: LogEntry) => void

// --- Module-level singleton state ---
let _idCounter = 0
const _subs: LogSub[] = []
const _history: LogEntry[] = []
const MAX_HISTORY = 60

function _makeId(): string {
  return `log_${Date.now()}_${_idCounter++}`
}

/** Emit a new log entry. Notifies all subscribers synchronously. */
export function logEmit(type: LogEntryType, text: string): void {
  const entry: LogEntry = {
    id: _makeId(),
    type,
    text: text.slice(0, 64),  // hard cap — never let a rule overflow the display
    timestamp: Date.now(),
  }
  _history.push(entry)
  if (_history.length > MAX_HISTORY) _history.splice(0, _history.length - MAX_HISTORY)
  for (const sub of _subs) {
    try { sub(entry) } catch { /* subscriber errors must not disrupt the bus */ }
  }
}

/** Subscribe to new log entries. Returns an unsubscribe function. */
export function logSubscribe(fn: LogSub): () => void {
  _subs.push(fn)
  return () => {
    const idx = _subs.indexOf(fn)
    if (idx !== -1) _subs.splice(idx, 1)
  }
}

/** Get snapshot of recent log history (newest-last). Read-only. */
export function getLogHistory(): readonly LogEntry[] {
  return _history
}
