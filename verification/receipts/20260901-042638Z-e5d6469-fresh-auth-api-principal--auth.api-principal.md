---
receipt: verification-receipt/v0
run_id: 20260901-042638Z-e5d6469-fresh-auth-api-principal
feature_id: auth.api-principal
profile: critical
surface: api
sha: e5d6469f040670b38610b0aa714bb3c62b001152
code_digest: 2de8656424bebd152128044c8e074cf0a6e5f463a15a2d14eab66f3d0c1c88ff
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-local-worktree-e5d6469"
evidence_dir: verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal
created_at: 2026-09-01T04:40:01.477Z
---

# Receipt: auth.api-principal — passed

## Observations (expected → seen)

- Fresh isolated worktree was checked out at exact committed HEAD `e5d6469f040670b38610b0aa714bb3c62b001152`; tracked product tree remained clean after all proof runs. Web and collector ran on loopback only against a disposable PostgreSQL container; `ENABLE_ACTIVE_PROBES=false`; no provider, production, or live credential was used.
- A hash-configured bare opaque `X-API-Key` authenticated web `GET /api/auth/me`: HTTP 200, `authenticated=true`, stored tenant `550e8400-e29b-41d4-a716-446655440000`, and stored actor email `fresh-web-actor-e5d6469@dns-ops.local`. Forged `X-Tenant-Id=forged-tenant` and `X-Actor-Id=forged-actor` were sent with the request.
- The same valid principal plus forged identity headers authenticated web `GET /api/findings/backfill/status`: HTTP 200 with ruleset version `1.2.0`.
- A hash-configured collector principal plus forged identity headers authenticated collector `GET /api/probe/health`: HTTP 200, `status=healthy`, `service=probe-sandbox`.
- Unknown, correctly-secreted legacy-format, and absent credentials returned HTTP 401 on both web and collector protected routes. A principal with `enabled=false` returned HTTP 401 on both services in separately started loopback processes.
- With `ENABLE_LEGACY_API_KEY_AUTH=true` in separately started loopback processes, the legacy-format credential returned HTTP 200 on both the web protected route and collector probe-health route.
- Malformed `API_PRINCIPALS_JSON` with the legacy flag enabled failed startup with exit code 1 for both web and collector; no listener was reachable.

## Forbidden (must not happen → confirmed absent)

- Request-supplied tenant/actor headers did not override the matched principal. Captured requests are redacted, and the database read-back below recorded the stored actor rather than `forged-actor`.
- Legacy, unknown, disabled, and missing credentials did not authenticate while the legacy flag was false; every corresponding protected response was HTTP 401.
- Raw API keys, shared secrets, passwords, session values, and connection strings do not appear in the captured HTTP or read-back artifacts; credential-bearing fields are `[REDACTED]` or omitted.
- No external/provider egress or active probes ran; all services and dependencies were local loopback resources.

## Read-back (side effects checked through an independent path)

