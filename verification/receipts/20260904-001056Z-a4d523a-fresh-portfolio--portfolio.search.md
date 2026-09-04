---
receipt: verification-receipt/v0
run_id: 20260904-001056Z-a4d523a-fresh-portfolio
feature_id: portfolio.search
profile: critical
surface: web
sha: a4d523ab341e10508495c6aa7f9c3c269dc2f872
code_digest: 86f6edf038037f19ac824aa20f11a41e2f07eadffde8be556f13f23ef0d42c65
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "pi-fresh:01a0685f-503f-71e1-9e12-291c2fb7313b"
evidence_dir: verification/runs/20260904-001056Z-a4d523a-fresh-portfolio
created_at: 2026-09-04T00:19:02.358Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- `/portfolio` rendered headings `Portfolio workflows`, `Portfolio Search`, and `Built-in views`; Query accepted `verify-expiry` and returned HTTP 200 JSON with `domains[]`.
- Built-in view clicks issued HTTP 200 `POST /api/portfolio/search`: Mail broken body had `findingTypePrefix: "mail."` and `severities: ["high","critical"]`; Expiring evidence had `snapshotOlderThanDays: 30`; Incomplete coverage had `coverage: "incomplete"`. Incomplete button exposed `aria-pressed="true"`; clicking it again issued a body without `coverage` and cleared the active view.
- Direct read-back POSTs with identical criteria returned: mail broken `[mailbroken.example, unevaluated.example]`; expiring `[stale.example]`; incomplete `[unevaluated.example]`. This matches the seeded tenant data and preserves unevaluated domains for the finding-prefix view.
- Expiry window options read from the real select were `Any`, `Within 7 days`, `Within 30 days`, and `Within 90 days`. Selecting 90 sent `expirationWithinDays: 90`; the 90-day response contained `verify-expiry-observed.example.test` with expiration status `OBSERVED`, bucket `WITHIN_90`, and excluded the unknown fixture. The rendered table showed `Expiry` and `UNKNOWN` for `verify-expiry-unknown.example.test`.
- Saved-filter round trip through the real UI persisted criteria `{expirationWithinDays: 30}` for `Fresh expiry roundtrip`; Load restored select value `30`. The disposable saved filter was deleted and verified absent afterward.

## Forbidden (expected → confirmed absent)
- No sign-in warning was used as a successful search; authenticated local e2e headers produced 200 responses and tenant-scoped results.
- Other tenant header returned HTTP 200 with `domains: []`; unauthenticated POST returned HTTP 401; malformed `expirationWithinDays: 999` returned HTTP 400 `VALIDATION_ERROR` with no write path.
- Duplicate identical incomplete-coverage POSTs both returned HTTP 200 with the same single domain and no mutation.
- No class selectors were used by the drives.

## Read-back
- Evidence files: `readback/portfolio-search.json`, `readback/built-in-view-requests.json`, `readback/direct-view-requests.json`, `readback/portfolio-expiry.json`, `readback/expiry-options.json`, `readback/saved-filter-roundtrip.json`, `readback/adversarial-search.json`, `readback/duplicate-search.json`.
- Doctor passed against this checkout's app on `http://localhost:3333`: `/api/health` returned HTTP 200 `{"status":"healthy","service":"dns-ops-web"}`.
- The browser drive also logged dev-server asset/font noise (`/_build/assets/client.css` 404 and blocked external font requests) plus one superseded POST marked `net::ERR_ABORTED`; the required search responses and all assertions completed successfully.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/console.log | log | aux · unrecognized .log | efd20de83fb0376e5d3c3600342e8675f1dc7981c954c6a0ec85076a205857fc |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/doctor.txt | txt | aux · unrecognized .txt | 291b74911bf6dfd21a1053e0e8228c479187272578439eb81b5a8d36a6fd7e6c |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/env.txt | env | aux | 0efa560fdc230615a1f24c825773b335c49ec02653bed5c21946b0562066f662 |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/failed-requests.log | log | aux · unrecognized .log | 78d69756eceb84be6d644320df169b0bb697e27145d7c3712a7bdfe2f60c6f61 |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/observations.md | md | aux · unrecognized .md | 0fecdae60b3acfe0588f43faa221b5fd8b3e383e3928bb7f502e2b6c4b84d425 |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/portfolio-search.png | png | evidence · 1280x5229 | b717e5e0d0fa7d39b53cbe634b2ef8382ff3cbe4cdb74a98f426c441979256de |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/readback/adversarial-search.json | readback | evidence | a60545faadc6bd61642c710ece1fdd6999d9a7f4f9858f1643dc96c90852a7f9 |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/readback/direct-view-requests.json | readback | evidence | 2e6e84d5925eb507be52aee5cc11a7262e6d6b2477e0fd74106f8752f0c5719d |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/readback/duplicate-search.json | readback | evidence | 9ce49dac5f6798165adab7ae0b3d7c6e1115b190a9b1eafc91ae00c7f4fc6fea |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/readback/expiry-options.json | readback | evidence | 5f37f81e709df22446a7d1918907891e8376c1e6630a7e807dfcddb21a52f7ba |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/readback/portfolio-expiry.json | readback | evidence | 7b3c3dc4153cd633dc3c6d300a21fda2979adab6729026431f92432971bd2a98 |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/readback/portfolio-search.json | readback | evidence | 6101b5252044de7f3a61d19189c41919b2787c51b7c6adc0c401171a25249be4 |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/readback/saved-filter-roundtrip.json | readback | evidence | a6ef0c145e0a9a62ec4ec704875d077b6b912cf7c98ee12db33cb3f38094f0b3 |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/saved-filter-roundtrip.png | png | evidence · 1280x5345 | 2b4449f08a29497d922182caa2b49963ac1f7f2b89545d16ffad714ea052905d |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/trace.zip | trace | evidence · playwright trace | 73420994f486e6d42f746022016601ae94a25f49520c875d70c05848448ee36f |
| verification/runs/20260904-001056Z-a4d523a-fresh-portfolio/video/015e65e0fd1b1c20a6a2bb044807bf0b.webm | video | evidence | 22318da63bd1d46cfbf27a148a05a78cdb6ba11a02eaeaa8326cecc1a07677e9 |
