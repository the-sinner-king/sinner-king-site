'use client'

/**
 * TokenBurnHUD.tsx
 *
 * Fixed-position DOM overlay showing the live AI token burn rate.
 * Positioned bottom-left, immediately below SystemLog.
 *
 * DATA SOURCE
 *   useKingdomStore(s => s.tokenPulse) — Zustand store field hydrated by
 *   kingdom-store's usePartyKitSync hook from the SCRYER feed.
 *   tokenPulse.rate_per_sec is the current tokens-per-second rate.
 *
 * SPARKLINE RING BUFFER
 *   sparkHistory is an array of up to MAX_HISTORY rate samples, oldest-first.
 *   A sample is pushed every SPARKLINE_SAMPLE_INTERVAL_MS.
 *   slice(-MAX_HISTORY) enforces the ring — the oldest sample is displaced
 *   when the buffer is full. Block characters map each sample proportionally
 *   to the current max value in the window, not a fixed scale — so the
 *   sparkline always uses its full vertical range regardless of absolute rate.
 *
 * WHY SEED ON MOUNT (not wait for first interval)
 *   Without seeding, sparkHistory is empty for the first SPARKLINE_SAMPLE_INTERVAL_MS
 *   (30 seconds). The sparkline div is hidden while sparkHistory is all whitespace,
 *   so the HUD looks broken for 30s on load. Seeding with the current rate on mount
 *   gives the sparkline a starting point immediately — the first bar appears at once.
 *
 * WHY rateRef (not rawRate directly in the interval)
 *   The setInterval callback closes over the scope at creation time. If it read
 *   rawRate (a computed const from the render) directly, it would always capture
 *   the rate at mount time — never updating. rateRef.current is mutated every render,
 *   so the interval always reads the freshest value without needing to be recreated.
 *
 * SIDE EFFECTS
 *   One setInterval for sparkline sampling (cleared on unmount).
 */

import { useEffect, useRef, useState } from 'react'
import { useKingdomStore } from '@/lib/kingdom-store'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** Block character levels: index 0 = silence/space, index 8 = full block. */
const SPARKLINE_CHARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

/** Number of samples kept in the sparkline ring buffer. */
const MAX_HISTORY = 8

/** How often a new rate sample is pushed to the sparkline buffer, in milliseconds. */
const SPARKLINE_SAMPLE_INTERVAL_MS = 30_000

/** Tokens/sec thresholds for zone classification. */
const ZONE_QUIET_MAX  = 500
const ZONE_ACTIVE_MAX = 2_000
const ZONE_HIGH_MAX   = 5_000

// ─── ZONE HELPERS ─────────────────────────────────────────────────────────────

/** Classifies a token rate into a named activity zone. */
function getZone(n: number): 'QUIET' | 'ACTIVE' | 'HIGH' | 'SURGE' {
  if (n < ZONE_QUIET_MAX)  return 'QUIET'
  if (n < ZONE_ACTIVE_MAX) return 'ACTIVE'
  if (n < ZONE_HIGH_MAX)   return 'HIGH'
  return 'SURGE'
}

/** Zone → indicator color. Escalates from near-invisible to alarm pink. */
const ZONE_COLOR: Record<ReturnType<typeof getZone>, string> = {
  QUIET:  '#2a2a3a',
  ACTIVE: '#7000ff',
  HIGH:   '#f0a500',
  SURGE:  '#ff3d7f',
}

// ─── RATE FORMATTER ───────────────────────────────────────────────────────────

/** Formats a tokens/sec rate for compact display (e.g. "1.2K t/s"). */
function formatRate(n: number): string {
  if (n < 1_000)     return `${n} t/s`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K t/s`
  return `${(n / 1_000_000).toFixed(2)}M t/s`
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function TokenBurnHUD(): React.ReactElement {
  const tokenPulse = useKingdomStore((s) => s.tokenPulse)

  // rateRef mirrors the current rate into the interval closure so the interval
  // always samples the latest value without needing to be recreated on every render.
  const rateRef = useRef<number>(tokenPulse?.rate_per_sec ?? 0)
  const [sparkHistory, setSparkHistory] = useState<number[]>([])

  // Keep ref in sync with latest rendered rate.
  rateRef.current = tokenPulse?.rate_per_sec ?? 0

  useEffect(() => {
    // Seed immediately so the sparkline shows something on first render rather
    // than staying hidden for the full 30s before the first interval fires.
    setSparkHistory([rateRef.current])

    const id = setInterval(() => {
      // rateRef.current is always current — safe to read from inside the closure.
      setSparkHistory((prev) => [...prev, rateRef.current].slice(-MAX_HISTORY))
    }, SPARKLINE_SAMPLE_INTERVAL_MS)

    return () => clearInterval(id)
  }, [])

  // Guard against NaN or negative values from malformed SCRYER payloads.
  const rawRate = tokenPulse?.rate_per_sec ?? 0
  const rate = Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : 0

  const zone      = getZone(rate)
  const zoneColor = ZONE_COLOR[zone]

  // Scale each sample proportionally to the window's max value.
  // Math.max(...history, 1) prevents division-by-zero when all samples are 0.
  const maxVal = Math.max(...sparkHistory, 1)
  const sparkline = sparkHistory
    .map((v) => {
      const idx = Math.round((v / maxVal) * (SPARKLINE_CHARS.length - 1))
      return SPARKLINE_CHARS[Math.min(SPARKLINE_CHARS.length - 1, Math.max(0, idx))]
    })
    .join('')

  return (
    <div
      style={{
        position:      'absolute',
        bottom:        110,
        left:          16,
        zIndex:        20,
        pointerEvents: 'none',
        userSelect:    'none',
        fontFamily:    '"JetBrains Mono", "Courier New", monospace',
      }}
    >
      {/* Section header — matches SystemLog visual language */}
      <div style={{
        fontSize:      7,
        letterSpacing: '0.25em',
        color:         '#2a2228',
        marginBottom:  4,
        paddingBottom: 4,
        borderBottom:  '1px solid #1e1c1f',
      }}>
        TOKEN BURN ·· LIVE
      </div>

      {/* Rate + zone badge on one line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize:      10,
          letterSpacing: '0.08em',
          color:         zoneColor,
        }}>
          {formatRate(rate)}
        </span>

        <span style={{
          fontSize:      7,
          letterSpacing: '0.18em',
          color:         zoneColor,
          opacity:       0.75,
          border:        `1px solid ${zoneColor}44`,
          padding:       '1px 4px',
          borderRadius:  2,
        }}>
          {zone}
        </span>
      </div>

      {/* Sparkline — only shown when there's at least one non-space character */}
      {sparkline.trim().length > 0 && (
        <div style={{
          fontSize:      11,
          color:         '#504850',
          marginTop:     3,
          letterSpacing: '0.05em',
          lineHeight:    1,
        }}>
          {sparkline}
        </div>
      )}

      {/* Optional broadcast label from SCRYER (e.g. active project name) */}
      {tokenPulse?.broadcast_label && (
        <div style={{
          fontSize:      7,
          color:         '#302830',
          marginTop:     3,
          letterSpacing: '0.1em',
        }}>
          {tokenPulse.broadcast_label}
        </div>
      )}
    </div>
  )
}
