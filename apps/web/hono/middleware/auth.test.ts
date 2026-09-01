/**
 * Auth Middleware Tests
 *
 * Tests for authentication middleware:
 * - authMiddleware: Extracts identity from various sources
 * - requireAuthMiddleware: Rejects unauthenticated requests
 * - internalOnlyMiddleware: Restricts to internal services
 * - Cloudflare Access JWT extraction
 * - API key extraction and validation
 * - Dev bypass headers (development only)
 * - Tenant ID normalization to UUID
 */

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

// Helper to type json response bodies
type JsonBody = Record<string, unknown>;

// Mock getTenantUUID to return deterministic UUIDs; keep the real principal
// authentication exports from '@dns-ops/contracts'.
vi.mock('@dns-ops/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dns-ops/contracts')>();
  return {
    ...actual,
    getTenantUUID: vi.fn().mockImplementation(async (id: string) => {
      // Return a deterministic UUID for testing
      return `uuid-for-${id}`;
    }),
  };
});

// Import after mocking
import { getTenantUUID } from '@dns-ops/contracts';
import { authMiddleware, internalOnlyMiddleware, requireAuthMiddleware } from './auth.js';

const originalEnv = process.env;

// Principal fixture: bare opaque token mapped by SHA-256 hash to a stored identity.
const PRINCIPAL_TOKEN = 'web-auth-test-token-0123456789abcdef0123456789';
const PRINCIPAL_TOKEN_SHA256 = '93bee9e2d26a376b34b532da58c126a6065ba557751b85ac183f036859ff7197';
const PRINCIPAL_TENANT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const PRINCIPAL_ACTOR = 'stored-web-actor';

function principalsJson(overrides: Record<string, unknown>[] = []): string {
  return JSON.stringify([
    {
      principalId: 'web-principal-1',
      tokenSha256: PRINCIPAL_TOKEN_SHA256,
      tenantId: PRINCIPAL_TENANT_UUID,
      actorId: PRINCIPAL_ACTOR,
      enabled: true,
    },
    ...overrides,
  ]);
}

