# PHASE 5.3 — 3D SCENE DATA CONNECTIONS
*2026-03-03 · Session 155 · Post-Granny v2 research swarm*

---

## THE THESIS

Phase 5.2 gave the HUD a pulse. The AgentPanel shows state. The badge shows what tool I'm holding.
But the 3D scene — the thing a stranger actually FEELS — still runs on SCRYER status (3 states) and
wall-clock events.

Phase 5.3 closes the gap. The territories breathe with real agent activity. The data streams flow
faster when tokens are burning. The sky tints when mood is charged. Not a dashboard. An organism.

---

## WHAT THE DRONES FOUND

### The Gap (DRONE-1 findings)

| Visual Element | Currently Driven By | Missing |
|---|---|---|
| Territory emissive glow | 3-state (offline/stable/working) | activity 0-100 gradient |
| TimeStream particle speed | 3-state status | activity-driven flow rate |
| Connection beams | avg(activity) — already wired ✓ | mood.synesthesia_hex tint |
| DroneSwarm intensity | animation phase only | source territory activity |
| Bloom / post-processing | nothing | mood.voltage |

### The Architecture Decision (DRONE-2 finding)

**Option A: Feed KingdomLiveData INTO KingdomStore (CHOSEN)**

Why:
- R3F components read from `useKingdomStore.getState()` inside `useFrame` — synchronously, every frame
- They can't subscribe to React Context without breaking the R3F render loop
- One store = one source of truth = synchronized timing
- `usePartyKitSync` handles SCRYER → store; we add a parallel path for token_api → store

The 3D scene never learns that two different API sources exist. It just reads `getActivity()` and
`getMood()` from one place. Clean.

### The Priority Decision (DRONE-4 finding)

DRONE-4 recommendation: **Deploy first (B), then Phase 5.3 (A)**.

Rationale: "Don't build Phase 5.3 in isolation on localhost. Build it live, with real strangers
tapping the glass. That's when you know if it sings."

This plan is written but **intentionally not the next thing executed**. Deploy comes first.
Then Phase 5.3 ships into a live system that strangers can actually feel.

---

## THE PLAN

### PHASE A — Store Architecture

#### A1: Add TERRITORY_TO_AGENT mapping to kingdom-agents.ts

```typescript
// Maps territory IDs → agent keys for the 4 Claude-inhabited territories
// Territories without agents (core_lore, the_scryer) are not in this map
export const TERRITORY_TO_AGENT: Partial<Record<string, AgentKey>> = {
  the_forge:   'forge_claude',
  the_tower:   'tower_claude',
  claude_house: 'claude_house',
  the_throne:  'throne_claude',
}
```

#### A2: Extend KingdomStore with mood + agent states

Add to `src/lib/kingdom-store.ts`:

```typescript
import type { AgentStatus, AgentState } from './kingdom-agents'
import type { KingdomLiveData } from './kingdom-live-context'

// New store fields
mood: KingdomLiveData['mood'] | null
agentStates: Record<string, AgentStatus>   // keyed by agent key (e.g. 'tower_claude')

// New actions
hydrateMood: (mood: KingdomLiveData['mood']) => void
hydrateAgentStates: (agents: Record<string, AgentStatus>) => void

// New getters (safe in useFrame — read from getState())
getMood: () => KingdomLiveData['mood'] | null
getAgentActivity: (territoryId: string) => number   // 0–100, looks up by TERRITORY_TO_AGENT
getAgentState: (territoryId: string) => AgentState  // returns 'offline' if not in map
```

#### A3: Wire KingdomLiveContext → KingdomStore in client.tsx

New hook inside client.tsx (below KingdomLiveProvider):

```typescript
function KingdomLiveSync() {
  const { data } = useKingdomLive()

  useEffect(() => {
    if (!data) return
    const store = useKingdomStore.getState()
    store.hydrateMood(data.mood)
    store.hydrateAgentStates(data.agents)
  }, [data])

  return null  // pure side-effect component
}
```

Render `<KingdomLiveSync />` inside `<KingdomLiveProvider>` in client.tsx.

---

### PHASE B — Territory Emissive

#### B1: TerritoryNode — activity gradient

In `KingdomScene3D.tsx`, `TerritoryNode.useFrame`:

```typescript
// CURRENT (3-state lookup):
const buildingState = deriveBuildingState(status)
const cfg = BUILDING_STATE_CONFIG[buildingState]
const targetIntensity = cfg.emissiveBase + breathe

// REPLACE WITH (activity gradient):
const agentActivity = useKingdomStore.getState().getAgentActivity(territory.id)
const activityNorm   = Math.pow(agentActivity / 100, 1.2)   // perceptual gamma
const breatheAmp     = cfg.breatheAmplitude > 0
  ? Math.sin(t * cfg.breatheFreq + offset * 0.5) * cfg.breatheAmplitude
  : 0
const targetIntensity = cfg.emissiveBase + (activityNorm * cfg.breatheAmplitude) + breatheAmp
```

