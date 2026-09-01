---
receipt: verification-receipt/v0
run_id: 20260901-074832Z-4063b7c-pr70-fleet-fresh-independent
feature_id: fleet.reports
profile: critical
surface: web
sha: 4063b7c14c185be971f274032a3412797c0fe38c
code_digest: 6eabeb229cbd6284fd634486bdd49d9595208ce4d27f81546751908d4a341433
dirty: true
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-pr70-exact-staged-tree"
evidence_dir: verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent
created_at: 2026-09-01T08:05:19.868Z
---

# Receipt: fleet.reports — passed

## Observations (expected → seen)

- A fresh verifier drove the real local `/portfolio` Fleet Reports workflow against the staged PR #70 candidate using local web and collector services, a disposable six-domain PostgreSQL fixture, active probes disabled, and local e2e tenant headers. Doctor/readiness checks passed.
- The submitted Mail Security Baseline report returned HTTP 200 with `backedByPersistedFindings: true`, six domains checked, zero domain errors, `summary.unknownChecks: 22`, and `summary.domainsWithIssues: 2`. SPF stats were pass=1, fail=1, unknown=4.
- `stale.example`, `partial.example`, `uncorrelated.example`, and `never-evaluated.example` rendered UNKNOWN for all four checks and had no issues. `clean.example` rendered SPF PASS from a correlated persisted finding. `broken.example` rendered SPF FAIL from a correlated persisted finding.
- CSV import returned 200; unauthenticated report access returned 401; malformed inventory returned 400; a foreign tenant could not read the fixture rows; duplicate report submissions returned deterministic equivalent results.

## Forbidden (must not happen → confirmed absent)

- No check reported PASS without complete, ruleset-backed, correlated persisted evidence. Unknown-only domains did not increment `domainsWithIssues`.
- No provider, production, credential, active-probe, tracker-write, or external live-service path was used.
- No CSS selectors, coordinate clicks, fixed sleeps, or test/debug endpoints were used by the real-surface drive.

## Read-back (side effects checked through an independent path)

- `http/fleet-report-run.json` records the live API request/response and status 200 with persisted-findings classification and unknown counts.
- `http/fleet-report-adversarial.json` records CSV, authentication, malformed-input, tenant-isolation, and duplicate-request checks.
- `readback/fleet-report-badges.json` records the rendered status/title/class read-back for all domains, and `readback/fleet-fixture-db.json` records the disposable fixture rows.
- `fleet-report-collapsed.png`, `fleet-report-expanded.png`, and `trace.zip` capture the real UI workflow. The captured local-dev failures are limited to the known `/_build/assets/client.css` 404, blocked external font requests, and one aborted portfolio-search request; they did not affect the report result.
- Focused collector security/fleet/route tests passed (11 files, 399 tests), and focused web Fleet Reports tests passed (2 files, 6 tests). `lint-map --fresh` passed.
- UBS completed with findings concentrated in test fixtures and request-body size warnings: hardcoded test-secret literals at `apps/collector/src/jobs/monitoring.test.ts:36,60,75`, `Math.random` fixture IDs at `apps/collector/src/jobs/fleet-report.test.ts:503,795`, and unbounded body parsing warnings at `apps/collector/src/jobs/fleet-report.ts:40,197`. These are recorded as review residuals; no product files were changed during verification.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/console.log | log | aux · unrecognized .log | aa3a45dc162e4963ba8472baf098e07a5c067e9414cee5224abfd4b41e444e98 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/env.txt | env | aux | 6dd5c2736ac264515fb557d013d09a74e505b989fb7e5e43404c0447067b5834 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/failed-requests.log | log | aux · unrecognized .log | 9129561e47f5b0e13758910cc1e280895523978dcc0e65e0c05ac5497c9b1ebc |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/fleet-api-summary.json | json | aux · unrecognized .json | ea1ec627015d523dcd7e399da542532622f051607884970ffb86c14d8e4a127f |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/fleet-report-collapsed.png | png | evidence · 1280x4142 | 08181d74de434238f5a285e28cc9471c0a0a7b9b2d8132cbc6e9eac57703b460 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/fleet-report-expanded.png | png | evidence · 1280x4538 | 6005f5698a302e01a9de8f2204f62270d703e34a25a1ec7735abbc5de528d925 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/fleet-surface-summary.json | json | aux · unrecognized .json | 7ebbcdf5dd70cae4dd708b3deb90ec2c556e499e3670f93b5d2514d5f7f918ed |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/focused-collector-security-fleet-route.log | log | aux · unrecognized .log | c5e9cb37b2072b90e0f1501a7c06fa30ca1e8c9c6151d343363a0f5963ac7034 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/focused-web-fleet-route.log | log | aux · unrecognized .log | e954533e6eb397144b22084d53a8729953029233e8f4e2426dbf436539653201 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/http/fleet-report-run.json | http | evidence | c8d075deb5296d91cc2199b61509c12ff151565a5c5d59c6a9c9f30ed7c13f6d |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/lint-map-fresh.log | log | aux · unrecognized .log | 3046d1ffbfbb241819d2e1212cabb075382afdf1c1085091a7dd2055132d380d |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/readback/fleet-fixture-db.json | readback | evidence | 8d0c2ac7f97720ef540c8a1db7477a499304814bc0a7c959eccaf072c74d755d |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/readback/fleet-report-adversarial.json | readback | evidence | 169fb9680d0c2f8a0c31b4f56fb431c519bf679f2c86debecba20aa7c6c5e1d7 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/readback/fleet-report-badges.json | readback | evidence | 3b84d67f9b3405b2218e3c27c364ca345980861bbe789d279fa0614d9576012c |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/trace.zip | trace | evidence · playwright trace | 9b97f690f5110f809259a1bc83aedc6952d35e70af9601468b518aaba6f59a64 |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/ubs-diff.log | log | aux · unrecognized .log | 763c13d42abeaf26ca881a5ae40404dc2c0f74c3520625a9f05360ac7727f1eb |
| verification/runs/20260901-074832Z-4063b7c-pr70-fleet-fresh-independent/ubs-staged.log | log | aux · unrecognized .log | 519db428871f20afffd35bfbe485d47f90e4e78956a70273ec6df9299c8b2eb4 |
