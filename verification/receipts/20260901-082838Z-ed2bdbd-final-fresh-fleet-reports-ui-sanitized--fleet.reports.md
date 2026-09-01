---
receipt: verification-receipt/v0
run_id: 20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized
feature_id: fleet.reports
profile: critical
surface: web
sha: ed2bdbda1c82e58e4ee26733d9a27c838676d166
code_digest: 276e22d7929f5fd89dd6a4a43340dae4fd7638015604924149027c031850fed2
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-final66-local-fleet-ui-sanitized"
evidence_dir: verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized
created_at: 2026-09-01T08:29:03.338Z
---

# Receipt: fleet.reports — passed

## Observations (expected → seen)

- Signed-in `/portfolio` → **Portfolio workflows** and **Fleet Reports** rendered; the three template cards were present.
- Domain Inventory with `partial.example`, `uncorrelated.example`, `never-evaluated.example`, `clean.example`, and one missing domain plus **Mail Security Baseline** → the UI displayed report results and expanded domain details; an unknown card and a status badge with `title="unknown"` were visible.
- Authenticated `POST /api/fleet-report/run` → HTTP 200, `backedByPersistedFindings: true`, `domainsChecked: 4`, and `summary.unknownChecks: 15`.
- Partial, uncorrelated, and null-ruleset snapshots → every requested SPF/DMARC/DKIM/MX check was `unknown`; none of those unknown checks appeared in `issues`.
- Unknown-only rows → `domainsWithIssues` did not count them; the independent assertion read-back recorded `unknownOnlyDomainsExcludedFromIssues: true`.
- Unauthenticated `POST /api/fleet-report/run` → HTTP 401 with `Authentication required.`.
- Runtime `run-new` snapshot → exact product SHA `ed2bdbda1c82e58e4ee26733d9a27c838676d166`, `dirty: false`, `untracked: 0`.
- The Playwright trace started after the login credentials were submitted; credential fields are not present in the trace or HTTP/read-back evidence.

## Forbidden (must not happen → confirmed absent)

- A report must not claim a pass without persisted, correlated findings → response explicitly reported `backedByPersistedFindings: true`; incomplete/uncorrelated/null-ruleset fixtures were all UNKNOWN, never green.
- Unknown checks must not become actionable issues → all unknown-only fixture rows had empty `issues` and did not increase `domainsWithIssues`.
- Anonymous operators must not run tenant reports → unauthenticated API call was HTTP 401.
- Provider writes or external production systems must not be touched → only loopback web/collector and disposable local PostgreSQL were used; the browser evidence contains no provider request or real credential.

## Read-back (side effects checked through an independent path)

- HTTP response JSON was saved separately from the UI screenshot and records `unknownChecks`, per-domain statuses, ruleset-backed status, issue exclusion, and the anonymous 401 boundary.
- The screenshot and trace show the operator-facing Fleet Reports panel, report summary, expanded domain details, and UNKNOWN badge styling (`?`/unknown title).
- Fleet route source and tests define persisted/correlated evidence and unknown semantics; runtime read-back matched those assertions.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/console.log | log | aux · unrecognized .log | 74f442c997f3ca0140869dff653f33eb591de0f0a0c24067d9a7c329b8ee5172 |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/env.txt | env | aux | 017deffbcd80ed8a7975c9515e5e18ac8be65527b5579f85e33a94be4eda4dec |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/failed-requests.log | log | aux · unrecognized .log | b465f101b0ea1862d5f1f05871673c7d0e09e6a28a219b1455aaa62ca745361f |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/fleet-drive.log | log | aux · unrecognized .log | 47a3d308d3bdd8cb8079d3a258ee3068c0ddd42947447d042b5788c1a8767821 |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/fleet-report-summary.txt | txt | aux · unrecognized .txt | dc409674a9d7153c1d114420e79b36cfcf07aba908fdc1d8020f229fa6bf9ef2 |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/fleet-reports.png | png | evidence · 1280x4525 | a43087ab9afaaf6516d2ceb9c51b7921837deb98ff61010f1093ef5224671b60 |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/http/unauthenticated-run-401.json | http | evidence | d878aa24ca85eacc3590b488507f0e21deaec2f2ca0f3dd579a3c0331ddc9829 |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/observations.md | md | aux · unrecognized .md | e0f12f6ea14d0a8fbf9084bf5783154fc486fd51cc92d4a8f8c02d30318e4083 |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/readback/fleet-report.json | readback | evidence | 111aec070c8c8c98f5402824f8e80318a9b83ee3234c61764a5f84993415347f |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/trace.zip | trace | evidence · playwright trace | 993db506a4429a84759abd95626f55600475e247c013d501b83787ee385b6b08 |
| verification/runs/20260901-082838Z-ed2bdbd-final-fresh-fleet-reports-ui-sanitized/video/bb80a1bf574e7cc9b648b6532b6bfc68.webm | video | evidence | 9a32198f4f46a69a2358ce232a7745558cbac2ce530cdb6bb9717367f5e6eeda |
