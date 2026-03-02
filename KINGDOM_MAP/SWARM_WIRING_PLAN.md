# Swarm Wiring Plan — Real Kingdom Events
# KID:TOWER:PLAN:SWARM_WIRING|1.0:⟳:2026-03-01

## Status: READY TO BUILD

SwarmLauncher test buttons stay. Real hooks write active_events.json.
The browser already reads it correctly — just need the writers.

---

## The Boundary Rule

**Scripts write. The browser reads. Never the reverse.**

Real events → hook/scryer writes active_events.json → 5s poll reads it → dedup by id → pushDroneSwarm()
Test events → SwarmLauncher button → pushDroneSwarm() directly → ephemeral, session-local, no JSON write

---

## 5 Button → Real Event Mapping

| Button | Color | Direction | Real Trigger |
|--------|-------|-----------|-------------|
| SEARCH ONLINE | #7000ff | off_screen | WebSearch or WebFetch tool call |
| DEPLOY FORGE | #f0a500 | to_territory: the_forge | Bash tool with THE_FORGE in cwd/command |
| THRONE SYNC | #ff006e | to_territory: the_throne | Write to @AERIS_TOWER_MAILBOX or AExTOWER/MAILBOXES |
| SCRYER SCAN | #00f3ff | to_territory: the_scryer | SCRYER cycle completes with ACTIVE_SIGNALS > 0 |
| TOWER BUILD | #9b30ff | to_territory: the_tower | Write or Edit to THE_SITE/src/ |

---

## active_events.json Schema

(NOT currently documented in INTEGRATION_SPEC.md — document it in Step 1)

```json
{
  "lastUpdated": 1772251888528,
  "version": "1.0",
  "events": [
    {
      "id": "{type}-{timestamp_ms}",
      "type": "search_swarm | drone_swarm | audit | debug | deploy | generic",
      "label": "Human readable label",
      "sourceTerritoryId": "claude_house",
      "targetTerritoryId": "" | "the_forge" | "the_throne" | "the_scryer" | "the_tower",
      "direction": "off_screen | to_territory",
      "startedAt": 1772251888506,
      "expiresAt": 1772251918506
    }
  ]
}
```

Rules:
- direction "off_screen" → targetTerritoryId: ""
- direction "to_territory" → valid territory ID required
- expiresAt = startedAt + durationMs (standard 30000)
- Prune expired before appending on every write
- Atomic write: tmp → rename (APFS atomic)
- Store enforces max 5 active at a time via pushDroneSwarm .slice(0, 5)

---

## Build Sequence

### Step 1 — Document active_events.json in INTEGRATION_SPEC.md
Third feed file, never documented. Add schema, TTL rules, write pattern.

### Step 2 — Write trigger-swarm.sh (generalized)
Location: SCRYER_FEEDS/trigger-swarm.sh
Args: type label sourceTerritoryId targetTerritoryId direction durationMs
Pattern: trigger-search.sh already does this for search_swarm. Generalize it.
trigger-search.sh becomes a thin wrapper calling trigger-swarm.sh.

### Step 3 — PostToolUse hooks in THE_TOWER/.claude/settings.json
Add matchers alongside existing PostToolUse entry.
Hook script reads stdin JSON for TOOL_INPUT, checks path/command condition, self-aborts if not matched:

```
WebSearch | WebFetch → trigger-swarm.sh search_swarm "Web Search" claude_house "" off_screen 30000
Write(path∋THE_SITE/src/) → trigger-swarm.sh drone_swarm "Tower Build" claude_house the_tower to_territory 30000
Write/Edit(path∋@AERIS_TOWER_MAILBOX) → trigger-swarm.sh drone_swarm "Throne Sync" claude_house the_throne to_territory 30000
Bash(command∋THE_FORGE) → trigger-swarm.sh drone_swarm "Deploy Forge" claude_house the_forge to_territory 30000
```

Pattern to follow: claude-working.sh reads stdin JSON and extracts fields.

### Step 4 — SCRYER SCAN in scryer-tower-feed.sh
At end of Python block, after atomic rename, add:
When ACTIVE_SIGNALS > 0: write drone_swarm event toward the_scryer, duration 20000ms.

```python
if safe_int("${ACTIVE_SIGNALS}") > 0:
    import time, uuid
    now_ms = int(time.time() * 1000)
    scan_event = {
        "id": f"drone_swarm-{now_ms}",
        "type": "drone_swarm",
        "label": "SCRYER Scan",
        "sourceTerritoryId": "the_tower",
        "targetTerritoryId": "the_scryer",
        "direction": "to_territory",
        "startedAt": now_ms,
        "expiresAt": now_ms + 20000,
    }
    # append to active_events.json (same prune-append-rename pattern)
```

### Step 5 — getMockActiveEvents() in kingdom-state.ts
Add mock parallel to getMockKingdomState().
Wire behind USE_MOCK_SCRYER_DATA guard in getActiveEvents().
Return 1 sample search_swarm event so dev mode shows a drone without SCRYER running.

### Step 6 — Update INTEGRATION_SPEC.md
Document active_events.json as third feed file after all above is working.

---

## What NOT to Change

- SwarmLauncher.tsx — test buttons stay exactly as-is, forever useful
- DroneSwarm.tsx — handles both directions correctly
- useKingdomSync hydration — already correct
- active_events.json schema — clean, don't add fields
- The dedup logic by event.id — correct and collision-resistant

---

## Critical Files

- THE_TOWER/.claude/settings.json — add PostToolUse matchers
- SCRYER_FEEDS/trigger-search.sh — pattern to generalize into trigger-swarm.sh
- ~/.forge-scryer/scryer-tower-feed.sh — SCRYER SCAN swarm write at cycle end
- THE_SITE/src/lib/kingdom-state.ts — getMockActiveEvents() + guard in getActiveEvents()
- SCRYER_FEEDS/INTEGRATION_SPEC.md — document active_events.json schema

---

## Architecture Diagram

```
THE_TOWER/.claude/settings.json (PostToolUse hooks)
  WebSearch/WebFetch ────────────────────────────┐
  Write(THE_SITE/src/) ───────────────────────── │
  Write(@AERIS_MAILBOX) ──────────────────────── │──→ trigger-swarm.sh
  Bash(THE_FORGE) ────────────────────────────── │         ↓
                                                  └──→ SCRYER_FEEDS/active_events.json
scryer-tower-feed.sh (60s cycle, ACTIVE_SIGNALS > 0) ────────────────────────────────────────────────↑

active_events.json ← 5s poll → /api/kingdom-state → useKingdomSync → pushDroneSwarm() → DroneSwarm.tsx
```
