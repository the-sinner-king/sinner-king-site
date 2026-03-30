/**
 * request-utils.ts
 *
 * Shared request utilities for API routes.
 */

import type { NextRequest } from 'next/server'

/**
 * Extract the real client IP from a NextRequest.
 *
 * A4 fix — trust model documented explicitly:
 *
 * ON VERCEL (process.env.VERCEL is set by Vercel's runtime):
 *   x-forwarded-for is set and sanitized by Vercel's edge infrastructure.
 *   The first IP in the chain is the real client IP and cannot be spoofed
 *   from the public internet — Vercel strips and re-appends this at the edge.
 *   We trust x-forwarded-for here.
 *
 * IN DEVELOPMENT / NON-VERCEL DEPLOYMENTS:
 *   There is no trusted proxy sanitizing x-forwarded-for. Any client can send
 *   X-Forwarded-For: 1.2.3.4 to impersonate any IP. We fall back to x-real-ip
 *   (set by nginx/reverse-proxies) or 127.0.0.1.
 *   If you deploy this behind a different trusted proxy, set TRUSTED_PROXY=true
 *   in that environment's env vars to opt in to x-forwarded-for trust.
 *
 * This means all IP-based security (Throne Room one-question limit, rate limiting)
 * is correctly enforced on Vercel, and best-effort in other environments.
 *
 * TODO v2: replace IP-based enforcement with a persistent token (cookie/localStorage)
 * for environments without a trusted proxy.
 */
export function getClientIP(request: NextRequest): string {
  const isVercel = !!process.env.VERCEL
  const isTrustedProxy = !!process.env.TRUSTED_PROXY

  if (isVercel || isTrustedProxy) {
    // Trusted proxy — x-forwarded-for first entry is the real client IP
    const xff = request.headers.get('x-forwarded-for')
    if (xff) return xff.split(',')[0].trim()
  }

  // Untrusted environment — x-real-ip is harder to spoof than x-forwarded-for
  // (requires writing the actual header at the proxy, not injecting a custom one)
  const xri = request.headers.get('x-real-ip')
  if (xri) return xri.trim()

  // Local dev — all requests are from localhost
  return '127.0.0.1'
}
