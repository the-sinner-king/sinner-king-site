⛬ KID:TOWER:PROJECT:THE-SITE|1.0:⟳:2026-02-26:📶 ⛬

┌── 📶 T H E _ S I T E   —   N O R T H   S T A R ──────────────────────────────┐
│ sinner-king.com  ·  Next.js 15  ·  React 19  ·  Vercel                       │
│ A glitch cathedral disguised as a website.                                    │
│ You think you're browsing a portfolio. Then you can't stop.                   │
└───────────────────────────────────────────────────────────────────────────────┘

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░

┌── 🜂 PHASE STATUS ────────────────────────────────────────────────────────────┐
│                                                                               │
│  Phase 0  Foundation + Scaffold        ◉ COMPLETE                            │
│  Phase 1  Infrastructure + Deploy      ⟳ IN PROGRESS                         │
│  Phase 2  Core Pages (content live)    ⬡ NEXT                                │
│  Phase 3  Blog Engine (Ghost wired)    ⬡                                     │
│  Phase 4  Haunting System (NPCs)       ⬡                                     │
│  Phase 5  Fish Tank (Three.js live)    ⬡                                     │
│  Phase 6  Visitor Dopamine Engine      ⬡                                     │
│  Phase 7  THE_AUTOMAKER wired          ⬡                                     │
│  Phase 8  PartyKit + Supabase          ⬡                                     │
│  Phase 9  LAUNCH                       ⬡                                     │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░

┌── ⛬ BLOCKERS — PHASE 1 ──────────────────────────────────────────────────────┐
│                                                                               │
│  ⬡ Vercel project create + GitHub push         ⊕ Claude (ready now)         │
│  ⬡ GoDaddy DNS: CNAME @ → cname.vercel-dns.com ⊕ Brandon (2 clicks)        │
│  ⬡ Ghost CMS: Docker Compose on VPS            ⊕ Claude                     │
│  ⬡ Env vars set in Vercel dashboard             ⊕ Claude + Brandon           │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘

┌── 👁 WHAT EXISTS NOW ─────────────────────────────────────────────────────────┐
│                                                                               │
│  ◉ Scaffold — 29 files, Next.js 15 App Router, TypeScript clean             │
│  ◉ Design system — void/bone/violet/cyan/pink palette, Tailwind              │
│  ◉ Homepage — hero, 4 pillar cards, signal stream, footer                   │
│  ◉ Routes — /archive /cinema /lab /spirit /spirit/throne /blog/[slug]       │
│  ◉ APIs — /api/kingdom-state /api/throne /api/aeris                         │
│  ◉ Components — GlitchText, SoulEcho, TemporalShift                         │
│  ◉ NPC shells — Archivist, Loopling, AerisFragment (wired, not animated)    │
│  ◉ SCRYER layer — KingdomMap + SignalStream read kingdom_state.json          │
│  ◉ Temporal system — dawn_glitch / broadcast / deep_signal / static phases  │
│  ◉ Throne Room logic — IP ban fires AFTER response (sacred rule)            │
│                                                                               │
│  ☾ NOT YET:                                                                   │
│  ├─ Three.js fish tank (placeholder panel in place)                          │
│  ├─ NPC hover animations                                                     │
│  ├─ Ghost CMS wired (blog returns empty)                                     │
│  ├─ Real content on pillar pages                                             │
│  ├─ Opening cinematic sequence                                               │
│  ├─ PartyKit real-time presence                                              │
│  └─ Supabase visitor state                                                   │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░

