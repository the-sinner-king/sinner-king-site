/**
 * @module pattern-engine
 *
 * Kingdom Map intelligence layer — 14 edge-triggered rules running every 10 seconds.
 *
 * ## Philosophy: edge triggers, not level triggers
 * Every rule fires exactly ONCE per state transition, not on every tick that
 * the condition is true. This mirrors how real monitoring systems work: you
 * want to know when something changes, not a drumbeat of "still true".
 *
 * Example:
 *   - Level trigger (wrong): emit 'OPERATOR: present' every tick while Brandon is online
 *   - Edge trigger (correct): emit 'OPERATOR: present' once, when brandonPresent flips
 *     false → true
 *
 * The pattern is: `if (curr.X && !prev.X)` or `if (curr.X !== prev.X)`.
 * `prev` is the snapshot from the previous tick, stored in `_prev`.
 *
 * ## External value injection pattern
 * PatternEngine runs outside of the React component tree — it is started and
 * stopped by a bridge component, but its core loop (`tick()`) executes in a
 * `setInterval` callback with no React context.
 *
 * Two values from the live context — token intensity and brandon presence —
 * are needed by the rules but are managed as React state in
 * `KingdomLiveContext`. Rather than making the engine a React hook (which
 * would force it inside a component and limit its lifecycle), we use module-
 * level setters: `setPatternEngineIntensity` and `setPatternEngineBrandon`.
 *
 * The bridge component (`PatternEngineBridge` or equivalent) calls these
 * setters in a `useEffect` whenever the relevant context values change. The
 * engine reads the module-level variables `_tokenIntensity` and
 * `_effectiveBrandonPresent` on each tick. No hooks, no subscriptions, no
 * circular deps.
 *
 * This is the standard "React pushes values into a non-React module" pattern.
 * It's idiomatic for singleton engines that need to live outside the component
 * lifecycle but still consume React state.
 *
 * ## Tick cadence and lifecycle
 * - `startPatternEngine()` starts a 3-second initial delay, then fires `tick()`
 *   and starts a 10-second `setInterval`. The delay gives the Zustand store
 *   time to hydrate from its first API fetch before the engine sees `_prev = null`.
 * - `stopPatternEngine()` cancels both the delay timer and the interval, resets
 *   all state, and clears MapMemory. React Strict Mode double-mounts are handled
 *   by guarding both timers with null checks and cancelling the delay in cleanup.
 * - The initial delay timer handle is stored in `_initialDelayTimer` so
 *   `stopPatternEngine()` can cancel it before it fires in Strict Mode.
 *
 * ## Keepalive cycle
 * If no rule fires for KEEPALIVE_EVERY (6) consecutive ticks (60 seconds),
 * the engine emits an 'alive' entry so the SystemLog never goes silent. This
 * signals "Kingdom is breathing, just quiet" rather than "is the engine dead?"
 *
 * ## Consumers
 * - LogBus (`logEmit`) — receives all emitted entries
 * - MapMemory (`addMemoryEntry`) — receives every tick snapshot for history
 * - React bridge component — calls start/stop and the injection setters
 */

import { useKingdomStore } from './kingdom-store'
import { logEmit } from './logbus'
import { addMemoryEntry, clearMemoryHistory, getConsecutiveTicks } from './map-memory'
import type { AgentState, AgentStatus } from './kingdom-agents'
import { AGENT_REGISTRY } from './kingdom-agents'

// ─── EXTERNAL VALUE INJECTION ──────────────────────────────────────────────

/**
 * Current token consumption intensity, injected by the React bridge.
 * Defaults to 'quiet' so the engine starts in a safe state before any
 * live data arrives.
 *
 * Note: 'med' is used internally here; the API/context uses 'medium'.
 * The bridge component is responsible for the translation.
 */
let _tokenIntensity: 'quiet' | 'low' | 'med' | 'high' = 'quiet'

