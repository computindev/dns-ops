---
receipt: verification-receipt/v0
run_id: 20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3
feature_id: portfolio.search
profile: critical
surface: web
sha: 8017ec5b7edc8e31515a432f7c94dd9d83453f01
code_digest: 2588d58491c1cae1d0f055899578b6a111a588e0a3d9a959f72d256d435caca2
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3
created_at: 2026-09-03T22:48:13.922Z
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
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/console.log | log | aux · unrecognized .log | 8a51a20a2e7c6eefe99c4ad69dd3f1ba34191089a4234044d0b9497b607cbed0 |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/env.txt | env | aux | 256fe329a4c466b71173e40a637d5a4e6f347a785f50b54ec46b88dcc80b24c4 |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/failed-requests.log | log | aux · unrecognized .log | 90d46cd8a7c5a1115fb3e8da91ca8af72fc641dab7303ac255c4a270b01f4bfb |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/observations.md | md | aux · unrecognized .md | 3326f2c98d0d584220530c613f1a5fc6af0611ed220fde0e68f74357e3626521 |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/portfolio-search.png | png | evidence · 1280x3564 | 53369e61e786ade50443e56be2f7ce074ff1d130cc6db662360a0e90b3c961c1 |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/readback/portfolio-expiry.json | readback | evidence | 9d3e14a7a5b8744d6bf3c335a71bb8728e3d77cb06dd61d0ed339831fa352cfa |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/readback/portfolio-search.json | readback | evidence | 68132f3a990a365c55b967c5b81d73dbfcc9ef73b594bdc7126b1338c0c21a24 |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/trace.zip | trace | evidence · playwright trace | 20ee423c776ea76bef10f28aab718b056b95da4db0611a8eb585b89f1d0b9581 |
| verification/runs/20260903-224732Z-ac43b22-issue60-portfolio-expiry-rebased-v3/video/ed83cb686d7fa8c95d4cefdec72fad4f.webm | video | evidence | d8d72698a717af081e36e6d25444a8ab9c5701b31c2ca6e0ca4ff6e58a3284f9 |
