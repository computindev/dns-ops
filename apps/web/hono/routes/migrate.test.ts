/**
 * RT-4 HIGH-1: destructive recovery routes must not fake request-time recovery.
 */
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import migrateRoutes, {
  SCHEMA_RECOVERY_UNAVAILABLE_CODE,
  SCHEMA_RECOVERY_UNAVAILABLE_MESSAGE,
} from './migrate.js';

function buildApp(db: unknown = { execute: vi.fn() }) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', db as Env['Variables']['db']);
    await next();
  });
  app.route('/api/migrate', migrateRoutes);
  return app;
}

describe('POST /api/migrate recovery endpoints (RT-4)', () => {
  it.each([
    '/api/migrate/reset',
    '/api/migrate/rebuild',
  ] as const)('%s is unavailable and directs operators to the release pipeline', async (path) => {
    const execute = vi.fn();
    const app = buildApp({ execute });

    const res = await app.request(path, { method: 'POST' });
    expect(res.status).toBe(410);

    const body = (await res.json()) as {
      status: string;
      code: string;
      message: string;
    };
    expect(body).toEqual({
      status: 'unavailable',
      code: SCHEMA_RECOVERY_UNAVAILABLE_CODE,
      message: SCHEMA_RECOVERY_UNAVAILABLE_MESSAGE,
    });
    expect(body.message).toMatch(/run-migrations\.mjs/);
    expect(body.message).toMatch(/release/i);
    expect(execute).not.toHaveBeenCalled();
  });
});
