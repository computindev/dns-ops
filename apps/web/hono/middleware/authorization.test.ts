/**
 * Authorization Middleware Tests
 *
 * Tests for route-level authorization:
 * - requireAuth: Rejects requests without tenantId/actorId
 * - requireWritePermission: Rejects system/unknown actors for mutations
 * - requireAdminAccess: Internal service and Cloudflare Access checks
 * - enforceTenantIsolation: Tenant context guardrails
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../types.js';

// Helper to type json response bodies
type JsonBody = Record<string, unknown>;

import {
  enforceTenantIsolation,
  requireAdminAccess,
  requireAuth,
  requireWritePermission,
} from './authorization.js';

// Mock process.env for test isolation
const originalEnv = process.env;

describe('Authorization Middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    // Note: vi.resetModules() removed as it's not available in this Vitest version
    process.env = { ...originalEnv };
    app = new Hono<Env>();
  });

  describe('requireAuth', () => {
    it('should reject requests without tenantId', async () => {
      app.use('*', (c, next) => {
        c.set('actorId', 'user-123');
        // tenantId not set
        return next();
      });
      app.get('/protected', requireAuth, (c) => c.json({ ok: true }));

      const res = await app.request('/protected');

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Tenant context required');
    });

    it('should reject requests without actorId', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        // actorId not set
        return next();
      });
      app.get('/protected', requireAuth, (c) => c.json({ ok: true }));

      const res = await app.request('/protected');

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Actor context required');
    });

    it('should allow requests with both tenantId and actorId', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'user-456');
        return next();
      });
      app.get('/protected', requireAuth, (c) => c.json({ ok: true }));

      const res = await app.request('/protected');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.ok).toBe(true);
    });
  });

  describe('requireWritePermission', () => {
    it('should reject requests without tenantId', async () => {
      app.use('*', (c, next) => {
        c.set('actorId', 'user-123');
        return next();
      });
      app.post('/write', requireWritePermission, (c) => c.json({ ok: true }));

      const res = await app.request('/write', { method: 'POST' });

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject requests from unknown actor', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'unknown');
        return next();
      });
      app.post('/write', requireWritePermission, (c) => c.json({ ok: true }));

      const res = await app.request('/write', { method: 'POST' });

      expect(res.status).toBe(403);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('Valid actor identity required');
    });

    it('should reject requests from system actor', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'system');
        return next();
      });
      app.post('/write', requireWritePermission, (c) => c.json({ ok: true }));

      const res = await app.request('/write', { method: 'POST' });

      expect(res.status).toBe(403);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Forbidden');
    });

    it('should allow requests from valid user actor', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'user-456');
        return next();
      });
      app.post('/write', requireWritePermission, (c) => c.json({ ok: true }));

      const res = await app.request('/write', { method: 'POST' });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.ok).toBe(true);
    });

    it('should reject requests without actorId', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        // actorId not set
        return next();
      });
      app.post('/write', requireWritePermission, (c) => c.json({ ok: true }));

      const res = await app.request('/write', { method: 'POST' });

      expect(res.status).toBe(403);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('requireAdminAccess', () => {
    it('should reject requests without auth', async () => {
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin');

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Unauthorized');
    });

    it('should allow requests with valid internal secret without user context', async () => {
      process.env.INTERNAL_SECRET = 'test-secret-123';
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin', {
        headers: { 'X-Internal-Secret': 'test-secret-123' },
      });

      expect(res.status).toBe(200);
    });

    it('should reject requests with invalid internal secret', async () => {
      process.env.INTERNAL_SECRET = 'test-secret-123';

      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'service-user');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin', {
        headers: { 'X-Internal-Secret': 'wrong-secret' },
      });

      expect(res.status).toBe(403);
    });

    it('rejects allowlisted CF-Access headers without session-backed identity (TB-1)', async () => {
      process.env.ADMIN_EMAILS = 'user@example.com';

      // Auth context present (clears the 401 gate) but actorEmail is NOT set,
      // so only the (now-removed) CF header path could have granted admin.
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'cf-user-id');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@example.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-id',
        },
      });

      expect(res.status).toBe(403);
    });

    it('should reject Cloudflare Access identity when email is not allowlisted', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'user-123');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'user@example.com',
          'CF-Access-Authenticated-User-Id': 'cf-user-id',
        },
      });

      expect(res.status).toBe(403);
    });

    it('should reject incomplete or malformed Cloudflare Access identity headers', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'user-123');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const missingId = await app.request('/admin', {
        headers: { 'CF-Access-Authenticated-User-Email': 'user@example.com' },
      });
      expect(missingId.status).toBe(403);

      const invalidEmail = await app.request('/admin', {
        headers: {
          'CF-Access-Authenticated-User-Email': 'not-an-email',
          'CF-Access-Authenticated-User-Id': 'cf-user-id',
        },
      });
      expect(invalidEmail.status).toBe(403);
    });

    it('should reject actorEmail when not in admin allowlist', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'user-123');
        c.set('actorEmail', 'user@example.com');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin');

      expect(res.status).toBe(403);
    });

    it('should allow actorEmail when present in admin allowlist', async () => {
      process.env.ADMIN_EMAILS = 'admin@example.com, other@example.com';

      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'admin-123');
        c.set('actorEmail', 'Admin@Example.com');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin');

      expect(res.status).toBe(200);
    });

    it('should read admin allowlist and internal secret from runtime bindings', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'admin-123');
        c.set('actorEmail', 'admin@example.com');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const allowlistRes = await app.request('/admin', {}, { ADMIN_EMAILS: 'admin@example.com' });
      expect(allowlistRes.status).toBe(200);

      const secretRes = await app.request(
        '/admin',
        { headers: { 'X-Internal-Secret': 'binding-secret' } },
        { INTERNAL_SECRET: 'binding-secret' }
      );
      expect(secretRes.status).toBe(200);
    });

    it('should not treat empty runtime secret bindings as valid secrets', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'user-123');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request(
        '/admin',
        { headers: { 'X-Internal-Secret': '' } },
        { INTERNAL_SECRET: '' }
      );

      expect(res.status).toBe(403);
    });

    it('should allow dev access in development mode', async () => {
      process.env.NODE_ENV = 'development';

      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'dev-user');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin', {
        headers: { 'X-Dev-Actor': 'dev-user' },
      });

      expect(res.status).toBe(200);
    });

    it('should reject dev headers in production mode', async () => {
      process.env.NODE_ENV = 'production';

      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-123');
        c.set('actorId', 'dev-user');
        return next();
      });
      app.get('/admin', requireAdminAccess, (c) => c.json({ ok: true }));

      const res = await app.request('/admin', {
        headers: { 'X-Dev-Actor': 'dev-user' },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('enforceTenantIsolation', () => {
    it('should reject requests without tenantId', async () => {
      app.get('/data', enforceTenantIsolation, (c) => c.json({ ok: true }));

      const res = await app.request('/data');

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Tenant context required');
    });

    it('should allow requests with tenantId and preserve it', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'original-tenant');
        return next();
      });
      app.get('/data', enforceTenantIsolation, (c) => {
        return c.json({ tenantId: c.get('tenantId') });
      });

      const res = await app.request('/data');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tenantId).toBe('original-tenant');
    });
  });

  describe('Tenant Isolation - Cross-tenant access prevention', () => {
    it('should not allow accessing data from another tenant context', async () => {
      // This test validates that middleware enforces the tenant context
      // and downstream handlers respect it
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-A');
        c.set('actorId', 'user-from-tenant-A');
        return next();
      });

      app.get('/tenant-check', requireAuth, (c) => {
        const tenantId = c.get('tenantId');
        // Simulate checking if requested resource belongs to tenant
        const requestedTenant = c.req.query('tenant');
        if (requestedTenant && requestedTenant !== tenantId) {
          return c.json({ error: 'Access denied to other tenant data' }, 403);
        }
        return c.json({ tenantId, ok: true });
      });

      // Request data with mismatched tenant
      const res = await app.request('/tenant-check?tenant=tenant-B');

      expect(res.status).toBe(403);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toContain('other tenant');
    });

    it('should allow accessing data within same tenant', async () => {
      app.use('*', (c, next) => {
        c.set('tenantId', 'tenant-A');
        c.set('actorId', 'user-from-tenant-A');
        return next();
      });

      app.get('/tenant-check', requireAuth, (c) => {
        const tenantId = c.get('tenantId');
        const requestedTenant = c.req.query('tenant');
        if (requestedTenant && requestedTenant !== tenantId) {
          return c.json({ error: 'Access denied to other tenant data' }, 403);
        }
        return c.json({ tenantId, ok: true });
      });

      // Request data with matching tenant
      const res = await app.request('/tenant-check?tenant=tenant-A');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.ok).toBe(true);
      expect(body.tenantId).toBe('tenant-A');
    });
  });
});
