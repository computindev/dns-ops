#!/usr/bin/env bash
# Read-only collector liveness/readiness check for API route verification.
set -euo pipefail

COLLECTOR_URL="${COLLECTOR_URL:-http://127.0.0.1:3001}"

live="$(curl -fsS --max-time 5 "$COLLECTOR_URL/healthz")"
printf '%s\n' "$live" | grep -q '"status":"ok"'
printf 'ok    collector /healthz\n'

ready="$(curl -sS --max-time 5 -w '\n%{http_code}' "$COLLECTOR_URL/readyz")"
ready_status="$(printf '%s\n' "$ready" | tail -n 1)"
case "$ready_status" in
  200|503) printf 'ok    collector /readyz (%s)\n' "$ready_status" ;;
  *) printf 'FAIL  collector /readyz (%s)\n' "$ready_status" >&2; exit 1 ;;
esac

printf 'doctor: collector is reachable; readiness status is an allowed local dependency result\n'
