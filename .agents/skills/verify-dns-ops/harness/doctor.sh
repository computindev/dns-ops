#!/usr/bin/env bash
# harness/doctor.sh — read-only: is this instance worth driving? Exit 0 = yes. Never mutates anything.
set -u
APP_URL="${APP_URL:-http://localhost:3000}"
COLLECTOR_URL="${COLLECTOR_URL:-}"
ok=0; bad=0
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then echo "ok    $name"; ok=$((ok+1)); else echo "FAIL  $name"; bad=$((bad+1)); fi; }
web_health() {
  local body http
  body=$(curl -sS --max-time 5 -w '\n%{http_code}' "$APP_URL/api/health") || return 1
  http=$(printf '%s\n' "$body" | tail -n 1)
  [ "$http" = "200" ]
}
collector_live() {
  curl -fsS --max-time 5 "$COLLECTOR_URL/healthz" | grep -q '"status":"ok"'
}
check "bun present" bun --version
check "node present" node --version
check "web /api/health 200 healthy" web_health
if [ -n "$COLLECTOR_URL" ]; then
  check "collector /healthz ok" collector_live
fi
echo "doctor: $ok ok, $bad failed"
[ "$bad" -eq 0 ]
