#!/usr/bin/env bash
# regression-test-agents-entrance.sh — Deferred entrances: #hud-inline (10s) + .poster-col (12s)

TARGET="$(dirname "$0")/public/index.html"
pass=0; fail=0

check() {
  local label="$1" pattern="$2"
  if grep -qE "$pattern" "$TARGET"; then
    echo "  PASS  $label"; ((pass++))
  else
    echo "  FAIL  $label"; echo "        Pattern not found: $pattern"; ((fail++))
  fi
}

echo ""; echo "regression-test-agents-entrance — deferred entrances"
echo "────────────────────────────────────────────────────────"

check "HTML: #hud-inline style=opacity:0"          'id="hud-inline"[^>]*style="opacity:0"'
check "HTML: .poster-col style=opacity:0"           'class="poster-col"[^>]*style="opacity:0"'
check "CSS: @keyframes agentsEntrance"              '@keyframes agentsEntrance'
check "CSS: @keyframes posterEntrance"              '@keyframes posterEntrance'
check "CSS: #hud-inline.hud-inline--visible"        '#hud-inline\.hud-inline--visible'
check "CSS: .poster-col.poster-col--visible"        '\.poster-col\.poster-col--visible'
check "CSS: prefers-reduced-motion fallback"        'prefers-reduced-motion'
check "JS: agents panel at 10000ms"                 "}, 10000\)"
check "JS: poster at 12000ms"                       "}, 12000\)"
check "JS: clears hud-inline opacity"               "getElementById\('hud-inline'\)"
check "JS: clears poster-col opacity"               "querySelector\('\.poster-col'\)"

echo "────────────────────────────────────────────────────────"
echo "  Results: ${pass} passed, ${fail} failed"; echo ""
[ "$fail" -gt 0 ] && { echo "  REGRESSION DETECTED."; exit 1; } || { echo "  All checks verified."; exit 0; }
