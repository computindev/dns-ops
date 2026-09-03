---
receipt: verification-receipt/v0
run_id: 20260903-225041Z-fa4a04c-fresh
feature_id: portfolio.search
profile: critical
surface: web
sha: fa4a04cc4df5a7d8e83da421e5d5af22cbda1ef8
code_digest: f9fbad92f42e524e41795653f89c4ab8e2dad25b80729de9fa3be7f49bfb3082
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "pi-fresh:01a0685f-503f-71e1-9e12-291c2fb7313b"
evidence_dir: verification/runs/20260903-225041Z-fa4a04c-fresh
created_at: 2026-09-03T23:04:49.480Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- Launch used this worktree at HEAD `fa4a04cc4df5a7d8e83da421e5d5af22cbda1ef8`; web ran on localhost:3000 against isolated `dns-ops-issue63-pg` database (`127.0.0.1:55591/dns_ops`). Doctor passed: bun present, node present, `/api/health` HTTP 200 `{"status":"healthy","service":"dns-ops-web"}`.
- Playwright real-user drive reached `/portfolio`: headings `Portfolio workflows`, `Portfolio Search`, and `Built-in views` were visible; `Query` accepted `verify-expiry`.
- Built-in button request bodies observed in `readback/built-in-view-requests.json`: Mail broken sent `findingTypePrefix:"mail."` and severities `["high","critical"]`; Expiring evidence sent `snapshotOlderThanDays:30`; Incomplete coverage sent `coverage:"incomplete"` and set `aria-pressed="true"`; re-click sent a cleared body with no view criteria.
- Browser drive seeded `verify-expiry-observed.example.test` and `verify-expiry-unknown.example.test`. Unfiltered browser search returned both; OBSERVED evidence had expiration bucket `WITHIN_90`; UNKNOWN evidence had status `UNKNOWN`. Table showed an `Expiry` column, localized date + `WITHIN_90`, and literal `UNKNOWN` for the unknown row.
- Selecting `Expiry window` = `Within 90 days` sent `expirationWithinDays:90` and returned only the observed fixture. Evidence is in `readback/portfolio-expiry.json` and `portfolio-search.png`.
- Independent HTTP read-back with the same tenant/actor headers returned 200 for unfiltered, each built-in criteria body, and expiry criteria. Returned sets were consistent: all=`mailbroken.example,stale.example,unevaluated.example`; mail-broken=`mailbroken.example,unevaluated.example`; expiring=`stale.example`; incomplete=`unevaluated.example`; expiry90 fixture result was only observed in the browser drive. Full exchanges are in `readback/direct-portfolio-search.json`.
- Saved-filter round trip through the UI persisted criteria `{expirationWithinDays:90}`, reset the select, then Load Filter restored select value `90`; independent GET `/api/portfolio/filters` returned the persisted criteria. Temporary filter was deleted via API with HTTP 200. Evidence: `readback/saved-filter-roundtrip.json`, `saved-filter-roundtrip.png`.

## Forbidden (expected → confirmed absent)
- No unauthenticated/sign-in warning was used as a successful search; all product assertions used the authenticated local e2e tenant headers and successful 200 API responses.
- Cross-tenant read-back with `X-Dev-Tenant:fresh-unrelated-tenant` returned HTTP 200 with `domains:[]`.
- Malformed search body `{limit:-1,offset:0}` returned HTTP 400 `VALIDATION_ERROR` (`limit must be at least 1`) with no write path involved.
- No class selectors were used by the product harness flow.

## Read-back
- `readback/direct-portfolio-search.json` contains concrete status, request bodies, and domain result sets for the independent POST checks.
- `readback/built-in-view-requests.json` contains concrete request bodies captured from the browser-driven button actions.
- `readback/saved-filter-roundtrip.json` records persisted filter id/criteria, restored `expiryValue:"90"`, and cleanup status 200.

Incidental non-feature issues: the dev server emitted a client CSS 404 and external Google font CORS/blocked requests; these did not prevent the portfolio route, API responses, or assertions. Two search requests were logged as aborted during React Query transitions; each corresponding final request completed with HTTP 200.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-225041Z-fa4a04c-fresh/console.log | log | aux · unrecognized .log | 2b7806bdfb8c4609216031639db20314dfcef13e83730b461240c13d81301ee0 |
| verification/runs/20260903-225041Z-fa4a04c-fresh/doctor.txt | txt | aux · unrecognized .txt | e04b82087084a16734a3457477977117baaf65fe4ae265360e4d4b267fa00c88 |
| verification/runs/20260903-225041Z-fa4a04c-fresh/env.txt | env | aux | 854623d4e6f724c07cef402df80d44326c3301ddbf152d3626b919c67b5c2252 |
| verification/runs/20260903-225041Z-fa4a04c-fresh/failed-requests.log | log | aux · unrecognized .log | 03ffd36d9859a796a52d4f7f249531c52a7d85152a052c94fb8c6e818b98142c |
| verification/runs/20260903-225041Z-fa4a04c-fresh/health-response.json | json | aux · unrecognized .json | 4f225704aca08fcf916ead3da4af87d0c08b31662c4252b9cba20db53690728b |
| verification/runs/20260903-225041Z-fa4a04c-fresh/observations.md | md | aux · unrecognized .md | fea07899ea6188f6f55190a3a98f36707ffc589e88df5ad523609684df09ea99 |
| verification/runs/20260903-225041Z-fa4a04c-fresh/portfolio-search.png | png | evidence · 1280x3564 | c245661d42ab5567b8c8bdac901ee8ff06026c3ee639a24ad95dc7fb7e6270ae |
| verification/runs/20260903-225041Z-fa4a04c-fresh/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260903-225041Z-fa4a04c-fresh/readback/direct-portfolio-search.json | readback | evidence | 91f0e8bb56381d939e0cff244b43c74524e170d4579f69423ef92bb69cb2be5d |
| verification/runs/20260903-225041Z-fa4a04c-fresh/readback/portfolio-expiry.json | readback | evidence | c33c9814864356ec139b028cf540c394e50c90fa2419d22d4329bd1e6bc04d23 |
| verification/runs/20260903-225041Z-fa4a04c-fresh/readback/portfolio-search.json | readback | evidence | 9712ac924b6255fb9e74305371c3b857f3bb702157b69d38d6841353322498d4 |
| verification/runs/20260903-225041Z-fa4a04c-fresh/readback/saved-filter-roundtrip.json | readback | evidence | fded223cb97599e0f600581ce4e76777d3e43a28b5e75fa04370ce390afca7f8 |
| verification/runs/20260903-225041Z-fa4a04c-fresh/saved-filter-roundtrip.png | png | evidence · 1280x4758 | ea3861546b2828861475d2c51baba18dac8a17a14113a8d7390aec1de126eb9c |
| verification/runs/20260903-225041Z-fa4a04c-fresh/trace.zip | trace | evidence · playwright trace | a54f3b86a8fcb8e27a6545ef0eef5b49594d6de9297d595e79f98654650640cb |
| verification/runs/20260903-225041Z-fa4a04c-fresh/video/4fd81fc3036d4ceae3cd3241b84ec31a.webm | video | evidence | 9bb4797f6f03c853582156e66db58b6381086549b38392f95b18da138a9fcc8d |
