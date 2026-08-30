/**
 * RT-3: Collector honest readiness
 *
 * Behavioral tests proving:
 * - /healthz, /health, /api/health are process-only liveness (200 without DB)
 * - /readyz runs a real bounded DB query (not adapter construction)
 * - unreachable DB → 503 with public-safe messages (no driver/host leaks)
 * - WORKER_ENABLED=true with bad/missing Redis → 503 (not 500)
 * - blackhole/timeout path is covered via @dns-ops/db ping unit tests
 *
 * Healthy disposable Postgres is opt-in only:
 *   RUN_DB_INTEGRATION_TESTS=1
 * Default unit runs never require Docker.
 */

import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pingDatabaseForReadiness } from '@dns-ops/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from './index.js';
import { closeQueues } from './jobs/queue.js';
import { PUBLIC_DB_NOT_READY_MESSAGE, resetSharedDbAdapterForTests } from './middleware/db.js';

const REFUSED_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:1/postgres';
const REFUSED_REDIS_URL = 'redis://127.0.0.1:1';
const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION_TESTS === '1';

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

function assertNoInternalLeak(body: ReadyzBody): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/127\.0\.0\.1/);
  expect(serialized).not.toMatch(/ECONNREFUSED/i);
  expect(serialized).not.toMatch(/password/i);
  expect(serialized).not.toMatch(/postgresql:\/\//i);
  expect(serialized).not.toMatch(/postgres:postgres/i);
  expect(serialized).not.toMatch(/AggregateError/i);
}

describe('Collector onError body', () => {
  it('returns a generic 500 and does not leak err.message', async () => {
    const leakedDetail = 'internal-db-host-should-not-leak';
    app.get('/__test/onerror-leak', () => {
      throw new Error(leakedDetail);
    });

    const res = await app.request('/__test/onerror-leak', {
      headers: { 'X-Request-ID': 'req-onerror-leak' },
    });
    expect(res.status).toBe(500);

    const bodyText = await res.text();
    expect(bodyText).not.toContain(leakedDetail);
    const body = JSON.parse(bodyText) as { error: string; message?: string; requestId?: string };
    expect(body.error).toBe('Internal Server Error');
    expect(body.message).toBeUndefined();
    expect(body.requestId).toBe('req-onerror-leak');
  });
});

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

describe('Collector /readyz honest DB readiness (no Docker)', () => {
  const originalEnv = { ...process.env };

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

  it('returns 503 when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);

    const body = (await res.json()) as ReadyzBody;
    expect(body.status).toBe('not_ready');
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.database.message).toBe(PUBLIC_DB_NOT_READY_MESSAGE);
    assertNoInternalLeak(body);
  });

  it('returns 503 when DATABASE_URL points at a refused port', async () => {
    process.env.DATABASE_URL = REFUSED_DB_URL;

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);

    const body = (await res.json()) as ReadyzBody;
    expect(body.status).toBe('not_ready');
    expect(body.service).toBe('dns-ops-collector');
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.database.message).toBe(PUBLIC_DB_NOT_READY_MESSAGE);
    assertNoInternalLeak(body);
  });

  it('with WORKER_ENABLED=true and missing REDIS_URL returns 503 (not 500)', async () => {
    // DB will fail (refused) OR we only care that queue/worker checks run as 503.
    // Use refused DB so this stays Docker-free; database is error, queues/workers too.
    process.env.DATABASE_URL = REFUSED_DB_URL;
    process.env.WORKER_ENABLED = 'true';
    delete process.env.REDIS_URL;

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(500);

    const body = (await res.json()) as ReadyzBody;
    expect(body.status).toBe('not_ready');
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.queues.status).toBe('error');
    expect(body.checks.queues.message).toBe('Queue connection unavailable');
    expect(body.checks.workers.status).toBe('error');
    expect(body.checks.workers.message).toBe('Workers not running');
    assertNoInternalLeak(body);
  });

  it('with WORKER_ENABLED=true and refused Redis returns 503 (not 500)', async () => {
    process.env.DATABASE_URL = REFUSED_DB_URL;
    process.env.WORKER_ENABLED = 'true';
    process.env.REDIS_URL = REFUSED_REDIS_URL;

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(500);

    const body = (await res.json()) as ReadyzBody;
    expect(body.status).toBe('not_ready');
    expect(body.checks.queues.status).toBe('error');
    expect(body.checks.queues.message).toBe('Queue connection unavailable');
    assertNoInternalLeak(body);
  }, 15_000);
});

/**
 * Opt-in healthy DB path. Never runs from DATABASE_URL alone.
 *
 *   RUN_DB_INTEGRATION_TESTS=1 bunx vitest run apps/collector/src/index.test.ts
 */
describe('Collector /readyz disposable Postgres (integration)', () => {
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
    const containerName = `dns-ops-rt3-readyz-${process.pid}-${port}`;
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
    delete process.env.WORKER_ENABLED;
    delete process.env.REDIS_URL;
    resetSharedDbAdapterForTests();
  });

  afterEach(async () => {
    await closeQueues().catch(() => undefined);
    resetSharedDbAdapterForTests();
    process.env = { ...originalEnv };
  });

  describeIfDb('when RUN_DB_INTEGRATION_TESTS=1', () => {
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

    it('with WORKER_ENABLED=true and missing REDIS_URL keeps DB ok and returns 503', async () => {
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
      assertNoInternalLeak(body);
    });
  });
});
