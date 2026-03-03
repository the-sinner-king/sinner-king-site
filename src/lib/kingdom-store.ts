'use client'

/**
 * kingdom-store.ts
 *
 * Zustand store — single source of truth for the Kingdom's live state.
 *
 * Two sync strategies available:
 *   usePartyKitSync — PRIMARY. WebSocket push from PartyKit (sub-400ms latency).
 *                     Falls back to 30s REST poll when WS is disconnected.
 *   useKingdomSync  — FALLBACK / DEV. Pure REST poll against /api/kingdom-state.
 *                     Kept for debugging. Not called in production.
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
import type { KingdomState, TerritoryState } from './kingdom-state'
import type { AgentStatus, AgentState, MoodState } from './kingdom-agents'
import { TERRITORY_TO_AGENT } from './kingdom-agents'

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
  direction: 'to_territory' | 'off_screen'  // off_screen: fly out + return cyan
  active: boolean
  startedAt: number
  expiresAt: number  // startedAt + 30000
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

  // Actions
  hydrate: (state: KingdomState) => void
  hydrateSignals: (stream: { signals: Array<{id: string, type: string, territory?: string, timestamp: number}> }) => void
  hydrateMood: (mood: MoodState) => void
  hydrateAgentStates: (agents: Record<string, AgentStatus>) => void
  selectTerritory: (id: string | null) => void
  pushSignalEvent: (event: Omit<SignalEvent, 'expiresAt'>) => void
  pushDroneSwarm: (swarm: Omit<DroneSwarm, 'expiresAt'>) => void
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
    if (!agentKey) return 0
    return get().agentStates[agentKey]?.activity ?? 0
  },

  getAgentState: (territoryId: string): AgentState => {
    const agentKey = TERRITORY_TO_AGENT[territoryId]
    // Territories without agents (core_lore, the_scryer) — default to 'online' so they glow steady
    if (!agentKey) return 'online'
    return get().agentStates[agentKey]?.state ?? 'offline'
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

  pushDroneSwarm: (swarm: Omit<DroneSwarm, 'expiresAt'>) => {
    const newSwarm: DroneSwarm = {
      ...swarm,
      expiresAt: swarm.startedAt + 30000,
    }

    const current = get().activeDroneSwarms
    const pruned = current.filter((s) => Date.now() < s.expiresAt)
    const updated = [newSwarm, ...pruned].slice(0, 5)

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

// --- Polling hook ---
// @deprecated — replaced by useKingdomLive() in kingdom-live-context.tsx
// Kept as debug fallback. Verify useKingdomLive() stable for 2+ sessions before removing.
// TODO: remove after 2026-03-10
export function useKingdomSync(pollInterval = 5000) {
  const hydrate = useKingdomStore((s) => s.hydrate)
  const hydrateSignals = useKingdomStore((s) => s.hydrateSignals)
  const pushDroneSwarm = useKingdomStore((s) => s.pushDroneSwarm)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch('/api/kingdom-state', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          if (data.state) hydrate(data.state)
          if (data.stream) hydrateSignals(data.stream)

          // Hydrate drone swarms from active_events
          if (data.activeEvents?.events?.length) {
            const store = useKingdomStore.getState()
            const existingIds = new Set(
              store.activeDroneSwarms.map((s) => s.id)
            )
            for (const event of data.activeEvents.events) {
              if (!existingIds.has(event.id) && Date.now() < event.expiresAt) {
                pushDroneSwarm({
                  id: event.id,
                  label: event.label,
                  sourceTerritoryId: event.sourceTerritoryId,
                  targetTerritoryId: event.targetTerritoryId,
                  direction: event.direction ?? 'to_territory',
                  active: true,
                  startedAt: event.startedAt,
                })
              }
            }
          }
        }
      } catch {
        // SCRYER offline — silently keep last state
      }
    }

    // Immediate first fetch
    poll()

    // Tab-aware polling — pause when hidden
    const interval = setInterval(() => {
      if (!document.hidden) poll()
    }, pollInterval)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [hydrate, hydrateSignals, pushDroneSwarm, pollInterval])
}

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
      store.pushDroneSwarm({
        id: event.id,
        label: event.label,
        sourceTerritoryId: event.sourceTerritoryId,
        targetTerritoryId: event.targetTerritoryId,
        direction: event.direction ?? 'to_territory',
        active: true,
        startedAt: event.startedAt,
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
