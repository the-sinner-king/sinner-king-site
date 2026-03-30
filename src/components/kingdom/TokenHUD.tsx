'use client'

/**
 * @file TokenHUD.tsx
 *
 * @description
 * Live token consumption overlay positioned top-right over the Kingdom Map.
 * Displays daily, weekly, and lifetime token estimates plus a qualitative burn rate.
 * At 'high' intensity the panel border animates with a CSS keyframe pulse.
 *
 * @dataSource
 * `useKingdomLive()` → `data.tokens` (populated from `/api/local/tokens/live` +
 * `/api/local/tokens/lifetime`). No independent fetch — entirely driven by the
 * shared context that polls every 15 s.
 *
 * @lifecycle
 * - Renders null during 'loading' and 'error' states.
 * - `StaleWrapper` dims to 50% opacity + STALE badge when status === 'stale'.
 * - Keyframes injected via React 19 `<style href>` deduplication.
 *
 * @gotcha REACT 19 BORDER SHORTHAND BUG
 * Never set both `border` (shorthand) and `borderLeft` (longhand) on the same element.
 * React 19's DOM reconciler emits a console error on every re-render when both are
 * present — it can't decide which wins. Solution: use `borderTop` + `borderRight` +
 * `borderBottom` for the intensity-driven sides, and keep `borderLeft` as the
 * separate structural accent. This is why INTENSITY_BORDER applies to three sides only.
 *
 * @gotcha INLINE STYLE vs CSS KEYFRAME PRECEDENCE
 * When `intensity === 'high'`, `boxShadow` is set to `undefined` on the container.
 * This is intentional: inline styles have higher specificity than CSS keyframe
 * animations. If a static `boxShadow` inline value were present, the `token-border-pulse`
 * keyframe animation (which also animates `box-shadow`) would be entirely overridden and
 * produce no visible effect. Omitting the inline value hands control to the keyframe.
 */

import { useKingdomLive, StaleWrapper } from '@/lib/kingdom-live-context'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Accent color — Kingdom violet. Used for all token value text and left border stripe. */
const ACCENT = '#7000ff'

/** Minimum width of the HUD panel card in pixels. */
const PANEL_MIN_WIDTH = 210

/** Panel background — near-black with violet tint. */
const PANEL_BG = 'oklch(0.040 0.035 281)'

/** Label column minimum width — aligns all value columns regardless of label length. */
const LABEL_MIN_WIDTH = 62

/** Font size for row labels (TODAY / WEEK / CHRONICLE / RATE). */
const ROW_LABEL_FONT_SIZE = 10

/** Font size for primary token value display. */
const ROW_VALUE_FONT_SIZE = 13

/** Rate icon + label font size. */
const RATE_VALUE_FONT_SIZE = 12

/** Muted warm-gray for row labels — recedes behind the value numbers. */
const LABEL_COLOR = '#504840'

/** Header glyph + title font size. */
const HEADER_FONT_SIZE = 9

/** Cyan used for the header glyph and HUD title. */
const HEADER_COLOR = '#00f3ff'

// ─── INTENSITY MAPS ──────────────────────────────────────────────────────────

/**
 * Per-intensity border style applied to borderTop/borderRight/borderBottom.
 * borderLeft is always `2px solid ${ACCENT}` — the structural left stripe.
 *
 * 'high' uses dashed to signal urgency (approaching context limits or heavy burns).
 * 'medium' / 'high' widen to 2px to increase visual weight as intensity rises.
 */
const INTENSITY_BORDER: Record<string, string> = {
  quiet:  '1px solid rgba(112,0,255, 0.18)',
  low:    '1px solid rgba(112,0,255, 0.35)',
  medium: '2px solid rgba(112,0,255, 0.60)',
  high:   '2px dashed rgba(112,0,255, 1)',
}

/**
 * Per-intensity static box-shadow for quiet/low/medium.
 * NOT used for 'high' — see the boxShadow inline prop comment in the render.
 */
