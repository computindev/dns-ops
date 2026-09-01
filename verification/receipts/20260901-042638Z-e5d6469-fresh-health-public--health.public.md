---
receipt: verification-receipt/v0
run_id: 20260901-042638Z-e5d6469-fresh-health-public
feature_id: health.public
profile: changed
surface: api
sha: e5d6469f040670b38610b0aa714bb3c62b001152
code_digest: 2de8656424bebd152128044c8e074cf0a6e5f463a15a2d14eab66f3d0c1c88ff
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-local-worktree-e5d6469"
evidence_dir: verification/runs/20260901-042638Z-e5d6469-fresh-health-public
created_at: 2026-09-01T04:41:20.851Z
---

# Receipt: health.public — passed

## Observations (expected → seen)

- Fresh isolated worktree was checked out at exact committed HEAD `e5d6469f040670b38610b0aa714bb3c62b001152`; no product files were changed. Web and collector ran on loopback against a disposable PostgreSQL container; `ENABLE_ACTIVE_PROBES=false`; no provider or production service was contacted.
- Web production build completed from the workspace with its dependencies. Collector production start was invoked through `bun run --filter @dns-ops/collector start`; its `prestart` hook completed the workspace dependency-aware Turbo build before the collector listened.
- The changed clean-checkout lifecycle test passed: after collector and dependency `dist` output directories were removed, `bun run start` rebuilt all six output directories and exited successfully (`1` test passed).
- Doctor passed all 5 checks with 0 failures against loopback web and collector services.
- Unauthenticated web `GET /api/health` returned HTTP 200 `{status: "healthy", service: "dns-ops-web", revision: "e5d6469f040670b38610b0aa714bb3c62b001152"}`. A second request returned the same healthy status class and revision.
- Unauthenticated collector `GET /healthz` returned HTTP 200 `{status: "ok", service: "dns-ops-collector", revision: "e5d6469f040670b38610b0aa714bb3c62b001152"}`.
- Unauthenticated collector `GET /readyz` returned HTTP 200 `{status: "ready", checks.database.status: "ok", revision: "e5d6469f040670b38610b0aa714bb3c62b001152"}`.

## Forbidden (must not happen → confirmed absent)

- Public health responses contained no credentials, connection strings, driver details, or database error messages; only public status/service/timestamp/revision and readiness check status were captured.
- `/healthz` was requested separately from `/readyz`; liveness was not treated as dependency readiness.
- Public health endpoints required no authentication headers.
- No provider/DNS egress or active probes were enabled; all proof traffic stayed on loopback and the database was disposable local PostgreSQL.

## Read-back (side effects checked through an independent path)

- `http/02-readback-web-health.json` is an independent second unauthenticated web request with the same HTTP 200/healthy class and revision.
- `http/04-collector-readyz.json` independently reports the database check as `ok`; every captured revision equals the exact HEAD SHA.
- Focused health/readiness/ping suites passed: 3 files, 27 tests. The collector clean-output lifecycle test passed separately: 1 test.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/collector-prod-start.log | log | aux · unrecognized .log | c0cededbc94631cb6e2799bc733385d24278e466bbcdc74f92052ad72dcd7fdd |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/collector-start-test.log | log | aux · unrecognized .log | b6317805a0f67d245662a701d01493e210cc32f11d744f5e7b1e3f3c2b09139a |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/env.txt | env | aux | a823841b830994b5c5f42d60e3cf83338f49316bc497ef8ae08ca5d056299c73 |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/health-drive.log | log | aux · unrecognized .log | 4d3dbfae4c492f5d89574c94f0dd522a5782be911e739b84cc00d09a3f5786aa |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/health-focused-tests.log | log | aux · unrecognized .log | 4f80210c1898ea7407879cc7399382b432bfec6960e6391bb1701bf3656eef06 |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/http/01-web-health.json | http | evidence | bb6550c92f12940a4f4183f1bdeb29d41cecdea3cdaa86c0abf2066c53ba98d3 |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/http/02-readback-web-health.json | http | evidence | 7368e2bb3db671d02b7e9efdfe57ddd1ff370d5e764bca3e66cc777eaae0fcdf |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/http/03-collector-healthz.json | http | evidence | 4a45464fd3e20816759d4915422334dac6025e157e759fb9b4d1b92837c37fa9 |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/http/04-collector-readyz.json | http | evidence | ba761ee7206556e1e8fc09b705e35b283e852750b0576125f5690c9c7cd548d8 |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/observations.md | md | aux · unrecognized .md | 0b500ef5827caf0eabb7b7889006bab0e3e0795af4b92ad1860ed69e832ae874 |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/readback/web-health.json | readback | evidence | 2c805e5dfc011ccdfd17fda8334c9b310299065ef056466726719dc087e59cc0 |
| verification/runs/20260901-042638Z-e5d6469-fresh-health-public/runtime-migrations.txt | txt | aux · unrecognized .txt | 563aa3a9cd3de102c57481ff8a1c14c8b5881a4b5bb38fa813b4ec82a1861f92 |
