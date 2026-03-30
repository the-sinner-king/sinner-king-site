'use client'

/**
 * @file ProductionQueueHUD.tsx
 *
 * @description
 * Game-style DOM overlay rendering active drone swarm events as a progress queue.
 * Each row shows the swarm label, source-to-target arrow, and a live progress bar.
 * Positioned bottom-right of the canvas. Renders null when no active swarms exist,
 * so the bottom-right corner is clear when the Kingdom is quiet.
 *
 * @dataSource
 * `useKingdomStore(s => s.activeDroneSwarms)` — Zustand store slice.
 * The store is hydrated by `usePartyKitSync` (WebSocket push) and by
 * `applyActiveEvents` on REST poll fallback. This component does NOT use
 * `useKingdomLive()` — it reads the swarm list from the Three.js scene store
 * directly so it stays in sync with the 3D DroneSwarms rendering layer.
 *
 * @lifecycle
 * - `useReducer` force-update pattern fires every 500 ms to advance progress bars.
 *   Each `QueueRow` recomputes `pct` from `Date.now()` on each render cycle.
 * - The interval is cleared on unmount via the useEffect cleanup return.
 * - Renders null immediately if `liveSwarms` is empty after filtering — no panel,
 *   no header, no empty box.
 *
 * @gotcha DIVISION-BY-ZERO GUARD (Math.max(1, duration))
 * `duration = swarm.expiresAt - swarm.startedAt` can be zero if a malformed
 * SCRYER event arrives with `startedAt === expiresAt`, or if the field is missing
 * and both default to the same timestamp. `elapsed / 0 = Infinity`, which would
 * collapse `Math.min(100, ...)` to 100% immediately and never progress.
 * `Math.max(1, duration)` ensures a minimum 1ms denominator — practically identical
 * to 0 but safe from NaN/Infinity propagation into the progress bar width.
 *
 * @gotcha FORCE-UPDATE PATTERN
 * Progress bars need to update every 500ms independently of any prop or state change.
 * A `useRef` tick counter was previously used as a "void" anti-pattern that abused
 * ref mutation to bypass React's stale closure behavior — it worked but was fragile
 * and made the intent unclear. `useReducer((x) => x + 1, 0)` is the idiomatic
 * force-update: the reducer has no side effects, the state value is never read,
 * and the dispatch call triggers a re-render by updating React-tracked state.
 */

import { useEffect, useReducer } from 'react'
import { useKingdomStore } from '@/lib/kingdom-store'
import type { DroneSwarm } from '@/lib/kingdom-store'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Re-render interval in ms — how often progress bars advance. */
const TICK_INTERVAL_MS = 500

/** Panel min/max width in pixels. */
const PANEL_MIN_WIDTH = 240
const PANEL_MAX_WIDTH = 320

/** Progress bar track height in px — deliberately thin for a data-dense HUD. */
const PROGRESS_TRACK_HEIGHT = 2

/** Panel positioning from bottom-right of the canvas. */
const PANEL_BOTTOM = 24
const PANEL_RIGHT  = 24

/** Z-index for the HUD layer — above the 3D canvas (z: 0) but below modals. */
const PANEL_Z_INDEX = 20

/** Font size for swarm label (primary text). */
const SWARM_LABEL_FONT_SIZE = 9

/** Font size for target arrow and percentage readout. */
const SWARM_META_FONT_SIZE = 8

/** Label color for the queue header row. */
const HEADER_COLOR = '#504840'

/** Header font size in px. */
const HEADER_FONT_SIZE = 8

// ─── STATIC STYLES ────────────────────────────────────────────────────────────
//
// Defined outside the component to prevent recreation on every render.
// Dynamic styles (anything depending on swarm.color or computed pct) are
// computed inline in QueueRow.

const panelStyle: React.CSSProperties = {
  position:      'absolute',
  bottom:        PANEL_BOTTOM,
  right:         PANEL_RIGHT,
  zIndex:        PANEL_Z_INDEX,
  display:       'flex',
  flexDirection: 'column',
  gap:           5,
  minWidth:      PANEL_MIN_WIDTH,
  maxWidth:      PANEL_MAX_WIDTH,
  fontFamily:    'monospace',
  // pointerEvents: 'none' — HUD sits above the canvas; don't capture mouse events
  // that should pass through to Three.js orbit controls.
  pointerEvents: 'none',
  animation:     'hud-fade-in 0.3s ease-out',
}

const headerStyle: React.CSSProperties = {
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'center',
  paddingBottom:  3,
  borderBottom:   '1px solid rgba(255,255,255,0.06)',
  marginBottom:   2,
}

const headerLabelStyle: React.CSSProperties = {
  color:         HEADER_COLOR,
  fontSize:      HEADER_FONT_SIZE,
  letterSpacing: '0.18em',
}

const headerCountStyle: React.CSSProperties = {
  color:         HEADER_COLOR,
  fontSize:      HEADER_FONT_SIZE,
  letterSpacing: '0.12em',
}

const labelRowStyle: React.CSSProperties = {
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'baseline',
  marginBottom:   5,
}

