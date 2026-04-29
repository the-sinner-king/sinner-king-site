'use client'

/**
 * @module kingdom-live-context
 *
 * Shared live data provider for all Kingdom Map HUD components.
 *
 * ## Polling architecture
 * A single `useEffect` in `KingdomLiveProvider` runs a `setInterval` that
 * calls `fetchAll()` every INTERVAL_MS (15 seconds). `fetchAll` fires 4
 * parallel fetches via `Promise.allSettled` — never `Promise.all`, so a
 * single failing endpoint does not abort the rest.
 *
 * All consumers receive a single atomic `setCtx` update per cycle — both
 * live and agents payloads land together so components never see a half-
 * updated state where tokens are fresh but agents are stale.
 *
 * ## Data sources
 *
 * ### Primary path (local dev / Super API online)
 * - `/api/local/kingdom/live`    → tokens intensity + rate, mood, health, current_activity
 * - `/api/local/agents/status`   → agents dict, aexgo_running flag
 * - `/api/local/tokens/live`     → today/week/this_session token windows
 * - `/api/local/tokens/lifetime` → lifetime_estimate_tokens
 *
 * ### Fallback path (Vercel / Super API offline)
 * When both primary endpoints fail, `tryPartyKitFallback()` calls
 * `/api/partykit-snapshot`. This reads the `liveData` object stored in
 * PartyKit room storage by `kingdom-live-push.sh`, which runs on Brandon's
 * machine and pushes fresh data every 30 seconds.
 * - Status is `'ok'` if the push is < STALE_THRESHOLD_MS old.
 * - Status is `'stale'` if older — components add visual degradation.
 *
 * ## Cancelled flag pattern — closure-based cancellation
 * The `useEffect` callback creates a local `let cancelled = false` boolean.
 * The cleanup function (returned by `useEffect`) sets `cancelled = true`.
 *
 * Every `setCtx` call inside the async `fetchAll` / `tryPartyKitFallback`
 * functions is guarded by `if (cancelled) return` immediately before it.
 *
 * ### Why this matters
 * `fetchAll` is async and awaits multiple network calls. Between the first
 * `fetch()` call and the final `setCtx()`, the component may unmount (e.g.
 * route navigation, React Strict Mode double-mount, hot reload). If `setCtx`
 * fires after unmount:
 *   1. React logs a "Can't perform state update on an unmounted component"
 *      warning in development.
 *   2. The update lands in the dead component's closure — the new state
 *      is invisible to the freshly mounted replacement, which starts from
 *      scratch.
 *
 * The `cancelled` guard is checked in two positions per async branch:
 *   a) After `Promise.allSettled` returns (guards the bulk of the logic)
 *   b) Immediately before every `setCtx` call
 *
 * Position (a) is an optimisation — it short-circuits before the `.json()`
 * awaits. Position (b) is the correctness guard — even if we pass (a), the
 * component could unmount during one of the `.json()` awaits that follow.
 *
 * ## document.hidden optimisation
 * `fetchAll` checks `document.hidden` at entry and returns immediately if
 * the tab is backgrounded. Browsers already throttle `setInterval` in
 * background tabs (Chrome: 1-minute minimum), but the check makes the
 * intent explicit and prevents spurious fetches in environments where the
 * throttle isn't applied (some SSR hydration scenarios, Puppeteer).
 *
 * ## Stale treatment contract
 * Components that consume `useKingdomLive()` are expected to apply this
 * visual contract based on the `status` field:
 *   - `'loading'` → render null (no data yet)
 *   - `'error'`   → render null (never successfully fetched)
 *   - `'stale'`   → opacity 0.5 + STALE badge (use `StaleWrapper`)
 *   - `'ok'`      → full opacity, no indicator
 *
 * ## ctxRef pattern
 * `ctxRef` is a stable ref that always points to the latest `ctx` state.
 * It is used inside async callbacks (fetchAll, tryPartyKitFallback) and the
 * interval closure to read the current context without recreating the effect
 * on every state change. Without this ref, the interval callback would close
 * over the initial `ctx` value forever.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { AgentStatus, MoodState } from './kingdom-agents'

// ─── TYPES ─────────────────────────────────────────────────────────────────

/**
 * A single token consumption window (e.g. "today", "this week").
 * Cost is the estimated USD equivalent based on the model's pricing tier.
 */
