#!/usr/bin/env bash
# regression-test-camera01.sh — Camera/scroll system (S218 DEBUGGING fixes)
#
# Fixes under test:
#   CAM-01: mSettleDeadline removed — replaced with mFramesAfterDone frame-count exit
#   CAM-02: Post-done lerp factor 0.20 (faster settle, no rubber-band overshoot)
#   CAM-03: mManifestoTop uses mPanel.scrollTop (panel-aware, void scene) with window.scrollY fallback
#   CAM-04: onManifestoComplete fallback-inits mManifestoTop for early-skip path
#   CAM-05: wheel/touchmove once-listeners REMOVED (ghost inertial events were killing camera)
#   CAM-06: Skip-path scroll snap in rAF callback (camera dead → window.scrollTo to target)

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

check_absent() {
  local label="$1" pattern="$2"
  if grep -qE "$pattern" "$TARGET"; then
    echo "  FAIL  $label (pattern should NOT be present)"; echo "        Pattern found: $pattern"; ((fail++))
  else
    echo "  PASS  $label (correctly absent)"; ((pass++))
  fi
}

echo ""; echo "regression-test-camera01 — camera/scroll system fixes"
echo "────────────────────────────────────────────────────────────────"

check     "CAM-01a: mFramesAfterDone declared"                   "let mFramesAfterDone\s*="
check_absent "CAM-01b: mSettleDeadline removed"                  "let mSettleDeadline"
check     "CAM-02a: post-done factor 0.20 in mCameraLoop"        "mDone \? 0\.20 : 0\.08"
check     "CAM-02b: typing factor 0.08 still present"            "0\.08"
check     "CAM-03: mManifestoTop uses panel-aware scroll offset"  "getBoundingClientRect\(\)\.top \+.*mPanel.*scrollTop"
check     "CAM-04: fallback mManifestoTop init in onManifestoComplete" "mManifestoTop < 0 && mManifestoDiv"
check_absent "CAM-05a: wheel once-listener removed from complete" "addEventListener\('wheel',\s*mCameraStop"
check_absent "CAM-05b: touchmove once-listener removed"          "addEventListener\('touchmove',\s*mCameraStop"
check     "CAM-06: skip-path snap in rAF callback"               "!mCameraRaf.*window\.scrollTo\(0, mTargetScroll\)"

echo "────────────────────────────────────────────────────────────────"
echo "  Results: ${pass} passed, ${fail} failed"; echo ""
[ "$fail" -gt 0 ] && { echo "  REGRESSION DETECTED."; exit 1; } || { echo "  All camera fixes verified."; exit 0; }
