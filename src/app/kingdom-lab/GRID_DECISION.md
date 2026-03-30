<aesthetic_rationale>
## Spatial Architecture Reasoning — GRID_GHOST

### What I demolished and why

The current layout is a collection of independently positioned elements — each floated into its corner with `position: absolute`, each unaware of the others. StatusBar top-left, SwarmLauncher bottom-left, HeraldTicker bottom-center, AgentPanel wherever. There is no spatial grammar. These elements don't relate. They coexist as roommates, not a system.

The territory labels are worse: a 5×5px dot next to 10px uppercase mono. It's a tooltip. It has no mass. A building that pulses with emissive intensity at 1.4 deserves a label that carries equal structural weight — not an afterthought bubble floating above it.

The info panel (AgentPanel) is a floating card with blur backdrop. It's every SaaS dashboard component ever built. Rounded corners. Soft border. It does not feel like a submarine instrument panel. It feels like a Notion widget.

### The new doctrine

**ONE GRID RULES THE PERIMETER.** The HUD is not three elements — it is one frame. The canvas is the painting; the HUD is the frame. The frame has load-bearing columns. The swarm launcher, the status strip, the herald ticker — they are all the same structural object, articulated differently across the grid tracks.

**THE LABEL IS A RULER, NOT A TOOLTIP.** The territory label gets a hard left edge. A colored vertical rule (the territory color) sits flush-left, 3px wide. The territory name hangs 14px from that edge, rotated slightly for selected states. A scanline underline tracks the building state — static for OFFLINE, breathing width for STABLE, full-bleed cycling for WORKING. The dot does not disappear — it grows. 14×14px for WORKING states. 6×6px for STABLE. 4×4px hollow ring for OFFLINE.

**THE INFO PANEL IS BOLTED, NOT FLOATING.** When a territory is selected, the panel does not slide in from the right as a modal card. It DROPS from the top-right column of the HUD frame — like a blast shield descending. It occupies a named grid track. Its left edge has a 3px territory-colored border-left. No border-radius beyond 0px. Its internal layout is a subgrid — territory name on one track, description on another, agent state on another. Each row is a horizontal rule of information.

**BRUTALIST NEGATIVE SPACE.** The gap between the HUD perimeter and the canvas is 24px hard. No gutter adjustments. The signal stream (HeraldTicker) is not a bottom-center ornament — it is the full bottom rail of the HUD frame, spanning corner to corner, with its label (`GOLDFISH`) pinned left at the same x-coordinate as the swarm launcher column. Spatial continuity. The eye tracks left column down → GOLDFISH label → ticker text. One read path.

**ASYMMETRY IS STRUCTURAL.** The HUD left column (swarm launcher) is 220px wide. The HUD right column (status + panel) is 280px wide. They are not symmetric. The wider right column holds the territory detail because territory names vary in length. The left column's narrower track creates tension — the eye moves right seeking resolution. This is intentional. The canvas (the Kingdom itself) sits in the unconstrained center track, bleeding full width.

**LIGHT SOURCE DISCIPLINE.** The territory-colored glow on labels has a defined source: the emissive building below. The shadow under active labels falls at 0deg (directly down) because the point light is directly above the building. Labels do not cast shadows onto each other. The info panel's colored border-left is the only decorative glow on the panel — no `box-shadow`, no backdrop bloom. The light that bleeds off the panel comes from the label rule (territory color at 0.6 opacity), not from the panel itself.

**Z-PATTERN SHATTERED.** Standard reading scan: top-left logo → top-right CTA → bottom-left content → bottom-right CTA. That is a prison. The new scan: left column (swarm launcher, 5 vertical buttons) → eye falls to GOLDFISH label bottom-left → ticker pulls eye right across the full bottom rail → eye arrives at right column (status) → then up to selected territory panel. Diagonal. Counterclockwise. The human brain registers movement, not a grid.
</aesthetic_rationale>

## REDESIGNED LAYOUTS

---

### TERRITORY LABEL