const INTENSITY_SHADOW: Record<string, string> = {
  quiet:  'none',
  low:    'none',
  medium: '0 0 8px rgba(112,0,255,0.4)',
  high:   '0 0 12px rgba(112,0,255,0.8)',
}

// ─── RATE ROW CONFIG ─────────────────────────────────────────────────────────

/** Visual configuration for each intensity level in the RATE row. */
const RATE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  quiet:  { icon: '◇', label: 'QUIET',  color: '#3a3438' },
  low:    { icon: '→', label: 'LOW',    color: '#7000ff66' },
  medium: { icon: '↑', label: 'MED',    color: '#7000ffcc' },
  // Amber for 'high' — visually distinct from the violet palette, signals a threshold breach.
  high:   { icon: '⚡', label: 'HIGH',   color: '#f0a500' },
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** Props for the reusable Row helper. */
interface RowProps {
  label: string
  value: string
  color: string
  /** When true, renders the value at 40% alpha (hex '66') instead of 80% ('cc'). */
  dim?:  boolean
}

/** Props for the RateRow sub-component. */
interface RateRowProps {
  /** One of: 'quiet' | 'low' | 'medium' | 'high'. Falls back to 'quiet' for unknown values. */
  intensity: string
}

// ─── FORMATTERS ──────────────────────────────────────────────────────────────

/**
 * Formats a raw token count into a human-readable string with B/M/K suffixes.
 * Returns '—' for non-finite inputs (NaN, Infinity) that can arrive when the
 * lifetime estimate endpoint is unreachable and the fallback is 0.
 */
function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || Number.isNaN(n)) return '—'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// ─── ROW HELPERS ─────────────────────────────────────────────────────────────

/**
 * Labeled token count row — label column left, value right.
 * `dim` controls whether the value renders at 80% or 40% alpha.
 * TODAY is full-brightness; WEEK and CHRONICLE are dimmed to establish hierarchy.
 */
