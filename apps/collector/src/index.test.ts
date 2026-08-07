/**
 * RT-3: Collector honest readiness
 *
 * Behavioral tests proving:
 * - /healthz, /health, /api/health are process-only liveness (200 without DB)
 * - /readyz runs a real DB query (not adapter construction)
 * - unreachable DB → 503
 * - reachable disposable DB → 200 (when workers not required)
 * - WORKER_ENABLED=true with bad/missing Redis → 503 (not 500)
 */

import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from './index.js';
import { closeQueues } from './jobs/queue.js';
import { resetSharedDbAdapterForTests } from './middleware/db.js';

const REFUSED_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:1/postgres';
const REFUSED_REDIS_URL = 'redis://127.0.0.1:1';

type ReadyzBody = {
  status: 'ready' | 'not_ready';
  service: string;
  timestamp: string;
  checks: Record<string, { status: 'ok' | 'error'; message?: string }>;
};

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

describe('Collector liveness (process-only)', () => {
  it('GET /healthz returns 200 without probing DB', async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    resetSharedDbAdapterForTests();

    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('dns-ops-collector');

    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  it('GET /health returns 200 without probing DB', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /api/health returns 200 without probing DB', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });
});

describe('Collector /readyz honest DB readiness', () => {
  const originalEnv = { ...process.env };
  let disposable:
    | {
        containerName: string;
        databaseUrl: string;
      }
    | undefined;

  beforeAll(async () => {
    const port = await getFreePort();
    const containerName = `dns-ops-rt3-readyz-${process.pid}-${port}`;
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

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WORKER_ENABLED;
    delete process.env.REDIS_URL;
    resetSharedDbAdapterForTests();
  });

  afterEach(async () => {
    await closeQueues().catch(() => undefined);
    resetSharedDbAdapterForTests();
    process.env = { ...originalEnv };
  });

  it('returns 503 when DATABASE_URL points at a refused port', async () => {
    process.env.DATABASE_URL = REFUSED_DB_URL;

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);

    const body = (await res.json()) as ReadyzBody;
    expect(body.status).toBe('not_ready');
    expect(body.service).toBe('dns-ops-collector');
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.database.message).toBeTruthy();
  });

  it('returns 200 after a real SELECT 1 against disposable local DB', async () => {
    if (!disposable) throw new Error('Disposable Postgres was not started');
    process.env.DATABASE_URL = disposable.databaseUrl;

    const res = await app.request('/readyz');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ReadyzBody;
    expect(body.status).toBe('ready');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.queues).toBeUndefined();
    expect(body.checks.workers).toBeUndefined();
  });

  it('with WORKER_ENABLED=true and missing REDIS_URL returns 503 (not 500)', async () => {
    if (!disposable) throw new Error('Disposable Postgres was not started');
    process.env.DATABASE_URL = disposable.databaseUrl;
    process.env.WORKER_ENABLED = 'true';
    delete process.env.REDIS_URL;

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(500);

    const body = (await res.json()) as ReadyzBody;
    expect(body.status).toBe('not_ready');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.queues.status).toBe('error');
    expect(body.checks.workers.status).toBe('error');
  });

  it('with WORKER_ENABLED=true and refused Redis returns 503 (not 500)', async () => {
    if (!disposable) throw new Error('Disposable Postgres was not started');
    process.env.DATABASE_URL = disposable.databaseUrl;
    process.env.WORKER_ENABLED = 'true';
    process.env.REDIS_URL = REFUSED_REDIS_URL;

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(500);

    const body = (await res.json()) as ReadyzBody;
    expect(body.status).toBe('not_ready');
    expect(body.checks.queues.status).toBe('error');
    expect(body.checks.queues.message).toBeTruthy();
  }, 15_000);
});
