#!/usr/bin/env bash
# harness/cli.sh — drive a CLI/TUI in an isolated tmux session and capture the transcript + exit code.
# Usage: VERIFY_RUN_DIR=… harness/cli.sh <name> -- <command...>
# Example: harness/cli.sh scan -- pnpm dns-ops scan --domain example.test --json
# Note: arguments are re-joined with spaces for the tmux session; quote the whole command as one string if it needs inner quoting.
set -euo pipefail
: "${VERIFY_RUN_DIR:?VERIFY_RUN_DIR not set — run verify.mjs run-new first}"
NAME="$1"; shift; [ "${1:-}" = "--" ] && shift
SESSION="verify-${NAME}-$$"
OUT="$VERIFY_RUN_DIR/cli-${NAME}.txt"
tmux new-session -d -s "$SESSION" -x 200 -y 50
tmux send-keys -t "$SESSION" "$* ; echo __EXIT=\$?" Enter
for _ in $(seq 1 600); do   # up to 120 s; poll the end state, do not sleep blindly
  # the typed command line also contains "__EXIT=$?" (unexpanded); wait for a real exit code (digits)
  if tmux capture-pane -p -S -2000 -t "$SESSION" | grep -qE '__EXIT=[0-9]+'; then break; fi
  sleep 0.2   # lint-allow: polling loop, bounded above
done
tmux capture-pane -p -S -2000 -t "$SESSION" > "$OUT"
tmux kill-session -t "$SESSION"
CODE=$(grep -oE '__EXIT=[0-9]+' "$OUT" | tail -1 | cut -d= -f2 || true)
echo "exit_code: ${CODE:-timeout}" >> "$OUT"
echo "$OUT (exit ${CODE:-timeout})"
[ "${CODE:-timeout}" = "0" ]
