/**
 * throne-room.ts
 *
 * The Throne Room: one question per IP, for life.
 *
 * Æris's Throne Room operates on scarcity. You get ONE question. When you
 * use it, you're done. You can visit the page as many times as you want and
 * read what you asked before. But you cannot ask again.
 *
 * This creates gravitas. People don't burn their one question on "what's 2+2."
 * They sit with it. They think. Then they ask something real.
 *
 * Implementation:
 *   - IP addresses are hashed (not stored raw) in a JSON ledger
 *   - Ledger is stored at THRONE_ROOM_LEDGER_PATH (default: /var/the-tower/throne-ledger.json)
 *   - Each entry: { hash: string, timestamp: number, questionLength: number }
 *   - We do NOT store the question itself (privacy)
 *   - THRONE_ROOM_IP_BAN_ENABLED=false to disable (for development)
 *
 * Security notes:
 *   - IP hashing is SHA-256 with a server-side salt (THRONE_ROOM_SALT env var)
 *   - Without the salt, hashes cannot be reversed to IPs
 *   - This is not Fort Knox but it's honest
 */

import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'

// ─── SUPABASE PERSISTENCE ─────────────────────────────────────────────────────
//
// On Vercel, the filesystem is read-only — writeLedger() silently no-ops, breaking
// the one-question-per-IP mechanic entirely. When SUPABASE_URL + SUPABASE_ANON_KEY
// are set, this module uses Supabase as the ledger store instead of the JSON file.
//
// Run once in Supabase SQL editor to create the table:
//
//   CREATE TABLE throne_ledger (
//     hash            TEXT    PRIMARY KEY,
//     timestamp       BIGINT  NOT NULL,
//     question_length INTEGER NOT NULL
//   );
//   ALTER TABLE throne_ledger ENABLE ROW LEVEL SECURITY;
//   -- Hashes are SHA-256(salt+ip) — useless without the server-side salt.
//   -- Public read is safe; public insert is required for the API route.
//   CREATE POLICY "public_read"   ON throne_ledger FOR SELECT USING (true);
//   CREATE POLICY "public_insert" ON throne_ledger FOR INSERT WITH CHECK (true);
//
// ─────────────────────────────────────────────────────────────────────────────

const _SB_URL = process.env.SUPABASE_URL
const _SB_KEY = process.env.SUPABASE_ANON_KEY

function _sbConfigured(): boolean {
  return Boolean(_SB_URL && _SB_KEY)
}

function _sbHeaders(): Record<string, string> {
  return {
    apikey:         _SB_KEY!,
    Authorization:  `Bearer ${_SB_KEY!}`,
    'Content-Type': 'application/json',
  }
}

