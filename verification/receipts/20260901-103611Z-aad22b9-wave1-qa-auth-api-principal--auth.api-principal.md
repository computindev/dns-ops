---
receipt: verification-receipt/v0
run_id: 20260901-103611Z-aad22b9-wave1-qa-auth-api-principal
feature_id: auth.api-principal
profile: critical
surface: api
sha: aad22b9ce0acb4a5cbbe8b95e06651466a73f8ed
code_digest: ba8b0a0068efbcc82e351a6db480d965fd98f511c5aec310c888b56f74879a6f
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-local-loopback-web-collector-disposable-postgres"
evidence_dir: verification/runs/20260901-103611Z-aad22b9-wave1-qa-auth-api-principal
created_at: 2026-09-01T10:38:48.982Z
---

# Receipt: auth.api-principal — passed

## Observations (expected → seen)

- A clean isolated worktree at exact product SHA `aad22b9ce0acb4a5cbbe8b95e06651466a73f8ed` recorded `dirty: false` and `untracked: 0` before driving. The web and collector ran on loopback only against one disposable local PostgreSQL database.
- A valid bare opaque API principal authenticated web `GET /api/auth/me` with HTTP 200 and the configured stored tenant/actor identity. The same valid principal plus forged `X-Tenant-Id` and `X-Actor-Id` headers returned the same stored identity.
- The valid bare opaque principal authenticated collector `GET /api/probe/health` with HTTP 200. The same forged identity headers still returned the authenticated probe-health response. Unknown principal tokens returned HTTP 401 on both services.

## Forbidden (must not happen → confirmed absent)

- Request-supplied tenant/actor headers did not override the matched stored principal identity.
- Unknown API principals were not accepted. No provider, production, live-DNS, OAuth, or real credential access occurred; `ENABLE_ACTIVE_PROBES=false`.
- Raw credentials were not printed in the captured transcript or receipt notes; only redacted/sanitized observations are recorded.

## Read-back (side effects checked through an independent path)

- The web `/api/auth/me` response independently read back authenticated status, canonical tenant, and stored actor-derived email for both the normal and forged-header requests. Collector probe-health status independently read back successful authentication, and unauthenticated responses independently read back HTTP 401.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-103611Z-aad22b9-wave1-qa-auth-api-principal/cli-auth-principal.txt | transcript | evidence | b26832e42902e34f6686cbbfa80e3b274b496681d7d33d5d46941b3c71c023de |
| verification/runs/20260901-103611Z-aad22b9-wave1-qa-auth-api-principal/env.txt | env | aux | fb85e94dc96419d319e2b53e4318d6fe08fd0fa5ba6edb516880bfa38a857fbe |
