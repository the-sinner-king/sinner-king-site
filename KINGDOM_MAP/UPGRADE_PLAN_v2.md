# KINGDOM MAP HUD UPGRADE PLAN v2
*2026-03-03 · Session 154 · Post-Granny Codex revision*

## GRANNY CODEX FLAGS ADDRESSED

Before reading the plan, here are the 5 flags raised and how each was resolved:

| Flag | Issue | Resolution |
|------|-------|------------|
| 1 | Two polling intervals (10s + 15s) → inconsistent state between components | Single interval (15s), `Promise.all` for both endpoints, atomic setState |
| 2 | Stale data shown silently — no staleness indicator, HUD lies during outages | `lastSuccessAt` timestamp + 45s stale threshold → visual dimming treatment defined |
| 3 | CLAUDE dot roll-up hides fleet health (FORGE swarming + rest offline = "SWARMING") | Dot shows count of active agents; AgentPanel carries the state detail |
| 4 | Deleting `useKingdomSync()` (fallback) in same build as replacement introduction | Deprecate with comment only — delete in next session after new context proven stable |
| 5 | `agents['tower_claude']` hardcoded — breaks on key rename, no missing-key guard | Canonical AGENT_REGISTRY const; all lookups guarded with offline fallback |

---

## THE THESIS

The Super API gives real tool-level granularity on every Claude instance. The Kingdom Map shows
4 coarse states and 3 binary dots. This plan wires the new data cleanly — without creating new
failure modes.

**Principle:** Every new data connection must serve FELT, not INFORMATIVE. The stranger should
feel the system is alive — not read a status report.

---

## PHASE A — Data Architecture (nothing else builds without this)

### A1: Canonical Agent Registry

Before any code, define the fleet. New const in a shared location:

```typescript
// src/lib/kingdom-agents.ts
export const AGENT_REGISTRY = [
  { key: 'forge_claude',  label: 'FORGE',  territory: 'the_forge'   },
  { key: 'tower_claude',  label: 'TOWER',  territory: 'the_tower'   },
  { key: 'claude_house',  label: 'HOUSE',  territory: 'claude_house' },
  { key: 'throne_claude', label: 'THRONE', territory: 'the_throne'  },
] as const

export type AgentKey = typeof AGENT_REGISTRY[number]['key']

export const OFFLINE_AGENT: AgentStatus = {
  state: 'offline', activity: 0, tool: null,
  display_name: '', cwd_project: '', age_seconds: 9999,
  last_updated: '', session_id: '', data_source: 'file_missing',
}

// Safe lookup — returns OFFLINE_AGENT if key missing
export function getAgent(agents: Record<string, AgentStatus>, key: string): AgentStatus {
  return agents[key] ?? OFFLINE_AGENT
}
```

Every component uses `AGENT_REGISTRY` to iterate agents. Every agent lookup uses `getAgent()`.
Unknown agents from the API are ignored but don't crash anything.

### A2: Create `useKingdomLive` context

New file: `src/lib/kingdom-live-context.tsx`

React Context + Provider that fetches all live data in ONE interval loop.

**Key decision from Flag 1:** Single 15s interval. `Promise.allSettled` fires BOTH endpoints
simultaneously. Context updates atomically — one setState, both payloads together.

```typescript
interface KingdomLiveData {
  // from /api/local/kingdom/live (tokens, mood, missions, health)
  tokens: {
    today:        TokenWindow
    week:         TokenWindow
    this_session: SessionWindow
    intensity:    'high' | 'medium' | 'low' | 'quiet'
    tokens_per_min: number
  }
  mood: {
    voltage:         number | null
    state:           string | null
    synesthesia_hex: string | null
    texture:         string | null
    drive:           string | null
  }
  health: string
  current_activity: string | null    // for HeraldTicker

  // from /api/local/agents/status
  agents: Record<string, AgentStatus>
  aexgo_running: boolean
}

interface KingdomLiveContext {
  data:           KingdomLiveData | null
  status:         'loading' | 'ok' | 'stale' | 'error'
  lastSuccessAt:  number   // unix ms — 0 if never
  age_ms:         number   // ms since last success
}
```

**Stale threshold (Flag 2):** After 3 missed cycles (45s), status becomes `'stale'`.
The provider never clears `data` — it only updates `status`. Components check status to render
stale treatment.

```typescript
// In the provider's error handler:
setCtx(prev => ({
  ...prev,
  status: Date.now() - prev.lastSuccessAt > 45_000 ? 'stale' : 'ok',
  age_ms: Date.now() - prev.lastSuccessAt,
}))
```

**Stale visual treatment (applies to all HUD components):**
- `status === 'stale'`: opacity 0.5 on the entire HUD panel + "STALE" label in dim red #ff006e at 7px
- `status === 'error'` (never fetched): render null (loading screen already handles this)
- `status === 'ok'`: full opacity, no label