Effect: territories that are truly busy (activity 80-100) glow brighter and breathe faster.
Territories in low-activity states dim and slow. The world breathes with the work.

---

### PHASE C — TimeStream Flow

#### C1: TimeStream — activity-driven speed

In `TimeStream.tsx`, the per-beam animation:

```typescript
// CURRENT (3-state):
const speedMul = sourceStatus === 'active' ? 1.00 : sourceStatus === 'idle' ? 0.35 : 0.0

// REPLACE WITH (activity gradient):
const sourceActivity = useKingdomStore.getState().getAgentActivity(beam.sourceId) / 100
const speedMul       = sourceStatus === 'offline' ? 0.0 : (0.20 + sourceActivity * 0.80)

beam.material.opacity = 0.08 + speedMul * 0.25  // 0.08–0.33
// p.progress += delta * FLOW_SPEED * speedMul   (line 197 — already uses speedMul)
```

Effect: streams from busy agents flow fast and bright. Quiet agents barely trickle.
The SCRYER gets more or less data depending on how much I'm doing.

---

### PHASE D — Mood Tint

#### D1: Connection beams — mood.synesthesia_hex tint

In `ConnectionBeam.useFrame`:

```typescript
// Add after opacity calculation:
const mood = useKingdomStore.getState().getMood()
if (mood?.synesthesia_hex) {
  material.color.set(mood.synesthesia_hex)
} else {
  material.color.set('#7000ff')  // fallback: ACCENT purple
}
```

Effect: when I'm in a FLOW state (#FFB347), the connection beams glow amber instead of purple.
The whole scene shifts color with my mood. Subtle but FELT.

#### D2: Bloom — mood.voltage

Add `<Bloom>` postprocessing (already in package via `@react-three/postprocessing`):

In `KingdomScene3D.tsx`:

```typescript
import { EffectComposer, Bloom } from '@react-three/postprocessing'

// Inside the Canvas, after all mesh groups:
<EffectComposer>
  <Bloom
    intensity={bloomIntensity}   // read from getMood().voltage ?? 0.5
    luminanceThreshold={0.3}
    luminanceSmoothing={0.9}
    mipmapBlur
  />
</EffectComposer>
```

Recalculate `bloomIntensity` in a `useFrame` inside a `<Bloom>` wrapper component that reads from
the store every frame. Range: voltage 0.0 → 0.2 bloom, voltage 1.0 → 1.2 bloom.

Effect: high-voltage sessions have a visible glow bloom on all emissive objects.
The scene pulses with creative energy. The stranger feels the charge.

---

## FILES

### MODIFY
```
src/lib/kingdom-agents.ts              — add TERRITORY_TO_AGENT mapping
src/lib/kingdom-store.ts               — add mood + agentStates + hydrate actions + getters
src/app/kingdom-map/client.tsx          — add KingdomLiveSync side-effect component
src/components/kingdom/KingdomScene3D.tsx — wire activity to TerritoryNode + ConnectionBeam + Bloom
src/components/kingdom/TimeStream.tsx   — wire activity to particle flow speed
```

### DO NOT TOUCH
```
src/lib/kingdom-live-context.tsx  — context is stable, no changes needed
party/kingdom-room.ts             — PartyKit layer unchanged
```

---

## ACCEPTANCE CRITERIA

- [ ] `TERRITORY_TO_AGENT` in kingdom-agents.ts maps 4 territories → 4 agent keys
- [ ] KingdomStore has `agentStates`, `mood`, `hydrateMood()`, `hydrateAgentStates()`
- [ ] KingdomLiveSync dispatches on every 15s context update
- [ ] TerritoryNode emissive uses activity gradient (not just 3-state status)
- [ ] TimeStream particle speed uses activity gradient (not just 3-state status)
- [ ] ConnectionBeam color shifts with mood.synesthesia_hex (fallback: #7000ff)
- [ ] Bloom postprocessing intensity ∝ mood.voltage
- [ ] TypeScript: 0 errors
- [ ] No hydration mismatches
- [ ] Granny Codex: run before shipping

---

## BUILD ORDER

1. `kingdom-agents.ts` — add TERRITORY_TO_AGENT (small, foundational)
2. `kingdom-store.ts` — add mood + agentStates fields + hydrate actions + getters
3. `client.tsx` — add KingdomLiveSync component (bridge hook)
4. `KingdomScene3D.tsx` — wire TerritoryNode activity gradient
5. `TimeStream.tsx` — wire activity-driven flow speed
6. `KingdomScene3D.tsx` — wire ConnectionBeam mood tint
7. `KingdomScene3D.tsx` — add Bloom postprocessing
8. TypeScript gate
9. Granny Codex audit

---

## NOTE ON SEQUENCING

DRONE-4 strategic recommendation: **Deploy first, Phase 5.3 second.**

The 3D scene responding to real agent activity is more powerful when real strangers can feel it.
Deploy gates: Brandon GoDaddy DNS CNAME (2 clicks) + Vercel env vars.

Execute this plan AFTER the site is live at sinner-king.com.

---

*End of PHASE_53_PLAN.md*
