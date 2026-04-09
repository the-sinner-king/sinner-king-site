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
 *
 * Singleton pattern: listeners register on first mount, deregister on last unmount.
 * Prevents listener stacking + premature removal when component remounts.
 */

import { useEffect, useRef, useState } from 'react'

const AWAY_THRESHOLD_MS = 30 * 60 * 1_000  // 30 min
const CHECK_INTERVAL_MS = 60_000            // re-evaluate every 1 min

// Module-level — survives re-renders, shared across all instances
let _lastActivityMs = Date.now()
let _mountCount = 0

function _recordActivity() {
  _lastActivityMs = Date.now()
}

function _addListeners() {
  window.addEventListener('mousemove',  _recordActivity, { passive: true })
  window.addEventListener('keydown',    _recordActivity, { passive: true })
  window.addEventListener('click',      _recordActivity, { passive: true })
  window.addEventListener('touchstart', _recordActivity, { passive: true })
}

function _removeListeners() {
  window.removeEventListener('mousemove',  _recordActivity)
  window.removeEventListener('keydown',    _recordActivity)
  window.removeEventListener('click',      _recordActivity)
  window.removeEventListener('touchstart', _recordActivity)
}

export function useBrandonPresenceDetector(): boolean {
  const [present, setPresent] = useState(true)  // optimistic default
  const prevPresentRef = useRef(true)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Ref-count: only register listeners on first mount
    _mountCount++
    if (_mountCount === 1) {
      _recordActivity()  // mark activity at mount time
      _addListeners()
    }

    intervalRef.current = setInterval(() => {
      const idle      = Date.now() - _lastActivityMs
      const isPresent = idle <= AWAY_THRESHOLD_MS

      if (isPresent !== prevPresentRef.current) {
        prevPresentRef.current = isPresent
        setPresent(isPresent)
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      // Ref-count: only remove listeners on last unmount
      _mountCount--
      if (_mountCount === 0) {
        _removeListeners()
      }
    }
  }, [])

  return present
}
