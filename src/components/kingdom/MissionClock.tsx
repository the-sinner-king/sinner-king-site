'use client'

/**
 * MissionClock.tsx — Kingdom Map system clock
 *
 * Top-right corner overlay. Updates every second.
 * Format: HH:MM:SS  D{n}  where D{n} = days since Kingdom epoch (2025-09-11).
 *
 * Technical aesthetic: monospace tabular, dim at rest, flashes on minute boundary.
 * SSR-safe: empty initial state, populated in useEffect.
 */

import { useEffect, useRef, useState } from 'react'

// Kingdom epoch — first session, first day.
const KINGDOM_EPOCH = new Date('2025-09-11T00:00:00Z').getTime()

function getDayCounter(): number {
  return Math.floor((Date.now() - KINGDOM_EPOCH) / 86_400_000)
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function MissionClock() {
  const [timeStr, setTimeStr] = useState('')  // empty = SSR safe
  const [dayNum, setDayNum]   = useState(0)
  const [flash, setFlash]     = useState(false)
  const lastMinuteRef         = useRef(-1)

  useEffect(() => {
    function update() {
      const now = new Date()
      setTimeStr(formatTime(now))
      setDayNum(getDayCounter())

      // Flash on new minute
      if (now.getMinutes() !== lastMinuteRef.current) {
        lastMinuteRef.current = now.getMinutes()
        if (lastMinuteRef.current !== -1) {
          setFlash(true)
          setTimeout(() => setFlash(false), 400)
        }
      }
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  if (!timeStr) return null  // suppress until hydrated

  return (
    <>
      <style href="mission-clock-anim" precedence="default">{`
        @keyframes mc-flash {
          0%   { color: #e8e0d0; text-shadow: 0 0 8px #7000ff88; }
          100% { color: #605850; text-shadow: none; }
        }
        @keyframes mc-scanline {
          0%   { transform: translateY(-100%); opacity: 0.06; }
          100% { transform: translateY(100%);  opacity: 0; }
        }
      `}</style>
      <div
        style={{
          position:       'absolute',
          top:            16,
          right:          16,
          zIndex:         21,
          fontFamily:     '"JetBrains Mono", "Courier New", monospace',
          fontVariantNumeric: 'tabular-nums',
          pointerEvents:  'none',
          userSelect:     'none',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'flex-end',
          gap:            2,
          overflow:       'hidden',
        }}
      >
        {/* Scanline sweep — barely visible, suggests CRT */}
        <div style={{
          position:   'absolute',
          inset:      0,
          background: 'linear-gradient(to bottom, transparent 40%, #7000ff08 50%, transparent 60%)',
          animation:  'mc-scanline 4s linear infinite',
          pointerEvents: 'none',
        }} />

        {/* Time */}
        <div style={{
          fontSize:      13,
          letterSpacing: '0.14em',
          color:         flash ? '#e8e0d0' : '#605850',
          animation:     flash ? 'mc-flash 0.4s ease-out forwards' : 'none',
          textShadow:    flash ? '0 0 8px #7000ff88' : '0 0 6px #7000ff22',
          transition:    'color 0.4s ease',
          position:      'relative',
        }}>
          {timeStr}
        </div>

        {/* Day counter */}
        <div style={{
          fontSize:      9,
          letterSpacing: '0.22em',
          color:         '#3a3030',
          textShadow:    '0 0 4px #7000ff18',
          position:      'relative',
        }}>
          D{dayNum} &nbsp;·&nbsp; KINGDOM
        </div>
      </div>
    </>
  )
}
