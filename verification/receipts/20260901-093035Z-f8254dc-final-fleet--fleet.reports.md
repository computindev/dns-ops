---
receipt: verification-receipt/v0
run_id: 20260901-093035Z-f8254dc-final-fleet
feature_id: fleet.reports
profile: critical
surface: web
sha: f8254dc9143c8e12dfa7b2bc8e38f9bf7109715e
code_digest: ba8b0a0068efbcc82e351a6db480d965fd98f511c5aec310c888b56f74879a6f
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-final-f8254dc-fleet"
evidence_dir: verification/runs/20260901-093035Z-f8254dc-final-fleet
created_at: 2026-09-01T09:39:16.892Z
---

# Receipt: fleet.reports — passed

## Observations (expected → seen)

- Independent fresh verification used exact product SHA `f8254dc9143c8e12dfa7b2bc8e38f9bf7109715e` from a clean isolated worktree. Local web and collector services ran from that checkout on ports 3320/3321, with a dedicated disposable PostgreSQL 15 fixture on port 55468, `ENABLE_ACTIVE_PROBES=false`, and local development tenant headers.
- Doctor/readiness passed. The real `/portfolio` Fleet Reports flow displayed Fleet Reports, selected Mail Security Baseline, accepted six inventory domains, submitted Run Report, and rendered the report details.
- The local API response was HTTP 200 with `backedByPersistedFindings: true`, six domains checked, zero domain errors, `summary.unknownChecks: 22`, `summary.domainsWithIssues: 2`, and SPF stats pass=1, fail=1, unknown=4.
- `stale.example`, `partial.example`, `uncorrelated.example`, and `never-evaluated.example` were UNKNOWN for all four requested checks with no issues. `clean.example` had a correlated info finding and SPF PASS. `broken.example` had a correlated high finding and SPF FAIL. The UI read-back captured 24 badges: four UNKNOWN-only domain cards, one PASS SPF badge, and one FAIL SPF badge.

## Forbidden (must not happen → confirmed absent)

- No check reported PASS without complete, ruleset-backed, correlated persisted evidence. UNKNOWN-only checks did not increment `domainsWithIssues`.
- No provider, production, credential, active-probe, tracker-write, or external live-service path was used. Browser routing allowed only the local web service; external font requests were aborted.
- No CSS selector or coordinate click was used for actions, and no fixed sleep was used for an end state.

## Read-back (side effects checked through an independent path)

- `http/fleet-report-run.json` records the real local API request/response and report summary.
- `http/fleet-report-adversarial.json` records CSV import HTTP 200, unauthenticated run HTTP 401, malformed inventory HTTP 400, foreign-tenant isolation (HTTP 200 with zero results and one error), and duplicate submissions HTTP 200/200 with normalized-equivalent results.
- `readback/fleet-report-badges.json` records status titles and styling for every rendered badge. `readback/fleet-fixture-db.json` independently records six fixture domains, six snapshots, three findings, and one successful resolver-identified public-recursive observation per domain.
- `fleet-report-collapsed.png`, `fleet-report-expanded.png`, and `trace.zip` capture the real UI workflow. The only captured local-dev failures were the known `/_build/assets/client.css` 404 and blocked external font requests; neither affected report behavior.
- Focused collector security/webhook/fleet tests passed: 11 files, 399 tests. Focused web Fleet Reports tests passed: 2 files, 6 tests. DNS collector tests passed: 5 files, 33 tests, with 6 opt-in live tests skipped because live DNS was disabled.
- Contracts build and collector typecheck passed. `lint-map --fresh`, selector lint, `ubs --diff .`, and `ubs --staged` passed; UBS correctly reported no changed files in the clean product tree.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-093035Z-f8254dc-final-fleet/collector-typecheck.log | log | aux · unrecognized .log | 5618ab8479c8adda76a6b3a4362b45f35343dfd8ebedea8d45f9059aac57d6c0 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/console.log | log | aux · unrecognized .log | aa3a45dc162e4963ba8472baf098e07a5c067e9414cee5224abfd4b41e444e98 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/contracts-build.log | log | aux · unrecognized .log | 5cb2a0c734ac4447ba5f0dc8d5eccfaaef21c67e3697feb2c5de9d1708c66bfd |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/env.txt | env | aux | 69e19c39b615e189e4f66b9adbd8601d2025338f2fbafaceeb8168e1faff7b71 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/failed-requests.log | log | aux · unrecognized .log | ede3947e7b6d3bf4e71f038c675c85a43d48cd5932a58648dc006d4cca4a5190 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/fleet-report-collapsed.png | png | evidence · 1280x4142 | 32ca7a3b007f3129d67d24c316bef1a83965b6dcd424ba644196e527c62dfb04 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/fleet-report-expanded.png | png | evidence · 1280x4538 | 39f0b11493d21409106261a97af1705ae555c49991553f776bdd3a3b70a0156a |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/fleet-surface-summary.json | json | aux · unrecognized .json | 9d22f16d5e9853246fde07d0853cd4fb898c883535163578b116fee8cea82e9f |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/focused-collector-security-fleet-route.log | log | aux · unrecognized .log | f074f63c4f1b19f09b04e792285f0c801fb8eb61e7dcb37fb07d5a3e3f72f972 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/focused-web-fleet-route.log | log | aux · unrecognized .log | 4705dc4c513c38d100bedb922eb574810dae49ca81a1a0d2ccc03171bc78bc45 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/http/fleet-report-run.json | http | evidence | 93ff0c570ea87fb113950b6d43a2683b9875dc6a8f35d32f8db6c0ae576d018c |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/lint-map-fresh.log | log | aux · unrecognized .log | ae3dc7cdc3c9c317427c9da75ac7fcac5d3febdfcb401004fafd13e05981eb53 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/lint-selectors.log | log | aux · unrecognized .log | 46be362b670640d992d85f81f04572005863157997b44896f74020646362e5dc |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/observations.md | md | aux · unrecognized .md | ad0c969bfd7dfd6b87066ee40cc53f67a3c5bf4834b132a6715ab3ef333e983c |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/readback/fleet-fixture-db.json | readback | evidence | 5c4db3d26933e2beff67a2f705d4040f488da44c9b56df01ecbbbd04c8a5db77 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/readback/fleet-report-adversarial.json | readback | evidence | 477ae195b0879942dc8cba403d7e170a6a4b115a7c61aac41667d3eb9a093802 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/readback/fleet-report-badges.json | readback | evidence | 723a0e394e2364b279f9128cb436545640474635755683f536e71b6fbc1a481e |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/trace.zip | trace | evidence · playwright trace | 68924c575489c22b65394279067ab2ea9e6d7bc1e64c1389144d0a9db3bb232e |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/ubs-diff.log | log | aux · unrecognized .log | 4198859668c08229143701811f5380b5ffadeaabdedc7e5354104d06289f4074 |
| verification/runs/20260901-093035Z-f8254dc-final-fleet/ubs-staged.log | log | aux · unrecognized .log | 4198859668c08229143701811f5380b5ffadeaabdedc7e5354104d06289f4074 |
