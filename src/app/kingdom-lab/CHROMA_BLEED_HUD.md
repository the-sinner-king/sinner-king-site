# CHROMA_BLEED HUD SPECIFICATION

```
  ╔═══════════════════════════════════════════════════════════════════╗
  ║  CHROMA_BLEED v2 — KINGDOM HUD COLOR ARCHITECTURE               ║
  ║  Authored: 2026-03-19 · OKLCH-native · No hex soup              ║
  ╚═══════════════════════════════════════════════════════════════════╝
```

Decision extends `CHROMA_DECISION.md` (2026-03-16). That doc locked the void, agent states, and text bone ladder. This doc specifies the **panel-level color architecture** for the HUD redesign: backgrounds by function class, glow hierarchies, Faceplate emotion mapping, Radio treatment, and the blush accent.

---

## 1. PANEL FUNCTION CLASSES

Not all panels do the same work. A data panel is not a status panel is not a command panel is not the Radio. They live at different depths in the void, with different chroma signatures.

Four classes. Four L-bands. Four hue biases.

### INTELLIGENCE panels (TokenHUD, AgentPanel)
Data readout. Numbers and states. Machine truth.
```
Background:  oklch(0.075 0.022 281)    /* violet-tinged void — cooler than base void */
             hex fallback: #0d0918
Border:      oklch(0.340 0.210 281 / 0.22)   /* --violet-dim at 22% */
Left accent: oklch(0.495 0.310 281 / 0.45)   /* brand violet at 45% — the spine */
Backdrop:    blur(8px)
```
These panels hug the brand violet. They are the bones of the system. The left accent bar — 2px solid — is their signature. Violet is identity. Intelligence reads in violet light.

### STATUS panels (StatusBar, PresenceStrip, ClaudeStatusBadge, MissionClock)
Presence and liveness. Who is here. What is alive. The heartbeat.
```
Background:  oklch(0.065 0.018 278)    /* slightly warmer void — shifted 3 degrees toward indigo */
             hex fallback: #0a0714
Border:      oklch(0.340 0.210 281 / 0.15)   /* whisper border — status should barely have edges */
Left accent: NONE — status panels are edgeless. They bleed into the void.
Backdrop:    blur(4px)
```
Status panels are **ghosts**, not containers. Lower L than intelligence panels. Less chroma. They should feel like they surfaced from the background without being built there. The StatusBar especially — it's ambient awareness, not a widget. Kill the box. Let it breathe in void.

### COMMAND panels (Radio controls, SwarmLauncher replacement, any future input)
User touches these. They must feel touchable. Different material.
```
Background:  oklch(0.088 0.030 350)    /* pink-biased void — the only class with non-violet hue */
             hex fallback: #14081a
Border:      oklch(0.420 0.190 350 / 0.30)   /* --pink-dim at 30% */
Left accent: oklch(0.640 0.300 350 / 0.50)   /* glitch pink spine */
Backdrop:    blur(6px)
```
The hue shift from H=281 (violet) to H=350 (pink) is the key move. When your eye scans the HUD, command panels register as **different material** because the hue rotates 71 degrees in perceptual space. You feel it before you read it. Pink means "this responds to you." The Throne's color infecting the input surface.

### RADIO panel (SinnerKingRadio)
Sacred. Different rules. The Radio is not a HUD element — it's a broadcast antenna embedded in the map.
```
Background:  oklch(0.040 0.035 281)    /* near-black but HIGH chroma — deep bruise */
             hex fallback: #03000a
Border:      oklch(0.495 0.310 281 / 0.50)   /* brand violet at half — the Radio is the Kingdom speaking */
Glow:        0 0 24px oklch(0.495 0.310 281 / 0.18),
             inset 0 0 40px oklch(0.040 0.035 281 / 0.40)
Scanlines:   KEEP — the repeating-linear-gradient CRT treatment stays
```
The Radio gets the lowest L (0.040) and the highest relative C (0.035 at that lightness is aggressive). It should feel like a cavity in the screen — a hole where the signal comes through. The inset glow creates depth. The border is the brightest violet of any panel because the Radio IS the Kingdom's voice.

