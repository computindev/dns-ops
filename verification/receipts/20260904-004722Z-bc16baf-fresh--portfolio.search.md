---
receipt: verification-receipt/v0
run_id: 20260904-004722Z-bc16baf-fresh
feature_id: portfolio.search
profile: critical
surface: web
sha: bc16baf7395e6746a976183a103c884820237709
code_digest: 83c8e17a2ab7b3fb8268fd508060118e84c129b5f1ed436f61a8916af0e01ab8
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "pi-fresh:01a0685f-503f-71e1-9e12-291c2fb7313b"
evidence_dir: verification/runs/20260904-004722Z-bc16baf-fresh
created_at: 2026-09-04T00:53:51.707Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- Doctor expected healthy web surface → `.agents/skills/verify-dns-ops/harness/doctor.sh` reported `web /api/health 200 healthy` (3/3 checks passed).
- `/portfolio` expected headings and controls → Playwright drive reached `Portfolio workflows`, `Portfolio Search`, `Built-in views`, labeled `Query`, and `Expiry window` options `Any`, `Within 7 days`, `Within 30 days`, `Within 90 days`.
- Query expected to POST successfully → filling `Query` with `verify-expiry` produced HTTP 200 and `domains[]`; both seeded domains were returned. Observed domain had expiration `status=OBSERVED`, and the final table rendered `WITHIN_90`; unknown-evidence domain rendered literal `UNKNOWN` in the Expiry cell.
- Built-in views expected to send criteria and toggle state → captured requests in `readback/built-in-view-requests.json`: Mail broken sent `findingTypePrefix=mail.` and `severities=[high,critical]`; Expiring evidence sent `snapshotOlderThanDays=30`; Incomplete coverage sent `coverage=incomplete` and its button had `aria-pressed=true`; clicking it again sent a request without `coverage`.
- Expiry filter expected to send `expirationWithinDays=90` and filter server-side → response was HTTP 200 with only `verify-expiry-observed.example.test` (total 1); unknown domain was absent. Full response is in `readback/portfolio-expiry.json`.

## Forbidden (expected absent → confirmed absent)
- Unauthenticated search must not be treated as success → direct POST without dev identity returned HTTP 401 `{error:"Unauthorized",message:"Authentication required."}` in `http/no-auth-search.txt`; unauthenticated browser drive rendered `Operator sign-in is required to search tenant domains and load saved filters.`
- Cross-tenant leakage → same valid body with `X-Dev-Tenant: other-tenant` returned HTTP 200 with `domains:[]`, `total:0` in `http/adversarial-other-tenant.txt`; no dns-ops-e2e domain was returned.
- Malformed input must not partially execute → `{bad-json` returned HTTP 400 `{error:"Invalid JSON in request body",code:"INVALID_JSON"}` in `http/adversarial-malformed.txt`.
- Class selectors were not used by the drive; selectors were ARIA labels/roles.

## Read-back
- Direct POST read-back with the same authenticated headers and each view criterion returned HTTP 200: `direct-mail.txt` returned `mailbroken.example` and `unevaluated.example`; `direct-expiring.txt` returned `stale.example`; `direct-incomplete.txt` returned `unevaluated.example`. These are consistent with the view criteria and button-driven request bodies.
- Duplicate identical POSTs returned HTTP 200 twice with the same three domain IDs/names and `total=3` (`http/adversarial-duplicate-1.txt`, `http/adversarial-duplicate-2.txt`), demonstrating no mutation or divergent result.
- Harness read-backs are persisted in `readback/portfolio-search.json`, `readback/portfolio-expiry.json`, and `readback/built-in-view-requests.json`. The expiry fixture cleanup was confirmed independently with a database count of zero after the drive.
- Browser evidence: `portfolio-search.png`, `no-auth-portfolio.png`, and `trace.zip`.

