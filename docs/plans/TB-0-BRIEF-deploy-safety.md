# Task Brief — TB-0: Deploy Safety Net

**For:** developer picking up the first task of the v1 plan.
**Full plan:** `docs/plans/V1_INTERNAL_TRACER_PLAN.md` (read the "Method" + "TB-0" sections; this brief expands TB-0 into step-by-step work).
**Priority:** P0. This is the first thing we ship because it removes the "CI passes, production is broken" class of bugs.
**Estimated size:** ~1.5–2 days including tests.

---

## 0. Before you touch anything

```bash
git checkout master && git pull
git checkout -b tb-0-deploy-safety
```

- **Never commit to `master` directly.** Work on the branch above.
- This repo has a **strict no-stubs policy** (see `CLAUDE.md`): no `TODO`, no fake implementations, no `any` without justification. Every commit must build and pass tests.
- There are git hooks that run lint/typecheck/tests on `Stop`. Don't fight them — if they block you, the code isn't done.
- **Write the failing test first, then the code** (TDD). Each of the 5 sub-tasks below names its test.

Run the gates any time with:
```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

---

## What "done" looks like for TB-0

Five independent fixes, each with a test. You can do them in any order, but **1 is the big one** (half the task). Ship them as separate commits.

| # | Fix | Files | Test |
|---|-----|-------|------|
| 1 | Migration runner: add an applied-ledger + dynamic discovery | `scripts/run-migrations.mjs` | integration (test Postgres) |
| 2 | Reconcile migration journal + orphan file | `packages/db/src/migrations/meta/_journal.json`, `0000_init.sql` | covered by #1's test |
| 3 | Env validation must fail-fast in production | `apps/web/app/api.ts` | unit |
| 4 | Stop committing `.env` | `apps/web/.env`, `.gitignore`, `.env.example` | manual verify |
| 5 | Declare the missing `dns-packet` dependency | `apps/collector/package.json` | manual verify |

---

## Fix 1 — Migration runner (THE important one)

### What's wrong (read this first)

Open `scripts/run-migrations.mjs`. This script is the Railway **release command** (`apps/web/railway.toml` → `releaseCommand = "node scripts/run-migrations.mjs"`) — it runs on every production deploy. It has **two** bugs:

1. **Hardcoded file list (lines 35–47).** It lists exactly 11 migration files by name. But there are **12** `.sql` files in `packages/db/src/migrations/` (an extra `0000_init.sql`), and — more importantly — **the day someone adds `0011_*.sql` and forgets to edit this array, production silently never runs it.** CI won't catch it because CI's checker (`packages/db/scripts/verify-migrations.ts:102`) reads the directory dynamically, so CI validates a *superset* of what prod applies.

2. **No applied-ledger (lines 49–65).** The script re-runs **every** migration on **every** deploy, and swallows "already exists" errors via `isIdempotentMigrationError` (lines 7–12). This happens to work for pure DDL, but it's fragile: a migration that changes *data* (not just schema) would re-run on every single deploy. There is no record of "which migrations have already been applied."

### What to build

Replace the hardcoded array + naive loop with: **discover files dynamically**, and **track applied migrations in a ledger table**, applying only the ones not yet recorded.

Copy the discovery pattern that already exists and works — `packages/db/scripts/verify-migrations.ts:102-104`:
```js
readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort()
```

Target shape for the runner (pseudocode — you write the real thing):
```js
function discoverMigrationFiles(dir)          // readdirSync + filter .sql + sort
async function ensureLedger(client)           // CREATE TABLE IF NOT EXISTS _migrations_applied (name text primary key, checksum text, applied_at timestamptz default now())
async function getApplied(client)             // SELECT name FROM _migrations_applied  → Set<string>
async function applyPending(client, file)     // BEGIN; run sql; INSERT into ledger; COMMIT  (transaction where the SQL allows it)
```
Flow: `ensureLedger` → `discoverMigrationFiles` → for each file **not** in `getApplied`, `applyPending`. Keep the existing `DATABASE_URL` check and SSL handling (lines 15–27) as-is.

> **Option:** if you'd rather not hand-roll the ledger, use Drizzle's official migrator (`drizzle-orm/node-postgres/migrator` + a generated journal). Check with the lead before switching — either is acceptable, the ledger table is the simpler drop-in. Do **not** just make it dynamic without a ledger; that still allows silent partial application.

### Test first (this is the acceptance test)

Write an integration test against a real test Postgres (see how CI spins one up in `.github/workflows/ci.yml` — Postgres 15 service container; locally, point `DATABASE_URL` at a throwaway DB). Put it near the other db scripts/tests.

- **Given** a fresh migration `0011_test.sql` on disk and an empty ledger, **when** the runner executes, **then** it is applied and appears in `_migrations_applied`.
- **Given** that migration already recorded, **when** the runner executes **again**, **then** it is **skipped** (assert it did not re-run — e.g. the SQL's side effect happens exactly once). This "run twice" assertion is the whole point — don't skip it.

---

## Fix 2 — Reconcile the journal + orphan file

- `packages/db/src/migrations/0000_init.sql` is an orphan: it's on disk but not in the old hardcoded array and (per the audit) not in `meta/_journal.json`. **Confirm no environment depends on it** (ask the lead / check what it creates vs. `0000_nebulous_steve_rogers.sql`), then **delete it** — or, if it's genuinely needed, document why. Don't leave it ambiguous.
- `packages/db/src/migrations/meta/_journal.json`: the audit found its `idx 6` / `idx 7` tags don't match the real filenames on disk (`0006_enforce_tenant_not_null.sql`, `0007_tenant_domain_uniqueness.sql`). Reconcile the journal to the actual files so Drizzle tooling and the runner agree.
- Once Fix 1 reads the directory dynamically, this mostly falls out — but verify the journal is internally consistent before you close the task.

---

## Fix 3 — Env validation must fail-fast in production

### What's wrong

Open `apps/web/app/api.ts:16-25`:
```js
try {
  assertEnvValid();
} catch (error) {
  if (process.env.NODE_ENV === 'development') {
    throw error;              // ← throws in dev
  }
  console.warn('[ENV] Skipping env validation in production runtime');   // ← in prod, just warns and continues
}
```
This is backwards. `assertEnvValid()` (defined in `apps/web/hono/config/env.ts`) checks that required secrets like `INTERNAL_SECRET` are present and ≥16 chars in production (`env.ts:85-86`). Right now, if that secret is missing or weak **in production**, the app logs a warning and boots anyway — which silently disables the collector-auth and admin paths that depend on it. A misconfigured prod deploy should **crash on boot**, loudly, not limp along.

### What to do

Make it throw in production. The simplest correct behavior: `assertEnvValid()` failing should re-throw regardless of environment (or at minimum, throw in `production` and `development`, only soft-skip in `test` if a test needs it — check whether any test relies on the current behavior before changing).

### Test first

Unit test (put it next to `env.ts`'s tests):
- **Given** `NODE_ENV=production` and `INTERNAL_SECRET` unset, **when** validation runs, **then** it throws. (Set the env in the test, assert `expect(() => assertEnvValid()).toThrow()`.)
- Boundary pair: **given** a valid production env, **then** it does **not** throw. (This proves the test isn't passing vacuously — see the assertion-discipline note in `CLAUDE.md`.)

---

## Fix 4 — Stop committing `.env`

`apps/web/.env` is currently tracked in git (`git ls-files apps/web/.env` returns it), and `.gitignore` has **no** `.env` rules at all. The committed file is low-risk (a local dev `DATABASE_URL`, no password), but committing env files is a bad norm and a future leak vector.

```bash
git rm --cached apps/web/.env        # stop tracking, keep the local file
```
Then:
- Add to `.gitignore`: `.env`, `**/.env`, and keep `.env.example` tracked (add `!.env.example` if your patterns would catch it).
- Add the two production-required vars the deploy session flagged as missing to **`.env.example`**: `BETTER_AUTH_SECRET` and `WEB_DOMAIN`, with a comment on how to generate the secret (the file already uses `openssl rand -hex 16` hints for other secrets — match that style).

**Verify:** `git status` shows `apps/web/.env` deleted-from-index but still present on disk; `git check-ignore apps/web/.env` prints the path (i.e. it's now ignored).

---

## Fix 5 — Declare `dns-packet` as a collector dependency

`apps/collector/src/dns/dnssec-resolver.ts` imports `dns-packet` at runtime (it's how DNSSEC/delegation works), but `dns-packet` is **not** in `apps/collector/package.json` — it only exists in the **root** `package.json` under `devDependencies`. It works today only because the Docker build copies the whole `node_modules`. The day someone runs a production-only install or prunes root dev-deps, the collector crashes at runtime with no compile-time warning.

- Add `dns-packet` to `apps/collector/package.json` `dependencies` at the same version the root pins (`^5.6.1`). Use the CLI, don't hand-edit if you can avoid it:
  ```bash
  cd apps/collector && bun add dns-packet@^5.6.1
  ```
- While you're there: `apps/collector/package.json` also declares `node-dns` (`^0.1.0`) which is **unused** anywhere in `src/`. Remove it (`bun remove node-dns`) — confirm with a grep first: `grep -rn "node-dns" apps/collector/src` should return nothing.

**Verify:** `bun run build --filter @dns-ops/collector` still succeeds and `grep '"dns-packet"' apps/collector/package.json` shows it.

---

## Wrapping up

Before you open a PR:

1. Run the full gate: `bun run lint && bun run typecheck && bun run test && bun run build` — all green.
2. Each fix is its own commit, message following the repo pattern (see `git log`), e.g.
   `TB-0: migration runner applied-ledger + dynamic discovery`.
3. In the PR description, note: the "run twice → second run skips" test is the key one for Fix 1; and that Fix 3 changes production boot behavior (a misconfigured prod will now crash instead of warn — that's intended).
4. **Do not deploy.** This changes the release command; the lead will verify against staging first.

### If you get stuck

- Migration runner not sure how to get a test Postgres locally → look at `.github/workflows/ci.yml` for the exact container config, or ask the lead for the test `DATABASE_URL`.
- Unsure whether `0000_init.sql` is safe to delete → **stop and ask**, don't guess. Deleting a needed migration is not reversible against a real DB.
- `assertEnvValid` change breaks an existing test → that test may be relying on the buggy behavior; flag it, don't just delete the assertion.

Ping the lead when the branch is green. Next task after this is **TB-1** (authz hardening) — same plan doc.