/**
 * Whether Brandon is currently detected as present, injected by the React bridge.
 * Defaults to false — presence is assumed absent until confirmed.
 */
let _effectiveBrandonPresent = false

/**
 * Inject the current token intensity from the live context into the engine.
 *
 * Call this from a React bridge component's `useEffect` whenever the token
 * intensity value from `useKingdomLive()` changes.
 *
 * @param v - The current intensity bucket
 */
export function setPatternEngineIntensity(v: 'quiet' | 'low' | 'med' | 'high'): void {
  _tokenIntensity = v
}

/**
 * Inject the current Brandon-present flag from the live context into the engine.
 *
 * Call this from a React bridge component's `useEffect` whenever the
 * `brandon_present` value from `useKingdomLive()` changes.
 *
 * @param v - True if Brandon is currently detected as present
 */
export function setPatternEngineBrandon(v: boolean): void {
  _effectiveBrandonPresent = v
}

// ─── INTERNAL STATE ────────────────────────────────────────────────────────

/**
 * A single engine tick snapshot — the full state the engine reads on one tick.
 * Used to compare prev vs curr for edge detection. Not the same as
 * `MapMemoryEntry` (which is slightly leaner and stored in the ring buffer).
 */
interface EngineSnapshot {
  /** Current state of each known agent, keyed by agent key. */
  agentStates:    Record<string, AgentState>
  /** Number of currently active (non-expired) drone swarms. */
  swarmCount:     number
  /** Number of currently active (non-expired) signal events. */
  signalCount:    number
  /** Whether Brandon is currently detected as present (from injection). */
  brandonPresent: boolean
  /** Current token intensity (from injection). */
  tokenIntensity: 'quiet' | 'low' | 'med' | 'high'
  /** Currently selected territory ID, or null. */
  selectedId:     string | null
  /**
   * The `store.lastUpdated` timestamp from this tick.
   * Used by Rule 11 to detect when state goes from stale back to fresh.
   * This is the timestamp of the last successful write to kingdom_state.json,
   * NOT the time this snapshot was taken.
   */
  lastUpdated:    number
  /** Set of swarm IDs that were active at this tick. Used by Rule 4 for new-swarm detection. */
  swarmIds:       Set<string>
}

/** Previous tick's snapshot. Null on the first tick — no edges to detect yet. */
let _prev: EngineSnapshot | null = null

/** Handle for the main 10-second interval timer. Null when the engine is stopped. */
let _engineTimer: ReturnType<typeof setInterval> | null = null

/**
 * Handle for the initial 3-second startup delay timer.
 * Stored separately so `stopPatternEngine()` can cancel it before it fires
 * during React Strict Mode's double-mount/unmount cycle.
 */
let _initialDelayTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Counter tracking how many ticks have passed since the last emit.
 * Resets to 0 whenever any rule fires. When it reaches KEEPALIVE_EVERY
 * without firing, the keepalive rule emits 'ALIVE'.
 */
let _keepaliveCycle = 0

// ─── TIMING CONSTANTS ──────────────────────────────────────────────────────

/**
 * How many ticks of silence before the keepalive fires.
 * 6 ticks × 10 s/tick = 60 seconds of silence triggers the keepalive.
 * Chosen to be long enough that it doesn't fire during normal active periods
 * but short enough that a silent display looks deliberate, not broken.
 */
const KEEPALIVE_EVERY = 6

/**
 * The engine tick interval in milliseconds.
 * 10 seconds: fast enough to catch state changes promptly, slow enough
 * that the Zustand store has time to hydrate between ticks.
 * Unit: milliseconds.
 */
const TICK_INTERVAL_MS = 10_000

/**
 * Startup delay before the first tick fires.
 * Gives the Zustand store time to complete its first API fetch so the
 * initial snapshot sees real data rather than empty defaults.
 * Unit: milliseconds.
 */
const STARTUP_DELAY_MS = 3_000

