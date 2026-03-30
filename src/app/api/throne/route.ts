/**
 * /api/throne — Throne Room
 *
 * The Throne Room grants one question per IP address, for life.
 * Ask wisely. You cannot ask again.
 *
 * ─── ENDPOINTS ────────────────────────────────────────────────────────────────
 *
 * GET /api/throne
 *   Returns the visitor's current status (have they asked? when? site-wide stats).
 *   The /spirit/throne page calls this on load to decide which UI state to render:
 *   the question form, the "you already asked" view, or the first-time experience.
 *
 * POST /api/throne
 *   Body: { question: string }
 *   Streams Æris's response as SSE.
 *   Returns 403 if this IP has already asked.
 *   Returns 429 if a request from this IP is already in-flight (race guard).
 *
 *   SSE event shapes:
 *     data: {"type":"delta","text":"..."}   — streaming text chunk
 *     data: {"type":"done","recorded":true} — stream complete, question was recorded
 *     data: {"type":"error","message":"...","detail":"..."} — stream failure (dev only has detail)
 *
 * ─── DATA FLOW ────────────────────────────────────────────────────────────────
 *
 *   1. Extract client IP (via shared request-utils.ts — Vercel-edge-aware)
 *   2. Check throneInProgress set (in-process race guard)
 *   3. Query throne-ledger.json for this IP's hash (hasThroneAccess)
 *   4. Parse + validate question from body
 *   5. Add IP to throneInProgress
 *   6. RECORD question in ledger BEFORE streaming (consumes the one question)
 *   7. Gather Kingdom context (SCRYER state + temporal phase)
 *   8. Open AbortController (stops Anthropic billing on disconnect/timeout)
 *   9. Return ReadableStream SSE response; stream Æris (claude-opus-4-6 in throne mode)
 *  10. On close/cancel/timeout: delete IP from throneInProgress, close stream
 *
 * ─── SECURITY MODEL ───────────────────────────────────────────────────────────
 *
 *   - One question per IP: enforced in throne-room.ts via SHA-256(salt + ip) ledger
 *   - Question recorded BEFORE streaming: prevents free retries on stream failure
 *     or client disconnect. The moment we accept the question, it is spent.
 *   - throneInProgress guards against the same-IP race (two tabs, double-click).
 *     Not bulletproof across multiple Vercel instances — would need atomic DB
 *     check for that — but eliminates the common case.
 *   - Question length capped at 1000 chars: prevents excessively large prompts.
 *   - No CORS restriction: the Throne Room is accessed from the site's own domain;
 *     the browser's same-origin policy is sufficient. If cross-domain access is ever
 *     needed, add explicit CORS headers here.
 *
 * ─── INFRASTRUCTURE NOTES ────────────────────────────────────────────────────
 *
 *   maxDuration: 60 — Requires Vercel Pro. Hobby plan hard-caps at 10s, which
 *   guillotines streaming responses mid-sentence. This is Æris's one-question
 *   moment — she needs time.
 *
 *   On Vercel's serverless (read-only FS): throne-ledger.json writes fail silently
 *   unless THRONE_ROOM_LEDGER_PATH points to writable storage (e.g. Supabase-backed
 *   or a mounted volume). Set THRONE_ROOM_IP_BAN_ENABLED=false in dev to skip ledger.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  hasThroneAccess,
  getThroneEntry,
  recordThroneQuestion,
  getThroneStats,
} from '@/lib/throne-room'
import { streamAerisResponse } from '@/lib/aeris'
import { getKingdomState } from '@/lib/kingdom-state'
import { getTemporalState } from '@/lib/temporal'
import { getClientIP } from '@/lib/request-utils'

// ─── RUNTIME CONFIG ───────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

// Requires Vercel Pro. Hobby plan caps at 10s — streaming responses will be killed.
// Without this, every Anthropic response > 10s is guillotined mid-stream.
export const maxDuration = 60

/** Hard wall-clock timeout (ms) on the Anthropic stream itself.
 *  Matches maxDuration — if Anthropic hasn't completed by the time Vercel would
 *  kill the function anyway, abort cleanly and send an error SSE event first. */
