'use client'

/**
 * RavenArrivalFlash.tsx
 *
 * DOM overlay that shows a brief labeled glyph when a raven signal pulse
 * completes its journey to a territory on the Kingdom Map.
 *
 * DATA SOURCE
 *   ravenArrivalQueue — module-level array exported from SignalPulse.tsx.
 *   SignalPulse's useFrame loop pushes a RavenArrival entry the frame a raven
 *   pulse reaches t >= 1.0. This component flushes that queue every
 *   QUEUE_FLUSH_INTERVAL_MS from a plain setInterval (not useFrame — this is a
 *   DOM overlay, not an R3F scene child).
 *
 * WHY THE QUEUED-REF PATTERN (BQ-02)
 *   useFrame runs inside the R3F canvas. React state updates inside useFrame
 *   batch oddly and can cause one-frame-lag or missed updates at 60fps.
 *   Instead, SignalPulse writes arrival events to a plain mutable array;
 *   this component polls and drains it from a setInterval. Clean separation
 *   between the R3F render loop and React state.
 *
 * WHY CSS KEYFRAME ANIMATION (not JS opacity)
 *   Early version used a setInterval to decrement opacity by step each tick.
 *   At 100ms flush granularity the result was visible 100ms opacity jumps rather
 *   than a smooth curve. CSS keyframe animation hands the interpolation to the
 *   browser compositor thread — butter smooth at zero JS cost per frame.
 *
 * SIDE EFFECTS
 *   Two setIntervals created on mount: queue flush + expiry pruner.
 *   Both clear on unmount. No external subscriptions.
 *
 * GOTCHAS
 *   - The prune interval (PRUNE_INTERVAL_MS) is deliberately shorter than the
 *     CSS animation duration (FLASH_DURATION_MS) so DOM nodes are removed
 *     shortly after the fade-out completes — not left lingering invisible.
 *   - expiresAt is set to FLASH_DURATION_MS + a 100ms grace period so the prune
 *     interval never removes a flash before its animation fully finishes.
 */

import { useRef, useEffect, useState } from 'react'
import { ravenArrivalQueue } from './SignalPulse'
import { TERRITORY_MAP } from '@/lib/kingdom-layout'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** How often the arrival queue is drained and new flash entries are created. */
const QUEUE_FLUSH_INTERVAL_MS = 100

/** How often expired flash entries are pruned from state. */
const PRUNE_INTERVAL_MS = 200

/**
 * Total flash lifetime in milliseconds.
 * Matches the CSS animation duration so DOM removal coincides with fade completion.
 * The +100ms grace period in expiresAt ensures the prune interval never removes a
 * flash while its animation is still mid-fade.
 */
const FLASH_DURATION_MS = 900

// ─── MODULE-LEVEL COUNTER ────────────────────────────────────────────────────

/**
 * Monotonically increasing key prefix for flash entries.
 *
 * Using Date.now() alone as a React key is insufficient because multiple raven
 * arrivals can land in the same 100ms flush tick and therefore share the same
 * millisecond timestamp — producing duplicate keys that React would silently
 * coalesce into a single rendered node. The counter guarantees uniqueness even
 * when flush delivers a batch of simultaneous arrivals.
 */
let _flashIdCounter = 0

// ─── TYPES ───────────────────────────────────────────────────────────────────

/** A single in-flight flash overlay entry. */
interface FlashEntry {
  /** Unique React key — `raven-<_flashIdCounter>`. */
  id: string
  /** Human-readable territory label resolved from TERRITORY_MAP. */
  label: string
  /** Unix ms after which this entry should be pruned from state. */
  expiresAt: number
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export function RavenArrivalFlash(): React.ReactElement | null {
  const [flashes, setFlashes] = useState<FlashEntry[]>([])
  // Guards against setState calls after unmount (both setIntervals check this).
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    // Flush queue → new flash entries.
    // splice(0, length) atomically drains the shared array and returns its contents.
    const flushId = setInterval(() => {
      if (!mountedRef.current) return
      const arrivals = ravenArrivalQueue.splice(0, ravenArrivalQueue.length)
      if (arrivals.length === 0) return
      setFlashes((prev) => {
        const next = [...prev]
        for (const arrival of arrivals) {
          const territory = TERRITORY_MAP[arrival.territoryId]
          const label = territory?.label ?? arrival.territoryId
          next.push({
            id: `raven-${_flashIdCounter++}`,
            label,
            // +100ms grace: prune fires every 200ms; without the buffer a flash
            // that spawned at tick N-1 could be pruned before tick N's animation ends.
            expiresAt: Date.now() + FLASH_DURATION_MS + 100,
          })
        }
        return next
      })
    }, QUEUE_FLUSH_INTERVAL_MS)

    // Prune expired entries so the DOM doesn't accumulate invisible nodes.
    const pruneId = setInterval(() => {
      if (!mountedRef.current) return
      setFlashes((prev) => prev.filter((f) => f.expiresAt > Date.now()))
    }, PRUNE_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      clearInterval(flushId)
      clearInterval(pruneId)
    }
  }, [])

  if (flashes.length === 0) return null

  return (
    <>
      {/*
        Next.js deduplicates injected <style> tags by the `href` key — safe to
        render conditionally; the keyframe is only injected once per page.
      */}
      <style href="raven-arrival-flash-anim" precedence="default">{`
        @keyframes raven-flash-fade {
          0%   { opacity: 1; }
          70%  { opacity: 0.5; }
          100% { opacity: 0; }
        }
      `}</style>
      <div
        style={{
          position:      'fixed',
          top:           120,
          left:          '50%',
          transform:     'translateX(-50%)',
          zIndex:        30,
          pointerEvents: 'none',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          gap:           6,
        }}
      >
        {flashes.map((flash) => (
          <div
            key={flash.id}
            style={{
              fontFamily:    'monospace',
              fontSize:      11,
              letterSpacing: '0.15em',
              background:    'linear-gradient(90deg, rgba(155,48,255,0.13), rgba(0,243,255,0.13))',
              border:        '1px solid #9b30ff50',
              borderRadius:  3,
              padding:       '3px 10px',
              /*
               * CSS keyframe drives the fade. JS-computed opacity produced visible
               * 100ms steps at the flush granularity; the compositor interpolates
               * this keyframe independently of the JS event loop — always smooth.
               */
              animation:     `raven-flash-fade ${FLASH_DURATION_MS}ms ease-out forwards`,
              color:         '#cc88ff',
              textShadow:    '0 0 8px #9b30ff',
              whiteSpace:    'nowrap',
            }}
          >
            ✉ {flash.label}
          </div>
        ))}
      </div>
    </>
  )
}
