// src/app/api/partykit-snapshot/route.ts
//
// Reads the last cached payload from the PartyKit room storage.
// Used by KingdomLiveContext as a fallback when localhost:2701 is unreachable
// (i.e. on Vercel where the local Super API isn't available).
//
// The payload is the full kingdom state blob that kingdom-live-push.sh POSTs
// every 30s, which includes both SCRYER state and `liveData` (token_api data).
//
// 30s max-age cache — fresh enough for a status HUD, not worth hammering PartyKit.

import { NextResponse } from 'next/server'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

const PARTYKIT_HOST = process.env.PARTYKIT_HOST ?? 'localhost:1999'
const PARTYKIT_ROOM = process.env.NEXT_PUBLIC_PARTYKIT_ROOM ?? 'main'
const PUSH_SECRET   = process.env.KINGDOM_PUSH_SECRET ?? ''

export async function GET() {
  const protocol = PARTYKIT_HOST.startsWith('localhost') ? 'http' : 'https'
  const url = `${protocol}://${PARTYKIT_HOST}/parties/main/${PARTYKIT_ROOM}`

  try {
    const res = await fetch(url, {
      method:  'GET',
      headers: { 'x-kingdom-secret': PUSH_SECRET },
      next:    { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'PartyKit unreachable', status: res.status }, { status: 502 })
    }

    const raw = await res.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON from PartyKit' }, { status: 502 })
    }

    // Only expose liveData — don't re-serve the full SCRYER state blob
    const liveData = data.liveData as Record<string, unknown> | undefined
    if (!liveData) {
      return NextResponse.json({ ok: false, reason: 'no_livedata' }, { status: 204 })
    }

    return NextResponse.json(
      { ok: true, liveData, cached_at: Date.now() },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        },
      }
    )
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
