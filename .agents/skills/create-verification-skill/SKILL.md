---
name: create-verification-skill
description: Generate a project-local verify-<app> skill plus an executable feature map so any agent can launch this repo's app, check it is healthy, drive user-facing features the way a user would, capture evidence, write a verification receipt, and clean up. Use whenever a repo has no scripted way to prove UI, CLI, API or worker behavior; when someone says "make a verification skill", "feature map", "how do we prove this works", "verify-<app>"; and before the first behavioral task in any repo that has verify-kit installed but no .agents/skills/verify-* yet. Harness-neutral (Claude Code, Codex, Cursor, Pi).
---

# Create a verification skill

You are writing for the next agent, not for a human: it will read the output cold, mid-task, having never seen this app. Everything you write must be exact and executable. Adapted from pstack's `create-verification-skill` (Lauren Tan, MIT) to verify-kit's harness-neutral layout and receipts.

## 0. Preconditions

- verify-kit is installed: `.agents/verify-kit/verify.mjs` and `verification/policy.json` exist. If not, stop and say: run `install.sh <repo> --app <name>` from the kit.
- Read `.agents/verify-kit/templates/verify-app/SKILL.md.template`, `templates/verify-app/features/README.md.template`, `templates/verify-app/features/_feature.md.template`, and `references/feature-map-example/` in this skill.
- Decide `<app>`: the product name used in `verification/policy.json` (`app`). One verify skill per deployable app; a monorepo with two apps gets two skills.

## 1. Interview the repo, not the user

Answer from the codebase; ask the user only for what cannot be observed (credentials, entitlements, which of several apps).

| Question | Where to look first |
|---|---|
| **Surface** — what does a user touch? web UI, CLI/TUI, API, worker/queue, pipeline, library | routes, `bin`, `package.json` scripts, `wrangler.toml`, `Dockerfile`, README |
| **Run** — how does it start locally? ports, env, seed, auth | `pnpm dev`/`bun dev`, `wrangler dev`, `docker compose`, `drizzle` migrate/seed scripts, `.env.example` |
| **Drive** — how can an agent operate it programmatically? | existing Playwright/Cypress specs, `e2e/`, curl-able endpoints, a CLI with `--json`, a debug port |
| **Observe** — what evidence exists? | screenshots, traces, response bodies, logs, exit codes, DB rows, queue/outbox rows, generated files |
| **Isolate** — can two instances run side by side? | ports, data dirs, tenant ids, `DATABASE_URL` overrides |
| **Reset** — how do you get back to a known state? | seed scripts, `db:reset`, disposable tenants, fixtures |

Stack hints for this studio's defaults: TanStack Start/Vite dev port; Hono on `wrangler dev --local`; Postgres via Drizzle (`db:migrate`, `db:seed`); Better Auth → look for a seeded test user or a dev auto-login, never live OAuth; BullMQ/Cloudflare Queues → find the job trigger and the state you can read back after it ran.

If the checkout does not build or start as-is, fix that first or report it precisely. Never generate a skill against a broken base. If an irrelevant missing asset blocks startup, create it, mark it clearly as verification scaffolding, and remove it in Cleanup.

## 2. Write `.agents/skills/verify-<app>/SKILL.md`

Fill the template. No placeholders may remain (`<<FILL` must not appear). Sections:

- **Launch** — the exact command, how to know it is ready (log line, port answering, prompt), and teardown. For short-lived CLIs: build once, then each drive in its own PTY/tmux session.
- **Doctor** — one read-only check: process up, right build/sha, port owned by us, DB reachable, migrations applied, test user present. Ship it as `harness/doctor.sh`. An agent runs it first whenever anything looks off.
- **Drive** — real selectors and commands from this repo. Prefer ARIA roles/labels, `data-action-id`, `data-state`; route paths; CLI flags. Never coordinates, tab order or presentation classes.
- **Evidence** — what to capture, into `$VERIFY_RUN_DIR`: screenshots of action *and* resulting state, Playwright trace, console errors, failed requests, HTTP exchanges, DB/queue read-backs, generated files. Proof standards: real user path (no test-only endpoints, no internal setters); side effects verified through an independent read path; mocks only where a production boundary already isolates the external system; a dry-run is verified by observing what it skips, not by its name.
- **Receipts** — keep the verify-kit block from the template verbatim: `run-new` → drive → `receipt`.
- **Cleanup** — kill what you started (by pid/session, never by name); remove scratch state and disposable tenants tagged with the run id; never delete evidence.
- **Helpers** — every script the skill ships is executable and its invocation appears in the body.

