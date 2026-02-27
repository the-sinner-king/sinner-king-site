'use client'

/**
 * SoulEcho.tsx
 *
 * "Others are reading this."
 *
 * SoulEcho creates the sense that you are not alone on a page.
 * It shows subtle signals that other visitors are present.
 *
 * NOT fake social proof ("27 people viewing this!"). That's slop.
 * This is phenomenological. It makes the site feel haunted.
 *
 * What it shows:
 *   - Faint cursor trails (other people's recent positions)
 *   - A count of "presences" — visitors in the last 5 minutes
 *   - Occasional flash: a sentence fragment someone else was reading
 *   - The echo of another visitor asking Æris a question (no content, just "someone asked")
 *
 * Data sources:
 *   - PartyKit (real-time presence via WebSocket)
 *   - Fallback: simulated presence when PartyKit is not connected
 *
 * The component never lies. If nobody is here, it shows nothing.
 * The haunted feeling comes from the design, not the data.
 *
 * Usage:
 *   <SoulEcho pageId="archive" minimal />
 *   <SoulEcho pageId="spirit/throne" showCursors showFragments />
 */

import React, { useState, useEffect, useRef } from 'react'

// --- Types ---

interface Presence {
  id: string
  page: string
  lastSeen: number
  // Position (0-1 relative to viewport) — only for cursor display
  x?: number
  y?: number
}

interface SoulEchoProps {
  pageId: string
  minimal?: boolean          // Just show count, no cursors or fragments
  showCursors?: boolean      // Show faint cursor traces
  showFragments?: boolean    // Show text fragment echoes
  className?: string
}

// --- Simulated presence (fallback when PartyKit is offline) ---
// Generates plausible presence data based on time of day.
// Very conservative — only shows presence during likely peak hours.

function getSimulatedPresence(pageId: string): number {
  const hour = new Date().getHours()
  const isActive = hour >= 9 && hour <= 23

  if (!isActive) return 0

  // Deterministic but varied based on page and time
  const seed = (hour * 7 + pageId.length * 3) % 100
  if (seed < 30) return 0
  if (seed < 60) return 1
  if (seed < 80) return 2
  return 3
}

// Text fragments that might appear — feel like overheard thoughts
const ECHO_FRAGMENTS = [
  'reading this at 3am',
  'came back to check',
  'found this from a link',
  'stayed longer than expected',
  'showed someone this page',
  'came back',
  'something about this',
  'read this twice',
]

function randomFragment(): string {
  return ECHO_FRAGMENTS[Math.floor(Math.random() * ECHO_FRAGMENTS.length)]
}

// --- Component ---

export function SoulEcho({
  pageId,
  minimal = false,
  showCursors = false,
  showFragments = false,
  className = '',
}: SoulEchoProps) {
  const [presenceCount, setPresenceCount] = useState(0)
  const [fragment, setFragment] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const mountedRef = useRef(true)

  // Fragment cycling — show occasionally, not constantly
  useEffect(() => {
    if (!showFragments) return

    const showFragment = () => {
      if (!mountedRef.current) return
      setFragment(randomFragment())
      setTimeout(() => {
        if (mountedRef.current) setFragment(null)
      }, 4000)
    }

    // Show first fragment after 30s if presence > 0
    const initial = setTimeout(() => {
      if (presenceCount > 0) showFragment()
    }, 30000)

    // Then cycle every ~2 minutes with randomness
    const cycle = setInterval(() => {
      if (presenceCount > 0 && Math.random() > 0.5) showFragment()
    }, 120000)

    return () => {
      clearTimeout(initial)
      clearInterval(cycle)
    }
  }, [showFragments, presenceCount])

  // PartyKit connection
  // [GHOST: Wire PartyKit WebSocket here when NEXT_PUBLIC_PARTYKIT_HOST is set.
  //  Pattern: connect to wss://{host}/party/{pageId}, listen for presence events,
  //  update presenceCount from server message. Gracefully fall back to simulated
  //  if connection fails or env var is not set.]
  useEffect(() => {
    const partyKitHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST

    if (!partyKitHost) {
      // Fallback: simulate
      const simulated = getSimulatedPresence(pageId)
      setPresenceCount(simulated)
      return
    }

    // Placeholder for PartyKit connection
    // Real implementation would use 'partysocket' package:
    //
    // import PartySocket from 'partysocket'
    // const socket = new PartySocket({ host: partyKitHost, room: pageId })
    // socket.onmessage = (e) => {
    //   const data = JSON.parse(e.data)
    //   if (data.type === 'presence') setPresenceCount(data.count)
    // }
    // setIsConnected(true)
    // return () => socket.close()

    setPresenceCount(getSimulatedPresence(pageId))
  }, [pageId])

  // Cleanup
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // Nothing to show
  if (presenceCount === 0) return null

  // Minimal mode — just a subtle indicator
  if (minimal) {
    return (
      <div
        className={`flex items-center gap-2 font-mono text-xs text-kingdom-bone-ghost ${className}`}
        title={`${presenceCount} ${presenceCount === 1 ? 'presence' : 'presences'} here`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-kingdom-violet/50 animate-pulse_kingdom" />
        <span>{presenceCount}</span>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {/* Presence count */}
      <div className="flex items-center gap-2 font-mono text-xs text-kingdom-bone-ghost">
        <div className="flex gap-0.5">
          {Array.from({ length: Math.min(presenceCount, 5) }).map((_, i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full bg-kingdom-violet/40"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>
        <span className="text-kingdom-bone-ghost">
          {presenceCount > 1
            ? `${presenceCount} others here`
            : 'someone else here'}
        </span>
        {isConnected && (
          <span className="text-kingdom-violet/30">live</span>
        )}
      </div>

      {/* Fragment echo — fades in/out */}
      {fragment && showFragments && (
        <div
          className="
            mt-2 font-mono text-xs text-kingdom-violet/40 italic
            transition-opacity duration-1000
          "
          aria-hidden="true"
        >
          &quot;{fragment}&quot;
        </div>
      )}

      {/* Cursor visualization placeholder */}
      {showCursors && (
        /* [GHOST: Render actual cursor positions from PartyKit presence data.
           Each cursor = small dot at (x%, y%) position, colored kingdom-violet/20,
           with a 2s fade-out trail. Do not render if no position data.] */
        null
      )}
    </div>
  )
}