```css
/* ── TERRITORY LABEL — GRID_GHOST REDESIGN ─────────────────────────────── */
/*
 * Structure:
 *   [COLOR RULE] [DOT] [NAME        ] [STATE TEXT]
 *                      [SCAN LINE ━━━━━━━━━━━━━━━]
 *
 * The color rule (3px left border) is the territory color.
 * The dot scales with state: OFFLINE=4px hollow, STABLE=6px solid, WORKING=14px pulse.
 * The scan line sits 2px below the name — state-driven width animation.
 * No border-radius. No soft shadow. No background pill.
 * pointer-events: none (it lives in drei <Html>)
 */

.territory-label {
  /* Grid: rule | dot gap | name | state */
  display: grid;
  grid-template-columns: 3px 20px 1fr auto;
  grid-template-rows: auto 2px;
  grid-template-areas:
    "rule  dot  name  state"
    "rule  scan scan  scan ";
  align-items: center;
  column-gap: 6px;
  row-gap: 3px;

  /* No background — the 3D void shows through */
  background: transparent;
  pointer-events: none;
  white-space: nowrap;
  font-family: 'IBM Plex Mono', 'Courier New', monospace;

  /* Transition: cubic-bezier(0.87, 0, 0.13, 1) — the ONLY easing allowed */
  transition:
    opacity 400ms cubic-bezier(0.87, 0, 0.13, 1),
    transform 400ms cubic-bezier(0.87, 0, 0.13, 1);
}

/* The vertical rule — territory color, hard edge */
.territory-label__rule {
  grid-area: rule;
  width: 3px;
  height: 100%;
  background: var(--territory-color);     /* CSS custom property set per-territory */
  opacity: 0.6;
  align-self: stretch;
}

/* State dot — scales with building state */
.territory-label__dot {
  grid-area: dot;
  border-radius: 50%;
  flex-shrink: 0;
  justify-self: center;
  align-self: center;

  /* Default: STABLE */
  width: 6px;
  height: 6px;
  background: var(--territory-color);
  box-shadow: 0 0 6px var(--territory-color);

  transition:
    width  300ms cubic-bezier(0.87, 0, 0.13, 1),
    height 300ms cubic-bezier(0.87, 0, 0.13, 1),
    opacity 300ms cubic-bezier(0.87, 0, 0.13, 1);
}

/* OFFLINE: hollow ring, no fill */
.territory-label--offline .territory-label__dot {
  width: 4px;
  height: 4px;
  background: transparent;
  border: 1px solid var(--territory-color);
  opacity: 0.35;
  box-shadow: none;
}

/* WORKING: large, pulsing */
.territory-label--working .territory-label__dot {
  width: 14px;
  height: 14px;
  box-shadow: 0 0 12px var(--territory-color), 0 0 24px var(--territory-color)44;
  animation: label-dot-working var(--pulse-ms, 800ms) cubic-bezier(0.87, 0, 0.13, 1) infinite;
}

/* Territory name — uppercase mono, no softening */
.territory-label__name {
  grid-area: name;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--territory-color);
  opacity: 0.85;

  /* SELECTED: slight x-shift to create tension against the rule */
  transition: transform 400ms cubic-bezier(0.87, 0, 0.13, 1);
}

.territory-label--selected .territory-label__name {
  transform: translateX(4px);
  opacity: 1.0;
}

.territory-label--offline .territory-label__name {
  color: oklch(35% 0.02 280);
  opacity: 0.5;
}

/* State text — only renders for non-offline, non-online */
.territory-label__state {
  grid-area: state;
  font-size: 7px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--territory-color);
  opacity: 0.6;
  padding-left: 6px;

  transition: opacity 300ms cubic-bezier(0.87, 0, 0.13, 1);
}

/* Scan line — full-width, state-driven */
.territory-label__scanline {
  grid-area: scan;
  height: 1px;
  background: var(--territory-color);
  opacity: 0.25;
  transform-origin: left center;

  /* OFFLINE: width=0. STABLE: width=40%. WORKING: cycles 0%→100%→0% */
  transform: scaleX(0.4);
  transition: transform 600ms cubic-bezier(0.87, 0, 0.13, 1);
}

.territory-label--offline .territory-label__scanline {
  transform: scaleX(0);
  opacity: 0;
}

.territory-label--working .territory-label__scanline {
  animation: label-scanline-working 1200ms cubic-bezier(0.87, 0, 0.13, 1) infinite;
  opacity: 0.5;
}

/* Keyframes */
@keyframes label-dot-working {
  0%, 100% { transform: scale(0.85); opacity: 0.7; }
  50%       { transform: scale(1.15); opacity: 1.0; }
}

@keyframes label-scanline-working {
  0%   { transform: scaleX(0); opacity: 0.2; }
  50%  { transform: scaleX(1); opacity: 0.6; }
  100% { transform: scaleX(0); opacity: 0.2; }
}
```