/**
 * Age threshold for Rule 11 (sync / freshness detection).
 * State older than this is considered stale. When it crosses back under
 * this threshold, Rule 11 fires the 'SYNC' event.
 * 35 s = slightly less than the 45 s stale threshold used by the live context,
 * so the engine fires 'SYNC' before the HUD shows a stale badge.
 * Unit: milliseconds.
 */
const STATE_STALE_AGE_MS = 35_000

// ─── HELPERS ───────────────────────────────────────────────────────────────

/**
 * Extract the `AgentState` for a single agent from the agents map.
 * Falls back to 'offline' when the key is absent.
 */
function stateOf(agents: Record<string, AgentStatus>, agentKey: string): AgentState {
  return agents[agentKey]?.state ?? 'offline'
}

/**
 * Look up the human-readable label for an agent key.
 * Falls back to the uppercased key if the agent is not in AGENT_REGISTRY.
 */
function agentLabel(agentKey: string): string {
  return AGENT_REGISTRY.find(a => a.key === agentKey)?.label ?? agentKey.toUpperCase()
}

/**
 * Count how many agents are in an "active" state — i.e. not 'offline' or 'online'.
 * Used by Rule 1 to detect coordinated multi-agent deployment.
 */
function countActive(states: Record<string, AgentState>): number {
  return Object.values(states).filter(
    s => s !== 'offline' && s !== 'online',
  ).length
}

/**
 * Find the first agent currently in the given state, or null if none.
 * Returns the agent key (not the label) — callers pass through `agentLabel()`.
 * Used by Rules 2, 3 for single-agent edge detection.
 */
function anyInState(states: Record<string, AgentState>, target: AgentState): string | null {
  for (const [key, s] of Object.entries(states)) {
    if (s === target) return key
  }
  return null
}

/**
 * Format a millisecond duration as a short human-readable string.
 * Returns "Xs" for durations under 60 seconds, "Xm" for longer.
 * Used in log messages to communicate data age at a glance.
 */
