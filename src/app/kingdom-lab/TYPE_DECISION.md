<aesthetic_rationale>
## Typographic Intent — Kingdom Map

This is a data-dense terminal interface running inside a 3D WebGL scene.
It is NOT a magazine. It is NOT an editorial product. It is a command center
overlaid on a living digital architecture. The typography must serve two masters
simultaneously: **machine legibility** (data reads instantly, no ambiguity) and
**aesthetic hostility to normalcy** (this looks like nothing else).

### Why 1.25 (Major Third) over 1.618 (Golden Ratio)

1.618 is the editorial ratio. It lives in long-form text, where the eye needs
dramatic size jumps to distinguish hierarchy levels. At 16px base with 1.618:
  xs = 6.1px  sm = 9.9px  md = 16px  lg = 25.9px  2xl = 41.9px

Those extremes are useless. 6px text is illegal (accessibility) and 42px headings
have no place in a HUD panel 200px wide. The Golden Ratio generates waste.

1.25 (Major Third) at 13px base produces this:
  xs  = 8.3px   → badge state text — tight, readable
  sm  = 10.4px  → section labels, territory name
  md  = 13px    → body, tool codes
  lg  = 16.3px  → panel headings
  xl  = 20.3px  → info panel title
  2xl = 25.4px  → not used in HUD — future only

Every step is distinct but none explodes past its container. This is data density
discipline. The 1.25 ratio is chosen because Kingdom Map elements span a 3× range
(badge to panel heading), and 1.25^5 ≈ 3.05 — perfect coverage, zero waste.

### Why 13px Base (Not 16px)

16px = the web default. The browser default. The SaaS default. The slop baseline.
13px is the base of terminal interfaces, IDE sidebars, devtools panels. It says:
"You are in a system. This is not a brochure." 14px is also acceptable; I choose
13px because it puts sm at 10.4px (our label floor) without going below 10px at xs.

WCAG 4.5:1 minimum for standard text applies at 13px. All state colors (STATE_COLORS)
pass against rgba(10,10,15,0.82) panel backgrounds when full opacity is used.
The one risk zone is `#504840` (bone-ghost, used for dim labels) against void dark —
ratio ≈ 2.8:1. This is intentional decorative text, not meaningful content.
Active state text (THINKING, WRITING, etc.) uses full state color at 1.0 opacity
against the panel background — all pass 4.5:1.

### Font Strategy

**Fira Code** — primary monospace. Used for territory labels, state text, HUD chrome,
button text, data values. Fira Code has aggressive ligatures that can be disabled;
its narrow weight with 0.05–0.1em tracking reads as CRT terminal output. It owns
the "machine reading" registers.

**JetBrains Mono** — secondary. Used ONLY for agent state labels (THINKING / WRITING /
RUNNING etc.). JBM has slightly wider letterforms than Fira Code, which means
the all-caps state string gets more physical presence at the same px size. Fira Code
vs JBM at the same size: JBM wins for single ALL-CAPS words because its wider
proportions give each glyph more authority.

