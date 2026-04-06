'use client'

/**
 * SystemLog.tsx
 *
 * Left-side vertical panel displaying the Kingdom Map's live system log.
 * Always visible. Newest entry at top; up to MAX_ENTRIES shown at once.
 *
 * DATA SOURCE
 *   logbus.ts — module-level event bus (singleton, no external deps).
 *   logSubscribe() is called once on mount; the callback prepends new entries
 *   to local state and trims to MAX_ENTRIES. This component never polls —
 *   it only re-renders when a new entry arrives or the 30s age-refresh fires.
 *
 * RING BUFFER CONCEPT
 *   `entries` state is a ring buffer of length MAX_ENTRIES, newest-first.
 *   On each new entry: [entry, ...prev].slice(0, MAX_ENTRIES).
 *   Oldest entries are automatically displaced — no explicit deletion needed.
 *   getLogHistory() seeds the buffer on mount from logbus's own 60-entry
 *   ring, so the panel is populated immediately even in dev after HMR.
 *
 * AGE DISPLAY REFRESH
 *   "X ago" timestamps are re-computed from entry.timestamp every 30s via a
 *   setInterval that increments ageKey state. This triggers a full re-render
 *   of SystemLog — cheap because MAX_ENTRIES is 6 and LogRow is tiny.
 *
 *   A previous design used a per-entry ageKey ref to avoid re-rendering all
 *   rows on every tick, but since any new log entry already causes a full
 *   re-render the optimization was moot. ageKey on the parent is sufficient.
 *
 * SIDE EFFECTS
 *   logSubscribe on mount (unsubscribes on unmount).
 *   setInterval for age refresh (cleared on unmount).
 */

import { useEffect, useReducer, useState } from 'react'
import { logSubscribe, getLogHistory } from '@/lib/logbus'
import type { LogEntry, LogEntryType } from '@/lib/logbus'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** Maximum entries kept in the ring buffer and rendered simultaneously. */
const MAX_ENTRIES = 6

/** How often the "X ago" timestamps are recalculated, in milliseconds. */
const AGE_REFRESH_INTERVAL_MS = 30_000

// ─── TYPE → COLOR MAP ────────────────────────────────────────────────────────

/**
 * Color per log entry type.
 * 'alive' and 'sync' entries are intentionally near-invisible — they fire
 * constantly as keepalives and would drown out meaningful signal if bright.
 */
const TYPE_COLOR: Record<LogEntryType, string> = {
  agent:  'oklch(0.49 0.28 281)',   // purple   — agent state change
  signal: 'oklch(0.80 0.14 200)',   // cyan     — signal pulse event
  swarm:  'oklch(0.87 0.21 192)',   // bright cyan — drone swarm (TOWER sovereign H=192)
  sync:   'oklch(0.23 0.01 345)',   // near-invisible — heartbeat noise
  voice:  'oklch(0.60 0.22 350)',   // pink     — map voice AI observation
  ops:    'oklch(0.75 0.20 65)',    // amber    — operator presence (FORGE sovereign H=65)
  access: 'oklch(0.37 0.31 283)',   // purple   — territory navigation (HOUSE H=283)
  alive:  'oklch(0.14 0.01 320)',   // nearly invisible — keepalive
  system: 'oklch(0.37 0.02 45)',    // muted    — general system event
}

