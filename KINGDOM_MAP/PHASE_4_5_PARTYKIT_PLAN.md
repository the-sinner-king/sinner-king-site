# Phase 4.5: PartyKit Real-Time Push — Implementation Plan
# KID:TOWER:PLAN:PHASE_4_5|1.0:⟳:2026-03-01

## Status: READY TO BUILD

partykit@0.0.109 + partysocket@1.1.16 already installed. No partykit.json yet.

---

## Data Flow

```
SCRYER write cycle (every 60s)
  ↓
SCRYER_FEEDS/{kingdom_state,signal_stream,active_events}.json
  ↓
scryer-tower-feed.sh — curl POST → /api/kingdom-push (backgrounded, non-blocking)
  ↓
/api/kingdom-push route — validates secret, reads fresh state, POSTs to PartyKit
  ↓
party/kingdom-room.ts — caches last payload, broadcasts to all WS connections
  ↓
Browser (partysocket) — onmessage → store.hydrate/hydrateSignals/pushDroneSwarm
  ↓ (fallback when WS down)
30s setInterval → /api/kingdom-state (existing REST, preserved)
```

---

## What Gets Pushed vs Polled

| Data | Transport |
|------|-----------|
| kingdom_state (territories, presence) | WS push + 30s fallback |
| signal_stream | WS push + 30s fallback |
| active_events (drone swarms) | WS push + 30s fallback |
| SSR/initial page load | REST GET /api/kingdom-state |

---

## Build Sequence (each step independently testable)

### Step 1 — partykit.json (2 min)
Create at THE_SITE root:
```json
{
  "name": "kingdom-room",
  "main": "party/kingdom-room.ts",
  "compatibilityDate": "2024-01-01"
}
```

### Step 2 — party/kingdom-room.ts (15 min)
PartyKit room server (deploys to partykit.dev, NOT Vercel):
```typescript
import type * as Party from 'partykit/server'

const PUSH_SECRET = process.env.KINGDOM_PUSH_SECRET

export default class KingdomRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    // Send last cached state to late-joiners — instant update, no wait
    const stored = await this.room.storage.get<string>('lastPayload')
    if (stored) conn.send(stored)
  }

  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const secret = req.headers.get('x-kingdom-secret')
    if (PUSH_SECRET && secret !== PUSH_SECRET) return new Response('Unauthorized', { status: 401 })
    const payload = await req.text()
    try { JSON.parse(payload) } catch { return new Response('Invalid JSON', { status: 400 }) }
    await this.room.storage.put('lastPayload', payload)
    this.room.broadcast(payload)
    return new Response('OK', { status: 200 })
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (message === 'ping') {
      const stored = await this.room.storage.get<string>('lastPayload')
      if (stored) sender.send(stored)
    }
  }
}

KingdomRoom satisfies Party.Worker
```

Test: `npx partykit dev` (port 1999), then POST to room endpoint, verify WS receives.

