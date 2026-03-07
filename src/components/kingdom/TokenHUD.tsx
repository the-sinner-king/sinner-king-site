'use client'

/**
 * TokenHUD.tsx
 *
 * Live token consumption overlay — positioned top-right over the Kingdom Map.
 * Data from KingdomLiveProvider (useKingdomLive) — no independent fetch.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │ TOKEN FEED                   │
 *   │──────────────────────────────│
 *   │ TODAY      21.3M             │
 *   │ WEEK       2.6B              │
 *   │ CHRONICLE  5.1B              │
 *   │ RATE       ⚡ HIGH            │
 *   │──────────────────────────────│
 *   │ ◉ FLOW  homecoming  #FFB347  │
 *   └──────────────────────────────┘
 *
 * Border pulsing at high intensity. Stale treatment: opacity 0.5 + STALE badge.
 */

import { useKingdomLive, StaleWrapper } from '@/lib/kingdom-live-context'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// ---------------------------------------------------------------------------
// Intensity → border style
// ---------------------------------------------------------------------------
// REGRESSION GUARD: Never mix border (shorthand) + borderLeft (longhand) on the same element.
// React 19 DOM reconciliation fires a console error on every re-render when both are set.
// These values are applied to borderTop/borderRight/borderBottom only.
// borderLeft is always the structural accent (ACCENT color, 2px solid) — set separately.
// ---------------------------------------------------------------------------

const INTENSITY_BORDER: Record<string, string> = {
  quiet:  '1px solid rgba(112,0,255, 0.18)',
  low:    '1px solid rgba(112,0,255, 0.35)',
  medium: '2px solid rgba(112,0,255, 0.60)',
  high:   '2px dashed rgba(112,0,255, 1)',
}

const INTENSITY_SHADOW: Record<string, string> = {
  quiet:  'none',
  low:    'none',
  medium: '0 0 8px rgba(112,0,255,0.4)',
  high:   '0 0 12px rgba(112,0,255,0.8)',
}

// ---------------------------------------------------------------------------
// Rate row — intensity with character icon, no numbers
// ---------------------------------------------------------------------------

const RATE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  quiet:  { icon: '◇', label: 'QUIET',  color: '#3a3438' },
  low:    { icon: '→', label: 'LOW',    color: '#7000ff66' },
  medium: { icon: '↑', label: 'MED',    color: '#7000ffcc' },
  high:   { icon: '⚡', label: 'HIGH',   color: '#f0a500' },
}

function RateRow({ intensity }: { intensity: string }) {
  const cfg = RATE_CONFIG[intensity] ?? RATE_CONFIG.quiet
  return (
    <div style={{
      display:      'flex',
      alignItems:   'baseline',
      gap:          8,
      marginBottom: 4,
    }}>
      <span style={{
        color:         '#504840',
        fontSize:      10,
        letterSpacing: '0.14em',
        minWidth:      62,
      }}>
        RATE
      </span>
      <span style={{
        color:         cfg.color,
        fontSize:      12,
        letterSpacing: '0.08em',
      }}>
        {cfg.icon} {cfg.label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ACCENT = '#7000ff'

export function TokenHUD() {
  const { data, status } = useKingdomLive()

  if (status === 'loading' || status === 'error' || !data) return null

  const tokens    = data.tokens
  const intensity = tokens.intensity

  return (
    <>
      <style href="token-hud-anim" precedence="default">{`
        @keyframes token-hud-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes token-border-pulse {
          0%   { border-color: rgba(112,0,255,0.6); box-shadow: 0 0 8px rgba(112,0,255,0.4); }
          50%  { border-color: rgba(112,0,255,1.0); box-shadow: 0 0 16px rgba(112,0,255,0.9); }
          100% { border-color: rgba(112,0,255,0.6); box-shadow: 0 0 8px rgba(112,0,255,0.4); }
        }
      `}</style>

      <StaleWrapper status={status}>
        <div style={{
          minWidth:  210,
          fontFamily: 'monospace',
          animation: 'token-hud-in 0.4s ease-out',
        }}>
          <div style={{
            background:    'rgba(10, 10, 15, 0.88)',
            // Expand shorthand to avoid React 19 border/borderLeft conflict warning.
            // Top/right/bottom = intensity-driven. Left = always accent — structural rule.
            borderTop:     INTENSITY_BORDER[intensity] ?? INTENSITY_BORDER.quiet,
            borderRight:   INTENSITY_BORDER[intensity] ?? INTENSITY_BORDER.quiet,
            borderBottom:  INTENSITY_BORDER[intensity] ?? INTENSITY_BORDER.quiet,
            borderLeft:    `2px solid ${ACCENT}`,
            borderRadius:  2,
            padding:       '8px 12px 9px',
            backdropFilter: 'blur(6px)',
            boxShadow:     INTENSITY_SHADOW[intensity] ?? 'none',
            animation:     intensity === 'high' ? 'token-border-pulse 0.8s ease-in-out infinite' : 'none',
          }}>

            {/* Header */}
            <div style={{
              color:         '#504840',
              fontSize:      10,
              letterSpacing: '0.18em',
              paddingBottom: 6,
              borderBottom:  '1px solid rgba(255,255,255,0.06)',
              marginBottom:  7,
            }}>
              TOKEN FEED
            </div>

            {/* Today row */}
            <Row label="TODAY"     value={fmtTokens(tokens.today.tokens)}                              color={ACCENT} />

            {/* Week row */}
            <Row label="WEEK"      value={fmtTokens(tokens.week.tokens)}                               color={ACCENT} dim />

            {/* Chronicle row — all-time lifetime estimate */}
            <Row label="CHRONICLE" value={tokens.lifetime > 0 ? fmtTokens(tokens.lifetime) : '—'}     color={ACCENT} dim />

            {/* Rate row */}
            <RateRow intensity={intensity} />

          </div>
        </div>
      </StaleWrapper>
    </>
  )
}

// ---------------------------------------------------------------------------
// Row helper
// ---------------------------------------------------------------------------

function Row({
  label, value, color, dim = false,
}: {
  label: string
  value: string
  color: string
  dim?:  boolean
}) {
  const alpha = dim ? '66' : 'cc'
  return (
    <div style={{
      display:      'flex',
      alignItems:   'baseline',
      gap:          8,
      marginBottom: 4,
    }}>
      <span style={{
        color:         '#504840',
        fontSize:      10,
        letterSpacing: '0.14em',
        minWidth:      62,
      }}>
        {label}
      </span>
      <span style={{
        color:              `${color}${alpha}`,
        fontSize:           13,
        letterSpacing:      '0.06em',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  )
}
