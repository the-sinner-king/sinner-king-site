#!/usr/bin/env bash
# regression-test-perf01.sh — Performance optimization regression tests (S221)
# Verifies the 5 layout-thrash fixes in public/index.html are intact.
# Exit 0 = all pass. Exit 1 = at least one regression detected.
#
# Fixes under test:
#   FIX-01: Camera lerp — single scrollY read per rAF frame + write guard
#   FIX-02: Lazy mManifestoTop — getBoundingClientRect deferred to first typewriter call
#   FIX-03: Debounce scrollHeight — update target every 8 chars or on newline only
#   FIX-04: GIF→video — cta-gif is now <video autoplay muted loop> (loading="lazy" n/a on video)
#   FIX-05: HUD mirror interval — >= 5000ms (was 2000ms)

TARGET="$(dirname "$0")/public/index.html"

pass=0
fail=0

check() {
  local label="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$TARGET"; then
    echo "  PASS  $label"
    ((pass++))
  else
    echo "  FAIL  $label"
    echo "        Pattern not found: $pattern"
    ((fail++))
  fi
}

echo ""
echo "regression-test-perf01 — public/index.html performance fixes"
echo "──────────────────────────────────────────────────────────────"

# FIX-01a: scrollY cached as const sy (mPanel.scrollTop for #page-panel, window.scrollY fallback)
check "FIX-01a: scrollY cached as 'const sy' (panel-aware)" \
  "const sy\s*=\s*mPanel"

# FIX-01b: write guard — skip scrollTo when dist < 0.5px
check "FIX-01b: scrollTo write guard (Math.abs(dist) > 0.5)" \
  "Math\.abs\(dist\)\s*>\s*0\.5"

# FIX-01c: camera loop uses cached sy, not window.scrollY again
check "FIX-01c: camera uses sy + dist (not window.scrollY + dist)" \
  "window\.scrollTo\(0,\s*sy\s*\+"

# FIX-02a: mManifestoTop sentinel value (-1, not inline getBoundingClientRect)
check "FIX-02a: mManifestoTop sentinel let declaration" \
  "let mManifestoTop\s*=\s*-1"

# FIX-02b: lazy init guard inside manifestoType
check "FIX-02b: lazy getBoundingClientRect inside manifestoType" \
  "mManifestoTop\s*<\s*0\s*&&\s*mManifestoDiv"

# FIX-03: scrollHeight debounced — only on newline or every 8 chars
check "FIX-03: scrollHeight debounce (ch === '\\\\n' || manifestoPos % 8 === 0)" \
  "ch\s*===\s*'\\\\n'\s*\|\|\s*manifestoPos\s*%\s*8\s*===\s*0"

# FIX-04: cta-gif is a <video> element (gif→mp4 conversion — video doesn't support loading="lazy")
check "FIX-04: cta-gif is video element (gif→mp4 perf fix)" \
  'video[^>]*class="cta-gif"'

# FIX-05: HUD mirror interval is 5000, not 2000
check "FIX-05: mirrorToInlinePanel interval >= 5000ms" \
  "setInterval\(mirrorToInlinePanel,\s*5[_]?000\)"

# FIX-06: Camera loop is actually started (was defined but never invoked)
check "FIX-06: mCameraLoop() invoked at init" \
  "mCameraLoop\(\);"

echo "──────────────────────────────────────────────────────────────"
echo "  Results: ${pass} passed, ${fail} failed"
echo ""

if [ "$fail" -gt 0 ]; then
  echo "  REGRESSION DETECTED — one or more performance fixes were reverted."
  exit 1
else
  echo "  All performance fixes verified."
  exit 0
fi
