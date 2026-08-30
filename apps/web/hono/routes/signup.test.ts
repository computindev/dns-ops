/**
 * Session cookie security tests.
 *
 * Secure is scheme-aware: HTTPS (or X-Forwarded-Proto: https) keeps Secure so
 * the token is not sent on plaintext; HTTP local omits Secure so the cookie can persist.
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

  it('login over HTTPS issues Secure + HttpOnly + SameSite=Lax', async () => {
    const res = await app.request('https://dns-ops.example/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'correct-horse' }),
    });

    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie, 'Set-Cookie must be present').not.toBeNull();

    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('login over HTTP omits Secure so local cookies can persist', async () => {
    const res = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'correct-horse' }),
    });

    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie, 'Set-Cookie must be present').not.toBeNull();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('login behind HTTPS proxy (X-Forwarded-Proto) sets Secure', async () => {
    const res = await app.request('http://127.0.0.1/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ email: 'user@example.com', password: 'correct-horse' }),
    });

    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie, 'Set-Cookie must be present').not.toBeNull();
    expect(cookie).toContain('Secure');
  });

  it('logout over HTTPS clears the session cookie with Secure', async () => {
    const res = await app.request('https://dns-ops.example/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: 'dns_ops_session=existing-token' },
    });

    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie, 'Set-Cookie must be present').not.toBeNull();

    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=0');
  });

  it('logout over HTTP omits Secure', async () => {
    const res = await app.request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: 'dns_ops_session=existing-token' },
    });

    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie, 'Set-Cookie must be present').not.toBeNull();
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).not.toContain('Secure');
  });
});
