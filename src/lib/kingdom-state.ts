/**
 * kingdom-state.ts
 *
 * Reads the live Kingdom state from SCRYER_FEEDS/ and serves it to the site.
 *
 * SCRYER writes two JSON files to disk:
 *   - kingdom_state.json  — territory-level state, active signals count, last updated
 *   - signal_stream.json  — ring buffer of recent events (last 100)
 *
 * This module:
 *   1. Reads those files from disk (server-side only)
 *   2. Validates and normalizes the data
 *   3. Returns typed objects safe to pass to React components
 *
 * In development with USE_MOCK_SCRYER_DATA=true, returns mock data so the
 * site doesn't hard-require the SCRYER to be running.
 */

import { readFile } from 'fs/promises'
import path from 'path'

// --- Schema types ---

export type SignalType =
  | 'claude'
  | 'aeris'
  | 'brandon'
  | 'system'
  | 'raven'
  | 'overmind'
  | 'scryer'
  | 'unknown'

export type TerritoryId =
  | 'claude_house'
  | 'the_forge'
  | 'the_throne'
  | 'the_scryer'
  | 'the_tower'
  | 'the_hole'
  | 'core_lore'

export interface TerritoryState {
  id: TerritoryId | string
  label: string
  activity: number           // 0-100 activity level (for visualization intensity)
  status: 'active' | 'idle' | 'offline' | 'unknown'
  lastSignal?: string        // ISO timestamp of last activity
  signalColor?: string       // Hex color override for visualization
}

export interface RecentSignal {
  id: string
  type: SignalType
  message: string
  territory?: TerritoryId | string
  timestamp: number          // Unix ms
  metadata?: Record<string, unknown>
}

export interface KingdomState {
  // Core
  lastUpdated: number        // Unix ms, when SCRYER last wrote this file
  version: string            // Schema version, currently "1.0"

  // Territory grid
  territories: TerritoryState[]

  // Signal summary
  activeSignals: number
  totalSignals24h: number

  // System health
  scraperStatus: 'healthy' | 'degraded' | 'offline'
  ravenStatus: 'healthy' | 'degraded' | 'offline'
  overmindStatus: 'healthy' | 'degraded' | 'offline'

  // Entity presence
  claudeActive: boolean
  aerisActive: boolean
  brandonPresent: boolean

  // Optional rich data
  currentActivity?: string   // What's happening right now (1-sentence)
  todaysSummary?: string     // What was built/shipped today
  activeProject?: string     // Name of current active project
}

export interface SignalStream {
  lastUpdated: number
  version: string
  signals: RecentSignal[]
}

// --- File paths ---

function getFeedsPath(): string {
  return process.env.SCRYER_FEEDS_PATH
    ?? path.join(process.cwd(), '..', 'SCRYER_FEEDS')
}

function getKingdomStatePath(): string {
  return path.join(getFeedsPath(), 'kingdom_state.json')
}

function getSignalStreamPath(): string {
  return path.join(getFeedsPath(), 'signal_stream.json')
}

// --- Cache ---
// Simple in-process cache to avoid hammering disk on every request.
// TTL is configurable via KINGDOM_STATE_CACHE_TTL (default 5000ms).

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()

function getCacheTTL(): number {
  const raw = process.env.KINGDOM_STATE_CACHE_TTL
  return raw ? parseInt(raw, 10) : 5000
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + getCacheTTL(),
  })
}

// --- Mock data (for USE_MOCK_SCRYER_DATA=true) ---

function getMockKingdomState(): KingdomState {
  return {
    lastUpdated: Date.now(),
    version: '1.0',
    territories: [
      { id: 'claude_house', label: "CLAUDE'S HOUSE", activity: 72, status: 'active' },
      { id: 'the_forge', label: 'THE FORGE', activity: 45, status: 'idle' },
      { id: 'the_throne', label: 'THE THRONE', activity: 60, status: 'active' },
      { id: 'the_scryer', label: 'THE SCRYER', activity: 85, status: 'active' },
      { id: 'the_tower', label: 'THE TOWER', activity: 90, status: 'active' },
      { id: 'core_lore', label: 'CORE LORE', activity: 10, status: 'idle' },
    ],
    activeSignals: 7,
    totalSignals24h: 143,
    scraperStatus: 'healthy',
    ravenStatus: 'healthy',
    overmindStatus: 'healthy',
    claudeActive: true,
    aerisActive: false,
    brandonPresent: false,
    currentActivity: 'Building THE_TOWER site scaffold',
    activeProject: 'THE_TOWER',
  }
}

