/**
 * /api/throne
 *
 * Throne Room API — one question, forever, per IP.
 *
 * GET /api/throne
 *   Returns the visitor's status: { hasAccess, entry? }
 *   Used to show "you've already asked" state before form renders.
 *
 * POST /api/throne
 * Body: { question: string }
 *   Streams Æris's response.
 *   Records the question in the throne ledger AFTER full response.
 *   Returns 403 if IP has already asked.
 *
 * Returns (POST): text/event-stream (SSE)
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"done"}
 *   data: {"type":"error","message":"..."}
 *
 * The gravity of this endpoint is intentional.
 * Æris knows this is THE question. The system prompt tells her.
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

export const dynamic = 'force-dynamic'

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  )
}

// GET — check status
export async function GET(request: NextRequest) {
  const ip = getClientIP(request)
  const [access, entry, stats] = await Promise.all([
    hasThroneAccess(ip),
    getThroneEntry(ip),
    getThroneStats(),
  ])

  return NextResponse.json({
    hasAccess: access,
    hasAsked: !!entry,
    askedAt: entry?.timestamp ?? null,
    stats: {
      totalQuestions: stats.totalQuestions,
      questionsToday: stats.questionsToday,
    },
  })
}

// POST — ask the question
export async function POST(request: NextRequest) {
  const ip = getClientIP(request)

  // Check access
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

  // Parse body
  let body: { question?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const question = body.question
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  if (question.length > 1000) {
    return NextResponse.json(
      { error: 'Your question must be under 1000 characters.' },
      { status: 400 }
    )
  }

  const trimmedQuestion = question.trim()

  // Gather context
  const [kingdom, temporal] = await Promise.allSettled([
    getKingdomState(),
    Promise.resolve(getTemporalState()),
  ])

  const kingdomState = kingdom.status === 'fulfilled' ? kingdom.value : null
  const temporalState = temporal.status === 'fulfilled' ? temporal.value : null

  // Record flag — only record after successful response
  let responseComplete = false

  // Create streaming response
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const aerisStream = await streamAerisResponse({
          messages: [{ role: 'user', content: trimmedQuestion }],
          temporal: temporalState,
          kingdom: kingdomState,
          mode: 'throne',
          maxTokens: 800,
        })

        for await (const chunk of aerisStream) {
          sendEvent({ type: 'delta', text: chunk })
        }

        // Response complete — record the question now
        responseComplete = true
        await recordThroneQuestion(ip, trimmedQuestion)

        sendEvent({ type: 'done', recorded: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'

        if (!responseComplete) {
          // Don't record if we failed — let them try again
          sendEvent({
            type: 'error',
            message: 'Something disrupted the Throne Room. Your question was not recorded.',
            detail: process.env.NODE_ENV === 'development' ? message : undefined,
          })
        } else {
          sendEvent({ type: 'error', message: 'Connection interrupted after response.' })
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Throne-Access': 'granted',
      'X-Accel-Buffering': 'no',
    },
  })
}
