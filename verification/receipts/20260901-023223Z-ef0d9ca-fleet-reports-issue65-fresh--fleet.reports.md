---
receipt: verification-receipt/v0
run_id: 20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh
feature_id: fleet.reports
profile: critical
surface: web
sha: ef0d9cac0ed6781239325a1c2478e270d8636b7e
code_digest: 134a427d611b1c1335efb9bdca55dd6f672d9dcc2df4ac59bc1c7b016735b293
dirty: true
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-verifier-issue65"
evidence_dir: verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh
created_at: 2026-09-01T02:37:42.588Z
---

# Receipt: fleet.reports — passed

# Observations — fleet.reports fresh verification

## Expected observations

- The local web and collector services started from this checkout and passed health/readiness checks.
- A real `/portfolio` drive selected Mail Security Baseline, submitted six tenant-scoped fixture domains, and rendered a non-zero collapsed `Unknown` summary.
- The real `POST /api/fleet-report/run` response returned HTTP 200, `summary.unknownChecks: 22`, `spfStats.pass: 1`, `spfStats.fail: 1`, and `spfStats.unknown: 4`.
- The response classified stale, partial, uncorrelated, and null-ruleset snapshots as UNKNOWN; a complete correlated info finding as PASS; and a complete correlated high finding as FAIL.
- The expanded UI rendered UNKNOWN badges for stale/partial/uncorrelated/never-evaluated domains, a PASS badge for clean.example, and a FAIL badge for broken.example. Unknown-only domains did not increment `domainsWithIssues`.

## Forbidden observations

- No check reported PASS without a complete, ruleset-backed, correlated persisted finding.
- No provider, production, active-probe, or tracker-write path was used.
- No fixed sleeps or fragile selectors were used in the drive.

## Read-back

- `http/fleet-report-run.json` captures the live web API request/response and its status.
- `readback/fleet-report-badges.json` captures the expanded live UI badge statuses per domain.
- `fleet-report-fresh.png` and `trace.zip` capture the resulting real `/portfolio` surface.
- The only failed request was the pre-existing development CSS asset 404 (`/_build/assets/client.css`); it did not affect the Fleet Reports surface.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/console.log | log | aux · unrecognized .log | e40e84484fb37fa0d2010c14cee4cf57483a1f8306daa83654f03a1e9b2c39cc |
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/env.txt | env | aux | 0646e7b50ffc2a1252108c4cabbce5e761e67ec27ddde6f160286b8f2766db44 |
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/failed-requests.log | log | aux · unrecognized .log | 002a952fbb91d4f5a976ed96b3e2e913bd9e3bce335b7a7d58a5eec1fa5ab2cf |
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/fleet-report-fresh.png | png | evidence · 1280x4538 | 6bfa63811bee04401f3dfa709f85da587798ac32b5c46109e4332ef4e1117d8d |
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/http/fleet-report-run.json | http | evidence | 1e252b8b7e67daf62f06dbbd0c24688e7682c0804c302280b5e0cf4028b4c4e6 |
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/observations.md | md | aux · unrecognized .md | 898b99789dabcb34b029b6ee558c6a86a21536a5ecb141127b747a8df6e2f126 |
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/readback/fleet-report-badges.json | readback | evidence | b61dc3593f50f4f6ee4ceb8554999704e1fa84f64e546beb695f6a7c152e830a |
| verification/runs/20260901-023223Z-ef0d9ca-fleet-reports-issue65-fresh/trace.zip | trace | evidence · playwright trace | daabb53de21c215de26601e945d9767000644a6e524fbd30060d1841b410293b |
