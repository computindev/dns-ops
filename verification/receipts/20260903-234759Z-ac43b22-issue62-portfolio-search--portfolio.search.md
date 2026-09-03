---
receipt: verification-receipt/v0
run_id: 20260903-234759Z-ac43b22-issue62-portfolio-search
feature_id: portfolio.search
profile: critical
surface: web
sha: 1f39ce5cc08dfce4c11b74ca640750cbde055742
code_digest: 7de3be972652e1cbb2dd7db97a82735958b14daca1e786fdc22432f003cf5646
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search
created_at: 2026-09-03T23:50:24.132Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- `/portfolio` showed **Portfolio workflows**, **Portfolio Search**, **Built-in views**, and the new **Live drills** panel (10 panels in the workspace) → confirmed by the live drive on port 3312.
- Query accepted `example.com` and completed a real `POST /api/portfolio/search` returning HTTP 200 JSON with `domains` → recorded in `readback/portfolio-search.json`.
- Built-in **Mail broken**, **Expiring evidence**, and **Incomplete coverage** buttons each issued a real POST with their exact view criteria; active Incomplete coverage exposed `aria-pressed="true"`; re-click cleared its criteria → recorded in `readback/built-in-view-requests.json`.
- Expiry fixture rendered: observed RDAP `WITHIN_90` bucket and no-evidence `UNKNOWN` in the Expiry column; selecting **Within 90 days** sent `expirationWithinDays: 90` and retained only the observed fixture → recorded in `readback/portfolio-expiry.json`.
- Live drills read API returned the real manifest surface: `available: true`, manifest `ASORIN-AI-CONTROLLED-LIVE-01-03`, zone `asorin.ai`, five allowlisted tuples; unauthenticated request returned 401 (verified out-of-band via curl before the drive).
- Browser screenshot, video, and Playwright trace captured; doctor-equivalent health check returned HTTP 200 healthy.

## Forbidden (… → confirmed absent)
- Sign-in warning used as success → absent; local e2e tenant/actor headers returned authenticated seeded results.
- Class selectors → harness uses semantic roles/labels only.
- Expiry derived from findings or `DOMAIN_EXPIRING_SOON` → response projection came from RDAP expiration evidence.
- Non-allowlisted domains offered for drills → tuples come only from the checked-in manifest; drill POST body carries only `mutationId`.

## Read-back
- `readback/portfolio-search.json`, `readback/built-in-view-requests.json`, and `readback/portfolio-expiry.json` contain real response JSON.
- `trace.zip`, `portfolio-search.png`, `video/*.webm`, `console.log`, and `failed-requests.log` are present.
- Ancillary: one transient superseded `POST /api/portfolio/search` abort occurred during the first drive attempt (cleared-view step) and the retried drive completed cleanly; a missing `/_build/assets/client.css` and blocked external font CORS requests in the log did not affect any verified assertion.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/console.log | log | aux · unrecognized .log | fb1c5280b2ded51c27990451770a18fece409e5a72096e5e6bbf6df0e68a84d0 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/failed-requests.log | log | aux · unrecognized .log | f6402713f7645cc2822734ae80ff55f3e237097309b38674aad3e11e501ffb0a |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/observations.md | md | aux · unrecognized .md | 90753d8d899ba27cb29a3fd66607c8c869920522d8c6681311b08bb8cc6b3566 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/portfolio-search.png | png | evidence · 1280x5587 | 08c43762553de90390a6484068c49566202c6f3330b1dae7f75cfede4c805778 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/readback/portfolio-search.json | readback | evidence | d4a7d88aa0fb1ab92fbba699262bca53c72c473a7a8cd1434f3f2268acadd0fb |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/trace.zip | trace | evidence · playwright trace | 6371bf15539509ed4a9ebcbff7c445eef15d19a9081e2ae3a6d106597c3dcf09 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/video/eb84b68ea3e333ae2d5a6119d0ad48cf.webm | video | evidence | e9fa31096d64e6b4f45e719b9e012117fe27f3b9d2851f1d75f3fe54a98c0848 |
