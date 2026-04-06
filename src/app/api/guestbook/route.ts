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

export const dynamic = 'force-dynamic'

// ─── SANITIZE ─────────────────────────────────────────────────────────────────

/** Strip HTML tags and trim. Never trust client-supplied strings directly. */
function sanitize(value: unknown, maxLen: number): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')   // strip any HTML tags
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
    id:      String(Date.now()),
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
