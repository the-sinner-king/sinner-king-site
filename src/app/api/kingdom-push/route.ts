// src/app/api/kingdom-push/route.ts
//
// Receives a push trigger from SCRYER and broadcasts the current Kingdom state
// to all connected PartyKit WebSocket clients.
//
// Two modes:
//   LOCAL DEV: SCRYER calls with no body → route reads SCRYER_FEEDS from disk
//   PROD/REMOTE: SCRYER POSTs payload body directly (Vercel can't read local disk)
//
// Both modes validate the shared secret before doing anything.

import { NextRequest, NextResponse } from 'next/server'
import { getKingdomPayload } from '@/lib/kingdom-state'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PUSH_SECRET   = process.env.KINGDOM_PUSH_SECRET
const PARTYKIT_HOST = process.env.PARTYKIT_HOST ?? 'localhost:1999'
const PARTYKIT_ROOM = process.env.NEXT_PUBLIC_PARTYKIT_ROOM ?? 'main'

// Assert secret is set in production — catches misconfigured Vercel deployments at startup
if (process.env.NODE_ENV === 'production' && !PUSH_SECRET) {
  throw new Error('[kingdom-push] KINGDOM_PUSH_SECRET must be set in production')
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-kingdom-secret')
  if (PUSH_SECRET && secret !== PUSH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let body: string

    const contentLength = request.headers.get('content-length')
    const hasBody = contentLength && parseInt(contentLength, 10) > 0

    if (hasBody) {
      // Prod/remote mode: SCRYER posted the payload directly
      // Enforce a 512KB cap — a well-formed Kingdom payload is well under 50KB
      const MAX_BODY_BYTES = 512 * 1024
      if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
      }
      body = await request.text()
      if (body.length > MAX_BODY_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
      }
      try { JSON.parse(body) } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
    } else {
      // Local dev mode: read fresh state from disk
      const payload = await getKingdomPayload()
      body = JSON.stringify(payload)
    }

    const protocol = PARTYKIT_HOST.startsWith('localhost') ? 'http' : 'https'
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    let pkRes: Response
    try {
      pkRes = await fetch(
        `${protocol}://${PARTYKIT_HOST}/parties/main/${PARTYKIT_ROOM}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-kingdom-secret': PUSH_SECRET ?? '',
          },
          body,
          signal: controller.signal,
        }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (!pkRes.ok) {
      const text = await pkRes.text().catch(() => '')
      console.error('[kingdom-push] PartyKit error:', pkRes.status, text, {
        bodySize: body.length,
        bodyPreview: body.substring(0, 200),
      })
      return NextResponse.json({ error: 'PartyKit error' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, timestamp: Date.now() })
  } catch (err) {
    console.error('[kingdom-push]', err)
    return NextResponse.json({ error: 'Push failed' }, { status: 500 })
  }
}