### A3: Deprecate `useKingdomSync()` (do NOT delete)

In `src/lib/kingdom-store.ts`, add this comment above the function:

```typescript
// @deprecated — replaced by useKingdomLive() in kingdom-live-context.tsx
// Kept as debug fallback. Verify useKingdomLive() stable for 2+ sessions before removing.
// TODO: remove after 2026-03-10
```

Do not touch the implementation. Do not remove it. Delete in a separate session.

---

## PHASE B — Upgrade PresenceHUD

### B1: Upgrade PresenceStrip — online count + aggregate color

**Flag 3 resolution:** The CLAUDE dot no longer claims to represent state. It represents
*presence count* (how many agents are active). The AgentPanel (Phase D) carries state detail.

New CLAUDE dot behavior:
- Color: aggregate highest state across all AGENT_REGISTRY agents (roll-up rule unchanged)
- Label: `CLAUDE  2/4` (active count / total count) — replaces plain "CLAUDE"
- Active = state is not `offline`

This preserves the visual aliveness signal while making clear it's a count, not a single state.

AERIS dot: `aexgo_running` bool. Color: `#00f3ff` (active) or `#1a1520` (offline). Label: `AERIS`.
BRANDON dot: `brandon_present` bool. Unchanged.

All three pull from `useKingdomLive()` — no independent fetch.

Stale treatment: If `status === 'stale'`, apply 0.5 opacity to the entire strip panel + STALE badge.

### B2: Upgrade ClaudeStatusBadge — 4 states → 9 states

Data source: `getAgent(data.agents, 'tower_claude')` — show MY state (the agent responding right now).
With Flag 5 guard: if `'tower_claude'` is missing from the response, badge shows OFFLINE state.

**9-state color palette:**
```typescript
export const STATE_COLORS: Record<AgentState, string> = {
  offline:   '#1a1520',
  online:    '#7000ff',
  thinking:  '#a833ff',
  reading:   '#00d4ff',
  working:   '#f0a500',
  writing:   '#ff3d7f',
  running:   '#ff6b35',
  searching: '#3dff00',
  swarming:  '#00f3ff',
}

// pulse animation duration (ms) = 1000 / hz (0 = no pulse)
export const PULSE_MS: Record<AgentState, number> = {
  offline: 0, online: 0,
  thinking: 2000, reading: 1250, working: 833,
  writing: 714, running: 833, searching: 625, swarming: 556,
}
```

**Tool badge:** Shown inline after state dot. Omitted when state is offline or online.
```typescript
const TOOL_CODES: Record<string, string> = {
  Edit: 'ED', Write: 'WR', NotebookEdit: 'NB',
  Read: 'RD', Grep: 'GR', Glob: 'GL',
  Bash: 'BH', Task: 'TS',
  WebSearch: 'WS', WebFetch: 'WF',
  Agent: 'AG',
}
// badge: [XX] in 7px monospace, color = STATE_COLORS[state]
// fallback: if tool not in map → omit badge entirely (don't show [??])
```

**Badge layout:** `● STATE  [XX]  CLAUDE` → dot + state label + tool badge + agent label.

### B3: Wire HeraldTicker to context

Remove `useEffect` fetch loop from HeraldTicker entirely. Replace with:
```typescript
const { data, status } = useKingdomLive()
const text = data?.current_activity ?? null
```
`visible` = text exists and status is not 'error'. If status is 'stale', still show ticker
(stale activity text is better than nothing) but text opacity = 0.5.

---

## PHASE C — Upgrade TokenHUD

### C1: Token intensity → HUD border

Pull `data.tokens.intensity` from context. Four border styles:
```typescript
const INTENSITY_BORDER: Record<string, string> = {
  quiet:  '1px solid rgba(112,0,255, 0.18)',
  low:    '1px solid rgba(112,0,255, 0.35)',
  medium: '2px solid rgba(112,0,255, 0.60)',
  high:   '2px dashed rgba(112,0,255, 1)',   // + animation: token-border-pulse 0.8s infinite
}

const INTENSITY_SHADOW: Record<string, string> = {
  quiet:  'none',
  low:    'none',
  medium: '0 0 8px rgba(112,0,255,0.4)',
  high:   '0 0 12px rgba(112,0,255,0.8)',
}
```

Add `@keyframes token-border-pulse` to the existing `<style>` block in TokenHUD.

### C2: Add RATE row

