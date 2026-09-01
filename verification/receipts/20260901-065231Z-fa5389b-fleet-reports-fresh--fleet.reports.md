---
receipt: verification-receipt/v0
run_id: 20260901-065231Z-fa5389b-fleet-reports-fresh
feature_id: fleet.reports
profile: critical
surface: web
sha: fa5389b4a0b9e2ef0ab3b2842d7a26998d9c6588
code_digest: f542e06d54c8b9b56e14478c8839bf0787568e74095260e3bfc9a305c94148da
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-fa5389b-exact-staged-tree"
evidence_dir: verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh
created_at: 2026-09-01T06:55:49.359Z
---

# Receipt: fleet.reports — passed

## Observations (expected → seen)

- A fresh verifier drove the local web and collector services from the exact staged product tree, using a disposable six-domain PostgreSQL fixture at `127.0.0.1:55441` with active probes and workers disabled. Doctor reported 5/5 checks successful: web `/api/health` healthy, collector `/healthz` ok, and `/readyz` accepted.
- The real `/portfolio` surface selected Mail Security Baseline, entered six fixture domains, and ran Report. Live `POST /api/fleet-report/run` returned HTTP 200 with `backedByPersistedFindings: true`, `domainsChecked: 6`, `domainsWithErrors: 0`, `summary.unknownChecks: 22`, `summary.domainsWithIssues: 2`, SPF pass=1/fail=1/unknown=4.
- The API classified stale, partial, uncorrelated, and null-ruleset snapshots as UNKNOWN-only with zero correlated findings and zero issues; `clean.example` had a correlated SPF PASS; `broken.example` had a correlated SPF FAIL.
- Expanded Fleet Reports UI read-back showed four UNKNOWN badges on each unknown-only domain, a success PASS badge on `clean.example`, and a danger FAIL badge on `broken.example`.

## Forbidden (must not happen → confirmed absent)

- No check reported PASS without complete, ruleset-backed, correlated persisted evidence; API assertions and rendered badge read-back confirmed the UNKNOWN/PASS/FAIL truth model.
- No unknown-only domain counted as an issue; all four unknown-only fixture results had `issues.length === 0` while the aggregate reported exactly two issue domains.
- No provider, production, active-probe, credential, tracker-write, or external live-service path was used. Only local web/collector processes, the disposable local fixture database, and local e2e headers were used.
- No fixed sleeps, CSS selectors, coordinates, or test/debug API endpoints were used by the drive.

## Read-back (side effects checked through an independent path)

- `http/fleet-report-run.json` records the live web API request/response and status 200 with persisted-findings classification and aggregate unknown counts.
- `readback/fleet-report-badges.json` records the expanded live UI badge status/title read-back for all six fixture domains.
- `fleet-report-collapsed.png`, `fleet-report-expanded.png`, and `trace.zip` capture the real `/portfolio` interaction and resulting report state.
- `doctor.txt` records the health/readiness checks. The only unrelated captured failures are the dev CSS asset 404 and Google Fonts CORS noise caused by local development headers; they did not affect the Fleet Reports request or rendered result.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/console.log | log | aux · unrecognized .log | aabce346b0e8b425fa071f8a5bfad5ddef2b946e046ec273ab7f3e892c18d6d5 |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/drive-fleet-current.mts | mts | aux · unrecognized .mts | 4ce2ab5eee34eefb4420db98e318758583c1562139bdbfa899ebe5f04920653a |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/drive-fleet.log | log | aux · unrecognized .log | 7088da42a6b1b39d31089e2a8e9199ba40e77eec41e3cbfb05642936da7350c3 |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/env.txt | env | aux | 5cdb2b73a6249665fb3dd066a39fb222913e22950fc28c53aceadb8d76ebdc97 |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/failed-requests.log | log | aux · unrecognized .log | bbcfce3e6573d26a805e98a8b7bac33484b5d16742efd74d4eaae6d03f58b49c |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/fleet-report-collapsed.png | png | evidence · 1280x4142 | d7a95b4953a7b80061cbfef70052583f8428dced2470bbc070ca69275dc3ed69 |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/fleet-report-expanded.png | png | evidence · 1280x4538 | e139b65ea64d051ac5878fe50495ba6d25d77b4a94903ae802576202c6b22877 |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/http/fleet-report-run.json | http | evidence | 7bd0dc9dba12ade72baf4b57d10f6cd8edac4620ee038940333085e96ae2dc58 |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/observations.md | md | aux · unrecognized .md | ff92a87c4fa0bbf2dd4b3c4aac47c831fe38d08d75071ef796d92d2b856e1bec |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/readback/fleet-report-badges.json | readback | evidence | 328f716418458488b288665f9575b4273c0b4be0c4d483bec276d71bb6c05e95 |
| verification/runs/20260901-065231Z-fa5389b-fleet-reports-fresh/trace.zip | trace | evidence · playwright trace | 1d33d05cb2d6ccc614876fad85214fcf2054612988dd713bac45b60caf68722a |