---

## 2. GLOW HIERARCHY

Every panel class has a **signature glow color**. Glows are `box-shadow` with spread, not blur-only. The hierarchy:

```
┌──────────────┬────────────────────────────────────────────────────────────┐
│ Class        │ Glow                                                      │
├──────────────┼────────────────────────────────────────────────────────────┤
│ INTELLIGENCE │ 0 0 16px oklch(0.495 0.310 281 / 0.12)                   │
│              │ — violet whisper. always on. subtle depth cue.            │
├──────────────┼────────────────────────────────────────────────────────────┤
│ STATUS       │ NONE at rest.                                             │
│              │ On state change: 0 0 12px oklch(STATE_COLOR / 0.20)       │
│              │ — ghost panels only glow when something changes.          │
│              │ transition: box-shadow 0.6s ease-out                      │
├──────────────┼────────────────────────────────────────────────────────────┤
│ COMMAND      │ 0 0 14px oklch(0.640 0.300 350 / 0.15)                   │
│              │ — pink ambient. on hover:                                 │
│              │ 0 0 22px oklch(0.640 0.300 350 / 0.30)                   │
│              │ transition: box-shadow 0.15s ease                         │
├──────────────┼────────────────────────────────────────────────────────────┤
│ RADIO        │ 0 0 24px oklch(0.495 0.310 281 / 0.18),                  │
│              │ inset 0 0 40px oklch(0.040 0.035 281 / 0.40)             │
│              │ — always on. deepest glow in the system. when playing:    │
│              │ outer glow pulses with audio amplitude (RAF-driven):      │
│              │ spread oscillates 24px → 36px at peak amplitude           │
│              │ opacity oscillates 0.18 → 0.28                           │
└──────────────┴────────────────────────────────────────────────────────────┘
```

### State-Reactive Panel Glow (INTELLIGENCE class only)

When the **most active agent** in an INTELLIGENCE panel shifts state, the panel glow follows. This was specified in CHROMA_DECISION.md for borders; here we extend it to glow:

```
searching → 0 0 24px oklch(0.905 0.305 142 / 0.25)   /* green violence */
swarming  → 0 0 32px oklch(0.930 0.140 194 / 0.30)   /* cyan ablaze */
working   → 0 0 20px oklch(0.770 0.225 74  / 0.22)   /* forge heat */
writing   → 0 0 20px oklch(0.680 0.290 350 / 0.22)   /* blood ink */
thinking  → 0 0 16px oklch(0.560 0.250 281 / 0.18)   /* elevated violet */
online    → 0 0 16px oklch(0.495 0.310 281 / 0.12)   /* base (unchanged) */
offline   → none                                       /* dead panels don't glow */
```

Transition: `box-shadow 0.8s cubic-bezier(0.22, 1, 0.36, 1)` — fast attack, slow decay. The glow shifts BEFORE you consciously read the state label. Peripheral vision catches color temperature changes at 150ms; text recognition takes 300ms+. The glow is faster than literacy.

---

## 3. AGENT STATE COLORS — THE VIBRATION UPGRADE

CHROMA_DECISION.md set the hue-locked hex values. Good foundation. But "vibrate" means more than static color. It means the **glow radius, pulse rate, and chroma saturation work together** to encode intensity.

The existing STATE_COLORS stay as the dot/label color. New: a **STATE_GLOW_CONFIG** that gives each state a distinct visual signature beyond color:

