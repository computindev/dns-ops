/**
 * RT-3: Web /api/health honest readiness
 *
 * Railway readiness endpoint semantics:
 * - 503 when DB is missing or unreachable (real query fails)
 * - 200 only after a real SELECT 1 succeeds
 * - Preserve public response shape (status/service/timestamp[/warning])
 */

import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createPostgresAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import { apiRoutes } from './api.js';

const REFUSED_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:1/postgres';

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
    const client = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 1000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(
    `Disposable Postgres did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

describe('GET /api/health honest readiness (RT-3)', () => {
  let disposable:
    | {
        containerName: string;
        databaseUrl: string;
      }
    | undefined;

  beforeAll(async () => {
    const port = await getFreePort();
    const containerName = `dns-ops-rt3-web-health-${process.pid}-${port}`;
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

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
  }, 60_000);

  afterAll(() => {
    if (!disposable) return;
    try {
      execFileSync('docker', ['rm', '-f', disposable.containerName], { stdio: 'ignore' });
    } catch {
      // best-effort cleanup
    }
  });

  it('returns 503 when db context is missing', async () => {
    const app = createHealthApp(undefined);
    const res = await app.request('/api/health');

    expect(res.status).toBe(503);
    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe('degraded');
    expect(body.service).toBe('dns-ops-web');
    expect(body.timestamp).toBeTruthy();
    expect(body.warning).toMatch(/Database connection not available/i);
  });

  it('returns 503 when DB port refuses connections (false-green regression)', async () => {
    const unreachable = createPostgresAdapter(REFUSED_DB_URL);
    const app = createHealthApp(unreachable);

    const res = await app.request('/api/health');
    expect(res.status).toBe(503);

    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe('degraded');
    expect(body.service).toBe('dns-ops-web');
    expect(body.warning).toBeTruthy();
  });

  it('returns 200 only after a real query against disposable local DB', async () => {
    if (!disposable) throw new Error('Disposable Postgres was not started');
    const db = createPostgresAdapter(disposable.databaseUrl);
    const app = createHealthApp(db);

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('dns-ops-web');
    expect(body.timestamp).toBeTruthy();
    expect(body.warning).toBeUndefined();
  });
});
