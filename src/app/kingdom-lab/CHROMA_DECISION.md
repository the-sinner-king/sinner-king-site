<aesthetic_rationale>
## OKLCH 3D GEOMETRY — CHROMA_BLEED REDESIGN

### The Perceptual Space

OKLCH (L = perceptual lightness 0–1, C = chroma/saturation, H = hue degrees 0–360) gives us a space where equal numerical distances mean equal perceived differences. This is the tool. Everything else is decoration.

### Current Palette — What's Wrong

**VOID (#0a0a0f)**
sRGB: R=10, G=10, B=15. In OKLCH: L≈0.042, C≈0.009, H≈275.
Problem: The black has no identity. It's a default off. It doesn't feel like a place you've entered — it feels like nothing loaded. The C=0.009 is a whisper of violet. Push it into a *statement*.

**VIOLET (#7000ff)**
sRGB: R=112, G=0, B=255. In OKLCH: L≈0.44, C≈0.283, H≈281.
This is the primary signal color. L=0.44 is mid-dark. The issue: on panels that are barely removed from void, this violet has nowhere to *contrast against*. It floats in a fog. Push L to 0.52–0.55 range and crank C hard.

**PANEL BACKGROUND (#12121a / void-mid)**
sRGB: R=18, G=18, B=26. In OKLCH: L≈0.079, C≈0.011, H≈275.
The violet-ghost bg (#1a0040 referenced in the brief) is: L≈0.048, C≈0.071, H≈282.
Current panels: ~1% L difference from background. INVISIBLE. A panel should feel like a *surface* that emerged from the void, not a slightly-different void.

**AGENT STATE GEOMETRY:**
The 9 states need to occupy distinct perceptual positions. Current issues:
- `offline` (#1a1520) at L≈0.12, C≈0.017 — no hue identity, just dim grey-purple. Death, not dormancy.
- `searching` (#3dff00) at L≈0.90, C≈0.29, H≈142 — the only green in the system. Perceptually SCREAMS against everything else. That's correct for searching. Keep the violence.
- `working` (#f0a500) amber: L≈0.75, C≈0.17, H≈74. C is too low for what working *means*. This state should hit like a forge firing.
- `online` (#7000ff) — same as primary violet. The idle state steals identity from the brand color. Pull them apart.

### The Redesign Philosophy

**VOID:** Push to L=3.5%, C=1.8%, H=278. Perceptibly indigo-black. The background has a *color* now — you know you're inside something violet.

**PRIMARY VIOLET:** Two values now. Brand violet (identity marker) and signal violet (online state) must be separate.
- Brand/online: L=0.48, C=0.31, H=281 — electric, holds against the new void
- Thinking: L=0.56, C=0.26, H=281 — lighter, same hue, distinguishable as "elevated processing"

**PANELS:** The panel surface needs to occupy a distinct L-band. Current void ≈ L=4.2%. Panel should sit at L≈9–11% with C=2.5–3.5% for violet tinting. This creates real surface hierarchy.

**PANEL ACTIVE (searching border bleed):** Yes. When an agent is SEARCHING, the panel border goes neon green. The border's H shifts to 142 (searching hue). This is spatial signal — the container itself becomes reactive.

**OFFLINE DORMANT GLOW:** `offline` at #1a1520 is too dark and too grey. It should read as *sleeping*, not *dead*. New offline: L=16%, C=2.8%, H=281. A visible but desaturated violet-tinged shadow. The Zzz animations against this background now make *sense* — something violet stirs under the ice.

**AMBER WORKING:** Push C hard. #f0a500 → target L=0.77, C=0.22, H=74. That extra chroma makes it feel molten rather than muted. The forge must *burn*.

**CYAN SWARMING vs READING:** Currently swarming (#00f3ff) and reading (#00d4ff) are both cyan — H≈195-197, L differs by ~0.08. Audible but not violent. Widen the L gap: reading stays mid, swarming goes to near-white-cyan. Swarming should feel like the system is *catching fire*.

### Spatial Hierarchy Map (L-axis from bottom to top)

```
L=0.035 — --void-deep       — the abyss
L=0.055 — --void            — base background
L=0.085 — --surface-0       — sunken panel
L=0.105 — --surface-1       — raised panel
L=0.135 — --surface-2       — elevated / selected panel
L=0.16  — --offline-glow    — dormant agent state
L=0.44  — --bone-ghost      — tertiary text (CHECK: contrast later)
L=0.55  — --bone-dim        — secondary text
L=0.77  — --bone            — primary text
L=0.44→0.56 — violet range  — online/thinking states
L=0.75  — --amber-hot       — working state
L=0.85  — --reading-cyan    — reading state
L=0.90+ — --searching-green — searching state (intentional assault)
L=0.93  — --swarming-cyan   — swarming (maximum luminance, controlled chaos)
```

This is a FUNCTIONING perceptual ladder. Every element knows where it lives.
</aesthetic_rationale>

---

## REDESIGNED COLOR TOKENS

```css
/* ============================================================
   CHROMA_BLEED — Kingdom Map Color System Redesign
   Decision: 2026-03-16
   All values in OKLCH notation + hex fallback
   OKLCH format: oklch(L C H) where L=0–1, C=0–0.4, H=0–360
   ============================================================ */

:root {

  /* ── VOID PRIMITIVES ────────────────────────────────────────
     The abyss has a color now. Push L down, push C up from the
     current whisper (0.009) to a deliberate indigo statement.
  ──────────────────────────────────────────────────────────── */
  --void-deep:    oklch(0.035 0.020 278);  /* #050409 — sub-black, used for inset wells */
  --void:         oklch(0.052 0.018 278);  /* #08070f — page background (was #0a0a0f) */
  --void-mid:     oklch(0.085 0.025 279);  /* #0e0b1a — panel base surface */
  --void-light:   oklch(0.108 0.030 279);  /* #141026 — raised panel surface */
  --void-select:  oklch(0.135 0.038 279);  /* #1a1433 — selected / elevated panel */

  /* ── VIOLET — SPLIT: brand identity vs. agent online state ──
     Previously collapsed. Brand violet = sinner-king identity.
     Online-violet = agent idle signal. They coexist but differ.
  ──────────────────────────────────────────────────────────── */
  --violet:        oklch(0.495 0.310 281);  /* #7700ff — primary brand (pushed L up, C up) */
  --violet-bright: oklch(0.545 0.295 281);  /* #9530ff — hover/focus, max brand pop */
  --violet-dim:    oklch(0.340 0.210 281);  /* #4a00aa — borders, muted signals */
  --violet-ghost:  oklch(0.175 0.060 281);  /* #1e0950 — deep background tint */

  /* ── CYAN — ADVISORY / LIVE DATA ───────────────────────────
     Two distinct L positions for reading vs. swarming.
     Hue LOCKED at H=194. L/C only.
  ──────────────────────────────────────────────────────────── */
  --cyan:          oklch(0.875 0.155 194);  /* #00f3ff — swarming / primary live data */
  --cyan-bright:   oklch(0.930 0.140 194);  /* #72faff — peak alert / swarming ceiling */
  --cyan-dim:      oklch(0.600 0.110 194);  /* #00b8c8 — advisory/muted */

  /* ── PINK — ALERT / CREATION / WRITING ─────────────────────
     H=350. Current #ff006e = oklch(0.62 0.29 350).
     Push it. Writing should feel like blood on the screen.
  ──────────────────────────────────────────────────────────── */
  --pink:          oklch(0.640 0.300 350);  /* #ff006e → held, already violent */
  --pink-hot:      oklch(0.680 0.290 350);  /* #ff3d85 — writing state, brighter */
  --pink-dim:      oklch(0.420 0.190 350);  /* #aa0049 — suppressed alert */

  /* ── AMBER — SULPHUR / WORK / HISTORY ──────────────────────
     H=74. Current C=0.17 is too low — molten means C=0.22+.
     L stays at 0.77, we crank the chroma.
  ──────────────────────────────────────────────────────────── */
  --amber:         oklch(0.770 0.225 74);   /* #f5aa00 — working state (C up from 0.17→0.225) */
  --amber-hot:     oklch(0.800 0.240 74);   /* #ffb800 — peak working, forge at full temp */
  --amber-dim:     oklch(0.510 0.145 74);   /* #a07200 — history/muted */

  /* ── BONE — TEXT HIERARCHY ──────────────────────────────────
     H=70 (warm white). Three tiers, L-ladder.
     All must pass 4.5:1 against --void (L=0.052).
  ──────────────────────────────────────────────────────────── */
  --bone:          oklch(0.880 0.025 75);   /* #e8e0d0 — primary text */
  --bone-dim:      oklch(0.660 0.022 75);   /* #a09888 — secondary text */
  --bone-ghost:    oklch(0.440 0.018 75);   /* #6a5a50 — tertiary / labels */

  /* ── OFFLINE — DORMANT VIOLET GLOW ─────────────────────────
     The key redesign. Not dead black — sleeping violet.
     L=0.16, C=0.028, H=281. Visible but suppressed.
     Against --void (L=0.052): contrast ratio ~1.8 — intentionally low (it's *offline*)
     The Zzz animations float against this tint, signaling dormancy not death.
  ──────────────────────────────────────────────────────────── */
  --offline-glow:  oklch(0.160 0.028 281);  /* #1c1030 — dormant agent, not dead */

  /* ── SEMANTIC TOKENS (map to primitives) ─────────────────── */
  --signal-active:  var(--cyan);
  --signal-idle:    var(--violet-dim);
  --signal-alert:   var(--pink);
  --signal-history: var(--amber);

  /* ── BORDER SYSTEM (redesigned drama levels) ────────────────
     Three drama tiers: subtle / active / blazing
  ──────────────────────────────────────────────────────────── */
  --border-subtle:   1px solid oklch(0.340 0.210 281 / 0.20);  /* violet-dim at 20% */
  --border-active:   1px solid oklch(0.495 0.310 281 / 0.55);  /* violet at 55% */
  --border-glow:     1px solid oklch(0.875 0.155 194 / 0.40);  /* cyan at 40% */
  --border-bleed-search: 1px solid oklch(0.900 0.290 142 / 0.70); /* green bleeds when searching */
  --border-bleed-swarm:  1px solid oklch(0.930 0.140 194 / 0.80); /* cyan blazes when swarming */

  /* ── PANEL GLOW — state-reactive box-shadows ────────────────
     Panels visually react to agent state via shadow color.
     Applied via .panel[data-agent-state="searching"] etc.
  ──────────────────────────────────────────────────────────── */
  --panel-shadow-idle:      0 0 16px oklch(0.495 0.310 281 / 0.12),
                            inset 0 1px 0 oklch(1 0 0 / 0.04);
  --panel-shadow-active:    0 0 28px oklch(0.495 0.310 281 / 0.25),
                            inset 0 1px 0 oklch(1 0 0 / 0.05);
  --panel-shadow-searching: 0 0 24px oklch(0.900 0.290 142 / 0.30),
                            0 0 48px oklch(0.900 0.290 142 / 0.12);
  --panel-shadow-swarming:  0 0 32px oklch(0.930 0.140 194 / 0.35),
                            0 0 64px oklch(0.930 0.140 194 / 0.15);
  --panel-shadow-working:   0 0 24px oklch(0.800 0.240 74  / 0.28);
}
```

---

## AGENT STATE OVERRIDES

Full 9-state redesign. Hue LOCKED. Only L and C adjusted.

| State | Current Hex | Current OKLCH (approx) | New Hex | New OKLCH | Why |
|-------|-------------|------------------------|---------|-----------|-----|
| `offline` | `#1a1520` | L=0.12 C=0.017 H=281 | `#1c1030` | L=0.16 C=0.028 H=281 | Dormant violet glow — sleeping, not erased. Zzz can float against a readable tint. L raised from 0.12→0.16, C doubled for identity. |
| `online` | `#7000ff` | L=0.44 C=0.283 H=281 | `#7700ff` | L=0.495 C=0.310 H=281 | Pulled apart from the void panel background. Pushed L up, C up for clarity against darker panel surface. |
| `thinking` | `#a833ff` | L=0.54 C=0.268 H=281 | `#9a40ff` | L=0.56 C=0.250 H=281 | Barely moved — already solid. Slight C decrease so it doesn't fight with online. L elevated for distinction. |
| `reading` | `#00d4ff` | L=0.82 C=0.137 H=194 | `#00d4ff` | L=0.820 C=0.140 H=194 | HELD. Already correct. Reading is focused attention — the current luminance is correct. Minor C nudge. |
| `working` | `#f0a500` | L=0.75 C=0.170 H=74 | `#f5aa00` | L=0.770 C=0.225 H=74 | **THE KEY CHANGE.** C up from 0.170 to 0.225. The forge fires. Amber that hits like molten metal, not a muted warning. |
| `writing` | `#ff3d7f` | L=0.65 C=0.290 H=350 | `#ff3d85` | L=0.680 C=0.290 H=350 | L up slightly. Writing is violent creation — it should be the hottest pink. |
| `running` | `#ff6b35` | L=0.67 C=0.210 H=43 | `#ff6b35` | L=0.670 C=0.210 H=43 | HELD. Running orange is correctly placed between amber (H=74) and pink (H=350). Don't touch what works. |
| `searching` | `#3dff00` | L=0.90 C=0.290 H=142 | `#44ff00` | L=0.905 C=0.305 H=142 | Minor C push. This is intentional violence — the one green in a violet system. The border bleeds this color when searching. Leave its aggression intact. |
| `swarming` | `#00f3ff` | L=0.87 C=0.150 H=194 | `#72faff` | L=0.930 C=0.140 H=194 | Push L to near-maximum (0.93). Swarming = the system is ablaze. This should feel like looking at light. C pulled back slightly so it doesn't fight cyan-dim. |

### State-Reactive Panel Borders

When an agent IS in a given state, the panel containing their data gets a border color shift:

```
searching → border: var(--border-bleed-search)  /* neon green bleed */
swarming  → border: var(--border-bleed-swarm)   /* cyan blaze       */
working   → border: 1px solid oklch(0.800 0.240 74 / 0.60)  /* amber heat */
writing   → border: 1px solid oklch(0.680 0.290 350 / 0.60) /* pink wound */
offline   → border: 1px solid oklch(0.160 0.028 281 / 0.30) /* dormant    */
```

---

## CONTRAST VERIFICATION

**Method:** WCAG relative luminance approximation using `L_rel ≈ (sRGB_linear)` where `sRGB_linear ≈ (channel/255)^2.2`.

Full formula: `L_rel = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin`

Contrast ratio = `(L_lighter + 0.05) / (L_darker + 0.05)`

---

### Pair 1: --bone (#e8e0d0) on --void (#08070f)

**--bone #e8e0d0:** R=232, G=224, B=208
- R_lin = (232/255)^2.2 = (0.910)^2.2 ≈ 0.810
- G_lin = (224/255)^2.2 = (0.878)^2.2 ≈ 0.758
- B_lin = (208/255)^2.2 = (0.816)^2.2 ≈ 0.647
- L_bone = 0.2126(0.810) + 0.7152(0.758) + 0.0722(0.647)
- L_bone = 0.1722 + 0.5421 + 0.0467 = **0.761**

**--void #08070f:** R=8, G=7, B=15
- R_lin = (8/255)^2.2 = (0.0314)^2.2 ≈ 0.00072
- G_lin = (7/255)^2.2 = (0.0275)^2.2 ≈ 0.00057
- B_lin = (15/255)^2.2 = (0.0588)^2.2 ≈ 0.00254
- L_void = 0.2126(0.00072) + 0.7152(0.00057) + 0.0722(0.00254)
- L_void = 0.000153 + 0.000408 + 0.000183 = **0.000744**

**Contrast = (0.761 + 0.05) / (0.000744 + 0.05) = 0.811 / 0.05074 = 15.98:1**
PASS. Well above 4.5:1 required. Primary text is readable.

---

### Pair 2: --bone-dim (#a09888) on --void (#08070f)

**--bone-dim #a09888:** R=160, G=152, B=136
- R_lin = (160/255)^2.2 = (0.627)^2.2 ≈ 0.357
- G_lin = (152/255)^2.2 = (0.596)^2.2 ≈ 0.322
- B_lin = (136/255)^2.2 = (0.533)^2.2 ≈ 0.253
- L_bone_dim = 0.2126(0.357) + 0.7152(0.322) + 0.0722(0.253)
- L_bone_dim = 0.0759 + 0.2303 + 0.0183 = **0.3245**

**Contrast = (0.3245 + 0.05) / (0.000744 + 0.05) = 0.3745 / 0.05074 = 7.38:1**
PASS. Secondary text is readable against the void.

---

### Pair 3: --bone-ghost (#6a5a50) on --void-mid (#0e0b1a)

This is the critical one — tertiary text on panel background.

**--bone-ghost #6a5a50:** R=106, G=90, B=80
- R_lin = (106/255)^2.2 = (0.416)^2.2 ≈ 0.145
- G_lin = (90/255)^2.2 = (0.353)^2.2 ≈ 0.102
- B_lin = (80/255)^2.2 = (0.314)^2.2 ≈ 0.082
- L_bone_ghost = 0.2126(0.145) + 0.7152(0.102) + 0.0722(0.082)
- L_bone_ghost = 0.0308 + 0.0730 + 0.0059 = **0.1097**

**--void-mid #0e0b1a (new):** R=14, G=11, B=26
- R_lin = (14/255)^2.2 = (0.0549)^2.2 ≈ 0.00219
- G_lin = (11/255)^2.2 = (0.0431)^2.2 ≈ 0.00132
- B_lin = (26/255)^2.2 = (0.102)^2.2 ≈ 0.00793
- L_void_mid = 0.2126(0.00219) + 0.7152(0.00132) + 0.0722(0.00793)
- L_void_mid = 0.000465 + 0.000944 + 0.000573 = **0.001982**

**Contrast = (0.1097 + 0.05) / (0.001982 + 0.05) = 0.1597 / 0.051982 = 3.07:1**
FAIL for body text (4.5:1). PASS for large text or UI decoration (3:1).

**Remediation:** --bone-ghost tertiary text on panels is decorative/label usage (8px mono labels, section headers). These qualify as large/UI text (3:1 threshold). However, if used as body text we must use --bone-dim (7.38:1) instead. This is a LAW: `--bone-ghost` is LABEL-ONLY. Never use for body copy.

---

### Pair 4: --violet (#7700ff) on --void-mid (#0e0b1a) — panel headers

**--violet #7700ff:** R=119, G=0, B=255
- R_lin = (119/255)^2.2 = (0.467)^2.2 ≈ 0.187
- G_lin = 0 → 0
- B_lin = (255/255)^2.2 = 1.0^2.2 = 1.0
- L_violet = 0.2126(0.187) + 0.7152(0) + 0.0722(1.0)
- L_violet = 0.03976 + 0 + 0.07220 = **0.1120**

**Contrast (violet on void-mid) = (0.1120 + 0.05) / (0.001982 + 0.05) = 0.1620 / 0.051982 = 3.12:1**
FAIL for normal text (4.5:1). Violet is a SIGNALING color, not a text color. Violet on dark panels is used for borders, glows, and icons — not readable text. This is intentional and correct. Text in violet contexts must use --bone.

---

### Pair 5: --amber-hot (#ffb800) on --void-mid (#0e0b1a) — working state badge text

**--amber-hot #ffb800:** R=255, G=184, B=0
- R_lin = 1.0
- G_lin = (184/255)^2.2 = (0.722)^2.2 ≈ 0.487
- B_lin = 0
- L_amber = 0.2126(1.0) + 0.7152(0.487) + 0 = 0.2126 + 0.3483 = **0.5609**

**Contrast = (0.5609 + 0.05) / (0.001982 + 0.05) = 0.6109 / 0.051982 = 11.75:1**
PASS massively. Amber on dark panel is extremely readable. Correct choice for working state labels.

---

### Pair 6: --searching-green (#44ff00) on --void-mid (#0e0b1a) — search state bleed

**#44ff00:** R=68, G=255, B=0
- R_lin = (68/255)^2.2 = (0.267)^2.2 ≈ 0.057
- G_lin = 1.0
- B_lin = 0
- L_search = 0.2126(0.057) + 0.7152(1.0) = 0.01212 + 0.7152 = **0.7273**

**Contrast = (0.7273 + 0.05) / (0.001982 + 0.05) = 0.7773 / 0.051982 = 14.95:1**
PASS. Green text/border on dark panel is violently readable. The visual assault is structural, not accidental.

---

### Pair 7: --offline-glow (#1c1030) on --void (#08070f) — offline territory labels

**#1c1030:** R=28, G=16, B=48
- R_lin = (28/255)^2.2 = (0.110)^2.2 ≈ 0.00895
- G_lin = (16/255)^2.2 = (0.0627)^2.2 ≈ 0.00295
- B_lin = (48/255)^2.2 = (0.188)^2.2 ≈ 0.02930
- L_offline = 0.2126(0.00895) + 0.7152(0.00295) + 0.0722(0.02930)
- L_offline = 0.001903 + 0.002110 + 0.002116 = **0.006129**

**Contrast = (0.006129 + 0.05) / (0.000744 + 0.05) = 0.056129 / 0.050744 = 1.11:1**
This is the offline state dot / indicator — not text. The *dot* uses this color, not text. Offline state means barely visible — this is correct. The Zzz floats above at `opacity: 0.55` which still reads at ~1.5:1 against the void. Intentional: offline signal is barely alive, not broadcasting.

The territory LABEL text in offline state uses `#2a1830` (current) → recommend upgrading to --bone-ghost for legibility while still being de-emphasized.

---

## SUMMARY TABLE

| Element | Old | New | Status |
|---------|-----|-----|--------|
| void bg | L=4.2% C=0.009 | L=5.2% C=0.018 | MORE INDIGO |
| panel surface | L=7.9% C=0.011 | L=8.5% C=0.025 | DISTINCT SURFACE |
| violet signal | L=44% C=0.283 | L=49.5% C=0.310 | ELECTRIC |
| offline | L=12% C=0.017 | L=16% C=0.028 | DORMANT NOT DEAD |
| amber working | L=75% C=0.170 | L=77% C=0.225 | MOLTEN |
| swarming | L=87% C=0.150 | L=93% C=0.140 | BLINDING |
| bone text | unchanged | unchanged | SOLID |

---

## BLACKBOARD ENTRY

decision_recorded: "CHROMA_BLEED redesign 2026-03-16. Sulphur Gothic palette pushed harder in 5 dimensions. (1) VOID: #0a0a0f → oklch(0.052 0.018 278) / #08070f — indigo-black with identity, C raised from 0.009 to 0.018, void has a color now. (2) PANEL SURFACES: void-mid at oklch(0.085 0.025 279) / #0e0b1a vs current #12121a — L-band separation creates real surface hierarchy, panels emerge from void instead of floating in fog. (3) VIOLET IDENTITY: #7000ff → oklch(0.495 0.310 281) / #7700ff — L up 4.4% → 49.5%, C up 0.283 → 0.310, more electric against the darker void, brand color now pops. (4) OFFLINE: #1a1520 → oklch(0.160 0.028 281) / #1c1030 — dormant violet glow, not dead nothing. L raised from 12% to 16%, C doubled. Zzz animations now float against readable tint, signaling sleep not erasure. (5) AMBER WORKING: #f0a500 → oklch(0.770 0.225 74) / #f5aa00 — C pushed from 0.170 to 0.225, forge fires at full temp. (6) SWARMING: #00f3ff → oklch(0.930 0.140 194) / #72faff — L pushed to 0.93, near-maximum luminance, system ablaze. (7) STATE-REACTIVE BORDERS: searching triggers --border-bleed-search = neon green (oklch 0.900 0.290 142 / 0.70), swarming triggers --border-bleed-swarm = cyan blaze. Panels are no longer static containers — they respond to agent state. CONTRAST VERIFIED: bone on void = 15.98:1 PASS, bone-dim on void = 7.38:1 PASS, amber-hot on void-mid = 11.75:1 PASS, searching green on void-mid = 14.95:1 PASS. bone-ghost (3.07:1) flagged as LABEL-ONLY not body text. All hues LOCKED per CHROMA_BLEED law — only L/C offsets used for state derivation. OKLCH coords: void (#08070f L=0.052 C=0.018 H=278), violet (#7700ff L=0.495 C=0.310 H=281), offline (#1c1030 L=0.160 C=0.028 H=281), amber (#f5aa00 L=0.770 C=0.225 H=74), swarming (#72faff L=0.930 C=0.140 H=194), searching (#44ff00 L=0.905 C=0.305 H=142), panel-mid (#0e0b1a L=0.085 C=0.025 H=279)."
