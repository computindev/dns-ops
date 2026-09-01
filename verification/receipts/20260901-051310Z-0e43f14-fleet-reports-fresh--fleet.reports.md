---
receipt: verification-receipt/v0
run_id: 20260901-051310Z-0e43f14-fleet-reports-fresh
feature_id: fleet.reports
profile: critical
surface: web
sha: 0e43f146eb57b805370370d45ece0705f28d2a9e
code_digest: f1eba15392d05f8fac237aa00a149ad60112a2b516aaf3d8b9b919f3ff5ccdc0
dirty: true
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-pr71-0e43f146"
evidence_dir: verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh
created_at: 2026-09-01T05:17:11.130Z
---

# Receipt: fleet.reports — passed

## Observations (expected → seen)

- Fresh local services started from this checkout at `http://127.0.0.1:3020` (web) and `http://127.0.0.1:3021` (collector), with doctor 5/5 healthy and collector readiness `ready`.
- The real `/portfolio` flow selected **Mail Security Baseline**, entered six local fixture domains, ran the report, and showed the collapsed Unknown summary before disclosure.
- The live `POST /api/fleet-report/run` returned HTTP 200 with `backedByPersistedFindings: true`, `domainsChecked: 6`, `domainsWithErrors: 0`, `summary.unknownChecks: 22`, `domainsWithIssues: 2`, SPF `{pass: 1, fail: 1, warning: 0, missing: 0, unknown: 4}`.
- `stale.example`, `partial.example`, `uncorrelated.example`, and `never-evaluated.example` returned UNKNOWN for all four requested checks, zero correlated findings, and zero issues. `clean.example` returned a correlated SPF PASS; `broken.example` returned a correlated SPF FAIL.
- Expanded UI read-back captured four UNKNOWN badges for each unknown-only domain, a PASS badge with success styling for `clean.example`, and a FAIL badge with danger styling for `broken.example`.

## Forbidden (must not happen → confirmed absent)

- No PASS was emitted without complete, ruleset-backed, correlated persisted evidence.
- No provider, production, active-probe, tracker-write, or live external service path was used; `ENABLE_ACTIVE_PROBES=false` and workers were disabled.
- No fixed waits, CSS selectors, coordinate clicks, or test/debug API endpoints were used by the drive.

## Read-back (side effects checked through an independent path)

- `http/fleet-report-run.json` records the real web API request/response; `readback/fleet-report-badges.json` records the rendered status/title/class read-back.
- `fleet-report-collapsed.png` and `fleet-report-expanded.png` capture the real `/portfolio` surface; `trace.zip` captures the Playwright drive.
- The only unrelated captured failures were the dev CSS asset 404, aborted initial portfolio-search request, and Google Fonts CORS noise caused by local dev headers; the Fleet Reports request and rendered report passed.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/collector-start.log | log | aux · unrecognized .log | 764d609339073912f6a68e77cb88890f6ce6d89cbcf7326416b7ea5e15d564ab |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/console.log | log | aux · unrecognized .log | a4349121fd8419465054cc6de2717b3b25ceef2bd9d1e405dc583f921f32db6a |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/doctor.txt | txt | aux · unrecognized .txt | 21d6ab735ac488852a9234411093dfffd3510d7c4ae65541af0491febaa3bc62 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/drive-fleet-fresh.mts | mts | aux · unrecognized .mts | 0ca88700ba46e2bd423b87ea647bff8695453a1c68a6d01a2e949d2b2b0edc02 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/env.txt | env | aux | d22920c8c0dccfad7c48f20dd1358168f626ffd180ab1dda358bb121fdb4d6b2 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/failed-requests.log | log | aux · unrecognized .log | 2b3d45fa956fab67cef1f7944d9caabf83cb484427f96053ec931312625fb2e8 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/fleet-focused-tests.log | log | aux · unrecognized .log | bf7f8fc48c1d23e4df99db890fd2aecfa32fc417c347af919b67388db05d3375 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/fleet-report-collapsed.png | png | evidence · 1280x4142 | d8dbe33bb7b5e28855280e754ec3e2c9dcb3aba95077f26f6aaee69579075a88 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/fleet-report-expanded.png | png | evidence · 1280x4538 | 472060520aecb88aed509d0d6b4289d068d0460e6efaadad915493e60ce30bb4 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/http/fleet-report-run.json | http | evidence | afc17bc8c49e401f24dfcbf9139deb43c7a113dbbd25c3f00912b6e5f74730fc |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/observations.md | md | aux · unrecognized .md | 077a72fb8fe51fd1cdd60e9685d999f36e35483b523a1356ac5280d05f3b7162 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/processes.txt | txt | aux · unrecognized .txt | 79d3c61c0754d74e81014de05dee3ae2f681f0260a2f13d2c52ae13456498cf5 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/readback/fleet-report-badges.json | readback | evidence | 328f716418458488b288665f9575b4273c0b4be0c4d483bec276d71bb6c05e95 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/repository-tests.log | log | aux · unrecognized .log | 979bcfccb9950e003866f4a788d79e28ff5515160b6704cd062d63e91ed46967 |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/trace.zip | trace | evidence · playwright trace | af494eafdd83c2be09599a5a6df7025a1dc35ec40b7c18bf5318504937b635fc |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/verify-kit-tests.log | log | aux · unrecognized .log | d196938d9cdb85c36042084a20a3116b5fe5fc90c2265ff8d3c9adb2b2ca5f2b |
| verification/runs/20260901-051310Z-0e43f14-fleet-reports-fresh/web-start.log | log | aux · unrecognized .log | 2582f76575b28053b7ecb5ae693566915ad3f092c3a4b6362446bb0e7a884bb7 |
