/**
 * CF-Access Forgeable-Auth Rejection Tests (TB-1)
 *
 * Regression coverage for the removal of the Cloudflare Access header trust
 * path. The `CF-Access-Authenticated-User-*` headers are forgeable by any
 * client that can bypass Cloudflare's perimeter (or any direct request when
 * the app is not deployed behind Cloudflare Access), so they MUST NOT
 * authenticate or grant privileged access on their own.
 *
 * After the TB-1 hardening, sessions and API keys are the only auth paths.
 * These tests assert the three former CF-Access trust sites reject forgeable
 * headers, each paired with a boundary proving legitimate auth still works:
 *
 *   rejection  -> production + Cf-Access-* headers + no session/API key -> rejected
 *   boundary   -> a valid session / internal secret still authenticates
 *
 * Assertion discipline: every "rejected" assertion is paired with a live
 * success precondition so the negative result cannot pass vacuously.
 */

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

type JsonBody = Record<string, unknown>;

// Deterministic tenant UUID so domain-based CF identities do not require a DB.
vi.mock('@dns-ops/contracts', () => ({
  getTenantUUID: vi.fn().mockImplementation(async (id: string) => `uuid-for-${id}`),
}));

import { internalOnlyMiddleware, requireAuthMiddleware } from './auth.js';
import { requireAdminAccess } from './authorization.js';

const originalEnv = process.env;
const VALID_SESSION_TENANT = '550e8400-e29b-41d4-a716-446655440000';

describe('CF-Access forgeable header rejection (TB-1)', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Production mode disables dev/test bypasses; CF path is env-independent.
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    app = new Hono<Env>();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('requireAuthMiddleware (extractCloudflareAccess path)', () => {
    it('rejects production requests carrying only Cf-Access-* headers', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@example.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
        },
      });

      expect(res.status).toBe(401);
    });

    it('boundary: still authenticates a valid database session', async () => {
      app.use('*', async (c, next) => {
        c.set('db', {
          getDrizzle: () => ({
            query: {
              sessions: {
                findFirst: vi.fn().mockResolvedValue({
                  token: 'valid-session-token',
                  tenantId: VALID_SESSION_TENANT,
                  userEmail: 'user@example.com',
                  expiresAt: new Date('2099-01-01T00:00:00Z'),
                }),
              },
            },
          }),
        } as unknown as Env['Variables']['db']);
        await next();
      });
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          Cookie: 'dns_ops_session=valid-session-token',
        },
      });

      // Live success precondition: a real session must still authenticate.
      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.ok).toBe(true);
    });
  });

  describe('requireAdminAccess (getCloudflareAccessEmail path)', () => {
    it('rejects forged Cf-Access admin headers when no session identity backs them', async () => {
      process.env.ADMIN_EMAILS = 'user@example.com';

      // Auth context present (so the 401 gate is cleared) but actorEmail is
      // intentionally NOT set: only the CF header path could grant admin here.
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'user-123');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@example.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
        },
      });

      expect(res.status).toBe(403);
    });

    it('boundary: still grants admin via session-backed actorEmail allowlist', async () => {
      process.env.ADMIN_EMAILS = 'user@example.com';

      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'user-123');
        c.set('actorEmail', 'user@example.com');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin');

      // Live success precondition: legitimate allowlisted admin still passes.
      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.ok).toBe(true);
    });
  });

  describe('internalOnlyMiddleware (CF-Access allowlist path)', () => {
    it('rejects forged Cf-Access headers on internal-only routes', async () => {
      process.env.ADMIN_EMAILS = 'user@internal.com';

      app.get('/internal', internalOnlyMiddleware, (c) => c.json({ ok: true }));

      const res = await app.request('/internal', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@internal.com',
          'CF-Access-Authenticated-User-Id': 'internal-user',
        },
      });

      expect(res.status).toBe(403);
    });

    it('boundary: still grants internal access via valid X-Internal-Secret', async () => {
      process.env.INTERNAL_SECRET = 'internal-secret-123';

      app.get('/internal', internalOnlyMiddleware, (c) => c.json({ ok: true }));

      const res = await app.request('/internal', {
        headers: { 'X-Internal-Secret': 'internal-secret-123' },
      });

      // Live success precondition: real internal services still pass.
      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.ok).toBe(true);
    });
  });
});
