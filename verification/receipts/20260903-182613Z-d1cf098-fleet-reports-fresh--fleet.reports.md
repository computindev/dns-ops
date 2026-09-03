---
receipt: verification-receipt/v0
run_id: 20260903-182613Z-d1cf098-fleet-reports-fresh
feature_id: fleet.reports
profile: critical
surface: web
sha: c6f9768c1cb6424a743808c406eabf7e281dc3b8
code_digest: eaa042f0feea806029e078abd252189cb01f2f839db5d476f6760cbf8a7a4e7e
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: ""
evidence_dir: verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh
created_at: 2026-09-03T20:14:01.756Z
---

# Receipt: fleet.reports — passed

## Observations (expected → seen)
- Portfolio UI `/portfolio` loaded from `/tmp/dns-ops-fresh2` with local e2e identity headers; Fleet Reports heading and all three template cards were present.
- Deterministic local UI/API fixture drive submitted `POST http://127.0.0.1:3000/api/fleet-report/run` for `stale.example`; response contained `checks[spf].status=unknown`, `summary.unknownChecks=1`, `summary.spfStats.pass=0`, `domainsWithIssues=0`, `findingsCount=0`. UI showed `Unknown checks`, `No SPF evidence persisted for stale.example`, and badge title `unknown` / `?`. Evidence: `fleet-unknown.png`, `readback/fleet-api-responses.json`, `readback/fleet-ui-state.json`.
- Deterministic complete/correlated fixture submitted the same API operation for `clean.example`; response contained `checks[spf].status=pass`, `summary.unknownChecks=0`, `summary.spfStats.pass=1`, `findingsCount=1`. UI showed `SPF present (seeded evidence)` and badge title `pass` / `✓`; no unknown badge was present. Evidence: `fleet-pass.png`, `readback/fleet-api-responses.json`.
- CSV fixture upload `domain\nimported.example\n` returned inventory `imported.example` and populated Domain Inventory. Evidence: `fleet-csv-import.png`, `readback/fleet-ui-state.json`.
- Collector Hono route truth-model fixtures and web proxy route fixtures: 3 files, 78 tests passed (`cli-fleet-api-fixtures.txt`). Canonical Playwright fleet spec: 2 tests passed (`cli-fleet-ui.txt`).

## Forbidden (…→ confirmed absent)
- No pass was emitted for the unknown/no-evidence fixture; unknown-only result had `domainsWithIssues=0` and no issues.
- No provider writes, active probes, credentials, or external fixture contacts were used. Browser drive used only deterministic route interception; collector launched with `ENABLE_ACTIVE_PROBES=false`.
- No fixed sleeps, coordinate clicks, or class selectors were used in the verification drive.

## Read-back
- `readback/fleet-api-responses.json` contains both concrete API request bodies and response summaries/statuses.
- `readback/fleet-ui-state.json` records CSV inventory and both badge/status end states.
- `doctor.txt`: web and collector healthy; 5 checks passed. Processes were confirmed with cwd `/tmp/dns-ops-fresh2` and stopped after the drive.

## Environment note
- Unrelated dev-server asset/API noise was recorded in `failed-requests.log`: `_build/assets/client.css` 404 and aborted portfolio-search requests. These did not affect the Fleet Reports route fixture or assertions.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/cli-fleet-api-fixtures.txt | transcript | evidence | b6c79c8c98b37832ac78a609f8a647b8bb22b025411174db35fe87070032c12e |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/cli-fleet-ui.txt | transcript | evidence | 074e8a3942d3b7f84f5942aca60348ba671b07b4ba09ee2035ba6e08292840ce |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/collector-launch.log | log | aux · unrecognized .log | 0fe94e02de81f3ae5d2e65b03bcf1b5f9e80554bfe546d3cab85c48faaf61ec9 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/collector-process.txt | txt | aux · unrecognized .txt | e0ca6ae259189b62b6053a31faf438040a81fe9a70b49a0279eb4dd32dcf42da |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/console.log | log | aux · unrecognized .log | 120c4d7ad082317fbb6a8b2f51eaa0a2f6614adeecf613549c38c9d7b8d0cd25 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/custom-drive.log | log | aux · unrecognized .log | 9cebcfdd9298077523cb88a85dea42008452d9d9c1a91bf574292eb7ce1ad8e2 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/env.txt | env | aux | 6f5a35d03957c4516a8cdd6f804681beb5a28a7fb131db699812de3fc65adcd1 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/failed-requests.log | log | aux · unrecognized .log | 16d0bb5f43c7cc37c4ba401100159ca7eb441f22643fc7034b9c238fce77811d |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/fleet-csv-import.png | png | evidence · 1280x3859 | f1bef303ece2462b32573109fa4d7167c24e16e711c335279b703c36e741f63e |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/fleet-pass.png | png | evidence · 1280x4106 | 84cb13f1b9cb5f00981838fc4ba6185b7762fd404bada184f110b0cdca2672cb |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/fleet-unknown.png | png | evidence · 1280x4110 | 53f0f29e70675b052f54a8b87bd36d7bf7708ecd8b5d7558013b5dac4fc2e314 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/observations.md | md | aux · unrecognized .md | 198c3d443ceb40edf1e125afcde06a9584a220b5670020e9a0cedf436d1ce935 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/readback/fleet-api-responses.json | readback | evidence | bafd60656d7761405d14a6164147af7a1359a0987796266ad79c0dbc62509886 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/readback/fleet-ui-state.json | readback | evidence | f3f85fd4a1ab36310baf1579f266f1404b32a707676ea3333e7955869e0088f2 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/trace.zip | trace | evidence · playwright trace | a02c50f7dbcb4aafe24b5b5de30503e6b6d7b3c0978cf719aad5fa61304894ca |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/web-launch.log | log | aux · unrecognized .log | 02367aad9c2905c6cd8c71cedbf0a588f899b1421bb61a0db130040167076982 |
| verification/runs/20260903-182613Z-d1cf098-fleet-reports-fresh/web-process.txt | txt | aux · unrecognized .txt | 6d207fc88eaa3fa2b7925b3b7bdc798bf8a77605ab7cc5d31ff591aac363703b |