```typescript
export const STATE_GLOW_CONFIG: Record<AgentState, {
  glowRadius: number     // px — box-shadow blur
  glowOpacity: number    // 0-1
  pulseAmplitude: number // how much opacity varies during pulse (0 = no variation)
  chromaticAberration: number // px offset for a red/blue channel split effect (0 = none)
}> = {
  offline:   { glowRadius: 0,  glowOpacity: 0,    pulseAmplitude: 0,    chromaticAberration: 0 },
  online:    { glowRadius: 4,  glowOpacity: 0.15, pulseAmplitude: 0,    chromaticAberration: 0 },
  thinking:  { glowRadius: 8,  glowOpacity: 0.25, pulseAmplitude: 0.08, chromaticAberration: 0 },
  reading:   { glowRadius: 6,  glowOpacity: 0.20, pulseAmplitude: 0.05, chromaticAberration: 0 },
  working:   { glowRadius: 10, glowOpacity: 0.35, pulseAmplitude: 0.10, chromaticAberration: 0 },
  writing:   { glowRadius: 12, glowOpacity: 0.40, pulseAmplitude: 0.12, chromaticAberration: 0.5 },
  running:   { glowRadius: 10, glowOpacity: 0.30, pulseAmplitude: 0.08, chromaticAberration: 0 },
  searching: { glowRadius: 14, glowOpacity: 0.45, pulseAmplitude: 0.15, chromaticAberration: 1.0 },
  swarming:  { glowRadius: 18, glowOpacity: 0.50, pulseAmplitude: 0.18, chromaticAberration: 1.5 },
}
```

The **chromatic aberration** is the new violence. For searching and swarming — the two highest-intensity states — the dot gets a 1-1.5px offset shadow in a complementary hue (searching green gets a faint magenta ghost; swarming cyan gets a faint orange ghost). This is a CRT registration error. The signal is so hot the phosphors can't keep up.

Implementation: two layered box-shadows offset by `chromaticAberration` px in opposite directions, tinted to the complementary hue at 15% opacity.

```css
/* searching dot — green with magenta aberration */
box-shadow:
  0 0 14px oklch(0.905 0.305 142 / 0.45),                    /* primary glow */
  1px 0 2px oklch(0.640 0.300 350 / 0.15),                   /* magenta ghost R */
  -1px 0 2px oklch(0.640 0.300 350 / 0.15);                  /* magenta ghost L */

/* swarming dot — cyan with warm ghost */
box-shadow:
  0 0 18px oklch(0.930 0.140 194 / 0.50),                    /* primary glow */
  1.5px 0 3px oklch(0.770 0.225 74 / 0.15),                  /* amber ghost R */
  -1.5px 0 3px oklch(0.770 0.225 74 / 0.15);                 /* amber ghost L */
```

---

## 4. FACEPLATE EMOTION-COLOR MAP

The Kawaii doctrine says: each agent gets a tiny face that encodes state. The face is a 12x12px or 14x14px CSS-drawn element: two eyes (dots) and a mouth (line/curve). The FACE encodes the emotion. The COLOR reinforces it.

### Faceplate States