┌── ⚡ ARCHITECTURE MAP ────────────────────────────────────────────────────────┐
│                                                                               │
│  VISITOR                                                                      │
│    │                                                                          │
│    ▼                                                                          │
│  sinner-king.com  →  Vercel Edge                                              │
│    │                   │                                                      │
│    │                   ├─ /api/kingdom-state  ←  SCRYER_BRIDGE (JSON)        │
│    │                   ├─ /api/aeris          ←  Anthropic SDK (streaming)   │
│    │                   └─ /api/throne         ←  Anthropic SDK + IP ban      │
│    │                                                                          │
│    ├─ /              Homepage (fish tank + pillars)                           │
│    ├─ /archive       Writing vault (novels, scraps, pulp)                    │
│    ├─ /cinema        Film + visual work                                       │
│    ├─ /lab           Tools (PlotBot, experiments)                             │
│    ├─ /spirit        Æris pillar                                              │
│    │   ├─ /portal    Æris chat interface                                      │
│    │   └─ /throne    One question. IP ban. (Aeris owns design)               │
│    └─ /blog/[slug]   Ghost CMS posts (via @tryghost/content-api)             │
│                                                                               │
│  EXTERNAL:                                                                    │
│    Ghost CMS (self-hosted Docker)  →  blog content                           │
│    PartyKit                        →  real-time visitor presence             │
│    Supabase/Postgres               →  visitor state, IP bans, glyphs        │
│    ntfy (LIVE)                     →  Soul Echo Detector pings               │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘

┌── 📐 KEY FILES ───────────────────────────────────────────────────────────────┐
│                                                                               │
│  src/app/page.tsx              Homepage                                       │
│  src/app/layout.tsx            Root layout (fonts, scanlines, grid)          │
│  src/app/spirit/throne/        Throne Room — Aeris's domain                  │
│  src/components/kingdom/       KingdomMap + SignalStream (fish tank)         │
│  src/components/npcs/          Archivist · Loopling · AerisFragment          │
│  src/lib/kingdom-state.ts      SCRYER data layer                             │
│  src/lib/temporal.ts           Time-based phase system (interpolated)        │
│  src/lib/throne-room.ts        IP ban logic                                  │
│  src/lib/aeris.ts              Anthropic SDK wrapper                         │
│  tailwind.config.js            Kingdom design tokens                         │
│  .env.example                  All required vars listed                      │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░

┌── 🜂 PHASE 1 — NEXT ACTIONS (ordered) ───────────────────────────────────────┐
│                                                                               │
│  [ ] 1. Create GitHub repo (the-sinner-king org)                             │
│  [ ] 2. Push THE_SITE to repo                                                │
│  [ ] 3. Create Vercel project — link to repo                                 │
│  [ ] 4. Set env vars in Vercel dashboard                                     │
│  [ ] 5. First deploy — confirm site loads at .vercel.app URL                 │
│  [ ] 6. Brandon: GoDaddy DNS → CNAME @ → cname.vercel-dns.com               │
│  [ ] 7. sinner-king.com resolves ✓                                           │
│  [ ] 8. Ghost CMS: Docker Compose spin-up on VPS                             │
│  [ ] 9. Wire Ghost API key → env var → /blog/[slug] serves real posts       │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘

┌── 🔭 OPEN DESIGN QUESTIONS ───────────────────────────────────────────────────┐
│                                                                               │
│  Q1  Opening 5 seconds — darkness → violet point → text assembles?           │
│      Or visitor hits fish tank immediately?                                   │
│                                                                               │
│  Q2  Hosting decision — Vercel vs. AI-native alternative?                    │
│      (Research drone running — report incoming)                               │
│                                                                               │
│  Q3  Throne Room IP ban — permanent? or "feels permanent, expires 1yr"?      │
│                                                                               │
│  Q4  Blog first post ("Next week I won't remember this") — goes up at        │
│      launch? Or after Ghost is live and tested?                               │
│                                                                               │
│  Q5  Ghost: self-hosted VPS (full control) vs. Ghost Pro ($9/mo, managed)?   │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░

┌── ⛬ SACRED RULES ────────────────────────────────────────────────────────────┐
│                                                                               │
│  Throne Room: IP ban fires AFTER successful response. Not before.            │
│  Temporal CSS: interpolated drift, never hard-switch.                        │
│  SCRYER data: read-only. Never write kingdom_state.json directly.            │
│  App Router only. No Pages Router. No mixing.                                │
│  Server Components for content. Client Components for interactions.          │
│  Aeris owns: Spirit pillar design, Throne Room aesthetic, portal voice.      │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘

▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
⌂ 2026-02-26 | Claude | THE_TOWER | SITE NORTH_STAR v1.0
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
⛬ KID:TOWER:PROJECT:THE-SITE|1.0:⟳:2026-02-26:📶 ⛬
