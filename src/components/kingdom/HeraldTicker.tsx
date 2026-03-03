'use client'

/**
 * HeraldTicker.tsx
 *
 * Scrolling bottom-of-screen ticker displaying Goldfish's live herald string —
 * the narrative description of what Brandon is doing right now.
 *
 * Data from KingdomLiveProvider (useKingdomLive) — no independent fetch.
 * current_activity pulled from shared context.
 *
 * Stale: ticker still shows (stale text > nothing) but at 0.5 opacity.
 *
 * Positioned: absolute, bottom-center, above SwarmLauncher z-index.
 */

import { useKingdomLive } from '@/lib/kingdom-live-context'

const TICKER_COLOR = '#504840'
const LABEL_COLOR  = '#3a3438'

export function HeraldTicker() {
  const { data, status } = useKingdomLive()

  // 'error' or 'loading' (never fetched) → no text yet, show nothing
  if (status === 'loading' || status === 'error') return null

  const text = data?.current_activity?.trim() ?? null
  if (!text) return null

  // Scroll duration: ~0.22s per char, clamped 18s–60s
  const duration = Math.min(60, Math.max(18, text.length * 0.22))

  return (
    <>
      <style href="herald-ticker-anim" precedence="default">{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes ticker-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div style={{
        position:   'absolute',
        bottom:     0,
        left:       0,
        right:      0,
        zIndex:     15,
        height:     28,
        overflow:   'hidden',
        display:    'flex',
        alignItems: 'center',
        background: 'linear-gradient(180deg, transparent 0%, rgba(10,10,15,0.72) 100%)',
        borderTop:  '1px solid rgba(255,255,255,0.03)',
        pointerEvents: 'none',
        animation:  'ticker-fade-in 1s ease-out',
        // Stale: dim the ticker but keep showing — stale herald text is better than nothing
        opacity:    status === 'stale' ? 0.5 : 1,
        transition: 'opacity 0.6s ease',
      }}>
        {/* Prefix label */}
        <span style={{
          flexShrink:   0,
          paddingLeft:  16,
          paddingRight: 10,
          color:        LABEL_COLOR,
          fontSize:     8,
          letterSpacing: '0.18em',
          whiteSpace:   'nowrap',
          borderRight:  '1px solid rgba(255,255,255,0.04)',
          marginRight:  14,
        }}>
          GOLDFISH
        </span>

        {/* Scrolling text */}
        <div style={{
          overflow:   'hidden',
          flex:       1,
          height:     '100%',
          display:    'flex',
          alignItems: 'center',
          maskImage:  'linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%)',
        }}>
          {/*
            Seamless scroll: always duplicate the text with a fixed spacer.
            Animation goes 0 → -50% of the doubled-content element width.
            True seamless — second copy slides into first copy's position.
            Note: text starts visible at left edge (no slide-in from right).
          */}
          <span style={{
            display:    'inline-flex',
            whiteSpace: 'nowrap',
            animation:  `ticker-scroll ${duration}s linear infinite`,
            willChange: 'transform',
          }}>
            <span style={{ color: TICKER_COLOR, fontSize: 9, letterSpacing: '0.06em' }}>{text}</span>
            <span style={{ display: 'inline-block', minWidth: 120, paddingLeft: 40 }} />
            <span style={{ color: TICKER_COLOR, fontSize: 9, letterSpacing: '0.06em' }}>{text}</span>
            <span style={{ display: 'inline-block', minWidth: 120, paddingLeft: 40 }} />
          </span>
        </div>
      </div>
    </>
  )
}