## Residual
- Console/failed-request logs contain expected dev noise: external Google font CORS failures, a missing dev CSS asset (404), and one aborted superseded search request; the asserted requests and final UI state completed successfully. No product assertion failed.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260904-004722Z-bc16baf-fresh/console.log | log | aux · unrecognized .log | 5078b2b6883d7638c35ce2f3215dc049c11c375908784d53331683d01f756f7c |
| verification/runs/20260904-004722Z-bc16baf-fresh/doctor.txt | txt | aux · unrecognized .txt | 291b74911bf6dfd21a1053e0e8228c479187272578439eb81b5a8d36a6fd7e6c |
| verification/runs/20260904-004722Z-bc16baf-fresh/env.txt | env | aux | 5cd0a4b6005a357b5b3a0efe8be25b9c5c3d894c01ceaf51c3b6b7a10c2a09e1 |
| verification/runs/20260904-004722Z-bc16baf-fresh/failed-requests.log | log | aux · unrecognized .log | 11c6474a36d1577f83cd0d5c0f96e03f9ceb83e4ec93a86de8c2d087dc829ada |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/adversarial-duplicate-1.txt | txt | aux · unrecognized .txt | bc6bdef723e1a09747f45074ad861eee3d3189fbb5a81fa5fa95162bc3fcbf06 |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/adversarial-duplicate-2.txt | txt | aux · unrecognized .txt | bc6bdef723e1a09747f45074ad861eee3d3189fbb5a81fa5fa95162bc3fcbf06 |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/adversarial-malformed.txt | txt | aux · unrecognized .txt | ba5ed96d1ca8469dee2e9cda4fde141478e6e96237279c1a2928e182d71c3d2b |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/adversarial-other-tenant.txt | txt | aux · unrecognized .txt | b4059de196f83f3fa71bde6df066b5768a2f69e9f3d98645ab96a52dd188610e |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/direct-expiring.txt | txt | aux · unrecognized .txt | 74db6122ef231fc8cc9b4b3bc91852d2b6e3ef16defbbf1343ebc76fcf3adeae |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/direct-incomplete.txt | txt | aux · unrecognized .txt | 253d9d59c53eea3b1171a297b6ca4652703d2e7b058b4a926c47f80827464eef |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/direct-mail.txt | txt | aux · unrecognized .txt | 0a0b6fd00cc4789555c5c8febb55bd909074dfe87b30b37bfb4f98172896aa7d |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/no-auth-portfolio.html | html | aux · unrecognized .html | b32b4349f1b25443942ad9e931440460839805770ea47e43b9232c9e25c5a4dd |
| verification/runs/20260904-004722Z-bc16baf-fresh/http/no-auth-search.txt | txt | aux · unrecognized .txt | 027f7f7b1df93150b1f5fd11425eed6592f03059dc169160d1561b96183c7a07 |
| verification/runs/20260904-004722Z-bc16baf-fresh/no-auth-portfolio.png | png | evidence · 1280x3825 | 3e467aa1e1acf9fae5f5cea2143f5b0fd14f8fe26f6cd5613f473f4e310bd428 |
| verification/runs/20260904-004722Z-bc16baf-fresh/observations.md | md | aux · unrecognized .md | 4e52b3dd54d6668a6868c4777a0ffe25645da1d63bdbbcef7e5d7cd83d5f8053 |
| verification/runs/20260904-004722Z-bc16baf-fresh/portfolio-search.png | png | evidence · 1280x5899 | 34c6b7335a1a969e39cedc00c0ddb0bf5271e9ce46cf5a7fb6a1c82c5320d911 |
| verification/runs/20260904-004722Z-bc16baf-fresh/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260904-004722Z-bc16baf-fresh/readback/portfolio-expiry.json | readback | evidence | 88fbc8f687724cdde4bd4b334283aabdf287c7828ef032fe8eb55d786d232c2a |
| verification/runs/20260904-004722Z-bc16baf-fresh/readback/portfolio-search.json | readback | evidence | ae1de13db09f970ed1087d1024d88773ba75da9784814310fa11dc2c3fd60b5e |
| verification/runs/20260904-004722Z-bc16baf-fresh/trace.zip | trace | evidence · playwright trace | f14951714ed66306cc3ae216f6f8609644da4a09a466a730b8c7eb37e87ba0f7 |
| verification/runs/20260904-004722Z-bc16baf-fresh/video/524a8e6356137dc4ceee189feea1dd16.webm | video | evidence | af61557ec3c122ced76933d54a3097afd16b3e9d5518fe65448c618bd80d54b5 |
| verification/runs/20260904-004722Z-bc16baf-fresh/video/75844fec0f528eaf4d07bab099eb228b.webm | video | evidence | d0365d35abce0451f4027efdf0e231326cb44eef490987bf23a43db18aa00842 |
