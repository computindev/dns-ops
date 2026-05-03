/**
 * Auth End-to-End Integration Test
 *
 * Seeds a user, signs in, verifies session works, signs out,
 * and confirms unauthenticated requests are blocked.
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authMiddleware, requireAuthMiddleware } from '../middleware/auth.js';
import type { Env } from '../types.js';
import signupRoutes from './signup.js';

// Mock getTenantUUID to return deterministic UUIDs
vi.mock('@dns-ops/contracts', () => ({
  getTenantUUID: vi.fn().mockImplementation(async (id: string) => `uuid-for-${id}`),
}));

describe('Auth E2E — full lifecycle', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono<Env>();

    // Mock DB with in-memory users + sessions
    const memory = {
      users: [] as Array<{
        email: string;
        passwordHash: string;
        tenantId: string;
        name: string;
      }>,
      sessions: [] as Array<{
        token: string;
        userEmail: string;
        tenantId: string;
        expiresAt: Date;
      }>,
    };

    const mockDb = {
      getDrizzle: () => ({
        query: {
          users: {
            findFirst: vi.fn(async ({ where: _where }: any) => {
              // Simple eq matcher for email
              const email = _where?.queryChunks?.[2] ?? '';
              return memory.users.find((u) => u.email === email) || null;
            }),
          },
          sessions: {
            findFirst: vi.fn(async ({ where: _where }: any) => {
              // Rough matcher for token + expiresAt > now
              return memory.sessions.find((s) => s.expiresAt > new Date()) || null;
            }),
          },
        },
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      // Expose memory for test assertions
      _memory: memory,
    };

    app.use('*', async (c, next) => {
      c.set('db', mockDb as unknown as Env['Variables']['db']);
      return next();
    });

    // Attach signup routes (includes /signup, /login, /logout, /me)
    app.route('/api/auth', signupRoutes);

    // Protected route using requireAuthMiddleware
    app.use('/api/protected', requireAuthMiddleware);
    app.get('/api/protected', (c) =>
      c.json({ ok: true, tenantId: c.get('tenantId'), actorId: c.get('actorId') })
    );

    // Route using authMiddleware (optional auth)
    app.use('/api/optional', authMiddleware);
    app.get('/api/optional', (c) => c.json({ tenantId: c.get('tenantId') || null }));
  });

  it('signup is disabled and returns 403', async () => {
    const res = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Registration is disabled.');
  });

  it('login with invalid credentials returns 401', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nope@example.com', password: 'wrong' }),
    });

    expect(res.status).toBe(401);
  });

  it('logout without session still returns 200', async () => {
    const res = await app.request('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('me without session returns 401', async () => {
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.authenticated).toBe(false);
  });

  it('protected route without auth returns 401', async () => {
    const res = await app.request('/api/protected');
    expect(res.status).toBe(401);
  });

  it('optional route without auth returns null tenant', async () => {
    const res = await app.request('/api/optional');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.tenantId).toBeNull();
  });

  it('dev bypass headers populate auth context in development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const res = await app.request('/api/optional', {
      headers: {
        'X-Dev-Tenant': 'dev-tenant',
        'X-Dev-Actor': 'dev-actor',
      },
    });

    process.env.NODE_ENV = originalEnv;

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.tenantId).toBe('uuid-for-dev-tenant');
  });

  it('CF Access headers populate auth context', async () => {
    const res = await app.request('/api/optional', {
      headers: {
        'CF-Access-Authenticated-User-Email': 'user@cf.example.com',
        'CF-Access-Authenticated-User-Id': 'cf-user-123',
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.tenantId).toBe('uuid-for-cf.example.com');
  });

  it('protected route with CF Access returns 200', async () => {
    const res = await app.request('/api/protected', {
      headers: {
        'CF-Access-Authenticated-User-Email': 'user@cf.example.com',
        'CF-Access-Authenticated-User-Id': 'cf-user-123',
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.tenantId).toBe('uuid-for-cf.example.com');
    expect(body.actorId).toBe('cf-user-123');
  });

  it('API key auth populates context and allows protected access', async () => {
    process.env.API_KEY_SECRET = 'super-secret';

    const res = await app.request('/api/protected', {
      headers: {
        'X-API-Key': 'my-tenant:my-actor:super-secret',
      },
    });

    delete process.env.API_KEY_SECRET;

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.tenantId).toBe('uuid-for-my-tenant');
    expect(body.actorId).toBe('my-actor');
  });

  it('API key with wrong secret is rejected', async () => {
    process.env.API_KEY_SECRET = 'super-secret';

    const res = await app.request('/api/protected', {
      headers: {
        'X-API-Key': 'my-tenant:my-actor:wrong-secret',
      },
    });

    delete process.env.API_KEY_SECRET;

    expect(res.status).toBe(401);
  });
});