```
LABEL ASCII DIAGRAM — STABLE state
────────────────────────────────────────────
│  ┃  ●  CLAUDE'S HOUSE       THINKING
│  ┃     ━━━━━━━━━━           (40% scan)
│  ┃
│  ▲ 3px color rule (territory.color, 0.6 opacity)
│     ▲ 6px dot (solid)
│          ▲ name, 10px uppercase mono
│                               ▲ state text, 7px (hidden for STABLE/OFFLINE)

LABEL ASCII DIAGRAM — WORKING state
────────────────────────────────────────────
│  ┃  ⬤  CLAUDE'S HOUSE       SWARMING
│  ┃     ━━━━━━━━━━━━━━━━━━━━  (cycling, 100% width)
│       ▲ 14px dot, pulsing with glow

LABEL ASCII DIAGRAM — OFFLINE state
────────────────────────────────────────────
│  ┃  ○  CLAUDE'S HOUSE
│  ┃                           (no scan line, no state text)
│       ▲ 4px hollow ring
```

---

### INFO PANEL

```css
/* ── TERRITORY INFO PANEL — GRID_GHOST REDESIGN ─────────────────────────── */
/*
 * This is NOT a floating card. It is a BLAST SHIELD.
 * It descends from the top-right corner of the HUD frame when a territory is selected.
 * It is grid-tracked. It does not have a border-radius. It does not have a soft shadow.
 *
 * Internal layout uses CSS subgrid — the panel's rows align to the parent HUD grid
 * row tracks, so the territory name hangs at the same Y as the StatusBar header.
 *
 * Width: 280px (the right column track of the HUD grid).
 * Height: auto — expands with content. No max-height scrolling.
 * Entry: translateY(-100%) → translateY(0) — drops down from above.
 */

/* Container — positioned in the HUD grid right column */
.territory-panel {
  grid-area: panel;    /* named track in .hud-frame */
  display: grid;

  /* Subgrid for internal rows:
     row 1 — territory name header (40px)
     row 2 — separator (1px)
     row 3 — description text (auto)
     row 4 — gap (16px)
     row 5 — agent state row (24px)
     row 6 — active work row (auto)
  */
  grid-template-rows:
    40px
    1px
    auto
    16px
    24px
    auto;
  grid-template-areas:
    "panel-name"
    "panel-sep"
    "panel-desc"
    "panel-gap"
    "panel-state"
    "panel-work";

  /* The blast shield aesthetic: hard left border (territory color), no radius */
  border-left: 3px solid var(--territory-color);
  border-right: 1px solid oklch(20% 0.04 280 / 0.4);
  border-top: 1px solid oklch(20% 0.04 280 / 0.4);
  border-bottom: 1px solid oklch(20% 0.04 280 / 0.4);
  border-radius: 0;

  background: oklch(8% 0.08 280 / 0.92);
  backdrop-filter: blur(4px);

  /* Entry animation: blast shield drops down */
  animation: panel-descend 480ms cubic-bezier(0.87, 0, 0.13, 1) both;

  /* Width locked to right column — no flex grow */
  width: 280px;
  overflow: hidden;

  /* When territory deselected: ascends back up */
  transition: opacity 400ms cubic-bezier(0.87, 0, 0.13, 1);
}

/* Territory name — large, heavy, no apology */
.territory-panel__name {
  grid-area: panel-name;
  display: flex;
  align-items: flex-end;         /* name sits at the BOTTOM of the 40px row */
  padding: 0 16px 8px;

  font-family: 'IBM Plex Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--territory-color);
  line-height: 1;
}

/* Hard separator — 1px, territory color at 0.2 opacity */
.territory-panel__separator {
  grid-area: panel-sep;
  height: 1px;
  background: var(--territory-color);
  opacity: 0.2;
  margin: 0 16px;
}

/* Description — constrained line length, NOT a paragraph, NOT centered */
.territory-panel__desc {
  grid-area: panel-desc;
  padding: 12px 16px 0;

  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  line-height: 1.7;
  letter-spacing: 0.06em;
  color: oklch(60% 0.04 280);
  text-transform: none;

  /* Force hard left read — no centering, no justify */
  text-align: left;
}

/* Agent state row — STATE_COLOR dot + state label + activity score */
.territory-panel__state-row {
  grid-area: panel-state;
  display: grid;
  grid-template-columns: 8px 1fr 28px;
  column-gap: 8px;
  align-items: center;
  padding: 0 16px;
}

.territory-panel__state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--agent-state-color);
  box-shadow: 0 0 8px var(--agent-state-color);
}

.territory-panel__state-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 8px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--agent-state-color);
  opacity: 0.85;
}

.territory-panel__activity {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  color: oklch(45% 0.04 280);
  text-align: right;
}

/* Active work row */
.territory-panel__work {
  grid-area: panel-work;
  padding: 6px 16px 14px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 8px;
  line-height: 1.6;
  letter-spacing: 0.06em;
  color: oklch(40% 0.04 280);
  border-top: 1px solid oklch(20% 0.04 280 / 0.15);
  margin-top: 6px;
}

/* Entry animation — blast shield drops from top */
@keyframes panel-descend {
  0%   {
    opacity: 0;
    transform: translateY(-24px) scaleY(0.85);
    transform-origin: top center;
  }
  100% {
    opacity: 1;
    transform: translateY(0) scaleY(1);
    transform-origin: top center;
  }
}
```