interface TokenWindow {
  tokens:   number
  cost_usd: number
}

/**
 * A token window that also carries a session identifier.
 * Used for the `this_session` window so components can display which session
 * is active without a separate API call.
 */
interface SessionWindow extends TokenWindow {
  session_id: string
}

/**
 * The merged live data shape exposed to all Kingdom Map HUD components.
 *
 * Fields are sourced from multiple API endpoints (documented per-field)
 * and assembled by `buildMerged()` each polling cycle. Missing fields from
 * a given endpoint fall back to the previous successful value, so consumers
 * always see complete data even when one endpoint is temporarily down.
 */
export interface KingdomLiveData {
  tokens: {
    /** Rolling 24-hour token window. Source: `/api/local/tokens/live` */
    today:          TokenWindow
    /** Rolling 7-day token window. Source: `/api/local/tokens/live` */
    week:           TokenWindow
    /** Current session token window + session ID. Source: `/api/local/tokens/live` */
    this_session:   SessionWindow
    /** All-time lifetime token estimate. Source: `/api/local/tokens/lifetime` */
    lifetime:       number
    /** Current consumption intensity bucket. Source: `/api/local/kingdom/live` */
    intensity:      'high' | 'medium' | 'low' | 'quiet'
    /** Tokens consumed per minute in the current window. Source: `/api/local/kingdom/live` */
    tokens_per_min: number
  }
  /** Current Claude mood state. Source: `/api/local/kingdom/live` */
  mood: MoodState
  /** Kingdom health string (e.g. 'healthy', 'degraded'). Source: `/api/local/kingdom/live` */
  health:           string
  /** Human-readable description of current activity, or null. Source: `/api/local/kingdom/live` */
  current_activity: string | null
  /** Whether Brandon is currently detected as present. Source: `/api/local/kingdom/live` */
  brandon_present:  boolean

  /** Map of agent key → AgentStatus for all 4 Claude instances. Source: `/api/local/agents/status` */
  agents:        Record<string, AgentStatus>
  /** Whether the AExGO (Aeris) process is currently running. Source: `/api/local/agents/status` */
  aexgo_running: boolean
}

/**
 * The full context value exposed by `useKingdomLive()`.
 *
 * Components should read `status` before using `data` — `data` is null
 * during the initial load and may be stale after extended disconnection.
 */
export interface KingdomLiveCtx {
  /** Merged live data. Null only during initial load or on a hard error. */
  data:          KingdomLiveData | null
  /** Current data freshness status. Drives visual treatment in consumers. */
  status:        'loading' | 'ok' | 'stale' | 'error'
  /** Unix timestamp (ms) of the last successful fetch. 0 if never fetched. */
  lastSuccessAt: number
  /** Milliseconds since the last successful fetch. Used for freshness display. */
  age_ms:        number
}

// ─── CONTEXT + HOOK ────────────────────────────────────────────────────────

/**
 * React context backing `useKingdomLive()`.
 * Default value is the "initial loading" state — only seen if a component
 * calls `useKingdomLive()` outside of `KingdomLiveProvider`.
 */
const KingdomLiveContext = createContext<KingdomLiveCtx>({
  data:          null,
  status:        'loading',
  lastSuccessAt: 0,
  age_ms:        0,
})