### Step 3 — /api/kingdom-push/route.ts (15 min)
Thin Next.js route — validates secret, reads fresh state, forwards to PartyKit:
```typescript
// src/app/api/kingdom-push/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getKingdomPayload } from '@/lib/kingdom-state'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PUSH_SECRET    = process.env.KINGDOM_PUSH_SECRET
const PARTYKIT_HOST  = process.env.PARTYKIT_HOST ?? 'localhost:1999'
const PARTYKIT_ROOM  = 'main'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-kingdom-secret')
  if (PUSH_SECRET && secret !== PUSH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const payload = await getKingdomPayload()
    const body    = JSON.stringify(payload)
    const pkRes   = await fetch(
      `https://${PARTYKIT_HOST}/parties/main/${PARTYKIT_ROOM}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-kingdom-secret': PUSH_SECRET ?? '' }, body }
    )
    if (!pkRes.ok) return NextResponse.json({ error: 'PartyKit error' }, { status: 502 })
    return NextResponse.json({ ok: true, timestamp: Date.now() })
  } catch (err) {
    console.error('[kingdom-push]', err)
    return NextResponse.json({ error: 'Push failed' }, { status: 500 })
  }
}
```

NOTE — Vercel prod gotcha: Vercel can't read local SCRYER_FEEDS files. Fix: have SCRYER POST payload body directly to push endpoint rather than having route re-read disk. Plan for Step 9.5.

### Step 4 — usePartyKitSync in kingdom-store.ts (30 min)
Add new hook alongside existing useKingdomSync (keep old one, don't delete).
Extract shared drone-hydration logic into local `applyActiveEvents(data, store)` helper — avoid copy-paste between WS handler and fallback poll.

```typescript
// Shared helper — avoids duplication between WS handler and fallback
function applyActiveEvents(data: Record<string, unknown>, store: KingdomStore) {
  if (!data.activeEvents || !(data.activeEvents as {events?: unknown[]}).events?.length) return
  const events = (data.activeEvents as {events: KingdomEvent[]}).events
  const existingIds = new Set(store.activeDroneSwarms.map(s => s.id))
  for (const event of events) {
    if (!existingIds.has(event.id) && Date.now() < event.expiresAt) {
      store.pushDroneSwarm({ ... })
    }
  }
}

export function usePartyKitSync(fallbackInterval = 30_000) {
  // WS connect, 3s timeout → activate fallback, on open → clear fallback
  // onmessage → hydrate(state) + hydrateSignals(stream) + applyActiveEvents(data, store)
  // onclose → restart fallback poll
}
```

### Step 5 — Swap call site in KingdomScene3D.tsx (5 min)
Replace `useKingdomSync()` with `usePartyKitSync()`. One import, one line.

### Step 6 — .env.local + .env.example (5 min)
```
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999
KINGDOM_PUSH_SECRET=kingdom-local-dev-secret
PARTYKIT_HOST=localhost:1999
```

### Step 7 — scryer-tower-feed.sh webhook (5 min)
At end of script, after JSON writes:
```bash
if command -v curl >/dev/null 2>&1; then
  curl -s -X POST "http://localhost:3000/api/kingdom-push" \
    -H "x-kingdom-secret: ${KINGDOM_PUSH_SECRET:-kingdom-local-dev-secret}" \
    --max-time 5 --silent --output /dev/null &
fi
```

### Step 8 — Deploy party server + Vercel env vars (10 min)
```bash
npx partykit deploy --name kingdom-room
```
Then set in Vercel dashboard:
- NEXT_PUBLIC_PARTYKIT_HOST = kingdom-room.YOURNAME.partykit.dev
- KINGDOM_PUSH_SECRET = <strong random>
- PARTYKIT_HOST = kingdom-room.YOURNAME.partykit.dev

### Step 9 — Latency verification (10 min)
Add timestamp to push payload. Log in onmessage handler.
Target: under 400ms from SCRYER write to browser receipt.

### Step 9.5 — Prod payload-in-body mode (future)
When SCRYER runs on a remote machine, it can't read Vercel's filesystem.
Change: SCRYER POSTs the payload body directly to /api/kingdom-push.
/api/kingdom-push accepts EITHER mode: re-read from disk (local dev) OR use body (prod/remote).

---

## Dev Setup Note

Two terminals required for local dev:
```bash
npm run dev      # Next.js port 3000
npx partykit dev # PartyKit port 1999
```

Add to package.json scripts:
```json
"dev:all": "concurrently \"npm run dev\" \"npx partykit dev\""
```

---

## Key Gotchas

1. NEXT_PUBLIC_* vars baked at build time — set before first Vercel build
2. PartyKit room name 'main' is shared — all visitors same room (correct for broadcast)
3. partysocket auto-reconnects with exponential backoff — don't rely on 'error' alone for fallback trigger
4. PartyKit is Cloudflare Workers/Durable Objects under hood — NOT a Vercel function
5. Don't set hibernate:true — storage survives but reconnect latency increases
6. Durable Object storage cost at 60s write cadence: negligible on free tier
