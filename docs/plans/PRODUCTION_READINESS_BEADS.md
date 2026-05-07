# DNS Ops Workbench — Production Readiness Beads

**Created:** 2026-03-23
**Revised:** 2026-03-23 (v3 — corrected simulation route finding, verified against code)
**Status:** authoritative production-readiness plan
**Relationship to `IMPLEMENTATION_BEADS.md`:** That document defined the original build plan (beads 00–20). This document defines the **hardening plan** — everything required to move each original bead from "code exists" or "happy-path tested" to "unconditionally production-ready." Original beads are referenced by number (e.g., "B04") throughout.

## Why this document exists

A full repo audit on 2026-03-23 confirmed:

- All build gates pass: lint ✅, typecheck ✅, 825 tests ✅, build ✅.
- Code touches all 21 original beads (00–20), plus an unplanned simulation engine.
- However, the audit classified the ship decision as **"GO WITH EXPLICIT RISKS"** for both ship units.

The explicit risks that prevent an unconditional GO:

1. **E2E tests exist but are not in CI** — UI regressions can ship undetected.
2. **Several capabilities are "happy-path only"** — error paths, edge cases, and negative tests are incomplete.
3. **Job orchestration (B19)** depends on Redis with no verified fallback path and process-local scheduler state.
4. **Alert notifications (B20)** have no delivery mechanism — dashboard-only.
5. **Delegation UI (B16)** is intentionally hidden but the bead says "delegation-specific issue rendering."
6. **Probe sandbox (B17)** needs formal security review before the feature flag can be enabled.
7. **No APM/tracing** — errors are logged to stdout with no aggregation or alerting.
8. **Multi-tenant domain uniqueness** — unique index on `normalizedName` alone blocks true multi-tenancy.
9. **Several integration seams** (mail collection → findings, fleet report worker, shared report token access) lack end-to-end proof.
10. **Race condition in domain creation** — `DomainRepository.findOrCreate()` uses non-atomic find-then-insert, which can fail under concurrent collection requests.

This plan closes every one of those gaps.

## How to read this document

Each production-readiness bead (PR-XX) follows this structure:

- **Purpose** — why this work exists and what production risk it closes.
- **Background** — relevant context from the audit, the original bead, or the codebase so that a future reader can understand the reasoning without re-reading the audit.
- **Prerequisites** — other PR beads that must be done first.
- **Tasks** — numbered work items, each with subtasks where needed.
- **Considerations** — things the implementer should know: edge cases, design decisions, tradeoffs.
- **Validation** — how to prove the work is done. Every PR bead must end with a runnable verification.
- **Definition of done** — the single sentence that makes the bead closeable.

## Guiding principles (inherited + extended)

1. **Prove it or it isn't done.** Runtime or executed-test proof required. Static code ≠ working feature.
2. **Close the loop.** Every user-facing flow must be proven from entry point through persistence to rendered output.
3. **No silent degradation.** If a dependency is missing (Redis, collector, legacy tools), the system must tell the operator clearly, not silently drop functionality.
4. **Ship what you show.** If the UI renders a panel, that panel must work end-to-end. If it can't work yet, hide it behind a feature flag with a clear activation path.
5. **Test the sad path.** Happy-path-only coverage is a liability. Error states, tenant isolation boundaries, and edge cases must be proven.

## Note on the simulation engine

The audit discovered an unplanned DNS Change Simulation Engine (`POST /api/simulate`, `packages/rules/src/simulation/index.ts`). This engine inverts findings into proposed DNS changes and dry-runs them through the rules engine. It has 431 lines of runtime tests and is provider-aware (Google, Microsoft, Amazon SES, SendGrid, Mailgun). The audit found it well-tested and deterministic — including proper tenant isolation (lines 76–82 of `simulation.ts` check `domain.tenantId` against requesting tenant). No separate hardening bead is needed.

---

# PR-00 — CI E2E Gate

## Purpose

The repo has 80+ lines of Playwright E2E tests (`smoke.spec.ts`, `write-flows.spec.ts`) that exercise the two primary user journeys (Domain 360 and Portfolio). These tests are **not wired into CI**. This means every merge to master could break the UI without detection. This is the single highest-leverage production-readiness task because it gates all subsequent UI-facing work.

## Background

- `.github/workflows/ci.yml` runs lint → typecheck → test → build but has no Playwright step.
- `playwright.config.ts` already configures a `webServer` block that starts `bun run dev` with `DATABASE_URL` and `COLLECTOR_URL` env vars.
- CI already provisions PostgreSQL (port 5432) and Redis (port 6379) as services.
- The web app needs `NODE_ENV=development` plus dev-auth headers (`X-Dev-Tenant`, `X-Dev-Actor`) for write-path tests.
- E2E tests are currently run manually: `E2E_DEV_TENANT=test-tenant E2E_DEV_ACTOR=test-actor bun run --filter @dns-ops/web e2e`.

## Prerequisites

None. This is the foundation for all other PR beads.

## Tasks

### PR-00.1 — Add Playwright install step to CI

Add `npx playwright install --with-deps chromium` after `bun install` in the CI workflow. Playwright needs browser binaries that aren't cached by the Bun dependency cache.

**Subtasks:**
- a. Add the install command to `.github/workflows/ci.yml` after the `Install dependencies` step.
- b. Cache the Playwright browser binaries using `~/.cache/ms-playwright` as a cache path, keyed on the Playwright version in `package.json`.

### PR-00.2 — Add E2E step to CI workflow

Add a new step after `Build` that runs the Playwright tests with the correct environment.

**Subtasks:**
- a. Add the step with env vars: `DATABASE_URL` (from CI PostgreSQL service), `COLLECTOR_URL=http://localhost:3001`, `NODE_ENV=development`, `E2E_DEV_TENANT=ci-test-tenant`, `E2E_DEV_ACTOR=ci-test-actor`.
- b. The command: `bun run --filter @dns-ops/web e2e`.
- c. Upload Playwright HTML report as a CI artifact on failure for debugging.
- d. The E2E step should run after `Build` (the web app must be buildable, and the dev server compiles on startup).

### PR-00.3 — Verify CI E2E passes end-to-end

Push to a branch, verify the CI workflow completes with E2E passing. If any tests fail due to missing DB state (no domains/snapshots in a fresh CI database), fix them to handle empty-state gracefully — E2E tests against a fresh DB should verify the empty states are rendered correctly, not crash.

**Subtasks:**
- a. Verify `smoke.spec.ts` passes (homepage, domain input, navigation).
- b. Verify `write-flows.spec.ts` passes (notes, tags, monitoring, alerts — these hit the API directly via `page.request`, so they work against an empty DB if the API returns appropriate empty responses).
- c. If any test assumes pre-existing data, refactor it to create its own test data via API calls first.

## Considerations

- The CI PostgreSQL service is ephemeral — every run starts with an empty database. Tests must either work against empty state or seed their own data via API calls. The Drizzle migrations must run before tests to create the schema — add a `bun run --filter @dns-ops/db verify-migrations` step before E2E (this already exists in CI but verify ordering).
- The collector service is NOT started in CI for E2E. Routes that proxy to the collector (collection trigger, fleet reports) will return 503 (circuit breaker). E2E tests must handle this gracefully — assert the error state, don't expect success.
- Consider whether to start the collector as a second service in CI. For V1, it's acceptable to test collector-dependent flows via unit/integration tests and defer full-stack E2E to a staging environment.

## Validation

- CI workflow passes with all E2E tests green on a fresh branch.
- `playwright-report/` is uploaded as an artifact on failure.

## Definition of done

Every merge to master runs Playwright E2E tests against a live web app with a real PostgreSQL database.

---

# PR-01 — Domain 360 End-to-End Proof

## Purpose

The Domain 360 page (`/domain/$domain`) is the primary user-facing product surface. The audit found it handles the happy path well — it shows a yellow "No DNS snapshot" warning when data is absent, and the refresh button renders errors in a red box for 401/403/generic failures. However, the SSR loader silently catches ALL errors and returns `{ snapshot: null, observations: [] }`, making it impossible for the UI to distinguish "API is unreachable" from "no data exists yet." A production-ready Domain 360 must differentiate these states.

## Background

