/**
 * @file guestbook-db.ts
 *
 * Storage adapter for the guestbook.
 *
 * In production (Vercel): uses Vercel KV (Redis).
 *   Setup: Vercel dashboard → Storage → Create KV Database
 *   Vercel auto-injects KV_REST_API_URL + KV_REST_API_TOKEN into env.
 *
 * In local dev: falls back to data/guestbook.json.
 *
 * KV schema: Redis list at key "guestbook".
 *   lpush → newest entries at index 0.
 *   lrange 0 -1 → all entries, newest first.
 */

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

// ─── VERCEL KV ADAPTER ────────────────────────────────────────────────────────

const KV_KEY = 'guestbook'

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

async function kvFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${process.env.KV_REST_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

async function kvRead(): Promise<GuestbookEntry[]> {
  const res = await kvFetch(`/lrange/${KV_KEY}/0/-1`)
  if (!res.ok) throw new Error(`KV read failed: ${res.status}`)
  const { result } = await res.json() as { result: string[] }
  if (!Array.isArray(result)) return []
  return result.map((s) => JSON.parse(s) as GuestbookEntry)
}

async function kvInsert(entry: GuestbookEntry): Promise<void> {
  const res = await kvFetch(`/lpush/${KV_KEY}`, {
    method: 'POST',
    body: JSON.stringify([JSON.stringify(entry)]),
  })
  if (!res.ok) throw new Error(`KV insert failed: ${res.status}`)
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
  if (isKvConfigured()) return kvRead()
  return fsRead()
}

export async function insertEntry(entry: GuestbookEntry): Promise<void> {
  if (isKvConfigured()) return kvInsert(entry)
  return fsInsert(entry)
}
