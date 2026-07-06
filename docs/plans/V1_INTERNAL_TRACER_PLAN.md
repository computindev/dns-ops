# DNS Ops Workbench — Internal v1 Implementation Plan

**Status:** Final — ready to implement. Tracer bullets (TB), TDD + BDD, Oracle-reviewed.
**Scope:** internal operator tool. **Out of scope for v1:** billing, self-serve tenant onboarding, public signup, SaaS-grade shared-report hardening.
**In scope:** data correctness, deploy safety, observability, alert delivery, and the authz fixes that are cheap insurance even internally.

---

## Resolved decisions (settled before implementation)

| # | Question | Decision | Evidence |
|---|----------|----------|----------|
| D1 | Web runtime: Railway/Node or Worker/Hyperdrive? | **Railway/Node.** `NodePgDatabase` direct is safe; D1 paths are dead code, removable in TB-6b. | `apps/web/app.config.ts:5` preset `node-server`; `apps/web/railway.toml` `startCommand = node .output/server/index.mjs` on `node:20-slim`; no `wrangler.toml`. `client.ts` Workers/Hyperdrive/D1 comments are stale. |
| D2 | `findings.rulesetVersionId` → NOT NULL? | **Yes.** Precondition for TB-3 dedupe (currently unpersisted + nullable → index can't dedupe). | Collector `evaluateAndPersistFindings` omits it; `schema/index.ts` column nullable. |
| D3 | Shadow `NULL tenantId` rows — public or system-only? | **System-only.** Never returned to a tenant caller (else TB-1 fix still leaks). | `repos/parity.ts`. |
| D4 | SPF macros — support or mark incomplete? | **Mark incomplete** (`complete:false`, node `macro-unsupported`). Never miscount into a false permerror. | RFC 7208 §7. |
| D5 | `br` tracker | **Remove references** from README/AGENTS.md/CLAUDE.md for v1; prose plans + session logs are the real process. Revisit post-v1. | `br list` → `NOT_INITIALIZED`. |

**Still to confirm during TB-1 (non-blocking):** whether any real client authenticates via the CF Access header path (expected: none, Railway) — one-week log-only window before deleting all 4 call sites.

---

## Method

**Tracer bullets:** each phase is a thin end-to-end slice (collector → db → rules → API → UI) proven by a test written first and failing.
- **BDD** (behavior spans a flow): Given/When/Then as a Playwright e2e spec or Hono `app.request()` route test.
- **TDD** (behavior is local): failing unit test at the package level, then implement → green → refactor.

**Definition of Done (every TB):** its BDD scenario green in CI · `bun lint && bun typecheck && bun test && bun build` green · docs touched by the slice updated in the same PR · no new package dependency cycle.

**Assertion discipline (repo standard, applies to every test below):** absence assertions require a live success precondition; boundary tests come in pairs; assert at the highest meaningful level; time-sensitive bounds use failure messages + tight windows.

**Sequencing:**

```
TB-0 → TB-1 → TB-6a → TB-3 → TB-4 → TB-8 → TB-6b → TB-7
                └ TB-5a (web error envelope) after TB-1
                └ TB-2 anytime after TB-1; TB-5b (collector metrics) after TB-2
```

- TB-6a (entity-type unification) precedes TB-3/TB-4 so the finding-shape change lands once, on one source of truth.
- TB-2 precedes TB-4 so SPF chain expansion reuses the same raw-DNS / concurrency / error semantics.
- TB-5 is split: the web error-envelope half (TB-5a) can run right after TB-1; the collector/resolver metrics half (TB-5b) must run after TB-2 (both touch `resolver.ts`/`collector.ts`).
- TB-6b (adapter removal) stays last — widest diff. Hygiene (TB-7) interleaves when blocked.

---

## TB-0 — Deploy safety net (P0)

**Objective:** eliminate the "CI green, prod broken" failure class.
**Slice:** a new migration file on disk is applied exactly once by the Railway release command, with an applied-ledger — no hardcoded list, no silent skip or re-apply.

**Tests first:**
- TDD: `discoverMigrationFiles(dir)` returns all `.sql` sorted (same contract as `packages/db/scripts/verify-migrations.ts`).
- BDD (test Postgres): "Given `0011_test.sql` on disk and an empty ledger, When the runner executes, Then it is applied and recorded; When it executes **again**, Then it is skipped." (Dynamic discovery alone still allows partial application / idempotent skips.)
- TDD: "Given `NODE_ENV=production` and missing `INTERNAL_SECRET`, When the web app boots, Then startup throws" (today `app/api.ts:16-24` only warns).

**Implementation:**
- `scripts/run-migrations.mjs`: adopt Drizzle's official migrator/migration table, or add `_migrations_applied(name, checksum, applied_at)`. Contract: `discoverMigrationFiles` → `ensureLedger` → `getApplied` → `applyPending(file)` in a transaction where possible → `recordApplied(file, checksum)`. Drop the hardcoded 11-file array.
- Reconcile `packages/db/src/migrations/meta/_journal.json` with actual filenames (0006/0007 drift); delete orphaned `0000_init.sql` after confirming no env depends on it.
- Add `dns-packet` to `apps/collector/package.json` dependencies (currently root devDependency only — runtime outage risk).
- `git rm --cached apps/web/.env`; extend `.gitignore`; add `BETTER_AUTH_SECRET`/`WEB_DOMAIN` to `.env.example`.
- Make `assertEnvValid()` throw in production.

**Done:** re-run migration BDD green (apply-once); prod boot fails on invalid env; `dns-packet` resolvable with a production-only install.

---

## TB-1 — AuthZ hardening (P0)

**Objective:** close the confirmed cross-tenant leak, make tenant scoping structural, remove the unverified-trust auth path.
**Slice:** `GET /api/legacy-tools/shadow-stats` returns only caller-tenant data; tenant isolation enforced by middleware; no auth path trusts client-supplied headers.

**Tests first:**
- BDD: `legacy-tools.tenant-isolation.test.ts` (mirrors existing `*-isolation.test.ts`) — "Given shadow comparisons for tenants A and B, When A calls shadow-stats, Then only A's data returns." Fails today.
- TDD: `LegacyAccessLogRepository.findByDomain` gains a required `tenantId` param.
- TDD: "Given production and a request carrying `Cf-Access-*` headers with no session/API key, Then rejected."

**Implementation:**
- Thread `tenantId` through `hono/routes/legacy-tools.ts:494-622` into `ShadowComparisonRepository`/`LegacyAccessLogRepository` (`packages/db/src/repos/parity.ts`). Treat `NULL tenantId` rows as system-only (D3) — never returned to a tenant caller.
- Wire the existing-but-unused `enforceTenantIsolation` middleware (`hono/middleware/authorization.ts:164`) into the `/api/*` stack.
- **Remove CF Access header trust from all 4 call sites:** `authMiddleware`, `requireAuthMiddleware`, `internalOnlyMiddleware`, `requireAdminAccess` via `getCloudflareAccessEmail()`. One-week log-only deprecation window first (confirm no real consumer), then delete. Sessions + API keys remain.
- Add `Secure` flag to the session cookie (`routes/signup.ts:114-117`).

**Done:** isolation test green; middleware active on all tenant-scoped groups; CF Access rejection test green; authz matrix updated.

---

## TB-2 — Real TTLs + bounded query parallelism

**Objective:** stop serving fabricated TTLs; stop paying sequential wall-clock per query (same files).
**Slice:** a collected domain shows the TTL the authoritative answer carried; a many-name domain runs its queries concurrently under a bound.

**Tests first:**
- TDD: `resolver.ts` (mock `node:dns/promises`) — A/AAAA/MX/TXT/NS/CNAME carry the answer TTL, not `300`.
- TDD: `collectFromVantage` with a fake resolver recording in-flight concurrency — >1 concurrent, never exceeding the bound (boundary pair: at-bound allowed, above-bound queued).
- BDD (**local authoritative fixture**, not public DNS — flakiness): "Given a fixture domain whose A TTL is 86400, When collected, Then the snapshot detail shows 86400."

**Implementation:**
- Pass `{ttl: true}` to `resolve4/resolve6`; map remaining types via `resolveAny` or the `dns-packet` raw path where Node lacks TTL; persist unchanged (schema already stores ttl).
- Parallelize the sequential `for...of await` in `collectFromVantage` (`collector.ts:294-316`) reusing `Semaphore` (`src/probes/semaphore.ts`), default 5 via `DNS_QUERY_CONCURRENCY`.

**Done:** no hardcoded `ttl: 300` in `resolver.ts`; concurrency tests green; TTL e2e green against local fixture.

---

## TB-5a — Web error envelope (runs after TB-1)

**Objective:** stop leaking raw `error.message` to clients in production; one envelope shape.
**Slice:** any web route that throws returns `{ok:false,code,error,requestId}` with no exception text in production.

**Tests first:**
- TDD: "Given production mode, When a route handler throws, Then the response is the standard envelope and does not contain the exception message." (Test route behavior under `NODE_ENV=production` — a `grep` for `error.message` is not sufficient.) 9 of 18 route files leak today; `legacy-tools.ts:610-617` is one.

**Implementation:**
- Wire `createRequestLoggingMiddleware` + `createErrorTrackingMiddleware` (`hono/middleware/error-tracking.ts:293,309`) into the app; migrate the 9 hand-rolled catch blocks to the global handler.

**Done:** production envelope test green across the affected routes; request logs present.

---

## TB-6a — Entity-type unification (prerequisite for TB-3/TB-4)

**Objective:** one source of truth for `Observation`/`Finding`/`RecordSet`/`Suggestion` before their shapes change.
**Direction (avoid a `contracts → db` cycle):** `@dns-ops/db` = **canonical persistence types** (`$inferSelect`/`$inferInsert`); `@dns-ops/contracts` = **API DTOs, enums, requests/responses only**. Do **not** re-export Drizzle types through `contracts` — `packages/rules` already imports persistence types directly from `@dns-ops/db`.

**Tests first:**
- Typecheck as test: deriving from `$inferSelect` surfaces the diverged field names (`answers` vs `answerSection`, `timestamp` vs `queriedAt`) as compile errors to resolve explicitly.
- TDD: `synthesizeObservations` pins the real field names (`vantageIdentifier`, `responseTimeMs`, `queriedAt`).

**Implementation:**
- Delete the hand-written persistence duplicates in `contracts/src/index.ts:46-67`; consumers import persistence shapes from `@dns-ops/db`.
- Map response DTOs *from* the canonical DB type instead of re-declaring the third `Finding` shape in `responses.ts`.
- Deduplicate literal unions declared in both `requests.ts` and `responses.ts` (`RemediationStatus` etc.).
- Remove the `as unknown as Observation` cast (`simulation/index.ts:586`).

**Done:** no entity type defined twice; cast gone; typecheck green across web + collector; manifest check shows no new cycle.

---

## TB-3 — Multi-finding rules engine

**Objective:** stop under-reporting; one rule surfaces every instance of a problem in a snapshot.
**Slice:** a snapshot with authoritative failures on both `www` and `mail` produces two persisted findings, both visible in the UI.

**Prerequisite (D2):** `rulesetVersionId` is unpersisted + nullable, so the current index can't dedupe (NULL ≠ NULL). Fix first.

**Tests first:**
- TDD (fails today): a two-authoritative-failure fixture yields two `RuleResult`s (`packages/rules/src/dns/rules.ts:79,147,220` discard all but the first).
- TDD: `Rule.evaluate` returns `RuleResult[]`, each carrying a rule-defined `subjectKey`.
- TDD: identity — two findings same rule/type but different `subjectKey` both persist; same `subjectKey` dedupes (boundary pair).
- BDD: findings list for such a snapshot returns both, distinct.

**Implementation (ordered):**
0. Make `findings.rulesetVersionId` NOT NULL; persist it from the collector; backfill existing NULLs to the active ruleset version.
1. `Rule.evaluate` (`packages/rules/src/engine/index.ts:37-44`) returns `RuleResult[]`; update all rules (mail rules mostly 0..1, trivially wrapped).
2. Add `subjectKey: string` to `RuleResult` — query name for DNS, selector for DKIM, a **bounded/hashed** key for CAA (never the raw value), `''` for domain-level singletons.
3. Add `subjectKey` to `SimulationFinding`; change the simulation diff (`simulation/index.ts:~140-148`) from type-only to `ruleId|type|subjectKey`.
4. Migration: `finding_unique_idx` → `(snapshotId, ruleId, type, subjectKey, rulesetVersionId)`. Backfill `subjectKey=''`, dedupe deterministically, **preserve or intentionally cascade linked `suggestions`** per documented policy; ack/false-positive state must survive the re-key.
5. UI: verify the findings panel has no dedupe-by-type assumption.

**Done:** two-failures fixture → two findings end-to-end; `rulesetVersionId` non-null and persisted; backfill migration test green (see Verification).

---

## TB-4 — Rule coverage: SPF lookup limit + CAA

**Objective:** cover the two most consequential missing misconfiguration classes.
**Architecture constraint:** rules engine is deterministic (no I/O). SPF `include:`/`redirect=`/`a`/`mx`/`ptr`/`exists` targets are external — never in the snapshot. **Chain expansion happens at collection time**; rules evaluate stored evidence.

**Persisted evidence (`spfChain` JSONB on mail evidence, `schema/mail.ts:~93-100`; `RuleContext.mailEvidence?: MailEvidence | null`, `engine/index.ts:~19-27`, populated by `collector.ts:~491-500`):**

```ts
type SpfChainEvidence = {
  rootDomain: string; totalLookups: number; complete: boolean; errors: string[]
  nodes: Array<{ domain: string; spfRecord: string | null; mechanisms: string[]
    modifiers: string[]; lookupCountContribution: number
    status: 'resolved' | 'unresolvable' | 'cycle' | 'depth-limit' | 'lookup-limit' | 'macro-unsupported'
    parentDomain?: string; via?: 'include' | 'redirect' | 'a' | 'mx' | 'ptr' | 'exists' }>
}
```

**RFC 7208 correctness:** distinguish the 10-lookup limit from the 2-void-lookup limit; NXDOMAIN and no-answer both count as void; macros the expander can't evaluate → `complete:false` / `macro-unsupported`, never a false permerror.

**Tests first:**
- TDD (collector): SPF chain expander with a mock resolver — nested includes, `redirect=`, cycles (terminate + mark), missing target (`unresolvable`, not fabricated), hard stop at depth/lookup guard, macro → `macro-unsupported`.
- TDD (rules): lookup counting over a stored chain — RFC vectors, exactly-10 vs 11 boundary pair; chains with `unresolvable`/`macro-unsupported` nodes → "insufficient evidence" info finding, never a false permerror.
- TDD: CAA rule — valid `issue`/`issuewild`, unknown critical tags, empty `issue ";"`.
- BDD: `packages/testkit` corpus fixtures for an over-limit SPF domain and a broken-CAA domain flow through collection-evidence → rules → findings.

**Implementation:**
- Collector: SPF chain expansion during mail-evidence collection (bounded ≤ ~11 by the RFC limit + depth guard; runs under the TB-2 semaphore); persist `spfChain`.
- Rules: SPF lookup-limit rule over the stored chain. Delete/repurpose the dead non-recursive `countSPFLookups` (`packages/parsing/src/mail/index.ts:113`).
- CAA: parser/helper in `packages/parsing/src/dns/*` (not ad hoc in the rule); CAA rule in `packages/rules/src/dns/rules.ts`, per-record bounded/hashed `subjectKey` (uses TB-3).

**Done:** both finding types emitted on corpus fixtures; boundary pair tests green; zero DNS I/O inside `packages/rules`/`packages/parsing`.

---

## TB-5b — Collector metrics (runs after TB-2)

**Objective:** connect the ghost observability.
**Slice:** `curl collector:/metrics` shows collection counters increasing after a collection.

**Tests first:**
- TDD: `/metrics` returns Prometheus text with `dns_collection_total` incremented after a run (`apps/collector/src/middleware/observability.ts` is built+tested but has zero call sites and no route).

**Implementation:**
- Register `/metrics` (service auth, like the rest of collector `/api/*`); call `recordCollection`/`recordDnsQuery`/`recordProbe` from collector/resolver/probe paths. **Bounded labels only** — never label by arbitrary domain (cardinality blowup).
- Add coverage reporting to CI (visibility first; gate threshold after two weeks of baseline).

**Done:** metrics visible; coverage report in CI artifacts.

---

## TB-8 — Alert delivery (webhook/Slack)

**Objective:** deliver alerts to a webhook (Slack-compatible) with retries and an auditable delivery log — a dashboard-only alert nobody has open is not an ops tool.
**Slice:** a monitoring refresh that raises an alert posts it to the configured webhook; a failed post is retried and every attempt is logged.

**Tests first:**
- BDD (fake HTTP server): "Given a monitored domain with a webhook channel, When a refresh raises an alert, Then the webhook receives domain, rule, severity, and a Domain 360 link."
- TDD: delivery worker — failure → retried with backoff (processor must **throw**, not resolve `{success:false}` — the resolve-on-error pattern defeats BullMQ retries, `worker.ts:509`).
- TDD: idempotency — a duplicate job does **not** double-send after a successful attempt.
- TDD: SSRF — a webhook URL that is non-`https` or resolves to localhost/private IP is rejected.
- TDD: suppressed/acknowledged alerts not delivered (boundary pair: active → delivered, suppressed → skipped).

**Implementation:**
- Use `monitoredDomains.alertChannels` jsonb for webhook config; v1 = webhook type only (covers Slack incoming webhooks).
- New BullMQ job type on existing queue infra; job identity `alertId:channelType:destinationHash`.
- `alert_deliveries(id, alertId, channelType, destinationHash, attemptNumber, status, httpStatus, errorMessage, startedAt, completedAt)` + migration. Store `destinationHash`, **never the raw URL**; never expose the URL in UI/audit/shared reports.
- SSRF guard: `https:` only, block localhost/private-IP targets (or a documented internal-only exception).
- Define retry-after-partial-failure and suppressed/acknowledged-race behavior (`AlertRepository.updateStatus` allows only `pending → sent` today, `portfolio.ts:~382-397`).
- Minimal UI: channel config on Monitored Domains; delivery status on the alert row.

**Done:** BDD green with fake webhook; retry + idempotency + SSRF-reject tests green; delivery-lifecycle audit events emitted.

---

## TB-6b — DB layer simplification (last — widest diff)

**Objective:** remove the abstraction that forces full-table scans and fakes D1 portability.
**Unblocked by D1:** web runtime is Railway/Node → direct `NodePgDatabase` is correct; D1 paths are dead code.
**Slice:** portfolio search executes as a single indexed SQL query (WHERE/ORDER/LIMIT in SQL), verified by test.

**Tests first:**
- Characterization tests on current repo behavior **before** the rewrite (golden outputs on a seeded fixture DB) — behavior-preserving by construction.
- TDD: repo unit tests for currently-untested repos, starting `portfolio.ts` and `finding.ts` (tenant-isolation lives there) — filtering happens in SQL (no full-table `select(table)`).

**Implementation (staged — delete adapter LAST):**
1. Introduce `AppDb = NodePgDatabase<typeof schema>`.
2. Convert **one repo at a time** to direct Drizzle (`domain.ts:17`, `finding.ts:12`, `portfolio.ts:28+`, `parity.ts:27,143`; collector takes `IDatabaseAdapter` at `collector.ts:75`).
3. Replace `.filter()/.sort()/.slice()`-in-JS with SQL `where/orderBy/limit/offset`.
4. Update all constructors/call sites.
5. Remove D1 + adapter factories from `client.ts:16-23,120-171`.
6. Delete `SimpleDatabaseAdapter` only after an import-guard test shows zero `IDatabaseAdapter`/`SimpleDatabaseAdapter`/`create*Adapter` references.
- Fix the NULL-tenant concurrent `findOrCreate` duplicate-row window (`repos/domain.ts:138-184`): `NULLS NOT DISTINCT` unique index (PG15+, the README floor) or a partial unique index on `tenantId IS NULL`.

**Done:** no `select(table)`-then-filter in repos; adapter deleted; characterization suite still green (see Verification).

---

## TB-7 — Build, deploy & repo hygiene

**Objective:** the repo tells the truth about how it deploys, what tooling it uses, and how to roll back.
**Slice:** a clean clone deploys to Railway with a real build step, no committed `dist/`, following an accurate deploy guide with a rollback procedure.

**Tests first / verification:**
- CI job builds the collector Docker image from source (no committed `dist/` consumed).
- Docs link-check script (fails on references to deleted files — e.g. README → `STATUS_REPORT.md`).
- Post-deploy: `scripts/deploy/smoke-test.ts` as a required post-release step.

**Implementation:**
- Real build step for the collector in `Dockerfile.railway`; `git rm -r --cached apps/collector/dist/`.
- Delete orphaned root `Dockerfile.web` and `start.js`.
- Rewrite `docs/guides/railway-deploy.md` to reality (web on Railway via Dockerfile; argon2/Cloudflare incompatibility documented); fix README "Key docs"; update `packages/db/docs/TENANT_ISOLATION.md` for migration 0010.
- **Rollback runbook:** documented `railway rollback` per service + the migration-compatibility rule (migrations backward-compatible one release, so a code rollback never needs a schema rollback).
- Remove `br`/`bd` references from README/AGENTS.md/CLAUDE.md (D5).
- Document or replace the bun/pnpm CI shim (commit `1631cf5`); pin one Bun version across `packageManager`, Dockerfiles, CI.

**Done:** clean-clone deploy works; rollback runbook exercised once against staging; docs link-check green in CI.

---

## Verification strategy

Per TB: failing test first → implement → `bun lint && bun typecheck && bun test && bun build` → BDD scenario in CI → Playwright e2e for UI-touching slices → post-deploy smoke-test. Coverage report in CI from TB-5b.

**Two integration tests the gates otherwise miss:**
1. **`finding_unique_idx` backfill migration test** — seed a pre-migration DB with: duplicate findings sharing `(snapshotId, ruleId, type)` with NULL `rulesetVersionId`; suggestions linked to those duplicates; rows that must stay distinct under different `subjectKey`. After migration assert: `rulesetVersionId` backfilled non-null; old rows get `subjectKey=''`; duplicates deterministically deduped; suggestions preserved (or cascade-deleted per documented policy); ack/false-positive state survives the re-key; the new index rejects same `(snapshot,rule,type,subjectKey,rulesetVersionId)` and allows differing `subjectKey`.
2. **Adapter-removal characterization suite** against real Postgres — every converted repo with direct `AppDb` on a seeded fixture (tenant A, tenant B, NULL-tenant rows); outputs match pre-removal golden behavior; tenant-scoped methods exclude foreign **and** NULL rows; pagination/order/search in SQL; import-guard shows zero adapter references.

---

## Risks / Tradeoffs

- **TB-3 identity migration** touches `finding_unique_idx` with live data — backfill/dedupe + suggestions policy; test against a production-shaped fixture (test #1 above).
- **TB-4 SPF expansion** adds bounded collection-time DNS (≤ ~11 by RFC + guard) under the TB-2 semaphore; unresolvable/macro targets degrade to "insufficient evidence", never a fabricated verdict.
- **TB-6b** is the widest diff — mitigated by characterization tests + repo-by-repo migration + delete-adapter-last.
- **Committed `dist/` removal (TB-7)** changes the deploy path — behind a verified CI image build before deleting.
- **TB-1 CF Access removal** assumes no legitimate CF Access consumer — one-week log-only window before deletion.
- **Single-instance assumption:** in-process rate-limit/semaphore/metrics are correct at N=1 (internal v1). Blocker noted for any horizontal scaling (move to Redis-backed shared state then).

---

## Considered and rejected (for v1)

- **Replace Redis/BullMQ with pg-boss:** works today, tested; churn without internal payoff. Revisit if Redis ops burden materializes.
- **Redis-backed rate limiting / distributed semaphore:** single-instance per service; in-process is correct at N=1.
- **Immediate hard coverage gate in CI:** report first (TB-5b), set the gate from observed baseline.
- **Grouping/pagination UX for multi-findings:** defer until real post-TB-3 data shows volume.

---

## Remaining open items (non-blocking)

- **CF Access real consumer?** Confirm via the TB-1 log-only window (expected: none).
- **SPF chain evidence shape:** jsonb on mail evidence (chosen — read always with the parent) vs. dedicated table. Revisit only if an independent query need appears.
