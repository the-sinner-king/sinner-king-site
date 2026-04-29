#!/bin/bash
# regression-test-scout.sh — SCOUT console pipeline end-to-end test
# Tests: ollama HTTP API, SCOUT_MINUTE.json validity, cockpit API, server persistence
set -euo pipefail

PASS=0
FAIL=0
SCOUT_FILE="$HOME/Desktop/THE_SCRYER/ENGINE_ROOM/SCOUT/data/SCOUT_MINUTE.json"
OLLAMA_HOST="127.0.0.1:11435"
COCKPIT_URL="http://localhost:3033/api/cockpit/scout"

pass() { echo "  ✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL+1)); }

echo ""
echo "═══════════════════════════════════════════════"
echo "  SCOUT CONSOLE REGRESSION TEST"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════"
echo ""

# T01 — ollama HTTP API responds
echo "T01: ollama HTTP API responds on :11435..."
RESP=$(curl -s --max-time 10 "http://$OLLAMA_HOST/api/tags" 2>/dev/null)
if echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert any('gemma4:e4b' in m['name'] for m in d.get('models',[])), 'model not found'" 2>/dev/null; then
    pass "ollama :11435 up with gemma4:e4b"
else
    fail "ollama :11435 not responding or gemma4:e4b missing"
fi

# T02 — ollama inference with think=false completes in <10s
echo "T02: ollama inference speed (think=false)..."
START=$(date +%s)
INFER=$(curl -s --max-time 15 "http://$OLLAMA_HOST/api/generate" \
    -d '{"model":"gemma4:e4b","prompt":"Return one word: OK","stream":false,"think":false}' \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('response','').strip())" 2>/dev/null)
END=$(date +%s)
ELAPSED=$((END-START))
if [ $ELAPSED -lt 10 ] && [ -n "$INFER" ]; then
    pass "inference completed in ${ELAPSED}s (threshold: 10s)"
else
    fail "inference took ${ELAPSED}s or returned empty — think=false may not be working"
fi

# T03 — SCOUT_MINUTE.json exists and is valid JSON
echo "T03: SCOUT_MINUTE.json valid..."
if [ -f "$SCOUT_FILE" ]; then
    python3 -c "import json; json.load(open('$SCOUT_FILE'))" 2>/dev/null && pass "valid JSON" || fail "invalid JSON"
else
    fail "SCOUT_MINUTE.json missing at $SCOUT_FILE"
fi

# T04 — SCOUT_MINUTE.json spark is non-empty and not a timeout error
echo "T04: spark field has real content..."
SPARK=$(python3 -c "
import json
d = json.load(open('$SCOUT_FILE'))
s = d.get('spark', '')
print(s[:100])
" 2>/dev/null)
if [ -z "$SPARK" ]; then
    fail "spark field empty"
elif echo "$SPARK" | grep -qi "ollama timed out\|error:"; then
    fail "spark contains error string: $SPARK"
else
    pass "spark has content: ${SPARK:0:60}..."
fi

# T05 — SCOUT_MINUTE.json is fresh (< 10 min old)
echo "T05: SCOUT_MINUTE.json freshness..."
AGE=$(python3 -c "
import json
from datetime import datetime
d = json.load(open('$SCOUT_FILE'))
ts = d.get('timestamp','')
if ts:
    age = (datetime.now() - datetime.fromisoformat(ts)).total_seconds()
    print(int(age))
else:
    print(99999)
" 2>/dev/null)
if [ "$AGE" -lt 600 ]; then
    pass "data is ${AGE}s old (threshold: 600s)"
else
    fail "data is ${AGE}s stale — scout_minute may not be running"
fi

# T06 — cockpit API responds at localhost:3033
echo "T06: cockpit API at localhost:3033..."
API_OK=$(curl -s --max-time 5 "$COCKPIT_URL" | python3 -c "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('ok') else 'no')" 2>/dev/null)
if [ "$API_OK" = "yes" ]; then
    pass "cockpit API returns ok:true"
else
    fail "cockpit API returned ok:false or unreachable — is sinner-console launchd running?"
fi

# T07 — sinner-console launchd is loaded and running
echo "T07: com.kingdom.sinner-console launchd service..."
STATUS=$(launchctl list | grep "sinner-console" | awk '{print $1}')
if [ -n "$STATUS" ] && [ "$STATUS" != "-" ]; then
    pass "launchd service running (PID $STATUS)"
else
    fail "launchd service not running — check com.kingdom.sinner-console.plist"
fi

# T08 — scout_minute launchd is loaded
echo "T08: com.scryer.scout-minute launchd service..."
SCOUT_STATUS=$(launchctl list | grep "scout-minute" | awk '{print $2}')
if [ "$SCOUT_STATUS" = "0" ] || [ -n "$(launchctl list | grep 'scout-minute')" ]; then
    pass "scout-minute service loaded (last exit: $SCOUT_STATUS)"
else
    fail "scout-minute service not loaded"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════"
echo ""
[ $FAIL -eq 0 ] && exit 0 || exit 1
