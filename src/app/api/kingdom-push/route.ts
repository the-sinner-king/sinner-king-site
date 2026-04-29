/**
 * /api/kingdom-push — Kingdom State Push Relay
 *
 * Receives a push trigger from SCRYER and broadcasts the current Kingdom state
 * to all connected PartyKit WebSocket clients.
 *
 * ─── TWO OPERATING MODES ─────────────────────────────────────────────────────
 *
 *   LOCAL DEV (empty body):
 *     SCRYER calls this endpoint with no body. The route reads fresh state from
 *     disk (SCRYER_FEEDS/kingdom_state.json) via getKingdomPayload(), then POSTs
 *     the result to the local PartyKit server (localhost:1999).
 *
 *   PRODUCTION / REMOTE (body present):
 *     SCRYER POSTs the full kingdom state payload as the request body. The route
 *     validates it as JSON and forwards it to the PartyKit cloud host.
 *     This mode is required because Vercel's serverless runtime cannot read local
 *     disk — the SCRYER_FEEDS/ directory only exists on Brandon's machine.
 *
 *   Mode detection: body empty → local dev; body non-empty → remote prod.
 *
 * ─── DATA FLOW ────────────────────────────────────────────────────────────────
 *
 *   1. Validate shared secret from X-Kingdom-Secret header
 *   2. Read request body text (unconditionally — header sniffing is unreliable)
 *   3. If body present: validate as JSON, use directly
 *      If body empty: call getKingdomPayload() to read from disk
 *   4. POST payload to PartyKit room with 5s timeout
 *   5. Return { ok: true, timestamp } on success, or error shape on failure
 *
 * ─── SECURITY MODEL ───────────────────────────────────────────────────────────
 *
 *   Shared secret (KINGDOM_PUSH_SECRET env var):
 *     - Every request must present this in X-Kingdom-Secret header
 *     - Prevents public internet from triggering arbitrary PartyKit broadcasts
 *     - In production: required; missing secret at startup throws (fails fast)
 *     - In dev: optional; if PUSH_SECRET is unset, all requests pass through
 *
 *   Note on PUSH_SECRET omission from response bodies:
 *     The secret is intentionally never included in any response payload or log
 *     line. Logging it would expose it in Vercel's dashboard logs, which may be
 *     accessible to more people than the env vars dashboard.
 *
 *   Payload size limit (MAX_BODY_BYTES):
 *     Guards against oversized bodies — a compromised SCRYER or MITM attempt
 *     could otherwise exhaust memory with a large payload before validation.
 *
 * ─── SIDE EFFECTS ─────────────────────────────────────────────────────────────
 *
 *   - Outbound POST to PartyKit (PARTYKIT_HOST) with a 5s AbortController timeout
 *   - In local dev mode: reads from SCRYER_FEEDS/ via getKingdomPayload()
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getKingdomPayload } from '@/lib/kingdom-state'

// ─── RUNTIME CONFIG ───────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─── ENVIRONMENT VARS ─────────────────────────────────────────────────────────

/** Shared secret for authenticating push requests from SCRYER.
 *  Intentionally typed as string | undefined — we check for undefined at
 *  startup (production) and at request time (dev). Never log or expose this. */
const PUSH_SECRET   = process.env.KINGDOM_PUSH_SECRET

/** PartyKit server host. In local dev, the PartyKit dev server runs on localhost:1999.
 *  In production, this is the deployed PartyKit worker host (e.g. xxx.partykit.dev). */
const PARTYKIT_HOST = process.env.PARTYKIT_HOST ?? 'localhost:1999'

/** PartyKit room name. Matches the room ID used by KingdomLiveContext on the client. */
const PARTYKIT_ROOM = process.env.NEXT_PUBLIC_PARTYKIT_ROOM ?? 'main'

/** Maximum payload size accepted in the request body (bytes).
 *  Content-Length is unreliable (absent on chunked transfer), so we read the body
 *  first and reject if it's too large. 512KB is generous for a Kingdom state blob. */
