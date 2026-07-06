# GOAL — Ship DNS Ops Workbench Internal v1

**One sentence:** make the tool's data *true*, its deploys *safe*, its services *observable*, its alerts *actually reach people*, and delete the dead abstractions — as a series of thin, test-first slices.

This document is the **developer handoff** for that goal. The architectural plan lives in `docs/plans/V1_INTERNAL_TRACER_PLAN.md`; this file turns each tracer bullet (TB) into a concrete, pick-up-and-go work item: what to read, what to change (with file:line anchors), the test to write first, and how to know you're done.

**Scope:** internal operator tool. Out of scope for v1: billing, self-serve onboarding, public signup, SaaS-grade shared-report hardening.

---

## How to use this doc

Each TB below is an independent work item sized ~0.5–3 days. Take them **in the order of the dependency graph** (next section). Every TB is its own branch + PR. Don't batch two TBs into one PR.

### Ground rules (apply to every TB — read once)

```bash
git checkout master && git pull
git checkout -b tb-<n>-<short-name>
```
- **Never commit to `master`.** One branch + PR per TB.
- **Strict no-stubs policy** (`CLAUDE.md`): no `TODO`, no fake impls, no `any` without justification. Every commit builds and passes tests.
- **Write the failing test first, then the code.** Each TB names its tests.
- **Assertion discipline** (enforced in review): an "is absent" assertion needs a live success precondition first; boundary tests come in pairs (test both sides of a `<`/`<=`); assert at the highest meaningful level.
- Git hooks run the gate on stop. Run it yourself any time:
  ```bash
  bun run lint && bun run typecheck && bun run test && bun run build
  ```
- **Don't deploy.** Several TBs change deploy/runtime behavior; the lead verifies against staging.
- When a file/line here doesn't match what you see, the code moved — grep for the named symbol (functions/exports are stable, line numbers drift). Flag big mismatches to the lead.

### Settled decisions (don't re-litigate)

