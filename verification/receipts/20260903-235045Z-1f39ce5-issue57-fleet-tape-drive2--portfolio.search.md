---
receipt: verification-receipt/v0
run_id: 20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2
feature_id: portfolio.search
profile: critical
surface: web
sha: 1f39ce5cc08dfce4c11b74ca640750cbde055742
code_digest: dbd13625f482f2a78784e80b14ca33e81837e8be439df2e4547360f396458fdc
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2
created_at: 2026-09-03T23:51:26.314Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- `/portfolio` showed **Portfolio workflows**, **Portfolio Search**, and **Built-in views**; the Query field accepted input → confirmed by the live drive on this tree (which also renders the new 24h fleet tape panel).
- Filling Query fired a real `POST /api/portfolio/search` returning HTTP 200 JSON with `domains[]` → readback captured.
- **Mail broken** button issued a real POST with `findingTypePrefix: "mail."` and `severities: ["high","critical"]` → captured in `readback/built-in-view-requests.json`.
- **Expiring evidence** issued a real POST with `snapshotOlderThanDays: 30`; **Incomplete coverage** with `coverage: "incomplete"` and the button exposed `aria-pressed="true"`; re-activation cleared view criteria (`cleared` body carries no view fields) → captured.
- Server-side filtering was observed via per-view result sets in the Playwright trace; doctor reported web health HTTP 200 healthy before the drive.
- This drive validates the `portfolio.search` surface affected by the issue #57 diff: `apps/web/app/routes/portfolio.tsx` (new FleetTapePanel mount) and `apps/web/hono/routes/portfolio.ts` (new GET `/api/portfolio/tape` appended after the search handler). The fleet tape endpoint itself is additionally covered by focused route-level unit tests (`apps/web/hono/lib/fleet-tape.test.ts`) and the auth-policy matrix.

## Forbidden (… → confirmed absent)
- Sign-in warning used as success → absent; local e2e tenant/actor headers returned authenticated results.
- Class selectors → harness used semantic roles/labels.
- Deriving expiry from findings or DOMAIN_EXPIRING_SOON → not applicable on this tree; no expiry code paths were changed by issue #57.

## Read-back
- `readback/portfolio-search.json` and `readback/built-in-view-requests.json` contain real response/request JSON.
- `trace.zip`, `portfolio-search.png`, `video/*.webm`, `console.log`, and `failed-requests.log` captured from the live drive.

## Notes
- First drive attempt hit the known 15s wait-for-response flake on the "cleared" roundtrip (cold HMR compile); second drive passed deterministically. Harness on this tree is unchanged from HEAD.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/console.log | log | aux · unrecognized .log | a0cab3bf0f0596bc8ea77a62a530e64af97583143d4dd910637770cd11f5eac4 |
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/env.txt | env | aux | b58addac65b70d0172fed419933fad69bc8fdb5cab2fd8c76b1c10ef93406210 |
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/failed-requests.log | log | aux · unrecognized .log | b9e491cd746b92f16e4e7b1909811b2b8e50481aa97709ac440e66a0d67fece1 |
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/observations.md | md | aux · unrecognized .md | 5a14f429a5427db3e41f9765b721967e20fd54f3bd9fe45bd54fe080cbca8182 |
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/portfolio-search.png | png | evidence · 1280x5339 | 50cee44ec05d0cf1331948b8fa4db6f2bd3f3dfdf7a3a8dab52489064d5992d6 |
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/readback/portfolio-search.json | readback | evidence | d4a7d88aa0fb1ab92fbba699262bca53c72c473a7a8cd1434f3f2268acadd0fb |
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/trace.zip | trace | evidence · playwright trace | 7c96827940eb335ec5baf1fbd40bee85a17b213d7fdc07988c319f596b840b34 |
| verification/runs/20260903-235045Z-1f39ce5-issue57-fleet-tape-drive2/video/c21758a5e6782b30ac901b6ea1b816e5.webm | video | evidence | 55a3eab87b64d6c6cca610af4730acbdb8d67976e617c860f129556188cf5962 |
