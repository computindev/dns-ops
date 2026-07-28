# DNS Ops Phase 0–1 — Day 0 / Gate 1 Repository Truth

**Recorded:** 2026-07-28  
**Checkpoint status:** `DAY_0_INPUT_REQUIRED` — product implementation has not started

## Git authority

| Item | Verified value |
|---|---|
| Repository | `computindev/dns-ops` |
| Documentation authority ref | `origin/agent/domain-operations-phase-0-1` |
| Documentation authority SHA | `32dc8268ee8f38ce11513c3c9d2106bedf18f17a` |
| Implementation base SHA | `32dc8268ee8f38ce11513c3c9d2106bedf18f17a` |
| Audited source SHA | `32dc8268ee8f38ce11513c3c9d2106bedf18f17a` |
| Implementation branch | `agent/domain-operations-phase-0-1-implementation` |
| Authority ancestry | authority is the implementation branch ancestor; divergence at audit time was `0 0` |
| Worktree state at audit start | dirty only because tracked nested path `.pi/self-learning-memory` was already modified; no product file was dirty |

`origin/master` contains the authority tree through merge commit `212afab`, but it is not an implementation authority and was not merged into this branch.

## Authoritative documents read

Read in required order:

1. `docs/domain-operations/README.md`
2. `docs/domain-operations/phase-0-1-execution-contract-v4.1.md`
3. `docs/domain-operations/phase-0-1/01-outcome-budget-scope.md`
4. `docs/domain-operations/phase-0-1/02-correctness-remediation-operations.md`
5. `docs/domain-operations/phase-0-1/03-seeded-tests-and-mcp.md`
6. `docs/domain-operations/phase-0-1/04-review-gates-and-agent-prompt.md`
7. `docs/domain-operations/controlled-test-assets-runbook-v4.1.md`
8. `docs/domain-operations/day-0-worksheet.md`

The product brief was not used to expand scope.

## Repository-native commands

Root `package.json` and `.github/workflows/ci.yml` establish these commands:

- `bun install --frozen-lockfile`
- `bun run --filter @dns-ops/db build`
- `bun run --filter @dns-ops/db check-drift`
- `DATABASE_URL=... bun run --filter @dns-ops/db verify-migrations`
- `bun run lint`
- `bun run typecheck`
- `RUN_LIVE_DNS_TESTS=0 bun run test`
- `bun run build`
- `bun run smoke-test`
- `bun run --filter @dns-ops/web e2e`
- optional only: `bun run test:live-dns`

CI additionally provisions PostgreSQL 15 and Redis 7, pushes the schema to the isolated CI database, starts the collector, and runs Playwright.

## Validation baseline

Environment: Bun `1.3.14`, Node `v22.23.1`; the repository declares Bun `1.3.11` and Node `>=20`.

| Command | Result | Evidence |
|---|---|---|
| `bun install --frozen-lockfile` | PASS | 1,313 packages installed without tracked lockfile change |
| standalone DB build before dependency builds | FAIL | `@dns-ops/contracts` declarations unavailable; this ordering is not a valid clean-worktree baseline |
| `bun run --filter @dns-ops/db check-drift` | PASS | `NO DRIFT` |
| `bun run --filter @dns-ops/db verify-migrations` | BLOCKED | `DATABASE_URL` is unset; no local PostgreSQL readiness tool is available |
| `bun run lint` | PASS | 8/8 workspace tasks |
| `bun run typecheck` | PASS | 14/14 workspace tasks |
| `RUN_LIVE_DNS_TESTS=0 bun run test` | PASS | 136 files passed, 3 skipped; 2,539 tests passed, 41 skipped |
| `bun run build` | PASS | 8/8 workspace tasks |
| smoke test | NOT RUN | requires running services |
| Playwright E2E | NOT RUN | requires isolated PostgreSQL, collector, and web runtime |
| live DNS tests | NOT RUN | optional network test; not a deterministic baseline requirement |

Raw command logs for this workstation run are under `/tmp/dns-ops-gate1-baseline/` and are intentionally not committed.

## Runtime topology proven by code

