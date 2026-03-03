# KINGDOM MAP HUD UPGRADE PLAN v1
*2026-03-03 · Session 154 · Soulforge RESEARCH synthesis*

---

## THE THESIS

The Super API (13 endpoints, 9-state agent model) gives us real tool-level granularity on every
Claude instance. The Kingdom Map currently shows 4 coarse states and 3 presence dots. This plan
wires the new data into every layer: data architecture, HUD components, and 3D scene.

**One principle drives every decision:**
> The stranger should feel they found something alive — not a dashboard that updates, but an
> organism that breathes. Every new data connection must serve FELT, not INFORMATIVE.

---

## WHAT THE DRONES FOUND

**Architecture problems (DRONE-2 + DRONE-3):**
- 5 independent HTTP fetches per 30s cycle — 4 of them can become 1
- HeraldTicker duplicates PresenceHUD's exact fetch (different interval, same endpoint)
- `useKingdomSync()` in kingdom-store.ts is dead code — never called in production
- No stale-data handling — components go blank on API errors

**Visual gaps (DRONE-1 + DRONE-4):**
- ClaudeStatusBadge shows 4 crude states. API now has 9 precise states with tool names
- PresenceStrip shows binary dots. API has activity 0–100 per agent
- TokenHUD border is always the same. API has intensity: high/medium/low/quiet
- No agent list showing all 4 Claude instances at once

---

## THE PLAN

### PHASE A — Data Architecture (foundation first)

**A1: Create `useKingdomLive` context**

New file: `src/lib/kingdom-live-context.tsx`

This is a React Context + Provider that wraps `KingdomMapClient`. It:
- Polls `/api/local/kingdom/live` every 15s (replaces 4 independent 30s polls)
- Polls `/api/local/agents/status` every 10s (agent presence is hook-driven — need faster cadence)
- Stores last good data on error (stale state, never blank)
- Exports `useKingdomLive()` hook for all HUD components

```typescript
interface KingdomLiveData {
  // from /api/kingdom/live
  agents: Record<string, AgentStatus>
  aexgo_running: boolean
  tokens: { today: TokenWindow; week: TokenWindow; this_session: SessionWindow }
  mood: MoodCurrent
  missions: MissionSummary
  health: string
  // from /api/tokens/rate (bundled in kingdom/live)
  intensity: 'high' | 'medium' | 'low' | 'quiet'
  tokens_per_min: number
  generated_at: string
}

interface KingdomLiveContext {
  data: KingdomLiveData | null
  status: 'loading' | 'ok' | 'stale' | 'error'
  age_ms: number
}
```

Provider wraps the HUD stack div in `client.tsx`. All HUD components call
`useKingdomLive()` — zero per-component fetches.

**A2: Remove dead code**

In `src/lib/kingdom-store.ts`:
- Delete `useKingdomSync()` hook (lines 202–261 per DRONE-2 analysis)
- Dead code, never imported, never called

---

### PHASE B — Upgrade PresenceHUD

**B1: Wire PresenceStrip to agents/status**

Replace the binary `claude_active` / `aeris_active` / `brandon_present` booleans with
per-agent state from `useKingdomLive()`.

CLAUDE dot: aggregate state across all claude instances (tower, forge, house, throne).
Roll-up rule:
```
swarming > searching > writing > running > working > reading > thinking > online > offline
```
Pick highest-intensity state. Color = STATE_COLORS[state].