function Row({ label, value, color, dim = false }: RowProps) {
  // cc = 80% alpha, 66 = 40% alpha in hex
  const alpha = dim ? '66' : 'cc'
  return (
    <div style={{
      display:      'flex',
      alignItems:   'baseline',
      gap:          8,
      marginBottom: 4,
    }}>
      <span style={{
        color:         LABEL_COLOR,
        fontSize:      ROW_LABEL_FONT_SIZE,
        letterSpacing: '0.14em',
        minWidth:      LABEL_MIN_WIDTH,
      }}>
        {label}
      </span>
      <span style={{
        color:              `${color}${alpha}`,
        fontSize:           ROW_VALUE_FONT_SIZE,
        letterSpacing:      '0.06em',
        // tabular-nums: prevents digit columns from shifting width as numbers update.
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  )
}

/**
 * RATE row — qualitative burn rate with icon and label.
 * Falls back to 'quiet' config for any unrecognized intensity value,
 * which prevents a blank row if the API returns an unexpected string.
 */
function RateRow({ intensity }: RateRowProps) {
  const cfg = RATE_CONFIG[intensity] ?? RATE_CONFIG.quiet
  return (
    <div style={{
      display:      'flex',
      alignItems:   'baseline',
      gap:          8,
      marginBottom: 4,
    }}>
      <span style={{
        color:         LABEL_COLOR,
        fontSize:      ROW_LABEL_FONT_SIZE,
        letterSpacing: '0.14em',
        minWidth:      LABEL_MIN_WIDTH,
      }}>
        RATE
      </span>
      <span style={{
        color:         cfg.color,
        fontSize:      RATE_VALUE_FONT_SIZE,
        letterSpacing: '0.08em',
      }}>
        {cfg.icon} {cfg.label}
      </span>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

/**
 * TokenHUD — live token burn overlay.
 *
 * The 'high' intensity path separates border animation from the static shadow
 * by omitting `boxShadow` from the inline style object entirely when intensity
 * is 'high'. This hands full control of box-shadow to the `token-border-pulse`
 * CSS keyframe, which would otherwise be overridden by any static inline value.
 */
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
          0%   { box-shadow: 0 0 8px rgba(112,0,255,0.4); }
          50%  { box-shadow: 0 0 20px rgba(112,0,255,1.0); }
          100% { box-shadow: 0 0 8px rgba(112,0,255,0.4); }
        }
      `}</style>

      <StaleWrapper status={status}>
        <div style={{
          minWidth:   PANEL_MIN_WIDTH,
          fontFamily: 'monospace',
          animation:  'token-hud-in 0.4s ease-out',
        }}>
          <div style={{
            background:     PANEL_BG,
            // Three sides only — borderLeft is the structural accent, set separately.
            // Mixing border shorthand + borderLeft longhand causes React 19 reconciler errors.
            borderTop:      INTENSITY_BORDER[intensity] ?? INTENSITY_BORDER.quiet,
            borderRight:    INTENSITY_BORDER[intensity] ?? INTENSITY_BORDER.quiet,
            borderBottom:   INTENSITY_BORDER[intensity] ?? INTENSITY_BORDER.quiet,
            borderLeft:     `2px solid ${ACCENT}`,
            borderRadius:   3,
            padding:        '8px 12px 9px',
            backdropFilter: 'blur(8px)',
            // KEY: When intensity is 'high', omit boxShadow from inline styles entirely.
            // An inline boxShadow would override the token-border-pulse keyframe animation
            // (inline styles beat CSS animations in the cascade). Setting it to `undefined`
            // removes the property from the element's style attribute, restoring keyframe control.
            boxShadow:      intensity === 'high'
              ? undefined
              : (INTENSITY_SHADOW[intensity] ?? '0 0 18px oklch(0.495 0.310 281 / 0.10)'),
            // Animation only active at 'high' — other intensities use static shadows above.
            animation:      intensity === 'high'
              ? 'token-border-pulse 0.8s ease-in-out infinite'
              : 'none',
            fontFamily:     '"JetBrains Mono", monospace',
          }}>

            {/* Header — «▲» TOKEN_BURN.dat */}
            <div style={{
              display:       'flex',
              alignItems:    'center',
              gap:           5,
              paddingBottom: 6,
              marginBottom:  6,
            }}>
              {/* hud-anim-glyph → glyph-breathe keyframe (globals.css) */}
              <span
                className="hud-anim-glyph"
                style={{ color: HEADER_COLOR, fontSize: HEADER_FONT_SIZE, letterSpacing: '0.06em' }}
              >
                «▲»
              </span>
              <span style={{
                color:         HEADER_COLOR,
                fontSize:      HEADER_FONT_SIZE,
                letterSpacing: '0.20em',
                opacity:       0.80,
              }}>
                TOKEN_BURN.dat
              </span>
            </div>

            {/* hud-divider (globals.css) — traveling scanline strip */}
            <div className="hud-divider" style={{ marginBottom: 7 }} />

            {/* TODAY — full brightness, most immediately relevant */}
            <Row label="TODAY"     value={fmtTokens(tokens.today.tokens)}                          color={ACCENT} />

            {/* WEEK — dimmed, contextual rolling total */}
            <Row label="WEEK"      value={fmtTokens(tokens.week.tokens)}                           color={ACCENT} dim />

            {/* CHRONICLE — lifetime estimate, furthest from present, most dimmed */}
            <Row label="CHRONICLE" value={tokens.lifetime > 0 ? fmtTokens(tokens.lifetime) : '—'} color={ACCENT} dim />

            {/* RATE — qualitative burn intensity, no raw numbers */}
            <RateRow intensity={intensity} />

          </div>
        </div>
      </StaleWrapper>
    </>
  )
}
