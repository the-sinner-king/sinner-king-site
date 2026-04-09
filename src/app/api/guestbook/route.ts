/**
 * @file /api/guestbook
 *
 * GET  → returns all entries (newest first)
 * POST → validates + persists a new entry
 *
 * Storage: guestbook-db.ts adapter
 *   • Prod (Vercel): Supabase — set SUPABASE_URL + SUPABASE_ANON_KEY
 *   • Dev (local):   data/guestbook.json fallback
 *
 * Input sanitization: all fields are trimmed + length-capped server-side.
 * The API never trusts client-supplied length limits.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readEntries, insertEntry } from '@/lib/guestbook-db'
import type { GuestbookEntry } from '@/lib/guestbook-db'
import { getClientIP } from '@/lib/request-utils'

export const dynamic = 'force-dynamic'

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
// In-process per-IP limiter — 5 POSTs/hour per IP.
// Resets on Vercel cold start (acceptable for a guestbook).
// Sweep every 100 requests to prevent unbounded Map growth.

const _gbRateMap = new Map<string, { count: number; resetAt: number }>()
const GB_LIMIT    = 5
const GB_WINDOW   = 60 * 60 * 1000  // 1 hour
let   _gbReqCount = 0

function _gbCheckRate(ip: string): boolean {
  const now = Date.now()
  _gbReqCount++
  if (_gbReqCount % 100 === 0) {
    for (const [k, e] of _gbRateMap) {
      if (now > e.resetAt) _gbRateMap.delete(k)
    }
  }
  const entry = _gbRateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    _gbRateMap.set(ip, { count: 1, resetAt: now + GB_WINDOW })
    return true
  }
  if (entry.count >= GB_LIMIT) return false
  entry.count++
  return true
}

// ─── SANITIZE ─────────────────────────────────────────────────────────────────

/**
 * Sanitize plain-text guestbook input: remove angle brackets and trim.
 * Guestbook fields are plain text — no HTML formatting is expected or permitted.
 * Removing `<` and `>` eliminates tag injection at the source; client-side
 * escapeHtml() is a second layer of defense for rendering.
 */
function sanitize(value: unknown, maxLen: number): string {
  return String(value ?? '')
    .replace(/[<>]/g, '')   // no angle brackets in plain-text guestbook fields
    .trim()
    .slice(0, maxLen)
}

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const entries = await readEntries()
    return NextResponse.json(entries)
  } catch (err) {
    console.error('[guestbook] GET failed:', err)
    return NextResponse.json({ error: 'Failed to read entries' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Rate limit — 5 POSTs per IP per hour
  const ip = getClientIP(req)
  if (!_gbCheckRate(ip)) {
    return NextResponse.json(
      { error: 'Too many entries. Please wait before signing again.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const data     = body as Record<string, unknown>
  const name     = sanitize(data.name,     60)
  const location = sanitize(data.location, 60)
  const message  = sanitize(data.message,  200)

  if (!name || !message) {
    return NextResponse.json(
      { error: 'name and message are required' },
      { status: 400 }
    )
  }

  const entry: GuestbookEntry = {
    id:      crypto.randomUUID(),   // collision-free, non-enumerable
    name,
    message,
    date:    new Date().toISOString(),
    ...(location ? { location } : {}),
  }

  try {
    await insertEntry(entry)
    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error('[guestbook] POST failed:', err)
    return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
  }
}
