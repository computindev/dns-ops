# DNS Ops Workbench — Revised Implementation Beads

**Revision date:** 2026-03-20
**Status:** authoritative planning document
**Important:** This document supersedes the earlier bead ordering. The split files in `beads/` still reflect the older v1 plan and must not be treated as authoritative until regenerated from this document.

## Why this revision exists

The earlier bead graph optimized for visible surfaces too early. The repo reality check showed four missing foundations:
- build/test truth not enforced,
- split-brain runtime/storage assumptions,
- duplicated request/domain validation,
- findings evaluated inline instead of persisted.

This revised plan re-centers the system on one truthful path:
1. collect evidence,
2. persist it,
3. evaluate it deterministically,
4. show it clearly,
5. only then expand into portfolio/automation/probes.

## Unsupported / experimental surfaces already present in code

The repo currently contains out-of-sequence code that must be treated as **frozen ahead-of-plan surfaces**, not evidence of completed beads, until their owning revised bead lands:
- `apps/web/hono/routes/mail.ts`
- `apps/web/hono/routes/portfolio.ts`
- `apps/web/hono/routes/shadow-comparison.ts`
- `apps/web/hono/routes/provider-templates.ts`
- `apps/collector/src/jobs/fleet-report.ts`
- `apps/collector/src/jobs/monitoring.ts`
- `apps/collector/src/jobs/probe-routes.ts`
- `apps/web/app/routes/domain/$domain.tsx`
- `apps/web/app/components/mail/MailDiagnostics.tsx`
- `apps/web/app/components/mail/RemediationForm.tsx`
- `apps/web/app/components/DiscoveredSelectors.tsx`
- `apps/web/app/components/DelegationPanel.tsx`
- `apps/collector/src/index.ts`
- `STATUS_REPORT.md`

These surfaces may contain useful partial work, but they must not be used as proof that mail, remediation, delegation, portfolio, monitoring, probes, template editing, parity governance, or later-bead completion are already product-ready.

## Guiding principles

1. **Truthful before broad**
   No placeholder surface before the backing evidence path is real.

2. **One authoritative persistence model**
   Web and collector must not pretend to share state while using divergent runtime assumptions.

3. **Single-domain trust first**
   The first complete user value is a trustworthy Domain 360. Portfolio and monitoring come later.

4. **Stored evidence, stored evaluation**
   Raw observations and evaluation runs are first-class persisted artifacts.

5. **Auth before operator writes**
   Notes, overrides, remediation, monitoring, and adjudication require real actor/tenant context.

6. **Optional complexity stays optional**
   Delegation depth and non-DNS probes are later multipliers, not MVP blockers.

---

# Bead 00 — Workspace validation baseline

**Purpose**  
Make the repo truthful before more implementation lands.

**Prerequisites**  
None.

**Concrete change**  
Create a reliable validation contract for the monorepo:
- all workspaces expose real `build`, `typecheck`, `lint`, and `test` scripts,
- root `bun lint`, `bun typecheck`, `bun build`, and `bun test` execute real work,
- generated artifacts are excluded from source test execution,
- CI skeleton actually runs the same commands developers use locally.

**Invariants**
- A green root test command must mean real source tests passed.
- Build artifacts must not create false-green or duplicate test execution.
- Status docs may not claim completeness against red validation.

**Validation / tests**
- Run root validation commands successfully.
- Confirm source tests run without `dist` duplicates.
- Confirm CI config matches local validation sequence.

**Definition of done**
- The repo can honestly say whether it is green or red.


# Bead 01 — Pilot corpus, status vocabulary, query scope, and trust boundary

**Purpose**
Turn product intent into executable policy before more product code lands.

**Prerequisites**
Bead 00.

**Concrete change**
Maintain the planning artifacts that define what the product is allowed to claim:
- benchmark corpus of representative domains and failure cases,
- shared result/risk/confidence vocabulary,
- explicit phase-1 DNS query scope,
- trust-boundary policy for later non-DNS probes.

**Invariants**
- Unmanaged zones default to `partial` visibility.
- No document may imply whole-zone visibility for arbitrary third-party domains.
- Probe policy stays doc-backed and explicit before any network probing expands.

**Validation / tests**
- Corpus reviewed against manual evidence.
- Scope and vocabulary referenced by code-facing contracts.
- Trust-boundary doc remains aligned with actual probe behavior.

**Definition of done**
- Query scope and trust claims are explicit, versioned, and reusable by later beads.


# Bead 02 — Authoritative runtime topology and scaffold

**Purpose**  
Resolve the storage/runtime topology before the repo grows further.