const trackStyle: React.CSSProperties = {
  height:       PROGRESS_TRACK_HEIGHT,
  background:   'rgba(255,255,255,0.05)',
  borderRadius: 1,
  overflow:     'hidden',
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Returns the display color for a swarm row.
 * Off-screen searches are always cyan — they represent outbound searches
 * leaving the Kingdom and returning with data (matching the 3D return-arc color).
 * All other swarms inherit the source territory's thematic color.
 */
function getColor(swarm: DroneSwarm): string {
  if (swarm.direction === 'off_screen') return '#00f3ff'

  const map: Record<string, string> = {
    claude_house: '#7000ff',
    the_forge:    '#f0a500',
    the_scryer:   '#00f3ff',
    the_tower:    '#9b30ff',  // Tower Violet — distinct from Throne Pink (#ff006e)
    the_throne:   '#ff006e',
    core_lore:    '#e8e0d0',
  }
  return map[swarm.sourceTerritoryId] ?? '#7000ff'
}

/**
 * Returns the uppercase display label for the target territory.
 * Off-screen searches show "VOID" — no fixed destination territory.
 * Replaces underscores with spaces so "the_forge" renders as "THE FORGE".
 */
function getTargetLabel(swarm: DroneSwarm): string {
  if (swarm.direction === 'off_screen') return 'VOID'
  if (!swarm.targetTerritoryId) return '?'
  return swarm.targetTerritoryId.replace(/_/g, ' ').toUpperCase()
}

// ─── QUEUE ROW ────────────────────────────────────────────────────────────────

/** Props for the QueueRow sub-component. */
interface QueueRowProps {
  swarm: DroneSwarm
  /** Current timestamp (Date.now()) — passed from parent to avoid redundant calls. */
  now:   number
}

/**
 * Single swarm progress row.
 *
 * Progress percent computed as: clamp(0, floor((elapsed / duration) * 100), 100).
 *
 * `Math.max(1, duration)` guards against the division-by-zero case where
 * `startedAt === expiresAt` (malformed SCRYER event). Without this guard,
 * `elapsed / 0 = Infinity`, `Math.round(Infinity * 100) = Infinity`, and
 * the progress bar collapses to 100% on first render and never progresses.
 */
function QueueRow({ swarm, now }: QueueRowProps) {
  const elapsed  = now - swarm.startedAt
  const duration = Math.max(1, swarm.expiresAt - swarm.startedAt)
  const pct      = Math.min(100, Math.round((elapsed / duration) * 100))
  const color    = getColor(swarm)
  const target   = getTargetLabel(swarm)

  return (
    <div style={{
      background:      'rgba(10, 10, 15, 0.88)',
      border:          `1px solid ${color}33`,
      borderLeft:      `2px solid ${color}`,
      borderRadius:    2,
      padding:         '7px 10px 6px',
      backdropFilter:  'blur(6px)',
      // willChange hints compositor to promote this layer early — avoids repaint jank
      // when progress bar width animates via CSS transition.
      willChange:      'transform, opacity, backdrop-filter',
      // contain: 'layout style paint' — limits browser layout recalc scope to this element.
      // Progress bar width changes don't trigger reflow in parent or sibling rows.
      contain:         'layout style paint',
    }}>
      {/* Label row: swarm name | → TARGET | pct% */}
      <div style={labelRowStyle}>
        <span style={{ color, fontSize: SWARM_LABEL_FONT_SIZE, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {swarm.label}
        </span>
        <span style={{ color: `${color}88`, fontSize: SWARM_META_FONT_SIZE, letterSpacing: '0.1em', marginLeft: 8 }}>
          → {target}
        </span>
        <span style={{ color: `${color}99`, fontSize: SWARM_META_FONT_SIZE, letterSpacing: '0.08em', marginLeft: 'auto', paddingLeft: 10 }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar — transitions at 0.5s linear to match the tick interval */}
      <div style={trackStyle}>
        <div style={{
          height:     '100%',
          width:      `${pct}%`,
          background: `linear-gradient(90deg, ${color}aa, ${color})`,
          boxShadow:  `0 0 6px ${color}66`,
          transition: 'width 0.5s linear',
        }} />
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

/**
 * ProductionQueueHUD — active operations panel.
 *
 * Subscribes to a single Zustand slice (`activeDroneSwarms`) rather than the
 * full store — Zustand only re-renders this component when the swarms array
 * reference changes, not on any other store update.
 *
 * The `forceUpdate` dispatch drives the progress animation: every 500ms it
 * increments an ignored counter, triggering a re-render that calls `Date.now()`
 * freshly and recomputes all progress percentages.
 */
export function ProductionQueueHUD() {
  const activeDroneSwarms = useKingdomStore((s) => s.activeDroneSwarms)

  // Force re-render every TICK_INTERVAL_MS to update progress bar percentages.
  // The state value (counter) is never read — only the dispatch trigger matters.
  // useReducer is preferred over useState for this pattern because the reducer
  // makes the "never read the value" intent explicit via the anonymous `_` param.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    const id = setInterval(forceUpdate, TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const now        = Date.now()
  // Filter: only show swarms whose TTL hasn't expired AND whose `active` flag is set.
  // `active` can be false for swarms that have been dequeued but not yet pruned.
  const liveSwarms = activeDroneSwarms.filter((s) => now < s.expiresAt && s.active)

  // Empty queue → render nothing; no panel shell, no empty box in the corner.
  if (liveSwarms.length === 0) return null

  return (
    <div style={panelStyle}>
      {/* React 19 deduplication: href+precedence ensures this keyframe block is
          hoisted to the document exactly once. Other HUD components may also
          define 'hud-fade-in' — deduplication prevents double-injection. */}
      <style href="hud-fade-in" precedence="default">{`
        @keyframes hud-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header row: label + live swarm count */}
      <div style={headerStyle}>
        <span style={headerLabelStyle}>ACTIVE OPERATIONS</span>
        <span style={headerCountStyle}>{liveSwarms.length}</span>
      </div>

      {liveSwarms.map((swarm) => (
        <QueueRow key={swarm.id} swarm={swarm} now={now} />
      ))}
    </div>
  )
}
