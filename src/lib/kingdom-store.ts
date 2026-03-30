'use client'

/**
 * kingdom-store.ts
 *
 * Zustand store — single source of truth for the Kingdom's live state.
 *
 * Sync: usePartyKitSync — WebSocket push from PartyKit (sub-400ms latency).
 *        Falls back to 30s REST poll when WS is disconnected.
 *
 * R3F scene components subscribe to the store. Never setState in render loops.
 *
 * Usage:
 *   const activity = useKingdomStore(s => s.getActivity('the_forge'))
 *   const selectedId = useKingdomStore(s => s.selectedId)
 */

import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import PartySocket from 'partysocket'
import type { KingdomState, TerritoryState, TokenPulse } from './kingdom-state'
import type { AgentStatus, AgentState, MoodState } from './kingdom-agents'
import { TERRITORY_TO_AGENT } from './kingdom-agents'
import { TERRITORY_MAP } from './kingdom-layout'

// Signal TTL — single source of truth, applied at receive time (not creation time)
const SIGNAL_TTL_MS = 5000

// --- Types ---

export interface SignalEvent {
  id: string
  type: 'claude' | 'aeris' | 'brandon' | 'system' | 'overmind' | 'scryer' | 'raven' | 'unknown'
  territory?: string
  timestamp: number
  expiresAt: number  // Date.now() + SIGNAL_TTL_MS at receive time
}

export interface DroneSwarm {
  id: string
  label: string
  sourceTerritoryId: string
  targetTerritoryId: string
  direction: 'to_territory' | 'off_screen' | 'orbit'
  // orbit: drones circle source territory while agent is working/swarming.
  // No targetTerritoryId needed for orbit — leave as '' or source id.
  color?: string  // hex — drone tint. Defaults to territory droneColor if absent.
  active: boolean
  startedAt: number
  expiresAt: number  // startedAt + 30000 (60000 for orbit swarms)
}

// --- Store ---

// Debug overrides — client-side only, never touch SCRYER
export interface DebugOverride {
  status: 'active' | 'idle' | 'offline'
  activity: number
}

interface KingdomStore {
  // Live state from SCRYER
  territories: TerritoryState[]
  territoryMap: Map<string, TerritoryState>  // O(1) lookup companion — kept in sync with territories
  selectedId: string | null
  lastUpdated: number
  scraperStatus: string
  claudeActive: boolean
  aerisActive: boolean
  brandonPresent: boolean
  currentActivity: string | undefined
  activeProject: string | undefined
  isLoaded: boolean

  // Signal events & drone swarms
  recentSignalEvents: SignalEvent[]
  activeDroneSwarms: DroneSwarm[]

  // Debug overrides (test building states without waiting on SCRYER)
  debugOverrides: Record<string, DebugOverride>

  // Live agent states from KingdomLiveContext (via KingdomLiveSync bridge)
  agentStates: Record<string, AgentStatus>
  mood: MoodState | null
  tokenPulse: TokenPulse | null

  // Actions
  hydrate: (state: KingdomState) => void
  hydrateSignals: (stream: { signals: Array<{id: string, type: string, territory?: string, timestamp: number}> }) => void
  hydrateMood: (mood: MoodState) => void
  hydrateAgentStates: (agents: Record<string, AgentStatus>) => void
  selectTerritory: (id: string | null) => void
  pushSignalEvent: (event: Omit<SignalEvent, 'expiresAt'>) => void
  pushDroneSwarm: (swarm: Omit<DroneSwarm, 'expiresAt'> & { ttl?: number }) => void
  setDebugOverride: (id: string, override: DebugOverride | null) => void

  // Derived helpers (stable refs — safe to use in useFrame)
  getActivity: (id: string) => number
  getStatus: (id: string) => 'active' | 'idle' | 'offline' | 'unknown'
  getMood: () => MoodState | null
  getAgentActivity: (territoryId: string) => number
  getAgentState: (territoryId: string) => AgentState
}

