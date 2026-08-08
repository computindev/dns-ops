/**
 * RT-4: db middleware must not run migrations or schema repair on request.
 *
 * Unit path asserts the middleware only attaches a db adapter.
 * Integration path (DATABASE_URL set) proves a first request after release
 * migrations does not create a second migration ledger or change columns.
 */
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

type ReleaseMigrationRunner = (options: {
  databaseUrl: string;
  migrationDir: string;
}) => Promise<{ applied: string[]; skipped: string[] }>;

async function loadReleaseMigrations(): Promise<ReleaseMigrationRunner> {
  // Release runner is plain ESM; no package types ship with scripts/*.mjs.
  // @ts-expect-error TS7016: no declaration file for scripts/run-migrations.mjs
  const mod = (await import('../../../../scripts/run-migrations.mjs')) as {
    runMigrations: ReleaseMigrationRunner;
  };
  return mod.runMigrations;
}

const DATABASE_URL = process.env.DATABASE_URL;
const TEST_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const REAL_MIGRATION_DIR = resolve(TEST_FILE_DIR, '../../../../packages/db/src/migrations');
const TEST_DB_NAME = 'dns_ops_rt4_no_request_ddl';

const SERVER_URL = (() => {
  if (!DATABASE_URL) return '';
  const u = new URL(DATABASE_URL);
  u.pathname = '/postgres';
  return u.toString();
})();

const TEST_DB_URL = (() => {
  if (!DATABASE_URL) return '';
  const u = new URL(DATABASE_URL);
  u.pathname = `/${TEST_DB_NAME}`;
  u.searchParams.set('sslmode', 'disable');
  return u.toString();
})();

async function withClient(url: string, fn: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function loadMiddleware() {
  vi.resetModules();
  return import('./db.js');
}

describe('RT-4: db middleware is not a schema writer', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('attaches db on the first API request without importing schema writers', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://localhost/rt4_middleware_unit?sslmode=disable';

    const { dbMiddleware } = await loadMiddleware();
    const app = new Hono<Env>();
    app.use('*', dbMiddleware);
    app.get('/api/domains', (c) => {
      const db = c.get('db');
      return c.json({ hasDatabase: !!db });
    });

    const response = await app.request('/api/domains');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { hasDatabase: boolean };
    expect(body.hasDatabase).toBe(true);

    // Dead request-time migrate module must stay gone (no second ledger).
    await expect(access(resolve(TEST_FILE_DIR, '../lib/migrate.ts'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('still attaches db without schema side effects on repeated requests', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://localhost/rt4_middleware_unit?sslmode=disable';

    const { dbMiddleware } = await loadMiddleware();
    const app = new Hono<Env>();
    app.use('*', dbMiddleware);
    app.get('/api/health', (c) => c.json({ hasDatabase: !!c.get('db') }));

    for (let i = 0; i < 3; i++) {
      const response = await app.request('/api/health');
      expect(response.status).toBe(200);
      expect(((await response.json()) as { hasDatabase: boolean }).hasDatabase).toBe(true);
    }
  });
});

describe.skipIf(!DATABASE_URL)('RT-4: first request after release migrations issues no DDL', () => {
  let columnSnapshotBefore: string[];
  let releaseLedgerCount: number;

  beforeAll(async () => {
    const runMigrations = await loadReleaseMigrations();

    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    });

    const applied = await runMigrations({
      databaseUrl: TEST_DB_URL,
      migrationDir: REAL_MIGRATION_DIR,
    });
    if (applied.applied.length === 0) {
      throw new Error('Pre-flight: expected release migrations to apply on fresh DB');
    }

    await withClient(TEST_DB_URL, async (client) => {
      const cols = await client.query<{ q: string }>(
        `SELECT table_name || '.' || column_name AS q
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY 1`
      );
      columnSnapshotBefore = cols.rows.map((row) => row.q);

      const ledger = await client.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM _migrations_applied`
      );
      releaseLedgerCount = ledger.rows[0].c;

      const drizzleLedger = await client.query(
        `SELECT to_regclass('public.__drizzle_migrations') AS relation`
      );
      expect(drizzleLedger.rows[0].relation).toBeNull();
    });
  });

  afterAll(async () => {
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    });
  });

  it('serves a first request without creating request-time migration state or altering columns', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = TEST_DB_URL;

    const { dbMiddleware } = await loadMiddleware();
    const app = new Hono<Env>();
    app.use('*', dbMiddleware);
    app.get('/api/domains', async (c) => {
      const db = c.get('db');
      if (!db) return c.json({ error: 'no db' }, 500);
      await db.execute(sql`SELECT 1 AS ok`);
      return c.json({ ok: true });
    });

    const response = await app.request('/api/domains');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    await withClient(TEST_DB_URL, async (client) => {
      const drizzleLedger = await client.query(
        `SELECT to_regclass('public.__drizzle_migrations') AS relation`
      );
      expect(drizzleLedger.rows[0].relation).toBeNull();

      const cols = await client.query<{ q: string }>(
        `SELECT table_name || '.' || column_name AS q
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY 1`
      );
      expect(cols.rows.map((row) => row.q)).toEqual(columnSnapshotBefore);

      const ledger = await client.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM _migrations_applied`
      );
      expect(ledger.rows[0].c).toBe(releaseLedgerCount);
    });
  });
});
