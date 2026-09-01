---
receipt: verification-receipt/v0
run_id: 20260901-034318Z-6655248-fresh-issue66-auth-api-principal
feature_id: auth.api-principal
profile: critical
surface: api
sha: 66552480a4a8fffc0ba32429b6c362c52c918ee5
code_digest: 057dfbd646a785da85a624aff06934b29bfbeb2d31bffc9b456fce7d955fdbcb
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "local-web-prod:3002+3004,collector-direct:3011+3012,isolated-postgres"
evidence_dir: verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal
created_at: 2026-09-01T03:59:49.093Z
---

# Receipt: auth.api-principal — passed

## Observations (expected → seen)

- A configured bare opaque principal token authenticated on web `GET /api/auth/me`: HTTP 200, `authenticated: true`, tenant `550e8400-e29b-41d4-a716-446655440000`, and actor-derived email `fresh-verifier-6655248@dns-ops.local`.
- The same valid token plus forged `X-Tenant-Id=forged-tenant` and `X-Actor-Id=forged-actor` authenticated web `GET /api/findings/backfill/status`: HTTP 200, ruleset version `1.2.0`.
- A configured bare opaque principal token authenticated the collector protected `GET /api/probe/health` with forged tenant/actor headers: HTTP 200, `status=healthy`, `service=probe-sandbox`.
- Unknown, disabled, correctly-secreted legacy-format, and absent credentials returned HTTP 401 on both web and collector protected routes (`W3`–`W6`, `C2`–`C5`).
- With `ENABLE_LEGACY_API_KEY_AUTH=true` on separate loopback services, the legacy-format credential returned HTTP 200 on web `/api/auth/me` and collector `/api/probe/health` (`W7`, `C6`).
- With malformed `API_PRINCIPALS_JSON` and the legacy flag true, both direct start commands exited `1` and exposed no listener; malformed configuration failed closed before serving traffic.

## Forbidden (must not happen → confirmed absent)

- Request-supplied tenant/actor headers must not override matched principal identity → independent database read-back observed `ruleset_versions.created_by=fresh-verifier-6655248`, not `forged-actor`.
- Legacy, unknown, disabled, or missing credentials must not authenticate while the flag is false → every corresponding web and collector response was HTTP 401.
- Raw API tokens or shared secrets must not appear in output → all captured API-key headers are `[REDACTED]`; artifact grep found no raw token, secret, password, or connection string.
- External/provider egress and active probes must not run → services were loopback-only with `ENABLE_ACTIVE_PROBES=false`; disposable local PostgreSQL was the only dependency.

## Read-back (side effects checked through an independent path)

- PostgreSQL query `SELECT version, created_by FROM ruleset_versions ORDER BY created_at DESC LIMIT 1` returned `{version: "1.2.0", created_by: "fresh-verifier-6655248"}` with assertions `actorMatchesPrincipal=true` and `actorDoesNotMatchForgedHeader=true`.
- Focused auth/config suites at this tree passed: 7 files, 160 tests; collector lifecycle start test passed: 1 test.
- Collector was started through `bun run --filter @dns-ops/collector start`; its `prestart` build completed before the direct `node dist/index.js` process listened.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/auth-runtime.txt | txt | aux · unrecognized .txt | 07d191556114e2093bf17f38093e3f8a9c84b0dd48746c78f9749818a5657256 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/collector-legacy-start.log | log | aux · unrecognized .log | f7b1ca1b3184bfbdbb0be1c8bb6e8926e744a06c0c6a3e32b4d926fb0fb2e4d8 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/config-fail-closed.txt | txt | aux · unrecognized .txt | 3670f7027abcc4f5c91ceef41c461be21a79d5e1c2afa438baa5bd3d5115238e |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/env.txt | env | aux | f5de35a0d40f75d9b7f520b75f4a3c5e9ea46f020374883426d2d9d5664d0c91 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/focused-auth-tests.log | log | aux · unrecognized .log | 57c0e3e90c6629e8fba43bc20ac2f5f2d311bd84984453857ae9f3a3dbcec04b |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/C1-collector-valid-spoof.json | http | evidence | 2f17d3ebfe86a59fa2b562e6f3374ebf69702b5f1ddb2f3984305556eb8aea83 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/C2-collector-unknown.json | http | evidence | 70b83bde074dad727e498d2b8a56c929a7939a9280def05aa3ec460241c4f51f |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/C3-collector-disabled.json | http | evidence | 70b83bde074dad727e498d2b8a56c929a7939a9280def05aa3ec460241c4f51f |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/C4-collector-forged-legacy-off.json | http | evidence | 70b83bde074dad727e498d2b8a56c929a7939a9280def05aa3ec460241c4f51f |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/C5-collector-no-credential.json | http | evidence | 99e0a4e57def07e529d67d157a7bf026e6d6f7c85588e7281b7d737016b76aeb |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/C6-collector-legacy-enabled.json | http | evidence | 7d5e801ab3d0a1534a8c260fe0cff5a7c5f41d9107d4b122934b3d340f1efdab |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/W1-web-valid-spoof.json | http | evidence | 3610bd4f717933885212c3122f5dab81aa8c176a6fd466d17db489e5ddacca9b |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/W2-web-findings-spoof.json | http | evidence | 44d179fa59e39c08297f2dd716eaa44dd9322d1a353ba6491a8b8a48a4cb93eb |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/W3-web-unknown.json | http | evidence | 0d62f196bf74e13f0c5fdfc6f7bd3591c7225bdcc5d71b7850852907247fc671 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/W4-web-disabled.json | http | evidence | 0d62f196bf74e13f0c5fdfc6f7bd3591c7225bdcc5d71b7850852907247fc671 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/W5-web-forged-legacy-off.json | http | evidence | 0d62f196bf74e13f0c5fdfc6f7bd3591c7225bdcc5d71b7850852907247fc671 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/W6-web-no-credential.json | http | evidence | f6c76a750eb1b13867e7b9975847083eb50bdae7518f59b0b4cee8a8413c130a |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/http/W7-web-legacy-enabled.json | http | evidence | 9d1905d1d964b7a7869d972d08647bf64e82ae211002ee04be6229a1cd50c0ad |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/legacy-runtime.txt | txt | aux · unrecognized .txt | b8b4076154e12b8831086043792311abeb24b5642007f18f831aa1feb261b94f |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/observations.md | md | aux · unrecognized .md | 8631f6a25345217ef34dcd6c4b646f998fda7fdf792cc9283a7c365e345b6cd5 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/readback/ruleset-created-by.json | readback | evidence | 4d0385de5b18fe72ca682d1695e4b118beb32f601f0d4b4127ee75d22eb8a856 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-api-principal/web-legacy-start.log | log | aux · unrecognized .log | 7a8c8342b9f92eca58b7d04e750fce4815af71e7c41717fa2f8c5cb56e4ba762 |
