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
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

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
  // Auth
  const secret = process.env.INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'INGEST_SECRET not configured' }, { status: 500 })
  }
  if (req.headers.get('x-ingest-secret') !== secret) {
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