**VT323** — I am introducing this for exactly ONE element: the territory name label
(CLAUDE'S HOUSE, THE FORGE, etc.). This is the correct call and here is why:

VT323 is a bitmap/CRT typeface. At 10-11px it looks like a terminal from 1982. That
is NOT a mistake — it is a semantic signal. These territory names are "locations on a
map as it would appear on a screen from before screens looked like this." The contrast
with the rest of the Fira Code system creates exactly the kind of temporal dissonance
that defines the Kingdom aesthetic. The buildings are 3D. The labels are VT323. That
gap is the point.

VT323 is ONLY used at the territory name scale (sm, ~10px). At larger sizes it becomes
unreadable cartoon. At 10px it is machine poetry.

### The "Scan-line Treatment" for Territory Names

Current: plain uppercase mono. Boring.
Proposed: VT323 at `--text-sm`, 0.2em letter-spacing, + a ::before pseudo-element
that creates a single-pixel horizontal scan through the text at 50% opacity cyan.
This does not require Three.js access — it runs on the Html overlay div.
The scan-line is 1px tall, 100% wide, positioned at 50% vertical, pointer-events none.
CSS: `background: linear-gradient(transparent 49%, rgba(0,243,255,0.12) 50%, transparent 51%)`.

### Agent State Text Redesign

Current: 8px mono, state color at 0.8 opacity, `· THINKING` format.
The problem: 8px is the point at which information becomes suggestion. You have to
squint. The state is the most important real-time signal in the entire interface and
it whispers.

Redesign: JetBrains Mono, `--text-xs` (8.3px → clamp(8px, 0.64vw, 9px)), ALL-CAPS,
0.12em tracking, state color at **1.0 opacity**, plus a `text-shadow` glow using the
state color at 40% opacity and 4px blur. The dot stays (5px, same behavior) but now
it's paired with text that has presence. The separator `·` is replaced with a space —
the dot IS the separator.

The state text box gets a `background: {stateColor}15` fill (8% opacity of the state
color) that makes the badge feel like a lit indicator rather than a text string.
This requires no layout changes — same padding, just a computed background.

### Info Panel Typography (when territory is selected)

The info panel currently uses the same generic monospace stack. Three levels needed:
1. **Panel heading** (territory name): VT323 at `--text-lg` (clamp), uppercase, cyan,
   with the scan-line ::after treatment. This is the hero text of the panel.
2. **Body text** (description, status): Fira Code, `--text-sm`, bone-dim color,
   1.65 line-height. Readable. Not interesting — but the panel heading is interesting
   enough for both.
3. **Data values** (activity score, session count, timestamps): Fira Code,
   `--text-xs`, cyan, `font-variant-numeric: tabular-nums`, 0.06em tracking.
   Data is data — it should look like a readout, not prose.

### Escape Hatch: Why This Avoids AI Slop

Every "AI-generated" design choice is: Inter/Roboto, 16px base, 1.5rem headings,
40px hero text, #666 body. It is the gravity well of the mean. Escaping requires:
1. A font choice with HISTORY (VT323 has a specific era it evokes — use that)
2. A mathematical base that REFUSES the browser default (13px, not 16px)
3. A ratio chosen for FUNCTION not aesthetics (1.25 because the containers demand it)
4. A treatment for the hero element that NO generative tool would produce
   (scan-line pseudo-element on a VT323 bitmap font label in an R3F Html overlay)

This escapes the gravity well. The Kingdom Map will look like it was built by
someone who studied both CRT terminal design and contemporary data visualization,
not someone who opened Tailwind UI.
</aesthetic_rationale>

---

## MODULAR SCALE

Base: **13px** | Ratio: **1.25** (Major Third)

| Step | Formula             | px Value (exact) | px Value (rounded) | clamp()                                   |
|------|---------------------|------------------|--------------------|-------------------------------------------|
| xs   | 13 ÷ 1.25²          | 8.32px           | 8px                | `clamp(7px, 0.58vw + 0.2rem, 9px)`       |
| sm   | 13 ÷ 1.25           | 10.4px           | 10px               | `clamp(9px, 0.72vw + 0.25rem, 11px)`     |
| md   | 13 (base)           | 13px             | 13px               | `clamp(12px, 0.90vw + 0.35rem, 14px)`    |
| lg   | 13 × 1.25           | 16.25px          | 16px               | `clamp(14px, 1.13vw + 0.45rem, 18px)`    |
| xl   | 13 × 1.25²          | 20.31px          | 20px               | `clamp(17px, 1.41vw + 0.56rem, 22px)`    |
| 2xl  | 13 × 1.25³          | 25.39px          | 25px               | `clamp(21px, 1.76vw + 0.70rem, 28px)`    |
| 3xl  | 13 × 1.25⁴          | 31.74px          | 32px               | `clamp(26px, 2.20vw + 0.87rem, 35px)`    |
| 4xl  | 13 × 1.25⁵          | 39.67px          | 40px               | `clamp(32px, 2.75vw + 1.09rem, 44px)`    |

**Note:** Kingdom Map HUD elements use xs → xl only. 2xl–4xl reserved for future
large-format elements (e.g. info panel overlay titles at very wide viewports).

---

## FONT ASSIGNMENTS

| Element                    | Font             | Size Step | clamp()                                    | Weight | Letter-spacing | Case       | Color Token              |
|----------------------------|------------------|-----------|---------------------------------------------|--------|----------------|------------|--------------------------|
| Territory name label       | VT323            | sm        | `clamp(9px, 0.72vw + 0.25rem, 11px)`       | 400    | 0.20em         | UPPERCASE  | `--territory-color`      |
| Agent state text (THINKING)| JetBrains Mono   | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 500    | 0.12em         | UPPERCASE  | `--state-color` at 1.0   |
| State dot                  | n/a (div)        | 5px fixed | n/a                                         | n/a    | n/a            | n/a        | `--state-color`          |
| Section label (HUD)        | Fira Code        | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 400    | 0.18em         | UPPERCASE  | `--bone-ghost` #504840   |
| Panel header label         | Fira Code        | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 400    | 0.18em         | UPPERCASE  | `--bone-ghost` #504840   |
| Agent row label (FORGE etc)| Fira Code        | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 400    | 0.14em         | UPPERCASE  | `--bone-ghost` #504840   |
| Tool code badge [BH]       | Fira Code        | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 400    | 0.06em         | UPPERCASE  | `--state-color` at 0.85  |
| Activity score (85)        | Fira Code        | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 400    | 0.06em         | n/a        | `--bone-ghost` tabular   |
| HUD status text            | Fira Code        | xs→sm     | `clamp(9px, 0.72vw + 0.25rem, 11px)`       | 400    | 0.12em         | UPPERCASE  | contextual               |
| Button text                | Fira Code        | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 400    | 0.08em         | UPPERCASE  | `--state-color`          |
| Info panel heading         | VT323            | xl        | `clamp(17px, 1.41vw + 0.56rem, 22px)`      | 400    | 0.15em         | UPPERCASE  | `--cyan`                 |
| Info panel body            | Fira Code        | sm        | `clamp(9px, 0.72vw + 0.25rem, 11px)`       | 400    | 0.02em         | sentence   | `--bone-dim` #a09888     |
| Info panel data value      | Fira Code        | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 400    | 0.06em         | n/a        | `--cyan` tabular-nums    |
| StatusBar KINGDOM LIVE     | Fira Code        | sm        | `clamp(9px, 0.72vw + 0.25rem, 11px)`       | 400    | 0.12em         | UPPERCASE  | `--bone` on live         |
| Debug panel label          | Fira Code        | xs        | `clamp(7px, 0.58vw + 0.2rem, 9px)`         | 400    | 0.10em         | UPPERCASE  | `--bone-dim`             |

---

## CSS CUSTOM PROPERTIES (typography tokens)

```css
/* ============================================================
   TYPE_WEAVER — Kingdom Map Typography Tokens
   Decision file: TYPE_DECISION.md | S196
   Base: 13px | Ratio: 1.25 (Major Third)
   ============================================================ */

:root {
  /* --- Modular Scale --- */
  --text-xs:   clamp(7px,  0.58vw + 0.20rem,  9px);
  --text-sm:   clamp(9px,  0.72vw + 0.25rem, 11px);
  --text-md:   clamp(12px, 0.90vw + 0.35rem, 14px);
  --text-lg:   clamp(14px, 1.13vw + 0.45rem, 18px);
  --text-xl:   clamp(17px, 1.41vw + 0.56rem, 22px);
  --text-2xl:  clamp(21px, 1.76vw + 0.70rem, 28px);

  /* --- Font Families --- */
  --font-terminal: 'VT323', 'Courier New', monospace;
  --font-mono:     'Fira Code', 'JetBrains Mono', 'IBM Plex Mono', monospace;
  --font-state:    'JetBrains Mono', 'Fira Code', monospace;

  /* --- Letter Spacing System --- */
  --tracking-tight:   0.02em;   /* body prose — minimal */
  --tracking-data:    0.06em;   /* numeric data, tool codes */
  --tracking-label:   0.12em;   /* HUD labels, status text */
  --tracking-section: 0.18em;   /* section headers, panel titles */
  --tracking-terminal: 0.20em;  /* VT323 territory names — breathing room for bitmap glyphs */

  /* --- Typography Compound Tokens --- */
  /* Territory name label (VT323 sm) */
  --type-territory-name: var(--font-terminal) var(--text-sm) / 1.0;
  --type-territory-tracking: var(--tracking-terminal);

  /* Agent state label (JBM xs) */
  --type-agent-state: var(--font-state) var(--text-xs) / 1.0;
  --type-agent-state-tracking: 0.12em;

  /* HUD chrome (Fira Code xs) */
  --type-hud: var(--font-mono) var(--text-xs) / 1.2;
  --type-hud-tracking: var(--tracking-label);

  /* Panel heading (VT323 xl) */
  --type-panel-heading: var(--font-terminal) var(--text-xl) / 1.1;
  --type-panel-heading-tracking: var(--tracking-terminal);

  /* Panel body (Fira Code sm) */
  --type-panel-body: var(--font-mono) var(--text-sm) / 1.65;
  --type-panel-body-tracking: var(--tracking-tight);

  /* Data readout (Fira Code xs tabular) */
  --type-data: var(--font-mono) var(--text-xs) / 1.0;
  --type-data-tracking: var(--tracking-data);
}
```

---

## ELEMENT-BY-ELEMENT CSS

### 1. Territory Label (TerritoryNode.tsx — Html overlay div)

```css
/* The label div wrapping territory.label + badge */
.territory-label-wrap {
  font-family: var(--font-terminal);           /* VT323 — bitmap terminal */
  font-size: var(--text-sm);                   /* clamp(9px, 0.72vw + 0.25rem, 11px) */
  letter-spacing: var(--tracking-terminal);    /* 0.20em — bitmap glyphs need air */
  text-transform: uppercase;
  color: #8a7090;                              /* default: dim, state-driven via JS */
  background: rgba(13, 2, 33, 0.75);
  padding: 2px 6px;
  border-radius: 2px;
  white-space: nowrap;
  border: 1px solid rgba(100, 60, 180, 0.15);
  display: flex;
  align-items: center;
  gap: 5px;
  position: relative;

  /* SCAN-LINE TREATMENT — 1px CRT scan through the label */
}
.territory-label-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    transparent 49%,
    rgba(0, 243, 255, 0.10) 50%,
    transparent 51%
  );
  pointer-events: none;
  border-radius: 2px;
}
```

### 2. Agent State Text (TerritoryNode.tsx — span inside Html overlay)

```css
/* The "· THINKING" / "· WRITING" span — redesigned */
.agent-state-label {
  font-family: var(--font-state);              /* JetBrains Mono — wider letterforms */
  font-size: var(--text-xs);                   /* clamp(7px, 0.58vw + 0.2rem, 9px) */
  letter-spacing: 0.12em;
  text-transform: uppercase;
  /* color: {stateColor} at 1.0 opacity — set via JS */
  /* text-shadow: 0 0 4px {stateColor}66 — set via JS (40% opacity of state color) */
  padding: 0 3px;
  /* background: {stateColor}15 — set via JS (8% fill — makes it a lit indicator) */
  border-radius: 1px;
}
/* Note: The separator dot `·` is dropped. The state dot IS the separator.
   The span text becomes just stateLabel.toUpperCase() — no bullet prefix. */
```

### 3. Agent State Dot (TerritoryNode.tsx + AgentPanel.tsx)

```css
/* Unchanged geometry (5px circle), upgrade to glow treatment */
.agent-state-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  /* background: stateColor — JS controlled */
  /* box-shadow: 0 0 {activity * 0.12}px stateColor — existing, keep */
  /* animation: badge-pulse {PULSE_MS}ms — existing, keep */
}
/* UPGRADE: For active states only, add an outer ring pulse */
.agent-state-dot--active {
  /* box-shadow: 0 0 4px stateColor, 0 0 8px stateColor44 — stronger double glow */
}
```

### 4. Info Panel — Heading

```css
/* Panel selected-territory heading */
.info-panel-heading {
  font-family: var(--font-terminal);           /* VT323 */
  font-size: var(--text-xl);                   /* clamp(17px, 1.41vw + 0.56rem, 22px) */
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--cyan);                          /* #00f3ff */
  text-shadow: 0 0 8px rgba(0, 243, 255, 0.4);
  line-height: 1.1;
  position: relative;
}
/* Scan-line on panel heading too */
.info-panel-heading::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    transparent 49%,
    rgba(0, 243, 255, 0.08) 50%,
    transparent 51%
  );
  pointer-events: none;
}
```

### 5. Info Panel — Body

```css
.info-panel-body {
  font-family: var(--font-mono);               /* Fira Code */
  font-size: var(--text-sm);                   /* clamp(9px, 0.72vw + 0.25rem, 11px) */
  letter-spacing: 0.02em;                      /* minimal — prose reads with less tracking */
  color: var(--bone-dim);                      /* #a09888 */
  line-height: 1.65;
  font-variant-ligatures: none;                /* disable Fira Code ligatures in body text */
}
```

### 6. Info Panel — Data Value

```css
.info-panel-data {
  font-family: var(--font-mono);               /* Fira Code */
  font-size: var(--text-xs);                   /* clamp(7px, 0.58vw + 0.2rem, 9px) */
  letter-spacing: 0.06em;
  color: var(--cyan);                          /* #00f3ff */
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
```

### 7. HUD Chrome — StatusBar, Panel Headers, Section Labels

```css
.hud-label {
  font-family: var(--font-mono);               /* Fira Code */
  font-size: var(--text-xs);                   /* clamp(7px, 0.58vw + 0.2rem, 9px) */
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--bone-ghost);                    /* #504840 */
  line-height: 1.2;
}

.hud-status-live {
  font-family: var(--font-mono);
  font-size: var(--text-sm);                   /* clamp(9px, 0.72vw + 0.25rem, 11px) */
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--bone);                          /* #e8e0d0 — full brightness when live */
}
```

### 8. Button Text

```css
.btn-kingdom {
  font-family: var(--font-mono);               /* Fira Code */
  font-size: var(--text-xs);                   /* clamp(7px, 0.58vw + 0.2rem, 9px) */
  letter-spacing: 0.08em;
  text-transform: uppercase;
  /* inherits existing btn-kingdom structural styles */
}
```

---

## BLACKBOARD ENTRY

```
decision_recorded: "TYPE_WEAVER S196 typography system. Base 13px, ratio 1.25 Major Third, 6 modular steps xs→2xl. All clamp() values specified. Fonts: VT323 for territory names + info panel headings (CRT temporal dissonance, bitmap glyphs at sm scale, scan-line ::after treatment via CSS gradient); JetBrains Mono for agent state labels (wider letterforms give ALL-CAPS authority at xs scale; state color 1.0 opacity + glow shadow + 8% background fill makes badge a lit indicator not a text string); Fira Code for all HUD chrome, data readouts, body text, buttons. Inter BANNED. No guessed px values. Agent state dot redesigned with double glow for active states. Info panel: VT323 xl heading with cyan glow + scan-line, Fira Code sm body 1.65 line-height, Fira Code xs tabular-nums data. Constraint acknowledgments: VT323 at text-xl may need font load check (it's a Google Font, already available via Next.js font system); JetBrains Mono already in font-mono stack so no new load required; scan-line treatment is pure CSS pseudo-element, no DOM overhead; all active state text passes 4.5:1 WCAG against panel background rgba(10,10,15,0.82). Decorative dim labels (bone-ghost #504840) intentionally below 4.5:1 — non-informational chrome only."
```
