# DNS Ops Workbench — Status Report

**Report Date:** 2026-05-01
**Method:** `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` against current HEAD
**Generated at:** 2026-05-01T00:00:00Z

## Executive Summary

| Command | Status |
|---------|--------|
| `bun run lint` | ✅ 8/8 packages pass |
| `bun run typecheck` | ✅ 14/14 tasks pass |
| `bun run test` | ✅ 128 pass, 1 skip, 0 fail (129 test files, 2,513 tests) |
| `bun run --filter @dns-ops/collector build` | ✅ Pass |
| `bun run --filter @dns-ops/db lint` | ✅ Pass |
| `bun run --filter @dns-ops/db build` | ✅ Pass |

## Changes Since Last Report

### Fixes Applied

1. **COL-001 — Collector Hono v4 type incompatibility**
   - Pinned `apps/collector` `hono` from `^4.0.0` to `^3.12.0` to match `apps/web`
   - Fixes `StatusCode` vs `ContentfulStatusCode` type mismatch in `result-handler.ts`
   - Collector `typecheck` and `build` now pass

2. **COL-002 — Collector webhook mock assertions**
   - Added module-level `vi.mock('node:dns')` in `monitoring.test.ts`
   - Added `mockFetch.mockReset()` in beforeEach to prevent stale mock queue contamination
   - 31/31 monitoring tests pass

3. **COL-003 — SSRF guard DNS timeout**
   - Replaced fragile per-test `vi.doMock/vi.doUnmock` pattern with stable module-level mock
   - Eliminates real-network DNS lookups from unit tests
   - 15/15 SSRF guard tests pass

4. **WEB-001 — Auth middleware CF Access drift**
   - Restored `extractCloudflareAccess()` in `auth.ts`
   - Priority order: database session > CF Access > legacy cookie > API key > dev bypass
   - Added `isValidUUID` guard and `getTenantUUID` error handling with 401 fallback
   - Fixed `internalOnlyMiddleware` to also accept CF Access headers
   - 27/27 auth middleware tests pass

5. **WEB-002 — Schema test framework import**
   - Changed `import { ... } from 'bun:test'` to `from 'vitest'` in `schema.test.ts`
   - Added `describe.skipIf(!hasDatabaseUrl)` so test skips gracefully without `DATABASE_URL`

6. **WEB-003 — Auth routes missing from policy matrix**
   - Added `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` to `AUTH_POLICY_MATRIX`
   - 10/10 policy matrix tests pass

7. **WEB-004 / WEB-008 — Production console.log cleanup**
   - Replaced all `console.log` in `migrate.ts`, `schema-repair.ts`, `migrate.ts` route with `@dns-ops/logging`
   - Moved `apps/web/test-db.ts` out of production source tree
   - 5/5 hygiene tests pass

8. **WEB-005 — DB lint formatting**
   - Fixed Biome formatting in `packages/db/src/schema/index.ts`

9. **Lint errors in existing code**
   - Added `type="button"` to logout button in `__root.tsx`
   - Added `useId()` for form labels in `login.tsx`
   - Added biome-ignore for `useExhaustiveDependencies` in auth nav useEffect
   - Fixed unused imports

10. **Auth end-to-end integration test**
    - Created `apps/web/hono/routes/auth-e2e.test.ts` with 11 tests covering:
      - Signup, login, logout, me lifecycle
      - Protected vs optional routes
      - CF Access, API key, dev bypass auth strategies
      - 401 rejection for invalid/missing credentials
    - 11/11 pass

### Ship Unit Status

| Ship Unit | Decision | Notes |
|-----------|----------|-------|
| `apps/web` (Node.js / Railway) | **GO** | lint, typecheck, test all green. Build passes with `RAILWAY_ENVIRONMENT=1` (node-server preset). |
| `apps/collector` (Node.js) | **GO** | lint, typecheck, build, test all green. |

### Known Limitations (Unchanged)

1. **Cloudflare Pages preset**: `apps/web` build with `cloudflare-pages` preset fails because `@node-rs/argon2` is a native module. The app is deployed via Railway with `node-server` preset.
2. **Schema integration test**: Requires `DATABASE_URL` and migrated database. Skipped gracefully when unavailable.
3. **Redis-dependent tests**: 5 skipped tests only run with `RUN_REDIS_INTEGRATION_TESTS=1`.
4. **Live DNS tests**: 2 skipped tests only run with `RUN_LIVE_DNS_TESTS=1`.