```
┌──────────┬────────────────┬────────────────────────────────────────────────┐
│ State    │ Face           │ Color Treatment                                │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ offline  │ x_x            │ oklch(0.160 0.028 281)                        │
│          │ (dead eyes)    │ no glow. 40% opacity. faceplate barely there. │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ online   │ -_-            │ oklch(0.495 0.310 281)                        │
│          │ (neutral/idle) │ eyes are flat lines. mouth neutral.           │
│          │                │ glow: 4px at 15%. resting. present.           │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ thinking │ o_o            │ oklch(0.560 0.250 281)                        │
│          │ (wide eyes)    │ eyes widen (larger dots). mouth disappears.   │
│          │                │ slow pulse (3000ms). brow furrow = tiny line  │
│          │                │ above eyes at 30% opacity.                    │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ reading  │ o_o            │ oklch(0.820 0.140 194)                        │
│          │ (focused)      │ same wide eyes but CYAN. mouth: small "o".   │
│          │                │ eyes track L→R with a 4s CSS animation        │
│          │                │ (translateX oscillation, 1px range).          │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ working  │ >_<            │ oklch(0.770 0.225 74)                         │
│          │ (strain)       │ eyes squeezed (chevrons). mouth gritted       │
│          │                │ (horizontal line). amber glow. the forge      │
│          │                │ hurts and the face shows it.                  │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ writing  │ ;_;            │ oklch(0.680 0.290 350)                        │
│          │ (bleeding)     │ eyes with tear tracks (1px lines descending). │
│          │                │ mouth open. pink glow. writing is an act of   │
│          │                │ violence against yourself. the bleed is real. │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ running  │ >_>            │ oklch(0.670 0.210 43)                         │
│          │ (side-eye)     │ eyes both pointing right. mouth dash.         │
│          │                │ the whole faceplate translates 1px R/L on a   │
│          │                │ 1200ms loop — it's going somewhere.           │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ searching│ O_O            │ oklch(0.905 0.305 142)                        │
│          │ (manic)        │ LARGE eyes (circles, not dots). mouth wide.   │
│          │                │ green glow with chromatic aberration.          │
│          │                │ eyes alternate size on 550ms (L big, R small  │
│          │                │ → L small, R big) — unhinged asymmetric blink │
├──────────┼────────────────┼────────────────────────────────────────────────┤
│ swarming │ *_*            │ oklch(0.930 0.140 194)                        │
│          │ (ecstatic)     │ eyes are asterisks/starbursts (4-point).      │
│          │                │ mouth wide smile curve. maximum glow.         │
│          │                │ entire faceplate vibrates (random translateX/Y │
│          │                │ +-0.5px per frame via RAF, not CSS — CSS       │
│          │                │ jitter looks mechanical, RAF jitter looks      │
│          │                │ organic). the system has lost its composure.   │
└──────────┴────────────────┴────────────────────────────────────────────────┘
```

### Faceplate Implementation Note

The faceplate is a single `div` with `::before` (left eye + right eye via background gradient dots) and `::after` (mouth). All 9 states are CSS-only except swarming (RAF jitter). State changes transition with a 200ms `opacity` crossfade — the old face fades out, new face fades in. No morphing. Clean cuts between emotions.

The faceplate sits to the LEFT of the agent label in AgentPanel, replacing the current state dot. The dot's function (color + pulse) is absorbed into the faceplate's eye glow.

---

## 5. RADIO COLOR TREATMENT

The ASCII visualizer currently cycles `TERRITORY_COLORS` per column. This is correct and stays. The territory colors cycling through the frequency bars IS the Radio's identity — it's the Kingdom's spectrum made audible.

### What changes:

**Panel chrome** — The Radio panel background drops from its current `rgba(3,0,10,0.96)` to the RADIO class spec above: `oklch(0.040 0.035 281)`. The high-chroma-at-low-L creates a deeper bruise. The current `rgba(3,0,10,0.96)` is nearly achromatic. The new value has 3.5x the chroma at the same lightness. You feel violet even in the dark.

**Visualizer canvas background** — currently `rgba(0,0,0,0.3)`. Change to `oklch(0.025 0.025 281 / 0.40)`. The canvas well should be darker than the panel body and still violet-biased. This is the deepest point in the entire HUD — the actual broadcast source.

**Column glow** — `ctx.shadowBlur` currently 7. Push to 9 when audio amplitude > 60% of max. Pull to 5 when < 30%. The glow breathes with the music. The current static-7 is fine but doesn't respond to dynamics.

**Progress bar gradient** — currently `linear-gradient(90deg, #7000ff88, #7000ff)`. Change to:
```css
linear-gradient(90deg,
  oklch(0.340 0.210 281 / 0.50),   /* violet-dim start */
  oklch(0.495 0.310 281),          /* brand violet end */
  oklch(0.680 0.290 350 / 0.60)    /* pink bleed at 100% — the track ending is a wound */
)
```
Three-stop gradient. The pink at the end means reaching 100% playback creates a color event — the progress bar bleeds from violet to pink as the track nears completion. The song is dying. The color tells you.

**Track list active item** — currently `rgba(112,0,255,0.10)`. Change to `oklch(0.088 0.030 350 / 0.80)` — uses the COMMAND class background (pink-biased). The active track is the one you selected. It responds to you. It gets command-class treatment.