**Prerequisites**  
Beads 00–01.

**Concrete change**  
Finalize the implementation shape:
- one authoritative production persistence topology,
- one clear web runtime contract,
- one clear collector runtime contract,
- monorepo scaffold aligned to that choice,
- env matrix for local/dev/prod.

**Invariants**
- Product state may not silently drift across incompatible backing stores.
- Web and collector must agree on where authoritative state lives.
- Runtime fallbacks must fail explicitly, not mask topology mistakes.

**Validation / tests**
- Web and collector build against the chosen topology.
- Startup config validation catches missing or impossible env combinations.
- Local and production-mode smoke paths use the same truth model.

**Definition of done**
- There is no architectural ambiguity about where product data lives.


# Bead 03 — Shared contracts and core supported schema

**Purpose**
Establish one reusable contract layer for requests, domain normalization, and core persisted entities.

**Prerequisites**
Bead 02.

**Concrete change**
Define the smallest supported product schema and shared API contract layer:
- shared request/response DTOs for collection and lookup flows,
- DTO reservations for later remediation/governed write paths without activating them early,
- one shared domain normalization/validation implementation,
- remediation UI/API remain deferred until the post-auth governed-write beads.
- core schema only for:
  - `Domain`,
  - `Snapshot`,
  - `Observation`,
  - `RecordSet`,
  - `RulesetVersion`,
- snapshot scope persisted explicitly.
- remediation/write DTO reservations only; governed write flows remain deferred.

**Invariants**
- Domain normalization may not diverge between web and collector.
- Core schema means “actively supported now,” not “maybe used later.”
- Raw observations remain append-only.

**Validation / tests**
- Round-trip tests for shared contracts.
- Domain normalization tests including IDN/punycode cases.
- Migration test from empty DB.
- Scope integrity test: a snapshot cannot exist without explicit scope metadata.

**Definition of done**
- Web, collector, and packages speak the same request and domain language.


# Bead 04 — DNS collection and normalization pipeline

**Purpose**  
Create one trustworthy evidence pipeline for single-domain DNS state.

**Prerequisites**  
Bead 03.

**Concrete change**  
Implement the DNS collection path end-to-end:
- phase-1 DNS query planning,
- recursive collection,
- authoritative collection using a real authoritative strategy,
- observation persistence,
- `RecordSet` normalization,
- explicit result-state handling for timeout/refusal/truncation/NXDOMAIN/NODATA/error.

**Invariants**
- Every visible DNS conclusion must trace back to stored observations.
- Managed/unmanaged behavior must match the documented scope policy.
- Failure states are first-class, not swallowed.

**Validation / tests**
- Integration tests against controllable zones.
- Query-plan tests for managed vs unmanaged.
- Parsing/normalization tests for TXT, CNAME chains, wildcard, IDN, NXDOMAIN, NODATA.

**Definition of done**
- A domain refresh produces stored observations and normalized record sets that can be trusted.


# Bead 05 — Single-domain evidence viewer

**Purpose**  
Deliver the first complete user value: a truthful Domain 360 for DNS evidence.

**Prerequisites**  
Bead 04.

**Concrete change**  
Merge the old shell/read-path intent into one backed viewer:
- domain lookup and normalization,
- a **DNS-only** Domain 360 for the initial shipped viewer,
- raw / parsed / dig-style DNS views,
- snapshot metadata and explicit query scope,
- refresh flow with correct loading/error states,
- visible managed/unmanaged and complete/partial/failed labeling,
- mail, delegation, history, remediation, and selector surfaces hidden or feature-flagged until their owning beads land.

**Invariants**
- The UI may not present placeholder product areas as implemented workflows.
- Raw evidence remains discoverable with minimal friction.
- Scope warnings are prominent for unmanaged zones.

**Validation / tests**
- UI tests for domain input, IDN, status badges, scope labeling, and empty/error states.
- Smoke test: user enters domain, triggers refresh, lands on evidence viewer.

**Definition of done**
- A user can trust what the Domain 360 page shows and what it does not claim.


# Bead 06 — Ruleset registry and persisted DNS findings

**Purpose**  
Make deterministic analysis durable instead of request-local.

**Prerequisites**  
Bead 05.

**Concrete change**  
Introduce stored evaluation runs and DNS findings:
- ruleset registry used at runtime,
- persisted evaluation-run boundary per snapshot + ruleset version,
- deterministic DNS findings and suggestions stored in DB,
- overview findings panel reads stored results by default.

**Invariants**
- Findings derive only from stored evidence.
- Re-evaluation creates versioned analysis context, not silent overwrite.
- UI read paths do not depend on ephemeral inline analysis.

