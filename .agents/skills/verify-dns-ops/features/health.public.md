---
id: health.public
surface: api
profile: changed
paths:
  - apps/web/hono/routes/api.ts
  - apps/collector/src/index.ts
  - .railway/railway.ts
always_with: []
---
# Public health

Operators and Railway need an unauthenticated answer that the web process can talk to Postgres and that the collector process is alive. This is the public readiness surface, not an authenticated dashboard.

## Sub-features

- Web `GET /api/health` — 200 `{"status":"healthy","service":"dns-ops-web"}` when the DB ping succeeds; 503 `{"status":"degraded"}` when it does not. Optional `revision` is `GIT_SHA` or `RAILWAY_GIT_COMMIT_SHA` when set.
- Collector `GET /healthz` — liveness, process only.
- Collector `GET /readyz` — dependency-aware; 503 when DB/queues are not ready.

## How to get to it (user POV)

1. No login.
2. Request the health URL for the service under test (web default `http://localhost:3000`, collector default `http://localhost:3001`).

## Driving it with harness/api.mts

```ts
await call('web-health', 'GET', '/api/health');
// Collector is a different origin; doctor.sh curls COLLECTOR_URL/healthz and /readyz.
```

## Proof

### Expected observations
- Web body includes `status` of `healthy` (200) or `degraded` (503). Never an empty 502 from the edge with no JSON `service`.
- Collector `/healthz` body `status` is `ok` when the process is up.

### Forbidden observations
- Secrets, connection strings, or `err.message` from Postgres in the public body.
- Treating collector `/healthz` 200 as proof that `/readyz` is ready.

### Read-back
- A second GET to the same path returns the same `status` class (healthy vs degraded) without auth headers.
- When `GIT_SHA` or `RAILWAY_GIT_COMMIT_SHA` is set, `revision` equals that value on web and collector. A passed receipt for a git tree requires live `revision` to match that tree and Railway `commitHash` (or `revision`) on both services.

## Gotchas

- Railway web public domain must target port 8080; collector 3001. A 502 `Application failed to respond` is usually the wrong `targetPort`, not a failed health handler.
- `self-signed certificate in certificate chain` on `/api/health` or `/readyz` means `DB_TLS_REJECT_UNAUTHORIZED` is not `false` against Railway Postgres.
- This feature does not prove login, Domain 360, or portfolio.
