---
receipt: verification-receipt/v0
run_id: 20260903-223822Z-ac43b22-issue60-portfolio-expiry
feature_id: portfolio.search
profile: critical
surface: web
sha: 7a4c5df6763c6ca9b1a5d8c6dfc7fe665f6eabd0
code_digest: fcb7cbd42b2806c10d62e992b4770a50c1cb030ec2eacb9c50aebc12ed226d62
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry
created_at: 2026-09-03T22:40:31.169Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- `/portfolio` showed **Portfolio workflows** and **Portfolio Search** → confirmed in the captured page screenshot.
- Query accepted input and returned a real authenticated `POST /api/portfolio/search` response → readback contains seeded domains and HTTP-200 response.
- Expiry window select offered Any / Within 7 days / Within 30 days / Within 90 days and drove `expirationWithinDays` requests → confirmed by the expiry drive assertions and rendered controls.
- Results rendered an Expiry column → screenshot and drive completed against the real page.
- Seeded RDAP `RDAP_EXPIRATION` OBSERVED evidence rendered as `WITHIN_90` with date; domain without usable RDAP evidence rendered `UNKNOWN` → `readback/portfolio-search.json` records `verify-expiry-observed.example.test` as OBSERVED / WITHIN_90 and the unknown fixture as UNKNOWN.
- `trace.zip` records the browser interaction and network responses; doctor health was HTTP 200 healthy.

## Forbidden (… → confirmed absent)
- Sign-in warning used as success → absent; local e2e tenant/actor headers returned authenticated seeded results.
- Class selectors → harness uses semantic roles/labels and the feature drive completed without class selectors.
- Expiry derived from findings or DOMAIN_EXPIRING_SOON → response readback shows the RDAP_EXPIRATION evidence projection.

## Read-back
- `readback/portfolio-search.json` contains the real response and seeded fixture metadata.
- `trace.zip`, `portfolio-search.png`, and `video/*.webm` are captured from the live drive.
- `console.log` and `failed-requests.log` were captured; no feature assertion failed.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry/console.log | log | aux · unrecognized .log | a0cab3bf0f0596bc8ea77a62a530e64af97583143d4dd910637770cd11f5eac4 |
| verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry/env.txt | env | aux | e7acd8acbda8812ff8b34719751b73a20bee47be357ceb4f90c69b76ad4b4794 |
| verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry/failed-requests.log | log | aux · unrecognized .log | 22a0d187afeeb20718e46536f713d8d2914b2ad56af6c56bef75636a6707d813 |
| verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry/observations.md | md | aux · unrecognized .md | a65fac13edcbde8e5542a3f031755249633004fa31085209b342dfc7f95a5985 |
| verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry/portfolio-search.png | png | evidence · 1280x3749 | 4d49b60cdcb086bb7eac169e05fe5020d13f5fe22b4e2baabb91d3a8f7816d6d |
| verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry/readback/portfolio-search.json | readback | evidence | 7f601b2a17c909ce5a1c988e5c33d89ef3f30ee79f5913ec6fd090f0613da7db |
| verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry/trace.zip | trace | evidence · playwright trace | 851f6a9c3f05a32d59073160041fdbfee406512fc71e44ba202c0d83a1a4f034 |
| verification/runs/20260903-223822Z-ac43b22-issue60-portfolio-expiry/video/c9670882c40a748765bddc9cc70d8e52.webm | video | evidence | f002f71f803841502167298cb686e8048c639e33755b5bb02d4274b6772cf785 |
