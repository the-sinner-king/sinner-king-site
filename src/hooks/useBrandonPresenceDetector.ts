'use client'

/**
 * useBrandonPresenceDetector — browser-side presence signal
 *
 * Tracks mouse, keyboard, click, touch events.
 * Module-level ref (lastActivityMs) accumulates events WITHOUT re-renders.
 * React state updates once per minute (60s interval) — minimal overhead.
 *
 * AWAY threshold: 30 minutes (1,800,000ms).
 * "AWAY" means idle at computer, not absent from site — safe to show all visitors.
 *
 * Caller ORs this with store.brandonPresent for effectiveBrandonPresent.
 */

import { useEffect, useRef, useState } from 'react'

const AWAY_THRESHOLD_MS  = 30 * 60 * 1_000  // 30 min
const CHECK_INTERVAL_MS  = 60_000             // re-evaluate every 1 min

// Module-level — survives re-renders, no setState on every mousemove
let _lastActivityMs = Date.now()

function _recordActivity() {
  _lastActivityMs = Date.now()
}

export function useBrandonPresenceDetector(): boolean {
  const [present, setPresent] = useState(true)  // optimistic default
  const prevPresentRef = useRef(true)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Register event listeners (passive = no scroll blocking)
    window.addEventListener('mousemove',  _recordActivity, { passive: true })
    window.addEventListener('keydown',    _recordActivity, { passive: true })
    window.addEventListener('click',      _recordActivity, { passive: true })
    window.addEventListener('touchstart', _recordActivity, { passive: true })

    // Initial check (in case page loaded stale)
    _recordActivity()

    intervalRef.current = setInterval(() => {
      const idle     = Date.now() - _lastActivityMs
      const isAway   = idle > AWAY_THRESHOLD_MS
      const isPresent = !isAway

      if (isPresent !== prevPresentRef.current) {
        prevPresentRef.current = isPresent
        setPresent(isPresent)
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      window.removeEventListener('mousemove',  _recordActivity)
      window.removeEventListener('keydown',    _recordActivity)
      window.removeEventListener('click',      _recordActivity)
      window.removeEventListener('touchstart', _recordActivity)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return present
}