describe('Auth Middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      API_KEY_SECRET: 'secret',
      API_PRINCIPALS_JSON: principalsJson(),
    };
    delete process.env.ENABLE_LEGACY_API_KEY_AUTH;
    app = new Hono<Env>();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('authMiddleware', () => {
    it('does NOT extract auth from Cloudflare Access headers (TB-1)', async () => {
      // CF-Access headers are forgeable and no longer authenticate.
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
          actorEmail: c.get('actorEmail'),
        });
      });

      const res = await app.request('/test', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@example.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
      expect(body.actorId).toBeUndefined();
      expect(body.actorEmail).toBeUndefined();
    });

    it('does not extract auth from CF Access headers regardless of format (TB-1)', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
        });
      });

      const res = await app.request('/test', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'not-an-email',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      // CF-Access headers are ignored entirely (TB-1).
      expect(body.tenantId).toBeUndefined();
    });

    it('should extract auth from a bare API key token via stored principal (#66)', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
        });
      });

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': PRINCIPAL_TOKEN,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      // Tenant/actor come from the stored principal, not from the credential.
      expect(body.tenantId).toBe(PRINCIPAL_TENANT_UUID);
      expect(body.actorId).toBe(PRINCIPAL_ACTOR);
    });

    it('rejects an unknown bare API key token', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': 'unknown-token-0123456789abcdef0123456789abcdef',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
    });

    it('rejects a disabled principal token', async () => {
      // Only the disabled principal is configured, with the same token hash as
      // PRINCIPAL_TOKEN — so the token matches it and is rejected because it is
      // disabled, not because of duplicate-hash or unknown-token rejection.
      process.env.API_PRINCIPALS_JSON = JSON.stringify([
        {
          principalId: 'web-principal-1',
          tokenSha256: PRINCIPAL_TOKEN_SHA256,
          tenantId: PRINCIPAL_TENANT_UUID,
          actorId: PRINCIPAL_ACTOR,
          enabled: false,
        },
      ]);
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': PRINCIPAL_TOKEN,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
    });

    it('fails closed on malformed principal configuration without legacy fallback (#66)', async () => {
      process.env.API_PRINCIPALS_JSON = 'not-json';
      process.env.ENABLE_LEGACY_API_KEY_AUTH = 'true';
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      // Even with the legacy flag on and a matching secret, malformed config must reject.
      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': 'my-tenant:my-actor:secret',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should reject malformed API key', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
        });
      });

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': 'malformed-key',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
      expect(body.actorId).toBeUndefined();
    });

    it('should extract auth from dev headers in development mode', async () => {
      process.env.NODE_ENV = 'development';

      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
        });
      });

      const res = await app.request('/test', {
        headers: {
          'X-Dev-Tenant': 'dev-tenant',
          'X-Dev-Actor': 'dev-actor',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBe('uuid-for-dev-tenant');
      expect(body.actorId).toBe('dev-actor');
    });

    it('should not extract auth from dev headers in production', async () => {
      process.env.NODE_ENV = 'production';

      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
        });
      });

      const res = await app.request('/test', {
        headers: {
          'X-Dev-Tenant': 'dev-tenant',
          'X-Dev-Actor': 'dev-actor',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
      expect(body.actorId).toBeUndefined();
    });

    it('falls back to a bare principal token alongside CF Access headers (TB-1)', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
          actorEmail: c.get('actorEmail'),
        });
      });

      const res = await app.request('/test', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@priority.com',
          'CF-Access-Authenticated-User-Id': 'cf-priority',
          'X-API-Key': PRINCIPAL_TOKEN,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBe(PRINCIPAL_TENANT_UUID);
      expect(body.actorId).toBe(PRINCIPAL_ACTOR);
    });

    it('should allow requests without auth (sets nothing)', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
        });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
      expect(body.actorId).toBeUndefined();
    });
  });

  describe('requireAuthMiddleware', () => {
    it('should reject requests without any auth', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected');

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Unauthorized');
    });

    it('rejects requests carrying only CF Access headers (TB-1)', async () => {
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

    it('should allow requests with a valid bare principal token', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': PRINCIPAL_TOKEN,
        },
      });

      expect(res.status).toBe(200);
    });

    it('should reject requests with a legacy-format key when the flag is off (#66)', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': 'tenant:actor:secret',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should allow requests with dev headers in development', async () => {
      process.env.NODE_ENV = 'development';

      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'X-Dev-Tenant': 'dev-tenant',
          'X-Dev-Actor': 'dev-actor',
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('internalOnlyMiddleware', () => {
    it('should reject requests without internal access', async () => {
      app.get('/internal', internalOnlyMiddleware, (c) => c.json({ ok: true }));

      const res = await app.request('/internal');

      expect(res.status).toBe(403);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('Internal access only');
    });

    it('should allow requests with valid internal secret', async () => {
      process.env.INTERNAL_SECRET = 'internal-secret-123';

      app.get('/internal', internalOnlyMiddleware, (c) => c.json({ ok: true }));

      const res = await app.request('/internal', {
        headers: {
          'X-Internal-Secret': 'internal-secret-123',
        },
      });

      expect(res.status).toBe(200);
    });

    it('should reject requests with invalid internal secret', async () => {
      process.env.INTERNAL_SECRET = 'internal-secret-123';

      app.get('/internal', internalOnlyMiddleware, (c) => c.json({ ok: true }));

      const res = await app.request('/internal', {
        headers: {
          'X-Internal-Secret': 'wrong-secret',
        },
      });

      expect(res.status).toBe(403);
    });

    it('rejects allowlisted Cloudflare Access identity on internal routes (TB-1)', async () => {
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

    it('should reject Cloudflare Access users that are not allowlisted for internal routes', async () => {
      app.get('/internal', internalOnlyMiddleware, (c) => c.json({ ok: true }));

      const res = await app.request('/internal', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@internal.com',
          'CF-Access-Authenticated-User-Id': 'internal-user',
        },
      });

      expect(res.status).toBe(403);
    });

    it('should not treat empty runtime secret bindings as valid API key secrets', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request(
        '/protected',
        { headers: { 'X-API-Key': 'tenant:actor:' } },
        { API_KEY_SECRET: '' }
      );

      expect(res.status).toBe(401);
    });

    it('should not allow API key access (internal only)', async () => {
      app.get('/internal', internalOnlyMiddleware, (c) => c.json({ ok: true }));

      const res = await app.request('/internal', {
        headers: {
          'X-API-Key': 'tenant:actor:secret',
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('Legacy API key compatibility (one release, explicit flag)', () => {
    beforeEach(() => {
      process.env.ENABLE_LEGACY_API_KEY_AUTH = 'true';
    });

    it('accepts the legacy tenantId:actorId:secret format only when enabled', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': 'my-tenant:my-actor:secret',
        },
      });

      expect(res.status).toBe(200);
    });

    it('rejects the legacy format when the flag is anything but literal true', async () => {
      for (const flagValue of ['false', 'True', '1', 'yes']) {
        process.env.ENABLE_LEGACY_API_KEY_AUTH = flagValue;
        const probe = new Hono<Env>();
        probe.use('*', requireAuthMiddleware);
        probe.get('/protected', (c) => c.json({ ok: true }));

        const res = await probe.request('/protected', {
          headers: {
            'X-API-Key': 'my-tenant:my-actor:secret',
          },
        });

        expect(res.status).toBe(401);
      }
    });

    it('rejects the legacy format with a wrong secret', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': 'my-tenant:my-actor:wrong',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should accept valid UUID format', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': '550e8400-e29b-41d4-a716-446655440000:actor:secret',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeDefined();
    });

    it('should accept alphanumeric with hyphens/underscores', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': 'my_tenant-123:my-actor_456:secret',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeDefined();
    });

    it('should reject invalid identifier formats', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': 'tenant with spaces:actor:secret',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      // Invalid format should result in no auth
      expect(body.tenantId).toBeUndefined();
    });

    it('should normalize tenant ID to UUID format', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': 'my-tenant:actor:secret',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      // Should be normalized via getTenantUUID mock
      expect(body.tenantId).toBe('uuid-for-my-tenant');
    });
  });

  describe('Tenant UUID Normalization', () => {
    it('uses the stored principal tenant UUID directly (#66)', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': PRINCIPAL_TOKEN,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBe(PRINCIPAL_TENANT_UUID);
    });

    it('does not derive a tenant from CF Access headers (TB-1)', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@acme.com',
          'CF-Access-Authenticated-User-Id': 'user-123',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('ignores CF Access headers entirely (no tenant derived) (TB-1)', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

      const res = await app.request('/test', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@Example.COM',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
    });

    it('should return 401 in authMiddleware when getTenantUUID throws', async () => {
      process.env.ENABLE_LEGACY_API_KEY_AUTH = 'true';
      vi.mocked(getTenantUUID).mockRejectedValueOnce(new Error('tenant not found'));

      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': 'bad-tenant:actor:secret',
        },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.message).toContain('Invalid tenant context');
    });

    it('should return 401 in requireAuthMiddleware when getTenantUUID throws', async () => {
      process.env.ENABLE_LEGACY_API_KEY_AUTH = 'true';
      vi.mocked(getTenantUUID).mockRejectedValueOnce(new Error('tenant not found'));

      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': 'bad-tenant:actor:secret',
        },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.message).toContain('Invalid tenant context');
    });

    it('should reject forged legacy email tenant cookies', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          Cookie: `dns_ops_session=${encodeURIComponent('attacker@example.com:example.com')}`,
        },
      });

      expect(res.status).toBe(401);
    });

    it('does NOT fall through to CF Access when database session lookup throws (TB-1)', async () => {
      app.use('*', async (c, next) => {
        c.set('db', {
          getDrizzle: () => ({
            query: {
              sessions: {
                findFirst: vi.fn().mockRejectedValue(new Error('DB error')),
              },
            },
          }),
        } as unknown as Env['Variables']['db']);
        await next();
      });
      app.use('*', authMiddleware);
      app.get('/test', (c) =>
        c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
        })
      );

      const res = await app.request('/test', {
        headers: {
          Cookie: 'dns_ops_session=bad-token',
          'CF-Access-Authenticated-User-Email': 'user@fallback.com',
          'CF-Access-Authenticated-User-Id': 'cf-fallback',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
      expect(body.actorId).toBeUndefined();
    });

    it('ignores CF Access headers with plus-addressed email (TB-1)', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) =>
        c.json({ tenantId: c.get('tenantId'), actorEmail: c.get('actorEmail') })
      );

      const res = await app.request('/test', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user+tag@example.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBeUndefined();
      expect(body.actorEmail).toBeUndefined();
    });
  });

  describe('API key principal authentication (#66)', () => {
    it('rejects forged legacy API key identity when legacy auth is not enabled', async () => {
      // Shared-secret holder must not be able to assert an arbitrary tenant/actor.
      delete process.env.ENABLE_LEGACY_API_KEY_AUTH;

      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': 'forged-tenant:forged-actor:secret',
        },
      });

      expect(res.status).toBe(401);
    });

    it('ignores X-Tenant-Id/X-Actor-Id headers on the API key path', async () => {
      delete process.env.ENABLE_LEGACY_API_KEY_AUTH;

      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) =>
        c.json({ tenantId: c.get('tenantId'), actorId: c.get('actorId') })
      );

      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': PRINCIPAL_TOKEN,
          'X-Tenant-Id': 'forged-tenant',
          'X-Actor-Id': 'forged-actor',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      // Identity comes from the stored principal, never from request headers.
      expect(body.tenantId).toBe(PRINCIPAL_TENANT_UUID);
      expect(body.actorId).toBe(PRINCIPAL_ACTOR);
    });
  });
});