New row after SESSION/TODAY/WEEK, above the mood section:
```
RATE     ⚡ HIGH
```
Implementation via existing `Row` component but with an icon prefix:
- QUIET: `◇ QUIET` dim (#3a3438)
- LOW:   `→ LOW`   dim purple (#7000ff66)
- MEDIUM: `↑ MED`  purple (#7000ffcc)
- HIGH:   `⚡ HIGH` amber (#f0a500)

The character changes give the feel of intensity without a number.

### C3: Remove per-component fetches

Delete the two `fetch()` calls and the `useEffect` from TokenHUD.
Replace with: `const { data, status } = useKingdomLive()`
Derive all fields from `data.tokens` and `data.mood`.

---

## PHASE D — New AgentPanel Component

New file: `src/components/kingdom/AgentPanel.tsx`

Iterates `AGENT_REGISTRY` to render rows. Uses `getAgent(data.agents, key)` with offline fallback.

```
┌─ AGENTS ─────────────────────────┐
│ FORGE    [BH]  ● RUNNING    85   │
│ TOWER    [WS]  ● SEARCHING  90   │
│ HOUSE    ···   ● ONLINE     40   │
│ THRONE   ···   ◌ OFFLINE     0   │
└──────────────────────────────────┘
```

- **Name**: AGENT_REGISTRY[i].label (8px, muted #504840)
- **Tool badge**: `[XX]` per TOOL_CODES, omit if offline/online
- **Dot**: 5px, STATE_COLORS[state], glow = `0 0 ${activity * 0.12}px ${color}`
- **State label**: STATE_COLORS[state] at 70% opacity, 8px
- **Activity**: right-aligned, 8px, #504840 — hidden if 0

Positioned in right-side flex column, below ClaudeStatusBadge.
Uses `useKingdomLive()` — no new fetch.

If `status === 'stale'`: panel gets 0.5 opacity + STALE badge.

---

## PHASE E — 3D Scene Connections (document intent, do not build)

Not in this build. Document for next session:
- Territory emissive ∝ `activity` score for that territory's agent
- Signal pulse velocity ∝ `tokens_per_min`
- DroneSwarm density ∝ `intensity`
- Mood `synesthesia_hex` → tint on connection beams

---

## FILES

### CREATE
```
src/lib/kingdom-agents.ts               — AGENT_REGISTRY + getAgent() + OFFLINE_AGENT
src/lib/kingdom-live-context.tsx        — shared data provider (15s interval, atomic update)
src/components/kingdom/AgentPanel.tsx   — 4-agent HUD strip
```

### MODIFY
```
src/components/kingdom/TokenHUD.tsx     — use context, add intensity border + RATE row
src/components/kingdom/PresenceHUD.tsx  — use context, 9-state badge, upgraded presence dots
src/components/kingdom/HeraldTicker.tsx — use context (remove fetch loop)
src/app/kingdom-map/client.tsx          — wrap in KingdomLiveProvider, add AgentPanel
src/lib/kingdom-store.ts               — deprecate useKingdomSync() (comment only, no delete)
```

### DO NOT TOUCH
```
src/app/api/local/[...path]/route.ts   — proxy works
party/kingdom-room.ts                  — PartyKit layer
KingdomScene3D.tsx                     — Phase E only
```

---

## ACCEPTANCE CRITERIA

- [ ] Single 15s interval, `Promise.allSettled`, atomic setState (one update per cycle)
- [ ] All HUD components use `useKingdomLive()` — zero per-component fetch loops
- [ ] `useKingdomSync()` has deprecation comment — NOT deleted
- [ ] Stale treatment: after 45s without data, components dim to 0.5 opacity + STALE badge
- [ ] AGENT_REGISTRY used everywhere — no hardcoded agent key strings in components
- [ ] `getAgent()` used for all agent lookups — never direct `agents['key']` access
- [ ] ClaudeStatusBadge shows 9 states (full STATE_COLORS + PULSE_MS)
- [ ] Tool badge appears on ClaudeStatusBadge and AgentPanel (with TOOL_CODES fallback = omit)
- [ ] PresenceStrip CLAUDE dot shows `CLAUDE  N/4` (count of active agents)
- [ ] TokenHUD border changes with intensity (dashed pulsing at high)
- [ ] RATE row in token feed with correct icon per level
- [ ] AgentPanel shows all 4 AGENT_REGISTRY agents, unknown agents from API are ignored
- [ ] HeraldTicker uses shared context (no independent fetch)
- [ ] TypeScript: 0 errors
- [ ] No hydration mismatches (all browser-only code in useEffect or gated on null state)

---

## BUILD ORDER

1. `kingdom-agents.ts` — registry, types, getAgent(), constants. Foundation.
2. `kingdom-live-context.tsx` — provider with single interval, stale handling.
3. Wire `client.tsx` to wrap HUD stack in provider.
4. `TokenHUD` → use context, add RATE row, add intensity border.
5. `PresenceHUD` → use context, 9-state badge, upgraded CLAUDE dot.
6. `HeraldTicker` → use context (remove fetch).
7. `AgentPanel` → new component, iterates registry.
8. Add `AgentPanel` to flex column stack in `client.tsx`.
9. `kingdom-store.ts` → add deprecation comment to `useKingdomSync()`.
10. TypeScript gate. Fix all errors before continuing.

---

*End of UPGRADE_PLAN_v2.md*
