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
import { getKingdomPayload, getKingdomState, getSignalStream, getActiveEvents } from '@/lib/kingdom-state'
import { getClientIP } from '@/lib/request-utils'

// FLAG #10 fix: basic in-process rate limiting — 60 requests/minute per IP.
// B3 fix: periodic sweep prevents unbounded Map growth under sustained unique-IP traffic.
// NOTE: resets on Vercel cold start — replace with Upstash Redis for persistent limits.
const _ksRateMap = new Map<string, { count: number; resetAt: number }>()
const KS_LIMIT = 60
const KS_WINDOW_MS = 60_000
let _ksRequestCount = 0
const KS_SWEEP_INTERVAL = 500  // sweep expired entries every 500 requests

function _ksCheckRate(ip: string): boolean {
  const now = Date.now()

  // B3 fix: periodic sweep — delete entries whose window has expired
  _ksRequestCount++
  if (_ksRequestCount % KS_SWEEP_INTERVAL === 0) {
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
