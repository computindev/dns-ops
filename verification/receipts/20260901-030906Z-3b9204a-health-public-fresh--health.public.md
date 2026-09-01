---
receipt: verification-receipt/v0
run_id: 20260901-030906Z-3b9204a-health-public-fresh
feature_id: health.public
profile: changed
surface: api
sha: 3b9204a4306bf17e477022b491dd035d1d2d1712
code_digest: d8d15a8c15358ed3c0c9bcf794aca8774dd42fec165e2e33cc9d5054c20145f0
dirty: true
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-local-web:3002+collector:3011+isolated-postgres"
evidence_dir: verification/runs/20260901-030906Z-3b9204a-health-public-fresh
created_at: 2026-09-01T03:17:30.627Z
---

# Receipt: health.public — passed

# health.public — fresh verification observations

Independent fresh verifier session against receipt-only HEAD `3b9204a4306bf17e477022b491dd035d1d2d1712`. Product code was not changed. The web and collector services ran locally from this checkout on loopback addresses with an isolated disposable PostgreSQL container; no production service, provider, or real credential was contacted.

## Public health drive (harness/api.mts, unauthenticated)

- Web `GET /api/health` returned HTTP 200 with `status: healthy` and `service: dns-ops-web` (`http/01-web-health.json`).
- A second unauthenticated web request returned the same healthy status class (`http/02-readback-web-health.json`, `readback/web-health.json`).
- Collector `GET /healthz` returned HTTP 200 with `status: ok` (`http/03-collector-healthz.json`).
- Collector `GET /readyz` returned HTTP 200 with `status: ready` and a successful database check (`http/04-collector-readyz.json`).
- Web and collector revision fields matched the exact HEAD SHA in each response.

## Focused tests

- Web health route and URL-resolution suites passed: 10 tests plus 1 intentional unit-test skip; disposable-Postgres integration passed: 7 tests.
- Collector health/readiness suite passed: 9 tests plus 2 intentional unit-test skips; disposable-Postgres integration passed: 11 tests.
- Database readiness ping suite passed: 9 tests.

## Forbidden observations and safety

- No authentication headers were used for the public health requests.
- Public responses contained no secrets, connection strings, driver details, or database error messages.
- Active probes and provider/DNS egress were disabled; all runtime state was local and disposable.
- The doctor run reported 5 checks ok and 0 failed.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/env.txt | env | aux | 7b672770786ac8f1b72bcb175fa697ccdc4287c635518edae4d5ebdce5078f34 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/focused-collector-health-integration.log | log | aux · unrecognized .log | a5b473f5fc7c421e0f03421acce0c3554a9eb2e4fcfbba9006175022fe963dbb |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/focused-collector-health.log | log | aux · unrecognized .log | 238166249ace7c3219d87a984941a827ffd2c0a158fa4eb24e781ae2b263f377 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/focused-db-ping.log | log | aux · unrecognized .log | 7c040da87fcfe337e8b5e8bc006a45a8b8b455913fe28c6f02823d6a2b712942 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/focused-web-health-integration.log | log | aux · unrecognized .log | df9f6c22270e261e2150046e55a9a06967764595f231393f059902d02d63eabd |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/focused-web-health.log | log | aux · unrecognized .log | 58659325ee1c21ac3e0159f6427977edc95717309276e1ba1dd845e20d2a061f |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/http/01-web-health.json | http | evidence | 205a4e48b5bfb30bc1aa2c6573074e6d59f5cff02384f77573a9dd2d87207291 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/http/02-readback-web-health.json | http | evidence | 9ae4911900a40246ffbe16376388b728de35017a913c359424ad2683a372f965 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/http/03-collector-healthz.json | http | evidence | 82d25e167ef811361d06c2de937fc0efbb08532ac29f95ec71d66d4b0e3b5627 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/http/04-collector-readyz.json | http | evidence | b8d450ad871cd5d07b9f733cde93fee89f2a3e860cfb23aee8569f721e14d514 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/observations.md | md | aux · unrecognized .md | 3eaa868b68e3b19e16e78e2d7602e82aa1e83fe6f623b9b297dec2fe83f907a9 |
| verification/runs/20260901-030906Z-3b9204a-health-public-fresh/readback/web-health.json | readback | evidence | e71e296451bc557836cb85c4e0450a474c1281bf04672a55a61e727c213dc251 |
