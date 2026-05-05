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

// Mock the getTenantUUID function
vi.mock('@dns-ops/contracts', () => ({
  getTenantUUID: vi.fn().mockImplementation(async (id: string) => {
    // Return a deterministic UUID for testing
    return `uuid-for-${id}`;
  }),
}));

// Import after mocking
import { getTenantUUID } from '@dns-ops/contracts';
import { authMiddleware, internalOnlyMiddleware, requireAuthMiddleware } from './auth.js';

const originalEnv = process.env;

describe('Auth Middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, API_KEY_SECRET: 'secret' };
    app = new Hono<Env>();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('authMiddleware', () => {
    it('should extract auth from Cloudflare Access headers', async () => {
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
      expect(body.tenantId).toBe('uuid-for-example.com'); // Domain extracted from email
      expect(body.actorId).toBe('cf-user-123');
      expect(body.actorEmail).toBe('user@example.com');
    });

    it('should reject CF Access without proper email format', async () => {
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
      // Should not extract auth due to invalid email format
      expect(body.tenantId).toBeUndefined();
    });

    it('should extract auth from API key header', async () => {
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        return c.json({
          tenantId: c.get('tenantId'),
          actorId: c.get('actorId'),
        });
      });

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': 'my-tenant:my-actor:secret',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBe('uuid-for-my-tenant');
      expect(body.actorId).toBe('my-actor');
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

    it('should prioritize CF Access over API key', async () => {
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
          'X-API-Key': 'other-tenant:other-actor:secret',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBe('uuid-for-priority.com');
      expect(body.actorId).toBe('cf-priority');
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

    it('should allow requests with valid CF Access', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@example.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
        },
      });

      expect(res.status).toBe(200);
    });

    it('should allow requests with valid API key', async () => {
      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'X-API-Key': 'tenant:actor:secret',
        },
      });

      expect(res.status).toBe(200);
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

    it('should allow requests with allowlisted Cloudflare Access identity', async () => {
      process.env.ADMIN_EMAILS = 'user@internal.com';
      app.get('/internal', internalOnlyMiddleware, (c) => c.json({ ok: true }));

      const res = await app.request('/internal', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@internal.com',
          'CF-Access-Authenticated-User-Id': 'internal-user',
        },
      });

      expect(res.status).toBe(200);
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

  describe('Identifier Validation', () => {
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
  });

  describe('Tenant UUID Normalization', () => {
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

    it('should normalize domain-based tenant from CF Access', async () => {
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
      expect(body.tenantId).toBe('uuid-for-acme.com');
    });
  });

  describe('Edge Cases', () => {
    it('should lowercase CF Access email domain before tenant normalization', async () => {
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
      expect(body.tenantId).toBe('uuid-for-example.com');
    });

    it('should return 401 in authMiddleware when getTenantUUID throws', async () => {
      vi.mocked(getTenantUUID).mockRejectedValueOnce(new Error('tenant not found'));

      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@bad-tenant.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
        },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.message).toContain('Invalid tenant context');
    });

    it('should return 401 in requireAuthMiddleware when getTenantUUID throws', async () => {
      vi.mocked(getTenantUUID).mockRejectedValueOnce(new Error('tenant not found'));

      app.use('*', requireAuthMiddleware);
      app.get('/protected', (c) => c.json({ ok: true }));

      const res = await app.request('/protected', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@bad-tenant.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-123',
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

    it('should fall through to CF Access when database session lookup throws', async () => {
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
      expect(body.tenantId).toBe('uuid-for-fallback.com');
      expect(body.actorId).toBe('cf-fallback');
    });

    it('should handle CF Access email with plus sign', async () => {
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
      expect(body.tenantId).toBe('uuid-for-example.com');
      expect(body.actorEmail).toBe('user+tag@example.com');
    });
  });
});
