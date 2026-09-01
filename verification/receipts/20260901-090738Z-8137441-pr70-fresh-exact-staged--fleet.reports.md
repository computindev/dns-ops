---
receipt: verification-receipt/v0
run_id: 20260901-090738Z-8137441-pr70-fresh-exact-staged
feature_id: fleet.reports
profile: critical
surface: web
sha: 8137441799fd5fc9492a774fb4f8293c28038f74
code_digest: 28f35e8afaf4110f8ff52143a2c8a68a6ca3da62001796a180c6ef5c7abfa003
dirty: true
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-pr70-exact-staged-tree-fleet"
evidence_dir: verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged
created_at: 2026-09-01T09:15:14.142Z
---

# Receipt: fleet.reports — passed

## Observations (expected → seen)

- A fresh verifier drove the real local `/portfolio` Fleet Reports workflow against the staged PR #70 candidate using local web and collector services, an isolated disposable PostgreSQL container (`dns-ops-pr70-fresh`), a synthetic six-domain fixture, `ENABLE_ACTIVE_PROBES=false`, and local e2e tenant headers. No provider, production, or live DNS system was used. Doctor/readiness passed.
- The submitted Mail Security Baseline report returned HTTP 200 with `backedByPersistedFindings: true`, six domains checked, zero domain errors, `summary.unknownChecks: 22`, and `summary.domainsWithIssues: 2`. SPF stats were pass=1, fail=1, unknown=4.
- `stale.example`, `partial.example`, `uncorrelated.example`, and `never-evaluated.example` rendered UNKNOWN for all four checks and had no issues. `clean.example` rendered SPF PASS from a correlated persisted info finding. `broken.example` rendered SPF FAIL from a correlated persisted high finding.
- CSV import returned 200; unauthenticated report access returned 401; malformed inventory returned 400; a foreign tenant could not read fixture rows; duplicate report submissions returned normalized-equivalent results.

## Forbidden (must not happen → confirmed absent)

- No check reported PASS without complete, ruleset-backed, correlated persisted findings evidence. Unknown-only domains did not increment `domainsWithIssues`.
- No provider, production, credential, active-probe, tracker-write, or external live-service path was used. Browser requests were restricted to the local web service.
- No CSS selectors, coordinate clicks, fixed sleeps, or test/debug endpoints were used by the Fleet Reports drive.

## Read-back (side effects checked through an independent path)

- `http/fleet-report-run.json` records the live local API request/response and status 200 with persisted-findings classification and unknown counts.
- `readback/fleet-report-adversarial.json` records CSV, authentication, malformed-input, tenant-isolation, and duplicate-request checks.
- `readback/fleet-report-badges.json` records rendered status/title/class read-back for all 24 check badges. `readback/fleet-fixture-db.json` independently records six domains, six snapshots, three findings, and one synthetic resolver-identified public-recursive observation per fixture domain.
- `fleet-report-collapsed.png`, `fleet-report-expanded.png`, and `trace.zip` capture the real UI workflow. The only captured browser failures were the known dev `/_build/assets/client.css` 404 and blocked external font requests; they did not affect the report result.
- Focused collector security/fleet/route tests passed (11 files, 399 tests); focused web Fleet Reports tests passed (2 files, 6 tests); collector typecheck passed; `lint-map --fresh`, `ubs --diff .`, and `ubs --staged` completed with exit 0.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/collector-typecheck.log | log | aux · unrecognized .log | a4138f5e5ee88130541d25638a6117c3244ee7cb8a2c7d83d79510f42c5e818f |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/console.log | log | aux · unrecognized .log | aa3a45dc162e4963ba8472baf098e07a5c067e9414cee5224abfd4b41e444e98 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/env.txt | env | aux | 63ff57fcbec60fb1733de7180736702ccc241c6a8241de3f1d7c4f9169d78825 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/failed-requests.log | log | aux · unrecognized .log | 9129561e47f5b0e13758910cc1e280895523978dcc0e65e0c05ac5497c9b1ebc |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/fleet-api-summary.json | json | aux · unrecognized .json | ea1ec627015d523dcd7e399da542532622f051607884970ffb86c14d8e4a127f |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/fleet-report-collapsed.png | png | evidence · 1280x4142 | 0883e21d74a5740c49480b0393397198d07bc8c9b9a378683b9db3f2ebb156a5 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/fleet-report-expanded.png | png | evidence · 1280x4538 | 7ce1beb62bf6168525533d4f94986df3b1637d0ccc4c15b90f1c38cad179fdc8 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/fleet-surface-summary.json | json | aux · unrecognized .json | 7ebbcdf5dd70cae4dd708b3deb90ec2c556e499e3670f93b5d2514d5f7f918ed |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/focused-collector-security-fleet-route.log | log | aux · unrecognized .log | 089d60c8e356b8342c3ccf3a94661a345d1f95b6699116cfc1665dc558c14a2d |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/focused-web-fleet-route.log | log | aux · unrecognized .log | dbb6e431aa485a371dbc2f091838e22556ed2cc7f74a2e96aaca730814d70eb1 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/http/fleet-report-run.json | http | evidence | 1cb695d77a53a7a3c5c040def3ac495c7d79a7c33fd4473cea5cc7c4f3558f3d |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/lint-map-fresh.log | log | aux · unrecognized .log | cdb5cf5a44b08b50dd2223c80a3f8a976e791aef827ac857f9c96a3edbf01d32 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/readback/fleet-fixture-db.json | readback | evidence | 5c4db3d26933e2beff67a2f705d4040f488da44c9b56df01ecbbbd04c8a5db77 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/readback/fleet-report-adversarial.json | readback | evidence | d5b3e203c452bd3be83aa2d50ad910c6b1dac73b46a245f390b64ea57406cb12 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/readback/fleet-report-badges.json | readback | evidence | cd2f8d4f5a1eb1ab131091a5872bfaac16ce3e311361c041d89cd7a6902c25d4 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/trace.zip | trace | evidence · playwright trace | afc6a4f3ce65d25f2ca892e1bf1d9733206ac30ed4eb76946b4debd815942e5d |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/ubs-diff.log | log | aux · unrecognized .log | 04fa2a3b98f82ada7c7292dfb785b404f16157672cc74aad71ae418ec92001a6 |
| verification/runs/20260901-090738Z-8137441-pr70-fresh-exact-staged/ubs-staged.log | log | aux · unrecognized .log | b24073aff0b577278921f9d9a5eb398e89b8d0c2185b31d39d937c40e94d382a |
