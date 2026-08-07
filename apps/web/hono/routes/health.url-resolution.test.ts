/**
 * RT-3 follow-up: /api/health must resolve the DB URL via getEnvConfig(c.env)
 * (bindings + HYPERDRIVE_URL fallback), not process.env.DATABASE_URL alone.
 *
 * Behavioral coverage with a mocked readiness ping so we assert the exact URL
 * passed to the probe without needing a live database.
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

const pingDatabaseForReadiness = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@dns-ops/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dns-ops/db')>();
  return {
    ...actual,
    pingDatabaseForReadiness,
  };
});

const { apiRoutes } = await import('./api.js');

const STUB_DB = { dialect: 'postgres' } as unknown as IDatabaseAdapter;
const HYPERDRIVE_URL = 'postgresql://hd-user:secret@hyperdrive.internal:5432/app';
const DATABASE_URL = 'postgresql://primary-user:secret@db.internal:5432/app';

function createHealthApp(db: IDatabaseAdapter | undefined = STUB_DB) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    if (db) {
      c.set('db', db);
    }
    await next();
  });
  app.route('/api', apiRoutes);
  return app;
}

describe('GET /api/health URL resolution via getEnvConfig (RT-3)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.HYPERDRIVE_URL;
    pingDatabaseForReadiness.mockReset();
    pingDatabaseForReadiness.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('probes HYPERDRIVE_URL from request bindings when process env is empty', async () => {
    const app = createHealthApp();
    const res = await app.request('/api/health', undefined, {
      HYPERDRIVE_URL,
    });

    expect(res.status).toBe(200);
    expect(pingDatabaseForReadiness).toHaveBeenCalledTimes(1);
    expect(pingDatabaseForReadiness).toHaveBeenCalledWith(HYPERDRIVE_URL);

    const body = await res.json();
    expect(body).toMatchObject({ status: 'healthy', service: 'dns-ops-web' });
    expect(JSON.stringify(body)).not.toMatch(/hyperdrive\.internal|hd-user|secret/i);
  });

  it('probes process.env.HYPERDRIVE_URL when DATABASE_URL is unset', async () => {
    process.env.HYPERDRIVE_URL = HYPERDRIVE_URL;
    const app = createHealthApp();

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(pingDatabaseForReadiness).toHaveBeenCalledWith(HYPERDRIVE_URL);
  });

  it('prefers binding DATABASE_URL over HYPERDRIVE_URL', async () => {
    process.env.HYPERDRIVE_URL = HYPERDRIVE_URL;
    const app = createHealthApp();

    const res = await app.request('/api/health', undefined, {
      DATABASE_URL,
      HYPERDRIVE_URL: 'postgresql://should-not-use:5432/db',
    });

    expect(res.status).toBe(200);
    expect(pingDatabaseForReadiness).toHaveBeenCalledWith(DATABASE_URL);
  });

  it('returns 503 without probing when no URL is configured anywhere', async () => {
    const app = createHealthApp();
    const res = await app.request('/api/health');

    expect(res.status).toBe(503);
    expect(pingDatabaseForReadiness).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toMatchObject({ status: 'degraded', service: 'dns-ops-web' });
  });
});