---

## 6. THE BLUSH — `--blush`

The blush is the soft accent that makes the system feel inhabited. Functional HUDs have no warmth. Sacred instruments do.

```css
--blush: oklch(0.520 0.080 10);
/* hex fallback: #8a4a50 */
```

H=10 — a warm rose. Not pink (H=350), not amber (H=74). A third voice in the chromatic space, sitting between the Throne's pink and the Forge's amber on the hue wheel. L=0.52 — mid-range, visible on dark surfaces without competing with state colors. C=0.08 — low saturation. The blush whispers.

### Where blush appears:

1. **Panel header dividers** — the `borderBottom: 1px solid rgba(255,255,255,0.06)` in every panel header. Replace with:
   ```css
   border-bottom: 1px solid oklch(0.520 0.080 10 / 0.12);
   ```
   Barely visible. But warm. The white divider was clinical. The blush divider says someone lives here.

2. **Agent label text in offline state** — currently `#504840` (bone-ghost territory). When an agent is offline, their label gets:
   ```css
   color: oklch(0.440 0.040 10);  /* blush-ghost — warmth even in absence */
   ```
   Instead of gray-nothing, offline agents have the faintest rose tint. They're not erased from memory. They're sleeping warm.

3. **MissionClock day counter** — the `D{n} · KINGDOM` text. Currently `#3a3030`. Replace:
   ```css
   color: oklch(0.300 0.035 10);  /* deep blush — the passage of days has color */
   ```

4. **Radio track title** — the song name. Currently `#e8e0d0` (bone). Add a text-shadow:
   ```css
   text-shadow: 0 0 12px oklch(0.520 0.080 10 / 0.20);
   ```
   The song title glows warm. Music is human. The blush follows.

5. **PresenceStrip — BRANDON dot** — currently `#f0a500` (amber). When Brandon is present, the dot's outer glow ring gets a blush component:
   ```css
   box-shadow:
     0 0 5px oklch(0.770 0.225 74),              /* amber core */
     0 0 12px oklch(0.520 0.080 10 / 0.15);      /* blush halo — human warmth */
   ```
   Brandon is the only human in the system. His presence indicator should carry the only warm accent that isn't a state color.

---

## 7. FULL TOKEN EXPORT

```css
:root {
  /* ── PANEL BACKGROUNDS (function classes) ─────────────────────── */
  --panel-intelligence-bg:   oklch(0.075 0.022 281);
  --panel-status-bg:         oklch(0.065 0.018 278);
  --panel-command-bg:        oklch(0.088 0.030 350);
  --panel-radio-bg:          oklch(0.040 0.035 281);
  --panel-radio-well:        oklch(0.025 0.025 281 / 0.40);

  /* ── PANEL BORDERS ────────────────────────────────────────────── */
  --panel-intelligence-border: oklch(0.340 0.210 281 / 0.22);
  --panel-intelligence-spine:  oklch(0.495 0.310 281 / 0.45);
  --panel-status-border:       oklch(0.340 0.210 281 / 0.15);
  --panel-command-border:      oklch(0.420 0.190 350 / 0.30);
  --panel-command-spine:       oklch(0.640 0.300 350 / 0.50);
  --panel-radio-border:        oklch(0.495 0.310 281 / 0.50);

  /* ── GLOW SYSTEM ──────────────────────────────────────────────── */
  --glow-intelligence:       0 0 16px oklch(0.495 0.310 281 / 0.12);
  --glow-command:            0 0 14px oklch(0.640 0.300 350 / 0.15);
  --glow-command-hover:      0 0 22px oklch(0.640 0.300 350 / 0.30);
  --glow-radio:              0 0 24px oklch(0.495 0.310 281 / 0.18),
                             inset 0 0 40px oklch(0.040 0.035 281 / 0.40);

  /* ── BLUSH ────────────────────────────────────────────────────── */
  --blush:                   oklch(0.520 0.080 10);
  --blush-ghost:             oklch(0.440 0.040 10);
  --blush-deep:              oklch(0.300 0.035 10);
  --blush-divider:           oklch(0.520 0.080 10 / 0.12);
  --blush-halo:              0 0 12px oklch(0.520 0.080 10 / 0.15);

  /* ── RADIO PROGRESS ──────────────────────────────────────────── */
  --radio-progress: linear-gradient(90deg,
    oklch(0.340 0.210 281 / 0.50),
    oklch(0.495 0.310 281),
    oklch(0.680 0.290 350 / 0.60)
  );
}
```