/** Type dot glow at 40% alpha — matches former ${color}66 hex-alpha pattern. */
const TYPE_GLOW: Record<LogEntryType, string> = {
  agent:  'oklch(0.49 0.28 281 / 0.40)',
  signal: 'oklch(0.80 0.14 200 / 0.40)',
  swarm:  'oklch(0.87 0.21 192 / 0.40)',
  sync:   'oklch(0.23 0.01 345 / 0.40)',
  voice:  'oklch(0.60 0.22 350 / 0.40)',
  ops:    'oklch(0.75 0.20 65 / 0.40)',
  access: 'oklch(0.37 0.31 283 / 0.40)',
  alive:  'oklch(0.14 0.01 320 / 0.40)',
  system: 'oklch(0.37 0.02 45 / 0.40)',
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Formats a Unix ms timestamp as a human-readable relative time string.
 * Resolution steps at 5s, 1m, 1h — precise enough for a debug log panel.
 */
function timeAgo(timestamp: number): string {
  const delta = Math.floor((Date.now() - timestamp) / 1000)
  if (delta < 5)    return 'just now'
  if (delta < 60)   return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  return `${Math.floor(delta / 3600)}h ago`
}

// ─── LOG ROW ─────────────────────────────────────────────────────────────────

/** Props for a single rendered log row. */
interface LogRowProps {
  /** The log entry to render. */
  entry: LogEntry
  /**
   * Position in the newest-first array (0 = newest).
   * Used to compute opacity falloff — older rows fade toward invisible,
   * drawing the eye to recent activity without hiding history entirely.
   */
  index: number
}

function LogRow({ entry, index }: LogRowProps): React.ReactElement {
  const isAlive = entry.type === 'alive'
  const color   = TYPE_COLOR[entry.type]
  const glow    = TYPE_GLOW[entry.type]

  // 'alive' entries use a fixed low opacity rather than the gradient — they
  // represent keepalive noise that should barely register visually.
  // Other entries fade 1.0 → 0.2 across MAX_ENTRIES positions.
  const opacity = isAlive ? 0.28 : Math.max(0.2, 1 - index * 0.13)

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'baseline',
        gap:        6,
        opacity,
        transition: 'opacity 0.6s ease',
        // Only the newest entry (index 0) gets the slide-in animation.
        // Existing entries just shift down via the parent flex column gap.
        animation:  index === 0 ? 'log-entry-in 0.35s ease-out both' : 'none',
        padding:    '2px 0',
      }}
    >
      {/* Type dot — colored indicator; no glow for invisible 'alive' entries */}
      <div style={{
        width:        5,
        height:       5,
        borderRadius: '50%',
        flexShrink:   0,
        background:   color,
        boxShadow:    isAlive ? 'none' : `0 0 4px ${glow}`,
        marginTop:    1,
      }} />

      {/* Entry text — truncated to prevent layout overflow */}
      <span style={{
        color,
        fontSize:      9,
        letterSpacing: '0.1em',
        fontFamily:    'var(--font-code)',
        flex:          1,
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
      }}>
        {entry.text}
      </span>

      {/* Age — recalculated whenever the parent's ageKey increments */}
      <span style={{
        color:         'oklch(0.21 0.02 281)',
        fontSize:      8,
        letterSpacing: '0.08em',
        fontFamily:    'var(--font-code)',
        flexShrink:    0,
        fontStyle:     'italic',
      }}>
        {timeAgo(entry.timestamp)}
      </span>
    </div>
  )
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function SystemLog(): React.ReactElement {
  // Seed from logbus history on mount so the panel isn't blank on first render.
  // getLogHistory() returns newest-last; we reverse then slice to get newest-first.
  const [entries, setEntries] = useState<LogEntry[]>(() =>
    [...getLogHistory()].reverse().slice(0, MAX_ENTRIES)
  )

  // triggerAgeRefresh fires every 30s so LogRow instances re-call timeAgo() and
  // display fresh relative timestamps. useReducer avoids a named-but-unused state
  // variable — the dispatch function IS the side effect; the value is irrelevant.
  const [, triggerAgeRefresh] = useReducer((n: number) => n + 1, 0)

  // Subscribe to the logbus — prepend new entries, trim to ring buffer size.
  useEffect(() => {
    const unsub = logSubscribe((entry) => {
      setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES))
    })
    return unsub
  }, [])

  // Age-refresh timer — fires every 30s to force timeAgo recalculation.
  useEffect(() => {
    const id = setInterval(triggerAgeRefresh, AGE_REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <style href="system-log-anim" precedence="default">{`
        @keyframes log-entry-in {
          0%   { opacity: 0; transform: translateY(-6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          position:      'absolute',
          bottom:        24,
          left:          16,
          zIndex:        20,
          display:       'flex',
          flexDirection: 'column',
          gap:           3,
          width:         280,
          pointerEvents: 'none',
          userSelect:    'none',
        }}
      >
        {/* Header label */}
        <div style={{
          fontSize:      7,
          letterSpacing: '0.25em',
          color:         'oklch(0.19 0.02 281)',
          fontFamily:    'var(--font-code)',
          marginBottom:  4,
          paddingBottom: 4,
          borderBottom:  '1px solid oklch(0.15 0.01 281)',
        }}>
          SYS LOG ·· KINGDOM
        </div>

        {/* entries[0] = newest → full opacity + slide-in animation. entries[n-1] = oldest → faded. */}
        {entries.map((entry, i) => (
          <LogRow
            key={entry.id}
            entry={entry}
            index={i}
          />
        ))}
      </div>
    </>
  )
}
