# API Principal Migration (#66)

## Why

Both public API authentication paths (web and collector) previously validated
one shared `API_KEY_SECRET` while trusting the `tenantId` and `actorId`
supplied inside the same credential (`tenantId:actorId:secret`). Anyone holding
the shared secret could assert any tenant and actor — a tenant-isolation break.

The fix follows the MCP precedent (`apps/web/hono/lib/mcp-auth.ts`): an opaque
token is presented as a bare `X-API-Key` header, hashed with SHA-256, and
matched against a server-stored principal. Tenant and actor are derived
server-side from the matched principal only.

## New configuration

`API_PRINCIPALS_JSON` — JSON array of principals, hashes only:

```json
[
  {
    "principalId": "reports-bot",
    "tokenSha256": "<64 lowercase hex chars>",
    "tenantId": "<canonical tenant UUID>",
    "actorId": "reports-bot",
    "enabled": true
  }
]
```

Rules enforced at startup and at request time (invalid configuration fails
closed; it never falls back to legacy auth):

- `tokenSha256` must be a 64-char lowercase hex SHA-256 digest — raw tokens are
  rejected as configuration errors. Unknown keys (e.g. a raw `token` or
  `secret` field) are rejected too; entries accept exactly the five fields
  above.
- `tenantId` must be a canonical UUID (look it up through an authorized
  operator path; the static config cannot prove the tenant exists in
  PostgreSQL).
- Duplicate `principalId` or duplicate token hashes are rejected.
- Unknown, disabled, or malformed tokens are rejected with 401.

Generate a token and its hash (never commit or log the token):

```bash
TOKEN=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
printf '%s' "$TOKEN" | sha256sum   # use this digest in API_PRINCIPALS_JSON
```

Tokens must be at least 32 characters of `[A-Za-z0-9_-]`.

## Legacy compatibility — one release, default off

The old `tenantId:actorId:secret` format keeps working **only** when it has
exactly three colon-separated fields and `ENABLE_LEGACY_API_KEY_AUTH` is the
literal string `true`. Unset, `false`, or any other value keeps legacy auth off
**in every environment, including production**. `API_KEY_SECRET` is consulted
only inside that gated branch; extra or missing fields are rejected.

**Removal trigger:** legacy parsing (`authenticateApiKey`'s colon-format branch
and `ENABLE_LEGACY_API_KEY_AUTH`) must be deleted in the next release after
this one. When that release ships, remove the flag, the `API_KEY_SECRET`
plumbing, and this compatibility section in the same change.

## Rotation runbook (operator, non-production first)

1. Generate one token per external caller (command above); store each token in
   the caller's secret manager — never in this repository, chat, or logs.
2. Resolve each caller's canonical tenant UUID through an authorized
   database/operator path.
3. Set `API_PRINCIPALS_JSON` on web and collector (both services authenticate
   the same principals).
4. Verify with a non-production environment: bare token authenticates;
   `forged-tenant:forged-actor:<old-secret>` returns 401.
5. Only if a caller cannot cut over before the next release: set
   `ENABLE_LEGACY_API_KEY_AUTH=true` temporarily and schedule its removal.
6. Rotate `API_KEY_SECRET` (or drop it) once no caller depends on the legacy
   format. Do not inspect or reuse existing production key material from this
   repository — historical secrets require a separately authorized rotation.

## Scope notes

- Session auth, dev bypass, internal-service headers (`X-Internal-Secret`),
  and MCP scopes are unchanged.
- Principals retain the existing broad route access of API keys, now
  tenant-bound; per-principal scopes are future work if needed.
