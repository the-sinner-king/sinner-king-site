'use client'

/**
 * SystemLog.tsx — Kingdom Map live system log
 *
 * Left-side vertical panel. Always visible. 6 entries max (newest at top).
 * Entries animate in from the top with a soft fade + slide.
 * Each entry shows an "X ago" timestamp that refreshes every 30s.
 *
 * Architecture: React state holds entries (max 6). On LogBus event,
 * prepend to array, trim to 6. No per-tick re-renders — only on new entries.
 *
 * Entry age display: kept alive by a 30s setInterval that increments a
 * "refresh key" — only affects the small timestamp spans, not full re-render.
 */

import { useEffect, useRef, useState } from 'react'
import { logSubscribe, getLogHistory } from '@/lib/logbus'
import type { LogEntry, LogEntryType } from '@/lib/logbus'

// ---------------------------------------------------------------------------
// Entry type → color
// ---------------------------------------------------------------------------

const TYPE_COLOR: Record<LogEntryType, string> = {
  agent:   '#a833ff',  // purple — agent state
  signal:  '#00d4ff',  // cyan — signal pulse
  swarm:   '#00f3ff',  // bright cyan — swarm
  sync:    '#3a3438',  // near-invisible — heartbeat
  voice:   '#ff3d7f',  // pink — map voice
  ops:     '#f0a500',  // amber — operator
  access:  '#7000ff',  // base purple — navigation
  alive:   '#2a2228',  // nearly invisible — keepalive
  system:  '#504840',  // muted — general
}

const MAX_ENTRIES = 6

// ---------------------------------------------------------------------------
// Relative time formatter
// ---------------------------------------------------------------------------

function timeAgo(timestamp: number): string {
  const delta = Math.floor((Date.now() - timestamp) / 1000)
  if (delta < 5)    return 'just now'
  if (delta < 60)   return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  return `${Math.floor(delta / 3600)}h ago`
}

// ---------------------------------------------------------------------------
// Single log row
// ---------------------------------------------------------------------------

interface LogRowProps {
  entry: LogEntry
  index: number
  ageKey: number  // bumped every 30s to refresh the "X ago" display
}

function LogRow({ entry, index, ageKey }: LogRowProps) {
  const isAlive = entry.type === 'alive'
  const color   = TYPE_COLOR[entry.type]
  // Oldest entries (higher index) fade toward invisible
  const opacity = isAlive ? 0.28 : Math.max(0.2, 1 - index * 0.13)

  // Suppress ageKey warning — it's only used to trigger re-render
  void ageKey

  return (
    <div
      style={{
        display:       'flex',
        alignItems:    'baseline',
        gap:           6,
        opacity,
        transition:    'opacity 0.6s ease',
        animation:     index === 0 ? 'log-entry-in 0.35s ease-out both' : 'none',
        padding:       '2px 0',
      }}
    >
      {/* Type dot */}
      <div style={{
        width:       5,
        height:      5,
        borderRadius: '50%',
        flexShrink:  0,
        background:  color,
        boxShadow:   isAlive ? 'none' : `0 0 4px ${color}66`,
        marginTop:   1,
      }} />

      {/* Text */}
      <span style={{
        color,
        fontSize:      9,
        letterSpacing: '0.1em',
        fontFamily:    '"JetBrains Mono", "Courier New", monospace',
        flex:          1,
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
      }}>
        {entry.text}
      </span>

      {/* Age */}
      <span style={{
        color:         '#2e2830',
        fontSize:      8,
        letterSpacing: '0.08em',
        fontFamily:    'monospace',
        flexShrink:    0,
        fontStyle:     'italic',
      }}>
        {timeAgo(entry.timestamp)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SystemLog() {
  const [entries, setEntries] = useState<LogEntry[]>(() =>
    [...getLogHistory()].reverse().slice(0, MAX_ENTRIES)
  )
  const [ageKey, setAgeKey] = useState(0)

  // Subscribe to new entries
  useEffect(() => {
    const unsub = logSubscribe((entry) => {
      setEntries(prev => [entry, ...prev].slice(0, MAX_ENTRIES))
    })
    return unsub
  }, [])

  // Refresh "X ago" timestamps every 30s
  useEffect(() => {
    const id = setInterval(() => setAgeKey(k => k + 1), 30_000)
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
          color:         '#2a2228',
          fontFamily:    'monospace',
          marginBottom:  4,
          paddingBottom: 4,
          borderBottom:  '1px solid #1e1c1f',
        }}>
          SYS LOG ·· KINGDOM
        </div>

        {/* entries = [newest, ..., oldest] — index 0 = newest = full opacity + animation */}
        {entries.map((entry, i) => (
          <LogRow
            key={entry.id}
            entry={entry}
            index={i}
            ageKey={ageKey}
          />
        ))}
      </div>
    </>
  )
}