- `apps/web/app/routes/domain/$domain.tsx` lines 32–52: the loader wraps everything in a `try/catch` that returns nulls on any error. The SSR path (server-side) always returns nulls (no server-side data fetching). The client-side path fetches but conflates fetch errors with 404s.
- Lines 195–207: the UI already renders a yellow warning for null snapshot and a red error box for refresh failures. **These are good.** The gap is only in the loader's error handling — the component can't show "API unreachable" because the loader doesn't pass error information.
- The page has 3 tabs: overview, dns, mail. The delegation tab exists as a component but is not wired (addressed in PR-05).

## Prerequisites

PR-00 (CI E2E gate must be in place so these new tests are gated).

## Tasks

### PR-01.1 — Differentiate loader error states

Replace the silent `catch` in `$domain.tsx` loader with typed error reporting.

**Subtasks:**
- a. Define a `LoaderError` type: `{ type: 'api_unreachable' | 'fetch_error'; message: string }`.
- b. In the `catch` block, return `{ domain, snapshot: null, observations: [], error: { type: 'api_unreachable', message: err.message } }` instead of silently returning nulls.
- c. When the fetch returns a non-OK response (e.g., 503 "Database not available"), return `{ ..., error: { type: 'fetch_error', message: ... } }`.
- d. Keep the existing behavior for successful 404 (domain not found / no snapshots) — this is the "no data" state, not an error.

### PR-01.2 — Render error states distinctly from empty states

Update the component to show different messages for "error" vs "no data."

**Subtasks:**
- a. If `error.type === 'api_unreachable'`: render a red banner: "Could not reach the DNS Ops API. Check your connection or try again."
- b. If `error.type === 'fetch_error'`: render an orange banner with the error message.
- c. Keep the existing yellow "No DNS snapshot" warning for the null-snapshot-without-error case. This already works correctly.
- d. Add `data-testid="domain-error-banner"` and `data-testid="domain-no-data-banner"` for E2E targeting.

### PR-01.3 — E2E tests for Domain 360 states

Write Playwright tests that verify the states render correctly.

**Subtasks:**
- a. Test: navigate to `/domain/google.com` with empty DB — should see the yellow "No DNS snapshot" warning (not an error banner).
- b. Test: navigate to `/domain/google.com`, click Refresh without collector running — should see an error message about the collector being unavailable (503), not a blank failure. (This test already partially exists in `smoke.spec.ts`; extend it to verify the error message content.)
- c. Test: verify the refresh button is disabled during refresh (`aria-busy=true`).

## Considerations

- The SSR path intentionally returns null snapshot (no server-side data fetching). This is correct for TanStack Start on Workers — SSR fetching would block the server response. The client-side `router.invalidate()` / `useEffect` hydration pattern handles data loading after initial render. Don't change this architecture.
- The `didHydrateReload` state prevents infinite reload loops. This pattern is well-established and doesn't need separate testing — if it broke, it would cause an immediately obvious infinite loop during development.
- Don't over-engineer error taxonomy. Two error states (API unreachable vs fetch error) plus the existing no-data state is sufficient. Three states, not five.

## Validation

- E2E tests pass for empty-DB state and collector-down state.
- Manual verification: start the web app without a database connection, navigate to a domain, see a clear error message.

## Definition of done

A user can always understand why Domain 360 is empty — "no data yet" vs "something is broken" — and the distinction is tested.

---

# PR-02 — Mail Evidence Chain Proof

## Purpose

The mail evidence pipeline spans multiple services (collector mail collection → observation storage → mail evidence storage → DKIM selector storage → mail rules evaluation → mail findings persistence → UI rendering). The audit found each link is tested in isolation but the full chain has no end-to-end proof. Additionally, the mail findings panel lacks a visible "preview" label as required by B11, and the DKIM provider detection lacks golden tests for top providers.

## Background

- Mail collection: `apps/collector/src/jobs/collect-mail.ts` → `performMailCheck()` → stores observations, DKIM selectors, and mail evidence.
- Mail rules: `packages/rules/src/mail/rules.ts` — deterministic rules for SPF, DMARC, DKIM, MTA-STS, TLS-RPT, BIMI, MX, Null MX. Evaluated via `POST /api/findings/evaluate`.
- DKIM provider detection: `packages/rules/src/mail/templates.ts` — `detectProviderFromDns()` with templates for Google, Microsoft, Amazon SES, SendGrid, Mailgun.
- Suggestions: `SuggestionRepository` has `markApplied()` and `markDismissed()` — these are **operator acknowledgment actions** ("I made this DNS change manually"), not automatic DNS modifications. The simulation engine proposes changes; suggestions record whether the operator acted on them.
- B11 plan: "Preview findings are evidence-backed and persisted. Legacy tools remain authoritative until parity is explicitly achieved."

## Prerequisites

PR-00 (CI gating for any new tests).

## Tasks

### PR-02.1 — Mail collection → findings integration test

Write an integration test that proves the full chain: collect mail → store observations → store mail evidence → evaluate mail rules → persist mail findings.

**Subtasks:**
- a. Create a test in `apps/collector/src/mail/` that uses a mock DNS resolver to return known SPF/DMARC/DKIM/MTA-STS records for a test domain.
- b. Call `performMailCheck()` with the mock resolver.
- c. Store the results using the same code path as `collect-mail.ts` (observation storage, DKIM selector storage, mail evidence upsert).
- d. Call the rules engine with the stored evidence and verify it produces the expected findings (e.g., "DMARC policy is p=none" → medium severity finding).
- e. Verify findings are persisted and retrievable via `FindingRepository`.

### PR-02.2 — Null MX posture test

B09 requires "Null MX posture" handling. Verify the collector correctly handles RFC 7505 Null MX (`0 .`).

**Subtasks:**
- a. Add a test case where the MX query returns Null MX (`. 0 IN MX .`).
- b. Verify the collector stores this as a distinct observation, not as "no MX records."
- c. Verify the mail rules engine produces a specific finding: "This domain explicitly does not accept email (Null MX)" at info severity. Null MX is a valid posture — it is not a misconfiguration.
- d. Verify the UI renders "Null MX configured" rather than "No MX records found" — these are semantically different.

### PR-02.3 — DKIM provider detection golden tests

Add golden tests for the 5 providers supported by the simulation engine.

**Subtasks:**
- a. For each provider (Google Workspace, Microsoft 365, Amazon SES, SendGrid, Mailgun), create a fixture with realistic DKIM selector patterns (e.g., `google._domainkey` for Google, `selector1._domainkey` and `selector2._domainkey` for Microsoft).
- b. Test that `detectProviderFromDns()` correctly identifies the provider.
- c. Test a domain with selectors from multiple providers — verify all are reported with appropriate confidence levels.
- d. Test a domain with no recognizable selectors — verify provenance is `common-dictionary` or `not-found`.

### PR-02.4 — Confidence and provenance label UI test

Verify the selectors panel renders provenance and confidence labels distinctly.

**Subtasks:**
- a. Add a component test for `DiscoveredSelectors` that passes selectors with different provenance values (`managed-zone-config`, `provider-heuristic`, `common-dictionary`, `not-found`) and verifies each renders with a visually distinct label or badge.
- b. Verify `not-found` renders differently from `provider-heuristic` — users must understand the trust level of each selector.

### PR-02.5 — Mail findings "preview" label

B11 requires that mail findings are labeled as preview/beta until parity with legacy tools is achieved.

**Subtasks:**
- a. Add a visible "Preview" badge or banner to the mail findings section of the Domain 360 mail tab.
- b. The badge should reference the legacy tools bridge for authoritative results (e.g., "For definitive mail diagnostics, see Legacy Tools").
- c. Add an E2E test that verifies the preview label is visible on the mail tab.

### PR-02.6 — Review-only suggestion safeguard

B11: "High-risk suggestions remain review-only." In this system, "applying" a suggestion means the operator marks it as "I did this manually in my DNS provider." Review-only suggestions should require a confirmation step before the operator can mark them as applied — preventing accidental acknowledgment of high-risk changes.

**Subtasks:**
- a. Verify in the rules engine that suggestions with `riskPosture: 'high'` or `blastRadius` ≥ `subdomain-tree` are marked `reviewOnly: true`.
- b. Verify the API rejects `markApplied()` for review-only suggestions unless a confirmation flag is included in the request (e.g., `{ confirmed: true }`).
- c. Verify the UI renders review-only suggestions with a warning and confirmation dialog.