- PostgreSQL/Drizzle is the product datastore (`packages/db/src/schema/index.ts`).
- `apps/collector` is a Node/Hono process with synchronous collection and optional BullMQ/Redis workers (`apps/collector/src/index.ts`, `apps/collector/src/jobs/worker.ts`).
- `apps/web` builds a TanStack Start/Vinxi Node server and both services have Railway Docker configuration (`apps/web/package.json`, `apps/web/railway.toml`, `apps/collector/railway.toml`).
- Web calls collector APIs; collector persists snapshots, observations, record sets, findings, suggestions, alerts, and probe observations.
- There are no signal, internal-case, domain-purpose, RDAP, web TLS, generic HTTP-health, redirect-matrix, or indexability application contracts in current source.

## Current authoritative-DNS truth

- Only `zoneManagement === "managed"` triggers per-nameserver collection in `apps/collector/src/dns/collector.ts`; unmanaged and unknown zones use public recursive evidence only.
- Nameservers are discovered through the configured recursive resolver, then used as target vantages.
- `queryWithDnsPacket` decodes AA/TC/RD/RA/AD/CD, but `DNSResolver.queryViaDnsPacket` discards those decoded flags and substitutes constants with `aa: false` (`apps/collector/src/dns/dnssec-resolver.ts`, `apps/collector/src/dns/resolver.ts`).
- A/AAAA use Node `Resolver.setServers`; the discovered nameserver values are hostnames, while `setServers` expects address literals. This can turn intended authoritative A/AAAA checks into errors.
- Direct nameserver targeting is useful evidence, but current persisted observations cannot prove the AA bit and must not be presented as verified authoritative answers.
- `calculateResultState` can still return `complete` for a managed plan when all returned query results succeed; it does not require AA proof.

## Current SPF truth

- `parseSPF` performs first-record token parsing only (`packages/parsing/src/mail/index.ts`).
- `countSPFLookups` is misnamed for the approved scope, is not used by the active SPF rule, and cannot count a `redirect=` modifier because it inspects mechanisms only.
- The active rule does not recurse includes or redirect, which is consistent with the closed scope, but it does not emit the required `FIRST_LEVEL_ONLY` assessment or unresolved-dependency limitation.
- The active rule can call a record “valid,” “certain,” “safe,” or “Configuration looks good” without evaluating nested includes. It does not currently claim the recursive ten-term budget, but its green language overstates completeness.

## Current DMARC truth

- The parser models `p`, `sp`, `pct`, `rua`, `ruf`, `fo`, `adkim`, `aspf`, `rf`, and `ri`.
- It does not model current `np`, `psd`, or `t` behavior.
- `pct`, `rf`, and `ri` remain active data, and `pct` drives rule output.
- Discovery is one direct `_dmarc.<domain>` lookup. There is no RFC 9989 tree walk, organizational-domain primitive, eight-query bound, or typed resolver trace.
- Multiple records are not rejected; the first matching answer is used.
- Failed DMARC queries are filtered out before analysis and become a certain “No DMARC record,” conflating DNS failure with absence.

## Current rule-error behavior

`RulesEngine.evaluate` catches each rule exception, writes `console.error`, and continues without returning an error (`packages/rules/src/engine/index.ts`). `DNSCollector.evaluateAndPersistFindings` also catches its whole evaluation/persistence path and returns zero findings/suggestions (`apps/collector/src/dns/collector.ts`). Snapshot completeness was decided before rules evaluation.

Therefore a throwing rule can produce no finding while the snapshot remains complete. `MailFindingsPanel` renders zero findings as green “No mail configuration issues detected.” This is a verified false-green path and Gate 2 blocker.

## Current alert-generation paths

1. `apps/collector/src/jobs/worker.ts` runs `generateAndSendFindingAlerts` after queued `collect-domain` jobs.
2. `apps/collector/src/jobs/alert-from-findings.ts` converts every high/critical, non-review-only finding into a new alert and may deliver a webhook.
3. Finding-derived alerts have no stable condition deduplication key; repeated scans can create repeated alerts.
4. `apps/collector/src/jobs/monitoring.ts` separately creates a `Collection Failed` legacy alert and webhook when its collector HTTP request fails.
5. Synchronous ad-hoc collection and the monitoring-refresh worker do not share one canonical alert path.
6. No signal path exists yet, so nothing is currently `MAPPED_TO_SIGNAL`.

## Legacy condition map

