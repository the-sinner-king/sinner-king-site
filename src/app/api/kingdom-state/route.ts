/**
 * /api/kingdom-state
 *
 * Serves live Kingdom state from SCRYER_FEEDS/ to the frontend.
 *
 * GET /api/kingdom-state
 *   Returns the full payload: { state, stream, timestamp, feedsPath }
 *
 * GET /api/kingdom-state?type=state
 *   Returns only the KingdomState object
 *
 * GET /api/kingdom-state?type=stream
 *   Returns only the SignalStream object
 *
 * Response headers:
 *   Cache-Control: no-store (data is live)
 *   X-Kingdom-Timestamp: unix ms
 *   X-SCRYER-Status: healthy | degraded | offline
 *
 * Rate limiting: FLAG #10 — in-process rate limit. Resets on Vercel cold start.
 * TODO: replace with Upstash Redis for persistent distributed limiting.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getKingdomPayload, getKingdomState, getSignalStream, getActiveEvents, getTokenPulse } from '@/lib/kingdom-state'
import { getClientIP } from '@/lib/request-utils'

// In-process rate limiting — 60 requests/minute per IP.
// ⚠ KNOWN LIMITATION: resets on Vercel cold start and is per-instance (not global).
// On Vercel, multiple concurrent instances each have their own counters — a
// coordinated burst across instances bypasses this limit. For a public read
// endpoint serving Kingdom state data this is acceptable; it is not an auth
// or write endpoint. True distributed rate limiting requires Upstash Redis
// (TODO: wire UPSTASH_REDIS_REST_URL + @upstash/ratelimit when infra is ready).
const _ksRateMap = new Map<string, { count: number; resetAt: number }>()
const KS_LIMIT = 60
const KS_WINDOW_MS = 60_000
// Time-based sweep — runs every 5 minutes regardless of traffic volume.
// The previous request-count based sweep (every 500 reqs) took 8+ hours on
// low-traffic instances, allowing unbounded Map growth during extended low-traffic periods.
let _ksLastSweep = 0
const KS_SWEEP_INTERVAL_MS = 5 * 60 * 1000

function _ksCheckRate(ip: string): boolean {
  const now = Date.now()

  // Time-based sweep — keeps Map bounded even on low-traffic instances
  if (now - _ksLastSweep > KS_SWEEP_INTERVAL_MS) {
    _ksLastSweep = now
    for (const [key, entry] of _ksRateMap) {
      if (now > entry.resetAt) _ksRateMap.delete(key)
    }
  }

  const entry = _ksRateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    _ksRateMap.set(ip, { count: 1, resetAt: now + KS_WINDOW_MS })
    return true
  }
  if (entry.count >= KS_LIMIT) return false
  entry.count++
  return true
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  const ip = getClientIP(request)

  if (!_ksCheckRate(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: 60 },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  try {
    let data: unknown
    let scryerStatus: string = 'unknown'

    if (type === 'state') {
      const state = await getKingdomState()
      scryerStatus = state ? 'healthy' : 'offline'
      data = { state, timestamp: Date.now() }
    } else if (type === 'stream') {
      const stream = await getSignalStream()
      scryerStatus = stream.signals.length > 0 ? 'healthy' : 'degraded'
      data = { stream, timestamp: Date.now() }
    } else if (type === 'events') {
      const events = await getActiveEvents()
      scryerStatus = 'healthy'
      data = events
    } else if (type === 'token-pulse') {
      // Returns the raw sentinel sub-object (RawTokenPulse) from kingdom_state.json.
      // Dedicated type because: (1) avoids type-narrowing loss through KingdomState.token_pulse,
      // (2) skips the full getKingdomPayload() pipeline (Claude activity, overmind heartbeat,
      // multi-file reads) for a consumer that only needs the sentinel data.
      // See getTokenPulse() in kingdom-state.ts for the full architectural rationale.
      const pulse = await getTokenPulse()
      scryerStatus = pulse ? 'healthy' : 'offline'
      data = pulse
    } else {
      const payload = await getKingdomPayload()
      scryerStatus = payload.state ? 'healthy' : 'offline'
      data = payload
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'X-Kingdom-Timestamp': String(Date.now()),
        'X-SCRYER-Status': scryerStatus,
      },
    })
  } catch (err) {
    console.error('[api/kingdom-state] Error:', err)

    return NextResponse.json(
      {
        error: 'Failed to read Kingdom state',
        timestamp: Date.now(),
        state: null,
        stream: { signals: [], lastUpdated: 0, version: '1.0' },
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-SCRYER-Status': 'offline',
        },
      }
    )
  }
}