function formatTimeAgo(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m`
}

// ─── CORE TICK ─────────────────────────────────────────────────────────────

/**
 * One engine tick — runs every TICK_INTERVAL_MS (10 seconds).
 *
 * Reads the current Zustand store state, builds a snapshot, writes it to
 * MapMemory, then evaluates all 14 rules against the prev/curr snapshot pair.
 *
 * On the first tick (`_prev === null`), rules are skipped — there is no
 * previous snapshot to diff against, so no edges can be detected. The
 * snapshot is stored as `_prev` and the engine waits for tick 2.
 */
function tick(): void {
  const store = useKingdomStore.getState()

  // Build current snapshot — resolve agent states from AGENT_REGISTRY
  // so unknown keys in the store don't produce spurious edges.
  const agentStates: Record<string, AgentState> = {}
  for (const reg of AGENT_REGISTRY) {
    agentStates[reg.key] = store.agentStates[reg.key]?.state ?? 'offline'
  }

  const now = Date.now()
  const currentSwarmIds = new Set(
    store.activeDroneSwarms.filter(s => now < s.expiresAt).map(s => s.id),
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

  // Snapshot to memory BEFORE emitting. Memory records what actually happened
  // at each tick; rules fire after the snapshot, so the snapshot is ground truth.
  addMemoryEntry({
    timestamp:           now,
    agentStates:         { ...agentStates },
    swarmCount:          curr.swarmCount,
    brandonPresent:      curr.brandonPresent,
    tokenIntensity:      curr.tokenIntensity,
    selectedTerritoryId: curr.selectedId,
    observation:         null,
  })

  if (_prev === null) {
    // First tick — no previous snapshot to diff against, so no edges exist.
    // Store the snapshot and wait for the next tick to start detecting edges.
    _prev = curr
    _keepaliveCycle = 1
    return
  }

  const prev = _prev
  let fired = false

  // Wrapper around logEmit that also sets the `fired` flag.
  // This lets the keepalive rule (Rule 14) know whether anything else fired
  // this tick without threading a separate boolean through every rule.
  const emit = (type: Parameters<typeof logEmit>[0], text: string) => {
    logEmit(type, text)
    fired = true
  }

  // ─── RULE 1: multi_agent ────────────────────────────────────────────
  //
  // What it detects: The transition from < 3 agents active to ≥ 3 agents
  // active simultaneously (rising edge on the coordination threshold).
  //
  // Why this edge matters: 3+ agents working at once signals coordinated
  // deployment — multiple Claude instances collaborating on a problem.
  // This is qualitatively different from one agent being busy; it means
  // the Kingdom is in a high-activity, multi-front operation.
  //
  // Gotcha: `countActive` excludes 'offline' and 'online' — only genuinely
  // active states (thinking, working, searching, etc.) count toward the
  // threshold.
  const activeNow  = countActive(curr.agentStates)
  const activePrev = countActive(prev.agentStates)
  if (activeNow >= 3 && activePrev < 3) {
    emit('agent', `COORDINATION: ${activeNow}-agent deployment`)
  }

  // ─── RULE 2: searching ──────────────────────────────────────────────
  //
  // What it detects: The first tick any agent enters 'searching' state
  // (rising edge — no agent was searching, now one is).
  //
  // Why this edge matters: 'searching' = a knowledge retrieval tool is in
  // flight (WebSearch/WebFetch or similar). This signals active research,
  // not just computation. Worth calling out because it's qualitatively
  // different from 'thinking' or 'working'.
  //
  // Gotcha: `anyInState` returns the key of the FIRST searching agent it
  // finds, not all of them. If two agents start searching on the same tick,
  // only one is named in the log message. Acceptable — the log is a narrative,
  // not a status board.
  const searchingNow  = anyInState(curr.agentStates, 'searching')
  const searchingPrev = anyInState(prev.agentStates, 'searching')
  if (searchingNow && !searchingPrev) {
    emit('agent', `KNOWLEDGE ACCESS: ${agentLabel(searchingNow)} querying`)
  }

  // ─── RULE 3: swarming ───────────────────────────────────────────────
  //
  // What it detects: The first tick any agent enters 'swarming' state
  // (rising edge — no agent was swarming, now one is).
  //
  // Why this edge matters: 'swarming' = the Agent/Task tool is active,
  // spawning sub-agents (drones). This is the highest-intensity operation
  // in the Kingdom's activity hierarchy. Emitting at the onset of swarming
  // gives the observer the earliest possible signal of a drone deployment.
  //
  // Note: Rule 4 (swarm_deploy) fires when the swarm object itself appears
  // in the store. Rules 3 and 4 can both fire on the same tick if the agent
  // state and the swarm object arrive together.
  const swarmingNow  = anyInState(curr.agentStates, 'swarming')
  const swarmingPrev = anyInState(prev.agentStates, 'swarming')
  if (swarmingNow && !swarmingPrev) {
    emit('agent', `SWARM: ${agentLabel(swarmingNow)} delegating`)
  }

  // ─── RULE 4: swarm_deploy ───────────────────────────────────────────
  //
  // What it detects: A new drone swarm ID appearing in `curr.swarmIds`
  // that was not present in `prev.swarmIds` (rising edge on a specific swarm).
  //
  // Why this edge matters: Swarm IDs are assigned when drones are created.
  // A new ID means a new named mission has been deployed. The swarm's
  // `label` provides the mission name for the log entry.
  //
  // Gotcha: Only one swarm emit per tick (`break` after first match).
  // If two swarms appear on the same tick, only the first is logged — this
  // is intentional to avoid flooding the log on bulk deploys.
  for (const id of curr.swarmIds) {
    if (!prev.swarmIds.has(id)) {
      const swarm = store.activeDroneSwarms.find(s => s.id === id)
      const label = swarm?.label ?? 'unknown'
      emit('swarm', `DEPLOY: ${label.slice(0, 40)}`)
      break  // one emit per tick max
    }
  }

  // ─── RULE 5: swarm_expire ───────────────────────────────────────────
  //
  // What it detects: A decrease in swarm count from one tick to the next
  // (falling edge — swarms have dissolved since the previous tick).
  //
  // Why this edge matters: Swarms expire when their TTL elapses (drones
  // have returned). Logging the dissolve completes the arc started by
  // Rule 4's DEPLOY message.
  //
  // Gotcha: This rule fires on *any* decrease in count, including cases
  // where a swarm was manually removed. It does not identify which specific
  // swarm dissolved — by the time this fires, expired swarms may already
  // be filtered out of the store.
  if (prev.swarmCount > 0 && curr.swarmCount < prev.swarmCount) {
    emit('swarm', `RETURN: orbit dissolved`)
  }

  // ─── RULE 6: signal_event ───────────────────────────────────────────
  //
  // What it detects: An increase in the count of active (non-expired) signal
  // events from one tick to the next (rising edge on signal count).
  //
  // Why this edge matters: Signal events are external pulses — visitor
  // interactions, webhook triggers, external notifications. An increase
  // means new activity has arrived from outside the Kingdom's active agents.
  //
  // Gotcha: The count can increase by more than 1 if multiple signals arrive
  // between ticks. The log message includes the delta count. The `territory`
  // field on the latest signal provides geographic context.
  if (curr.signalCount > prev.signalCount) {
    const newCount = curr.signalCount - prev.signalCount
    const latest   = store.recentSignalEvents.filter(e => now < e.expiresAt).at(-1)
    const territory = latest?.territory
      ? ` → ${latest.territory.replace(/_/g, ' ').toUpperCase()}`
      : ''
    emit('signal', `SIGNAL: ${latest?.type ?? 'unknown'}×${newCount}${territory}`)
  }

  // ─── RULE 7: operator_return ────────────────────────────────────────
  //
  // What it detects: Brandon's presence flipping from absent to present
  // (rising edge — false → true).
  //
  // Why this edge matters: The operator returning to an active session is
  // a significant context shift. The Kingdom transitions from autonomous
  // operation to supervised operation.
  if (!prev.brandonPresent && curr.brandonPresent) {
    emit('ops', `OPERATOR: present`)
  }

  // ─── RULE 8: operator_away ──────────────────────────────────────────
  //
  // What it detects: Brandon's presence flipping from present to absent
  // (falling edge — true → false).
  //
  // Why this edge matters: The operator going idle signals the Kingdom is
  // operating autonomously. Complements Rule 7 to form a complete presence
  // tracking narrative.
  if (prev.brandonPresent && !curr.brandonPresent) {
    emit('ops', `OPERATOR: idle`)
  }

  // ─── RULE 9: token_high ─────────────────────────────────────────────
  //
  // What it detects: Token intensity transitioning to 'high' from any
  // other bucket (rising edge specifically to the 'high' bucket).
  //
  // Why this edge matters: 'high' intensity = significant compute activity.
  // Entering 'high' from a lower bucket signals a qualitative shift in
  // Kingdom activity level, not just continued high usage.
  if (curr.tokenIntensity === 'high' && prev.tokenIntensity !== 'high') {
    emit('signal', `SIGNAL DENSITY: high`)
  }

  // ─── RULE 10: token_quiet ───────────────────────────────────────────
  //
  // What it detects: Token intensity transitioning to 'quiet' from any
  // other bucket (falling edge specifically to 'quiet').
  //
  // Why this edge matters: 'quiet' = computation has paused. Catching the
  // transition (not the steady state) signals the moment the Kingdom goes
  // idle rather than a continuous drumbeat of "still quiet".
  if (curr.tokenIntensity === 'quiet' && prev.tokenIntensity !== 'quiet') {
    emit('signal', `INTERVAL: computation paused`)
  }

  // ─── RULE 11: sync ──────────────────────────────────────────────────
  //
  // What it detects: The state freshness crossing from stale (≥35s old)
  // to fresh (<35s old) — i.e. the data has been updated after a gap.
  //
  // Why this edge matters: When kingdom_state.json hasn't been updated for
  // a while (scryer down, network issue, etc.), the age of `lastUpdated`
  // grows. When the scryer resumes writing and age drops back below the
  // threshold, this rule fires a 'SYNC' message to signal that fresh data
  // has returned.
  //
  // ── prevAge drift formula ──────────────────────────────────────────
  //
  // We need to reconstruct the *age of `prev.lastUpdated` as it appeared
  // on the previous tick* — i.e., how old was that value when we last
  // evaluated it?
  //
  // The previous tick ran approximately TICK_INTERVAL_MS (10 000 ms) ago.
  // At that moment, `now` was `(current_now - 10_000)`.
  // The age of `prev.lastUpdated` at that moment was:
  //
  //   prevAge = (current_now - 10_000) - prev.lastUpdated
  //
  // If we naively computed `prevAge = current_now - prev.lastUpdated`, we
  // would add 10 seconds of "phantom staleness" — measuring the age of
  // the previous snapshot as of *right now* instead of as of *then*.
  //
  // Without the -10_000 correction, a state that was exactly at the
  // threshold on the previous tick would appear to have been above the
  // threshold by 10 seconds, causing the rule to never fire (prevAge
  // always looks ≥ threshold even after the state is refreshed).
  //
  // Gotcha: `curr.lastUpdated !== 0` guards against the initial state
  // before the first API fetch, when `lastUpdated` is 0 and both
  // stateAge and prevAge would be nonsensically large.
  const stateAge = now - curr.lastUpdated
  const prevAge  = (now - TICK_INTERVAL_MS) - prev.lastUpdated
  if (stateAge < STATE_STALE_AGE_MS && prevAge >= STATE_STALE_AGE_MS && curr.lastUpdated !== 0) {
    emit('sync', `SYNC: state current — ${formatTimeAgo(stateAge)} ago`)
  }

  // ─── RULE 12: territory_access ──────────────────────────────────────
  //
  // What it detects: The selected territory ID changing from one tick to
  // the next (any change — null → ID, ID → null, or ID → different ID).
  //
  // Why this edge matters: Territory selection is a visitor interaction —
  // someone (or something) focused attention on a specific part of the map.
  // Logging it gives the operator a record of navigation patterns.
  //
  // Gotcha: The `curr.selectedId` guard on the left prevents logging
  // deselection (ID → null). If logging deselection is wanted, change to
  // `if (curr.selectedId !== prev.selectedId)`.
  if (curr.selectedId && curr.selectedId !== prev.selectedId) {
    const name = curr.selectedId.replace(/_/g, ' ').toUpperCase()
    emit('access', `ACCESSED: ${name}`)
  }

  // ─── RULE 13: extended_op ───────────────────────────────────────────
  //
  // What it detects: An agent first crossing the 5-consecutive-tick
  // threshold in a non-idle state (edge trigger at exactly ticks === 5).
  //
  // Why this edge matters: An agent staying in an active state for 40+
  // seconds suggests a deep, sustained operation — not a quick tool call.
  // 5 ticks = 50 seconds of elapsed time, but the crossing happens when we
  // see the 5th consecutive tick, which means 4 previous intervals of 10s
  // each have already elapsed (4 × 10s = 40s since the state began).
  //
  // Why `ticks === 5` and not `ticks >= 5`:
  // `getConsecutiveTicks` counts all trailing entries including the current
  // tick. `ticks === 5` means "this is exactly the 5th consecutive tick in
  // this state" — the rule fires ONCE at the threshold crossing, not on
  // every subsequent tick. This is the edge trigger.
  //
  // Gotcha: Only one agent's extended_op fires per tick (`break` after match).
  // If two agents both cross the 5-tick threshold on the same tick, only one
  // is logged. Acceptable given the rarity of this scenario.
  for (const reg of AGENT_REGISTRY) {
    const s = curr.agentStates[reg.key]
    if (s === 'offline' || s === 'online') continue
    const ticks = getConsecutiveTicks(reg.key, s)
    if (ticks === 5) {  // Edge trigger: fire exactly once when threshold is crossed
      emit('agent', `EXTENDED OP: ${agentLabel(reg.key)} ${s} ${ticks * 10}s`)
      break
    }
  }

  // ─── RULE 14: alive (keepalive) ─────────────────────────────────────
  //
  // What it detects: KEEPALIVE_EVERY consecutive ticks with no other rule
  // firing — i.e. the Kingdom is alive but quiet.
  //
  // Why this matters: The SystemLog should never go completely silent.
  // If no rules fire for 60 seconds, observers might wonder if the engine
  // has crashed. The 'ALIVE' entry signals "the engine is running and
  // checked in — there's just nothing to report right now."
  //
  // Note: The keepalive also fires when `!fired` on any tick (not just at
  // KEEPALIVE_EVERY). This means a "quiet" tick always gets at least one
  // entry, even if it's not the scheduled keepalive interval. Only the
  // cycle counter reset happens at the KEEPALIVE_EVERY boundary.
  _keepaliveCycle++
  if (!fired || _keepaliveCycle >= KEEPALIVE_EVERY) {
    if (!fired) emit('alive', `ALIVE`)
    _keepaliveCycle = 0
  }

  _prev = curr
}

// ─── LIFECYCLE ─────────────────────────────────────────────────────────────

/**
 * Start the pattern engine.
 *
 * Fires the first tick after a STARTUP_DELAY_MS delay (allowing the Zustand
 * store to hydrate), then starts a TICK_INTERVAL_MS interval.
 *
 * Idempotent — calling `startPatternEngine()` while the engine is already
 * running is a no-op.
 *
 * Called by the React bridge component's `useEffect` on mount.
 */
export function startPatternEngine(): void {
  if (_engineTimer !== null) return

  // Store the delay timer handle so stopPatternEngine() can cancel it if
  // the component unmounts before the delay fires (React Strict Mode
  // double-mount: mount → immediate unmount → mount again).
  _initialDelayTimer = setTimeout(() => {
    _initialDelayTimer = null
    tick()
    _engineTimer = setInterval(tick, TICK_INTERVAL_MS)
  }, STARTUP_DELAY_MS)
}

/**
 * Stop the pattern engine and reset all state.
 *
 * Cancels the pending initial delay (if it hasn't fired yet) and the main
 * interval. Resets the prev snapshot, keepalive cycle, and injected values
 * to their defaults. Clears MapMemory to prevent stale tick history from
 * bleeding into the next engine lifecycle.
 *
 * Resetting `_tokenIntensity` and `_effectiveBrandonPresent` is important:
 * if the engine stops and immediately restarts (Strict Mode), the injected
 * values from the previous lifecycle would carry over and cause phantom
 * edges on the first tick of the new lifecycle.
 *
 * Called by the React bridge component's `useEffect` cleanup function.
 */
export function stopPatternEngine(): void {
  // Cancel the startup delay if it hasn't fired yet.
  // Without this, Strict Mode's unmount would let the timer fire into a
  // half-torn-down engine state.
  if (_initialDelayTimer !== null) {
    clearTimeout(_initialDelayTimer)
    _initialDelayTimer = null
  }

  if (_engineTimer !== null) {
    clearInterval(_engineTimer)
    _engineTimer = null
  }

  // Full state reset — no stale values should survive across lifecycles.
  _prev = null
  _keepaliveCycle = 0
  _tokenIntensity = 'quiet'
  _effectiveBrandonPresent = false
  clearMemoryHistory()
}