## 3. Seed the feature map

Create `features/README.md` (index, baseline preconditions, driving conventions, proof/skip reporting) and one file per user-facing feature: the top 3–5 to start, found from routes, commands, menus or docs. A feature is a user capability (`case.open`, `order.dispatch`), not a component.

The frontmatter is machine-read by `verify.mjs` and is mandatory:

```yaml
---
id: case.open              # <domain>.<capability>, stable forever
surface: web               # web | api | cli | worker | pipeline
profile: critical          # changed | critical
paths:                     # globs that, when changed, make this feature "affected"
  - apps/web/src/cases/**
  - packages/core/src/case/**
always_with: []            # feature ids that must be verified together with this one
---
```

Mark `profile: critical` for auth, money, permissions, tenant isolation, provider writes, data deletion, anything irreversible. Body sections: `## Sub-features`, `## How to get to it (user POV)`, `## Driving it with <harness>`, `## Proof` (expected observations, forbidden observations, read-back), `## Gotchas`. The map is the repo's maintained verification source: a proof that drives one convenient entry point is incomplete when the map lists others.

Run `node .agents/verify-kit/verify.mjs features` and confirm every file is listed. Then `node .agents/verify-kit/verify.mjs lint-map --fresh`: every `data-action-id`, `data-state` and route the map or harness references must exist in product source, and every `paths` glob must match real files. Zero errors before handing over — a map that names selectors the product does not have is fiction.

## 4. Build the harness

Copy the skeletons from `.agents/verify-kit/templates/verify-app/harness/` into `.agents/skills/verify-<app>/harness/` and replace every `<<FILL` with real values. Keep the console/failed-request capture and the trace. Then run `node .agents/verify-kit/verify.mjs lint-selectors` — zero errors before handing over.

## 5. Prove the skill before handing it over

Run your own instructions end to end once:

1. `node .agents/verify-kit/verify.mjs run-new --label bootstrap` → `export VERIFY_RUN_DIR=<printed absolute path>`; run harness commands from the repo root
2. Launch → Doctor → drive ONE mapped feature → capture evidence → Cleanup
3. `node .agents/verify-kit/verify.mjs receipt --run <id> --feature <id> --status passed --notes-file <observations.md>` (or `blocked`/`unreachable` with an exact reason). `passed` is refused when the run dir holds no evidence beyond `env.txt`.
4. Confirm the evidence still exists after cleanup and the receipt lists it. A cleanup that eats the proof fails this step.

Fix what fails and run Cleanup after every failed iteration so broken attempts do not strand processes or ports. A generated skill that was never executed is a draft, not a deliverable.

## 6. Wire it

- pi reads `.agents/skills/` natively. For Claude Code and Cursor, symlink the new skill: `ln -s ../../.agents/skills/verify-<app> .claude/skills/verify-<app>` and the same under `.cursor/skills/` (or rerun the kit's `install.sh --link-only`).
- Set `"skill": ".agents/skills/verify-<app>"` in `verification/policy.json` if it is null.
- Add the kit's **Verification** block from `.agents/verify-kit/templates/AGENTS-snippet.md` to `AGENTS.md` / `CLAUDE.md` if absent.

## 7. Hand off

Report: surface(s), launch/doctor commands, mapped features with profiles, the receipt you produced, what you could not verify and why. Point at the `maintain-verification-skill` skill for keeping the map honest. Do not expand the map beyond 3–5 features now; it grows when a task touches unmapped behavior.

## Non-goals

Do not document internals — the map teaches how to use a feature, not how it is built. Do not touch product code except startup blockers (report those). Do not add a verifier for every component. Do not mark anything `passed` that you did not personally drive in this run.
