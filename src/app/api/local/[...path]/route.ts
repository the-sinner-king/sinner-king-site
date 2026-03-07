// src/app/api/local/[...path]/route.ts
//
// Proxy to token_api.py (localhost:2701) — Kingdom Super API.
//
// Routes all /api/local/* requests to the local Flask server:
//   GET /api/local/tokens/live      → http://localhost:2701/api/tokens/live
//   GET /api/local/tokens/chart     → http://localhost:2701/api/tokens/chart
//   GET /api/local/tokens/hourly    → http://localhost:2701/api/tokens/hourly
//   GET /api/local/tokens/lifetime  → http://localhost:2701/api/tokens/lifetime
//   GET /api/local/mood/current     → http://localhost:2701/api/mood/current
//   GET /api/local/mood/history     → http://localhost:2701/api/mood/history
//   GET /api/local/kingdom/activity → http://localhost:2701/api/kingdom/activity
//   GET /api/local/kingdom/missions → http://localhost:2701/api/kingdom/missions
//   GET /api/local/system/health    → http://localhost:2701/api/system/health
//
// Returns 503 gracefully if token_api.py is not running.

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TOKEN_API_HOST = process.env.TOKEN_API_HOST ?? '127.0.0.1:2701'

async function handleRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
): Promise<Response> {
  const { path } = await params
  const segments = path ?? []

  // SECURITY: reject path traversal attempts before proxying to localhost:2701
  if (segments.some((seg) => seg === '..' || seg === '.' || seg.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const targetPath = segments.join('/')

  // Forward query params
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()
  const targetUrl = `http://${TOKEN_API_HOST}/api/${targetPath}${query ? `?${query}` : ''}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  try {
    let body: BodyInit | undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.arrayBuffer()
    }

    let res: Response
    try {
      res = await fetch(targetUrl, {
        method: request.method,
        body,
        signal: controller.signal,
        // Don't forward host — target sets its own
        headers: { 'Content-Type': 'application/json' },
      })
    } finally {
      clearTimeout(timeoutId)
    }

    // Pass the response through with proxy metadata headers
    const responseHeaders = new Headers(res.headers)
    responseHeaders.set('X-Local-Status', 'ok')
    responseHeaders.set('X-Local-Proxy-Target', targetUrl)
    responseHeaders.set('X-Kingdom-Timestamp', String(Date.now()))
    // Strip hop-by-hop headers
    responseHeaders.delete('connection')
    responseHeaders.delete('keep-alive')
    responseHeaders.delete('transfer-encoding')

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    const isDown = err instanceof Error && (
      err.message.includes('fetch failed') ||
      err.message.includes('ECONNREFUSED') ||
      err.name === 'AbortError'
    )

    console.error('[api/local] proxy error:', err instanceof Error ? err.message : err, {
      targetUrl,
      method: request.method,
    })

    return NextResponse.json(
      {
        error: 'Kingdom API unavailable',
        message: isDown
          ? 'token_api.py is not running on localhost:2701 — start it with: python3 token_api.py'
          : err instanceof Error ? err.message : 'Unknown error',
        timestamp: Date.now(),
        targetUrl,
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Local-Status': 'unreachable',
          'X-Kingdom-Timestamp': String(Date.now()),
        },
      }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleRequest(request, params)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleRequest(request, params)
}