/**
 * Access the live Kingdom data from any child of `KingdomLiveProvider`.
 *
 * Returns `{ data, status, lastSuccessAt, age_ms }`. Always check `status`
 * before rendering `data` — data is null until the first successful fetch.
 *
 * @example
 * ```tsx
 * const { data, status } = useKingdomLive()
 * if (status === 'loading' || status === 'error') return null
 * ```
 */
export function useKingdomLive(): KingdomLiveCtx {
  return useContext(KingdomLiveContext)
}

// ─── INTERNAL API RESPONSE SHAPES ─────────────────────────────────────────
// All fields are optional — API shape drift degrades gracefully rather than
// crashing the consumer. Missing fields fall back to previous values in
// buildMerged().

/** Inbound shape from `/api/local/kingdom/live`. All fields optional. */
interface KingdomLiveApiResponse {
  tokens?: {
    today?:          TokenWindow
    week?:           TokenWindow
    this_session?:   SessionWindow
    intensity?:      'high' | 'medium' | 'low' | 'quiet'
    tokens_per_min?: number
    /** Alias for `tokens_per_min` used by the flat `/api/kingdom/live` shape. */
    rate_per_min?:   number
  }
  mood?: {
    voltage?:         number | null
    state?:           string | null
    synesthesia_hex?: string | null
    texture?:         string | null
    drive?:           string | null
  }
  health?:           string
  current_activity?: string | null
  brandon_present?:  boolean
}

/** Inbound shape from `/api/local/agents/status`. All fields optional. */
interface AgentsStatusApiResponse {
  agents?:        Record<string, AgentStatus>
  aexgo_running?: boolean
}

/** Inbound shape from `/api/local/tokens/live`. All fields optional. */
interface TokensLiveApiResponse {
  today?:        { tokens: number; cost_usd: number }
  week?:         { tokens: number; cost_usd: number }
  this_session?: { tokens: number; cost_usd: number; session_id: string }
}

/** Inbound shape from `/api/local/tokens/lifetime`. All fields optional. */
interface LifetimeApiResponse {
  lifetime_estimate_tokens?: number
}

// ─── PROVIDER CONSTANTS ────────────────────────────────────────────────────

/**
 * Base polling interval. Each tick adds up to POLL_JITTER_MS of random delay
 * to prevent thundering herd — multiple browser tabs (or users) all waking up
 * in sync and hammering the endpoint simultaneously.
 * Unit: milliseconds.
 */
const INTERVAL_MS    = 15_000
const POLL_JITTER_MS = 5_000

/**
 * Whether the local Super API endpoints are available in this environment.
 *
 * Set NEXT_PUBLIC_SUPER_API_AVAILABLE=true in .env.local to enable the primary
 * /api/local/* polling path. In production (Vercel), leave this unset or false —
 * those endpoints only exist on Brandon's dev machine. Without this guard, every
 * visitor triggers 4 failed 404 requests every 15 seconds before the PartyKit
 * fallback engages.
 *
 * Default: false (safe for production)
 */
const SUPER_API_AVAILABLE = process.env.NEXT_PUBLIC_SUPER_API_AVAILABLE === 'true'

/**
 * Age threshold beyond which live data is considered stale.
 * 45 s = 1.5× the 30-second `kingdom-live-push.sh` push interval.
 * This gives one full push cycle plus a 50% grace period before we
 * degrade the UI. If we've missed 1.5 pushes, the data is likely wrong.
 * Unit: milliseconds.
 */
const STALE_THRESHOLD_MS = 45_000

/** Default empty token window — used when no API data and no previous value exists. */
const EMPTY_TOKEN_WINDOW: TokenWindow     = { tokens: 0, cost_usd: 0 }

/** Default empty session window — used when no API data and no previous value exists. */
const EMPTY_SESSION_WINDOW: SessionWindow = { tokens: 0, cost_usd: 0, session_id: '' }

// ─── PARTYKIT FALLBACK TYPES ───────────────────────────────────────────────

/**
 * Shape of the `liveData` object stored in PartyKit room storage by
 * `kingdom-live-push.sh`. Mirrors the four local API response shapes
 * assembled client-side in the primary path.
 */
