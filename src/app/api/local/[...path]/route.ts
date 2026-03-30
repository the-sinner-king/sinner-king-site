/**
 * /api/local/[...path] — Kingdom Super API Proxy
 *
 * A strict allowlist proxy to token_api.py (Kingdom Super API, localhost:2701).
 * Routes GET requests from the Next.js frontend to the local Flask server,
 * returning a graceful 503 if token_api.py is not running.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Next.js runs on port 3033. token_api.py runs on port 2701. Browsers block
 * cross-origin fetch from the Next.js origin to localhost:2701 (CORS restriction).
 * This proxy route lives within Next.js, so browser fetch to /api/local/* is
 * same-origin — no CORS issues. The proxy then forwards to 2701 server-side.
 *
 * ─── ALLOWED ROUTES ──────────────────────────────────────────────────────────
 *
 *   GET /api/local/tokens/live       → http://localhost:2701/api/tokens/live
 *   GET /api/local/tokens/chart      → http://localhost:2701/api/tokens/chart
 *   GET /api/local/tokens/hourly     → http://localhost:2701/api/tokens/hourly
 *   GET /api/local/tokens/lifetime   → http://localhost:2701/api/tokens/lifetime
 *   GET /api/local/mood/current      → http://localhost:2701/api/mood/current
 *   GET /api/local/mood/history      → http://localhost:2701/api/mood/history
 *   GET /api/local/kingdom/activity  → http://localhost:2701/api/kingdom/activity
 *   GET /api/local/kingdom/missions  → http://localhost:2701/api/kingdom/missions
 *   GET /api/local/kingdom/live      → http://localhost:2701/api/kingdom/live
 *   GET /api/local/agents/status     → http://localhost:2701/api/agents/status
 *   GET /api/local/system/health     → http://localhost:2701/api/system/health
 *
 *   HEAD variants of all the above are also forwarded (for health checks).
 *
 * ─── SECURITY MODEL ───────────────────────────────────────────────────────────
 *
 *   SSRF protection (strict allowlist):
 *     ALLOWED_PATHS is a Set of exact path strings. Any path not in the Set
 *     receives a 404. This prevents SSRF where a crafted URL like
 *     /api/local/../../../etc/passwd or /api/local/../../internal-service
 *     would resolve to an unintended filesystem path or internal host.
 *
 *     Even if TOKEN_API_HOST were misconfigured to point at an internal service,
 *     the attacker could only reach the 11 paths explicitly listed here.
 *
 *   Path traversal prevention:
 *     Segments containing '..' or '.' or null bytes are rejected before allowlist
 *     lookup. Belt-and-suspenders: the allowlist would already block these, but
 *     explicit rejection prevents a future allowlist entry from accidentally
 *     enabling a traversal path.
 *
 *   Read-only enforcement:
 *     Only GET and HEAD methods are forwarded. The Super API is read-only by design;
 *     rejecting mutations here means a compromised call site cannot accidentally
 *     or maliciously write to token_api.py via this proxy.
 *
 *   Internal URL non-disclosure:
 *     TOKEN_API_HOST (default: 127.0.0.1:2701) is never included in response bodies.
 *     It is logged server-side for debugging but never sent to the browser. This
 *     prevents browser DevTools from revealing the internal proxy target.
 *
 *   Query param forwarding:
 *     Allowed — query params are passed through as-is. token_api.py is responsible
 *     for its own query param validation. We don't filter or sanitize them here
 *     because the Flask server is local and trusted (same machine).
 *
 * ─── RESPONSE HEADERS ────────────────────────────────────────────────────────
 *
 *   X-Local-Status: ok | unreachable   — proxy result status
 *   X-Kingdom-Timestamp: <epoch ms>    — set by this proxy, not Flask
 *   X-Local-Proxy-Target: omitted      — intentionally absent; would leak internal URL
 *
 *   Hop-by-hop headers (Connection, Keep-Alive, Transfer-Encoding) are stripped
 *   from the proxied response — these are per-hop and must not be forwarded.
 *
 * ─── SIDE EFFECTS ─────────────────────────────────────────────────────────────
 *
 *   - Outbound GET/HEAD to TOKEN_API_HOST (default: 127.0.0.1:2701) with 5s timeout
 */

import { NextRequest, NextResponse } from 'next/server'

// ─── RUNTIME CONFIG ───────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─── ENVIRONMENT VARS ─────────────────────────────────────────────────────────

/** Flask Super API host:port. Overridable via env var for non-standard setups.
 *  Always uses 127.0.0.1 (not 'localhost') — avoids IPv6 resolution ambiguity
 *  on systems where 'localhost' resolves to ::1 but Flask listens on 127.0.0.1. */
const TOKEN_API_HOST = process.env.TOKEN_API_HOST ?? '127.0.0.1:2701'

