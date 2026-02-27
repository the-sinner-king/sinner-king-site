'use client'

/**
 * SignalStream.tsx
 *
 * Live scrolling feed of Kingdom activity signals.
 *
 * Reads from /api/kingdom-state (which in turn reads signal_stream.json).
 * Polls every 3 seconds. New signals animate in from the top.
 * Old signals fade and scroll down.
 *
 * Signal types and their colors:
 *   claude    → cyan    (#00f3ff)
 *   aeris     → pink    (#ff006e)
 *   brandon   → amber   (#f0a500)
 *   system    → violet  (#7000ff)
 *   raven     → violet  (relay/comms)
 *   overmind  → violet  (pulse/monitoring)
 *   scryer    → cyan    (sensory system)
 *   unknown   → dim     (#504840)
 *
 * Each signal shows:
 *   - Timestamp (HH:MM:SS)
 *   - Type badge
 *   - Message
 *   - Territory (if provided) — subtle, right-aligned
 *
 * Usage:
 *   <SignalStream maxVisible={20} pollInterval={3000} />
 *   <SignalStream compact maxVisible={8} />
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { RecentSignal, SignalType } from '@/lib/kingdom-state'

// --- Config ---

const SIGNAL_COLORS: Record<SignalType, string> = {
  claude: 'text-kingdom-cyan',
  aeris: 'text-kingdom-pink',
  brandon: 'text-kingdom-amber',
  system: 'text-kingdom-violet',
  raven: 'text-kingdom-violet',
  overmind: 'text-kingdom-violet',
  scryer: 'text-kingdom-cyan',
  unknown: 'text-kingdom-bone-ghost',
}

const SIGNAL_DOT_COLORS: Record<SignalType, string> = {
  claude: 'bg-kingdom-cyan',
  aeris: 'bg-kingdom-pink',
  brandon: 'bg-kingdom-amber',
  system: 'bg-kingdom-violet',
  raven: 'bg-kingdom-violet',
  overmind: 'bg-kingdom-violet',
  scryer: 'bg-kingdom-cyan',
  unknown: 'bg-kingdom-bone-ghost',
}

// --- Types ---

interface SignalStreamProps {
  maxVisible?: number
  pollInterval?: number
  compact?: boolean
  className?: string
  initialSignals?: RecentSignal[]
  showHeader?: boolean
}

// --- Helpers ---

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function deduplicateSignals(signals: RecentSignal[]): RecentSignal[] {
  const seen = new Set<string>()
  return signals.filter((s) => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
}

// --- Signal row ---

interface SignalRowProps {
  signal: RecentSignal
  compact: boolean
  isNew: boolean
}

function SignalRow({ signal, compact, isNew }: SignalRowProps) {
  const dotClass = SIGNAL_DOT_COLORS[signal.type] ?? SIGNAL_DOT_COLORS.unknown
  const textClass = SIGNAL_COLORS[signal.type] ?? SIGNAL_COLORS.unknown

  return (
    <div
      className={`
        flex items-start gap-3 py-2 border-b border-kingdom-violet/10 last:border-0
        font-mono
        ${compact ? 'text-xs' : 'text-sm'}
        ${isNew ? 'animate-signal_flow bg-kingdom-void-light/50' : ''}
        transition-all duration-300
      `}
    >
      {/* Timestamp */}
      <span className="text-kingdom-violet/50 shrink-0 mt-0.5 tabular-nums">
        {formatTime(signal.timestamp)}
      </span>

      {/* Type indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className={`uppercase tracking-wider text-xs ${textClass}`}>
          {signal.type}
        </span>
      </div>

      {/* Message */}
      <span className="text-kingdom-bone-dim flex-1 min-w-0 truncate">
        {signal.message}
      </span>

      {/* Territory */}
      {!compact && signal.territory && (
        <span className="text-kingdom-bone-ghost shrink-0 text-xs">
          {signal.territory.replace(/_/g, '-').toUpperCase()}
        </span>
      )}
    </div>
  )
}

// --- Component ---

export function SignalStream({
  maxVisible = 20,
  pollInterval = 3000,
  compact = false,
  className = '',
  initialSignals = [],
  showHeader = true,
}: SignalStreamProps) {
  const [signals, setSignals] = useState<RecentSignal[]>(initialSignals)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [isLive, setIsLive] = useState(false)
  const lastSeenRef = useRef<string | null>(null)

  const pollSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/kingdom-state?type=stream', {
        cache: 'no-store',
      })
      if (!res.ok) return

      const data = await res.json()
      const incoming: RecentSignal[] = data?.stream?.signals ?? []

      if (incoming.length === 0) return

      setIsLive(true)

      // Find signals we haven't seen before
      const lastId = lastSeenRef.current
      const lastIdx = lastId ? incoming.findIndex((s) => s.id === lastId) : -1
      const freshSignals = lastIdx >= 0 ? incoming.slice(0, lastIdx) : incoming

      if (freshSignals.length > 0) {
        const freshIds = new Set(freshSignals.map((s) => s.id))
        setNewIds(freshIds)

        // Clear "new" status after animation
        setTimeout(() => setNewIds(new Set()), 1500)

        setSignals((prev) => {
          const combined = deduplicateSignals([...freshSignals, ...prev])
          return combined.slice(0, maxVisible)
        })

        lastSeenRef.current = incoming[0]?.id ?? null
      }
    } catch {
      // SCRYER offline — keep showing last known state
    }
  }, [maxVisible])

  useEffect(() => {
    pollSignals()
    const interval = setInterval(pollSignals, pollInterval)
    return () => clearInterval(interval)
  }, [pollSignals, pollInterval])

  const visibleSignals = signals.slice(0, maxVisible)

  return (
    <div className={`${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isLive ? (
              <div className="w-2 h-2 rounded-full bg-kingdom-cyan animate-pulse_kingdom" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-kingdom-bone-ghost" />
            )}
            <span className="section-label">SIGNAL STREAM</span>
          </div>
          <span className="font-mono text-xs text-kingdom-bone-ghost">
            {visibleSignals.length} / {maxVisible}
          </span>
        </div>
      )}

      {visibleSignals.length === 0 ? (
        <div className="font-mono text-sm text-kingdom-bone-ghost py-4 text-center">
          <span className="animate-cipher">[ waiting for signals... ]</span>
        </div>
      ) : (
        <div className="divide-y divide-kingdom-violet/10">
          {visibleSignals.map((signal) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              compact={compact}
              isNew={newIds.has(signal.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
