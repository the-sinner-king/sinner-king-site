/**
 * /api/admin/content
 *
 * Returns the content queue — published posts, queued posts, drafts.
 * Reads from /content/posts/*.json in the project root.
 *
 * GET /api/admin/content
 *   Returns: { posts: ContentPost[], counts: { published, queued, draft } }
 *
 * Posts are stored as individual JSON files in:
 *   /content/posts/{id}.json
 *
 * Each file: { id, title, slug, status, publishAt?, source, excerpt?, body, createdAt }
 *
 * The autoblog pushes via POST /api/admin/ingest (separate route, secret-gated).
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { getClientIP } from '@/lib/request-utils'

// ─── RATE LIMITING ─────────────────────────────────────────────────────────────

const _contentRateMap  = new Map<string, { count: number; resetAt: number }>()
const CONTENT_LIMIT    = 100
const CONTENT_WINDOW   = 60 * 60 * 1000
const CONTENT_SWEEP_MS = 5 * 60 * 1000
let   _contentLastSweep = 0

function _contentCheckRate(ip: string): boolean {
  const now = Date.now()
  if (now - _contentLastSweep > CONTENT_SWEEP_MS) {
    _contentLastSweep = now
    for (const [k, e] of _contentRateMap) {
      if (now > e.resetAt) _contentRateMap.delete(k)
    }
  }
  const entry = _contentRateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    _contentRateMap.set(ip, { count: 1, resetAt: now + CONTENT_WINDOW })
    return true
  }
  if (entry.count >= CONTENT_LIMIT) return false
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

export interface ContentPost {
  id:        string
  title:     string
  slug:      string
  status:    'published' | 'queued' | 'draft'
  publishAt?: string
  source:    'manual' | 'autoblog'
  excerpt?:  string
  body?:     string
  createdAt: string
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'posts')

async function loadPosts(): Promise<ContentPost[]> {
  try {
    const files = await readdir(CONTENT_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    const posts = await Promise.all(
      jsonFiles.map(async (f) => {
        try {
          const raw = await readFile(path.join(CONTENT_DIR, f), 'utf-8')
          return JSON.parse(raw) as ContentPost
        } catch {
          return null
        }
      })
    )

    return posts
      .filter((p): p is ContentPost => p !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch {
    // Content directory doesn't exist yet — return empty
    return []
  }
}

export async function GET(req: NextRequest) {
  // Rate limit
  const ip = getClientIP(req)
  if (!_contentCheckRate(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // Auth gate — content queue includes unpublished drafts.
  const secret = process.env.INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'INGEST_SECRET not configured' }, { status: 500 })
  }
  const provided = req.headers.get('x-ingest-secret') ?? ''
  if (!safeCompare(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const posts  = await loadPosts()
  const counts = {
    published: posts.filter(p => p.status === 'published').length,
    queued:    posts.filter(p => p.status === 'queued').length,
    draft:     posts.filter(p => p.status === 'draft').length,
  }

  return NextResponse.json({ posts, counts }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
