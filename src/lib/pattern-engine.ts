/**
 * pattern-engine.ts — Kingdom Map intelligence layer
 *
 * 14 edge-triggered rules run every 10s via setInterval.
 * Reads Zustand kingdom-store via getState() — zero React subscriptions.
 * Emits to LogBus. Snapshots to MapMemory.
 *
 * External values (tokenIntensity, effectiveBrandonPresent) are injected
 * via module-level setters called from a React bridge component.
 *
 * MARKED FOR RE-LOOP: additional rules to be added in a future session.
 */

import { useKingdomStore } from './kingdom-store'
import { logEmit } from './logbus'
import { addMemoryEntry, getConsecutiveTicks } from './map-memory'
import type { AgentState, AgentStatus } from './kingdom-agents'
import { AGENT_REGISTRY } from './kingdom-agents'

// ---------------------------------------------------------------------------
// External value injection (React bridge calls these — not hooks)
// ---------------------------------------------------------------------------

let _tokenIntensity: 'quiet' | 'low' | 'med' | 'high' = 'quiet'
let _effectiveBrandonPresent = false

export function setPatternEngineIntensity(v: 'quiet' | 'low' | 'med' | 'high'): void {
  _tokenIntensity = v
}
export function setPatternEngineBrandon(v: boolean): void {
  _effectiveBrandonPresent = v
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface EngineSnapshot {
  agentStates:      Record<string, AgentState>
  swarmCount:       number
  signalCount:      number
  brandonPresent:   boolean
  tokenIntensity:   'quiet' | 'low' | 'med' | 'high'
  selectedId:       string | null
  lastUpdated:      number
  swarmIds:         Set<string>
}

let _prev: EngineSnapshot | null = null
let _engineTimer: ReturnType<typeof setInterval> | null = null
let _keepaliveCycle = 0  // fire ALIVE every 6 ticks (60s) if nothing else fires
const KEEPALIVE_EVERY = 6

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateOf(agents: Record<string, AgentStatus>, agentKey: string): AgentState {
  return agents[agentKey]?.state ?? 'offline'
}

function agentLabel(agentKey: string): string {
  return AGENT_REGISTRY.find(a => a.key === agentKey)?.label ?? agentKey.toUpperCase()
}

function countActive(states: Record<string, AgentState>): number {
  return Object.values(states).filter(
    s => s !== 'offline' && s !== 'online'
  ).length
}

function anyInState(states: Record<string, AgentState>, target: AgentState): string | null {
  for (const [key, s] of Object.entries(states)) {
    if (s === target) return key
  }
  return null
}

function formatTimeAgo(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m`
}

// ---------------------------------------------------------------------------
// Core tick
// ---------------------------------------------------------------------------

function tick(): void {
  const store = useKingdomStore.getState()

  // Build current snapshot
  const agentStates: Record<string, AgentState> = {}
  for (const reg of AGENT_REGISTRY) {
    agentStates[reg.key] = store.agentStates[reg.key]?.state ?? 'offline'
  }

  const now = Date.now()
  const currentSwarmIds = new Set(
    store.activeDroneSwarms.filter(s => now < s.expiresAt).map(s => s.id)
  )

  const curr: EngineSnapshot = {
    agentStates,
    swarmCount:     currentSwarmIds.size,
    signalCount:    store.recentSignalEvents.filter(e => now < e.expiresAt).length,
    brandonPresent: _effectiveBrandonPresent,
    tokenIntensity: _tokenIntensity,
    selectedId:     store.selectedId,
    lastUpdated:    store.lastUpdated,
    swarmIds:       currentSwarmIds,
  }

  // Snapshot to memory before emitting (memory = what actually happened)
  addMemoryEntry({
    timestamp:              now,
    agentStates:            { ...agentStates },
    swarmCount:             curr.swarmCount,
    brandonPresent:         curr.brandonPresent,
    tokenIntensity:         curr.tokenIntensity,
    selectedTerritoryId:    curr.selectedId,
    observation:            null,
  })

  if (_prev === null) {
    // First tick — no edges yet. Just snapshot.
    _prev = curr
    _keepaliveCycle = 1
    return
  }

  const prev = _prev
  let fired = false

  const emit = (type: Parameters<typeof logEmit>[0], text: string) => {
    logEmit(type, text)
    fired = true
  }

  // --- RULE 1: multi_agent (≥3 agents active simultaneously) ---
  const activeNow   = countActive(curr.agentStates)
  const activePrev  = countActive(prev.agentStates)
  if (activeNow >= 3 && activePrev < 3) {
    emit('agent', `COORDINATION: ${activeNow}-agent deployment`)
  }

  // --- RULE 2: searching ---
  const searchingNow  = anyInState(curr.agentStates, 'searching')
  const searchingPrev = anyInState(prev.agentStates, 'searching')
  if (searchingNow && !searchingPrev) {
    emit('agent', `KNOWLEDGE ACCESS: ${agentLabel(searchingNow)} querying`)
  }

  // --- RULE 3: swarming ---
  const swarmingNow  = anyInState(curr.agentStates, 'swarming')
  const swarmingPrev = anyInState(prev.agentStates, 'swarming')
  if (swarmingNow && !swarmingPrev) {
    emit('agent', `SWARM: ${agentLabel(swarmingNow)} delegating`)
  }

  // --- RULE 4: swarm_deploy (new drone swarm appeared) ---
  for (const id of curr.swarmIds) {
    if (!prev.swarmIds.has(id)) {
      const swarm = store.activeDroneSwarms.find(s => s.id === id)
      const label = swarm?.label ?? 'unknown'
      emit('swarm', `DEPLOY: ${label.slice(0, 40)}`)
      break  // one emit per tick max
    }
  }

  // --- RULE 5: swarm_expire (swarm dissolved) ---
  if (prev.swarmCount > 0 && curr.swarmCount < prev.swarmCount) {
    emit('swarm', `RETURN: orbit dissolved`)
  }

  // --- RULE 6: signal_event (new signals arrived) ---
  if (curr.signalCount > prev.signalCount) {
    const newCount = curr.signalCount - prev.signalCount
    const latest = store.recentSignalEvents.filter(e => now < e.expiresAt).at(-1)
    const territory = latest?.territory ? ` → ${latest.territory.replace(/_/g, ' ').toUpperCase()}` : ''
    emit('signal', `SIGNAL: ${latest?.type ?? 'unknown'}×${newCount}${territory}`)
  }

  // --- RULE 7: operator_return ---
  if (!prev.brandonPresent && curr.brandonPresent) {
    emit('ops', `OPERATOR: present`)
  }

  // --- RULE 8: operator_away ---
  if (prev.brandonPresent && !curr.brandonPresent) {
    emit('ops', `OPERATOR: idle`)
  }

  // --- RULE 9: token_high ---
  if (curr.tokenIntensity === 'high' && prev.tokenIntensity !== 'high') {
    emit('signal', `SIGNAL DENSITY: high`)
  }

  // --- RULE 10: token_quiet ---
  if (curr.tokenIntensity === 'quiet' && prev.tokenIntensity === 'high') {
    emit('signal', `INTERVAL: computation paused`)
  }

  // --- RULE 11: sync (state age check — fire if data is fresh after being stale) ---
  const stateAge = now - curr.lastUpdated
  const prevAge  = now - prev.lastUpdated
  if (stateAge < 35_000 && prevAge >= 35_000 && curr.lastUpdated !== 0) {
    emit('sync', `SYNC: state current — ${formatTimeAgo(stateAge)} ago`)
  }

  // --- RULE 12: territory_access (new selection) ---
  if (curr.selectedId && curr.selectedId !== prev.selectedId) {
    const name = curr.selectedId.replace(/_/g, ' ').toUpperCase()
    emit('access', `ACCESSED: ${name}`)
  }

  // --- RULE 13: extended_op (agent in active state for ≥4 consecutive ticks = 40s) ---
  for (const reg of AGENT_REGISTRY) {
    const s = curr.agentStates[reg.key]
    if (s === 'offline' || s === 'online') continue
    const ticks = getConsecutiveTicks(reg.key, s)
    if (ticks === 4) {  // exactly 4 = just crossed threshold (edge trigger, not continuous)
      emit('agent', `EXTENDED OP: ${agentLabel(reg.key)} ${s} ${ticks * 10}s`)
      break
    }
  }

  // --- RULE 14: alive (keepalive — fires every 60s if nothing else fired this cycle) ---
  _keepaliveCycle++
  if (!fired || _keepaliveCycle >= KEEPALIVE_EVERY) {
    if (!fired) emit('alive', `ALIVE`)
    _keepaliveCycle = 0
  }

  _prev = curr
}

// ---------------------------------------------------------------------------
// Lifecycle — start/stop (called from React bridge component)
// ---------------------------------------------------------------------------

export function startPatternEngine(): void {
  if (_engineTimer !== null) return
  // First tick after a short delay so store has a chance to hydrate
  setTimeout(() => {
    tick()
    _engineTimer = setInterval(tick, 10_000)
  }, 3_000)
}

export function stopPatternEngine(): void {
  if (_engineTimer !== null) {
    clearInterval(_engineTimer)
    _engineTimer = null
  }
  _prev = null
  _keepaliveCycle = 0
}
