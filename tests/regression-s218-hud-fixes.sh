#!/usr/bin/env bash
# ── S218 REGRESSION — HUD inline panel: width lock, glow purge, filter fix ───
#
# B1: .hud-inline-col width is 255px fixed — locked. No fit-content, no shrink,
#     no expansion. 1fr sub-grid still present (panel locks it, not the track).
#     48px right margin = half-inch gap before manifesto column.
#
# B2: filter removed from shared face/status transition — was creating a 1.2s
#     mismatch window (elevated filter + snapped text-shadow = fuzzy glow).
#
# GLOW PURGE: no text-shadow, animation, or filter on any .hud-panel element.
#     Colors preserved. Covers both inline and main HUD.
# ─────────────────────────────────────────────────────────────────────────────

FILE="$(dirname "$0")/../public/index.html"
PASS=0; FAIL=0

check() {
  local desc="$1" pattern="$2"
  if grep -qE "$pattern" "$FILE"; then
    echo "  ✅ PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  ❌ FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

check_absent() {
  local desc="$1" pattern="$2"
  if grep -qE "$pattern" "$FILE"; then
    echo "  ❌ FAIL: $desc (pattern still present)"; FAIL=$((FAIL+1))
  else
    echo "  ✅ PASS: $desc"; PASS=$((PASS+1))
  fi
}

echo "🦖 S218 REGRESSION — HUD inline panel baseline (S217+S218)"
echo "   File: $FILE"
echo ""

# ── B1: WIDTH LOCK ────────────────────────────────────────────────────────────
check "B1: .hud-inline-col width is 255px (fixed, locked)" "width:[[:space:]]*255px"
check_absent "B1: no fit-content on .hud-inline-col" "width:[[:space:]]*fit-content"
check "B1: margin-right is 48px (half-inch gap before manifesto)" "margin-right:[[:space:]]*48px"
check "B1: inline agent sub-grid still has 50px 80px 1fr columns" "50px 80px 1fr"

# ── B2: FILTER TRANSITION REMOVED ────────────────────────────────────────────
check_absent "B2: no 'filter 1.2s ease-out' in shared face/status transition" "transition:[[:space:]]*filter[[:space:]]*1\.2s"
check "B2: shared face/status transition still has color 0.4s ease" "transition:[[:space:]]*color[[:space:]]*0\.4s[[:space:]]*ease"
check "B2: called-surge retains its own filter transition (surge-in)" "transition:[[:space:]]*filter[[:space:]]*0\.3s[[:space:]]*ease-in"

# ── GLOW PURGE ────────────────────────────────────────────────────────────────
check "GLOW: GLOW PURGE block present in source" "GLOW PURGE"
check "GLOW: .hud-panel face/status has text-shadow: none !important" "text-shadow:[[:space:]]*none[[:space:]]*!important"
check "GLOW: .hud-panel face/status has animation: none !important" "animation:[[:space:]]*none[[:space:]]*!important"
check "GLOW: .hud-panel face/status has filter: none !important" "filter:[[:space:]]*none[[:space:]]*!important"

# ── KEYFRAMES PRESERVED (used by main HUD / future) ──────────────────────────
check "KEYS: glowPulseWork keyframe still in source" "glowPulseWork"
check "KEYS: glowPulseThink keyframe still in source" "glowPulseThink"

echo ""
echo "  Results: $PASS passed, $FAIL failed"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "  🟢 ALL CLEAR — HUD baseline contract holds."
  exit 0
else
  echo "  🔴 REGRESSION DETECTED — HUD baseline broken."
  exit 1
fi
