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
import { readdir, readFile } from 'fs/promises'
import path from 'path'

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
  // Auth gate — content queue includes unpublished drafts.
  // Require the same INGEST_SECRET used by the write endpoint.
  const secret = process.env.INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'INGEST_SECRET not configured' }, { status: 500 })
  }
  if (req.headers.get('x-ingest-secret') !== secret) {
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
