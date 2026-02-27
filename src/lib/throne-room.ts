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

import { readFile, writeFile, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'

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
  // IMPORTANT: Set THRONE_ROOM_SALT in production or IPs are trivially rainbow-tableable
  return process.env.THRONE_ROOM_SALT ?? 'sinner-kingdom-default-salt-change-me'
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
  const ledgerPath = getLedgerPath()
  const dir = path.dirname(ledgerPath)
  await mkdir(dir, { recursive: true })
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2), 'utf-8')
}

// --- Public API ---

/**
 * Check if an IP has already used their Throne Room question.
 */
export async function hasThroneAccess(ip: string): Promise<boolean> {
  if (!isBanEnabled()) return true

  const ledger = await readLedger()
  const hash = hashIP(ip)
  return !ledger.entries.some((e) => e.hash === hash)
}

/**
 * Get the Throne Room entry for an IP, if it exists.
 * Returns null if the IP has never visited.
 */
export async function getThroneEntry(ip: string): Promise<ThroneEntry | null> {
  const ledger = await readLedger()
  const hash = hashIP(ip)
  return ledger.entries.find((e) => e.hash === hash) ?? null
}

/**
 * Record that an IP has used their Throne Room question.
 * Call this AFTER the response has been sent successfully.
 */
export async function recordThroneQuestion(ip: string, question: string): Promise<void> {
  if (!isBanEnabled()) return

  const ledger = await readLedger()
  const hash = hashIP(ip)

  // Idempotent — don't double-record
  if (ledger.entries.some((e) => e.hash === hash)) return

  ledger.entries.push({
    hash,
    timestamp: Date.now(),
    questionLength: question.length,
  })

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
  const ledger = await readLedger()
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  const today = ledger.entries.filter((e) => now - e.timestamp < dayMs)
  const avgLength =
    ledger.entries.length > 0
      ? ledger.entries.reduce((sum, e) => sum + e.questionLength, 0) / ledger.entries.length
      : 0

  return {
    totalQuestions: ledger.entries.length,
    questionsToday: today.length,
    averageQuestionLength: Math.round(avgLength),
  }
}
