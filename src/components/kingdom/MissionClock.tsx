'use client'

/**
 * @file MissionClock.tsx
 *
 * @description
 * Kingdom Map system clock — positioned top-right of the canvas overlay.
 * Displays current local time (HH:MM:SS) and a day counter (D{n}) tracking
 * days elapsed since the Kingdom's founding session.
 * At each minute boundary the time display briefly flashes to highlight the tick.
 *
 * @dataSource
 * No external data — entirely local time via `new Date()` in a 1s interval.
 *
 * @lifecycle
 * - Initial state is empty string / 0, so nothing renders during SSR.
 * - `useEffect` populates both values immediately on mount (first `update()` call),
 *   then every 1000ms thereafter.
 * - On unmount: clears the interval AND any pending flash timer — both leak if
 *   the component unmounts while a flash is in progress.
 *
 * @ssrSafety
 * `timeStr` starts as '' and the component renders null until it's populated.
 * This prevents a hydration mismatch where the server renders a timestamp that
 * differs from the client's initial render.
 *
 * @gotcha wasInitialized PATTERN
 * `lastMinuteRef` starts at -1 (sentinel value, not a valid minute 0–59).
 * On the very first `update()` call (mount), `currentMinutes !== -1` is true,
 * so the branch is entered. But `wasInitialized` is false (ref was -1), so
 * `setFlash(true)` is skipped. Without this guard, the component would flash
 * on mount as if a minute just changed — a false positive on every page load.
 * The pattern: "enter the branch to record the minute, skip the flash action
 * if this is the initialization tick."
 *
 * @gotcha flashTimerRef CLEANUP
 * `flashTimerRef` stores the timeout ID for the un-flash delay (400ms after flash).
 * It must be cleared in two places:
 * 1. Inside the flash block — if the flash fires again before the timer resolves
 *    (impossible at 1s tick rate, but React Strict Mode double-fires effects),
 *    the old timer would call `setFlash(false)` after the new flash begins.
 * 2. In the effect cleanup return — if the component unmounts while a flash is
 *    in progress, the orphaned timeout would call setState on an unmounted component.
 * Both are checked with `!== null` before calling clearTimeout to avoid passing
 * undefined to clearTimeout (which is harmless but noisy in some environments).
 *
 * @gotcha LOCAL MIDNIGHT EPOCH
 * `KINGDOM_EPOCH` uses `new Date(2025, 8, 11)` (local midnight) rather than
 * `new Date('2025-09-11')` (UTC midnight = 8 PM ET the night before).
 * `getDayCounter()` also uses a local-midnight timestamp for "today" so both
 * sides of the subtraction are in the same timezone frame.
 * If either were UTC, the day counter would flip at 8 PM ET instead of midnight.
 */

import { useEffect, useRef, useState } from 'react'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/**
 * Kingdom founding epoch — first session, first day (2025-09-11).
 *
 * `new Date(year, month, day)` constructs local midnight in the browser's timezone.
 * Month is 0-indexed: 8 = September.
 *
 * Using local midnight (not UTC) ensures the day counter increments at local
 * midnight, matching `formatTime()` which uses local hours/minutes/seconds.
 * Using `new Date('2025-09-11')` (ISO string without time) parses as UTC midnight,
 * which in ET would make D1 begin at 8 PM on 2025-09-10 — wrong.
 */
const KINGDOM_EPOCH = new Date(2025, 8, 11).getTime()

/** How often the clock updates in milliseconds. */
const TICK_INTERVAL_MS = 1000

/** How long the minute-boundary flash lasts in milliseconds. */
const FLASH_DURATION_MS = 400

/** Sentinel value for lastMinuteRef before the first tick — no valid minute equals -1. */
const LAST_MINUTE_UNINIT = -1

/** Time display font size in px. */
const TIME_FONT_SIZE = 13

/** Day counter font size in px. */
const DAY_FONT_SIZE = 9

/** Time color at rest — warm dim gray, recedes from the 3D scene. */
const TIME_COLOR_IDLE  = 'oklch(0.42 0.02 45)'

/** Time color during flash — near-white, snaps attention to the minute change. */
const TIME_COLOR_FLASH = 'oklch(0.91 0.02 75)'

/** Text shadow while flashing — violet glow at 53% alpha. */
const TEXT_SHADOW_FLASH = '0 0 8px oklch(0.37 0.31 283 / 0.53)'

/** Subtle ambient glow at rest — barely visible violet bleed. */
const TEXT_SHADOW_IDLE  = '0 0 6px oklch(0.37 0.31 283 / 0.13)'

/** Day counter color — darker than the time, furthest back in the visual hierarchy. */
const DAY_COLOR = 'oklch(0.25 0.01 20)'

/** Day counter ambient glow — barely perceptible. */
const DAY_TEXT_SHADOW = '0 0 4px oklch(0.37 0.31 283 / 0.09)'

/** Scanline sweep gradient — very faint violet band suggesting CRT phosphor. */
const SCANLINE_GRADIENT = 'linear-gradient(to bottom, transparent 40%, oklch(0.37 0.31 283 / 0.03) 50%, transparent 60%)'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Returns the number of complete days since KINGDOM_EPOCH as of today's local midnight.
 *
 * Both timestamps are local-midnight values so the division is exact integers of
 * 86,400,000ms (24h). Using `Date.now()` directly would introduce sub-day variation
 * and the counter would drift by the time-of-day offset.
 */