export const useKingdomStore = create<KingdomStore>((set, get) => ({
  territories: [],
  territoryMap: new Map(),
  selectedId: null,
  lastUpdated: 0,
  scraperStatus: 'offline',
  claudeActive: false,
  aerisActive: false,
  brandonPresent: false,
  currentActivity: undefined,
  activeProject: undefined,
  isLoaded: false,
  recentSignalEvents: [],
  activeDroneSwarms: [],
  debugOverrides: {},

  agentStates: {},
  mood: null,
  tokenPulse: null,

  hydrate: (state: KingdomState) =>
    set({
      territories: state.territories,
      territoryMap: new Map(state.territories.map((t) => [t.id, t])),
      lastUpdated: state.lastUpdated,
      scraperStatus: state.scraperStatus,
      claudeActive: state.claudeActive,
      aerisActive: state.aerisActive,
      brandonPresent: state.brandonPresent,
      currentActivity: state.currentActivity,
      activeProject: state.activeProject,
      tokenPulse: state.token_pulse ?? null,
      isLoaded: true,
    }),

  selectTerritory: (id: string | null) => set({ selectedId: id }),

  setDebugOverride: (id: string, override: DebugOverride | null) => {
    const overrides = { ...get().debugOverrides }
    if (override === null) {
      delete overrides[id]
    } else {
      overrides[id] = override
    }
    set({ debugOverrides: overrides })
  },

  hydrateMood: (mood: MoodState) => set({ mood }),

  // Merges (not replaces) agent states — transient partial responses don't blank absent agents.
  // Also sets isLoaded — when agent states arrive from KingdomLiveContext the Kingdom is live.
  hydrateAgentStates: (agents: Record<string, AgentStatus>) =>
    set({ agentStates: { ...get().agentStates, ...agents }, isLoaded: true }),

  getMood: () => get().mood,

  getAgentActivity: (territoryId: string) => {
    const agentKey = TERRITORY_TO_AGENT[territoryId]
    if (!agentKey) return get().territoryMap.get(territoryId)?.activity ?? 0
    // Prefer live-push data; fall back to SCRYER territory activity when agentStates is empty
    return get().agentStates[agentKey]?.activity ?? get().territoryMap.get(territoryId)?.activity ?? 0
  },

  getAgentState: (territoryId: string): AgentState => {
    // 🏛️ SOVEREIGN LOCK // agentStates polling gap
    // 🗓️ 2026-03-16 | S196+ | DEBUG
    // ISSUE: agentStates is ONLY populated via PartyKit live-push (liveData.agents_status.agents).
    //        The polling fallback path (REST /api/kingdom-state) calls hydrate() which updates
    //        territoryMap but NEVER calls hydrateAgentStates. Result: in polling mode (dev or when
    //        WS is down), all agent-keyed territories return 'offline' permanently — buildings dark.
    // RESOLUTION: Fall back to territoryMap territory.status when agentStates is absent.
    //             Live-push data takes priority; SCRYER territory status is the fallback.
    // LAW: Never remove the territoryMap fallback. agentStates is NOT guaranteed to be populated.
    const agentKey = TERRITORY_TO_AGENT[territoryId]
    // Territories without agents (core_lore, the_scryer) — default to 'online' so they glow steady
    if (!agentKey) return 'online'
    const liveState = get().agentStates[agentKey]?.state
    if (liveState) return liveState
    const territory = get().territoryMap.get(territoryId)
    return territory?.status === 'active' ? 'working'
      : territory?.status === 'idle' ? 'online'
      : 'offline'
  },

  hydrateSignals: (stream: { signals: Array<{id: string, type: string, territory?: string, timestamp: number}> }) => {
    const current = get().recentSignalEvents
    const currentIds = new Set(current.map(e => e.id))
    const newEvents: SignalEvent[] = []

    for (const signal of stream.signals) {
      if (!currentIds.has(signal.id)) {
        newEvents.push({
          id: signal.id,
          type: signal.type as 'claude' | 'aeris' | 'brandon' | 'system' | 'overmind' | 'scryer' | 'raven' | 'unknown',
          territory: signal.territory,
          timestamp: signal.timestamp,
          expiresAt: Date.now() + SIGNAL_TTL_MS,  // TTL at receive time — not creation time
        })
      }
    }

    if (newEvents.length > 0) {
      // Append new events — existing pulses keep their array indices → no mesh pool flicker
      const combined = [...current, ...newEvents]
      set({ recentSignalEvents: combined.slice(-20) })
    }
  },

  pushSignalEvent: (event: Omit<SignalEvent, 'expiresAt'>) => {
    const newEvent: SignalEvent = {
      ...event,
      expiresAt: Date.now() + SIGNAL_TTL_MS,
    }

    const current = get().recentSignalEvents
    const now = Date.now()
    const filtered = current.filter(e => now < e.expiresAt)
    const updated = [newEvent, ...filtered].slice(0, 20)

    set({ recentSignalEvents: updated })
  },

  pushDroneSwarm: (swarm: Omit<DroneSwarm, 'expiresAt'> & { ttl?: number }) => {
    const ttl = swarm.ttl ?? 30_000  // orbit swarms pass 60_000; SCRYER events use default 30s
    const newSwarm: DroneSwarm = {
      ...swarm,
      expiresAt: swarm.startedAt + ttl,
    }

    const current = get().activeDroneSwarms
    const now     = Date.now()
    // Replace any existing swarm with the same id (handles orbit renewals)
    const pruned  = current.filter((s) => now < s.expiresAt && s.id !== newSwarm.id)
    const updated = [newSwarm, ...pruned].slice(0, 10)  // matches DroneSwarm.tsx MAX_SWARMS=10

    set({ activeDroneSwarms: updated })
  },

  getActivity: (id: string) => {
    const override = get().debugOverrides[id]
    if (override) return override.activity
    return get().territoryMap.get(id)?.activity ?? 0
  },

  getStatus: (id: string) => {
    const override = get().debugOverrides[id]
    if (override) return override.status
    return get().territoryMap.get(id)?.status ?? 'unknown'
  },

}))

// --- PartyKit sync hook ---
// Primary sync path. WS push from PartyKit → instant updates.
// Falls back to REST poll when WS is down or connecting.
// Call this once at the top of the scene component (replaces useKingdomSync).

