/**
 * @module logbus
 *
 * Kingdom Map system log event bus — module-level singleton.
 *
 * ## Architecture
 * A lightweight publish/subscribe message bus with a capped ring buffer for
 * history. There is exactly one instance per JS runtime (one per browser tab);
 * no React context, no Zustand, no external dependencies.
 *
 * ## Threading model
 * JavaScript is single-threaded, so there is no true preemption. However, a
 * subscriber callback can synchronously call `logUnsubscribe` (or the unsub
 * function returned by `logSubscribe`), which mutates the `_subs` array
 * in-place. If we iterated `_subs` directly with `for...of`, that mutation
 * would cause the iterator to skip the element immediately after the removed
 * one. The fix is `_subs.slice()` — we iterate a snapshot of the array taken
 * before any callbacks fire, so late mutations to `_subs` are invisible to
 * the current dispatch loop.
 *
 * ## Ring buffer
 * `_history` is capped at MAX_HISTORY entries. When the cap is exceeded we
 * splice from index 0, evicting the oldest entry. This keeps memory bounded
 * while still allowing late-arriving components (e.g. SystemLog mounting
 * after the engine has been running) to receive recent history via
 * `getLogHistory()`.
 *
 * ## Lifecycle
 * Initializes on import — no explicit setup required. Teardown is not
 * needed; the bus is intentionally global for the page lifetime.
 *
 * ## Producers
 * - `PatternEngine` (pattern-engine.ts) — 14 edge-triggered rules
 * - `BrandonDetector` (future) — presence heuristics
 *
 * ## Consumers
 * - `SystemLog.tsx` — calls `logSubscribe()` on mount, `unsub()` on unmount
 * - Any component that needs the live feed or history snapshot
 */

// ─── ENTRY TYPES ───────────────────────────────────────────────────────────

/**
 * Discriminated union of all log entry categories.
 *
 * These map to distinct visual treatments in SystemLog.tsx (icon, colour,
 * label prefix). Adding a new type here requires a corresponding case in
 * the display component.
 */
export type LogEntryType =
  | 'agent'      // Agent state change (online/offline/thinking/etc.)
  | 'signal'     // Signal pulse event or token intensity change
  | 'swarm'      // Drone swarm deployed or dissolved
  | 'sync'       // State sync heartbeat — data freshness restored
  | 'voice'      // Map voice AI observation (MapVoice, deferred)
  | 'ops'        // Operator (Brandon) presence change
  | 'access'     // Territory accessed or selected on the map
  | 'alive'      // Keepalive — engine is alive but nothing noteworthy fired
  | 'system'     // General system events (startup, errors, etc.)

// ─── LOG ENTRY ─────────────────────────────────────────────────────────────

/**
 * A single log event emitted by the bus.
 *
 * `id` is stable and unique for the lifetime of the page — suitable as a
 * React `key`. `timestamp` is `Date.now()` at emit time (not at subscribe
 * time, not at render time).
 */
export interface LogEntry {
  /** Stable unique identifier. Format: `log_<timestamp>_<counter>`. */
  id:        string
  /** Category of event — drives icon + colour in SystemLog. */
  type:      LogEntryType
  /** Human-readable message. Hard-capped at 64 characters by `logEmit`. */
  text:      string
  /** Unix timestamp (ms) at the moment `logEmit` was called. */
  timestamp: number
}

// ─── SUBSCRIBER TYPE ───────────────────────────────────────────────────────

/**
 * Callback signature for log subscribers.
 * Called synchronously by `logEmit` for each new entry.
 */
type LogSub = (entry: LogEntry) => void

// ─── SINGLETON STATE ───────────────────────────────────────────────────────

/**
 * Monotonically increasing counter appended to IDs to ensure uniqueness
 * even when multiple entries are emitted within the same millisecond.
 */
let _idCounter = 0

/**
 * Live subscriber list. Modified by `logSubscribe` / the unsub closure.
 *
 * Never iterate this directly inside `logEmit` — use `_subs.slice()` instead.
 * See module-level threading note.
 */