```
INFO PANEL ASCII DIAGRAM — SELECTED: THE_FORGE
╔═══════════════════════════════════════════════╗
┃ 3px territory color (amber #f0a500)           ┃
╠═══════════════════════════════════════════════╣  ← 40px row (name)
║                               THE FORGE       ║
║  ─────────────────────────────────────────    ║  ← 1px separator
║                                               ║  ← description (auto)
║  Two claudas, one anvil. Build or burn.       ║
║  The active fabrication territory.            ║
║                                               ║  ← 16px gap row
║  ● WORKING                              85    ║  ← 24px state row
╠═══════════════════════════════════════════════╣  ← work separator
║  ACTIVE: Refactoring TerritoryNode build      ║  ← work row (auto)
║  system, extracting geometry config           ║
╚═══════════════════════════════════════════════╝
  Width: 280px (locked to HUD right column track)
  Left border: 3px solid var(--territory-color)
  No border-radius. No box-shadow bloom.
```

---

### HUD ARCHITECTURE

```css
/* ── HUD FRAME — THE PERIMETER GRID ─────────────────────────────────────── */
/*
 * The entire HUD is one CSS Grid stretched over the canvas.
 * It has 3 columns and 4 rows.
 * All four HUD elements (status, swarm launcher, herald ticker, panel) are
 * named grid-area placements within this one grid — not independent absolutes.
 *
 * COLUMN TRACKS:
 *   left:    220px  — swarm launcher
 *   center:  1fr    — canvas bleed-through (no HUD content here)
 *   right:   280px  — status bar + territory panel
 *
 * ROW TRACKS:
 *   top:     48px   — status bar strip
 *   upper:   1fr    — open canvas (no HUD content)
 *   lower:   1fr    — open canvas (no HUD content)
 *   bottom:  28px   — herald ticker rail (GOLDFISH)
 *
 * GRID AREAS MAP:
 *   "status   .      status"   ← top row: left col unused, right col = status
 *   "swarm    .      panel "   ← upper row: swarm in left col, panel in right
 *   ".        .      .     "   ← lower row: all open canvas
 *   "ticker   ticker ticker"   ← bottom row: full-width ticker rail
 *
 * SPATIAL LOGIC:
 *   The swarm launcher is flush-left. It occupies rows 2–3 (upper+lower).
 *   The status bar is flush-right top. The territory panel drops below it in the right column.
 *   The herald ticker spans the full bottom. The GOLDFISH label aligns to the left column.
 *   The center column is air — pure canvas. The eye scans the perimeter, not the center.
 */

.hud-frame {
  /* Stretched over the 3D canvas — position absolute, full bleed */
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;

  /* THE PERIMETER GRID */
  display: grid;
  grid-template-columns:
    [left-start]  220px
    [left-end center-start] 1fr
    [center-end right-start] 280px
    [right-end];
  grid-template-rows:
    [top-start]    48px
    [top-end upper-start] 1fr
    [upper-end lower-start] 1fr
    [lower-end bottom-start] 28px
    [bottom-end];
  grid-template-areas:
    ".       .       status"
    "swarm   .       panel "
    "swarm   .       .     "
    "ticker  ticker  ticker";

  /* Hard perimeter gap — canvas shows through the gutter */
  padding: 0;
  gap: 0;
}

/* STATUS BAR — top-right corner */
.hud-status {
  grid-area: status;
  align-self: center;
  justify-self: end;

  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 20px 0 12px;

  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  pointer-events: none;

  /* Right column gets a faint top border — marks the instrument zone */
  border-top: 1px solid oklch(20% 0.04 280 / 0.15);
  padding-top: 12px;
  align-self: end;
}

/* SWARM LAUNCHER — left column, rows 2+3, stacked vertically */
.hud-swarm {
  grid-area: swarm;
  align-self: end;           /* sticks to bottom of its rows */
  justify-self: start;

  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 0 36px 20px;   /* 36px bottom = above the ticker rail */

  pointer-events: auto;     /* swarm buttons ARE clickable */
  width: 200px;
}

/* TERRITORY PANEL — right column, below status bar, drops in on selection */
.hud-panel {
  grid-area: panel;
  align-self: start;
  justify-self: end;

  padding-right: 0;
  padding-top: 8px;          /* 8px gap below status bar */
  pointer-events: auto;

  /* Panel hidden when no territory selected */
  display: none;
}

.hud-panel--active {
  display: block;
}

/* HERALD TICKER — full bottom rail */
.hud-ticker {
  grid-area: ticker;
  align-self: stretch;
  justify-self: stretch;

  display: grid;
  /* Subgrid: left column = GOLDFISH label (aligns with swarm column), right = scrolling text */
  grid-template-columns: subgrid;
  grid-column: left-start / right-end;

  background: linear-gradient(180deg, transparent 0%, oklch(8% 0.06 280 / 0.72) 100%);
  border-top: 1px solid oklch(100% 0 0 / 0.03);
  overflow: hidden;
  align-items: center;
}

/* GOLDFISH label — sits in left column of the ticker's subgrid */
.hud-ticker__label {
  grid-column: 1;    /* left track — aligns with swarm launcher above */
  padding-left: 20px;
  padding-right: 12px;
  border-right: 1px solid oklch(100% 0 0 / 0.04);

  font-family: 'IBM Plex Mono', monospace;
  font-size: 8px;
  letter-spacing: 0.18em;
  color: oklch(30% 0.04 280);
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Scrolling text — spans center + right columns */
.hud-ticker__text {
  grid-column: 2 / -1;    /* center + right tracks */
  overflow: hidden;
  height: 100%;
  display: flex;
  align-items: center;

  mask-image: linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%);
}
```

