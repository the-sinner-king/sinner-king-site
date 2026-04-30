#!/usr/bin/env bash
# regression-test-turbopack-window.sh
#
# GUARDS AGAINST: "Error in worker registerModule call: window is not defined"
#
# WHY THIS EXISTS (S247 — iCloud disaster postmortem):
#   Turbopack 16.x HMR uses a SharedWorker to coordinate module registration
#   across tabs. The worker evaluates each module's factory function to extract
#   exports and dependencies. Worker context has NO `window`, `document`, or
#   `navigator`. Any module that accesses these at import time (top-level scope,
#   not inside a function/hook) will crash the worker and kill HMR for the
#   entire dev session.
#
#   This was exposed when the `node_modules -> node_modules.nosync` symlink
#   changed every module's path-based ID, forcing Turbopack to re-evaluate all
#   library factories fresh (including R3F/Three.js which access window at init).
#
# THE LAW: Code that runs at module import time must work in a worker context.
#   Browser APIs must only be accessed inside functions, hooks, or event handlers.
#   Guard pattern: typeof window !== 'undefined'
#
# CHECKS:
#   1. No .nosync symlinks masquerading as node_modules or .next
#   2. No bare window/document/navigator access at module scope in src/

set -euo pipefail

SITE_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Turbopack Worker Safety Check ==="
echo ""

# --- CHECK 1: No .nosync symlinks ---
echo "[ Check 1: .nosync symlinks ]"

if [ -L "$SITE_DIR/node_modules" ]; then
  fail "node_modules is a symlink → $(readlink "$SITE_DIR/node_modules") — Turbopack bakes symlink path into module IDs, breaking HMR worker registration"
else
  ok "node_modules is a real directory"
fi

if [ -L "$SITE_DIR/.next" ]; then
  fail ".next is a symlink → $(readlink "$SITE_DIR/.next") — Turbopack open file handles through symlinks can confuse chunk URL generation"
else
  ok ".next is a real directory (or absent — fine on fresh build)"
fi

echo ""

# --- CHECK 2: No bare window/document/navigator at module scope ---
# Heuristic: flag any line in src/ that:
#   - accesses window., document., or navigator.
#   - is NOT inside a function, hook, or block (indented < 2 spaces)
#   - is NOT a comment, type, or import
#   - is NOT already guarded by typeof check on the same or previous line
echo "[ Check 2: Module-scope browser globals in src/ ]"

VIOLATIONS=$(grep -rn \
  --include="*.ts" --include="*.tsx" \
  -E "^(window\.|document\.|navigator\.)" \
  "$SITE_DIR/src/" 2>/dev/null || true)

if [ -n "$VIOLATIONS" ]; then
  fail "Found top-level browser global access (will crash Turbopack HMR worker):"
  echo "$VIOLATIONS" | while IFS= read -r line; do
    echo "    $line"
  done
else
  ok "No bare window/document/navigator at module scope"
fi

# Secondary check: window access outside of useEffect/useCallback/useMemo/handlers
# This catches `const x = window.something` at module level
DEEP_VIOLATIONS=$(grep -rn \
  --include="*.ts" --include="*.tsx" \
  -E "^(const|let|var|export const|export let) .+ = (window|document|navigator)\." \
  "$SITE_DIR/src/" 2>/dev/null || true)

if [ -n "$DEEP_VIOLATIONS" ]; then
  fail "Found module-level variable initialized from browser global:"
  echo "$DEEP_VIOLATIONS" | while IFS= read -r line; do
    echo "    $line"
  done
else
  ok "No module-level variables initialized from browser globals"
fi

echo ""

# --- RESULT ---
echo "=== Result: $PASS passed, $FAIL failed ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL — Fix the above before running the Turbopack dev server."
  echo "       Pattern to fix: move browser global access inside useEffect or guard with:"
  echo "       if (typeof window !== 'undefined') { ... }"
  exit 1
else
  echo "PASS — Turbopack worker safety confirmed."
  exit 0
fi