const MAX_BODY_BYTES = 512 * 1024

/** Timeout (ms) for the outbound PartyKit POST request.
 *  5s is aggressive for an internal service call, but the whole purpose of this
 *  endpoint is to relay quickly — a slow PartyKit shouldn't hold up SCRYER. */
const PARTYKIT_TIMEOUT_MS = 5_000

// ─── ROUTE HANDLER ────────────────────────────────────────────────────────────

/** POST /api/kingdom-push — accept a push trigger and relay to PartyKit. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Production env var validation (moved from module load to request handler)
  // Throwing at module load crashes the cold start lambda and takes down other
  // routes bundled in the same function. A 500 here is scoped to this route only.
  if (process.env.NODE_ENV === 'production') {
    if (!PUSH_SECRET) {
      console.error('[kingdom-push] KINGDOM_PUSH_SECRET must be set in production')
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }
    if (!process.env.PARTYKIT_HOST) {
      console.error('[kingdom-push] PARTYKIT_HOST must be set in production')
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }
  }

  // ── Authentication ────────────────────────────────────────────────────────
  const secret = request.headers.get('x-kingdom-secret') ?? ''

  // timingSafeEqual prevents timing oracle attacks — string comparison via !==
  // leaks how many leading chars matched, enabling brute-force of the secret.
  // Both buffers must be equal length for timingSafeEqual to work correctly.
  if (PUSH_SECRET) {
    const a = Buffer.from(PUSH_SECRET)
    const b = Buffer.from(secret)
    const match = a.length === b.length && timingSafeEqual(a, b)
    if (!match) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // ── Read body unconditionally ─────────────────────────────────────────
    // WHY: Content-Length is absent on chunked transfer encoding, so sniffing
    // the header for "is there a body?" produces false negatives. The only
    // reliable way to determine whether a body was sent is to read it.
    const rawBody = await request.text()

    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    let body: string

    if (rawBody.trim().length > 0) {
      // ── PRODUCTION / REMOTE MODE ─────────────────────────────────────────
      // SCRYER posted the state payload directly. Validate it's well-formed JSON
      // before forwarding — PartyKit expects JSON and would reject malformed bodies,
      // but we want to surface the error here with a clear 400 rather than a 502.
      try {
        JSON.parse(rawBody)
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
      body = rawBody

    } else {
      // ── LOCAL DEV MODE ────────────────────────────────────────────────────
      // No body provided — read fresh state from SCRYER_FEEDS/ on disk.
      // This path is never hit in production because Vercel's FS is read-only
      // and SCRYER_FEEDS/ doesn't exist there — SCRYER always posts a body in prod.
      const payload = await getKingdomPayload()
      body = JSON.stringify(payload)
    }

    // ── Forward to PartyKit ───────────────────────────────────────────────
    // Protocol: http for localhost (dev PartyKit server), https for cloud hosts.
    const protocol = PARTYKIT_HOST.startsWith('localhost') ? 'http' : 'https'
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PARTYKIT_TIMEOUT_MS)

    let pkRes: Response
    try {
      pkRes = await fetch(
        `${protocol}://${PARTYKIT_HOST}/parties/main/${PARTYKIT_ROOM}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Forward the push secret to PartyKit so it can validate the sender too.
            // Empty string when PUSH_SECRET is unset (dev) — PartyKit may or may not
            // require it depending on its own auth config.
            'x-kingdom-secret': PUSH_SECRET ?? '',
          },
          body,
          signal: controller.signal,
        }
      )
    } finally {
      // Always clear the timeout — whether fetch succeeded, threw, or was aborted
      clearTimeout(timeoutId)
    }

    if (!pkRes.ok) {
      const text = await pkRes.text().catch(() => '')
      console.error('[kingdom-push] PartyKit error:', pkRes.status, text, {
        bodySize: body.length,
        // Partial body preview for debugging — helps identify what SCRYER sent
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
