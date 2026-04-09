/**
 * @file guestbook-db.ts
 *
 * Storage adapter for the guestbook.
 *
 * In production (Vercel): uses Supabase REST API — set SUPABASE_URL + SUPABASE_ANON_KEY.
 * In local dev: falls back to data/guestbook.json (Vercel filesystem is ephemeral).
 *
 * Table schema (run once in Supabase SQL editor):
 *
 *   CREATE TABLE guestbook (
 *     id       TEXT        PRIMARY KEY,
 *     name     TEXT        NOT NULL,
 *     location TEXT,
 *     message  TEXT        NOT NULL,
 *     date     TIMESTAMPTZ NOT NULL
 *   );
 *   ALTER TABLE guestbook ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "public_read"   ON guestbook FOR SELECT USING (true);
 *   CREATE POLICY "public_insert" ON guestbook FOR INSERT WITH CHECK (true);
 *
 * Migration from JSON: run once after table creation —
 *   cat data/guestbook.json | (paste into Supabase → Table Editor → Import)
 *   or use the Supabase CLI: supabase db push
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

// ─── SUPABASE ADAPTER ─────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

function supabaseHeaders(): Record<string, string> {
  return {
    apikey:          SUPABASE_ANON_KEY!,
    Authorization:   `Bearer ${SUPABASE_ANON_KEY!}`,
    'Content-Type':  'application/json',
  }
}

async function supabaseRead(): Promise<GuestbookEntry[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/guestbook?order=date.desc`,
    { headers: supabaseHeaders(), cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`)
  const rows = await res.json() as Record<string, unknown>[]
  return rows.map((r) => ({
    id:       String(r.id),
    name:     String(r.name),
    message:  String(r.message),
    date:     String(r.date),
    ...(r.location != null ? { location: String(r.location) } : {}),
  }))
}

async function supabaseInsert(entry: GuestbookEntry): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/guestbook`,
    {
      method:  'POST',
      headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
      body:    JSON.stringify(entry),
    }
  )
  if (!res.ok) throw new Error(`Supabase insert failed: ${res.status}`)
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

// Serialize FS writes to prevent concurrent requests from racing (dev-only).
// Prod uses Supabase which handles concurrency at the DB level.
let _fsWriteChain: Promise<void> = Promise.resolve()

function _fsInsertLocked(entry: GuestbookEntry): void {
  const dir = dirname(DATA_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const entries = fsRead()
  entries.unshift(entry)
  // Atomic write: write to .tmp first, then rename — prevents truncated JSON on crash
  const tmpPath = `${DATA_PATH}.tmp`
  writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf-8')
  renameSync(tmpPath, DATA_PATH)
}

function fsInsert(entry: GuestbookEntry): Promise<void> {
  _fsWriteChain = _fsWriteChain.then(() => _fsInsertLocked(entry))
  return _fsWriteChain
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Returns all guestbook entries, newest first.
 * Uses Supabase in prod, local FS in dev.
 */
export async function readEntries(): Promise<GuestbookEntry[]> {
  if (isSupabaseConfigured()) return supabaseRead()
  return fsRead()
}

/**
 * Persists a single new entry.
 * Uses Supabase in prod, local FS in dev.
 */
export async function insertEntry(entry: GuestbookEntry): Promise<void> {
  if (isSupabaseConfigured()) return supabaseInsert(entry)
  return fsInsert(entry)
}