**Validation / tests**
- Golden tests against benchmark corpus.
- Evidence-link tests for every finding.
- Versioning tests proving a snapshot can be re-evaluated under a new ruleset.
- Persistence tests for evaluation runs/findings/suggestions.

**Definition of done**
- DNS findings are deterministic, persisted, and version-aware.


# Bead 07 — Snapshot history and diff

**Purpose**  
Make before/after DNS change analysis trustworthy as soon as persisted findings exist.

**Prerequisites**  
Bead 06.

**Concrete change**  
Add snapshot comparison workflows:
- snapshot list per domain,
- compare-latest,
- manual snapshot-to-snapshot diff,
- changed records, TTLs, findings, scope, and ruleset version visibility.

**Invariants**
- Diff is bounded by stored scope.
- Unknown vs unchanged must remain distinct.
- Ruleset-change and scope-change warnings are explicit.

**Validation / tests**
- Diff tests for value, TTL, scope, ruleset, and findings changes.
- UI tests for readability and ambiguity labeling.

**Definition of done**
- A user can compare two snapshots and understand what changed and what stayed unknown.


# Bead 08 — Legacy mail bridge

**Purpose**  
Keep trusted legacy DMARC/DKIM workflows reachable without pretending parity exists.

**Prerequisites**  
Bead 05.

**Concrete change**  
Implement the bridge only:
- Domain 360 mail tab links to trusted legacy mail tools,
- domain context is pre-filled,
- return path back to Domain 360 works,
- access can be logged once durable logging exists.

**Invariants**
- Legacy outputs remain authoritative.
- The bridge does not claim workbench parity.
- Placeholder URLs must never be presented as real production integrations.

**Validation / tests**
- Smoke tests for deep links and return path.
- Config tests for legacy tool URL presence.
- Auth/session tests if legacy tools are protected.

**Definition of done**
- Users can move from Domain 360 to legacy mail tools without losing context.


# Bead 09 — Mail evidence core

**Purpose**  
Bring mail evidence into the same persisted evidence model as DNS.

**Prerequisites**  
Beads 04 and 08.

**Concrete change**  
Extend collection and storage for mail-relevant evidence:
- `MX`,
- SPF-bearing TXT,
- `_dmarc`,
- `_mta-sts`,
- `_smtp._tls`,
- Null MX posture,
- snapshot-backed mail observations through the same core persistence path.

**Invariants**
- Mail evidence is snapshot-backed, not a parallel ephemeral truth system.
- Absence of observed mail evidence is not over-interpreted beyond collected scope.
- Mail collection reuses shared domain/request contracts.

**Validation / tests**
- Integration tests for mail observation persistence.
- Cases for Null MX, SPF-bearing TXT, DMARC presence/absence, and probe-adjacent TXT records.

**Definition of done**
- Mail evidence is stored and inspectable through the same evidence model as DNS.


# Bead 10 — DKIM selector provenance and provider detection

**Purpose**  
Separate basic mail evidence from higher-ambiguity selector heuristics.

**Prerequisites**  
Bead 09.

**Concrete change**  
Implement DKIM selector discovery as a first-class, labeled subsystem:
- selector precedence rules,
- provider detection,
- selector provenance,
- selector confidence,
- persisted selector metadata used by the API/UI.

**Invariants**
- Heuristic selector discovery must be visibly heuristic.
- Not finding a selector is not the same as proving DKIM is absent.
- The API may not reconstruct provenance by guesswork after the fact.

**Validation / tests**
- Tests for provider-specific selectors, multiple selectors, no selector, and confidence/provenance rendering.

**Definition of done**
- Users can see how selectors were discovered and how trustworthy that discovery is.


# Bead 11 — Mail findings preview

**Purpose**  
Give users useful workbench mail analysis without prematurely declaring cutover.

**Prerequisites**  
Beads 09–10 and Bead 06 evaluation infrastructure.

**Concrete change**  
Implement persisted preview mail findings for:
- MX posture,
- Null MX posture,
- SPF present / malformed / absent,
- DMARC present / malformed / policy posture,
- DKIM key presence for discovered selectors,
- MTA-STS and TLS-RPT TXT presence,
- BIMI as info-only.

**Invariants**
- Preview findings are evidence-backed and persisted.
- Legacy tools remain authoritative until parity is explicitly achieved.
- High-risk suggestions remain review-only.

**Validation / tests**
- Golden tests for mail rules.
- UI tests for mail findings rendering in the Mail tab.
- Persistence tests using evaluation runs.

**Definition of done**
- Users can inspect useful workbench mail findings alongside legacy access.


