#!/usr/bin/env bash
# ============================================================
# REGRESSION TEST: S216 — Poster-to-manifesto 150px dead space
# ============================================================
# ROOT CAUSE: grid-template-columns used 1fr (expandable) for
#   the manifesto column, but .manifesto had max-width: 560px.
#   At 1180px grid, 1fr = 710px → 150px void inside the track.
# FIX: Changed 1fr → minmax(200px, 560px). Track now matches content.
# SYNC LAW: The track max (560px) and .manifesto max-width (560px)
#   must stay equal. This test enforces that contract.
# ============================================================

set -e
HTML="$(cd "$(dirname "$0")/.." && pwd)/public/index.html"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "  ✅ PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "🦖 S216 REGRESSION — Poster gap sync check"
echo "   File: $HTML"
echo ""

# ── TEST 1: grid track uses minmax with 560px max (not 1fr) ──────────
TRACK=$(grep -o 'minmax(200px, 560px)' "$HTML" | head -1)
check "grid-template-columns middle track = minmax(200px, 560px)" \
  "$([ "$TRACK" = "minmax(200px, 560px)" ] && echo true || echo false)"

# ── TEST 2: 1fr is NOT used as the middle column track ───────────────
# The old bug: 250px 1fr 220px. Detect if 1fr is still in the 3-col rule.
# We check for the three-column pattern specifically — NOT the 2-col breakpoint.
BAD_TRACK=$(grep 'grid-template-columns: 250px 1fr 220px' "$HTML" | wc -l | tr -d ' ')
check "1fr no longer used as middle track in 3-column layout" \
  "$([ "$BAD_TRACK" -eq 0 ] && echo true || echo false)"

# ── TEST 3: .manifesto max-width is still 560px ──────────────────────
MANIFESTO_WIDTH=$(grep -A8 '\.manifesto {' "$HTML" | grep -o 'max-width: min(560px' | head -1)
check ".manifesto max-width references 560px" \
  "$([ "$MANIFESTO_WIDTH" = "max-width: min(560px" ] && echo true || echo false)"

# ── TEST 4: track max and manifesto max-width are in sync ────────────
# Both must be 560. Extract each and compare.
TRACK_MAX=$(grep -o 'minmax(200px, 560px)' "$HTML" | grep -o '560' | head -1)
MANIFESTO_MAX=$(grep -A8 '\.manifesto {' "$HTML" | grep -o 'min(560px' | grep -o '560' | head -1)
check "track max (${TRACK_MAX}px) equals manifesto max-width (${MANIFESTO_MAX}px) — sync enforced" \
  "$([ "$TRACK_MAX" = "$MANIFESTO_MAX" ] && [ -n "$TRACK_MAX" ] && echo true || echo false)"

# ── TEST 5: responsive breakpoint still overrides to 250px 1fr ───────
RESPONSIVE=$(grep -A3 '@media (max-width: 1100px)' "$HTML" | grep -o '250px 1fr' | head -1)
check "responsive breakpoint still uses 250px 1fr (poster hidden at ≤1100px)" \
  "$([ "$RESPONSIVE" = "250px 1fr" ] && echo true || echo false)"

# ── TEST 6: S216 documentation present in source ─────────────────────
# The exact archaeological plaque marker was removed in cleanup; the
# TRACK SYNC LAW comment (line ~1717) is the canonical S216 record.
PLAQUE=$(grep -c 'TRACK SYNC LAW (S216)' "$HTML" || true)
check "S216 TRACK SYNC LAW comment present in source" \
  "$([ "$PLAQUE" -gt 0 ] && echo true || echo false)"

# ── SUMMARY ──────────────────────────────────────────────────────────
echo ""
echo "  Results: $PASS passed, $FAIL failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  🦖 RAPTOR ALERT: Sync contract broken."
  echo "     If track max ≠ manifesto max-width, the 150px void returns."
  echo "     Fix: keep both at the same pixel value."
  exit 1
else
  echo "  🟢 ALL CLEAR — poster gap contract holds."
  exit 0
fi
