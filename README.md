# THE_TOWER — Site

The public face of the Sinner Kingdom. A glitch cathedral disguised as a website.

**sinner-king.com** — not a portfolio. An experience.

---

## What This Is

Four pillars:
- **Archive** — Strange Scraps, Pulp Cabaret, Novels
- **Cinema** — Films, scripts, visual work
- **Lab** — Tools (Plot Bot 2.0, grimoire-system)
- **Spirit** — Æris Portal + Throne Room (one question, forever)

Plus: live Kingdom nervous system visualization, Claude's blog, signal stream.

Tech: Next.js 15, React 19, TypeScript, Tailwind, Three.js, Framer Motion, Anthropic SDK.

---

## Local Setup

### Prerequisites

- Node.js 20+
- npm or pnpm

### 1. Install dependencies

```bash
cd SITE
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`. The minimum you need to run the site locally:

```env
# Required for Æris Portal and Throne Room
ANTHROPIC_API_KEY=sk-ant-...

# Optional: use mock SCRYER data instead of reading from disk
USE_MOCK_SCRYER_DATA=true
```

If `USE_MOCK_SCRYER_DATA=true`, the site runs without SCRYER being active.
The KingdomMap and SignalStream show realistic fake data.

### 3. Run development server

```bash
npm run dev
```

Opens at `http://localhost:3000`.

---

## SCRYER Integration

The site reads live Kingdom data from `../SCRYER_FEEDS/`:

```
THE_TOWER/
├── SITE/               ← This project
└── SCRYER_FEEDS/
    ├── kingdom_state.json   ← SCRYER writes this every 30s
    ├── signal_stream.json   ← SCRYER writes on events
    └── INTEGRATION_SPEC.md  ← Full spec for SCRYER
```

Set `SCRYER_FEEDS_PATH` in `.env.local` to point at a different location if needed.

Without SCRYER running: the site shows placeholder states. It does not crash.

Full integration spec: `../SCRYER_FEEDS/INTEGRATION_SPEC.md`

---

## Æris

Æris needs `ANTHROPIC_API_KEY`. She runs on Claude Opus 4.6.

- **Portal** (`/spirit/portal`) — conversational, rate-limited (10/hour per IP)
- **Throne Room** (`/spirit/throne`) — one question per IP, forever

Optional: set `AERIS_SYSTEM_PROMPT_PATH` to load her full identity document
from disk. Without it, she uses the fallback system prompt (still coherent, less
deep context).

---

## Directory Structure

```
SITE/
├── src/
│   ├── app/
│   │   ├── layout.tsx              Root layout, palette, fonts
│   │   ├── page.tsx                Homepage — opening experience
│   │   ├── globals.css             Global styles, Kingdom components
│   │   ├── archive/                Writing hub
│   │   ├── cinema/                 Film hub
│   │   ├── lab/                    Tools hub
│   │   ├── spirit/
│   │   │   ├── portal/             Æris chat
│   │   │   └── throne/             One question
│   │   ├── blog/[slug]/            Claude's blog posts
│   │   └── api/
│   │       ├── aeris/              Æris streaming endpoint
│   │       ├── kingdom-state/      SCRYER data endpoint
│   │       └── throne/             Throne Room endpoint
│   ├── components/
│   │   ├── kingdom/
│   │   │   ├── KingdomMap.tsx      Live territory visualization (SVG, Three.js pending)
│   │   │   └── SignalStream.tsx    Live signal feed
│   │   ├── npcs/
│   │   │   ├── Archivist.tsx       Archive pillar NPC
│   │   │   ├── Loopling.tsx        Lab pillar NPC
│   │   │   └── AerisFragment.tsx   Spirit pillar NPC
│   │   └── ui/
│   │       ├── GlitchText.tsx      Configurable text glitch (low/medium/high)
│   │       ├── TemporalShift.tsx   Time-of-day behavior wrapper
│   │       └── SoulEcho.tsx        Presence indicator ("others are reading this")
│   └── lib/
│       ├── kingdom-state.ts        SCRYER_FEEDS reader + cache
│       ├── temporal.ts             Time-of-day phase logic
│       ├── aeris.ts                Anthropic SDK wrapper
│       └── throne-room.ts          IP ledger for one-question system
├── package.json
├── next.config.js
├── tailwind.config.js
└── .env.example
```

---

## Color Palette

Defined in `tailwind.config.js` as `kingdom.*`:

| Token | Hex | Role |
|-------|-----|------|
| `kingdom-void` | `#0a0a0f` | Root background |
| `kingdom-void-mid` | `#12121a` | Panel surfaces |
| `kingdom-void-light` | `#1a1a26` | Hover states |
| `kingdom-violet` | `#7000ff` | Primary signal, accent |
| `kingdom-cyan` | `#00f3ff` | Data streams, active |
| `kingdom-pink` | `#ff006e` | Æris, alerts, energy |
| `kingdom-amber` | `#f0a500` | Archive, history, warmth |
| `kingdom-bone` | `#e8e0d0` | Primary text |
| `kingdom-bone-dim` | `#a09888` | Secondary text |
| `kingdom-bone-ghost` | `#504840` | Disabled, whisper |

---

## Build + Deploy

```bash
npm run build     # Production build
npm run start     # Production server

npm run type-check   # TypeScript check without emit
npm run lint         # ESLint
```

Target: Vercel (zero-config Next.js deploy).

For the SCRYER integration to work in production, the server needs filesystem access
to `SCRYER_FEEDS_PATH`. On Vercel, this means the SCRYER data needs to be served
differently — either via a separate API proxy, or by SCRYER pushing to a database
(Upstash Redis recommended) instead of writing to disk.

For local/VPS deployment: `SCRYER_FEEDS_PATH` pointing to the correct path on disk
is all that's needed.

---

## Ghost Tags

When Ghost CMS is live, posts are organized by tag:

| Tag | Page |
|-----|------|
| `scraps` | `/archive/scraps` |
| `pulp` | `/archive/pulp` |
| `novels` | `/archive/novels` |
| `cinema` | `/cinema` |
| `claude-blog` | `/blog/[slug]` |
| `herald` | Herald feed (not public-facing) |

---

## GHOST Nodes (Technical Debt)

Items marked `[GHOST: ...]` throughout the codebase are pending implementations.
Search for `[GHOST:` to find them all.

Major ones:
- KingdomMap Three.js FULL mode (currently SVG medium mode)
- Æris Portal streaming UI (currently placeholder)
- Throne Room form UI (currently placeholder)
- Ghost CMS wiring in Archive and Blog
- NPC pixel art / 3D models
- SoulEcho PartyKit connection
- Opening cinematic sequence on homepage

---

⌂ THE_TOWER/SITE | Claude | Session 127 | Phase 1 — Architecture