## Considerations

- The mail collection flow requires DNS queries. In tests, always use mocked resolvers — never hit real DNS in deterministic tests.
- The "preview" label is a product decision. It signals to operators that legacy tools remain authoritative. When parity is achieved (tracked by B12 shadow comparison mismatch rate dropping to an acceptable threshold), the label can be removed via a config flag.
- Provider detection is inherently heuristic. The golden tests establish a baseline; the provenance label system is the safety net that tells users how each selector was found.
- Null MX (RFC 7505) is a legitimate configuration for domains that don't send or receive email (e.g., parked domains, infrastructure domains). The system must not flag it as a problem.

## Validation

- Integration test proves mail collection → evaluation → persistence chain.
- Golden tests pass for all 5 providers.
- UI renders preview label and provenance labels distinctly.
- Review-only suggestions require confirmation before marking as applied.

## Definition of done

The mail evidence pipeline is proven end-to-end from collection through evaluation to UI rendering, with appropriate uncertainty labeling.

---

# PR-03 — Legacy Mail Bridge Hardening

## Purpose

The legacy mail bridge (B08) allows operators to deep-link from Domain 360 to trusted external DMARC/DKIM tools. The audit found two gaps: (1) no startup validation of legacy tool URLs — operators discover dead links only when users click them, and (2) the `buildDeepLink()` URL construction is not tested against malicious domain input.

## Background

- `apps/web/hono/routes/legacy-tools.ts` — builds deep links using `buildDeepLink()`. Domain is validated with regex (`DOMAIN_RE`) but not tested for URL injection.
- `apps/web/app/config/legacy-tools.ts` — defines URL templates for legacy tools.
- If legacy tool URL env vars are missing, deep links silently fail or return empty strings.

## Prerequisites

None (independent of other PR beads).

## Tasks

### PR-03.1 — Startup validation for legacy tool URLs

**Subtasks:**
- a. In the legacy-tools route (or env config), log a warning on first access if legacy tool base URLs are not configured: `[LegacyBridge] LEGACY_DMARC_URL not configured — DMARC deep links will be unavailable.`
- b. When a user requests a deep link for an unconfigured tool, return `{ error: 'Legacy DMARC tool not configured', code: 'INFRA_CONFIG_MISSING' }` with HTTP 503 — not a broken URL or silent empty string.
- c. Add a test that verifies the 503 response when env vars are missing.

### PR-03.2 — Deep-link URL safety and E2E verification

Test that malicious domain input cannot break out of the URL, and verify links work in E2E.

**Subtasks:**
- a. Test with domain: `example.com?evil=true&redirect=http://attacker.com` — verify the domain is URL-encoded and doesn't inject extra query params.
- b. Test with domain: `example.com"><script>alert(1)</script>` — verify the output is safe.
- c. Test with IDN domain: `münchen.de` — verify correct handling (punycode or display form).
- d. Add these as unit tests in `legacy-tools.runtime.test.ts`.
- e. In E2E, navigate to Domain 360 mail tab, verify each legacy tool link has a valid `href` or a clear "not configured" message.

## Considerations

- Legacy tool URLs are external. We can validate our deep links are well-formed but can't test that the legacy tool works. The bridge's contract is "correct URL construction," not "legacy tool availability."
- In CI, legacy tool URLs will be unset. Tests must verify the "not configured" behavior, not the "configured" behavior. Add a separate test case with mocked env vars for the configured path.

## Validation

- Unit tests pass for URL injection edge cases.
- API returns 503 for unconfigured tools.
- E2E verifies link presence or absence.

## Definition of done

The legacy bridge either produces correct deep links or tells the operator exactly why it can't.

---

# PR-04 — Portfolio End-to-End Proof

## Purpose

The Portfolio workspace (`/portfolio`) exposes 8 operator panels. All panels render and all APIs are tested with mock-DB runtime tests, but there is no end-to-end proof of the write → read → audit cycle. Specifically: saved filter round-trips, template override scoping, audit log completeness, shared report token access, and alert noise budget are unverified.

## Background

- `apps/web/app/routes/portfolio.tsx` — renders all 8 panels.
- `apps/web/hono/routes/portfolio.ts` — 400+ lines of CRUD routes.
- `apps/web/hono/routes/alerts.ts` — alert lifecycle (create → ack → resolve → suppress).
- Every write route emits audit events via `AuditEventRepository.create()`.
- The `auditActionEnum` defines 22 auditable actions.
- Shared reports use `shareToken` for unauthenticated access.

## Prerequisites

PR-00 (CI E2E gate).

## Tasks

### PR-04.1 — Saved filter round-trip integration test

**Subtasks:**
- a. Create a filter via `POST /api/portfolio/filters` with complex criteria: `{ domainPatterns: ["*.com"], findings: { severities: ["critical", "high"] }, tags: ["production"] }`.
- b. Load the filter via `GET /api/portfolio/filters/:id` and verify the criteria JSON round-trips exactly (no corruption from serialization/deserialization).
- c. Apply the filter to search and verify results are filtered (even if empty — the filtering logic must be exercised).
- d. Delete the filter and verify it's gone.
- e. Verify each operation produced a correctly-typed audit event.

### PR-04.2 — Template override scope test

**Subtasks:**
- a. Create an override for provider `google` with `appliesToDomains: ["example.com"]`.
- b. Request template comparison for `example.com` — verify the override is applied.
- c. Request template comparison for `other-domain.com` — verify the override is NOT applied.
- d. Create a global override (no `appliesToDomains`) and verify it applies to all domains.

### PR-04.3 — Audit log completeness test

Rather than 22 individual tests, write a parameterized test that exercises a representative subset and proves the mechanism works.

**Subtasks:**
- a. Create a helper function `triggerAndVerifyAudit(action, setupFn, triggerFn)` that:
   1. Calls `setupFn` to create any prerequisite state.
   2. Records the current time.
   3. Calls `triggerFn` to perform the auditable action.
   4. Queries the audit log for events matching `action` after the recorded time.
   5. Verifies `entityType`, `entityId`, `actorId`, `tenantId` are correct.
- b. Exercise at least one action from each category: note CRUD (1), tag CRUD (1), filter CRUD (1), monitoring lifecycle (2: create + toggle), alert lifecycle (2: ack + resolve), remediation (1), shared report (1). That's ~9 tests covering all 6 entity types.
- c. Verify audit events are tenant-scoped: query as tenant B → should not see tenant A's events.

### PR-04.4 — Shared report token-based access tests

**Subtasks:**
- a. Create a shared report with `visibility: 'shared'` and a `shareToken`.
- b. Access via `GET /api/alerts/reports/token/:token` WITHOUT auth headers — should succeed.
- c. Expire the report via `POST /api/alerts/reports/:id/expire`.
- d. Access the expired report via token — should return 404 or 410.
- e. Create a report with `expiresAt` in the past — should be inaccessible via token immediately.

### PR-04.5 — Alert dedup and noise budget tests

**Subtasks:**
- a. Create two alerts with the same `dedupKey` within the suppression window — verify only one is created.
- b. Create alerts up to `maxAlertsPerDay` for a monitored domain — verify subsequent alerts are suppressed with `status: 'suppressed'`.
- c. Verify suppressed alerts are visible in the API response with suppression metadata.

## Considerations

- These tests should run against a real PostgreSQL database (in CI or locally), not mock-DB. The mock-DB tests already exist and verify route logic; these integration tests verify the full persistence round-trip.
- The audit log is append-only by design. There is no delete endpoint for audit events. Tests should verify this immutability.
- Shared report token access is intentionally unauthenticated — this is the "shared link" use case. The response should be redacted (no internal notes, no tenant-specific metadata beyond what the creator intended to share).

## Validation

- All integration tests pass against a real PostgreSQL database.
- Audit log contains exactly the expected events after each operation.
- Shared report token access works; expired reports are rejected.
- Alert dedup and noise budget mechanisms work.

## Definition of done

Every portfolio write operation is proven to persist, audit, scope, and round-trip correctly.

---

# PR-05 — Delegation UI Activation

## Purpose

B16 has a complete backend — `DelegationCollector` in the collector, `/api/delegation` routes in the web app, and `DelegationPanel.tsx` as a component — but the UI tab is hidden. B16 says "delegation-specific issue rendering." The tab must be reachable and the rendering must be tested.