function getDayCounter(): number {
  const now         = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.floor((todayMidnight - KINGDOM_EPOCH) / 86_400_000)
}

/**
 * Formats a Date as HH:MM:SS using local time fields.
 * `padStart(2, '0')` ensures single-digit values render as "07" not "7" —
 * required for `fontVariantNumeric: 'tabular-nums'` to prevent column jitter.
 */
function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

/**
 * MissionClock — Kingdom epoch clock with minute-boundary flash.
 *
 * SSR-safe: renders null until the first client-side tick populates `timeStr`.
 * Cleanup on unmount: clears both the 1s interval and any pending flash timer.
 */
export function MissionClock() {
  // Empty initial string → renders null on SSR, preventing hydration mismatch.
  const [timeStr, setTimeStr] = useState('')
  const [dayNum, setDayNum]   = useState(0)
  const [flash, setFlash]     = useState(false)

  // Stores the last observed minute value. Initialized to LAST_MINUTE_UNINIT (-1)
  // so the first tick can distinguish "just mounted" from "minute actually changed".
  const lastMinuteRef  = useRef(LAST_MINUTE_UNINIT)

  // Stores the timeout ID for the un-flash callback so it can be cancelled on
  // re-flash (Strict Mode double-fire) or on component unmount.
  const flashTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function update() {
      const now = new Date()
      setTimeStr(formatTime(now))
      setDayNum(getDayCounter())

      const currentMinutes = now.getMinutes()
      if (currentMinutes !== lastMinuteRef.current) {
        // `wasInitialized`: true if we've seen at least one tick before this one.
        // On mount (lastMinuteRef === LAST_MINUTE_UNINIT), we record the minute
        // but skip the flash — no minute has actually *changed* yet.
        const wasInitialized = lastMinuteRef.current !== LAST_MINUTE_UNINIT
        lastMinuteRef.current = currentMinutes

        if (wasInitialized) {
          setFlash(true)

          // Cancel any previous un-flash timer before starting a new one.
          // At 1s tick this overlap is extremely rare, but React Strict Mode
          // double-invokes effects in dev, which can fire two mount cycles and
          // leave a stale timer that calls setFlash(false) mid-flash.
          if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)

          flashTimerRef.current = setTimeout(() => {
            flashTimerRef.current = null
            setFlash(false)
          }, FLASH_DURATION_MS)
        }
      }
    }

    update()  // immediate first tick so the clock shows instantly on mount
    const id = setInterval(update, TICK_INTERVAL_MS)

    return () => {
      clearInterval(id)
      // Cancel the pending un-flash if the component unmounts mid-flash —
      // otherwise the orphaned timeout calls setState on an unmounted component.
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current)
        flashTimerRef.current = null
      }
    }
  }, [])

  // Suppress render until client-side hydration is complete.
  if (!timeStr) return null

  return (
    <>
      <style href="mission-clock-anim" precedence="default">{`
        @keyframes mc-flash {
          0%   { color: ${TIME_COLOR_FLASH}; text-shadow: ${TEXT_SHADOW_FLASH}; }
          100% { color: ${TIME_COLOR_IDLE};  text-shadow: none; }
        }
        @keyframes mc-scanline {
          0%   { transform: translateY(-100%); opacity: 0.06; }
          100% { transform: translateY(100%);  opacity: 0; }
        }
      `}</style>

      <div style={{
        position:           'absolute',
        top:                16,
        right:              16,
        zIndex:             21,
        fontFamily:         'var(--font-code)',
        // tabular-nums: prevents digit columns from shifting width as seconds increment.
        fontVariantNumeric: 'tabular-nums',
        pointerEvents:      'none',
        userSelect:         'none',
        display:            'flex',
        flexDirection:      'column',
        alignItems:         'flex-end',
        gap:                2,
        // overflow: 'hidden' clips the scanline sweep pseudo-element at the container edge.
        overflow:           'hidden',
      }}>
        {/* Scanline sweep — a barely-visible violet band traveling top→bottom.
            Suggests CRT phosphor persistence without distracting from the time readout. */}
        <div style={{
          position:      'absolute',
          inset:         0,
          background:    SCANLINE_GRADIENT,
          animation:     'mc-scanline 4s linear infinite',
          pointerEvents: 'none',
        }} />

        {/* Time display — flashes on minute boundary via mc-flash keyframe.
            `transition: color` provides a smooth fade-back when flash is cleared,
            while `animation: mc-flash forwards` handles the initial bright snap.
            Both are needed: animation for the snap, transition for the decay. */}
        <div style={{
          fontSize:      TIME_FONT_SIZE,
          letterSpacing: '0.14em',
          color:         flash ? TIME_COLOR_FLASH : TIME_COLOR_IDLE,
          animation:     flash ? `mc-flash ${FLASH_DURATION_MS}ms ease-out forwards` : 'none',
          textShadow:    flash ? TEXT_SHADOW_FLASH : TEXT_SHADOW_IDLE,
          transition:    'color 0.4s ease',
          position:      'relative',  // establishes stacking context above the scanline div
        }}>
          {timeStr}
        </div>

        {/* Day counter — D{n} · KINGDOM */}
        <div style={{
          fontSize:      DAY_FONT_SIZE,
          letterSpacing: '0.22em',
          color:         DAY_COLOR,
          textShadow:    DAY_TEXT_SHADOW,
          position:      'relative',
        }}>
          D{dayNum} &nbsp;·&nbsp; KINGDOM
        </div>
      </div>
    </>
  )
}
