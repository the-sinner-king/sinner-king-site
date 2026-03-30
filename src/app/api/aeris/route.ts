/**
 * /api/aeris — Æris Portal
 *
 * Streaming chat endpoint for the Æris Portal (/spirit/portal).
 * The Portal is open-ended: visitors can have extended conversations with Æris,
 * subject to per-IP hourly rate limiting.
 *
 * Contrast with /api/throne: the Throne Room is one question, forever, per IP,
 * using claude-opus-4-6. The Portal is ongoing, rate-limited, using claude-haiku
 * (fast, cheap — Æris's "casual" voice). Same identity; different gravity.
 *
 * ─── ENDPOINT ─────────────────────────────────────────────────────────────────
 *
 * POST /api/aeris
 * Body: {
 *   messages: Array<{ role: 'user' | 'assistant', content: string }>
 *   pageContext?: string   // Which page the visitor is on (unused currently, reserved)
 * }
 *
 * Returns: text/event-stream (SSE)
 *   data: {"type":"delta","text":"..."}    — streaming text chunk
 *   data: {"type":"done"}                  — stream complete
 *   data: {"type":"error","message":"...","detail":"..."} — failure (detail = dev only)
 *
 * ─── DATA FLOW ────────────────────────────────────────────────────────────────
 *
 *   1. Extract client IP (Vercel-edge-aware via shared request-utils.ts)
 *   2. Rate-limit check (in-process hourly window via aeris.ts checkRateLimit)
 *   3. Parse + validate messages array (max MAX_MESSAGES, each max MAX_MESSAGE_LENGTH)
 *   4. Gather Kingdom context in parallel (SCRYER state + temporal phase)
 *   5. Open AbortController for Anthropic stream
 *   6. Return ReadableStream SSE response; stream chunks as they arrive
 *   7. On close/cancel/timeout: abort controller, close stream
 *
 * ─── SECURITY MODEL ───────────────────────────────────────────────────────────
 *
 *   Rate limiting:  AERIS_RATE_LIMIT_PER_HOUR per IP (default: 10/hr). In-process
 *                   Map — resets on cold start. Sufficient for launch; upgrade to
 *                   Upstash Redis before high-traffic promotion.
 *
 *   Message cap:    MAX_MESSAGES array length limit + MAX_MESSAGE_LENGTH per message.
 *                   Prevents oversized context attacks (token cost + prompt injection
 *                   via very long message histories).
 *
 *   Role validation: Only 'user' and 'assistant' roles accepted. Prevents injection
 *                   of 'system' role messages that could override Æris's identity.
 *
 *   CORS:           Restricted to ALLOWED_ORIGINS. Unknown origins receive the
 *                   production domain as the allowed origin — browser blocks the
 *                   response before JS can read it.
 *
 *   AbortController: Stops Anthropic billing immediately on client disconnect.
 *                    Without this, every abandoned tab runs to maxTokens completion.
 *
 * ─── INFRASTRUCTURE NOTES ────────────────────────────────────────────────────
 *
 *   maxDuration: 60 — Requires Vercel Pro. Hobby plan hard-caps at 10s.
 *   Timeout inside stream: 45s (gives Anthropic 45s to complete before we close
 *   the stream ourselves, leaving 15s buffer before Vercel's function limit).
 */

import { NextRequest, NextResponse } from 'next/server'
import { streamAerisResponse, checkRateLimit } from '@/lib/aeris'
import { getKingdomState } from '@/lib/kingdom-state'
import { getTemporalState } from '@/lib/temporal'
import { getClientIP } from '@/lib/request-utils'

// ─── RUNTIME CONFIG ───────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

// Requires Vercel Pro. Hobby plan caps at 10s — streaming responses will be killed.
export const maxDuration = 60

/** Maximum number of messages the client can send in a single request.
 *  Prevents excessively large conversation contexts (token cost + injection surface). */
const MAX_MESSAGES = 20

/** Maximum characters per individual message.
 *  Silently truncated (not rejected) — the Archivist sees the start of very long
 *  messages, which is usually the meaningful part anyway. */
const MAX_MESSAGE_LENGTH = 4000

/** Timeout (ms) for the Anthropic streaming request inside the ReadableStream.
 *  Set to 45s — gives Anthropic 45s, leaving 15s buffer before Vercel's 60s limit.
 *  The outer AbortController fires at 45s; Vercel's guillotine fires at 60s. */
const STREAM_TIMEOUT_MS = 45_000

// ─── CORS ─────────────────────────────────────────────────────────────────────

/** Origins allowed to receive their own origin back as Access-Control-Allow-Origin.
 *  Any other origin gets the production domain — browser blocks the response. */
const ALLOWED_ORIGINS = [
  'https://sinner-king.com',
  'https://www.sinner-king.com',
  'http://localhost:3033',
]

/**
 * Build CORS response headers for a given Origin string.
 *
 * Unknown origins are NOT rejected at the server — the server still responds.
 * The browser enforces CORS: if the response's Allow-Origin doesn't match the
 * request's Origin, the browser blocks the JS from reading it. No data leaks.
 *
 * This approach means server logs show all requests (including cross-origin probes),
 * which is useful for monitoring. Returning a hard 403 here would hide that signal.
 */