interface PartyKitLiveData {
  kingdom_live?:    KingdomLiveApiResponse | null
  agents_status?:   AgentsStatusApiResponse | null
  tokens_live?:     TokensLiveApiResponse | null
  tokens_lifetime?: LifetimeApiResponse | null
  /** Unix timestamp (ms) when the push script last wrote this data. */
  pushed_at?:       number
}

/**
 * Response shape from `/api/partykit-snapshot`.
 *
 * Note: the endpoint always returns HTTP 200. `ok: false` in the body
 * signals the no-data case (room storage is empty or unreachable) — callers
 * must check `snap.ok`, not `res.ok`.
 */
interface PartyKitSnapshotResponse {
  ok:        boolean
  /** Present when ok=true and PartyKit room storage has data. */
  liveData?: PartyKitLiveData
  cached_at?: number
}

// ─── MERGE HELPER ──────────────────────────────────────────────────────────

/**
 * Assemble a complete `KingdomLiveData` from four API payloads + previous state.
 *
 * Each field uses a three-level fallback chain:
 *   1. Fresh value from the relevant API payload (preferred)
 *   2. Previous successful value from `prev` (graceful degradation)
 *   3. Safe zero/empty/default (first load before any success)
 *
 * This means a single endpoint going down does not wipe its slice of the
 * data — consumers continue to see the last known value until a fresh one
 * arrives. Consumers check `status === 'stale'` to know the data may be old.
 *
 * @param live          - Payload from `/api/local/kingdom/live` (or {})
 * @param agentsPayload - Payload from `/api/local/agents/status` (or {})
 * @param tokensPayload - Payload from `/api/local/tokens/live` (or {})
 * @param lifetimePayload - Payload from `/api/local/tokens/lifetime` (or {})
 * @param prev          - Previous `KingdomLiveData` for fallback values, or null
 * @returns             Complete merged `KingdomLiveData`
 */
function buildMerged(
  live:            KingdomLiveApiResponse,
  agentsPayload:   AgentsStatusApiResponse,
  tokensPayload:   TokensLiveApiResponse,
  lifetimePayload: LifetimeApiResponse,
  prev:            KingdomLiveData | null,
): KingdomLiveData {
  return {
    tokens: {
      // today/week/this_session come from /api/tokens/live (tokensPayload).
      // The flat /api/kingdom/live shape does not include these windows —
      // it only carries intensity and rate. Never read windows from `live`.
      today:          tokensPayload.today        ?? prev?.tokens?.today        ?? EMPTY_TOKEN_WINDOW,
      week:           tokensPayload.week         ?? prev?.tokens?.week         ?? EMPTY_TOKEN_WINDOW,
      this_session:   tokensPayload.this_session ?? prev?.tokens?.this_session ?? EMPTY_SESSION_WINDOW,
      lifetime:       lifetimePayload.lifetime_estimate_tokens ?? prev?.tokens?.lifetime ?? 0,
      intensity:      live.tokens?.intensity      ?? prev?.tokens?.intensity      ?? 'quiet',
      // rate_per_min is the flat alias used by /api/kingdom/live.
      // tokens_per_min is the legacy key. Check both; tokens_per_min wins if both present.
      tokens_per_min: live.tokens?.tokens_per_min ?? live.tokens?.rate_per_min ?? prev?.tokens?.tokens_per_min ?? 0,
    },
    mood: {
      voltage:         live.mood?.voltage         ?? prev?.mood?.voltage         ?? null,
      state:           live.mood?.state           ?? prev?.mood?.state           ?? null,
      synesthesia_hex: live.mood?.synesthesia_hex ?? prev?.mood?.synesthesia_hex ?? null,
      texture:         live.mood?.texture         ?? prev?.mood?.texture         ?? null,
      drive:           live.mood?.drive           ?? prev?.mood?.drive           ?? null,
    },
    health:           live.health           ?? prev?.health           ?? 'unknown',
    current_activity: live.current_activity ?? prev?.current_activity ?? null,
    brandon_present:  live.brandon_present  ?? prev?.brandon_present  ?? false,
    agents:           agentsPayload.agents  ?? prev?.agents           ?? {},
    aexgo_running:    agentsPayload.aexgo_running ?? prev?.aexgo_running ?? false,
  }
}

