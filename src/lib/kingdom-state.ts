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

export interface ActiveEvent {
  id: string
  type: 'drone_swarm' | 'search_swarm' | 'audit' | 'debug' | 'deploy' | 'generic'
  label: string                 // e.g. "Debug swarm → the_forge"
  sourceTerritoryId: string     // e.g. "claude_house"
  targetTerritoryId: string     // e.g. "the_forge" (empty for off_screen swarms)
  direction?: 'to_territory' | 'off_screen'  // off_screen: fly out + return cyan
  startedAt: number             // Unix ms
  expiresAt: number             // Unix ms — events expire client-side too
}

export interface ActiveEvents {
  lastUpdated: number
  version: string
  events: ActiveEvent[]
}

// --- File paths ---

function getFeedsPath(): string {
  return process.env.SCRYER_FEEDS_PATH
    ?? path.join(process.cwd(), '..', '..', '..', 'SCRYER_FEEDS')
}

function getKingdomLiveMapPath(): string {
  return process.env.KINGDOM_LIVE_MAP_PATH
    ?? path.join(process.cwd(), '..', '..', '..', 'KINGDOM_LIVE_MAP')
}

function getKingdomStatePath(): string {
  return path.join(getFeedsPath(), 'kingdom_state.json')
}

function getSignalStreamPath(): string {
  return path.join(getFeedsPath(), 'signal_stream.json')
}

function getActiveEventsPath(): string {
  return path.join(getFeedsPath(), 'active_events.json')
}

// --- Real-time Claude activity injection ---
// Reads claude_house_activity.json directly, bypassing the 60s SCRYER lag.
// This file is written only by Claude's House hooks (not global hooks shared with other sessions).

interface ClaudeActivityFile {
  status: 'working' | 'idle' | 'offline'
  last_updated?: string   // ISO timestamp — used for stale detection
}

async function getClaudeActivity(): Promise<ClaudeActivityFile | null> {
  const klm = getKingdomLiveMapPath()
  const perCockpit = path.join(klm, 'claude_house_activity.json')
  const global_    = path.join(klm, 'claude_activity.json')

  // Try per-cockpit first (claude_house_activity.json); fall back to global.
  // Prefer per-cockpit to prevent FORGE_CLAUDE / AExMUSE from cross-contaminating
  // Claude's House status. No sync I/O — both paths use async readFile.
  let raw: string
  try {
    raw = await readFile(perCockpit, 'utf-8')
  } catch {
    try {
      raw = await readFile(global_, 'utf-8')
    } catch {
      return null
    }
  }

  try {
    const parsed = JSON.parse(raw) as ClaudeActivityFile
    if (!parsed.status) return null

    // Stale guard: if "working" but file is older than 10 minutes, demote to idle
    // (handles crash scenario where SessionEnd hook never fired)
    if (parsed.status === 'working' && parsed.last_updated) {
      const updatedTime = new Date(parsed.last_updated).getTime()
      if (!isNaN(updatedTime) && Date.now() - updatedTime > 600_000) {
        return { ...parsed, status: 'idle' }
      }
    }

    return parsed
  } catch {
    return null
  }
}

// Map claude_activity status → territory status + activity level
const CLAUDE_STATUS_MAP = {
  working: { status: 'active' as const, activity: 90 },
  idle:    { status: 'idle'   as const, activity: 60 },
  offline: { status: 'offline' as const, activity: 10 },
} as const

// --- Cache ---
// Simple in-process cache to avoid hammering disk on every request.
// TTL is configurable via KINGDOM_STATE_CACHE_TTL (default 5000ms).
// Parsed once at module load — env vars don't change at runtime.

const CACHE_TTL_MS: number = process.env.KINGDOM_STATE_CACHE_TTL
  ? parseInt(process.env.KINGDOM_STATE_CACHE_TTL, 10)
  : 5000

// Signal stream and active events use shorter TTLs — they're meant to be live.
const SIGNAL_CACHE_TTL_MS: number = Math.min(CACHE_TTL_MS, 2000)
const EVENTS_CACHE_TTL_MS: number = Math.min(CACHE_TTL_MS, 3000)

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()

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
    expiresAt: Date.now() + CACHE_TTL_MS,
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

function getMockActiveEvents(): ActiveEvents {
  const now = Date.now()
  return {
    lastUpdated: now,
    version: '1.0',
    events: [
      {
        id: 'mock-search-1',
        type: 'search_swarm',
        label: 'Web Search',
        sourceTerritoryId: 'claude_house',
        targetTerritoryId: '',
        direction: 'off_screen',
        startedAt: now - 5000,
        expiresAt: now + 25000,
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

function isValidActiveEvents(data: unknown): data is ActiveEvents {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return typeof d.lastUpdated === 'number' && Array.isArray(d.events)
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
    cache.set(cacheKey, { data: parsed, expiresAt: Date.now() + SIGNAL_CACHE_TTL_MS })
    return parsed
  } catch {
    return { lastUpdated: Date.now(), version: '1.0', signals: [] }
  }
}

/**
 * Returns the active events feed.
 * Reads from SCRYER_FEEDS/active_events.json.
 * Returns an empty events object if file doesn't exist.
 */
export async function getActiveEvents(): Promise<ActiveEvents> {
  if (process.env.USE_MOCK_SCRYER_DATA === 'true') {
    return getMockActiveEvents()
  }

  const cacheKey = 'active-events'
  const cached = getCached<ActiveEvents>(cacheKey)
  if (cached) return cached

  try {
    const filePath = getActiveEventsPath()
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)

    if (!isValidActiveEvents(parsed)) {
      return { lastUpdated: Date.now(), version: '1.0', events: [] }
    }

    // Keep active events fresh — slightly longer TTL than signal stream
    cache.set(cacheKey, { data: parsed, expiresAt: Date.now() + EVENTS_CACHE_TTL_MS })
    return parsed
  } catch {
    return { lastUpdated: Date.now(), version: '1.0', events: [] }
  }
}

/**
 * Returns a combined Kingdom data payload.
 * Convenience wrapper for API routes.
 *
 * Injects real-time Claude activity into claude_house territory,
 * bypassing the 60s SCRYER polling lag. Max lag becomes 5s (API poll).
 */
export async function getKingdomPayload() {
  const [state, stream, activeEvents, claudeActivity] = await Promise.all([
    getKingdomState(),
    getSignalStream(),
    getActiveEvents(),
    getClaudeActivity(),
  ])

  // Override claude_house territory with real-time hook data.
  // IMPORTANT: never mutate the cached state object — build a new one.
  let patchedState = state
  if (state && claudeActivity) {
    const override = CLAUDE_STATUS_MAP[claudeActivity.status]
    if (override) {
      const idx = state.territories.findIndex((t) => t.id === 'claude_house')
      if (idx !== -1) {
        patchedState = {
          ...state,
          claudeActive: claudeActivity.status !== 'offline',
          territories: state.territories.map((t, i) =>
            i === idx ? { ...t, status: override.status, activity: override.activity } : t
          ),
        }
      }
    }
  }

  return {
    state: patchedState,
    stream,
    activeEvents,
    timestamp: Date.now(),
  }
}
