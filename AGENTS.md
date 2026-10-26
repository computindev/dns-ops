# Agent Instructions

## Project and reading map

DNS Ops is a DNS and mail operations platform. The web/API runs on Railway Node;
the collector uses Node.js, PostgreSQL and Redis. PostgreSQL is the authoritative
datastore. Read `README.md` for the current runtime, migration owner and local setup.

Before implementing a bead or committing changes, read the applicable sections of
`docs/AGENT_WORKFLOW.md` for clarification, dependencies, implementation standards
and Git procedure. Before user-facing changes, also follow Verification below and
the repository's verification skill. Commands and paths in those procedures are
relative to the repository root. `CLAUDE.md` imports this shared entrypoint.

## Non-interactive and parallel work

Use non-interactive commands on task-owned paths after inspecting their targets.
Avoid blanket force-overwrite/removal flags and preserve other sessions' changes,
stashes and processes. Stage explicit paths and inspect the staged diff. Use one
writer per shared worktree. SSH/SCP may use BatchMode to fail clearly when access
is unavailable; do not install host packages as an incidental cleanup step.

## No Stubs or Placeholders Policy

**CRITICAL: This project does NOT allow stubs, placeholders, TODOs without implementation, or "mock" code.**

### What This Means

- ❌ **NEVER commit**: `// TODO: implement this`, `return null`, `throw new Error("not implemented")`
- ❌ **NEVER commit**: Mock functions that return hardcoded data instead of real implementation
- ❌ **NEVER commit**: Placeholder files with only exports but no actual logic
- ❌ **NEVER commit**: Database operations that return fake IDs instead of persisting

### If a Spec Is Unclear

**STOP and communicate immediately.** Do NOT proceed with guesses or stubs.

**Required workflow:**
1. Read the full specification in `beads/<name>.md`
2. If requirements are ambiguous, incomplete, or contradictory:
   - Document what is unclear
   - Propose a specific solution with rationale
   - Wait for confirmation before implementing

### What IS Allowed

- ✅ Temporary workarounds with `FIXME:` comments that include:
  - Specific trigger condition for replacement
  - Name of library/approach to use instead
  - Link to issue tracking the replacement

- ✅ Feature flags for gradual rollout (with clear on/off logic)
- ✅ Graceful degradation with explicit error messages to users

### Quality Gate

Before committing, verify:
1. Every function returns real data or a meaningful error
2. Database operations actually persist (not mock IDs)
3. API endpoints return real responses (not placeholders)
4. All error cases are handled explicitly (not `TODO: handle error`)

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Remove only temporary files/worktrees created for this task; preserve other sessions' stashes, branches and changes
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Agent Flywheel (NucBox)

- Repository: `dns-ops`
- Runtime markers: Bun
- Workbench control plane: not mapped; run `mde search dns-ops` before reporting project status
- Repository memory: `.cass/playbook.yaml`; keep rules project-specific.
- Git remains the code authority; Workbench is the coordination authority when mapped.

On a host with the Flywheel tools installed, before a non-trivial task:

```bash
TASK="describe the task"
cm context "$TASK" --workspace "$PWD" --json
cass search "$TASK" --workspace "$PWD" --days 90 --json --fields summary
```

Flywheel tools and state are host-managed. If they are unavailable, use the repository sources and report that tooling limitation; do not claim a host check ran. Search Workbench with plain `mde search`, then read the exact document with `mde cat`.
Before committing, run `ubs --diff .` and `ubs --staged`.
Keep `dcg` active; explain blocks and prefer reversible alternatives.
Use `herdr --session dns-ops` for persistent remote agent work.

## Verification (verify-kit)

- Tests passing ≠ feature works ≠ independently verified ≠ safe to merge ≠ deployed and working. Each step needs its own evidence.
- Every task that changes user-facing behavior names its affected feature ids and a *Done means* block (see `.agents/verify-kit/templates/task-done-means.md`). Start with `node .agents/verify-kit/verify.mjs start --features <ids>` (or `--auto`) and **read the affected feature files before implementing** — their Proof section is the acceptance criteria.
- Prove behavior through the surface it changes, using `.agents/skills/verify-dns-ops/` (launch → doctor → drive → evidence → cleanup). A green test suite is not a proof.
- Write a receipt per affected feature (`verify.mjs receipt …`). Statuses: passed · failed · blocked · unreachable · not_applicable. No `skipped`; non-passed needs a reason.
- Configured completion hooks can block pending work (pi: relaunch on idle; Claude Code: Stop hook); inspect the current host configuration before claiming they are active. Verification remains required without a hook. If you need the user before you can verify, pause (`verify_pause` tool or `verify.mjs pause --reason "..."`), then ask. Resume explicitly with `verify.mjs resume` and check `verify.mjs status`; do not assume an unrelated prompt resumed a task. The installed CLI also re-arms on run-new/receipt. The committed CI verification job runs `check-ci` against the relevant revisions. Local commit gates depend on the installed Pi/git-hook configuration. These gates require profile-appropriate receipts for the exact code tree (`code_digest`); do not claim a local hook ran without checking it. Verify, then commit exactly what you verified; editing code or harness after verifying invalidates the receipt (docs, receipts and the kit itself do not).
- Profile `critical` (auth, money, permissions, tenant isolation, provider writes, irreversible changes) requires a fresh verifier at the exact commit (pi: `verify_fresh` tool; otherwise the `verify-fresh` skill in a clean session). The builder may self-check but cannot issue the final verdict.
- Selectors: ARIA role/label → `data-action-id` → `data-state`. No class selectors, no coordinates, no sleeps. `verify.mjs lint-selectors` enforces it; `verify.mjs lint-map --fresh` fails when the map or harness references a selector, state or route that does not exist in product source, or a `paths` glob that matches nothing.
- In pi, editing a file that belongs to a mapped feature arms the task for that feature automatically (`policy.scope`); editing outside the pending task's features is scope drift. Evidence is validated on `receipt`: fake or truncated screenshots/traces/transcripts, and any artifact containing a secret, are refused.
- Never edit the feature map to make a failing verification pass. Doc drift is fixed in the map; regressions are reported as `failed` receipts.
- New gotchas learned while verifying go to the feature file's Gotchas section as a proposed edit (`capture-learnings`), not into chat.
