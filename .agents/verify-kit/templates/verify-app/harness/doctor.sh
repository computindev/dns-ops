#!/usr/bin/env bash
# harness/doctor.sh — read-only: is this instance worth driving? Exit 0 = yes. Never mutates anything.
set -u
APP_URL="${APP_URL:-http://localhost:3000}"   # <<FILL>>
ok=0; bad=0
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then echo "ok    $name"; ok=$((ok+1)); else echo "FAIL  $name"; bad=$((bad+1)); fi; }
check "app answers $APP_URL/healthz"          curl -fsS --max-time 5 "$APP_URL/healthz"          # <<FILL: real health path>>
check "app ready (db, migrations)"            curl -fsS --max-time 5 "$APP_URL/readyz"           # <<FILL>>
check "build sha matches HEAD"                bash -c "[ \"\$(curl -fsS --max-time 5 $APP_URL/version | sed -n 's/.*\"sha\":\"\\([0-9a-f]*\\)\".*/\\1/p')\" = \"\$(git rev-parse HEAD)\" ]"   # <<FILL or drop>>
check "verification user exists"              bash -c "<<FILL: e.g. psql \$DATABASE_URL -tAc \"select 1 from users where email='verify@example.test'\" | grep -q 1>>"
check "node/pnpm present"                     bash -c "node --version && pnpm --version"
echo "doctor: $ok ok, $bad failed"
[ "$bad" -eq 0 ]
