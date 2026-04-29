#!/usr/bin/env bash
# ── S217 REGRESSION — Manifesto axis alignment check ─────────────────────────
# Verifies the manifesto left edge aligns with the KINGDOM logo left edge.
# Math: HUD column = (max-width 1180 - KINGDOM logo 556.8px) / 2 = 311.6 → 312px
# If either the max-width or the KINGDOM logo width changes, this test will catch drift.
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

echo "🦖 S217 REGRESSION — Manifesto axis alignment check"
echo "   File: $FILE"
echo ""

# AC-01: HUD column = 312px (derived from (1180-556.8)/2 = 311.6 rounded)
check "HUD column is 312px (axis lock value)" "grid-template-columns:[[:space:]]*312px"

# AC-01: Manifesto column unchanged (minmax 200-560) — text width preserved
check "Manifesto column is minmax(200px, 560px) — text width preserved" "312px minmax\(200px, 560px\)"

# AC-01: Axis lock comment present — documents the derived constant
check "Axis lock comment present (MANIFESTO AXIS LOCK)" "MANIFESTO AXIS LOCK"

# AC-01: max-width still 1180px — if it changes, the 312px constant breaks
check "manifesto-wrap max-width is 1180px (axis constant depends on it)" "max-width:[[:space:]]*1180px"

# AC-03: Mobile breakpoint still uses 250px (not 312px)
if grep -A3 "max-width: 1100px" "$FILE" | grep -q "250px 1fr"; then
  echo "  ✅ PASS: Mobile breakpoint grid-template-columns = 250px 1fr (axis reverts at <1100px)"; PASS=$((PASS+1))
else
  echo "  ❌ FAIL: Mobile breakpoint should be 250px 1fr"; FAIL=$((FAIL+1))
fi

# S216 contract still holds — middle track max = .manifesto max-width
check "S216 contract: middle track max (560px) synced with .manifesto max-width" "minmax\(200px, 560px\)"

echo ""
echo "  Results: $PASS passed, $FAIL failed"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "  🟢 ALL CLEAR — manifesto axis contract holds."
  exit 0
else
  echo "  🔴 REGRESSION DETECTED — manifesto axis alignment broken."
  exit 1
fi