## Background

- `apps/web/app/routes/domain/$domain.tsx` line 53: `DOMAIN_TABS` only includes `overview`, `dns`, `mail`.
- `apps/web/app/components/DelegationPanel.tsx` exists and is importable.
- `apps/web/hono/routes/delegation.ts` — API routes registered in `api.ts`.
- `apps/collector/src/delegation/collector.ts` — `DelegationCollector` with parent-zone delegation, glue, lame delegation, DNSSEC.
- Delegation data is stored in snapshot `metadata` JSON field: `hasDelegationData`, `parentZone`, `nsServers`, `hasDivergence`, `divergenceDetails`, `lameDelegations`, `missingGlue`, `hasDnssec`.
- E2E smoke test currently asserts delegation tab has count 0: `await expect(page.getByRole('tab', { name: /delegation/i })).toHaveCount(0)`.

## Prerequisites

PR-01 (Domain 360 error states must be solid before adding a new tab).

## Tasks

### PR-05.1 — Add delegation tab to Domain 360

**Subtasks:**
- a. Add `{ id: 'delegation', label: 'Delegation' }` to `DOMAIN_TABS` in `$domain.tsx`.
- b. Import and render `DelegationPanel` when the `delegation` tab is active.
- c. Pass the domain name and snapshot ID so the panel can fetch delegation data from `/api/delegation/:domain`.

### PR-05.2 — Delegation panel rendering tests

**Subtasks:**
- a. Test: domain with healthy delegation — all NS servers agree, glue present, no DNSSEC. Panel renders "Delegation healthy" or equivalent.
- b. Test: domain with divergent NS answers — divergence details rendered (which servers disagree, what they returned).
- c. Test: domain with lame delegation — lame server highlighted with reason (timeout, refused, not-authoritative).
- d. Test: domain with missing glue — missing glue records listed.
- e. Test: domain with DNSSEC — DNSKEY and DS record presence shown, AD flag status rendered. **Important:** the UI must show raw evidence (AD flag, DNSKEY presence, DS presence), not make unsupported "DNSSEC is valid/invalid" claims. B16 plan: "DNSSEC conclusions may not exceed what the validating source proves."
- f. Test: no delegation data collected yet — panel shows clear "No delegation data" message.

### PR-05.3 — Update E2E smoke test

**Subtasks:**
- a. Change the assertion from "delegation tab has count 0" to "delegation tab is visible."
- b. Add a test that clicks the delegation tab and verifies the panel renders (even if empty).

## Considerations

- Delegation data is expensive to collect (queries parent zone + each authoritative server). The tab should indicate when data is stale or uncollected, not show misleading empty states.
- Activating the tab is a simple code change (add to DOMAIN_TABS array). The component and API already exist. The main work is in the rendering tests.

## Validation

- Delegation tab is visible and clickable.
- Component tests pass for all 6 delegation states.
- E2E smoke test updated and passing.

## Definition of done

Users can inspect delegation evidence from the Domain 360 page.

---

# PR-06 — Probe Sandbox Security Review

## Purpose

The non-DNS probe sandbox (B17) enables active network probing (SMTP STARTTLS, MTA-STS policy fetch). It's feature-flagged with SSRF guards and an allowlist, but B17 requires a "security review" before the flag can be enabled. This bead performs that review and closes every gap.

## Background

- `apps/collector/src/probes/` — `ssrf-guard.ts`, `allowlist.ts`, `smtp-starttls.ts`, `mta-sts.ts`.
- SSRF guard blocks: 10.x, 172.16-31.x, 192.168.x, 127.x, ::1, fe80::, fc00::.
- Allowlist: entries derived from DNS MX records only — no arbitrary targets.
- Feature flag: `ENABLE_ACTIVE_PROBES` in `apps/collector/src/config/env.ts`.
- Probes run on the collector (Node.js), not the web app (Workers). This is correct — Workers can't make arbitrary TCP connections.
- Existing tests: `ssrf-guard.test.ts` (15 tests), `allowlist.test.ts` (12 tests), `probe-routes.test.ts` (10 tests).

## Prerequisites

None (independent security work).

## Tasks

### PR-06.1 — SSRF guard comprehensive test expansion

**Subtasks:**
- a. Test all RFC 1918 ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` — verify first, last, and boundary IPs are blocked.
- b. Test loopback: `127.0.0.1`, `127.0.0.2`, `127.255.255.255` — all blocked.
- c. Test link-local: `169.254.0.0/16`, `fe80::/10` — blocked.
- d. Test IPv6 equivalents: `::1` (loopback), `fc00::/7` (unique local), `::ffff:127.0.0.1` (IPv4-mapped IPv6) — all blocked.
- e. **DNS rebinding:** hostname that resolves to a public IP on first query but a private IP on second query. The SSRF guard must check the resolved IP at connection time, not just at allowlist generation time. If vulnerable to TOCTOU: add a `lookup` callback to Node.js `net.connect` that checks the resolved IP through the guard before connecting.
- f. **Redirect-to-private:** MTA-STS policy URL returning a 301 redirect to `http://127.0.0.1/...`. Verify the redirect target is checked or redirects are not followed for probe requests.
- g. Document all findings in the security review (PR-06.4).

### PR-06.2 — Rate limiting and concurrency enforcement

**Subtasks:**
- a. Verify `probes.concurrency` and `probes.timeoutMs` from env config are actually enforced in the probe execution code. If they're just config values with no runtime enforcement, implement enforcement using a semaphore.
- b. Write a test that starts `concurrency + 1` simultaneous probes and verifies the excess one is queued or rejected.
- c. Write a test with a slow-responding server that verifies timeout after `timeoutMs`.

### PR-06.3 — Allowlist integration test

**Subtasks:**
- a. Test: probe request for a domain NOT in the allowlist → rejected with 403.
- b. Test: probe request for a domain IN the allowlist (MX-derived) → accepted.
- c. Test: allowlist generation from a domain with no MX records → empty allowlist, all probes rejected.

### PR-06.4 — Security review documentation

**Subtasks:**
- a. Create `docs/security/probe-sandbox-review.md` with:
   - Threat model (abuse scenarios if probes are misused).
   - SSRF attack surface analysis (DNS rebinding, redirect, TOCTOU, IPv4-mapped IPv6).
   - Allowlist derivation strategy (MX-only — conservative by design).
   - Egress identity (collector's IP, not web app's).
   - Rate limits and concurrency bounds.
   - Conclusion: safe to enable, or specific remaining gaps.
- b. Link the review document from the feature flag in `env.ts` so future developers know why the flag exists.

## Considerations

- DNS rebinding is the most subtle vector. The safest mitigation in Node.js is to pass a custom `lookup` function to `net.connect` / `tls.connect` that resolves the hostname and checks the result through the SSRF guard before connecting. This eliminates the TOCTOU window.
- The probe sandbox is optional (feature-flagged). If any gap can't be mitigated quickly, the recommendation should be "keep the flag off" with a specific remediation plan.
- This is security-sensitive. The review document should be written as if an external auditor will read it.

## Validation

- All SSRF guard tests pass including edge cases.
- Concurrency and timeout are proven enforced.
- Allowlist rejects non-allowlisted targets.
- Security review document exists and is complete.

## Definition of done

A security-conscious operator can read the review document and confidently enable the probe feature flag.

---

# PR-07 — Job Orchestration & DNS Collection Hardening

## Purpose

Job orchestration (B19) uses BullMQ with Redis. The audit found: (1) scheduler state is process-local, (2) the synchronous fallback is undocumented, (3) job retry/failure tracking lacks integration tests, and (4) the fleet report worker job and authoritative DNS collection path have no integration proof.

## Background

