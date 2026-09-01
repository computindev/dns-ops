---
receipt: verification-receipt/v0
run_id: 20260901-060116Z-f3fda1f-fleet-reports-fresh-independent
feature_id: fleet.reports
profile: critical
surface: web
sha: f3fda1f54f39cecb1637eca4d76e60603aaedb55
code_digest: 682cd9831ae1d58fda95e4036a6490902dd817107c9028c20bbb3485942feea2
dirty: true
untracked: 3
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-f3fda1f-fleet"
evidence_dir: verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent
created_at: 2026-09-01T06:10:07.242Z
---

# Receipt: fleet.reports — passed

## Observations (expected → seen)

- A local web and collector stack started from this checkout with the disposable six-domain Postgres fixture, and doctor reported 5/5 checks successful → web `/api/health` was healthy, collector `/healthz` was ok, and collector `/readyz` returned an accepted 200 response.
- The real `/portfolio` surface accepted the Mail Security Baseline template and six-domain inventory, then enabled and ran Report → live `POST /api/fleet-report/run` returned HTTP 200 with `backedByPersistedFindings: true`, `domainsChecked: 6`, `domainsWithErrors: 0`, `summary.unknownChecks: 22`, `summary.domainsWithIssues: 2`, and SPF stats pass=1/fail=1/unknown=4.
- The API classified stale, partial, uncorrelated, and null-ruleset fixture snapshots as UNKNOWN-only with zero correlated findings and zero issues; clean.example had a correlated SPF PASS; broken.example had a correlated SPF FAIL.
- Expanded Fleet Reports UI read-back showed four UNKNOWN badges on each unknown-only domain, a success PASS badge on clean.example, and a danger FAIL badge on broken.example.

## Forbidden (must not happen → confirmed absent)

- No check reported PASS without complete, ruleset-backed, correlated persisted evidence → API assertions and rendered badge read-back confirmed the UNKNOWN/PASS/FAIL truth model.
- No unknown-only domain counted as an issue → all four unknown-only fixture results had `issues.length === 0`, while the aggregate reported exactly two issue domains.
- No provider, production, active-probe, credential, tracker-write, or live external-service path was used → only local web/collector processes, local fixture Postgres at 127.0.0.1:55441, and local e2e headers were used; workers and active probes were disabled.
- No fixed sleeps or fragile selectors were used by the drive → the drive used role/label selectors and semantic waits; no CSS selectors, coordinates, or fixed sleeps.

## Read-back (side effects checked through an independent path)

- `http/fleet-report-run.json` → records the live web API request/response and status 200 with persisted-findings classification and aggregate unknown counts.
- `readback/fleet-report-badges.json` → records the expanded live UI badge title/class read-back for all six fixture domains.
- `fleet-report-collapsed.png`, `fleet-report-expanded.png`, and `trace.zip` → capture the real `/portfolio` interaction and resulting report state.
- UBS review → `ubs --diff .` scanned four supported changed source files with 0 critical issues and 15 warnings; warnings are existing heuristic signals (synchronous fs in the Node test fixture and JSX component list-key false positives), while environment-variable and deep-property reports are informational test/server-context signals. `ubs --staged` reported no changed files because product edits remain unstaged.
- Safe Domain 360 preflight → `domain-preflight.txt` records 0 google.com domains, 0 resolver-identified public-recursive observations, and 6 fleet fixtures; therefore the changed-profile Domain 360 proof is honestly blocked rather than passed.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/check-ci-origin-master-final.log | log | aux · unrecognized .log | e3cf418e4e4fb266073312517bf7b884b1caf7ca7c7b3ae74238eab9496854cf |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/check-ci-origin-master.log | log | aux · unrecognized .log | e3cf418e4e4fb266073312517bf7b884b1caf7ca7c7b3ae74238eab9496854cf |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/collector-start.log | log | aux · unrecognized .log | 07905c4e0341cdc746a3c0117b9aa6076a888e21f5308bcce02eb72d00ba6b6e |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/console.log | log | aux · unrecognized .log | aabce346b0e8b425fa071f8a5bfad5ddef2b946e046ec273ab7f3e892c18d6d5 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/domain-preflight.txt | txt | aux · unrecognized .txt | 2ded95aa2a04e5ec5820ada7e361addb63840553a21c0cb52c88d3da3d76d2b2 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/domain-ttl-e2e.log | log | aux · unrecognized .log | 9af28bf6d8fe5e5103eea806081a2795ff659b2d11145b18a69e0b76f2a46534 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/drive-fleet-fresh-independent.mts | mts | aux · unrecognized .mts | 728ad6ca91de52713278325f543f92c45d496d0cd936b53256e6a2b28ca1157a |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/env.txt | env | aux | 8d98aff8568f63d8d1322f7c1d0bfbd0f7b00088563c8be9a313df0d5c92246a |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/failed-requests.log | log | aux · unrecognized .log | bbcfce3e6573d26a805e98a8b7bac33484b5d16742efd74d4eaae6d03f58b49c |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/fleet-report-collapsed.png | png | evidence · 1280x4142 | 5e2b8152365dd2f27c2aae4bd5ce83cf9cc04971c5cd0bad770aa8ede8e2795a |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/fleet-report-expanded.png | png | evidence · 1280x4538 | 05022be257a0bde20df1e6bf8aaa052a4fb6ef51d35ceb5327473d3b2329a2af |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/http/fleet-report-run.json | http | evidence | 9b4b9211546fbdcae4a6ac7f96b0e81c3e6c28d6c1d8bcf1552a97dc91f2fc47 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/observations.md | md | aux · unrecognized .md | d69c354463f5baff6d902574af9db7643a3f184940b1eb55b2175d72039da274 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/readback/fleet-report-badges.json | readback | evidence | 328f716418458488b288665f9575b4273c0b4be0c4d483bec276d71bb6c05e95 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/trace.zip | trace | evidence · playwright trace | c6ff5c14edc072e34f3db00ddb4a7631daeed801dfd4ce6e0fbd0ecf8e0b0f80 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/ubs-diff.log | log | aux · unrecognized .log | 8ce72fa6bbe8a2700ac3b61931d607d14920424981bd708b701c8943ab35f6db |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/ubs-staged.log | log | aux · unrecognized .log | 4198859668c08229143701811f5380b5ffadeaabdedc7e5354104d06289f4074 |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/verify-kit-regression.log | log | aux · unrecognized .log | 5cdab69f7498d902af6844f191ed3e6c776bbc2730549b34a354be45c4571bad |
| verification/runs/20260901-060116Z-f3fda1f-fleet-reports-fresh-independent/web-start.log | log | aux · unrecognized .log | 3c3f70c0c88c1be82c06ba5b362d6789cb14a1aa249b62ca2c752608a36c6134 |