- **Web runtime is Railway/Node**, not Cloudflare Workers. Direct `NodePgDatabase` is correct; D1 code is dead and removable. (Evidence: `apps/web/app.config.ts:5` preset `node-server`; `apps/web/railway.toml` runs `node .output/server/index.mjs`.)
- `findings.rulesetVersionId` → **NOT NULL** (TB-3 depends on it).
- Shadow rows with `tenantId = NULL` are **system-only**, never returned to a tenant caller.
- SPF macros the expander can't evaluate → mark the chain **incomplete**, never miscount.
- Remove the `br`/`bd` tracker references (it's not initialized); prose plans + session logs are the process.

---

## Dependency graph & ownership

```
TB-0 ─┬─> TB-1 ─┬─> TB-5a (web error envelope)
      │         └─> TB-6a ──> TB-3 ──> TB-4 ──> TB-8 ──> TB-6b ──> TB-7
      └─> TB-2 ──> TB-5b (collector metrics)
```

- **TB-0** and **TB-1** are P0 — do them first, in that order.
- **TB-2** and the TB-5 halves can run in parallel with the TB-6a→TB-4 chain (different files, different owners).
- **TB-6a must land before TB-3/TB-4** (they change the `Finding` shape; unify the type first).
- **TB-2 must land before TB-4** (SPF expansion reuses TB-2's DNS/concurrency code) and before **TB-5b** (both touch the resolver/collector).
- **TB-6b is last** — widest diff, and it's unblocked only because the runtime decision is settled.

| TB | Title | Size | Depends on |
|----|-------|------|-----------|
| TB-0 | Deploy safety net | 1.5–2d | — |
| TB-1 | AuthZ hardening | 1.5d | TB-0 |
| TB-2 | Real TTLs + bounded parallelism | 1d | TB-0 |
| TB-5a | Web error envelope | 0.5d | TB-1 |
| TB-6a | Entity-type unification | 1d | TB-1 |
| TB-3 | Multi-finding rules engine | 2d | TB-6a |
| TB-4 | SPF lookup limit + CAA rules | 2.5d | TB-2, TB-3 |
| TB-5b | Collector metrics | 0.5d | TB-2 |
| TB-8 | Alert delivery (webhook/Slack) | 2d | TB-3 |
| TB-6b | DB layer simplification | 3d | TB-6a |
| TB-7 | Build/deploy/repo hygiene | 1d | TB-6b |

---

## TB-0 — Deploy safety net (P0)

**Full step-by-step brief already written:** see **`docs/plans/TB-0-BRIEF-deploy-safety.md`**. Summary of the 5 fixes: (1) migration runner needs an applied-ledger + dynamic discovery (`scripts/run-migrations.mjs` re-runs everything every deploy and has a hardcoded 11-file list); (2) reconcile `packages/db/src/migrations/meta/_journal.json` + orphan `0000_init.sql`; (3) env validation must throw in prod not warn (`apps/web/app/api.ts:16-25`); (4) untrack `apps/web/.env`; (5) declare `dns-packet` in `apps/collector/package.json`.

---

## TB-1 — AuthZ hardening (P0)

**Goal:** close a confirmed cross-tenant data leak, make tenant scoping structural, and delete an auth path that trusts forgeable headers.

**Read first:**
- `apps/web/hono/routes/legacy-tools.ts:491-530` — the leaking endpoint.
- `packages/db/src/repos/parity.ts` — the repos it calls (`getStats`, `findByDomain` on `ShadowComparisonRepository` and `LegacyAccessLogRepository`).
- `apps/web/hono/middleware/authorization.ts:164` — the `enforceTenantIsolation` middleware that already exists but is wired nowhere.
- A working example to copy: any `apps/web/hono/routes/*.tenant-isolation.test.ts`.

**Change:**
1. **The leak** — `apps/web/hono/routes/legacy-tools.ts`, `GET /shadow-stats` (line 494). It calls `legacyLogRepo.getStats()` (503), `shadowRepo.getStats()` (506), `legacyLogRepo.findByDomain(domain)` (521), `shadowRepo.findByDomain(domain)` (524) — **none pass a tenant**. Thread the caller's `tenantId` into all four. In `packages/db/src/repos/parity.ts`, `LegacyAccessLogRepository.findByDomain` has **no** `tenantId` param — add it (required). Treat `NULL tenantId` rows as system-only: never return them to a tenant caller.
2. **Make it structural** — wire `enforceTenantIsolation` (`authorization.ts:164`) into the `/api/*` middleware stack so tenant scoping isn't per-handler memory (that's how this one slipped through).
3. **Kill the forgeable auth path** — the Cloudflare Access header trust. It's read in `apps/web/hono/middleware/authorization.ts:24` (`getCloudflareAccessEmail`, used at line 131 for admin) and in `apps/web/hono/middleware/auth.ts` (grep `Cf-Access` / `cf-access`). On Railway nothing legitimately sets these headers, so anyone who sets them gets in. **Run a one-week log-only window first** (log when the path would have triggered; confirm zero real hits), then delete all call sites. Sessions + API keys remain.
4. **Cookie** — `apps/web/hono/routes/signup.ts:116` sets the session cookie without `Secure`. Add it (keep `HttpOnly; SameSite=Lax`). Do the same for line 135 if it sets a cookie.

**Test first:**
- BDD `legacy-tools.tenant-isolation.test.ts` (mirror an existing one): seed shadow data for tenants A and B; assert tenant A calling `/shadow-stats` sees only A's data and **not** B's or system rows. Fails today.
- TDD: `LegacyAccessLogRepository.findByDomain(domain, tenantId)` filters by tenant.
- TDD: given production + `Cf-Access-*` headers + no session/API key → request rejected.

**Done:** isolation test green; `enforceTenantIsolation` active on tenant-scoped groups; CF Access removed with its rejection test; cookie has `Secure`.

---

## TB-2 — Real TTLs + bounded query parallelism

**Goal:** stop serving fabricated TTLs, and stop running DNS queries one-at-a-time. Both live in the same two files.

**Read first:**
- `apps/collector/src/dns/resolver.ts` — 7 occurrences of `ttl: 300` (grep it). These are fabricated; the real answer TTL is thrown away.
- `apps/collector/src/dns/collector.ts:128,144` — `collectFromVantage` calls; the query loop inside runs sequentially with `for...of await`.
- `apps/collector/src/probes/semaphore.ts` — an existing counting semaphore to reuse (don't write a new one).

**Change:**
- `resolver.ts`: pass `{ttl: true}` to `resolve4`/`resolve6` (Node returns `{address, ttl}` then); for MX/TXT/NS/CNAME/SOA use the record's real TTL where Node exposes it, otherwise the `dns-packet` raw path. Remove every hardcoded `ttl: 300`. Persistence downstream already stores `ttl` — no schema change.
- `collector.ts`: parallelize the sequential query loop inside `collectFromVantage` using the `Semaphore` from `probes/semaphore.ts`. Default bound **5**, overridable via a `DNS_QUERY_CONCURRENCY` env var.

**Test first:**
- TDD (`resolver.ts`, mock `node:dns/promises`): resolved records carry the answer TTL (e.g. `86400`), not `300`, for each record type.
- TDD (`collectFromVantage`, fake resolver that records in-flight count): asserts >1 concurrent query AND never exceeds the bound. Boundary pair: exactly-at-bound allowed, above-bound queued.
- BDD e2e: collect a fixture domain (A TTL 86400) and assert the snapshot detail shows 86400. **Use a local authoritative fixture, not public DNS** — public DNS makes this flaky.

**Done:** no `ttl: 300` in `resolver.ts`; concurrency tests green; TTL e2e green against a local fixture.

---

## TB-5a — Web error envelope (after TB-1)

**Goal:** stop leaking raw exception text to clients; one error shape everywhere.

**Read first:**
- `apps/web/hono/middleware/error-tracking.ts:366` — `createErrorHandler` (the good global handler; already hides `error.message` in prod) and the two unused middlewares at `:293` (`createRequestLoggingMiddleware`) and `:309` (`createErrorTrackingMiddleware`).
- The 10 route files that hand-roll `message: error.message` in their catch blocks: `alerts.ts`, `delegation.ts`, `findings.ts`, `mail.ts`, `legacy-tools.ts`, `monitoring.ts`, `selectors.ts`, `provider-templates.ts`, `ruleset-versions.ts`, `shadow-comparison.ts` (all under `apps/web/hono/routes/`).

**Change:**
- Wire `createRequestLoggingMiddleware` + `createErrorTrackingMiddleware` into the app (`apps/web/app/api.ts`, near where `createErrorHandler` is already registered at api.ts:29).
- In the 10 route files, delete the hand-rolled `catch { return c.json({ message: error.message }) }` blocks and let them throw to the global handler (or return the standard envelope). Target shape: `{ ok:false, code, error, requestId }` — never the exception message in production.

**Test first:**
- TDD: set `NODE_ENV=production`, make a route handler throw, assert the response is the standard envelope and the body does **not** contain the exception message. (A `grep` for `error.message` isn't a test — assert the actual HTTP response.)

**Done:** production-envelope test green across the affected routes; request logging present.

---

## TB-6a — Entity-type unification (before TB-3/TB-4)

**Goal:** one source of truth for `Observation`/`Finding`/`RecordSet`/`Suggestion` before their shapes change. **Direction matters:** DB owns persistence types; contracts owns API DTOs. Do **not** make `contracts` re-export Drizzle types — `packages/rules` already imports from `@dns-ops/db`, so that would risk a `contracts → db` cycle.

**Read first:**
- `packages/contracts/src/index.ts:46` (`interface Observation`, field `answers` at :56) and `:79` (`interface Finding`) — hand-written duplicates that have **drifted** from the DB schema (schema calls the field `answerSection`, etc.).
- `packages/db/src/schema/index.ts` — the canonical Drizzle definitions; `$inferSelect`/`$inferInsert` are the real types.
- `packages/rules/src/simulation/index.ts:586` — an `as unknown as Observation` cast that only exists because of the drift.

**Change:**
- Delete the hand-written persistence interfaces in `contracts/src/index.ts`; consumers that need persistence shapes import them from `@dns-ops/db` (as rules already does).
- Response DTOs in `contracts/src/responses.ts` should be **mapped from** the canonical DB type, not re-declare a third `Finding` shape.
- Deduplicate the literal unions declared in both `requests.ts` and `responses.ts` (`RemediationStatus`, etc.).
- Remove the `as unknown as Observation` cast (`simulation/index.ts:586`) by using the real field names (`vantageIdentifier`, `responseTimeMs`, `queriedAt`).

**Test first:**
- Typecheck **is** the test here: after deleting duplicates, `bun run typecheck` must surface every drifted field as a compile error — fix each explicitly, don't paper over with `any`/casts.
- TDD: a `synthesizeObservations` unit test pinning the real field names.

**Done:** no entity type defined twice; the cast is gone; typecheck green across web + collector; no new package cycle (verify the dependency direction).

---

## TB-3 — Multi-finding rules engine

**Goal:** one rule must surface **every** instance of a problem in a snapshot, not just the first.

**Prerequisite bug (fix first):** `findings.rulesetVersionId` is nullable and isn't persisted by the collector, so the *current* unique index already can't dedupe (NULL ≠ NULL in Postgres). Make it NOT NULL and persist it before touching the index.

**Read first:**
- `packages/rules/src/engine/index.ts:32` (`RuleResult`), `:43` (`evaluate: (context) => RuleResult | null` — the one-per-rule contract), `:68-76` (the engine consuming one result per rule).
- `packages/rules/src/dns/rules.ts:79` (`return findings[0] || null`), `:147` (`return results[0] || null`), `:220` (`mismatches[0]`) — three rules that compute all problems then throw away all but the first.
- `packages/db/src/schema/index.ts:352-356` — `finding_unique_idx` on `(snapshotId, ruleId, type, rulesetVersionId)`; `:334` / `:146` — the nullable `rulesetVersionId` columns.
- `packages/rules/src/simulation/index.ts` — the simulation diff (currently by `type` only).

**Change (in order):**
0. Make `findings.rulesetVersionId` NOT NULL (migration), persist it from the collector's `evaluateAndPersistFindings`, backfill existing NULLs to the active ruleset version.
1. Change `Rule.evaluate` to return `RuleResult[]`; update every rule (mail rules mostly return 0..1 — wrap trivially; the 3 DNS rules above return their full array).
2. Add `subjectKey: string` to `RuleResult` — a rule-defined discriminator for *what the finding is about*: query name (DNS), selector (DKIM), a **bounded/hashed** key for CAA (never the raw value), `''` for domain-level singletons.
3. Add `subjectKey` to the simulation's finding type and change its diff from `type`-only to `ruleId|type|subjectKey`.
4. Migration: extend `finding_unique_idx` to `(snapshotId, ruleId, type, subjectKey, rulesetVersionId)`. Backfill old rows with `subjectKey=''`, dedupe deterministically, and **preserve linked `suggestions`** (or cascade-delete per a documented policy). Acknowledgement / false-positive state on a finding must survive the re-key.

**Test first:**
- TDD (fails today): a snapshot fixture with authoritative failures on both `www` and `mail` yields **two** `RuleResult`s.
- TDD: identity — two findings same rule/type but different `subjectKey` both persist; same `subjectKey` dedupes (boundary pair).
- **Migration integration test** (this is the risky part — see the shared "Migration test" note at the bottom).
- BDD route test: the findings list for that snapshot returns both, distinct.

**Done:** two-failure fixture → two findings end-to-end; `rulesetVersionId` non-null + persisted; migration test green.

---

## TB-4 — Rule coverage: SPF lookup limit + CAA (after TB-2, TB-3)

**Goal:** detect the two most common real misconfigs we currently miss: SPF chains over the RFC 7208 10-lookup limit, and malformed CAA.

**Architecture rule:** the rules engine is **deterministic, no I/O**. SPF `include:`/`redirect=` point at *external* domains not in the snapshot. So **expand the SPF chain at collection time** (in the collector) and persist it as evidence; rules evaluate the stored evidence.

**Read first:**
- `packages/parsing/src/mail/index.ts:113` — `countSPFLookups`, currently non-recursive and called nowhere (dead). It counts one record, can't follow includes.
- `packages/db/src/schema/mail.ts:154-156` — current SPF fields (`hasSpf`, `spfRecord`, `spfMechanisms`); you'll add a `spfChain` JSONB column here.
- `packages/rules/src/engine/index.ts` (`RuleContext`) — extend with `mailEvidence`.
- `apps/collector/src/dns/resolver.ts:232` — `queryCAA` (CAA is already collected via `resolveAny`, but with a fabricated TTL and swallowed errors — clean that up as part of this).

**Change:**
- **Collector:** an SPF chain expander during mail-evidence collection. Follow `include:`/`redirect=`/`a`/`mx`/`ptr`/`exists`, bounded (RFC caps it near 11 lookups; add a hard depth guard). Must terminate on cycles (mark them), missing targets (mark `unresolvable`, don't fabricate), and macros it can't evaluate (mark `macro-unsupported`). Distinguish the 10-lookup limit from the 2-void-lookup limit; NXDOMAIN and no-answer both count as void. Persist as `spfChain` JSONB (shape in `V1_INTERNAL_TRACER_PLAN.md` TB-4). Run the expander under the TB-2 semaphore.
- Extend `RuleContext` with `mailEvidence?: MailEvidence | null`; populate it in the collector where it builds the context.
- **Rules:** an SPF lookup-limit rule that reads the stored chain (not live DNS). Chains with `unresolvable`/`macro-unsupported` nodes → an "insufficient evidence" info finding, **never** a false permerror. Delete/repurpose the dead `countSPFLookups`.
- **CAA:** a parser helper in `packages/parsing/src/dns/*` (not ad-hoc inside the rule) + a CAA rule in `packages/rules/src/dns/rules.ts`, emitting a per-record bounded/hashed `subjectKey` (uses TB-3).

**Test first:**
- TDD (collector, mock resolver): nested includes, `redirect=`, cycles, missing target, depth/lookup guard, macro → `macro-unsupported`.
- TDD (rules): lookup counting over a stored chain — RFC vectors, **exactly-10 vs 11 boundary pair**; unresolvable/macro chains → insufficient-evidence, not permerror.
- TDD (CAA rule): valid `issue`/`issuewild`, unknown critical tag, empty `issue ";"`.
- BDD: `packages/testkit` corpus fixtures for an over-limit SPF domain and a broken-CAA domain, flowing collection-evidence → rules → findings.

**Done:** both finding types emitted on corpus fixtures; boundary tests green; **zero DNS I/O inside `packages/rules`/`packages/parsing`** (grep to prove it).

---

## TB-5b — Collector metrics (after TB-2)

**Goal:** connect the fully-built-but-disconnected Prometheus module.

**Read first:**
- `apps/collector/src/middleware/observability.ts:183` (`getPrometheusMetrics`), `:282` (`recordCollection`) and its siblings `recordDnsQuery`/`recordProbe` — all built and tested, **called nowhere**, and there is **no `/metrics` route** (grep `apps/collector/src/index.ts` — confirmed absent).

**Change:**
- Register a `/metrics` route in `apps/collector/src/index.ts` returning `getPrometheusMetrics()`, behind the same service auth as the rest of collector `/api/*`.
- Call `recordCollection`/`recordDnsQuery`/`recordProbe` from the collector/resolver/probe code paths. **Bounded labels only** — never label a metric by arbitrary domain (cardinality blowup).
- Add a coverage report to CI (visibility only for now; the lead sets a threshold after a baseline).

**Test first:**
- TDD: hit `/metrics` after a collection run; assert the body is Prometheus text with `dns_collection_total` incremented.

**Done:** `/metrics` live behind auth; counters move after a collection; coverage report in CI artifacts.

---

## TB-8 — Alert delivery (webhook/Slack) (after TB-3)

**Goal:** deliver alerts to a webhook (Slack-compatible) with retries and an auditable log. A dashboard-only alert nobody has open isn't an ops tool.

**Read first:**
- `packages/db/src/schema/index.ts:663` — `alertChannels` jsonb on `monitoredDomains` (the config placeholder already exists).
- `apps/collector/src/jobs/worker.ts` — the BullMQ workers; note the anti-pattern where processors `resolve({success:false})` on error instead of throwing (that defeats BullMQ retries).
- `packages/db/src/repos/portfolio.ts:365-369` — `AlertRepository` status transitions (today allows only `pending → sent`, etc.).

**Change:**
- A new BullMQ job type on the existing queue infra. Job identity `alertId:channelType:destinationHash`. The worker **throws** on delivery failure (so BullMQ retries with backoff). A duplicate job must **not** double-send after a successful attempt — guard on the delivery log.
- New `alert_deliveries(id, alertId, channelType, destinationHash, attemptNumber, status, httpStatus, errorMessage, startedAt, completedAt)` table + migration. Store `destinationHash`, **never the raw webhook URL**; never expose the URL in UI/audit/shared reports.
- **SSRF guard:** webhook URL must be `https:` and must not resolve to localhost/private IPs (or a documented internal-only exception).
- Define retry-after-partial-failure and suppressed/acknowledged-race behavior against `AlertRepository`.
- Minimal UI: channel config on the Monitored Domains panel; delivery status on the alert row.

**Test first:**
- BDD (fake HTTP server): a refresh that raises an alert POSTs a payload with domain, rule, severity, and a Domain 360 link.
- TDD: delivery fails → retried with backoff (assert the processor throws).
- TDD: duplicate job → no double-send after success.
- TDD: non-https / private-IP URL → rejected.
- TDD: suppressed/acknowledged alert → not delivered (boundary pair: active → delivered).

**Done:** BDD green with a fake webhook; retry + idempotency + SSRF-reject tests green; delivery-lifecycle audit events emitted.

---

## TB-6b — DB layer simplification (last, widest diff)

**Goal:** delete the adapter that forces full-table-scan-then-filter-in-JS and fakes D1 portability; move filtering/sorting/paging into SQL.

**Unblocked because** the web runtime is Railway/Node (settled) — direct `NodePgDatabase` is correct and the D1 paths are dead code.

**Read first:**
- `packages/db/src/database/simple-adapter.ts` — the abstraction to remove; note it only supports a single WHERE condition, no ORDER/LIMIT/COUNT, which is *why* repos filter in JS.
- The repos that consume `IDatabaseAdapter` — there are **10+**, not 3: `portfolio.ts`, `finding.ts`, `parity.ts`, `domain.ts`, `snapshot.ts`, `recordset.ts`, `remediation.ts`, `mail-evidence.ts`, `probe-observation.ts`, `ruleset-version.ts` (grep `IDatabaseAdapter` under `packages/db/src/repos/` and `apps/collector/src`). Budget for all of them.
- `packages/db/src/client.ts:16,28,49` — the D1 imports/types/binding to remove.
- `packages/db/src/repos/domain.ts` — `findOrCreate` and its NULL-tenant concurrency window.

**Change (staged — delete the adapter LAST):**
1. Introduce `AppDb = NodePgDatabase<typeof schema>`.
2. Convert **one repo at a time** to direct Drizzle; replace `.filter()/.sort()/.slice()` in JS with SQL `where/orderBy/limit/offset`.
3. Update every constructor and call site (including the collector's, which takes `IDatabaseAdapter`).
4. Remove the D1 + adapter factories from `client.ts`.
5. Delete `simple-adapter.ts` only after an import-guard test shows zero references to `IDatabaseAdapter`/`SimpleDatabaseAdapter`/`create*Adapter`.
- Fix the NULL-tenant `findOrCreate` duplicate-row window: `NULLS NOT DISTINCT` unique index (PG15+) or a partial unique index on `tenantId IS NULL`.

**Test first:**
- **Characterization tests before the rewrite**: golden outputs for the repos on a seeded fixture DB (tenant A, tenant B, NULL-tenant rows). The rewrite must keep these green — that's how you prove it's behavior-preserving.
- TDD per converted repo: filtering happens in SQL (assert no full-table `select(table)`); tenant-scoped methods exclude foreign **and** NULL rows.
- Import-guard test: zero adapter references remain.

**Done:** no `select(table)`-then-filter in repos; adapter deleted; characterization suite still green.

---

## TB-7 — Build, deploy & repo hygiene (last)

**Goal:** the repo tells the truth about how it deploys, what tooling it uses, and how to roll back.

**Read first / verify:**
- Orphans confirmed present and referenced by nothing: root `Dockerfile.web`, root `start.js`.
- `apps/collector/dist/` — **164 files** of built output committed to git (grep-confirmed) and edited by hand to make deploys work without a build step.
- `docs/guides/railway-deploy.md` — currently says "web on Cloudflare Pages", which is wrong (web is on Railway; Cloudflare Pages fails on the `@node-rs/argon2` native binary).
- The bun/pnpm CI shim (commit `1631cf5`): CI runs `pnpm test` on node_modules that Bun installed, with no `pnpm-lock.yaml`.

**Change:**
- Add a real collector build step in `apps/collector/Dockerfile.railway`; `git rm -r --cached apps/collector/dist/` and gitignore it.
- Delete `Dockerfile.web` and `start.js`.
- Rewrite `docs/guides/railway-deploy.md` to reality (web on Railway via Dockerfile; document the argon2/Cloudflare incompatibility). Fix the README "Key docs" dangling `STATUS_REPORT.md` link. Update `packages/db/docs/TENANT_ISOLATION.md` for migration 0010.
- **Rollback runbook**: documented `railway rollback` per service + the rule that migrations stay backward-compatible for one release (so a code rollback never needs a schema rollback).
- Remove `br`/`bd` references from README/AGENTS.md/CLAUDE.md.
- Document or fix the bun/pnpm shim; pin one Bun version across `packageManager`, both Dockerfiles, and CI.

**Test first / verify:**
- CI job builds the collector image from source (no committed `dist/` consumed).
- Docs link-check script fails on references to deleted files.
- `scripts/deploy/smoke-test.ts` runs as a required post-release step.

**Done:** clean-clone deploy works with a real build; rollback runbook exercised once against staging; docs link-check green in CI.

---

## Two shared test notes (referenced above)

**Migration test (TB-3).** Seed a pre-migration DB with: duplicate findings sharing `(snapshotId, ruleId, type)` with NULL `rulesetVersionId`; suggestions linked to those duplicates; rows that must stay distinct under different `subjectKey`. After migration assert: `rulesetVersionId` backfilled non-null; old rows get `subjectKey=''`; duplicates deterministically deduped; suggestions preserved (or intentionally cascaded per documented policy); ack/false-positive state survives; the new index rejects a same-key insert and allows a differing-`subjectKey` insert. **Don't ship the migration without this test** — it runs against live production data.

**Characterization suite (TB-6b).** Before converting any repo, capture golden outputs on a seeded fixture (tenant A, B, NULL-tenant). Every converted repo must reproduce them. This is what stops the rewrite from silently changing query results.

---

## When you finish a TB

1. Full gate green: `bun run lint && bun run typecheck && bun run test && bun run build`.
2. PR description states: which behavior changed, the key acceptance test, and any deploy/runtime-affecting change (so the lead knows to verify on staging).
3. Do **not** deploy. Ping the lead.
4. Pick up the next TB in dependency order.