// ─── PROVIDER ──────────────────────────────────────────────────────────────

/**
 * Root data provider for all Kingdom Map HUD components.
 *
 * Mount once at the top of the Kingdom Map component tree. All descendants
 * can call `useKingdomLive()` to access the shared polling context.
 *
 * Starts polling immediately on mount. Cleans up the interval and marks the
 * async callbacks as cancelled on unmount.
 */
export function KingdomLiveProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<KingdomLiveCtx>({
    data:          null,
    status:        'loading',
    lastSuccessAt: 0,
    age_ms:        0,
  })

  // Stable ref so async callbacks and the interval closure always read the
  // latest ctx without needing to be recreated when ctx changes. Without
  // this, the interval closure would capture the initial ctx value forever
  // (stale closure problem).
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  useEffect(() => {
    // ── Cancellation flag ───────────────────────────────────────────────
    // Set to true by the cleanup function when the component unmounts.
    //
    // Every setCtx call in this effect is guarded by `if (cancelled) return`
    // immediately before it. This is necessary because fetchAll is async —
    // the component may unmount between the first fetch() call and the final
    // setCtx() call. Without the guard, setCtx fires on the dead component,
    // producing a React warning and depositing state into a ghost closure
    // that the new mount will never see.
    let cancelled = false

    // ── PartyKit fallback ───────────────────────────────────────────────

    /**
     * Attempt to hydrate state from the PartyKit snapshot endpoint.
     * Called when all primary local API endpoints have failed.
     *
     * Returns true if the fallback succeeded and `setCtx` was called.
     * Returns false if the snapshot is unavailable or malformed.
     *
     * Note: always checks `cancelled` before calling `setCtx` — the
     * await chain inside this function has the same unmount race risk as
     * the primary path.
     */
    async function tryPartyKitFallback(): Promise<boolean> {
      try {
        // cache: 'default' allows 304 Not Modified — reduces round-trip cost.
        // Staleness is already tracked via pushed_at timestamp inside the response.
        const res = await fetch('/api/partykit-snapshot', { cache: 'default' })
        if (!res.ok) return false
        // Endpoint always returns HTTP 200. snap.ok=false means no data.

        const snap = await res.json() as PartyKitSnapshotResponse
        if (!snap.ok || !snap.liveData) return false

        const { kingdom_live, agents_status, tokens_live, tokens_lifetime, pushed_at } = snap.liveData
        if (!kingdom_live && !agents_status) return false

        const now   = Date.now()
        const age   = pushed_at ? now - pushed_at : STALE_THRESHOLD_MS + 1
        const status: KingdomLiveCtx['status'] = age > STALE_THRESHOLD_MS ? 'stale' : 'ok'

        const prev   = ctxRef.current.data
        const merged = buildMerged(
          kingdom_live    ?? {},
          agents_status   ?? {},
          tokens_live     ?? {},
          tokens_lifetime ?? {},
          prev,
        )

        // Cancelled guard — component may have unmounted during the two awaits above.
        if (cancelled) return true  // return true: we would have succeeded
        setCtx({ data: merged, status, lastSuccessAt: now - age, age_ms: age })
        return true
      } catch {
        return false
      }
    }

    // ── Primary polling function ────────────────────────────────────────

    /**
     * Fire all four primary API fetches in parallel, merge the results,
     * and update the context. Falls back to PartyKit if both primary
     * endpoints fail.
     *
     * Called immediately on mount and then every INTERVAL_MS by setInterval.
     */
    async function fetchAll() {
      // Early-exit if cancelled (component unmounted before this tick fired).
      if (cancelled) return

      // Skip when the tab is backgrounded — browsers throttle setInterval
      // in hidden tabs anyway, but this makes the skip explicit and
      // prevents spurious fetches during SSR hydration edge cases.
      if (typeof document !== 'undefined' && document.hidden) return

      // If the local Super API is not available (e.g. production on Vercel),
      // skip straight to PartyKit. The /api/local/* endpoints only exist on
      // Brandon's dev machine — polling them in production wastes 4 round-trips
      // (all 404) every 15s per visitor before the fallback engages.
      if (!SUPER_API_AVAILABLE) {
        const fallbackOk = await tryPartyKitFallback()
        if (!fallbackOk && !cancelled) {
          const now = Date.now()
          setCtx((p) => ({
            ...p,
            status: p.lastSuccessAt > 0
              ? (now - p.lastSuccessAt > STALE_THRESHOLD_MS ? 'stale' : 'ok')
              : 'error',
            age_ms: p.lastSuccessAt > 0 ? now - p.lastSuccessAt : 0,
          }))
        }
        return
      }

      try {
        // Fire all four fetches in parallel. Promise.allSettled never rejects —
        // each result is either { status: 'fulfilled', value } or
        // { status: 'rejected', reason }. This means one failing endpoint
        // does not abort the other three.
        const [liveRes, agentsRes, tokensRes, lifetimeRes] = await Promise.allSettled([
          fetch('/api/local/kingdom/live',    { cache: 'no-store' }),
          fetch('/api/local/agents/status',   { cache: 'no-store' }),
          fetch('/api/local/tokens/live',     { cache: 'no-store' }),
          fetch('/api/local/tokens/lifetime', { cache: 'no-store' }),
        ])

        // Check cancelled AFTER the parallel fetches complete but BEFORE any
        // further awaits. This is the first of two cancellation checkpoints
        // in the success path.
        if (cancelled) return

        const now       = Date.now()
        const hasLive   = liveRes.status   === 'fulfilled' && liveRes.value.ok
        const hasAgents = agentsRes.status === 'fulfilled' && agentsRes.value.ok

        if (!hasLive && !hasAgents) {
          // Both primary endpoints failed — try PartyKit before going stale.
          const fallbackOk = await tryPartyKitFallback()
          if (!fallbackOk && !cancelled) {
            // Fallback also failed. Preserve existing data but update status
            // based on how long it has been since the last success.
            setCtx((p) => ({
              ...p,
              status: p.lastSuccessAt > 0
                ? (now - p.lastSuccessAt > STALE_THRESHOLD_MS ? 'stale' : 'ok')
                : 'error',
              age_ms: p.lastSuccessAt > 0 ? now - p.lastSuccessAt : 0,
            }))
          }
          return
        }

        // At least one primary endpoint succeeded. Decode the JSON payloads.
        // Each .json() call is an additional await — component could unmount here.
        const live: KingdomLiveApiResponse =
          hasLive   ? (await liveRes.value.json()   as KingdomLiveApiResponse) : {}

        const agentsPayload: AgentsStatusApiResponse =
          hasAgents ? (await agentsRes.value.json() as AgentsStatusApiResponse) : {}

        const hasTokens = tokensRes.status === 'fulfilled' && tokensRes.value.ok
        const tokensPayload: TokensLiveApiResponse =
          hasTokens ? (await tokensRes.value.json() as TokensLiveApiResponse) : {}

        const hasLifetime = lifetimeRes.status === 'fulfilled' && lifetimeRes.value.ok
        const lifetimePayload: LifetimeApiResponse =
          hasLifetime ? (await lifetimeRes.value.json() as LifetimeApiResponse) : {}

        const merged = buildMerged(live, agentsPayload, tokensPayload, lifetimePayload, ctxRef.current.data)

        // Second cancellation checkpoint — guards against unmount during the
        // .json() await chain above.
        if (cancelled) return

        // 'ok' requires BOTH primary endpoints healthy so consumers know that
        // the agent glow colours reflect current data, not stale fallback.
        // If only one succeeded, agent data may be from the previous tick.
        const fetchStatus: KingdomLiveCtx['status'] = (hasLive && hasAgents) ? 'ok' : 'stale'
        setCtx({ data: merged, status: fetchStatus, lastSuccessAt: now, age_ms: 0 })

      } catch {
        // Unexpected exception (network error, malformed JSON, etc.).
        // Try PartyKit before going stale.
        if (cancelled) return
        const fallbackOk = await tryPartyKitFallback()
        if (!fallbackOk && !cancelled) {
          const now = Date.now()
          setCtx((p) => ({
            ...p,
            status: p.lastSuccessAt > 0
              ? (now - p.lastSuccessAt > STALE_THRESHOLD_MS ? 'stale' : 'ok')
              : 'error',
            age_ms: p.lastSuccessAt > 0 ? now - p.lastSuccessAt : 0,
          }))
        }
      }
    }

    // Kick off the first fetch immediately, then schedule subsequent ticks
    // with jitter. Recursive setTimeout (vs setInterval) prevents thundering
    // herd: each tab/user lands at a different position in the 15-20s window.
    let timerId: ReturnType<typeof setTimeout>

    function scheduleNext(): void {
      const delay = INTERVAL_MS + Math.floor(Math.random() * POLL_JITTER_MS)
      timerId = setTimeout(() => {
        if (!cancelled) {
          void fetchAll().finally(() => { if (!cancelled) scheduleNext() })
        }
      }, delay)
    }

    void fetchAll().finally(() => { if (!cancelled) scheduleNext() })

    // Cleanup: cancel in-flight async operations + stop the pending timeout.
    return () => {
      cancelled = true
      clearTimeout(timerId)
    }
  }, [])

  return (
    <KingdomLiveContext.Provider value={ctx}>
      {children}
    </KingdomLiveContext.Provider>
  )
}