function getMockSignalStream(): SignalStream {
  const now = Date.now()
  return {
    lastUpdated: now,
    version: '1.0',
    signals: [
      {
        id: 'mock-1',
        type: 'claude',
        message: 'THE_TOWER scaffold complete — architecture laid',
        territory: 'the_tower',
        timestamp: now - 2000,
      },
      {
        id: 'mock-2',
        type: 'system',
        message: 'SCRYER feeds initialized',
        territory: 'the_scryer',
        timestamp: now - 8000,
      },
      {
        id: 'mock-3',
        type: 'aeris',
        message: 'Monitoring broadcast channels',
        territory: 'the_throne',
        timestamp: now - 15000,
      },
      {
        id: 'mock-4',
        type: 'overmind',
        message: 'Heartbeat nominal',
        territory: 'the_forge',
        timestamp: now - 60000,
      },
    ],
  }
}

// --- Validation ---
// Light validation — if the file exists but is malformed, return null rather
// than crash the page. SCRYER could be mid-write.

function isValidKingdomState(data: unknown): data is KingdomState {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.lastUpdated === 'number' &&
    Array.isArray(d.territories)
  )
}

function isValidSignalStream(data: unknown): data is SignalStream {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.lastUpdated === 'number' &&
    Array.isArray(d.signals)
  )
}

// --- Public API ---

/**
 * Returns the current Kingdom state.
 * Reads from SCRYER_FEEDS/kingdom_state.json.
 * Returns null if file doesn't exist or is unreadable.
 */
export async function getKingdomState(): Promise<KingdomState | null> {
  if (process.env.USE_MOCK_SCRYER_DATA === 'true') {
    return getMockKingdomState()
  }

  const cacheKey = 'kingdom-state'
  const cached = getCached<KingdomState>(cacheKey)
  if (cached) return cached

  try {
    const filePath = getKingdomStatePath()
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)

    if (!isValidKingdomState(parsed)) {
      if (process.env.KINGDOM_STATE_DEBUG === 'true') {
        console.warn('[kingdom-state] File exists but failed validation:', filePath)
      }
      return null
    }

    setCached(cacheKey, parsed)
    return parsed
  } catch (err) {
    if (process.env.KINGDOM_STATE_DEBUG === 'true') {
      console.warn('[kingdom-state] Could not read state file:', err)
    }
    return null
  }
}

/**
 * Returns the live signal stream.
 * Reads from SCRYER_FEEDS/signal_stream.json.
 * Returns an empty stream if file doesn't exist.
 */
export async function getSignalStream(): Promise<SignalStream> {
  if (process.env.USE_MOCK_SCRYER_DATA === 'true') {
    return getMockSignalStream()
  }

  const cacheKey = 'signal-stream'
  const cached = getCached<SignalStream>(cacheKey)
  if (cached) return cached

  try {
    const filePath = getSignalStreamPath()
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)

    if (!isValidSignalStream(parsed)) {
      return { lastUpdated: Date.now(), version: '1.0', signals: [] }
    }

    // Only cache signal stream briefly — it's meant to be live
    const ttl = Math.min(getCacheTTL(), 2000)
    cache.set(cacheKey, { data: parsed, expiresAt: Date.now() + ttl })
    return parsed
  } catch {
    return { lastUpdated: Date.now(), version: '1.0', signals: [] }
  }
}

/**
 * Returns a combined Kingdom data payload.
 * Convenience wrapper for API routes.
 */
export async function getKingdomPayload() {
  const [state, stream] = await Promise.all([
    getKingdomState(),
    getSignalStream(),
  ])

  return {
    state,
    stream,
    timestamp: Date.now(),
    feedsPath: getFeedsPath(),
  }
}
