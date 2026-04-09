'use client'

/**
 * HeraldTicker.tsx
 *
 * Scrolling bottom-of-screen ticker that displays Goldfish's live herald string —
 * the narrative description of what Brandon is doing right now.
 *
 * DATA SOURCE
 *   useKingdomLive() context hook. No independent fetch — all data comes from
 *   KingdomLiveProvider which polls /api/local/kingdom/live every 15s (or reads
 *   from PartyKit snapshot on Vercel). current_activity is the herald string.
 *
 * SCROLLING ARCHITECTURE
 *   The ticker uses a doubled-content approach for seamless looping:
 *     [text][spacer][text][spacer]
 *   The animation translates from 0 → -50% of the total element width, which
 *   lands exactly at the start of the second copy. The browser loops back to 0
 *   invisibly — the second copy is identical to the first, so the seam is perfect.
 *
 * WHY key={text} ON THE ANIMATED SPAN
 *   When text changes (15s data refresh), React would normally patch the existing
 *   DOM node — updating the animation's `duration` style property on the live node.
 *   Browsers handle this inconsistently: some reset the animation to t=0 (jarring
 *   snap), some continue mid-animation with the old duration, some glitch.
 *   Keying on `text` tells React to unmount the old span and mount a fresh one
 *   whenever the string changes, which forces the CSS animation to restart cleanly
 *   with the correct duration for the new text length.
 *
 * STALE BEHAVIOR
 *   status === 'stale' dims the ticker to 0.5 opacity but keeps showing the last
 *   known herald text. An empty ticker is less informative than stale content.
 *
 * SIDE EFFECTS
 *   None — purely derived from context.
 */

import { useKingdomLive } from '@/lib/kingdom-live-context'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** Scroll speed: seconds per character. Feels natural for reading pace. */
const DURATION_PER_CHAR_S = 0.22

/** Minimum scroll duration in seconds — prevents very short strings racing past. */
const DURATION_MIN_S = 18

/** Maximum scroll duration in seconds — prevents very long strings taking forever. */
const DURATION_MAX_S = 60

/**
 * Horizontal spacer minimum width (px) between the two ticker copies.
 * Combined with paddingLeft, creates a visual gap so the loop point is obvious.
 */
const SPACER_MIN_WIDTH_PX = 120

/** Left padding on each spacer span (px). Adds breathing room between copies. */
const SPACER_PADDING_LEFT_PX = 40

// ─── COLORS ──────────────────────────────────────────────────────────────────

/** Ticker text color — intentionally muted, this is ambient not foreground. */
const TICKER_COLOR = 'oklch(0.37 0.02 281)'

/** "GOLDFISH" prefix label color — dimmer than ticker text. */
const LABEL_COLOR  = 'oklch(0.25 0.02 281)'

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export function HeraldTicker(): React.ReactElement | null {
  const { data, status } = useKingdomLive()

  // Render nothing while data hasn't arrived yet or failed entirely.
  // 'stale' keeps rendering — last known activity is better than nothing.
  if (status === 'loading' || status === 'error') return null

  const text = data?.current_activity?.trim() ?? null
  if (!text) return null

  // Scroll duration scales with text length so short and long strings both feel
  // natural. Clamped so a one-word string doesn't race and a novel doesn't crawl.
  const duration = Math.min(
    DURATION_MAX_S,
    Math.max(DURATION_MIN_S, text.length * DURATION_PER_CHAR_S),
  )

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
        position:      'absolute',
        bottom:        0,
        left:          0,
        right:         0,
        zIndex:        15,
        height:        28,
        overflow:      'hidden',
        display:       'flex',
        alignItems:    'center',
        background:    'linear-gradient(180deg, transparent 0%, oklch(0.06 0.02 281 / 0.72) 100%)',
        borderTop:     '1px solid oklch(1 0 0 / 0.03)',
        pointerEvents: 'none',
        animation:     'ticker-fade-in 1s ease-out',
        // Stale: dim but keep visible — last known herald text beats a blank ticker.
        opacity:       status === 'stale' ? 0.5 : 1,
        transition:    'opacity 0.6s ease',
      }}>

        {/* "GOLDFISH" prefix — immutable label, not part of the scroll loop */}
        <span style={{
          flexShrink:    0,
          paddingLeft:   16,
          paddingRight:  10,
          color:         LABEL_COLOR,
          fontSize:      8,
          letterSpacing: '0.18em',
          whiteSpace:    'nowrap',
          borderRight:   '1px solid oklch(1 0 0 / 0.04)',
          marginRight:   14,
        }}>
          GOLDFISH
        </span>

        {/* Scrolling viewport — fade-edge mask hides text entering/leaving frame */}
        <div style={{
          overflow:         'hidden',
          flex:             1,
          height:           '100%',
          display:          'flex',
          alignItems:       'center',
          maskImage:        'linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%)',
          WebkitMaskImage:  'linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%)',
        }}>
          {/*
            key={text}: forces React to unmount and remount this span whenever
            the herald string changes. Without it, React patches the live DOM node
            in place — the browser then receives an animation-duration CSS change
            mid-animation, which some engines handle by restarting (jarring snap)
            and some by continuing with the wrong speed. A fresh mount guarantees
            a clean animation start with the correct duration every time.

            text starts visible at the left edge — no slide-in from the right.
            This matches the "monitor feed" aesthetic rather than a news crawl.
          */}
          <span key={text} style={{
            display:    'inline-flex',
            whiteSpace: 'nowrap',
            animation:  `ticker-scroll ${duration}s linear infinite`,
            willChange: 'transform',
          }}>
            <span style={{ color: TICKER_COLOR, fontSize: 9, letterSpacing: '0.06em' }}>{text}</span>
            <span style={{ display: 'inline-block', minWidth: SPACER_MIN_WIDTH_PX, paddingLeft: SPACER_PADDING_LEFT_PX }} />
            {/* Second copy — slides into first copy's position at -50% */}
            <span style={{ color: TICKER_COLOR, fontSize: 9, letterSpacing: '0.06em' }}>{text}</span>
            <span style={{ display: 'inline-block', minWidth: SPACER_MIN_WIDTH_PX, paddingLeft: SPACER_PADDING_LEFT_PX }} />
          </span>
        </div>
      </div>
    </>
  )
}