- `apps/collector/src/jobs/queue.ts` — BullMQ queue factory. Returns `null` when `REDIS_URL` is unset.
- `apps/collector/src/jobs/scheduler.ts` — `activeSchedules = new Map()` is process-local. BullMQ repeatable jobs survive in Redis but the observability Map resets on restart. `initializeSchedules()` repopulates it.
- `apps/collector/src/jobs/worker.ts` — three workers (collection, monitoring, reports) with concurrency limits.
- **Architectural decision (current and intentional):** `POST /api/collect/domain` runs collection **synchronously**. The queue is used for batch operations only (monitoring refreshes, fleet reports). This is correct for V1 because single-domain collection takes 2–5 seconds and the operator wants immediate feedback. Documenting this decision is part of this bead.
- `apps/collector/src/dns/collector.ts` — `discoverAuthoritativeServers()` and authoritative vantage collection exist but have no mock-authoritative integration test (only live-DNS tests behind `RUN_LIVE_DNS_TESTS=1`).
- `apps/collector/src/jobs/worker.ts` — `processFleetReport()` reads domains/snapshots/findings from DB but has no integration test proving correctness with real data.

## Prerequisites

PR-00 (CI infrastructure — Redis service is already configured).

## Tasks

### PR-07.1 — Scheduler state recovery test

**Subtasks:**
- a. Write an integration test (requires Redis) that:
   1. Calls `initializeSchedules()` — three schedules are created.
   2. Clears the `activeSchedules` Map manually (simulating a restart).
   3. Calls `initializeSchedules()` again.
   4. Verifies the Map is repopulated with correct data.
   5. Verifies BullMQ `getRepeatableJobs()` shows expected jobs (not duplicated).
- b. Verify `getActiveSchedules()` returns correct data after repopulation.

### PR-07.2 — Document synchronous collection decision

**Subtasks:**
- a. Add a comment in `apps/collector/src/jobs/collect-domain.ts` explaining: "Single-domain collection is intentionally synchronous. Queue-based execution is for batch operations only (monitoring refreshes, fleet reports). Synchronous execution provides immediate feedback (snapshot ID in response) and avoids Redis dependency for the most common use case."
- b. Add this to the architecture section of `README.md` or `docs/architecture/runtime-topology.md`.
- c. If any code path calls `scheduleCollectionJob()` for single-domain collection, verify it's only used as an optimization, not as the primary path.

### PR-07.3 — Job retry and failure tracking test

**Subtasks:**
- a. Write a test (requires Redis) that queues a collection job with a domain that will fail (mock `DNSCollector` to throw).
- b. Verify the job is retried (up to 3 times per `defaultJobOptions`).
- c. Verify failed jobs are visible via `getQueueHealth()` with correct counts.
- d. Verify `trackJobError` is called with correct error context on each failure.

### PR-07.4 — Graceful shutdown test

**Subtasks:**
- a. Start workers via `startWorkers()`.
- b. Call `shutdown('SIGTERM')` directly (or use process signal in test).
- c. Verify `stopWorkers()` and `closeQueues()` complete.
- d. Verify no orphaned Redis connections remain.

### PR-07.5 — Fleet report worker integration test

Prove the fleet report job (`processFleetReport` in `worker.ts`) produces correct data.

**Subtasks:**
- a. Set up test DB with 3 domains, each with a snapshot and known findings (different severities).
- b. Call `processFleetReport` with inventory listing those 3 domains.
- c. Verify the report includes all 3 domains with correct finding counts and severity distributions.
- d. Test with an inventory containing a domain that doesn't exist — verify it's skipped gracefully (not a crash).
- e. Test with empty inventory — verify empty report, not an error.

### PR-07.6 — Authoritative collection mock test

Prove the authoritative collection strategy works without real nameservers.

**Subtasks:**
- a. In `apps/collector/src/dns/`, create a test that mocks `discoverAuthoritativeServers()` to return 2 fake NS IPs.
- b. Mock `collectFromVantage()` for each authoritative vantage to return known DNS responses.
- c. Verify the collector creates observations with `vantageType: 'authoritative'` and correct `vantageIdentifier`.
- d. Verify that if one authoritative server fails (timeout), the collection still succeeds as `partial` (not `failed`).

### PR-07.7 — Queue health endpoint integration test

**Subtasks:**
- a. With Redis available: call `GET /readyz` — verify `checks.queues.status: 'ok'`.
- b. With Redis unavailable: call `GET /readyz` — verify 503 with `checks.queues.status: 'error'`.
- c. Verify `workersRunning()` returns correct status.

## Considerations

- BullMQ integration tests require Redis. These should skip if `REDIS_URL` is unset (like the live-DNS pattern). CI has Redis; local dev may not.
- The scheduler's process-local state is a known V1 limitation. The goal is to verify `initializeSchedules()` recovery, not to fix the architecture. Redis-backed BullMQ repeatable jobs DO survive restarts; only the observability Map resets.
- The authoritative collection test (PR-07.6) is important because the authoritative path is fundamentally different from the recursive path (it queries specific NS IPs, not a general recursive resolver). A failure in this path would be invisible without this test.

## Validation

- All integration tests pass with Redis available.
- Scheduler recovers state after simulated restart.
- Graceful shutdown completes cleanly.
- Fleet report produces correct data.
- Authoritative collection works with mocked nameservers.

## Definition of done

The job orchestration system and DNS collection pipeline are proven to start, run, recover, handle failures, and shut down cleanly.

---

# PR-08 — Alert Notification Delivery

## Purpose

Alert lifecycle tracking exists (create → ack → resolve → suppress) but alerts are dashboard-only — no notification is delivered. For production readiness, operators must be notified of new alerts without polling the dashboard. Webhook delivery is the simplest V1 notification channel.

## Background

- `apps/web/hono/routes/alerts.ts` — alert CRUD. Creates alerts in DB but never sends them anywhere.
- `packages/db/src/schema/index.ts` — `monitoredDomains.alertChannels` is `jsonb` with `{ email?: string[], webhook?: string, slack?: string }`.
- The web app runs on Cloudflare Workers. Workers can make `fetch()` calls but cannot inspect resolved IPs (limiting SSRF protection). The collector runs on Node.js with full network control.
- **Architecture decision:** Webhook delivery should happen from the **collector**, not the web app. The collector already handles outbound network operations (DNS queries, probes) and has proper SSRF guards. The web app should queue a notification request to the collector via the existing proxy pattern.

## Prerequisites

PR-04 (alert dedup and noise budget must be proven first).

## Tasks

### PR-08.1 — Webhook notification service on the collector

**Subtasks:**
- a. Create `apps/collector/src/notifications/webhook.ts` with a `sendAlertWebhook(alert, webhookUrl)` function.
- b. Payload: alert ID, title, description, severity, domain name, tenant ID, timestamp, link to Domain 360 page.
- c. Use `fetch()` with a 5-second timeout. On failure, log the error but don't retry (best-effort for V1).
- d. Add SSRF protection: validate the webhook URL against the existing SSRF guard from `probes/ssrf-guard.ts`. This prevents webhooks to private IPs.
- e. Add a `POST /api/notify/webhook` route on the collector that accepts `{ alertId, webhookUrl, payload }` and sends the webhook.

### PR-08.2 — Wire notification into alert creation

When a new alert is created (and not suppressed), trigger webhook delivery.

**Subtasks:**
- a. In the alert creation flow in `alerts.ts`, after successfully creating a non-suppressed alert, fire-and-forget a `proxyToCollector(c, { path: '/api/notify/webhook', method: 'POST', body: ... })` call.
- b. Look up the monitored domain's `alertChannels.webhook` URL. If not set, skip notification.
- c. Don't block the HTTP response on notification delivery — the alert is already persisted in DB. Notification is async best-effort.
- d. Log delivery attempts with alert ID and webhook host (not full URL, which may contain tokens).

### PR-08.3 — Notification integration tests

**Subtasks:**
- a. Test: alert created for monitored domain with webhook URL → collector's webhook endpoint is called → webhook `fetch()` fires with correct payload.
- b. Test: alert created without webhook URL → no notification attempt.
- c. Test: alert suppressed → no notification.
- d. Test: webhook URL is a private IP → SSRF guard rejects, error is logged, alert stays `pending`.
- e. Test: webhook request times out → error logged, no crash.

## Considerations

- Webhook delivery from the collector solves the Workers SSRF limitation. The collector has full control over DNS resolution and TCP connections.
- For operator-configured webhook URLs, the threat model is different from the probe sandbox. Operators have legitimate reasons to specify arbitrary URLs. Still, basic SSRF protection (reject private IPs) prevents misconfiguration from probing internal infrastructure.
- Best-effort delivery is acceptable for V1. Guaranteed delivery (retry queues, dead-letter, delivery receipts) is post-V1.
- The notification proxy call from web → collector reuses the existing `proxyToCollector()` with circuit breaker. If the collector is down, the notification silently fails — the alert is still persisted in the DB and visible on the dashboard.
- Email and Slack channels are documented as future work in `monitoredDomains.alertChannels`. Don't implement them here, but don't design the webhook in a way that prevents them later.

