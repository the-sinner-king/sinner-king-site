/**
 * @file guestbook-db.ts
 *
 * Storage adapter for the guestbook.
 *
 * In production (Vercel): uses Vercel Blob.
 *   Setup: Vercel dashboard → Storage → Connect on any existing Blob store.
 *   Vercel auto-injects BLOB_READ_WRITE_TOKEN into env.
 *   Each entry stored as guestbook/<id>.json — no race conditions, no overwrite needed.
 *
 * In local dev: falls back to data/guestbook.json.
 */

import { put, list } from '@vercel/blob'
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface GuestbookEntry {
  id:        string
  name:      string
  location?: string
  message:   string
  date:      string
}

// ─── VERCEL BLOB ADAPTER ──────────────────────────────────────────────────────

function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

async function blobRead(): Promise<GuestbookEntry[]> {
  const { blobs } = await list({ prefix: 'guestbook/', token: process.env.BLOB_READ_WRITE_TOKEN })
  if (!blobs.length) return []
  const entries = await Promise.all(
    blobs.map(async (b) => {
      const res = await fetch(b.url, { cache: 'no-store' })
      return res.json() as Promise<GuestbookEntry>
    })
  )
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

async function blobInsert(entry: GuestbookEntry): Promise<void> {
  await put(`guestbook/${entry.id}.json`, JSON.stringify(entry), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
}

// ─── LOCAL FS FALLBACK (dev only) ─────────────────────────────────────────────

const DATA_PATH = join(process.cwd(), 'data', 'guestbook.json')

function fsRead(): GuestbookEntry[] {
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as GuestbookEntry[]
  } catch {
    return []
  }
}

let _fsWriteChain: Promise<void> = Promise.resolve()

function _fsInsertLocked(entry: GuestbookEntry): void {
  const dir = dirname(DATA_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const entries = fsRead()
  entries.unshift(entry)
  const tmpPath = `${DATA_PATH}.tmp`
  writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf-8')
  renameSync(tmpPath, DATA_PATH)
}

function fsInsert(entry: GuestbookEntry): Promise<void> {
  _fsWriteChain = _fsWriteChain.then(() => _fsInsertLocked(entry))
  return _fsWriteChain
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export async function readEntries(): Promise<GuestbookEntry[]> {
  if (isBlobConfigured()) return blobRead()
  return fsRead()
}

export async function insertEntry(entry: GuestbookEntry): Promise<void> {
  if (isBlobConfigured()) return blobInsert(entry)
  return fsInsert(entry)
}