```
HUD ARCHITECTURE ASCII DIAGRAM
═══════════════════════════════════════════════════════════════════════
   COL-1 (220px)     COL-2 (1fr)          COL-3 (280px)
                                                                   ▲ 48px
   ┄┄┄┄┄┄┄┄┄┄┄┄     ┄┄┄┄┄┄┄┄┄┄┄┄┄┄      ┌───────────────────────┐ (top row)
   [empty]           [empty]              │ ● KINGDOM LIVE        │
                                          │ 3 active              │
                                          │ CLAUDE ● BRANDON ●    │
                                          └───────────────────────┘
   ┄┄┄┄┄┄┄┄┄┄┄┄     ┄┄┄┄┄┄┄┄┄┄┄┄┄┄      ┌───────────────────────┐
   [empty]           [   C A N V A S  ]   │ ┃ THE FORGE           │ ▲
                                          │ ───────────────────── │
                     [ 3D Kingdom Map  ]  │  Build or burn.       │ 1fr
                                          │                       │ (upper)
                                          │  ● WORKING        85  │
   ┌────────────────┐                     │ ─────────────────     │
   │ ⬡ SEARCH       │ [   C A N V A S  ]  │  Refactoring geom     │ ▲
   │ ⚡ DEPLOY FORGE│                     └───────────────────────┘
   │ 👁 THRONE SYNC │                                              │
   │ ◈ SCRYER SCAN  │ [ 3D Kingdom Map  ]  [empty]                │ 1fr
   │ 🗼 TOWER BUILD  │                                             (lower)
   └────────────────┘
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ▲ 28px
   GOLDFISH ┃  Brandon is currently reviewing the new arch specs...  (bottom rail)
═══════════════════════════════════════════════════════════════════════

SPATIAL READ PATH:
   Eye enters top-right (KINGDOM LIVE status).
   Drops down right column to territory panel (information gravity pulls down).
   Jumps left — swarm launcher in left column (action affordance).
   Drops to GOLDFISH label bottom-left — spatially continues from swarm column.
   Tracks right across full ticker rail.
   NOT a Z. NOT a box. A counterclockwise perimeter sweep.
```