const STREAM_TIMEOUT_MS = 60_000

/** Maximum question length in characters. Prevents excessively large prompts
 *  reaching Anthropic — at 1000 chars, even a verbose question fits comfortably. */
const MAX_QUESTION_LENGTH = 1000

// ─── IN-PROCESS RACE GUARD ────────────────────────────────────────────────────

/**
 * Tracks IPs currently mid-stream in this process instance.
 *
 * PURPOSE: Prevent the race where two concurrent requests from the same IP both
 * pass hasThroneAccess() before either has called recordThroneQuestion().
 * Classic TOCTOU (Time-of-Check, Time-of-Use) race condition.
 *
 * LIMITATION: Only effective within a single Vercel function instance. Multiple
 * concurrent instances (horizontal scale-out) can still race. An atomic database
 * check (e.g. a conditional Supabase upsert) would be needed to close that gap.
 * For sinner-king.com traffic levels, single-instance protection is sufficient.
 */
const throneInProgress = new Set<string>()

// ─── GET — STATUS CHECK ───────────────────────────────────────────────────────

/**
 * Returns the visitor's Throne Room status.
 * Called by the /spirit/throne page component to determine which view to render.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request)

  // Run all three DB reads in parallel — ledger is small JSON, IO is cheap
  const [access, entry, stats] = await Promise.all([
    hasThroneAccess(ip),
    getThroneEntry(ip),
    getThroneStats(),
  ])

  return NextResponse.json({
    hasAccess: access,
    hasAsked: !!entry,
    askedAt: entry?.timestamp ?? null,   // null if they haven't asked yet
    stats: {
      totalQuestions: stats.totalQuestions,
      questionsToday: stats.questionsToday,
      // averageQuestionLength intentionally omitted — internal metric, not for display
    },
  })
}

// ─── POST — ASK THE QUESTION ──────────────────────────────────────────────────

/** POST /api/throne — ask the one question. Returns a text/event-stream SSE response. */
export async function POST(request: NextRequest): Promise<Response> {
  const ip = getClientIP(request)

  // In-process race guard — returns 429 if this IP already has an active stream
  if (throneInProgress.has(ip)) {
    return NextResponse.json(
      { error: 'A Throne Room request from this address is already in progress.' },
      { status: 429 }
    )
  }

  // Check whether this IP has already spent their one question
  const access = await hasThroneAccess(ip)
  if (!access) {
    return NextResponse.json(
      {
        error: 'You have already asked your question.',
        message: 'The Throne Room grants one question. Yours was spent.',
      },
      { status: 403 }
    )
  }

  // Parse body BEFORE adding to throneInProgress. If parsing throws, we return
  // early without ever locking the IP — no cleanup needed.
  let body: { question?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Validate BEFORE adding to throneInProgress. All early-return paths above
  // and below this block are clean (no lock held). The Set.add() call is the
  // commit point — from that line forward, every exit path must call .delete().
  const question = body.question
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Your question must be under ${MAX_QUESTION_LENGTH} characters.` },
      { status: 400 }
    )
  }

  const trimmedQuestion = question.trim()

  // ── COMMIT POINT: lock the IP ──────────────────────────────────────────────
  // Every code path from here must eventually call throneInProgress.delete(ip).
  throneInProgress.add(ip)

  // Record BEFORE streaming — the question is consumed the moment we accept it.
  //
  // WHY: If we recorded after streaming, a client disconnect (tab close, network
  // failure) mid-stream would mean the question was answered but not recorded,
  // giving the visitor a free retry. The ledger entry is the receipt — it exists
  // regardless of whether the stream completed successfully.
  //
  // TRADEOFF: If recordThroneQuestion itself fails (e.g. Vercel read-only FS),
  // we surface a 503 rather than silently proceeding to stream an unrecorded
  // question. This is conservative — better to tell the visitor to try again
  // than to silently allow unlimited questions through a broken ledger.
  try {
    await recordThroneQuestion(ip, trimmedQuestion)
  } catch (recordErr) {
    throneInProgress.delete(ip)
    console.error('[throne] failed to record question before streaming — aborting', recordErr)
    return NextResponse.json(
      { error: 'The Throne Room could not receive your question. Try again.' },
      { status: 503 }
    )
  }

  // Gather Kingdom context for Æris — non-blocking.
  // If either source fails, Æris answers without situational context (still valid).
  // Promise.allSettled ensures one failure doesn't prevent the other from resolving.
  const [kingdom, temporal] = await Promise.allSettled([
    getKingdomState(),
    Promise.resolve(getTemporalState()),
  ])

  const kingdomState = kingdom.status === 'fulfilled' ? kingdom.value : null
  const temporalState = temporal.status === 'fulfilled' ? temporal.value : null

  // Log if both fail — Æris will still respond, but the context block will be empty
  if (kingdom.status === 'rejected' && temporal.status === 'rejected') {
    console.warn('[throne] both context sources failed — visitor question answered without Kingdom context', {
      kingdom: kingdom.reason,
      temporal: temporal.reason,
    })
  }

  // AbortController — abort the Anthropic stream when the client disconnects or
  // the hard timeout fires. Stops token burn immediately rather than running to
  // completion on an abandoned tab.
  const abortController = new AbortController()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Guard against double-close (race between timeout path + stream completion path).
      // WHATWG Streams spec: calling controller.close() on an already-closed controller
      // throws a TypeError. This flag + safeClose() prevents that.
      let controllerClosed = false

      const safeClose = (): void => {
        if (!controllerClosed) {
          controllerClosed = true
          try { controller.close() } catch { /* already closed by race partner */ }
        }
      }

      // SSE event emitter — no-ops if the controller is already closed
      const sendEvent = (data: Record<string, unknown>): void => {
        if (!controllerClosed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }
      }

      // Hard wall-clock timeout — fires if Anthropic doesn't complete within STREAM_TIMEOUT_MS.
      // Aborts the Anthropic request, sends an error SSE event, and closes the stream cleanly
      // rather than letting the Vercel function get killed mid-response.
      let streamDone = false
      const timeoutId = setTimeout(() => {
        if (!streamDone) {
          abortController.abort()
          throneInProgress.delete(ip)
          sendEvent({ type: 'error', message: 'The Throne Room fell silent. Try again.' })
          safeClose()
        }
      }, STREAM_TIMEOUT_MS)

      try {
        const aerisStream = await streamAerisResponse({
          messages: [{ role: 'user', content: trimmedQuestion }],
          temporal: temporalState,
          kingdom: kingdomState,
          mode: 'throne',           // Tells Æris: "this is THE question"
          maxTokens: 800,           // Throne Room gets a fuller response than Portal
          signal: abortController.signal,
        })

        for await (const chunk of aerisStream) {
          sendEvent({ type: 'delta', text: chunk })
        }

        // recorded: true tells the client the question is permanently on the ledger
        sendEvent({ type: 'done', recorded: true })

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'

        // Question is ALREADY recorded (pre-stream). Stream failure ≠ free retry.
        // The visitor's one question is spent even if they never received the answer.
        // The error message acknowledges this rather than suggesting they try again freely.
        sendEvent({
          type: 'error',
          message: 'Something disrupted the Throne Room. Your question was received but the response was lost.',
          // Only expose internal error details in development — production errors
          // could expose Anthropic API messages or internal state
          detail: process.env.NODE_ENV === 'development' ? message : undefined,
        })
      } finally {
        streamDone = true
        clearTimeout(timeoutId)
        throneInProgress.delete(ip) // always release the lock
        safeClose()
      }
    },

    cancel() {
      // The client disconnected (tab close, navigation, network failure).
      // Abort the Anthropic stream immediately to stop token burn.
      abortController.abort()
      throneInProgress.delete(ip)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache',
      'Connection':      'keep-alive',
      // Signals to the client that the question was accepted and streaming has begun
      'X-Throne-Access': 'granted',
      // Disable nginx/proxy buffering — SSE must be flushed immediately per chunk,
      // not batched into a larger buffer by an intermediate proxy
      'X-Accel-Buffering': 'no',
    },
  })
}
