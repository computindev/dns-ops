/**
 * RT-3: Web /api/health honest readiness
 *
 * Railway readiness endpoint semantics:
 * - 503 when DB is missing or unreachable (real bounded query fails)
 * - 200 only after a real SELECT 1 succeeds
 * - Preserve public response shape (status/service/timestamp[/warning])
 * - Never leak driver/host/user details in the public body
 *
 * Healthy disposable Postgres is opt-in only:
 *   RUN_DB_INTEGRATION_TESTS=1
 * Default unit runs never require Docker.
 */

import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createPostgresAdapter, pingDatabaseForReadiness } from '@dns-ops/db';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import { apiRoutes } from './api.js';

const REFUSED_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:1/postgres';
const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION_TESTS === '1';

type HealthBody = {
  status: 'healthy' | 'degraded';
  service: string;
  timestamp: string;
  warning?: string;
};

function createHealthApp(db: Env['Variables']['db'] | undefined) {
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

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate free port'));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForPostgres(url: string, attempts = 40): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await pingDatabaseForReadiness(url, { timeoutMs: 1_000 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(
    `Disposable Postgres did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function assertNoInternalLeak(body: HealthBody): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/127\.0\.0\.1/);
  expect(serialized).not.toMatch(/ECONNREFUSED/i);
  expect(serialized).not.toMatch(/password/i);
  expect(serialized).not.toMatch(/postgresql:\/\//i);
  expect(serialized).not.toMatch(/postgres:postgres/i);
  expect(serialized).not.toMatch(/AggregateError/i);
  expect(serialized).not.toMatch(/timed out after/i);
}

describe('GET /api/health honest readiness (RT-3, no Docker)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 503 when db context is missing', async () => {
    delete process.env.DATABASE_URL;
    const app = createHealthApp(undefined);
    const res = await app.request('/api/health');

    expect(res.status).toBe(503);
    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe('degraded');
    expect(body.service).toBe('dns-ops-web');
    expect(body.timestamp).toBeTruthy();
    expect(body.warning).toMatch(/Database connection not available/i);
    assertNoInternalLeak(body);
  });

  it('returns 503 when DATABASE_URL is missing even if db is present', async () => {
    delete process.env.DATABASE_URL;
    // Presence of adapter alone must not green the probe.
    const unreachable = createPostgresAdapter(REFUSED_DB_URL);
    const app = createHealthApp(unreachable);

    const res = await app.request('/api/health');
    expect(res.status).toBe(503);

    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe('degraded');
    assertNoInternalLeak(body);
  });

  it('returns 503 when DB port refuses connections (false-green regression)', async () => {
    process.env.DATABASE_URL = REFUSED_DB_URL;
    const unreachable = createPostgresAdapter(REFUSED_DB_URL);
    const app = createHealthApp(unreachable);

    const res = await app.request('/api/health');
    expect(res.status).toBe(503);

    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe('degraded');
    expect(body.service).toBe('dns-ops-web');
    expect(body.warning).toBeTruthy();
    assertNoInternalLeak(body);
  });
});

/**
 * Opt-in healthy DB path. Never runs from DATABASE_URL alone.
 *
 *   RUN_DB_INTEGRATION_TESTS=1 bunx vitest run apps/web/hono/routes/health.ready.test.ts
 */
describe('GET /api/health disposable Postgres (integration)', () => {
  const originalEnv = { ...process.env };
  const describeIfDb = RUN_DB_INTEGRATION ? describe : describe.skip;

  let disposable:
    | {
        containerName: string;
        databaseUrl: string;
      }
    | undefined;
  let containerNameForCleanup: string | undefined;

  beforeAll(async () => {
    if (!RUN_DB_INTEGRATION) return;

    const port = await getFreePort();
    const containerName = `dns-ops-rt3-web-health-${process.pid}-${port}`;
    containerNameForCleanup = containerName;
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

    try {
      spawn(
        'docker',
        [
          'run',
          '--rm',
          '--name',
          containerName,
          '-e',
          'POSTGRES_PASSWORD=postgres',
          '-p',
          `127.0.0.1:${port}:5432`,
          'postgres:16-alpine',
        ],
        { stdio: 'ignore', detached: true }
      ).unref();

      await waitForPostgres(databaseUrl);
      disposable = { containerName, databaseUrl };
    } catch (error) {
      try {
        execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
      } catch {
        // best-effort cleanup when setup fails
      }
      containerNameForCleanup = undefined;
      throw error;
    }
  }, 60_000);

  afterAll(() => {
    const name = disposable?.containerName ?? containerNameForCleanup;
    if (!name) return;
    try {
      execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
    } catch {
      // best-effort cleanup
    }
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describeIfDb('when RUN_DB_INTEGRATION_TESTS=1', () => {
    it('returns 200 only after a real query against disposable local DB', async () => {
      if (!disposable) throw new Error('Disposable Postgres was not started');
      process.env.DATABASE_URL = disposable.databaseUrl;
      const db = createPostgresAdapter(disposable.databaseUrl);
      const app = createHealthApp(db);

      const res = await app.request('/api/health');
      expect(res.status).toBe(200);

      const body = (await res.json()) as HealthBody;
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('dns-ops-web');
      expect(body.timestamp).toBeTruthy();
      expect(body.warning).toBeUndefined();
      assertNoInternalLeak(body);
    });
  });
});