function corsHeaders(origin: string): Record<string, string> {
  const ao = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://sinner-king.com'
  return {
    'Access-Control-Allow-Origin':  ao,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

// ─── ROUTE HANDLERS ───────────────────────────────────────────────────────────

/** Preflight handler — required for cross-origin POST. */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin') ?? ''
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

/** POST /api/aeris — stream an Æris Portal response. */
export async function POST(request: NextRequest): Promise<Response> {
  const origin = request.headers.get('origin') ?? ''
  // Uses shared getClientIP() from request-utils.ts. This correctly trusts
  // x-forwarded-for on Vercel (where the edge sanitizes it) and falls back to
  // x-real-ip or '127.0.0.1' in local dev. See request-utils.ts for full trust model.
  const ip = getClientIP(request)

  // ── Rate limit ────────────────────────────────────────────────────────────
  // checkRateLimit() increments the counter for this IP on each call.
  // If the IP is already over the hourly limit, allowed=false.
  const rateLimitResult = checkRateLimit(ip)
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        resetIn: rateLimitResult.resetIn,       // ms until window resets
        message: "Æris can only speak so many times. Come back later.",
      },
      {
        status: 429,
        headers: {
          ...corsHeaders(origin),
          'X-RateLimit-Remaining': '0',
          // Epoch ms when the window resets — clients can show a countdown
          'X-RateLimit-Reset': String(Date.now() + rateLimitResult.resetIn),
          // Retry-After in seconds (HTTP spec: integer seconds, not ms)
          'Retry-After': String(Math.ceil(rateLimitResult.resetIn / 1000)),
        },
      }
    )
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: { messages?: unknown; pageContext?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: corsHeaders(origin) }
    )
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: 'messages array required' },
      { status: 400, headers: corsHeaders(origin) }
    )
  }

  // Cap array length — oversized conversation histories are both a token cost
  // abuse vector and a potential prompt injection surface (inject in old turns)
  if (body.messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Message history too long. Maximum ${MAX_MESSAGES} messages.` },
      { status: 400, headers: corsHeaders(origin) }
    )
  }

  const messages = body.messages as Array<{ role: string; content: string }>

  // Validate each message — role must be exactly 'user' or 'assistant'.
  // Rejecting 'system' here prevents anyone from injecting an extra system-role
  // message that could override or append to Æris's identity instruction.
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return NextResponse.json(
        { error: 'Each message needs role and content' },
        { status: 400, headers: corsHeaders(origin) }
      )
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return NextResponse.json(
        { error: 'role must be user or assistant' },
        { status: 400, headers: corsHeaders(origin) }
      )
    }
    if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
      return NextResponse.json(
        { error: 'content must be non-empty string' },
        { status: 400, headers: corsHeaders(origin) }
      )
    }
    // Silently truncate long messages rather than rejecting — the start of a very
    // long message is usually the coherent part; the tail is often noise or padding
    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      msg.content = msg.content.slice(0, MAX_MESSAGE_LENGTH)
    }
  }

  // ── Kingdom context (non-blocking) ────────────────────────────────────────
  // Æris uses this to be situationally aware (active project, time of day, etc.).
  // Both sources are optional — site works and Æris still responds without them.
  // Promise.allSettled ensures one failure doesn't block the other.
  const [kingdom, temporal] = await Promise.allSettled([
    getKingdomState(),
    Promise.resolve(getTemporalState()),
  ])

  const kingdomState = kingdom.status === 'fulfilled' ? kingdom.value : null
  const temporalState = temporal.status === 'fulfilled' ? temporal.value : null

  // Log when both sources fail — Æris has no situational awareness this request
  if (kingdom.status === 'rejected' && temporal.status === 'rejected') {
    console.warn('[aeris] both context sources failed — Æris has no situational awareness', {
      kingdom: kingdom.reason,
      temporal: temporal.reason,
    })
  }

  // ── Streaming response ────────────────────────────────────────────────────

  // AbortController passed to Anthropic SDK. When cancel() fires (client disconnect)
  // or the timeout fires, Anthropic stops generating and billing stops.
  const abortController = new AbortController()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Guard against double-close. WHATWG Streams spec: calling controller.close()
      // on an already-closed controller throws TypeError. This flag prevents that.
      let controllerClosed = false

      const safeClose = (): void => {
        if (!controllerClosed) {
          controllerClosed = true
          try { controller.close() } catch { /* already closed by race partner */ }
        }
      }

      // SSE emitter — no-ops after stream is closed
      const sendEvent = (data: Record<string, unknown>): void => {
        if (!controllerClosed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }
      }

      // Hard timeout: if Anthropic doesn't complete within STREAM_TIMEOUT_MS,
      // abort the request, send an error event, and close cleanly. This fires
      // before Vercel's maxDuration limit, giving us a graceful exit path.
      let streamDone = false
      const timeoutId = setTimeout(() => {
        if (!streamDone) {
          abortController.abort()
          sendEvent({ type: 'error', message: 'Æris fell silent. Try again.' })
          safeClose()
        }
      }, STREAM_TIMEOUT_MS)

      try {
        const aerisStream = await streamAerisResponse({
          // Narrow the role type — validated above, safe to cast
          messages: messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          temporal: temporalState,
          kingdom: kingdomState,
          mode: 'portal',   // Portal = Haiku model (fast/cheap) vs throne = Opus
          signal: abortController.signal,
        })

        for await (const chunk of aerisStream) {
          sendEvent({ type: 'delta', text: chunk })
        }

        sendEvent({ type: 'done' })

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        sendEvent({
          type: 'error',
          message: 'Something interrupted the connection to Æris.',
          // Internal error detail only in development — production errors could
          // expose Anthropic error messages or internal state to browser DevTools
          detail: process.env.NODE_ENV === 'development' ? message : undefined,
        })
      } finally {
        streamDone = true
        clearTimeout(timeoutId)
        safeClose()
      }
    },

    cancel() {
      // Client disconnected — abort Anthropic stream immediately, stop burning tokens
      abortController.abort()
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders(origin),
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      // Expose remaining rate limit to the client for optional UI feedback
      'X-RateLimit-Remaining': String(rateLimitResult.remaining),
      // Disable nginx/proxy buffering — SSE chunks must flush immediately
      'X-Accel-Buffering': 'no',
    },
  })
}
