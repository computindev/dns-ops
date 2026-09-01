---
receipt: verification-receipt/v0
run_id: 20260901-042110Z-366153e-health-public-start
feature_id: health.public
profile: changed
surface: api
sha: 366153e6238da2d5f41309cfd2041a217fecde08
code_digest: 2de8656424bebd152128044c8e074cf0a6e5f463a15a2d14eab66f3d0c1c88ff
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: "local-web-3002+collector-3011-no-provider"
evidence_dir: verification/runs/20260901-042110Z-366153e-health-public-start
created_at: 2026-09-01T04:21:18.150Z
---

# Receipt: health.public — passed

## Observations (expected → seen)

- Local web `GET /api/health` returned the accepted degraded response while pointed at a deliberately unavailable loopback database.
- Local collector `GET /healthz` returned HTTP 200 with `status: "ok"`.
- Local collector `GET /readyz` returned an accepted dependency-aware response.
- Both services reported the expected local revision.

## Forbidden (must not happen → confirmed absent)

- Health evidence contained no credentials, connection strings, database driver details, or authentication headers.
- No provider or live DNS calls were enabled; the collector ran with active probes disabled.

## Read-back (side effects checked through an independent path)

- The harness performed a second web health request and retained separate collector liveness and readiness exchanges.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-042110Z-366153e-health-public-start/env.txt | env | aux | 3bf9f567c921611b45fd78ad7e3d27b53e57e3596110bdebe67f50a2e201cfb3 |
| verification/runs/20260901-042110Z-366153e-health-public-start/http/01-web-health.json | http | evidence | 9caed4cfad20ca2085f92a2cb4e9f1ecc405db6bb3a9cce8ca498fae3e7907f2 |
| verification/runs/20260901-042110Z-366153e-health-public-start/http/02-readback-web-health.json | http | evidence | abb71a4d72e5b02a82402732e810596fb5f03419add62596450396286912f385 |
| verification/runs/20260901-042110Z-366153e-health-public-start/http/03-collector-healthz.json | http | evidence | 9c55058b4bc11efbae2e94d8bb016fca152793f5147a262ad65940e28b015b79 |
| verification/runs/20260901-042110Z-366153e-health-public-start/http/04-collector-readyz.json | http | evidence | 61d8dbda8884e16358ce0d88d6ccbacb9d9720a11e92f0524e266326e39f26e7 |
| verification/runs/20260901-042110Z-366153e-health-public-start/observations.md | md | aux · unrecognized .md | 3216b2d13ef684710190592033477d2c9008de27d14c4d4f013169599e3441e7 |
| verification/runs/20260901-042110Z-366153e-health-public-start/readback/web-health.json | readback | evidence | 97e9e11eb518852a8b7a6cb1c9a5006ef3deb76078f22b34b9bee29dfa0bb4c8 |