// ─── STALE WRAPPER ─────────────────────────────────────────────────────────

/**
 * Shared visual staleness treatment for Kingdom Map HUD components.
 *
 * Wraps children with a container that:
 *   - Fades to 50% opacity when `status === 'stale'`
 *   - Renders a small "STALE" badge in the top-right corner
 *   - Re-enables pointer events (parent HUD stacks may set `pointerEvents: 'none'`)
 *
 * Usage: wrap any component that displays live data and should degrade
 * visually when the data source goes offline.
 *
 * @param status   - The `status` field from `useKingdomLive()`
 * @param children - Component(s) to wrap
 *
 * @example
 * ```tsx
 * const { data, status } = useKingdomLive()
 * return (
 *   <StaleWrapper status={status}>
 *     <AgentGlowDisplay data={data} />
 *   </StaleWrapper>
 * )
 * ```
 */
export function StaleWrapper({
  status,
  children,
}: {
  status:   KingdomLiveCtx['status']
  children: React.ReactNode
}) {
  return (
    // pointerEvents: 'auto' re-enables interaction even when a parent HUD
    // stack has set pointerEvents: 'none' on an overlay layer.
    <div style={{
      position:      'relative',
      opacity:       status === 'stale' ? 0.5 : 1,
      transition:    'opacity 0.6s ease',
      pointerEvents: 'auto',
    }}>
      {status === 'stale' && (
        <span style={{
          position:      'absolute',
          top:           4,
          right:         4,
          color:         'oklch(0.59 0.25 345)',
          fontSize:      7,
          letterSpacing: '0.12em',
          pointerEvents: 'none',
          zIndex:        1,
        }}>
          STALE
        </span>
      )}
      {children}
    </div>
  )
}
