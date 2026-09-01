---
name: cli-for-agents
description: >-
  Design and review command-line tools, scripts and package.json commands so coding agents can run them reliably and verify their effects: help with examples, --json output, non-interactive mode, documented exit codes, idempotency, honest --dry-run, stable flags, no TTY assumptions. Use whenever creating or changing a CLI, a bin script, a Makefile/pnpm script that agents will invoke, an MCP tool that wraps a command, or when an agent repeatedly misuses a command. Inspired by Cursor's cli-for-agent plugin.
---

# CLIs that agents can run

An agent reads `--help` once, cold, and then has to trust exit codes and output. Design for that reader.

## Contract checklist (apply on create; audit on review)

1. `--help` on every command and subcommand, with at least one **copy-pastable example** per command and the default values shown.
2. `--json` (or `--format json`) for any output an agent will parse; plain text stays for humans. JSON goes to stdout, diagnostics to stderr, always.
3. Non-interactive by default when stdin is not a TTY; `--yes`/`--no-input` to skip prompts; never hang waiting for input.
4. Exit codes documented and specific: `0` ok, `1` generic failure, `2` usage error, `3+` domain failures (e.g. `3` precondition, `4` remote error). A partial success is not `0`.
5. Idempotent commands: running twice converges to the same state and says so (`already up to date`), instead of failing or duplicating.
6. `--dry-run` that truly performs no side effect — no network, no writes, no browser — and prints the exact effects it would have had. Verify it by observation, not by trust.
7. Stable flags and output keys; deprecate with a warning for at least one version; never rename silently.
8. No pagers, no colors when not a TTY (`NO_COLOR`), no spinners in non-TTY, no `clear`.
9. Errors name the next action: `missing DATABASE_URL — set it or pass --database-url`.
10. A `doctor` (or `status`) subcommand that is read-only and reports version, config source, connectivity.
11. `--version` prints version and git sha; `--verbose` adds the resolved config.
12. Deterministic ordering of lists; timestamps in ISO-8601 UTC; paths relative to the repo root when printed.
13. Long operations print progress to stderr and can be resumed or are safe to re-run.
14. One command, one effect. Composite workflows are documented sequences, not hidden side effects of a flag.

## Review output

For an existing CLI, produce a table: `# | rule | status | example of violation | proposed fix`, then the top three fixes. Add the CLI's commands to the feature map (`surface: cli`) when they are user-facing.