# Bead 12 — Shadow comparison and parity evidence

**Purpose**  
Create the durable parity evidence path between workbench mail analysis and legacy tools.

**Prerequisites**  
Beads 08 and 11.

**Concrete change**  
Implement the read-mostly parity layer:
- durable legacy access logging,
- durable shadow comparison records,
- read-only mismatch reporting,
- narrow provider-template baseline pack,
- expected-vs-actual comparisons that survive process restart.

**Invariants**
- Shadow state must be durable, not process-local memory.
- Provider baselines are readable parity reference data here, not tenant-scoped edit surfaces.
- No cutover claim without persisted mismatch history.

**Validation / tests**
- Shadow persistence tests.
- Mismatch reporting tests.
- Expected-vs-actual accuracy tests for supported providers.

**Definition of done**
- The repo has durable parity evidence, not just preview language.

**Note on cutover**
Durable parity evidence here does **not** imply legacy mail cutover. Cutover requires persisted mismatch history plus an explicit adjudication threshold and human decision.


# Bead 13 — Auth, actor, tenant, and write-path governance

**Purpose**  
Prevent fake auditability and fake multi-tenancy before more operator write surfaces land.

**Prerequisites**  
Beads 02–03.

**Concrete change**  
Add real request identity and route governance:
- auth middleware,
- actor/tenant context population,
- protected write routes,
- removal of silent `default` / `unknown` write ownership,
- explicit internal-only behavior where public auth is not ready yet.

**Invariants**
- Persistent writes require real actor/tenant context.
- Route protection must exist before portfolio writes, monitoring writes, or template editing expand.
- Shared reports and operator state may not leak across tenants.

**Validation / tests**
- Route-level auth/authz tests.
- Tenant-isolation tests.
- Input validation tests on critical mutating routes.

**Definition of done**
- The system can truthfully claim who wrote what and for which tenant.


# Bead 14 — Portfolio search and read models

**Purpose**  
Deliver cross-domain value safely, starting with read-only operator workflows.

**Prerequisites**  
Beads 07, 11–13.

**Concrete change**  
Build the read-only portfolio layer:
- search/filter across domains and findings,
- saved filter read path,
- inventory-scoped results,
- frontend route/navigation for portfolio search,
- read models based on stored findings and snapshots, not ad hoc parallel heuristics.

**Invariants**
- Portfolio search is inventory-scoped.
- Results come from stored evidence and stored findings.
- Read-only portfolio value ships before broader write surfaces.

**Validation / tests**
- Search/filter correctness tests.
- UI tests for portfolio search states.
- Tenant-aware read tests.

**Definition of done**
- A trusted operator can find and inspect domains across the portfolio from one place.


# Bead 15 — Portfolio writes, notes, tags, overrides, adjudication, and audit log

**Purpose**
Add operator memory and controlled write workflows after auth exists.

**Prerequisites**
Beads 12–14.

**Concrete change**
Implement write-enabled operator workflows:
- notes,
- tags,
- saved filter writes,
- tenant-scoped template override management,
- shadow comparison adjudication,
- audit log visibility.

**Invariants**
- Every write is actor-attributed and auditable.
- Template changes affect only intended tenant/domain scope.
- Adjudication is a governed operator write, not an anonymous parity side effect.
- Write workflows do not precede auth governance.

**Validation / tests**
- CRUD tests for notes/tags/filters/overrides.
- Adjudication tests.
- Audit-log tests.
- Permission tests for cross-tenant access.

**Definition of done**
- Operators can safely annotate, adjudicate, and tune portfolio behavior with durable auditability.


# Bead 16 — Delegation evidence

**Purpose**  
Add deeper delegation and DNSSEC evidence only after the core single-domain product is trustworthy.

**Prerequisites**  
Beads 04–07.

**Concrete change**  
Extend collection and UI for delegation diagnostics:
- parent-zone delegation evidence,
- per-authoritative-server answers,
- glue evidence,
- DNSSEC validation-source metadata,
- delegation-specific issue rendering.

**Invariants**
- DNSSEC conclusions may not exceed what the validating source proves.
- Delegation evidence remains raw-evidence-backed and ambiguity-forward.
- Delegation is a depth feature, not a substitute for core DNS truth.

**Validation / tests**
- Tests for mismatched NS sets, lame delegation, glue variation, DNSSEC present/absent, and authoritative divergence.
- Integration tests for delegation routes/UI.

**Definition of done**
- Users can inspect delegation evidence without relying on placeholder behavior.


# Bead 17 — Non-DNS probe sandbox (optional)

**Purpose**
Enable safe active probing only after core mail evidence and governance are mature.

