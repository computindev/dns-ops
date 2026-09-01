---
receipt: verification-receipt/v0
run_id: 20260901-034319Z-6655248-fresh-issue66-health-public
feature_id: health.public
profile: changed
surface: api
sha: 66552480a4a8fffc0ba32429b6c362c52c918ee5
code_digest: 057dfbd646a785da85a624aff06934b29bfbeb2d31bffc9b456fce7d955fdbcb
dirty: false
untracked: 2
status: passed
reason: ""
verifier: fresh
verifier_session: "api-web-prod:3002+collector-direct:3011,isolated-postgres"
evidence_dir: verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public
created_at: 2026-09-01T03:59:49.265Z
---

# Receipt: health.public — passed

## Observations (expected → seen)

- Exact tree `66552480a4a8fffc0ba32429b6c362c52c918ee` was built and started locally: web `bun run --filter @dns-ops/web build` then `bun run --filter @dns-ops/web start`; collector `bun run --filter @dns-ops/collector start` ran its `prestart` TypeScript build before direct `node dist/index.js`.
- Doctor passed 5 checks with 0 failures against loopback web `127.0.0.1:3002` and collector `127.0.0.1:3011`.
- Unauthenticated web `GET /api/health` returned HTTP 200 `{status: "healthy", service: "dns-ops-web", revision: "66552480a4a8fffc0ba32429b6c362c52c918ee"}`; a second request returned the same healthy status class and revision.
- Unauthenticated collector `GET /healthz` returned HTTP 200 `{status: "ok", service: "dns-ops-collector", revision: "66552480a4a8fffc0ba32429b6c362c52c918ee"}`.
- Unauthenticated collector `GET /readyz` returned HTTP 200 `{status: "ready", checks.database.status: "ok", revision: "66552480a4a8fffc0ba32429b6c362c52c918ee"}`.

## Forbidden (must not happen → confirmed absent)

- Public health responses must not expose database details or errors → captured bodies contain only public status/service/timestamp/revision and the readiness check status; no credentials, connection strings, driver details, or error messages.
- `/healthz` must not be treated as readiness → `/readyz` was requested separately and returned its own dependency-aware result.
- Public health must not require authentication → no auth headers were supplied to any health request.
- Provider/DNS egress and active probes must not run → only loopback services and disposable local PostgreSQL were used; `ENABLE_ACTIVE_PROBES=false`.

## Read-back (side effects checked through an independent path)

- `http/02-readback-web-health.json` is a second unauthenticated GET and retained HTTP 200/healthy status class.
- `http/04-collector-readyz.json` independently reports the database check as `ok`; all web and collector revision values equal the exact HEAD SHA.
- Focused health/readiness/ping suites passed with integration enabled: 5 files, 38 tests; collector lifecycle start test passed: 1 test.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/collector-start-test.log | log | aux · unrecognized .log | 62403a9c67599af21c53b90ed518420ea44af5e385b046f41b0ac1d0f601311d |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/collector-start.log | log | aux · unrecognized .log | 3344535a65b0eb1c78b950047889ddce6830baa650252129d8958154ef89448c |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/env.txt | env | aux | 297894731ead2882be0cfd89c557253537d8864213731ab6171dc8e96a66076d |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/focused-health-tests-integration.log | log | aux · unrecognized .log | 22813bf07300690231e768b0fdd3b0b361c649a3dcedbad17621a61347472a72 |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/focused-health-tests.log | log | aux · unrecognized .log | 2d9f24ac482cc9009dfe5b59d93e573ceaaa411cc50d73e4249e980a2339896d |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/http/01-web-health.json | http | evidence | c22c39bae185b372d9c7c3d42810ad39ac244da40e2bb4e6e4be35aa706f2a95 |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/http/02-readback-web-health.json | http | evidence | 5d281097e950b93587f5166a8b87555eeab850975a3fb03fc77d81a9ad2ddacb |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/http/03-collector-healthz.json | http | evidence | 23ec33b1cb12630f1d01bfec43156d259588788839c5947d2634deed7c669e5b |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/http/04-collector-readyz.json | http | evidence | 224dea61c569c15feb9e5eb1735fffb6959c5aa31046d79b2a9f9a7b26adc8f4 |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/observations.md | md | aux · unrecognized .md | acbdd7b2d200e1acddab21ca1ceada8a3b2e22a15d5edf5be3c200477429d868 |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/readback/web-health.json | readback | evidence | 2963a05a1e47e817dbca92c697a81cf0b10a78f16b24422bcc3d51943351e254 |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/web-build.log | log | aux · unrecognized .log | 3846d25589e9b0a23b2418249d50a55f13182da13c37aa3fc77797677749e0c2 |
| verification/runs/20260901-034319Z-6655248-fresh-issue66-health-public/web-prod-start.log | log | aux · unrecognized .log | bd89abbd6779b0b0992be976ff2c5a1259aa12c89e49e51af5d03732dbb04ae6 |
