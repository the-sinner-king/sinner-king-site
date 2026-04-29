/**
 * /api/admin/ingest — Autoblog post ingestion endpoint
 *
 * Secret-key gated. The autoblog system posts here to queue new content.
 * Posts land in /content/posts/{id}.json with status: "queued".
 *
 * POST /api/admin/ingest
 *   Header: x-ingest-secret: <INGEST_SECRET env var>
 *   Body: {
 *     title:     string
 *     slug:      string
 *     body:      string
 *     excerpt?:  string
 *     publishAt?: string  // ISO date — if set, posts at this time; if omitted, queued for manual review
 *     source?:   "autoblog" | "manual"  // defaults to "autoblog"
 *   }
 *
 *   Returns: { ok: true, id: string }
 *
 * Set INGEST_SECRET in .env.local and Vercel env vars.
 * If INGEST_SECRET is unset, all requests are rejected (fail-safe).
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { getClientIP } from '@/lib/request-utils'

// ─── RATE LIMITING ─────────────────────────────────────────────────────────────
// Defense-in-depth: even secret-gated admin endpoints get rate limiting.
// An attacker who leaks the secret can't flood this endpoint at arbitrary rate.

const _ingestRateMap = new Map<string, { count: number; resetAt: number }>()
const INGEST_LIMIT    = 100
const INGEST_WINDOW   = 60 * 60 * 1000  // 1 hour
const INGEST_SWEEP_MS = 5 * 60 * 1000   // sweep expired entries every 5 minutes
let   _ingestLastSweep = 0

function _ingestCheckRate(ip: string): boolean {
  const now = Date.now()
  if (now - _ingestLastSweep > INGEST_SWEEP_MS) {
    _ingestLastSweep = now
    for (const [k, e] of _ingestRateMap) {
      if (now > e.resetAt) _ingestRateMap.delete(k)
    }
  }
  const entry = _ingestRateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    _ingestRateMap.set(ip, { count: 1, resetAt: now + INGEST_WINDOW })
    return true
  }
  if (entry.count >= INGEST_LIMIT) return false
  entry.count++
  return true
}

// ─── SECRET COMPARISON ─────────────────────────────────────────────────────────

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

// ─── TYPES + CONSTANTS ─────────────────────────────────────────────────────────

interface IngestBody {
  title:     string
  slug:      string
  body:      string
  excerpt?:  string
  publishAt?: string
  source?:   'autoblog' | 'manual'
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'posts')

export async function POST(req: NextRequest) {
  // Rate limit
  const ip = getClientIP(req)
  if (!_ingestCheckRate(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // Auth — timingSafeEqual prevents timing oracle on the secret
  const secret = process.env.INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'INGEST_SECRET not configured' }, { status: 500 })
  }
  const provided = req.headers.get('x-ingest-secret') ?? ''
  if (!safeCompare(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
  let body: IngestBody
  try {
    body = await req.json() as IngestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, slug, body: postBody, excerpt, publishAt, source = 'autoblog' } = body
  if (!title || !slug || !postBody) {
    return NextResponse.json({ error: 'Missing required fields: title, slug, body' }, { status: 400 })
  }

  const id        = `${Date.now()}-${slug.slice(0, 30).replace(/[^a-z0-9-]/g, '-')}`
  const createdAt = new Date().toISOString()
  const status    = publishAt ? 'queued' : 'queued'  // all ingest lands as queued — Brandon approves

  const post = { id, title, slug, status, publishAt, source, excerpt, body: postBody, createdAt }

  // Write to content dir — only works in dev (local filesystem).
  // On Vercel the filesystem is read-only; persistent storage (Vercel Blob/KV)
  // must be wired before this endpoint is usable in production.
  if (process.env.VERCEL) {
    console.error('[ingest] Cannot write post on Vercel — persistent storage not configured. Set up Vercel Blob or KV.')
    return NextResponse.json(
      { error: 'Content storage not configured for production. Wire Vercel Blob or KV first.' },
      { status: 501 }
    )
  }

  try {
    await mkdir(CONTENT_DIR, { recursive: true })
    await writeFile(path.join(CONTENT_DIR, `${id}.json`), JSON.stringify(post, null, 2), 'utf-8')
  } catch (err) {
    console.error('[ingest] write error:', err)
    return NextResponse.json({ error: 'Failed to write post' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id, status })
}
