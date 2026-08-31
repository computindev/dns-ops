---
receipt: verification-receipt/v0
run_id: 20260831-232338Z-7a4c5df-fleet-reports-issue65
feature_id: fleet.reports
profile: changed
surface: web
sha: 7a4c5df6763c6ca9b1a5d8c6dfc7fe665f6eabd0
code_digest: e6a10063a643472e6e2c84e27f20c7c1bc1a96235bae9b849232e02bd30310bc
dirty: true
untracked: 3
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260831-232338Z-7a4c5df-fleet-reports-issue65
created_at: 2026-08-31T23:31:04.957Z
---

# Receipt: fleet.reports — passed

Verified fleet.reports on this exact tree through the real surfaces.

Stack: local Postgres (docker, 127.0.0.1:5433) migrated + seeded read-only
(tenants/domains/snapshots/observations/findings rows; no providers contacted,
probes disabled), web dev on :3010 and collector dev on :3011 from this
worktree; doctor.sh 5/5 ok.

API proof (POST /api/fleet-report/run via web with X-Dev-Tenant/X-Dev-Actor,
evidence fleet-report-run.json and fleet-report-live-response.json):
- stale.example (snapshot metadata without evaluation coverage) -> checks[].status unknown, pass count 0
- partial.example (PARTIAL coverage + correlated high finding) -> unknown
- uncorrelated.example (COMPLETE coverage, finding evidence cites foreign observation) -> unknown, findingsCount 0
- clean.example (COMPLETE + correlated info finding) -> pass
- broken.example (COMPLETE + correlated high finding) -> fail
- summary.spfStats = {pass:1, fail:1, warning:0, missing:0, unknown:3}; unknown-only domains do not increment domainsWithIssues.

UI proof (Playwright against the live stack, evidence
fleet-report-live-unknown.png + fleet-report-live-badges.json): the Fleet
Reports panel on /portfolio ran the report for all five seeded domains;
expanded rows render ds-badge--unknown with title=unknown for the three
unknown domains and ds-badge--success/title=pass for clean.example.
Committed e2e spec (apps/web/e2e/fleet-report.spec.ts, route-intercepted,
2 passed) additionally locks the UNKNOWN-vs-pass badge rendering.

Console noise during the live drive (console-errors.log) is pre-existing
Google Fonts CORS from the dev X-Dev-Tenant header preflight plus one 404
asset; unrelated to fleet reports and absent from the committed e2e run.

Unit/regression: focused suites 61 passed; repo vitest 2753 passed / 0
failed; collector+web lint and typecheck exit 0.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260831-232338Z-7a4c5df-fleet-reports-issue65/console-errors.log | log | aux · unrecognized .log | 44d08f9ca7b6974eec8281dea5c1e3251ed2dbfe25bdbd7dddcfeef3bddbc3e4 |
| verification/runs/20260831-232338Z-7a4c5df-fleet-reports-issue65/env.txt | env | aux | 79b4ff65c16542d9c576b2ea3e966b4d477019ea80bf9026d4cfe0e33719ecc1 |
| verification/runs/20260831-232338Z-7a4c5df-fleet-reports-issue65/fleet-report-live-badges.json | json | aux · unrecognized .json | 1f215626253231473332cb0a6cfb9b47154ce7349f87782c66c5b23ebfe4cfb2 |
| verification/runs/20260831-232338Z-7a4c5df-fleet-reports-issue65/fleet-report-live-response.json | json | aux · unrecognized .json | cbf3464e44d7d3f9c2aaa95696b3dbd7cd4079eb337c72fb8b4876bc610202a8 |
| verification/runs/20260831-232338Z-7a4c5df-fleet-reports-issue65/fleet-report-live-unknown.png | png | evidence · 1280x4412 | 5f39fe4483eced0ac2e891b87eefc010e13def16bc153d8e8fd692629cff87fb |
| verification/runs/20260831-232338Z-7a4c5df-fleet-reports-issue65/fleet-report-run.json | json | aux · unrecognized .json | 55234ce3bf0d2ebc56a9299efd1bb6d93abc6b29112b61c7b7661d85332affb7 |
