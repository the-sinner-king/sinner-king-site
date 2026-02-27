/**
 * /api/aeris
 *
 * Æris Portal API — streaming chat endpoint.
 *
 * POST /api/aeris
 * Body: {
 *   messages: [{ role: 'user' | 'assistant', content: string }]
 *   pageContext?: string  // Which page the user is visiting
 * }
 *
 * Returns: text/event-stream (SSE)
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"done"}
 *   data: {"type":"error","message":"..."}
 *
 * Rate limiting: AERIS_RATE_LIMIT_PER_HOUR per IP (default: 10)
 * The rate limit is per hour, per IP. Not brutal, but real.
 */

import { NextRequest, NextResponse } from 'next/server'
import { streamAerisResponse } from '@/lib/aeris'
import { checkRateLimit } from '@/lib/aeris'
import { getKingdomState } from '@/lib/kingdom-state'
import { getTemporalState } from '@/lib/temporal'

export const dynamic = 'force-dynamic'

// Extract client IP from headers
function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  )
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request)

  // Rate limit check
  const rateLimitResult = checkRateLimit(ip)
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        resetIn: rateLimitResult.resetIn,
        message: "Æris can only speak so many times. Come back later.",
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Date.now() + rateLimitResult.resetIn),
          'Retry-After': String(Math.ceil(rateLimitResult.resetIn / 1000)),
        },
      }
    )
  }

  // Parse body
  let body: { messages?: unknown; pageContext?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Validate messages
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  const messages = body.messages as Array<{ role: string; content: string }>

  // Basic message validation
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return NextResponse.json({ error: 'Each message needs role and content' }, { status: 400 })
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return NextResponse.json({ error: 'role must be user or assistant' }, { status: 400 })
    }
    if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
      return NextResponse.json({ error: 'content must be non-empty string' }, { status: 400 })
    }
    // Truncate very long messages
    if (msg.content.length > 4000) {
      msg.content = msg.content.slice(0, 4000)
    }
  }

  // Gather context (non-blocking — site works without SCRYER)
  const [kingdom, temporal] = await Promise.allSettled([
    getKingdomState(),
    Promise.resolve(getTemporalState()),
  ])

  const kingdomState = kingdom.status === 'fulfilled' ? kingdom.value : null
  const temporalState = temporal.status === 'fulfilled' ? temporal.value : null

  // Create streaming response
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const aerisStream = await streamAerisResponse({
          messages: messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          temporal: temporalState,
          kingdom: kingdomState,
          mode: 'portal',
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
          detail: process.env.NODE_ENV === 'development' ? message : undefined,
        })
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
      'X-RateLimit-Remaining': String(rateLimitResult.remaining),
      'X-Accel-Buffering': 'no', // Disable nginx buffering for SSE
    },
  })
}