const _subs: LogSub[] = []

/**
 * Ring buffer of recent entries. Newest entry is always at the tail.
 * Capped at MAX_HISTORY; older entries are evicted from the head.
 */
const _history: LogEntry[] = []

/**
 * Maximum number of entries retained in the history ring buffer.
 * 60 entries × ~10 s/entry = ~10 minutes of scrollback. Chosen to give
 * SystemLog enough history to fill its viewport without unbounded growth.
 */
const MAX_HISTORY = 60

// ─── INTERNAL HELPERS ──────────────────────────────────────────────────────

/**
 * Generate a unique, stable log entry ID.
 * Combines the current timestamp (ms) with an ever-incrementing counter so
 * two entries emitted in the same millisecond get distinct IDs.
 */
function _makeId(): string {
  return `log_${Date.now()}_${_idCounter++}`
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────

/**
 * Emit a new log entry and synchronously notify all subscribers.
 *
 * Text is hard-capped at 64 characters — rules must fit within the
 * SystemLog single-line display. Longer strings are silently truncated.
 *
 * Subscriber errors are swallowed so a broken display component cannot
 * disrupt the engine's emit loop.
 *
 * @param type  - Category of the event (drives icon + colour downstream)
 * @param text  - Human-readable message (truncated to 64 chars)
 */
export function logEmit(type: LogEntryType, text: string): void {
  const entry: LogEntry = {
    id:        _makeId(),
    type,
    // Hard cap — never let a rule overflow the single-line SystemLog display.
    text:      text.slice(0, 64),
    timestamp: Date.now(),
  }

  // Append to ring buffer; evict oldest entry if we've exceeded the cap.
  _history.push(entry)
  if (_history.length > MAX_HISTORY) {
    _history.splice(0, _history.length - MAX_HISTORY)
  }

  // Iterate over a SNAPSHOT of _subs, not the live array.
  //
  // Why: JS is single-threaded so there is no preemption, but a subscriber
  // callback can synchronously call the unsub() closure returned by
  // logSubscribe(), which splices an element out of `_subs` in-place.
  // Iterating the live array while it is being mutated causes the iterator
  // to advance past the element immediately after the removed one — silently
  // skipping that subscriber for this dispatch cycle.
  //
  // `_subs.slice()` snapshots the array before any callbacks fire, so
  // in-flight mutations are invisible to the current loop.
  for (const sub of _subs.slice()) {
    try {
      sub(entry)
    } catch {
      // Subscriber errors must not disrupt the bus or cause other subscribers
      // to miss the entry.
    }
  }
}

/**
 * Subscribe to new log entries.
 *
 * The callback is called synchronously inside `logEmit` for every new entry
 * from this point forward. Historical entries are available separately via
 * `getLogHistory()`.
 *
 * @param fn - Callback invoked with each new `LogEntry`
 * @returns Unsubscribe function — call it in a React `useEffect` cleanup or
 *          equivalent teardown to prevent memory leaks and stale callbacks.
 *
 * @example
 * ```ts
 * useEffect(() => {
 *   const unsub = logSubscribe((entry) => setEntries(prev => [...prev, entry]))
 *   return unsub
 * }, [])
 * ```
 */
export function logSubscribe(fn: LogSub): () => void {
  _subs.push(fn)
  return () => {
    const idx = _subs.indexOf(fn)
    if (idx !== -1) _subs.splice(idx, 1)
  }
}

/**
 * Get a read-only snapshot of recent log history, oldest entry first.
 *
 * Intended for components that mount after the engine has been running and
 * need to pre-populate their display (e.g. SystemLog on mount). The returned
 * array is `readonly` to prevent callers from mutating the internal buffer.
 *
 * @returns Immutable view of the last MAX_HISTORY entries, newest at tail.
 */
export function getLogHistory(): readonly LogEntry[] {
  return _history
}