---

## TRANSITIONS

All transitions in this system use one easing: `cubic-bezier(0.87, 0, 0.13, 1)`

This is the Penner "expo" in/out approximation. It:
- Holds STILL at start (0.87 initial tangent — steep departure)
- Cuts through the middle (near-linear through 50%)
- Brakes HARD at end (0.13 final tangent — near-vertical arrival)

This means elements visually SNAP to their destinations rather than drifting. It reinforces the brutalist spatial doctrine — things move with intent and land with weight.

| Element | Duration | Property | Rationale |
|---|---|---|---|
| Territory label state change | 300ms | width/height/opacity | Fast enough to match 3D building transitions |
| Territory label selected shift | 400ms | transform: translateX | Slightly slower — name-shift is a deliberate spatial event |
| Scan line state change | 600ms | transform: scaleX | Longer — the line "draws" across the label, it's the signal |
| Scan line WORKING cycle | 1200ms | scaleX (keyframe loop) | Full period of one working pulse |
| Panel blast-shield descent | 480ms | transform + opacity | The panel must land with weight — not too fast |
| Panel deselect | 400ms | opacity only | Disappear is always faster than appear |
| Swarm button feedback | 80ms | transform: scale(0.97) | Near-instant press response |
| Dot state scale | 300ms | width/height | Matches label scan line start |

**What is BANNED:**
- `ease-in-out` (too soft, slides like a SaaS component)
- `ease` (non-committal)
- `linear` (mechanical, no character)
- Any duration under 80ms except swarm button press feedback
- Any duration over 600ms except scan line keyframe loops

---

## BLACKBOARD ENTRY

```json
decision_recorded: "GRID_GHOST S196: Full spatial redesign of Kingdom Map DOM elements. Three structural decisions locked: (1) Territory labels redesigned as left-rule + scaled dot + name + scan line system — 4-column subgrid, no background pill, state drives dot size (4/6/14px) and scan line width animation; cubic-bezier(0.87,0,0.13,1) on all transitions. (2) Info panel redesigned as blast-shield instrument panel — descends from top-right, 280px right-column track, 3px territory-color border-left, zero border-radius, internal subgrid with 6 named rows (name/sep/desc/gap/state/work). (3) HUD unified into one perimeter grid — 3 columns (220px left / 1fr center / 280px right), 4 rows (48px top / 1fr upper / 1fr lower / 28px bottom), grid-template-areas assigns: status top-right, swarm left rows 2-3, panel right rows 2-3, ticker full bottom rail. GOLDFISH label aligns to left column track via subgrid, achieving vertical spatial continuity with swarm launcher above it. Canvas occupies center column (1fr), untouched. Font: IBM Plex Mono (Space Grotesk/Inter/Roboto/Arial/Helvetica BANNED). All transition values: cubic-bezier(0.87,0,0.13,1). Constraints honored: no live file edits (sandbox only), OKLCH palette primitives maintained, no fake physics (glow source = point light above building), Z-pattern shattered via counterclockwise perimeter read path."
```
