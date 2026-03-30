/**
 * /api/partykit-snapshot — Kingdom State Snapshot
 *
 * Reads the last cached Kingdom payload from PartyKit room storage and returns
 * a filtered subset for client-side use.
 *
 * ─── PURPOSE ─────────────────────────────────────────────────────────────────
 *
 * KingdomLiveContext (the client-side Kingdom state provider) connects to PartyKit
 * via WebSocket for real-time updates. But on Vercel, the local Super API
 * (token_api.py on localhost:2701) isn't available — there's no process to connect
 * to. This endpoint provides a fallback: fetch the last-known payload that SCRYER
 * pushed to the PartyKit room, which includes the `liveData` block (token burn
 * rates, agent activity, etc.) that would normally come from the Super API.
 *
 * ─── DATA FLOW ────────────────────────────────────────────────────────────────
 *
 *   1. GET /parties/main/{room} on PartyKit — retrieves stored room payload
 *   2. Parse JSON; extract only the `liveData` key
 *   3. Return { ok: true, liveData, cached_at } with 30s CDN cache
 *
 *   The full stored blob (SCRYER state + liveData) is NOT re-served.
 *   Only liveData is exposed — the SCRYER state blob is already served via
 *   separate endpoints (/api/kingdom-state, WebSocket). Re-serving it here
 *   would create an inconsistency surface and leak internal state shape.
 *
 * ─── SECURITY MODEL ───────────────────────────────────────────────────────────
 *
 *   PUSH_SECRET omission logic:
 *     The secret header is omitted entirely when PUSH_SECRET is not configured,
 *     rather than sending an empty string. An empty string could pass an
 *     unconfigured PartyKit auth check (i.e. if PartyKit's auth is `if (!secret)`
 *     rather than `if (secret !== expectedSecret)`). Omitting the header is
 *     safer and more explicit about intent.
 *
 *   Internal error suppression:
 *     PartyKit connection errors are logged server-side but the error message is
 *     never included in the client response — connection strings, hostnames, and
 *     internal service topology are not exposed to the browser.
 *
 * ─── CACHING ─────────────────────────────────────────────────────────────────
 *
 *   Cache-Control: public, max-age=30, stale-while-revalidate=60
 *
 *   30s max-age is intentional. The full Kingdom state updates every 30-60s via
 *   WebSocket. Using this snapshot endpoint for more than status-HUD purposes
 *   would be inappropriate — it's a fallback, not a primary data source.
 *
 *   HTTP 200 on empty data (not 204):
 *     HTTP 204 must have no body. CDNs and some proxies silently strip 204 bodies.
 *     We use 200 + { ok: false, reason: 'no_livedata' } so clients can distinguish
 *     "endpoint healthy but no data yet" from "endpoint down."
 *
 * ─── SIDE EFFECTS ─────────────────────────────────────────────────────────────
 *
 *   - Outbound GET to PartyKit (PARTYKIT_HOST) with an 8s AbortController timeout
 */

import { NextResponse } from 'next/server'

// ─── RUNTIME CONFIG ───────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 0

// ─── ENVIRONMENT VARS ─────────────────────────────────────────────────────────

/** PartyKit server host. Matches the value used in /api/kingdom-push. */
const PARTYKIT_HOST = process.env.PARTYKIT_HOST ?? 'localhost:1999'

/** PartyKit room name. Matches the room the client's WebSocket connects to. */
const PARTYKIT_ROOM = process.env.NEXT_PUBLIC_PARTYKIT_ROOM ?? 'main'

/** Shared secret for authenticating to PartyKit.
 *  Intentionally undefined (not '') when unset — we omit the header entirely
 *  rather than sending an empty string. See security notes in file header. */
const PUSH_SECRET = process.env.KINGDOM_PUSH_SECRET

/** Timeout (ms) for the outbound PartyKit GET request.
 *  8s is more generous than the push timeout (5s) because this is a read
 *  (lower priority) and PartyKit room GET may involve storage I/O. */
const PARTYKIT_FETCH_TIMEOUT_MS = 8_000

// ─── ROUTE HANDLER ────────────────────────────────────────────────────────────

/** GET /api/partykit-snapshot — retrieve liveData from the last PartyKit push. */
export async function GET(): Promise<NextResponse> {
  const protocol = PARTYKIT_HOST.startsWith('localhost') ? 'http' : 'https'
  const url = `${protocol}://${PARTYKIT_HOST}/parties/main/${PARTYKIT_ROOM}`

  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), PARTYKIT_FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'GET',
      // Omit header entirely when secret is not configured — avoids accidental
      // empty-string bypass of an unconfigured PartyKit auth check
      headers: PUSH_SECRET ? { 'x-kingdom-secret': PUSH_SECRET } : {},
      // Bypass Next.js fetch cache — we always want the freshest snapshot
      next:    { revalidate: 0 },
      signal:  controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      return NextResponse.json(
        { error: 'PartyKit unreachable', status: res.status },
        { status: 502 }
      )
    }

    const raw = await res.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw) as Record<string, unknown>
    } catch {
      // PartyKit returned non-JSON — unexpected; treat as a 502 (upstream error)
      return NextResponse.json({ error: 'Invalid JSON from PartyKit' }, { status: 502 })
    }

    // Extract only the liveData field — do not re-serve the full SCRYER state blob.
    // The liveData block contains token burn rates and agent activity from the Super API.
    // The surrounding SCRYER state (territory grid, signal stream) is served by
    // dedicated endpoints and shouldn't be re-exposed here.
    const liveData = data.liveData as Record<string, unknown> | undefined

    if (!liveData) {
      // PartyKit is reachable but has no liveData stored yet (e.g. no push has fired).
      // Return 200 with ok: false rather than 204 — HTTP 204 must have no body,
      // and some CDNs/proxies silently strip 204 response bodies. Using 200 + ok: false
      // lets the client distinguish "healthy but empty" from "endpoint down."
      return NextResponse.json({ ok: false, reason: 'no_livedata' }, { status: 200 })
    }

    return NextResponse.json(
      { ok: true, liveData, cached_at: Date.now() },
      {
        headers: {
          // 30s CDN cache — fresh enough for a status HUD. stale-while-revalidate
          // lets the CDN serve the cached version while fetching a fresh one,
          // avoiding a latency spike on cache miss.
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        },
      }
    )

  } catch (err) {
    clearTimeout(timeoutId)
    // Log internally but never expose connection strings or internal error details
    // to the browser — PartyKit host, port, and auth configuration are internal.
    console.error(
      '[partykit-snapshot] fetch error:',
      err instanceof Error ? err.message : err
    )
    return NextResponse.json({ error: 'PartyKit snapshot unavailable' }, { status: 500 })
  }
}
