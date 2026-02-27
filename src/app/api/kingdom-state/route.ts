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
 * Rate limiting: not applied here (internal use + low traffic).
 * Add rate limiting if this becomes a public API.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getKingdomPayload, getKingdomState, getSignalStream } from '@/lib/kingdom-state'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
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