| Condition ID | Disposition | Replacement signal | Notification path | Evidence |
|---|---|---|---|---|
| `domain.expiring-soon` | `DISABLED` | `DOMAIN_EXPIRING_SOON` | `NONE` | no RDAP/expiration collector or rule |
| `web.tls-certificate-regression` | `DISABLED` | `TLS_CERTIFICATE_REGRESSION` | `NONE` | schema enum exists; no web TLS probe/evaluator |
| `web.http-endpoint-unavailable` | `DISABLED` | `HTTP_ENDPOINT_UNAVAILABLE` | `NONE` | schema enum exists; no HTTP-health probe/evaluator |
| `web.redirect-topology-regression` | `DISABLED` | `REDIRECT_TOPOLOGY_REGRESSION` | `NONE` | no redirect-matrix evaluator |
| `web.homepage-indexability-regression` | `DISABLED` | `HOMEPAGE_INDEXABILITY_REGRESSION` | `NONE` | no robots/canonical/indexability evaluator |
| `mail.no-spf-record` | `LEGACY_ONLY` | `MAIL_DNS_CONFIGURATION_REGRESSION` candidate | `LEGACY_ALERT` | high, non-review-only finding reaches finding-alert job |
| `mail.no-dmarc-record` | `LEGACY_ONLY` | `MAIL_DNS_CONFIGURATION_REGRESSION` candidate | `LEGACY_ALERT` | high, non-review-only finding reaches finding-alert job |
| `mail.dkim-no-valid-keys` | `LEGACY_ONLY` | `MAIL_DNS_CONFIGURATION_REGRESSION` candidate | `LEGACY_ALERT` | high, non-review-only finding reaches finding-alert job |
| `collector.collection-failed` | `LEGACY_ONLY` | none in the six-signal set | `LEGACY_ALERT` | direct alert in monitoring route |
| all other current DNS/mail finding types | `DISABLED` | none yet | `NONE` | current severity/review-only filter does not notify |
| `dns.partial-coverage-unmanaged` | `DISABLED` | prohibited | `NONE` | currently a safe/info finding; must move to setup/evidence and never signal |

Before a mail condition becomes `MAPPED_TO_SIGNAL`, its direct finding-alert eligibility must be removed in the same change and duplicate-path tests must pass.

## Suggestion and remediation truth

- Active rules emit provider-assuming, executable-looking record text for SPF, DMARC, DKIM, MTA-STS, TLS-RPT, MX, and CNAME changes (`packages/rules/src/mail/rules.ts`, `packages/rules/src/dns/rules.ts`).
- The deterministic simulation engine emits concrete mutation objects, including generic reporting mailboxes, provider templates, Null MX, and `YOUR_PUBLIC_KEY` placeholders (`packages/rules/src/simulation/index.ts`).
- The UI labels suggestion state changes “Apply” / “Applied,” although the API only marks the database suggestion row and performs no provider mutation (`apps/web/app/components/MailFindingsPanel.tsx`, `apps/web/hono/routes/suggestions.ts`).
- Generic remediation requests are executable-looking workflow records with status transitions that can be resolved without fresh evidence (`apps/web/hono/routes/mail.ts`, `packages/db/src/schema/remediation.ts`).
- These paths must become guidance-only or be gated by complete, provider-confirmed simulation context. DNS Ops product and MCP currently contain no provider API writer, which must remain true.

## Probe, tenant, and audit boundaries

- Implemented probes are SMTP STARTTLS and MTA-STS. Web TLS and generic HTTP probe enum values are schema-only.
- SSRF checks block private, loopback, link-local, multicast, reserved, and mapped-private addresses; MTA-STS rejects redirects.
- In-memory allowlists are tenant-keyed, but probe routes can build allowlist entries from caller-supplied `domain`, `hostname`, `mxRecords`, and `dnsResults`; these inputs are not proven to be registered-domain evidence.
- Collector `/api/*` service auth is a boundary, but Phase 1 `scan_request` must additionally accept only a registered domain ID and derive tenant/actor from the MCP principal.
- Web authorization derives tenant/actor from request context and repositories often recheck tenant ownership. Some legacy repositories fetch broadly then filter in memory; MCP services must use explicit tenant predicates.
- Audit events exist for portfolio, remediation, monitoring, and alert lifecycle changes. Rule failures, scan requests, suggestion apply/dismiss, and probe persistence do not yet provide the Phase 1 audit contract.

## Stale or conflicting documentation

