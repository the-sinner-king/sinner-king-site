'use client'

/**
 * TokenHUD.tsx — Kingdom Map token burn overlay (S222 redesign)
 *
 * Redesigned to match the TOKEN_BURN.dat panel in public/index.html.
 * Sits at the top of the right-side HUD stack (position: absolute, top:60, right:24).
 *
 * DATA SOURCE
 *   /api/kingdom-state?type=token-pulse → RawTokenPulse (direct sentinel read).
 *   Polled every 30s. WHY NOT useKingdomLive():
 *   The old /api/local/tokens/* endpoints expose a different schema that loses
 *   broadcast_cost, lifetime_tokens, and territories-as-object through type
 *   narrowing in KingdomState. The dedicated token-pulse type returns the full
 *   sentinel sub-object with everything the panel needs. Single fetch, no adapter.
 *
 * LIVE COUNTER ANIMATION
 *   lifetime_tokens + rate_per_sec drive a throttled rAF ticker (~10fps).
 *   Shows the full integer with commas: "15,371,348,828 tokens processed".
 *   The last 4+ digits tick like an odometer between 30s polls.
 *   rateRef + baseRef + pollTimeRef pattern: interval closure safety — refs are
 *   always current without needing the effect to re-register on every poll.
 *
 * TERRITORY COLORS (CHROMA_BLEED sovereign hues — locked for life)
 *   FORGE  H=55   oklch(0.72 0.19 55)   amber  — heat, construction
 *   AERIS  H=145  oklch(0.68 0.20 145)  green  — growth, presence
 *   TOWER  H=195  oklch(0.72 0.20 195)  cyan   — signal, outward face
 *   HOUSE  H=270  oklch(0.62 0.22 270)  violet — memory, interiority
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RawTokenPulse } from '@/lib/kingdom-state'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000
const TICK_INTERVAL_MS = 100   // ~10fps — readable odometer tick, no layout thrash

const PANEL_BG     = 'oklch(0.040 0.035 281)'
const PANEL_BORDER = 'oklch(0.495 0.310 281 / 0.30)'
const HEADER_COLOR = 'oklch(0.87 0.21 192)'  // TOWER cyan — CHROMA_BLEED sovereign hue
const LABEL_COLOR  = 'oklch(0.37 0.02 281)'
const DIM_COLOR    = 'oklch(0.62 0.08 280)'

// Territory config — hues locked to the CHROMA_BLEED doctrine in index.html
const TERRITORIES = [
  {
    key:    'FORGE',
    label:  'FORGE',
    color:  'oklch(0.72 0.19 55)',
    glow:   '0 0 5px oklch(0.72 0.19 55 / 0.65), 0 0 1px oklch(0.72 0.19 55 / 0.9)',
  },
  {
    key:    'AERIS',
    label:  'AERIS',
    color:  'oklch(0.68 0.20 145)',
    glow:   '0 0 5px oklch(0.68 0.20 145 / 0.55), 0 0 12px oklch(0.68 0.20 145 / 0.25)',
  },
  {
    key:    'TOWER',
    label:  'TOWER',
    color:  'oklch(0.72 0.20 195)',
    glow:   '0 0 5px oklch(0.72 0.20 195 / 0.65), 0 0 1px oklch(0.72 0.20 195 / 0.9)',
  },
  {
    key:    'HOUSE',
    label:  'HOUSE',
    color:  'oklch(0.62 0.22 270)',
    glow:   '0 0 5px oklch(0.62 0.22 270 / 0.55), 0 0 12px oklch(0.62 0.22 270 / 0.25)',
  },
] as const

// ─── FORMATTERS ──────────────────────────────────────────────────────────────

/** Full integer with commas — last 4+ digits tick like an odometer at ~10fps. */
function fmtLiveTokens(n: number): string {
  return Math.round(n).toLocaleString('en-US') + ' tokens processed'
}

/** Compact suffix for territory bar values. */
function fmtTok(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}

// ─── TOKEN PULSE HOOK ─────────────────────────────────────────────────────────

/**
 * Polls /api/kingdom-state?type=token-pulse every 30s.
 * Returns null until the first successful response.
 * Gracefully degrades on network error — keeps the last value.
 */
