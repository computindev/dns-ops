---
receipt: verification-receipt/v0
run_id: 20260903-205226Z-d5355e4-portfolio-search-fresh
feature_id: portfolio.search
profile: critical
surface: web
sha: d5355e457d0567d477cb739032f6cd04e60527bc
code_digest: bd89fd98569139bfa605c47ca195156cfc4217ad7c843099438483d465bf3fc6
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: ""
evidence_dir: verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh
created_at: 2026-09-03T20:55:25.730Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- `/portfolio` showed **Portfolio workflows**, **Portfolio Search**, **Built-in views**, and the labeled **Query** field.
- Filling Query with `example.com` completed a real `POST /api/portfolio/search` and returned HTTP 200 JSON with `domains` (3 seeded domains; empty is also valid).
- Clicking **Mail broken** issued a real POST with `findingTypePrefix: "mail."` and `severities: ["high", "critical"]`; response contained `mailbroken.example` and `unevaluated.example` (unevaluated domain retained).
- Clicking **Expiring evidence** issued a real POST with `snapshotOlderThanDays: 30`; response contained only `stale.example`, whose latest snapshot is older than 30 days.
- Clicking **Incomplete coverage** issued a real POST with `coverage: "incomplete"`; response contained only `unevaluated.example`, whose coverage is PARTIAL.
- The active Incomplete coverage button exposed `aria-pressed="true"`; clicking it again issued a real POST without `coverage` and returned all 3 domains.

## Forbidden (… → confirmed absent)
- Sign-in warning was not used as success; local e2e tenant/actor headers produced authenticated seeded results.
- No class selectors were used by the harness.

## Read-back
- `readback/portfolio-search.json` records the Query response: HTTP-200 JSON `{ domains: [...], total: 3, limit: 20, offset: 0 }`.
- `readback/built-in-view-requests.json` records the exact button-driven request bodies, including the cleared request without view criteria.
- Playwright trace response bodies independently show the server-filtered sets: mail view 2 domains, expiring view 1 domain, incomplete view 1 domain, cleared query 3 domains.
- `doctor.txt` reports web health HTTP 200 healthy.

Ancillary dev-server evidence: the run logged a missing `/_build/assets/client.css`, blocked external font CORS requests, and expected aborted superseded search requests; these did not affect the verified page, endpoint responses, or feature assertions. The E2E harness completed successfully on the final drive.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/console.log | log | aux · unrecognized .log | 5ca1a50a649db81b351b7ca95451293a160e9b463db35f4bb79530039dc0a279 |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/doctor.txt | txt | aux · unrecognized .txt | 291b74911bf6dfd21a1053e0e8228c479187272578439eb81b5a8d36a6fd7e6c |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/env.txt | env | aux | 6fb7eeeebed0f9fef853c6f17b8f21ac0e789a6831598cb66f70655661d1ab84 |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/failed-requests.log | log | aux · unrecognized .log | febfe11d41c63a8dd1062ce5f6b3ae1cba3de0e48b4b63b7ab2be30d8df3ed0a |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/observations.md | md | aux · unrecognized .md | bdc3fe7e3b0ebff012dad973619d8d746b91b49494da81b55fb0d23f01ecec85 |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/portfolio-search.png | png | evidence · 1280x3748 | d5a71ca73a3a756df2f84d19da116aa14fad690e2d0aca8b68f8c56174af616c |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/readback/portfolio-search.json | readback | evidence | d4a7d88aa0fb1ab92fbba699262bca53c72c473a7a8cd1434f3f2268acadd0fb |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/trace.zip | trace | evidence · playwright trace | 0e80d340ebca278f3ff4f30fd1c131636e9140367dbd97957a08a35d76d5aacc |
| verification/runs/20260903-205226Z-d5355e4-portfolio-search-fresh/video/1cce1919aae9cae370f0f7f01bfb38c6.webm | video | evidence | c59e824e8ee613da399e725a96f3d0829cd61a455e8f533269ed216fa98177a2 |