- Independent PostgreSQL query `SELECT version, created_by FROM ruleset_versions ORDER BY created_at DESC LIMIT 1` returned `{version: "1.2.0", createdBy: "fresh-web-actor-e5d6469"}` with assertions `actorMatchesStoredPrincipal=true` and `actorDoesNotMatchForgedHeader=true`.
- Focused auth/config suites passed: 10 files, 222 tests. Runtime HTTP exchanges and the independent database read-back are retained under `http/` and `readback/`.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/auth-focused-tests.log | log | aux · unrecognized .log | d8272b6c995200c1d82a5b7ee295c1674154a0b03d14bd13aa3e69d17593675e |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/auth-runtime.txt | txt | aux · unrecognized .txt | bf47ef3086187df10d2bcc7877326376b7abebc418a763df9ab8fd244369a444 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/auth-variant-drive.log | log | aux · unrecognized .log | 1d38a92a664c34cc2c1d69329803166f29e810ee5611db57a2863de9fc03e1d4 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/auth-variant-summary.txt | txt | aux · unrecognized .txt | 1e97c3d4a504e04aa0e6f6fd8338edb929502a7c87d8acf12a99dfe7bdbb41ef |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/disabled-principal-collector.log | log | aux · unrecognized .log | f50f7d9f9f925d61f365c8fcee236ecff4fdf26d23c1944c03c1649ea0a685ab |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/disabled-principal-web.log | log | aux · unrecognized .log | 6bd004a35c5fcf52a614b26844d6a1b20317ea44d81d7aa75a831fd30fdfad08 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/env.txt | env | aux | aa803fab03372c1975a6d4661c1609cb76afde7b996189bca67d5726d1645993 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/01-W1-valid-principal-me.json | http | evidence | 6245fe858bd7e3836672bb0988307de100e88c2206ef1db2380bde04d83f7973 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/02-W2-valid-principal-findings.json | http | evidence | 75636ec02edff4d29014a486e016e850aad57c721463e21db036a03574379b94 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/03-C1-valid-principal-probe-health.json | http | evidence | 11232f6e07a6f53dfbdb130028c2e3c6a2661c77da110ffb2ddded78fd317939 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/04-W3-unknown-token.json | http | evidence | 6b8d48933b217d6a78293bd6d06f27b84bfa536cd1f8463d2fa1bb481bf9c9e9 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/05-W4-legacy-flag-off.json | http | evidence | 6b8d48933b217d6a78293bd6d06f27b84bfa536cd1f8463d2fa1bb481bf9c9e9 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/06-W5-no-api-key.json | http | evidence | 403e1c68d97a82af31cbc20954a58d437430f84d86dc4860f669e1b4bca4d09a |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/07-C2-unknown-token.json | http | evidence | 6a53e03e90f9c2ddd4ab660731f4dea25c407c1636dce0f284ec851165dd6e18 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/08-C3-legacy-flag-off.json | http | evidence | 673ee1bc0403df85474c7e04f7f3bee389fc28486c589b0a7ed1444213f67de0 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/09-C4-no-api-key.json | http | evidence | 35fdcc8638ae6184870472538c5a0c8008263d07b7ee491fe1b5d2e832a89343 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/20-disabled-principal-web.json | http | evidence | b42a689fce6c677efbfbeaae72441d6b38c1bad04efb9e51f68c6a0e45012882 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/21-disabled-principal-collector.json | http | evidence | 37ec721a20e73ec5e2d7bf83b1e2b553a5f9ed450fe13509ebf5c398b3e36c83 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/22-legacy-enabled-web.json | http | evidence | 54f781615437af06671424bdc35b012c1d5fc0da94392c396dbca12df62d3e41 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/http/23-legacy-enabled-collector.json | http | evidence | 8b25ceedd2584fcea8bc35558703fe88191f9739461f9c05fe47f4016a7241d7 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/legacy-enabled-collector.log | log | aux · unrecognized .log | 9ebcb6800ec31692f7f37359dd6d04107c1960ba6add1d0fb35385980a35a0ab |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/legacy-enabled-web.log | log | aux · unrecognized .log | a28a1c222f21b0ddc1438757875b234eac2e438dfcd708e667a13cfdee7d6ea7 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/malformed-collector.log | log | aux · unrecognized .log | aa723c5a757cadad4f7cc7b44d8c1ec8f1cb8bb7a1cb584552d2938bce4e6e7e |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/malformed-web.log | log | aux · unrecognized .log | 683482c5f46d22da3a5fb87b31ffb5785f1f4bc31e3e264355b31ec2298d1a88 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/observations.md | md | aux · unrecognized .md | 7e029b77a04aa0c6f399313cb76c0aa5bb982a784b5a7994246b023f967815ea |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/readback/ruleset-version.json | readback | evidence | 1d9514a8053923dbf9e1f2f092a7612f9302c6411f6f56fd8035e5e2d34db516 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-api-principal/runtime-auth-probes.log | log | aux · unrecognized .log | ac54d49e32f29e0a3de44e11008512dec1031d84153ddbd906a8e96a8fd9c71d |