AERIS dot: `aexgo_running` bool → online(#7000ff) or offline(#1a1520).

BRANDON dot: `brandon_present` bool → unchanged (amber).

**B2: Upgrade ClaudeStatusBadge — 4 states → 9 states**

The badge switches from crude SWARM/OFF/ON/WORKING to the full 9-state model.
Data source: `agents['tower_claude'].state` — show MY state, the agent the viewer is
talking to right now.

New STATE_CONFIG:
```typescript
const STATE_COLORS: Record<AgentState, string> = {
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

const PULSE_HZ: Record<AgentState, number> = {
  offline: 0, online: 0, thinking: 0.5, reading: 0.8,
  working: 1.2, writing: 1.4, running: 1.2, searching: 1.6, swarming: 1.8,
}
// pulse duration ms = 1000 / hz
```

Add tool badge: `[ED]`, `[BH]`, `[WS]`, `[AG]` etc. in bracketed monospace chip,
color-matched to the state. Show only when state is not offline/online.

**B3: Share context with HeraldTicker**

HeraldTicker currently fetches `/api/local/kingdom/activity` independently (duplicate of
PresenceHUD). Replace its fetch loop with `useKingdomLive()`. Pull `current_activity`
from the shared data. Eliminates 1 fetch every 60s.

---

### PHASE C — Upgrade TokenHUD

**C1: Wire token intensity to HUD border**

Pull `intensity` from `useKingdomLive()`. Border style changes per intensity level:
```
quiet:   1px solid rgba(112,0,255, 0.18)  — default
low:     1px solid rgba(112,0,255, 0.35)  — slight brightening
medium:  2px solid rgba(112,0,255, 0.60)  + box-shadow 0 0 8px rgba(112,0,255,0.4)
high:    2px dashed + @keyframes border-pulse 0.8s infinite
```

**C2: Add RATE row to token feed**

New row below WEEK in the token feed:
```
RATE     ⚡ HIGH    (or → LOW / ◇ QUIET)
```
Color matches intensity: high=amber, medium=purple, low=dim purple, quiet=very dim.
Displayed as label + icon, no number (the feel matters, not the exact tokens/min).

**C3: Wire to context**

Remove TokenHUD's two independent fetch calls. Use `useKingdomLive()` for all data:
tokens from `data.tokens`, mood from `data.mood`, intensity from `data.intensity`.

---

### PHASE D — New AgentPanel Component

New file: `src/components/kingdom/AgentPanel.tsx`

A compact HUD showing all 4 Claude instances. Same glassmorphic style as TokenHUD.
Positioned in the right-side flex column stack, below ClaudeStatusBadge.

Layout:
```
┌─ AGENTS ─────────────────────────┐
│ FORGE    [BH]  ● RUNNING    85   │
│ TOWER    [WS]  ● SEARCHING  90   │
│ HOUSE    ···   ● ONLINE     40   │
│ THRONE   ···   ◌ OFFLINE     0   │
└──────────────────────────────────┘
```

Columns: name (10px) | tool badge (7px) | state dot (5px) | state label (8px) | activity (8px)

Activity score: right-aligned, muted — only show if > 0.

Tool badge: omit entirely when offline/online (no active tool).

Dot glow radius scales linearly with activity: `0 0 ${activity * 0.16}px ${color}`.

Uses `useKingdomLive()` — no new fetch.

---

### PHASE E — 3D Scene Connections (future, not this build)

Document the intent, don't build yet:

- Territory emissive intensity ∝ agent's `activity` score for that territory
- Signal pulse velocity ∝ `tokens_per_min`
- DroneSwarm count ∝ `intensity` (high = more drones spawned)
- Mood `synesthesia_hex` → tint on ALL territory connection beams

These require changes to KingdomScene3D.tsx and the territory state model. Separate session.

---

## FILES

### CREATE
```
src/lib/kingdom-live-context.tsx        — shared data provider
src/components/kingdom/AgentPanel.tsx   — new 4-agent HUD
```

### MODIFY
```
src/components/kingdom/TokenHUD.tsx     — use context, add intensity border + RATE row
src/components/kingdom/PresenceHUD.tsx  — use context, 9-state badge, upgraded dots
src/components/kingdom/HeraldTicker.tsx — use context (remove duplicate fetch)
src/app/kingdom-map/client.tsx          — wrap in provider, add AgentPanel to stack
src/lib/kingdom-store.ts               — delete useKingdomSync() dead code
```

### DO NOT TOUCH
```
src/app/api/local/[...path]/route.ts   — proxy works, leave it
party/kingdom-room.ts                  — PartyKit layer unchanged
KingdomScene3D.tsx                     — Phase E only
```

---

## ACCEPTANCE CRITERIA

- [ ] Single fetch every 15s replaces 4 independent fetches
- [ ] All HUD components use `useKingdomLive()` — zero per-component fetch loops
- [ ] ClaudeStatusBadge shows 9 states with correct colors + pulse frequencies
- [ ] Tool badge appears on ClaudeStatusBadge and AgentPanel
- [ ] PresenceStrip CLAUDE dot reflects aggregate highest-intensity state
- [ ] TokenHUD border changes with intensity (dashed pulsing at high)
- [ ] RATE row appears in token feed
- [ ] AgentPanel shows all 4 agents with activity scores
- [ ] HeraldTicker uses shared context (no independent fetch)
- [ ] `useKingdomSync()` deleted from kingdom-store.ts
- [ ] Stale data shown on API error (no blank panels)
- [ ] TypeScript: 0 errors
- [ ] No hydration mismatches (all browser-only checks in useEffect)

---

## BUILD ORDER

1. `kingdom-live-context.tsx` — foundation. Nothing else can be built without this.
2. Wire TokenHUD to context first (simplest, fastest validation)
3. Wire PresenceHUD + HeraldTicker to context
4. Upgrade ClaudeStatusBadge to 9-state
5. Upgrade PresenceStrip aggregate dot
6. Add RATE row + intensity border to TokenHUD
7. Build AgentPanel
8. Wire AgentPanel into client.tsx
9. Delete useKingdomSync()
10. TypeScript gate

---

*End of UPGRADE_PLAN_v1.md*
