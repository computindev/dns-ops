---
receipt: verification-receipt/v0
run_id: 20260903-175015Z-ffc602e-health-public-pr81-fix
feature_id: health.public
profile: changed
surface: api
sha: ffc602ecee2d2d2772e030a35c61914b25ce2451
code_digest: 751e5a37bc32e3e50d16be0de0bdf407634cfe1bd23641f1886daa7af3b5b214
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix
created_at: 2026-09-03T17:51:05.470Z
---

# Receipt: health.public — passed

## Observations (expected → seen)
- Collector GET /healthz returned HTTP 200 with `{\"status\":\"ok\",\"service\":\"dns-ops-collector\"}` without auth.
- Collector GET /readyz returned HTTP 503 with JSON `{\"status\":\"not_ready\",...}` because the intentionally refused verification database was unreachable.

## Forbidden (expected absent → confirmed absent)
- No secrets or database connection details appeared in public response bodies.
- Liveness 200 was not treated as readiness.

## Read-back
- Raw responses: healthz.json, readyz.status, readyz.json in this run directory.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/collector.log | log | aux · unrecognized .log | c80ffaaf0933faf1981c3baf1ec3b33cf6c798fd4c2658dd9c7ad722d2755507 |
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/env.txt | env | aux | a276a66190201e32d791c3fbfdb324b64e7fe7a17a32247f37518a03b03430d4 |
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/healthz.json | json | aux · unrecognized .json | 101af9d10ec06c1303dce03e633f275ce170872595f639980de3655798a346ab |
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/http/healthz.json | http | evidence | a029fd2d6178e1b311fbd3142f2023da5a255dea45039c9b831312a3e756fd37 |
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/http/readyz.json | http | evidence | da44eebb6036ba562ee73958540f7ff4df219d8112433e02a143f39b62c97691 |
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/observations.md | md | aux · unrecognized .md | 420e2f679c9753eba0c4045afa217b1556fc36a4a28730c0792c7b6fd4df18db |
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/pid | file | aux · unrecognized file | e902dcd2d2f2a9e68cc701846099ae2f6b611911233f1f839dea19bf14c156c3 |
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/readyz.json | json | aux · unrecognized .json | a06f3ed34f9e21a027c84976d1e9efb40b86fc3213fa825b163d9a1cd4937eca |
| verification/runs/20260903-175015Z-ffc602e-health-public-pr81-fix/readyz.status | status | aux · unrecognized .status | 8c4bc799953a87a2fa8386f58264974bdcaf4677d5ec91fd202cc1f9ed0f38bd |