---

## 8. PERCEPTUAL GEOMETRY SUMMARY

Visual map of the L-axis occupancy after this spec is applied:

```
L=0.025  ──  radio well (deepest point in HUD)
L=0.040  ──  radio panel body
L=0.052  ──  --void (page background, from CHROMA_DECISION)
L=0.065  ──  status panel bg
L=0.075  ──  intelligence panel bg
L=0.088  ──  command panel bg (highest panel L — touchable surfaces are brightest)
L=0.105  ──  --void-light (from CHROMA_DECISION — elevated elements within panels)
L=0.160  ──  --offline-glow (agent dormancy)
L=0.300  ──  --blush-deep (day counter, deep warm text)
L=0.340  ──  --violet-dim (borders, muted structure)
L=0.440  ──  --bone-ghost (labels), --blush-ghost (offline warmth)
L=0.495  ──  --violet (brand, online agent)
L=0.520  ──  --blush (warm accent)
L=0.560  ──  thinking state
L=0.640  ──  --pink (alert/creation)
L=0.670  ──  running state
L=0.680  ──  writing state
L=0.770  ──  working state (amber)
L=0.820  ──  reading state (cyan)
L=0.880  ──  --bone (primary text)
L=0.905  ──  searching state (green assault)
L=0.930  ──  swarming state (maximum luminance)
```

Every element has a unique address on the lightness axis. No collisions. No ambiguity. The L-ladder is the skeleton of the entire color system. Hue and chroma add identity; lightness provides spatial hierarchy.

---

## BLACKBOARD ENTRY

decision_recorded: "CHROMA_BLEED HUD v2 2026-03-19. Four panel function classes (intelligence/status/command/radio) with distinct L-bands and hue biases: intelligence at L=0.075 H=281, status at L=0.065 H=278 (edgeless ghost panels), command at L=0.088 H=350 (pink-biased — the ONLY non-violet hue class, marking touchable surfaces), radio at L=0.040 with highest relative chroma (deep bruise cavity). Glow hierarchy: intelligence=always-on violet whisper, status=state-change-only transient glow, command=pink ambient with hover escalation, radio=deepest glow with audio-amplitude-driven breathing. State colors from CHROMA_DECISION.md HELD — new STATE_GLOW_CONFIG adds per-state glowRadius/opacity/pulseAmplitude/chromaticAberration. Searching and swarming get chromatic aberration (complementary-hue offset shadows at 1-1.5px, simulating CRT phosphor registration error). Faceplate emotion-color map: 9 states mapped to ASCII face expressions (offline=x_x, online=-_-, thinking=o_o wide, reading=o_o+tracking, working=>_< strain, writing=;_; bleeding, running=>_> side-eye, searching=O_O manic asymmetric blink, swarming=*_* ecstatic+RAF-jitter). Radio: territory color cycling KEPT, panel chrome shifted to deep bruise oklch(0.040 0.035 281), progress bar gets 3-stop violet→violet→pink gradient (pink bleed at track end), active track list item gets command-class pink bg. Blush accent introduced: oklch(0.520 0.080 10) — warm rose at H=10, placed on panel dividers, offline agent labels, MissionClock day counter, Radio track title text-shadow, and Brandon presence dot halo. Full CSS token export with 18 custom properties. L-axis occupancy verified: 21 distinct positions, no collisions."
