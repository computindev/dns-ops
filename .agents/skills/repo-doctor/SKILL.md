---
name: repo-doctor
description: >-
  Audit a repository's agent-readiness against reality: does the documented quickstart actually start the app, do the scripts exist and run, are required env vars documented, is there a doctor command, seeded test login, deterministic reset, stable selectors, AGENTS.md/CLAUDE.md that match the code. Use when onboarding a repo to verify-kit, when an agent keeps failing to start or drive an app, when someone says "is this repo agent-friendly", "repo doctor", "audit the README against reality", or before create-verification-skill on an unfamiliar repo. Read-only: produces a scored report and proposed fixes, never edits product code.
---

# Repo doctor

Inspired by Cursor's `agent-compatibility` idea: audit startup, validation and docs *against reality*, by running them. Output: `verification/repo-doctor-<YYYYMMDD>.md` with a score and a fix list. Do not fix product code in this run; propose.

## Checks (run each; record command, result, evidence)

**Startup**
1. README/AGENTS quickstart executed verbatim on a clean shell: does it reach a healthy app? Time it.
2. Every `package.json` script referenced in docs exists and exits 0 (or is clearly interactive).
3. `.env.example` vs required env: grep `process.env.`, `env.`, `Bindings`, `wrangler.toml [vars]`; list undocumented or unused variables.
4. Ports: fixed or configurable? Can two instances coexist?

**Health & state**
5. A read-only doctor/health path exists (`/healthz`, `/readyz`, `doctor` script) and reports version/sha, DB, migrations.
6. Deterministic reset: seed/reset script, disposable tenant or data dir; time to reset.
7. Test identity: seeded user or dev auto-login that does not require live OAuth or a real inbox.

**Drivability**
8. Web: important controls have accessible names; business actions carry `data-action-id`; observable states carry `data-state`; no test relies on Tailwind classes. Run `node .agents/verify-kit/verify.mjs lint-selectors` if a harness exists.
9. CLI/API: `--help` with examples, `--json`, non-interactive flag, documented exit codes, idempotent commands (see `cli-for-agents`).
10. Workers/queues: a way to trigger one job and read back its effect without waiting on a schedule.

**Docs vs code**
11. AGENTS.md / CLAUDE.md exist, name the verify skill, and every command in them runs.
12. Feature map exists (`.agents/skills/verify-*/features/`), frontmatter valid, `paths` globs point at existing directories.

## Scoring

Each check: ✅ pass · ⚠️ partial · ❌ fail · ⏭ n/a. Score = passes / applicable. Below 8/12 the repo is not ready for autonomous verification; list the three fixes with the highest leverage first (usually: doctor script, seeded login, `data-action-id`).

## Report shape

```
# Repo doctor — <repo> @ <sha> — <date>
Score: 7/11
| # | check | result | evidence | fix |
...
## Top 3 fixes (proposed, not applied)
## Notes for the feature map
```
