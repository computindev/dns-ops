/**
 * Session cookie security tests.
 *
 * TB-1 (AuthZ hardening): the dns_ops_session cookie must carry the Secure
 * attribute (alongside HttpOnly; SameSite=Lax) on both issuance (login) and
 * clearing (logout) so the token is never transmitted over plain HTTP.
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

// Stub the native argon2 binding; password verification is not under test here.
vi.mock('@node-rs/argon2', () => ({ verify: vi.fn().mockResolvedValue(true) }));

import authRoutes from './signup.js';

function mockDb() {
  const drizzle = {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue({
          email: 'user@example.com',
          passwordHash: 'hashed',
          tenantId: 'tenant-1',
        }),
      },
      sessions: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  };
  return { getDrizzle: () => drizzle };
}

function createApp() {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', mockDb() as unknown as Env['Variables']['db']);
    await next();
  });
  app.route('/api/auth', authRoutes);
  return app;
}

describe('session cookie attributes', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = createApp();
  });

  it('login issues a session cookie with Secure + HttpOnly + SameSite=Lax', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'correct-horse' }),
    });

    // Success precondition: login succeeded and a cookie was issued.
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie, 'Set-Cookie must be present').not.toBeNull();

    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('logout clears the session cookie with Secure', async () => {
    const res = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: 'dns_ops_session=existing-token' },
    });

    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie, 'Set-Cookie must be present').not.toBeNull();

    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=0');
  });
});