function useTokenPulse(): RawTokenPulse | null {
  const [pulse, setPulse] = useState<RawTokenPulse | null>(null)

  const poll = useCallback(async () => {
    try {
      const r = await fetch('/api/kingdom-state?type=token-pulse')
      if (!r.ok) return
      const data = await r.json() as RawTokenPulse
      if (data && typeof data.broadcast_label === 'string') {
        setPulse(data)
      }
    } catch {
      // keep last value — graceful degradation
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [poll])

  return pulse
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function TokenHUD(): React.ReactElement | null {
  const pulse = useTokenPulse()

  // Live counter refs — safe to read from rAF closure without re-registering effect
  const baseRef     = useRef<number>(0)
  const rateRef     = useRef<number>(0)
  const pollTimeRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)
  const rafRef      = useRef<number | null>(null)
  const [liveLabel, setLiveLabel] = useState<string>('')

  // Sync refs + seed label when new poll data arrives
  useEffect(() => {
    if (!pulse?.lifetime_tokens || !pulse?.rate_per_sec) return
    baseRef.current     = pulse.lifetime_tokens
    rateRef.current     = pulse.rate_per_sec
    pollTimeRef.current = Date.now()
    // Immediately update display to polled value before first tick fires
    setLiveLabel(fmtLiveTokens(pulse.lifetime_tokens))
  }, [pulse])

  // rAF odometer ticker — throttled to TICK_INTERVAL_MS
  useEffect(() => {
    function tick() {
      const now = Date.now()
      if (now - lastTickRef.current >= TICK_INTERVAL_MS && baseRef.current > 0) {
        lastTickRef.current = now
        const elapsed = (now - pollTimeRef.current) / 1000
        setLiveLabel(fmtLiveTokens(baseRef.current + rateRef.current * elapsed))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (!pulse) return null

  const territories = pulse.territories ?? {}
  const maxTok = Math.max(
    ...TERRITORIES.map(t => (territories as Record<string, { today_tok: number }>)[t.key]?.today_tok ?? 0),
    1,
  )

  return (
    <>
      <style href="token-hud-v2-anim" precedence="default">{`
        @keyframes token-hud-v2-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        minWidth:   248,
        fontFamily: 'var(--font-code)',
        animation:  'token-hud-v2-in 0.4s ease-out',
      }}>
        <div style={{
          background:     PANEL_BG,
          borderTop:      `1px solid ${PANEL_BORDER}`,
          borderRight:    `1px solid ${PANEL_BORDER}`,
          borderBottom:   `1px solid ${PANEL_BORDER}`,
          borderLeft:     `2px solid ${HEADER_COLOR}`,
          borderRadius:   3,
          padding:        '8px 12px 10px',
          backdropFilter: 'blur(8px)',
        }}>

          {/* Header — «◇» TOKEN_BURN.dat */}
          <div style={{
            display:       'flex',
            alignItems:    'center',
            gap:           5,
            paddingBottom: 5,
            marginBottom:  6,
            borderBottom:  '1px solid oklch(0.495 0.310 281 / 0.18)',
          }}>
            <span
              className="hud-anim-glyph"
              style={{ color: HEADER_COLOR, fontSize: 9, letterSpacing: '0.06em' }}
              aria-hidden="true"
            >
              «◇»
            </span>
            <span style={{
              color:         HEADER_COLOR,
              fontSize:      9,
              letterSpacing: '0.20em',
              opacity:       0.80,
            }}>
              TOKEN_BURN.dat
            </span>
          </div>

          {/* ALL TIME counter — live odometer */}
          <div style={{ marginBottom: 8 }}>
            <div style={{
              fontSize:      7,
              letterSpacing: '0.22em',
              color:         DIM_COLOR,
              marginBottom:  3,
            }}>
              ALL TIME:
            </div>
            <div style={{
              fontSize:           11,
              color:              HEADER_COLOR,
              letterSpacing:      '0.03em',
              fontVariantNumeric: 'tabular-nums',
              lineHeight:         1.2,
            }}>
              {liveLabel || (pulse.broadcast_label ?? '—')}
            </div>
            <div style={{
              fontSize:      9,
              color:         DIM_COLOR,
              letterSpacing: '0.06em',
              marginTop:     3,
            }}>
              {pulse.broadcast_cost ?? '—'}
            </div>
          </div>

          {/* Divider */}
          <div className="hud-divider" style={{ marginBottom: 7 }} />

          {/* Territory bars — relative scale, max today_tok = 100% */}
          <div>
            {TERRITORIES.map(({ key, label, color, glow }) => {
              const terr = (territories as Record<string, { today_tok: number }>)[key]
              const tok  = terr?.today_tok ?? 0
              const pct  = Math.round((tok / maxTok) * 100)
              return (
                <div key={key} style={{ marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Color rail */}
                    <div style={{
                      width:        2,
                      height:       10,
                      background:   color,
                      flexShrink:   0,
                      borderRadius: 1,
                    }} />
                    {/* Label */}
                    <span style={{
                      fontSize:      7,
                      letterSpacing: '0.14em',
                      color:         LABEL_COLOR,
                      minWidth:      32,
                    }}>
                      {label}
                    </span>
                    {/* Bar track */}
                    <div style={{
                      flex:         1,
                      height:       4,
                      background:   'oklch(0.14 0.02 281)',
                      borderRadius: 1,
                    }}>
                      <div style={{
                        width:        `${pct}%`,
                        height:       '100%',
                        background:   color,
                        borderRadius: 1,
                        transition:   'width 0.8s ease',
                        boxShadow:    glow,
                      }} />
                    </div>
                    {/* Value */}
                    <span style={{
                      fontSize:           8,
                      color,
                      minWidth:           32,
                      textAlign:          'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {tok > 0 ? fmtTok(tok) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </>
  )
}