// Shared helper — avoids duplicating drone hydration between WS handler and fallback poll
function applyActiveEvents(data: Record<string, unknown>) {
  const activeEvents = data.activeEvents as { events?: Array<{
    id: string
    label: string
    sourceTerritoryId: string
    targetTerritoryId: string
    direction?: 'to_territory' | 'off_screen'
    startedAt: number
    expiresAt: number
  }> } | undefined

  if (!activeEvents?.events?.length) return

  const store = useKingdomStore.getState()
  const existingIds = new Set(store.activeDroneSwarms.map((s) => s.id))

  for (const event of activeEvents.events) {
    if (!event.id || !event.startedAt || !event.sourceTerritoryId) continue  // guard against malformed SCRYER events
    if (!existingIds.has(event.id) && Date.now() < event.expiresAt) {
      // Use territory droneColor for SCRYER-driven swarms so they read as belonging
      // to the source territory rather than generic purple.
      const srcTerritory = TERRITORY_MAP[event.sourceTerritoryId]
      store.pushDroneSwarm({
        id:                event.id,
        label:             event.label,
        sourceTerritoryId: event.sourceTerritoryId,
        targetTerritoryId: event.targetTerritoryId,
        direction:         event.direction ?? 'to_territory',
        color:             srcTerritory?.droneColor,
        active:            true,
        startedAt:         event.startedAt,
      })
    }
  }
}

export function usePartyKitSync(fallbackInterval = 30_000) {
  const hydrate = useKingdomStore((s) => s.hydrate)
  const hydrateSignals = useKingdomStore((s) => s.hydrateSignals)

  // Stable refs so effect deps never change
  const hydrateRef = useRef(hydrate)
  const hydrateSignalsRef = useRef(hydrateSignals)
  hydrateRef.current = hydrate
  hydrateSignalsRef.current = hydrateSignals

  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'localhost:1999'

    let fallbackTimer: ReturnType<typeof setInterval> | null = null
    let connectTimeout: ReturnType<typeof setTimeout> | null = null
    let closed = false

    // --- Fallback REST poll ---
    const startFallback = () => {
      if (fallbackTimer) return
      fallbackTimer = setInterval(async () => {
        if (closed || document.hidden) return  // closed guard prevents orphaned fetches post-unmount
        try {
          const res = await fetch('/api/kingdom-state', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          })
          if (!res.ok) return
          const data = await res.json() as Record<string, unknown>
          if (data.state) hydrateRef.current(data.state as KingdomState)
          if (data.stream) hydrateSignalsRef.current(data.stream as Parameters<typeof hydrateSignals>[0])
          applyActiveEvents(data)
        } catch {
          // SCRYER offline — silently keep last state
        }
      }, fallbackInterval)
    }

    const stopFallback = () => {
      if (fallbackTimer) {
        clearInterval(fallbackTimer)
        fallbackTimer = null
      }
    }

    // --- WebSocket ---
    const room = process.env.NEXT_PUBLIC_PARTYKIT_ROOM ?? 'main'
    const ws = new PartySocket({
      host,
      room,
      // Issue #929: without reconnect delays, low-latency (<50ms) connections can
      // open multiple concurrent sockets before the first handshake completes.
      minReconnectionDelay: 1000,
      maxReconnectionDelay: 10000,
      reconnectionDelayGrowFactor: 1.5,
    })

    // If WS hasn't opened after 3s, activate fallback until it does
    connectTimeout = setTimeout(() => {
      if (!closed) startFallback()
    }, 3000)

    ws.onopen = () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = null
      }
      stopFallback()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>
        if (data.state) hydrateRef.current(data.state as KingdomState)
        if (data.stream) hydrateSignalsRef.current(data.stream as Parameters<typeof hydrateSignals>[0])
        applyActiveEvents(data)
        // liveData is embedded by kingdom-live-push.sh — hydrate agent states + mood in real-time.
        // Without this, agent states only update every 15s via the REST poll fallback.
        // REGRESSION GUARD: liveData.agents_status.agents must merge (not replace) — partial
        // pushes must not blank agents absent from this payload.
        // liveData shape: { agents_status?: { agents?: Record<territoryId, AgentStatus> }, mood?: string }
        // Shape originates from kingdom-live-push.sh — add guard before reading .agents
        const liveData = data.liveData as Record<string, unknown> | undefined
        if (liveData?.agents_status) {
          const agentsPayload = liveData.agents_status as { agents?: Record<string, import('./kingdom-agents').AgentStatus> }
          if (agentsPayload.agents) useKingdomStore.getState().hydrateAgentStates(agentsPayload.agents)
        }
      } catch {
        // Malformed push — ignore
      }
    }

    ws.onclose = () => {
      if (!closed) startFallback()
    }

    return () => {
      closed = true
      if (connectTimeout) clearTimeout(connectTimeout)
      stopFallback()
      ws.close()
    }
  }, [fallbackInterval]) // stable — hydrateRef/hydrateSignalsRef updated each render
}
