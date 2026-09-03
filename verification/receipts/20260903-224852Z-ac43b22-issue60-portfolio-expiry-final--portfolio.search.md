---
receipt: verification-receipt/v0
run_id: 20260903-224852Z-ac43b22-issue60-portfolio-expiry-final
feature_id: portfolio.search
profile: critical
surface: web
sha: 70710c98bcc582fe981705fd9cff01c8de4f08bc
code_digest: f9fbad92f42e524e41795653f89c4ab8e2dad25b80729de9fa3be7f49bfb3082
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final
created_at: 2026-09-03T22:49:25.469Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- `/portfolio` showed **Portfolio workflows**, **Portfolio Search**, and **Built-in views**; Query accepted `verify-expiry` → confirmed by the live drive.
- Search returned the seeded observed and unknown domains with HTTP 200 → `readback/portfolio-search.json` records both fixture domains.
- Observed RDAP expiration rendered in the Expiry column as `WITHIN_90`; the no-RDAP domain rendered literal `UNKNOWN` → confirmed by semantic table assertions.
- Selecting Expiry window `Within 90 days` issued a real POST carrying `expirationWithinDays: 90` and retained only the observed fixture → captured in `readback/portfolio-expiry.json`.
- Built-in Mail broken, Expiring evidence, and Incomplete coverage buttons issued their expected request criteria; active Incomplete coverage toggled off and cleared its criteria → captured in `readback/built-in-view-requests.json`.
- Browser screenshot, video, and Playwright trace were captured; web health returned HTTP 200 healthy.

## Forbidden (… → confirmed absent)
- Sign-in warning used as success → absent; local e2e tenant/actor headers returned authenticated seeded results.
- Class selectors → no class selectors were used by the harness assertions.
- Expiry derived from findings or `DOMAIN_EXPIRING_SOON` → response projection came from RDAP expiration evidence.

## Read-back
- `readback/portfolio-search.json` and `readback/portfolio-expiry.json` contain real response JSON.
- `readback/built-in-view-requests.json` records exact built-in request bodies.
- `trace.zip`, `portfolio-search.png`, `video/*.webm`, `console.log`, and `failed-requests.log` are present.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/console.log | log | aux · unrecognized .log | 0b6e00138fbe3f5a0986bed9914bbad821a78f3d9c186b38aa944a37d42bd2b5 |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/env.txt | env | aux | c18598f46b414cdaae2b9f3145f9906c6ae5f47276b7bf72097edfa377b5705f |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/failed-requests.log | log | aux · unrecognized .log | 0b081f395f9aae60ed0e743fc21f9d0e0bb9248a2d87bf52863668f4a59680bf |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/observations.md | md | aux · unrecognized .md | 3326f2c98d0d584220530c613f1a5fc6af0611ed220fde0e68f74357e3626521 |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/portfolio-search.png | png | evidence · 1280x3564 | a9ff50e3b5ae29b7490c07e37e5cbfa17138955704297ba27269f690fe13b20c |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/readback/portfolio-expiry.json | readback | evidence | cdc94224c63634bed4a8c34bcc1310c384a128fa9ccdd7db67234fdb7fc2870d |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/readback/portfolio-search.json | readback | evidence | 39802419aaa6da4bb160de2698784f65ba5f95707a2653658eaf9e02c81f77f5 |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/trace.zip | trace | evidence · playwright trace | 5abf177026f2c10b6d663dba2e055481106c00f958ce74c70025d26185f02584 |
| verification/runs/20260903-224852Z-ac43b22-issue60-portfolio-expiry-final/video/9ea854fc4e373591c3efbdbb8363d51d.webm | video | evidence | ed5bcf42f3e2f95787214da31cb7c29409e46bb16ca412cd2f6b66a2549f6f2a |