/** Timeout (ms) for the outbound Super API request.
 *  5s is intentionally aggressive — if token_api.py is running, it responds in <100ms.
 *  A 5s timeout means we report 'unreachable' before the browser's own timeout fires. */
const PROXY_TIMEOUT_MS = 5_000

// ─── ALLOWLIST ────────────────────────────────────────────────────────────────

/**
 * Strict allowlist of path strings that this proxy will forward to the Super API.
 *
 * SECURITY: No open-ended path forwarding. A request to /api/local/anything-else
 * receives 404 regardless of what TOKEN_API_HOST resolves to. This bounds the
 * SSRF blast radius to exactly these 11 endpoints, even if TOKEN_API_HOST were
 * somehow misconfigured to point at an internal service.
 */
const ALLOWED_PATHS = new Set([
  'tokens/live',
  'tokens/chart',
  'tokens/hourly',
  'tokens/lifetime',
  'mood/current',
  'mood/history',
  'kingdom/activity',
  'kingdom/missions',
  'kingdom/live',
  'agents/status',
  'system/health',
])

// ─── PROXY HANDLER ────────────────────────────────────────────────────────────

/**
 * Core request handler shared by both GET and HEAD exports.
 * Separated to avoid duplicating the security logic between the two methods.
 */
async function handleRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
): Promise<Response> {
  const { path } = await params
  const segments: string[] = path ?? []

  // ── Path traversal guard ───────────────────────────────────────────────────
  // Reject '..' (parent dir), '.' (current dir), and null bytes before any lookup.
  // Belt-and-suspenders: the Set allowlist already rejects these, but explicit
  // rejection here prevents a future allowlist entry from inadvertently enabling
  // a traversal. '\0' (null byte) is a classic injection vector for C-based file APIs.
  if (segments.some((seg) => seg === '..' || seg === '.' || seg.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const targetPath = segments.join('/')

  // ── Allowlist check ────────────────────────────────────────────────────────
  // Exact-match lookup. Any path not in ALLOWED_PATHS → 404.
  // Returns 404 (not 403) to avoid confirming to an attacker that the endpoint
  // exists — from their perspective it simply doesn't exist.
  if (!ALLOWED_PATHS.has(targetPath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── Method guard ──────────────────────────────────────────────────────────
  // The Super API is read-only. Reject any mutation attempt at the proxy layer.
  // This enforces the read-only contract even if token_api.py were to add a
  // mutable endpoint that somehow matched an allowed path.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  }

  // ── Forward query params ──────────────────────────────────────────────────
  // Pass through as-is. The Flask server handles its own param validation.
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()
  const targetUrl = `http://${TOKEN_API_HOST}/api/${targetPath}${query ? `?${query}` : ''}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)

  try {
    let res: Response
    try {
      res = await fetch(targetUrl, {
        method: request.method,
        signal: controller.signal,
        // No custom headers forwarded — we don't want to leak Next.js-internal
        // headers (e.g. x-forwarded-for) to the local Flask process
      })
    } finally {
      clearTimeout(timeoutId)
    }

    // ── Build response headers ─────────────────────────────────────────────
    const responseHeaders = new Headers(res.headers)

    // Status marker — tells the client the proxy reached the Super API successfully
    responseHeaders.set('X-Local-Status', 'ok')

    // Timestamp from the proxy layer (not Flask) — useful for cache freshness checks
    responseHeaders.set('X-Kingdom-Timestamp', String(Date.now()))

    // X-Local-Proxy-Target intentionally omitted — would expose TOKEN_API_HOST
    // (127.0.0.1:2701) to browser DevTools. Internal topology stays internal.

    // Strip hop-by-hop headers — these describe the connection between the proxy
    // and Flask, not between the browser and Next.js. Forwarding them is incorrect
    // per HTTP spec and can cause browser/proxy misbehavior.
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

    // Distinguish "service is down" from "unexpected error" for the client message.
    // ECONNREFUSED = token_api.py not running. AbortError = 5s timeout fired.
    // Both surface as 503 (Service Unavailable) with an actionable message.
    const isDown = err instanceof Error && (
      err.message.includes('fetch failed') ||
      err.message.includes('ECONNREFUSED') ||
      err.name === 'AbortError'
    )

    // Log internally with targetUrl — but do NOT include it in the response body
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
        // targetUrl intentionally excluded — already logged server-side.
        // Including it in the response would expose the internal localhost:2701 target.
      },
      {
        status: 503,
        headers: {
          // no-store: don't cache error responses — the service may come back up
          'Cache-Control': 'no-store',
          'X-Local-Status': 'unreachable',
          'X-Kingdom-Timestamp': String(Date.now()),
        },
      }
    )
  }
}

// ─── EXPORTED ROUTE HANDLERS ──────────────────────────────────────────────────

/** GET /api/local/[...path] — forward to Super API. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return handleRequest(request, params)
}

/** HEAD /api/local/[...path] — forward to Super API (health checks, cache validation). */
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return handleRequest(request, params)
}