- `README.md` and `docs/architecture/runtime-topology.md` call the web runtime Cloudflare Workers/Hyperdrive; package scripts, Vinxi Node output, Dockerfiles, and Railway config prove the deployed shape is currently a Node server on Railway.
- `docs/architecture/runtime-topology.md` says raw DNS flag parsing is future work; raw parsing now exists, but `DNSResolver` discards the decoded flags. The limitation remains, for a different implementation reason.
- `docs/rules/query-scope.md` describes conditional shallow SPF include queries and stronger managed authoritative completeness that current query planning does not implement.
- `docs/rules/trust-boundary.md` says targets are derived from DNS only, while probe routes accept caller-supplied DNS-shaped values.
- `README.md` reports 2,212 tests/114 files; the verified baseline is 2,539 passing tests/136 passing files plus skips.
- `README.md` links `STATUS_REPORT.md` and `REPO_STRUCTURE.md`, but neither file exists. `docs/rules/trust-boundary.md` also links missing `docs/security/probe-incident-response.md` and `docs/architecture/network-isolation.md`.
- `README.md` advertises concrete provider-aware fixes; Phase 0–1 requires generic remediations to become non-executable guidance.
- Migration `0007_tenant_domain_uniqueness.sql` calls itself a stub requiring review even though it executes DDL; this is stale and operationally misleading prose.

## Falsification results

Verified counterexamples or risks:

- throwing rule → swallowed exception → complete snapshot may show green;
- failed DMARC DNS lookup → certain record absence;
- first-level SPF → green completeness language without dependency resolution;
- legacy DMARC `pct` still drives current output;
- no RFC 9989 fixture resolver or tree walk exists;
- coverage gap represented as a safe finding rather than setup/evidence;
- repeated queued findings can create repeated legacy alerts;
- generic record values and placeholders look executable;
- caller-supplied probe evidence can authorize a target;
- no MCP exists yet, so principal-derived actor/tenant enforcement is unproven.

## Day 0 gate

Automatically completed:

- authority, base, branch, ancestry, and Git state verified;
- all authoritative documents read;
- repository-native scripts and CI identified;
- dependencies installed with the frozen lockfile;
- lint, typecheck, deterministic tests, build, and schema drift baseline recorded;
- runtime, DNS, SPF, DMARC, rules, alerts, remediation, probes, tenant, audit, and stale-doc paths inspected;
- no Day 0 secret value was read or printed.

Missing founder inputs:

- at least four manual checks with real frequency, minutes/run, domains/run, evidence location, and keep/replace target;
- selected initial portfolio;
- purpose and criticality for every included domain;
- observation-only marker for every included production/client asset;
- selected non-production test domain, web host, mail subdomain, zone ID, and provider kind;
- confirmations that the test assets have no production/customer/mail dependency;
- scoped provider token existence, safe runtime-secret storage, secret name/fingerprint, and revocation owner;
- exact mutable names/types allowlist plus baseline/rollback path;
- previous TTL values for mutable records.

All `DNSOPS_TEST_*` variables and `DATABASE_URL` were unset in the inspected environment. No secret values were requested or exposed.

## Remaining scope within twelve engineering days

After Day 0 passes, retain this bounded sequence:

1. **Correctness foundation (4 days):** typed rule failures/UNKNOWN, snapshot partial state, authoritative limitation, first-level SPF contract, RFC 9989 parser/discovery and deterministic resolver fixtures, downgrade generic remediation.
2. **Minimal operating loop (4 days):** domain purpose/profile, bounded RDAP/TLS/HTTP/redirect/indexability evidence, setup/evidence lane, six signals, one deduplicated case lifecycle, legacy convergence, audit, six playbooks.
3. **MCP and deterministic proof (3 days):** `/mcp`, static token-hash principals/scopes, exactly ten tools including `scan_request`, idempotency/version/rate/tenant/audit negatives, application parity harness.
4. **Gate completion (1 day):** fixture matrix, authorized live harness only when Day 0 assets are ready, final validation, fresh clean-context review, evidence and handoff.

Scope expansion is not available. If correctness or the canonical operating loop exceeds these caps, lower surface breadth without weakening evaluators.

## Budget and next action

- Engineering consumed through this checkpoint: **0.5 focused day**.
- Founder time consumed: **0 hours**.
- Remaining engineering budget: **14.5 days total**, with **12 days reserved after Gate 1**.
- Remaining founder budget: **24 hours**.
- Real blocker: human-only Day 0 fields and unavailable test-asset authorization/secret presence.
- Next automatic action after founder inputs: validate the completed worksheet without reading secret values, record Day 0 PASS, then begin Gate 2 correctness work with rule-error and DNS uncertainty tests first.