async function _sbHasEntry(hash: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${_SB_URL}/rest/v1/throne_ledger?hash=eq.${encodeURIComponent(hash)}&select=hash`,
      { headers: _sbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return false
    const rows = await res.json() as unknown[]
    return rows.length > 0
  } catch {
    return false
  }
}

async function _sbGetEntry(hash: string): Promise<ThroneEntry | null> {
  try {
    const res = await fetch(
      `${_SB_URL}/rest/v1/throne_ledger?hash=eq.${encodeURIComponent(hash)}`,
      { headers: _sbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return null
    const rows = await res.json() as Array<{ hash: string; timestamp: number; question_length: number }>
    if (!rows.length) return null
    return { hash: rows[0].hash, timestamp: rows[0].timestamp, questionLength: rows[0].question_length }
  } catch {
    return null
  }
}

async function _sbInsertEntry(entry: ThroneEntry): Promise<void> {
  const res = await fetch(
    `${_SB_URL}/rest/v1/throne_ledger`,
    {
      method:  'POST',
      headers: { ..._sbHeaders(), Prefer: 'return=minimal' },
      body:    JSON.stringify({
        hash:            entry.hash,
        timestamp:       entry.timestamp,
        question_length: entry.questionLength,
      }),
    }
  )
  if (!res.ok) throw new Error(`Supabase throne_ledger insert failed: ${res.status}`)
}

async function _sbGetStats(): Promise<{ total: number; today: number; totalLength: number }> {
  try {
    const res = await fetch(
      `${_SB_URL}/rest/v1/throne_ledger?select=timestamp,question_length`,
      { headers: _sbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return { total: 0, today: 0, totalLength: 0 }
    const rows = await res.json() as Array<{ timestamp: number; question_length: number }>
    const now   = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    return {
      total:       rows.length,
      today:       rows.filter((r) => now - r.timestamp < dayMs).length,
      totalLength: rows.reduce((sum, r) => sum + r.question_length, 0),
    }
  } catch {
    return { total: 0, today: 0, totalLength: 0 }
  }
}

// --- Types ---

export interface ThroneEntry {
  hash: string              // SHA-256(salt + ip)
  timestamp: number         // Unix ms — when they asked
  questionLength: number    // Length in characters (not the question itself)
}

interface ThroneLedger {
  version: string
  entries: ThroneEntry[]
}

// --- Config ---

function getLedgerPath(): string {
  return process.env.THRONE_ROOM_LEDGER_PATH
    ?? path.join(process.cwd(), '..', 'SCRYER_FEEDS', 'throne-ledger.json')
}

function isBanEnabled(): boolean {
  return process.env.THRONE_ROOM_IP_BAN_ENABLED !== 'false'
}

function getSalt(): string {
  const salt = process.env.THRONE_ROOM_SALT
  if (!salt) {
    // A3 fix: default salt is a public string (checked into source). In production,
    // any attacker can precompute SHA-256(default_salt + ipv4) for all ~4B IPv4s in hours.
    // Log a warning so this surfaces in Vercel logs before go-live.
    if (process.env.NODE_ENV === 'production') {
      console.warn('[throne-room] THRONE_ROOM_SALT is not set — IP hashes use public default salt. Set this env var before launch.')
    }
    return 'sinner-kingdom-default-salt-change-me'
  }
  return salt
}

// --- IP hashing ---

function hashIP(ip: string): string {
  return createHash('sha256')
    .update(getSalt() + ip)
    .digest('hex')
    .slice(0, 32) // First 32 chars is enough for uniqueness
}

// --- Ledger I/O ---

async function readLedger(): Promise<ThroneLedger> {
  try {
    const raw = await readFile(getLedgerPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.entries)) {
      return parsed as ThroneLedger
    }
    return { version: '1.0', entries: [] }
  } catch {
    return { version: '1.0', entries: [] }
  }
}

async function writeLedger(ledger: ThroneLedger): Promise<void> {
  // FLAG #1 fix: Vercel serverless has a read-only filesystem — writes silently no-op.
  // Set THRONE_ROOM_LEDGER_PATH to a writable KV-backed path in production,
  // or use THRONE_ROOM_IP_BAN_ENABLED=false until persistent storage is wired.
  // In dev, this writes normally. On Vercel (no THRONE_ROOM_LEDGER_PATH), the
  // env default resolves to a path that doesn't exist — mkdir will throw, caught here.
  try {
    const ledgerPath = getLedgerPath()
    const dir = path.dirname(ledgerPath)
    await mkdir(dir, { recursive: true })
    // Atomic write: temp file + rename prevents truncated JSON on SIGKILL mid-write
    const tmpPath = `${ledgerPath}.tmp`
    await writeFile(tmpPath, JSON.stringify(ledger, null, 2), 'utf-8')
    await rename(tmpPath, ledgerPath)
  } catch (err) {
    // On Vercel (read-only FS), this is expected. Log once for visibility.
    if (process.env.THRONE_ROOM_LEDGER_VERBOSE === 'true') {
      console.warn('[throne-room] writeLedger failed (read-only FS or missing path):', err)
    }
  }
}

// --- Public API ---

/**
 * Check if an IP has already used their Throne Room question.
 */
export async function hasThroneAccess(ip: string): Promise<boolean> {
  if (!isBanEnabled()) return true
  const hash = hashIP(ip)
  // Use Supabase when configured — persists across Vercel cold starts.
  // File ledger is Vercel-incompatible (read-only FS) so the mechanic only
  // works correctly when Supabase is wired.
  if (_sbConfigured()) return !(await _sbHasEntry(hash))
  const ledger = await readLedger()
  return !ledger.entries.some((e) => e.hash === hash)
}

/**
 * Get the Throne Room entry for an IP, if it exists.
 * Returns null if the IP has never visited.
 */
export async function getThroneEntry(ip: string): Promise<ThroneEntry | null> {
  const hash = hashIP(ip)
  if (_sbConfigured()) return _sbGetEntry(hash)
  const ledger = await readLedger()
  return ledger.entries.find((e) => e.hash === hash) ?? null
}

/**
 * Record that an IP has used their Throne Room question.
 * Call this AFTER the response has been sent successfully.
 */
export async function recordThroneQuestion(ip: string, question: string): Promise<void> {
  if (!isBanEnabled()) return
  const hash = hashIP(ip)

  if (_sbConfigured()) {
    // Idempotent — Supabase will reject on PK conflict; _sbInsertEntry throws on failure.
    const already = await _sbHasEntry(hash)
    if (already) return
    await _sbInsertEntry({ hash, timestamp: Date.now(), questionLength: question.length })
    return
  }

  const ledger = await readLedger()
  // Idempotent — don't double-record
  if (ledger.entries.some((e) => e.hash === hash)) return
  ledger.entries.push({ hash, timestamp: Date.now(), questionLength: question.length })
  await writeLedger(ledger)
}

/**
 * Returns stats about the Throne Room (for display on the page).
 * Does not expose any individual data.
 */
export async function getThroneStats(): Promise<{
  totalQuestions: number
  questionsToday: number
  averageQuestionLength: number
}> {
  if (_sbConfigured()) {
    const { total, today, totalLength } = await _sbGetStats()
    return {
      totalQuestions:        total,
      questionsToday:        today,
      averageQuestionLength: total > 0 ? Math.round(totalLength / total) : 0,
    }
  }

  const ledger = await readLedger()
  const now    = Date.now()
  const dayMs  = 24 * 60 * 60 * 1000
  const today  = ledger.entries.filter((e) => now - e.timestamp < dayMs)
  const avgLength =
    ledger.entries.length > 0
      ? ledger.entries.reduce((sum, e) => sum + e.questionLength, 0) / ledger.entries.length
      : 0

  return {
    totalQuestions:        ledger.entries.length,
    questionsToday:        today.length,
    averageQuestionLength: Math.round(avgLength),
  }
}