## Validation

- Integration tests pass for all delivery scenarios.
- Webhook is actually called (use a mock HTTP server in tests).
- SSRF guard prevents private-IP webhooks.

## Definition of done

When an alert is created, the configured webhook is called with the alert payload, and delivery success/failure is tracked.

---

# PR-09 — Tenant Isolation Proof

## Purpose

Multi-tenant data isolation is enforced at the middleware and repository level, but there is no integration test proving tenant A cannot see, modify, or detect the existence of tenant B's data. The simulation route already has tenant checks (lines 76–82 of `simulation.ts`), but there are no integration tests proving isolation across the full API surface. This bead proves isolation works everywhere.

## Background

- Auth middleware populates `tenantId` from CF-Access JWT, API key, or dev headers.
- Authorization middleware (`requireAuth`, `requireWritePermission`) checks for presence of `tenantId` and `actorId`.
- The domain read routes in `api.ts` (lines 83–105) properly check: `if (domain.tenantId && domain.tenantId !== tenantId) return 404`. This is correct.
- The simulation route (`POST /api/simulate`) also checks tenant isolation at lines 76–82 of `simulation.ts` — loads domain from snapshot and verifies `domain.tenantId` matches requesting tenant.
- The unique domain index is on `normalizedName` alone (not per-tenant). Two tenants cannot independently track the same domain. This is a known V1 limitation documented in the schema.
- **Gap:** No integration tests prove tenant isolation end-to-end across all these routes.

## Prerequisites

PR-00 (CI gate).

## Tasks

### PR-09.1 — Verify simulation route tenant isolation (test-only)

The simulation route already implements tenant checks (lines 76–82). This task adds explicit tests to prove it.

**Subtasks:**
- a. Write a test: request simulation with tenant A's snapshot ID using tenant B's credentials → 404.
- b. Write a test: request simulation with an unowned domain's snapshot without auth → succeeds (public read).
- c. Consider extracting `resolveAccessibleSnapshot()` to a shared utility so `api.ts` and `simulation.ts` don't duplicate the tenant check pattern. This is a refactoring improvement, not a bug fix.

### PR-09.2 — Cross-tenant read isolation test

**Subtasks:**
- a. Create a domain + snapshot + findings as tenant A.
- b. Attempt to read the domain's latest snapshot as tenant B → should return 404.
- c. Attempt to list findings for tenant A's snapshot as tenant B → should return 404 or empty.
- d. Verify public read paths (no tenant header) can read domains without `tenantId` set, but NOT domains with tenant A's ID.

### PR-09.3 — Cross-tenant write isolation test