**Prerequisites**
Beads 01, 09–13.

**Concrete change**
Implement the optional probe subsystem:
- allowlist-derived targets only,
- hard-blocked internal/private destinations,
- separate execution surface and egress identity,
- probe outcomes persisted as observations,
- explicit operator-triggered execution first.

**Invariants**
- No arbitrary outbound probing.
- No production mail egress reuse.
- Probe outcomes stay read-only and explicitly scoped.

**Validation / tests**
- SSRF guard tests.
- Allow/deny tests.
- Rate-limit/concurrency/timeout tests.
- Security review.

**Definition of done**
- If enabled, probes are safe, bounded, and evidence-backed.


# Bead 18 — Batch findings report

**Purpose**  
Capture early fleet value without building a second analysis engine.

**Prerequisites**  
Beads 11–13.

**Concrete change**  
Implement a narrow batch report/export layer that consumes stored findings and snapshots:
- curated inventory input,
- internal report/export for a small set of high-value conditions,
- report rows derived from stored evidence and stored findings.

**Invariants**
- Batch reporting may not fork the rules logic into a separate heuristic engine.
- Results stay inventory-scoped and read-only.
- Fleet value comes from the same truth model used for single-domain analysis.

**Validation / tests**
- Batch run tests against sample inventory.
- Spot-check report rows against stored findings and raw evidence.

**Definition of done**
- The team can generate an actionable internal fleet report without duplicating analysis logic.


# Bead 19 — Job orchestration and scheduled refresh

**Purpose**
Add async execution truth before alerting and broader automation.

**Prerequisites**
Beads 04, 06, 11, 13, and 18.

**Concrete change**
Introduce explicit job orchestration:
- queued collection/evaluation jobs,
- idempotent scheduling,
- retry/cancellation/error state tracking,
- narrow scheduled refresh for monitored domains.

**Invariants**
- Background execution must be observable and idempotent.
- Scheduled refresh starts narrow and opt-in.
- Jobs may not hide failures behind silent retries.

**Validation / tests**
- Queue/idempotency tests.
- Scheduler tests.
- Retry and cancellation tests.

**Definition of done**
- The repo has a trustworthy async execution model instead of scattered inline loops.


# Bead 20 — Alerts and shared reports

**Purpose**  
Add proactive operations only after signal quality, auth, and job execution are trusted.

**Prerequisites**  
Beads 13, 18, and 19.

**Concrete change**  
Implement the first proactive ops layer:
- alert rules on stored findings/evaluations,
- suppression and deduplication,
- acknowledge/resolve workflow,
- shared read-only reports with bounded/redacted evidence.

**Invariants**
- Monitoring respects a defined noise budget.
- Alerts do not bypass review-only safeguards.
- Shared reports do not leak internal notes or imply unmanaged-zone completeness.

**Validation / tests**
- Alert dedup/suppression tests.
- Report permission/redaction tests.
- Narrow pilot run to measure noise and operator value.

**Definition of done**
- The system can produce low-noise proactive value without overstating what it knows.

---

# Revised dependency order summary

1. **00** — Workspace validation baseline
2. **01** — Pilot corpus, status vocabulary, query scope, and trust boundary
3. **02** — Authoritative runtime topology and scaffold
4. **03** — Shared contracts and core supported schema
5. **04** — DNS collection and normalization pipeline
6. **05** — Single-domain evidence viewer
7. **06** — Ruleset registry and persisted DNS findings
8. **07** — Snapshot history and diff
9. **08** — Legacy mail bridge
10. **09** — Mail evidence core
11. **10** — DKIM selector provenance and provider detection
12. **11** — Mail findings preview
13. **12** — Shadow comparison and parity evidence
14. **13** — Auth, actor, tenant, and write-path governance
15. **18** — Batch findings report
16. **14** — Portfolio search and read models
17. **15** — Portfolio writes, notes, tags, overrides, adjudication, and audit log
18. **16** — Delegation evidence
19. **17** — Non-DNS probe sandbox (optional)
20. **19** — Job orchestration and scheduled refresh
21. **20** — Alerts and shared reports

---

# Recommended stopping points

- **After Bead 05:** first trustworthy single-domain evidence product.
- **After Bead 06:** persisted DNS findings with real analytical truth.
- **After Bead 07:** strong migration / propagation workflow.
- **After Bead 11:** first useful workbench mail preview.
- **After Bead 12:** durable mail parity program.
- **After Bead 14:** first safe portfolio read value.
- **After Bead 18:** actionable batch fleet reporting from one truth model.
- **After Bead 20:** proactive operations platform.
