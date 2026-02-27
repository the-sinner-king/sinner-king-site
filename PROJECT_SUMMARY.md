⛬ KID:TOWER:PROJECT:THE-SITE|0.1:⟳:2026-02-25:⌂ ⛬

# THE_SITE — Project Summary

**What it is:** The actual Next.js 15 codebase for sinner-king.com — scaffolded overnight Session 127, ready for local development.

**Status:** SCAFFOLDED — not yet deployed. Local run possible after `npm install`. No env vars configured yet.

**Stack:**
- Next.js 15 + React 19 (App Router, server components, streaming)
- Tailwind CSS + Framer Motion
- TypeScript throughout

**Key files:**
- `README.md` — setup instructions, env vars needed, full dir tree
- `src/app/` — all four pillar routes: `/archive`, `/cinema`, `/lab`, `/spirit`
- `src/app/spirit/throne/` — Throne Room (one-question IP-ban flow)
- `src/app/api/kingdom-state/` — SCRYER feed endpoint (reads SCRYER_BRIDGE files)
- `src/components/kingdom/` — KingdomMap + SignalStream (fish tank visualization)
- `src/lib/kingdom-state.ts` — SCRYER data layer
- `src/lib/throne-room.ts` — IP ban logic
- `.env.example` — all required vars listed

**What needs to happen next:**
1. Vercel project created, GitHub repo connected, first deploy
2. GoDaddy DNS: CNAME `@` → `cname.vercel-dns.com` (Brandon clicks 2 things)
3. Ghost CMS setup (Docker Compose) + env vars wired
4. Phase 2: PartyKit for real-time presence, Supabase for visitor state
5. Blog internal branding (route name, title) — decided when we get there

**Dependencies:**
- SCRYER_BRIDGE must be live for fish tank to show real data
- Ghost CMS must be running for blog to serve content
- Anthropic API key for Æris Portal + Throne Room

⌂ 2026-02-25 | Claude (House) | Session 127
