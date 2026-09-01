---
id: auth.api-principal
surface: api
profile: critical
paths:
  - packages/contracts/src/api-principal.ts
  - packages/contracts/src/api-principal.test.ts
  - apps/web/hono/middleware/auth.ts
  - apps/web/hono/middleware/auth.test.ts
  - apps/web/hono/routes/auth-e2e.test.ts
  - apps/web/hono/routes/findings.ts
  - apps/web/hono/routes/findings.runtime.test.ts
  - apps/collector/src/middleware/auth.ts
  - apps/collector/src/middleware/auth.test.ts
  - apps/collector/src/jobs/shared-reports.test.ts
  - apps/collector/src/jobs/probe-routes.test.ts
  - apps/collector/src/jobs/monitoring.integration.test.ts
  - apps/web/hono/config/env.ts
  - apps/web/hono/config/env.test.ts
  - apps/collector/src/config/env.ts
  - apps/collector/src/config/env.test.ts
always_with: []
---
# API principal authentication

External callers authenticate with a bare opaque `X-API-Key` token. The token
is SHA-256 hashed and matched against `API_PRINCIPALS_JSON`; tenant and actor
identity come only from the matched stored principal, never from the request.

## Sub-features

- Valid bare token → request proceeds with the stored principal's tenant/actor.
- Forged legacy `tenantId:actorId:secret` credential (correct shared secret,
  flag `ENABLE_LEGACY_API_KEY_AUTH` unset/false) → 401 on web and collector.
- `X-Tenant-Id`/`X-Actor-Id` headers cannot override the principal identity on
  the API-key path.
- Unknown or disabled token → 401.
- `ENABLE_LEGACY_API_KEY_AUTH=true` accepts the legacy format (one release
  only; see docs/security/api-principal-migration.md).
- Malformed `API_PRINCIPALS_JSON` fails closed: 401, no legacy fallback.

## Drive

Collector (api surface): start the collector locally, then request a protected
route (e.g. `GET /api/monitoring/reports/shared` or `/api/probe/health`) with
the `X-API-Key` header under test. Auth outcomes are observable without a
database: 401 = rejected, anything else (e.g. 503 db-missing) = authenticated.

Web: same header against `POST /api/auth/...` protected routes or any route
behind `requireAuthMiddleware`; 401 vs non-401 is the proof.

## Proof

- Auth-accepted vs 401 differs exactly between a principal-configured token and
  forged/legacy/unknown credentials, for both services.
- No raw token appears in logs or output; only hashes.

## Gotchas

- `API_PRINCIPALS_JSON` unset means no principals: every bare token is a 401.
- Legacy flag is literal `true` only; `True`, `1`, `yes` are all off.