**Subtasks:**
- a. Create a note on tenant A's domain as tenant A.
- b. Attempt to update that note as tenant B → should return 404 (not 403 — don't leak existence).
- c. Attempt to delete that note as tenant B → should return 404.
- d. Repeat for: tags, saved filters, template overrides, monitored domains.

### PR-09.4 — Cross-tenant alert and audit isolation test

**Subtasks:**
- a. Create a monitored domain and alert as tenant A.
- b. Attempt to acknowledge the alert as tenant B → should fail.
- c. List alerts as tenant B → should not include tenant A's alerts.
- d. Query audit log as tenant B → should not include tenant A's events.

### PR-09.5 — Document the domain uniqueness limitation

**Subtasks:**
- a. Add a section to `packages/db/docs/TENANT_ISOLATION.md` explaining the current unique index limitation and its implications: two tenants cannot independently track the same domain.
- b. Include the migration path: change unique index from `(normalizedName)` to `(normalizedName, tenantId)`. This requires backfilling `tenantId` on all existing domains.
- c. Link from the schema definition.

## Considerations

- **Returning 404 (not 403) for cross-tenant access is a deliberate security choice.** 403 reveals that the resource exists; 404 does not. All repository methods and route handlers should follow this pattern.
- The simulation route fix (PR-09.1) is the only code change in this bead. Everything else is testing and documentation. The fix is small but the security implication is significant — without it, any user who guesses or intercepts a snapshot UUID can read another tenant's DNS data.
- These tests should use real HTTP requests with different tenant headers (via the dev bypass auth), not mock-DB tests.
- The `DomainRepository.findByName()` deliberately does NOT filter by tenant — this is used for public read paths where any user can look up any unowned domain. This is correct behavior.

## Validation

- Simulation route rejects cross-tenant snapshot access.
- All cross-tenant tests pass: no data leakage in any direction.
- Documentation is complete and linked.

## Definition of done

No request with tenant B's credentials can read, modify, or detect the existence of tenant A's data. Every tenant-scoped route is covered by integration tests.

---

# PR-10 — Observability and Operational Readiness

## Purpose

Structured logging and metrics exist but there is no runtime error aggregation (APM) and no distributed tracing. Errors go to stdout and are lost. Request IDs generated by the web app are not forwarded to the collector, breaking cross-service debugging.

## Background

- `packages/logging/src/` — Logger, context, metrics, middleware. Well-built.
- `apps/web/hono/lib/request-context.ts` — generates `X-Request-Id`.
- `apps/web/hono/lib/collector-proxy.ts` — proxies to collector. Does NOT forward request ID.
- `apps/web/hono/middleware/error-tracking.ts` — 644 lines of error tracking with structured error codes. Logs to stdout only.
- Both apps also use raw `console.log/warn/error` in many places alongside the structured logger.

## Prerequisites

None (independent operational work).

## Tasks

### PR-10.1 — Request ID propagation across services

**Subtasks:**
- a. In `collector-proxy.ts`, add request ID to forwarded headers: `headers['X-Request-Id'] = c.req.header('X-Request-Id') || generateRequestId()`.
- b. In the collector, read `X-Request-Id` from incoming requests and inject it into the logging context for that request.
- c. Write a test that verifies request IDs are forwarded through the proxy.

### PR-10.2 — Error reporting integration point

**Subtasks:**
- a. Add an `ErrorReporter` interface in `packages/logging/src/` with `report(error: Error, context: Record<string, unknown>): void`.
- b. Create a `ConsoleErrorReporter` (current behavior — log to stdout).
- c. Create a `SentryErrorReporter` stub that imports `@sentry/node` dynamically. If `SENTRY_DSN` env var is set, errors go to Sentry. Otherwise, falls back to console. Sentry is NOT a hard dependency — the stub handles the absent-package case.
- d. Wire the reporter into both apps' `onError` handlers.

### PR-10.3 — Health check improvements

**Subtasks:**
- a. Add `GET /api/health/detailed` to the web app (behind `requireAdminAccess`) returning: app version, uptime, DB connectivity, collector circuit breaker state.
- b. Verify the collector's existing `/readyz` endpoint correctly reports DB, queue, and worker status (this likely already works — just verify and document).

### PR-10.4 — Structured logging for error paths

Replace `console.error` and `console.warn` calls with the structured logger. Focus on error and warning paths where request context (request ID, tenant ID) is critical for debugging. Leave `console.log` info/debug calls alone — they're lower priority.

**Subtasks:**
- a. Search for `console.error` and `console.warn` in `apps/web/hono/` and `apps/collector/src/`. Replace each with `logger.error()` or `logger.warn()` from `@dns-ops/logging`.
- b. Ensure every replaced call includes available context: `{ requestId, tenantId, path, method }`.
- c. Verify no sensitive data (passwords, API keys, full webhook URLs) appears in log output.

## Considerations

- Sentry (or equivalent) is not a hard requirement for production readiness, but the integration point must exist so it can be enabled without code changes. The `ErrorReporter` interface is the contract — operators choose their backend.
- Request ID propagation is essential for debugging cross-service issues. Without it, correlating a user's request from web to collector requires timestamp matching, which is unreliable under load.
- Don't convert ALL `console.log` to `logger.info` — that's busywork. Focus on `console.error` and `console.warn` where context matters for debugging production issues.

## Validation

- Request IDs appear in collector logs when requests are proxied.
- `console.error/warn` calls replaced with structured logger in both apps.
- Health endpoint returns correct data behind admin auth.

## Definition of done

Every error is structured, traceable across services, and reportable to an external aggregation service.

---

# PR-11 — Input Validation, Rate Limiting, and Collection Safety

## Purpose

The audit found: (1) not all mutating routes use the validation middleware, (2) no rate limiting exists anywhere, and (3) `DomainRepository.findOrCreate()` has a TOCTOU race condition that can fail under concurrent collection requests. This bead closes all three gaps.

## Background

- `apps/web/hono/middleware/validation.ts` — 431 lines of validation infrastructure with field validators.
- Routes using `validateBody()`: alerts, monitoring, portfolio, mail, simulation.
- Routes with manual/no validation: `POST /api/collect/domain` (manual check), `POST /api/collect/mail` (local validator).
- **No rate limiting middleware exists anywhere.**
- **Workers limitation:** The web app runs on Cloudflare Workers, which are stateless — each request may hit a different isolate. In-memory rate limiting provides no protection. The collector runs on Node.js (single process) where in-memory rate limiting works.
- `DomainRepository.findOrCreate()` at `packages/db/src/repos/domain.ts:121` does a find-then-insert that is not atomic. Two concurrent collection requests for the same domain will both find no existing domain, both try to insert, and one will fail with a unique constraint violation.

## Prerequisites

PR-09 (tenant isolation must be proven — rate limits are per-tenant).

## Tasks

### PR-11.1 — Validation coverage audit and fixes

**Subtasks:**
- a. List every `POST`, `PUT`, `PATCH`, `DELETE` route in both apps.
- b. For each route, verify it uses `validateBody()` or has explicit validation with proper error responses.
- c. Migrate routes with manual validation to `validateBody()` for consistency. Specifically:
   - `POST /api/collect/domain`: validate `domain` (required string, valid domain format, max length 253), `zoneManagement` (enum: managed/unmanaged/unknown).
   - `POST /api/collect/mail`: validate `domain` (required, valid format), `preferredProvider` (optional enum), `explicitSelectors` (optional array, max 20 items).
- d. Verify `POST /api/portfolio/notes` validates `content` max length (unbounded text is a storage risk — add a 10,000 character limit).
- e. Verify `POST /api/portfolio/tags` validates tag format at the API layer (max length 50 per schema — ensure the API enforces this, not just the DB constraint).

### PR-11.2 — Rate limiting

**Subtasks:**
- a. **Collector (Node.js):** Create `apps/collector/src/middleware/rate-limit.ts` with an in-memory token-bucket rate limiter. Apply to:
   - `POST /api/collect/domain`: 10 requests/minute per tenant.
   - `POST /api/collect/mail`: 10 requests/minute per tenant.
   - `POST /api/probe/*`: 5 requests/minute per tenant.
   Return `429 Too Many Requests` with `Retry-After` header when exceeded.
- b. **Web app (Workers):** Do NOT implement in-memory rate limiting (useless on stateless isolates). Instead:
   1. Document in `docs/architecture/runtime-topology.md` that Cloudflare Rate Limiting should be configured at the infrastructure level for the web app.
   2. Provide a sample `wrangler.jsonc` rate-limiting configuration or Cloudflare dashboard instructions.
   3. Add the collection dedup check (PR-11.3) which provides request-level protection via the database regardless of runtime.
- c. Write tests for the collector rate limiter.

### PR-11.3 — Collection trigger safety

Prevent both abuse (rapid re-collection) and race conditions (concurrent creation).

**Subtasks:**
- a. **Collection dedup:** Before triggering collection, check the latest snapshot's `createdAt` for the domain. If a snapshot was created within the last 60 seconds, return `{ queued: false, reason: 'recent_collection_exists', lastCollectionAt: ... }` instead of triggering a new collection. This check uses the database and works regardless of runtime (Workers or Node.js).
- b. **Fix `findOrCreate` race condition:** In `DomainRepository.findOrCreate()`, replace the non-atomic find-then-insert with one of:
   - `INSERT ... ON CONFLICT (normalized_name) DO NOTHING` followed by a re-query (preferred — idempotent).
   - Or wrap in a try/catch that catches unique constraint violations and retries the find.
- c. Write a test that calls `findOrCreate` concurrently for the same domain and verifies both calls succeed (one creates, one finds) without throwing.
- d. Write a test that verifies the 60-second dedup check returns the expected response.

## Considerations

- In-memory rate limiting on the collector resets on process restart. This is acceptable for V1 — the primary goal is preventing accidental abuse (rapid refresh clicks, runaway scripts), not defending against determined attackers. For production hardening, migrate to Redis-backed rate limiting.
- The `findOrCreate` race condition is a real bug that can cause collection failures in production under concurrent load. The fix is small (one method change) but the impact is significant. `INSERT ... ON CONFLICT DO NOTHING` is the cleanest PostgreSQL solution.
- The collection dedup check protects against accidental double-collection from rapid UI clicks. It does NOT prevent intentional abuse (an attacker can wait 60 seconds). Rate limiting provides the broader protection.
- Rate limits should be configurable via env vars so operators can tune them.
- Body size limits are also important: add a 1MB body size limit middleware to both apps as defense-in-depth. The Hono framework may have built-in support for this.

## Validation

- All mutating routes use `validateBody()` or equivalent.
- Collector rate limiter returns 429 when limits are exceeded.
- Collection dedup prevents re-collection within 60 seconds.
- `findOrCreate` handles concurrent calls without throwing.

## Definition of done

Every mutating endpoint validates its input, collection is protected against abuse and race conditions, and rate limiting is enforced on the collector.

---

# PR-12 — Cleanup and Hygiene

## Purpose

Small issues that don't block shipping individually but collectively represent technical debt that erodes trust: stale build artifacts, lint warnings, unused schema tables, and STATUS_REPORT.md drift.

## Background

- `apps/web/app.config.timestamp_1774013203376.js` — a build artifact that was committed, then gitignored. May still be tracked by git.
- Biome lint warning: array index used as React key in a findings `.map()` call (line 413).
- `vantagePoints` table — de-scoped (comment in schema says so), no repository, only FK from `observations.vantageId`. The `vantageId` column is likely always NULL because the collector uses `vantageType` + `vantageIdentifier` strings instead.
- `STATUS_REPORT.md` says "815 passed" but actual count is 825.

## Prerequisites

None for cleanup items. PR-12.4 must be last (after all other PR beads).

## Tasks

### PR-12.1 — Remove stale build artifact from git

**Subtasks:**
- a. Check if `app.config.timestamp_1774013203376.js` is still tracked: `git ls-files apps/web/app.config.timestamp_*.js`.
- b. If tracked: `git rm --cached apps/web/app.config.timestamp_1774013203376.js` and commit.
- c. Verify `.gitignore` covers `app.config.timestamp_*.js`.

### PR-12.2 — Fix React array-index key warning

**Subtasks:**
- a. Find the `.map()` call using `idx` as key (biome lint output points to line 413).
- b. Replace with a stable key from the finding's properties (e.g., `${f.type}-${f.ruleId}` or `f.id`).
- c. Verify `bun run lint` produces 0 warnings.

### PR-12.3 — De-scope vantagePoints table (migration)

**Subtasks:**
- a. **Pre-migration verification:** Run `SELECT COUNT(*) FROM observations WHERE vantage_id IS NOT NULL` against a representative database. If the count is > 0, investigate before proceeding — there may be data referencing the table.
- b. If count is 0: create a new Drizzle migration that drops the `vantage_id` column from `observations`, then drops the `vantage_points` table.
- c. Update the schema definition to remove `vantagePoints` and the FK from `observations`.
- d. Run `bun run check-drift` and `bun run verify-migrations` to verify alignment.

### PR-12.4 — Regenerate STATUS_REPORT.md (MUST BE LAST)

After all other PR beads are complete:

**Subtasks:**
- a. Re-run all validation commands and record actual output.
- b. Update bead status per `IMPLEMENTATION_BEADS.md` — all should now be ✅.
- c. Update known limitations (V1 only — the list should be shorter after this plan).
- d. Add a `Generated at: <timestamp>` line so readers know when the report was last verified.
- e. Reconcile test count, coverage percentage, and bead statuses with reality.

### PR-12.5 — Multi-tenant domain uniqueness migration preparation

This is NOT the migration itself (breaking change requiring data backfill). This is the preparation.

**Subtasks:**
- a. Document the migration plan in `packages/db/docs/TENANT_ISOLATION.md`: change unique index from `(normalizedName)` to `(normalizedName, tenantId)`.
- b. Document the breaking change: requires backfilling `tenantId` on all existing domains; requires deciding conflict resolution for domains shared across tenants.
- c. Create a migration script stub in `packages/db/scripts/` with the migration SQL and rollback plan, but do NOT apply it.

## Considerations

- PR-12.3 (vantagePoints migration) is a destructive schema change. Test against a copy of the production database before applying. The pre-migration verification step is critical.
- PR-12.4 must be the very last task in the entire plan. It captures the final truth. Running it earlier would produce a stale report.
- The build artifact removal (PR-12.1) is trivial and can be done immediately as a quick win.
- The lint warning fix (PR-12.2) is also trivial and should be done early.

## Validation

- `bun run lint` produces 0 warnings.
- `bun run check-drift` passes after schema changes.
- `STATUS_REPORT.md` matches actual command output.

## Definition of done

No stale artifacts, no lint warnings, no unused schema, no stale docs.

---

# Dependency Graph

```
PR-00 (CI E2E Gate)
  ├── PR-01 (Domain 360 E2E Proof)
  │     └── PR-05 (Delegation UI Activation)
  ├── PR-02 (Mail Evidence Chain Proof)
  ├── PR-04 (Portfolio E2E Proof)
  │     └── PR-08 (Alert Notification Delivery)
  ├── PR-07 (Job Orchestration & DNS Hardening)
  └── PR-09 (Tenant Isolation Proof)
        └── PR-11 (Validation, Rate Limiting, Collection Safety)

PR-03 (Legacy Bridge Hardening)          — independent
PR-06 (Probe Sandbox Security Review)    — independent
PR-10 (Observability & Operational)      — independent
PR-12 (Cleanup & Hygiene)               — independent (PR-12.4 must be last)
```

### Key design decisions in this dependency graph

1. **PR-02 (Mail Chain) depends only on PR-00, not PR-01.** The mail chain is mostly backend integration tests. The two UI tasks (preview label, confidence labels) can be done in parallel with PR-01. This unlocks more parallelism in Wave 2.

2. **PR-09 (Tenant Isolation) depends only on PR-00, not PR-04.** The portfolio write paths already exist and are testable. PR-09 tests isolation at the API level, which doesn't require PR-04's E2E round-trip proof. This moves PR-09 into Wave 2, which means PR-11 can start in Wave 3 instead of Wave 4.

3. **PR-08 (Alert Delivery) depends on PR-04, not PR-09.** Alert delivery needs proven alert dedup/noise budget (PR-04.5) before implementing delivery. Tenant isolation for alerts is covered by PR-09, but the delivery mechanism can be built and tested independently.

## Recommended execution order

**Wave 1 — Foundation (no dependencies, start immediately):**
- PR-00 — CI E2E Gate (MUST be first)
- PR-03 — Legacy Bridge Hardening (small, independent)
- PR-06 — Probe Sandbox Security Review (independent, can start immediately)
- PR-10 — Observability & Operational (independent)
- PR-12.1–12.3 — Cleanup items (quick wins)

**Wave 2 — Core journey proof (requires only PR-00, all in parallel):**
- PR-01 — Domain 360 E2E Proof
- PR-02 — Mail Evidence Chain Proof
- PR-04 — Portfolio E2E Proof
- PR-07 — Job Orchestration & DNS Hardening
- PR-09 — Tenant Isolation Proof

**Wave 3 — Expansion and hardening (requires specific Wave 2 items):**
- PR-05 — Delegation UI Activation (requires PR-01)
- PR-08 — Alert Notification Delivery (requires PR-04)
- PR-11 — Validation, Rate Limiting, Collection Safety (requires PR-09)

**Wave 4 — Final:**
- PR-12.4 — Regenerate STATUS_REPORT.md (after everything else)
- PR-12.5 — Multi-tenant migration preparation (after PR-09)

### Parallelism analysis

- **Wave 1:** 5 independent beads (PR-00 + 4 others). PR-00 is the critical path; the others can be done by separate developers in parallel.
- **Wave 2:** 5 beads, all independent of each other, all gated only on PR-00. This is the maximum parallelism point — 5 developers can work simultaneously.
- **Wave 3:** 3 beads, each dependent on a specific Wave 2 bead. Can be started as soon as their dependency completes, without waiting for all of Wave 2.
- **Wave 4:** 2 small tasks.

---

# Summary

| Bead | Name | Tasks | Subtasks | Wave | Closes |
|------|------|-------|----------|------|--------|
| PR-00 | CI E2E Gate | 3 | 8 | 1 | E2E not in CI |
| PR-01 | Domain 360 E2E Proof | 3 | 9 | 2 | B05 error states |
| PR-02 | Mail Evidence Chain Proof | 6 | 17 | 2 | B09/B10/B11 happy-path |
| PR-03 | Legacy Bridge Hardening | 2 | 7 | 1 | B08 external dep |
| PR-04 | Portfolio E2E Proof | 5 | 15 | 2 | B14/B15 happy-path |
| PR-05 | Delegation UI Activation | 3 | 9 | 3 | B16 partial (UI hidden) |
| PR-06 | Probe Sandbox Security Review | 4 | 14 | 1 | B17 security review |
| PR-07 | Job Orchestration & DNS Hardening | 7 | 18 | 2 | B19 gaps + B04 auth gap |
| PR-08 | Alert Notification Delivery | 3 | 11 | 3 | B20 no delivery |
| PR-09 | Tenant Isolation Proof | 5 | 13 | 2 | Tenant isolation integration tests |
| PR-10 | Observability & Operational | 4 | 9 | 1 | No APM/tracing |
| PR-11 | Validation, Rate Limiting, Safety | 3 | 12 | 3 | No rate limits + race condition |
| PR-12 | Cleanup & Hygiene | 5 | 12 | 1/4 | Stale artifacts/docs |
| **TOTAL** | | **53** | **154** | | |

### Changes from v1

| Change | Rationale |
|--------|-----------|
| Removed PR-01.4 (hydration safety test) | If `didHydrateReload` were broken, it would cause an immediately obvious infinite loop. Low-value test. |
| Merged PR-03.3 into PR-03.2 | URL safety and E2E link verification are the same concern. Separate bead was overhead. |
| Removed PR-08.4 (email notification interface) | Future-proofing, not production readiness. The webhook implementation demonstrates the pattern. |
| Moved webhook delivery to collector (PR-08) | Workers can't inspect resolved IPs for SSRF protection. Collector has full network control. |
| Revised PR-11.2 (rate limiting) | In-memory rate limiting is useless on stateless Workers isolates. Collector: in-memory. Web: Cloudflare-native. |
| PR-02 depends only on PR-00, not PR-01 | Mail chain proof is mostly backend tests. UI tasks are small and can parallel PR-01. More Wave 2 parallelism. |
| PR-09 depends only on PR-00, not PR-04 | Tenant isolation tests don't require portfolio E2E proof. More Wave 2 parallelism. |
| Revised PR-09.1 to test-only | Simulation route already has tenant isolation (lines 76–82). Original audit missed this. Task is now verification tests + optional refactor, not a code fix. |
| Added PR-11.3 `findOrCreate` race fix | `DomainRepository.findOrCreate()` is non-atomic find-then-insert. Concurrent collection fails. |
| Added PR-07.5 (fleet report worker test) | Fleet report job correctness was untested. |
| Added PR-07.6 (authoritative collection mock test) | Authoritative DNS collection path had no deterministic test. |
| Revised PR-01 to acknowledge existing error handling | Domain 360 already renders yellow "no data" and red refresh errors. Gap is only in SSR loader conflation. |
| Simplified PR-10.4 (structured logging) | Focus on `console.error/warn` only, not all `console.log`. Error context matters; info logging is lower priority. |
| Added pre-migration check to PR-12.3 | Must verify `vantage_id` is always NULL before dropping the column. |

**After completing all 13 PR beads (53 tasks, 154 subtasks), the ship decision for both `apps/web` and `apps/collector` moves from "GO WITH EXPLICIT RISKS" to unconditional "GO."**
