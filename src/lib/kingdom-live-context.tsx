'use client'

/**
 * kingdom-live-context.tsx
 *
 * Shared data provider for all Kingdom Map HUD components.
 *
 * Primary path (local dev / localhost):
 *   /api/local/kingdom/live   → tokens, mood, health, current_activity
 *   /api/local/agents/status  → agents dict, aexgo_running
 *
 * Fallback path (Vercel / Super API offline):
 *   /api/partykit-snapshot    → reads liveData from PartyKit room storage
 *   kingdom-live-push.sh on Brandon's machine pushes fresh data every 30s.
 *   Fallback status = 'ok' if < 45s old, 'stale' if older.
 *
 * Atomic setState — one update per cycle, both payloads together.
 * Never clears data on error — sets status: 'stale' after 45s without success.
 *
 * Stale treatment (applied by each consumer component):
 *   'loading' → render null
 *   'error'   → render null (never fetched)
 *   'stale'   → opacity 0.5 + STALE badge
 *   'ok'      → full opacity, no indicator
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { AgentStatus, MoodState } from './kingdom-agents'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenWindow {
  tokens:   number
  cost_usd: number
}

interface SessionWindow extends TokenWindow {
  session_id: string
}

export interface KingdomLiveData {
  // from /api/local/kingdom/live
  tokens: {
    today:          TokenWindow
    week:           TokenWindow
    this_session:   SessionWindow
    lifetime:       number        // lifetime_estimate_tokens from /api/tokens/lifetime
    intensity:      'high' | 'medium' | 'low' | 'quiet'
    tokens_per_min: number
  }
  mood: MoodState
  health:           string
  current_activity: string | null
  brandon_present:  boolean

  // from /api/local/agents/status
  agents:        Record<string, AgentStatus>
  aexgo_running: boolean
}

export interface KingdomLiveCtx {
  data:          KingdomLiveData | null
  status:        'loading' | 'ok' | 'stale' | 'error'
  lastSuccessAt: number   // unix ms — 0 if never fetched
  age_ms:        number   // ms since last success
}

// ---------------------------------------------------------------------------
// Context + hook
// ---------------------------------------------------------------------------

const KingdomLiveContext = createContext<KingdomLiveCtx>({
  data:          null,
  status:        'loading',
  lastSuccessAt: 0,
  age_ms:        0,
})

export function useKingdomLive(): KingdomLiveCtx {
  return useContext(KingdomLiveContext)
}

// ---------------------------------------------------------------------------
// Internal API response shapes (all fields optional — graceful on shape drift)
// ---------------------------------------------------------------------------

interface KingdomLiveApiResponse {
  tokens?: {
    today?:          TokenWindow
    week?:           TokenWindow
    this_session?:   SessionWindow
    intensity?:      'high' | 'medium' | 'low' | 'quiet'
    tokens_per_min?: number
    rate_per_min?:   number  // alias used by /api/kingdom/live (flat shape)
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

interface AgentsStatusApiResponse {
  agents?:        Record<string, AgentStatus>
  aexgo_running?: boolean
}

interface TokensLiveApiResponse {
  today?:        { tokens: number; cost_usd: number }
  week?:         { tokens: number; cost_usd: number }
  this_session?: { tokens: number; cost_usd: number; session_id: string }
}

interface LifetimeApiResponse {
  lifetime_estimate_tokens?: number
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const INTERVAL_MS        = 15_000
// 45s = 1.5× the 30s kingdom-live-push.sh interval — one full push cycle + 50% grace period.
// If we've missed 1.5 pushes without a success, we call the data stale rather than silently wrong.
const STALE_THRESHOLD_MS = 45_000

const EMPTY_TOKEN_WINDOW: TokenWindow    = { tokens: 0, cost_usd: 0 }
const EMPTY_SESSION_WINDOW: SessionWindow = { tokens: 0, cost_usd: 0, session_id: '' }

// Shape of liveData stored in PartyKit by kingdom-live-push.sh
interface PartyKitLiveData {
  kingdom_live?:    KingdomLiveApiResponse | null
  agents_status?:   AgentsStatusApiResponse | null
  tokens_live?:     TokensLiveApiResponse | null
  tokens_lifetime?: LifetimeApiResponse | null
  pushed_at?:       number
}

interface PartyKitSnapshotResponse {
  ok:        boolean
  liveData?: PartyKitLiveData  // undefined when ok=false (no_livedata)
  cached_at?: number
}

// Build merged KingdomLiveData from API responses + optional previous state
function buildMerged(
  live: KingdomLiveApiResponse,
  agentsPayload: AgentsStatusApiResponse,
  tokensPayload: TokensLiveApiResponse,
  lifetimePayload: LifetimeApiResponse,
  prev: KingdomLiveData | null
): KingdomLiveData {
  return {
    tokens: {
      // today/week/this_session come from /api/tokens/live (tokensPayload) — the flat
      // /api/kingdom/live shape doesn't include these windows, only intensity + rate.
      today:          tokensPayload.today        ?? prev?.tokens?.today        ?? EMPTY_TOKEN_WINDOW,
      week:           tokensPayload.week         ?? prev?.tokens?.week         ?? EMPTY_TOKEN_WINDOW,
      this_session:   tokensPayload.this_session ?? prev?.tokens?.this_session ?? EMPTY_SESSION_WINDOW,
      lifetime:       lifetimePayload.lifetime_estimate_tokens ?? prev?.tokens?.lifetime ?? 0,
      intensity:      live.tokens?.intensity      ?? prev?.tokens?.intensity      ?? 'quiet',
      // rate_per_min is the flat alias used by /api/kingdom/live; tokens_per_min is the legacy key
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
    agents:           agentsPayload.agents   ?? prev?.agents           ?? {},
    aexgo_running:    agentsPayload.aexgo_running ?? prev?.aexgo_running ?? false,
  }
}

export function KingdomLiveProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<KingdomLiveCtx>({
    data:          null,
    status:        'loading',
    lastSuccessAt: 0,
    age_ms:        0,
  })

  // Stable ref so the interval closure sees latest ctx without recreating the effect
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  useEffect(() => {
    let cancelled = false

    async function tryPartyKitFallback(): Promise<boolean> {
      // Returns true if fallback succeeded and state was updated
      try {
        const res = await fetch('/api/partykit-snapshot', { cache: 'no-store' })
        if (!res.ok) return false
        // Note: endpoint always returns 200 — snap.ok=false signals no-data case (checked below)

        const snap = await res.json() as PartyKitSnapshotResponse
        if (!snap.ok || !snap.liveData) return false

        const { kingdom_live, agents_status, tokens_live, tokens_lifetime, pushed_at } = snap.liveData
        if (!kingdom_live && !agents_status) return false

        const now    = Date.now()
        const age    = pushed_at ? now - pushed_at : STALE_THRESHOLD_MS + 1
        const status: KingdomLiveCtx['status'] = age > STALE_THRESHOLD_MS ? 'stale' : 'ok'

        const prev    = ctxRef.current.data
        const merged  = buildMerged(kingdom_live ?? {}, agents_status ?? {}, tokens_live ?? {}, tokens_lifetime ?? {}, prev)

        if (!cancelled) {
          setCtx({ data: merged, status, lastSuccessAt: now - age, age_ms: age })
        }
        return true
      } catch {
        return false
      }
    }

    async function fetchAll() {
      if (cancelled) return

      try {
        const [liveRes, agentsRes, tokensRes, lifetimeRes] = await Promise.allSettled([
          fetch('/api/local/kingdom/live',    { cache: 'no-store' }),
          fetch('/api/local/agents/status',   { cache: 'no-store' }),
          fetch('/api/local/tokens/live',     { cache: 'no-store' }),
          fetch('/api/local/tokens/lifetime', { cache: 'no-store' }),
        ])

        if (cancelled) return

        const now       = Date.now()
        const hasLive   = liveRes.status === 'fulfilled' && liveRes.value.ok
        const hasAgents = agentsRes.status === 'fulfilled' && agentsRes.value.ok

        if (!hasLive && !hasAgents) {
          // Both failed — try PartyKit snapshot before going stale
          const fallbackOk = await tryPartyKitFallback()
          if (!fallbackOk && !cancelled) {
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

        const live: KingdomLiveApiResponse =
          hasLive ? (await liveRes.value.json() as KingdomLiveApiResponse) : {}

        const agentsPayload: AgentsStatusApiResponse =
          hasAgents ? (await agentsRes.value.json() as AgentsStatusApiResponse) : {}

        const hasTokens = tokensRes.status === 'fulfilled' && tokensRes.value.ok
        const tokensPayload: TokensLiveApiResponse =
          hasTokens ? (await tokensRes.value.json() as TokensLiveApiResponse) : {}

        const hasLifetime = lifetimeRes.status === 'fulfilled' && lifetimeRes.value.ok
        const lifetimePayload: LifetimeApiResponse =
          hasLifetime ? (await lifetimeRes.value.json() as LifetimeApiResponse) : {}

        const merged = buildMerged(live, agentsPayload, tokensPayload, lifetimePayload, ctxRef.current.data)

        // If agents endpoint failed, agent data is from prev (stale) — show STALE badge.
        // 'ok' requires both primary endpoints healthy so consumers know agent glow is fresh.
        const fetchStatus: KingdomLiveCtx['status'] = (hasLive && hasAgents) ? 'ok' : 'stale'
        setCtx({ data: merged, status: fetchStatus, lastSuccessAt: now, age_ms: 0 })

      } catch {
        if (cancelled) return
        // Exception path — also try PartyKit fallback
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

    void fetchAll()
    const id = setInterval(() => void fetchAll(), INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <KingdomLiveContext.Provider value={ctx}>
      {children}
    </KingdomLiveContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Stale wrapper — shared visual treatment for components
// ---------------------------------------------------------------------------

export function StaleWrapper({
  status,
  children,
}: {
  status: KingdomLiveCtx['status']
  children: React.ReactNode
}) {
  return (
    // pointerEvents: 'auto' re-enables interaction even when a parent HUD stack sets none
    <div style={{ position: 'relative', opacity: status === 'stale' ? 0.5 : 1, transition: 'opacity 0.6s ease', pointerEvents: 'auto' }}>
      {status === 'stale' && (
        <span style={{
          position:      'absolute',
          top:           4,
          right:         4,
          color:         '#ff006e',
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
