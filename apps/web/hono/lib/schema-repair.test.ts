/**
 * schema-repair unit + integration coverage (RT-4)
 *
 * repairSchema remains an explicit operator tool. After release migrations,
 * invoking it on a fully-migrated database must be a no-op (zero column fixes).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresAdapter } from '@dns-ops/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repairSchema, SCHEMA_REPAIR_COLUMNS } from './schema-repair.js';

type ReleaseMigrationRunner = (options: {
  databaseUrl: string;
  migrationDir: string;
}) => Promise<{ applied: string[]; skipped: string[] }>;

async function loadReleaseMigrations(): Promise<ReleaseMigrationRunner> {
  // Release runner is plain ESM; no package types ship with scripts/*.mjs.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ambient types not published for scripts/
  // @ts-expect-error TS7016: no declaration file for scripts/run-migrations.mjs
  const mod = (await import('../../../../scripts/run-migrations.mjs')) as {
    runMigrations: ReleaseMigrationRunner;
  };
  return mod.runMigrations;
}

const DATABASE_URL = process.env.DATABASE_URL;
const TEST_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const REAL_MIGRATION_DIR = resolve(TEST_FILE_DIR, '../../../../packages/db/src/migrations');
const TEST_DB_NAME = 'dns_ops_rt4_repair_noop';

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

describe('SCHEMA_REPAIR_COLUMNS catalog', () => {
  it('exports a non-empty unique table.column catalog', () => {
    expect(SCHEMA_REPAIR_COLUMNS.length).toBeGreaterThan(0);
    const keys = SCHEMA_REPAIR_COLUMNS.map(({ table, column }) => `${table}.${column}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of SCHEMA_REPAIR_COLUMNS) {
      expect(entry.sql.toUpperCase()).toContain('ADD COLUMN');
      expect(entry.sql).toContain(entry.column);
    }
  });
});

describe.skipIf(!DATABASE_URL)('repairSchema after release migrations', () => {
  beforeAll(async () => {
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    });

    const runMigrations = await loadReleaseMigrations();
    const result = await runMigrations({
      databaseUrl: TEST_DB_URL,
      migrationDir: REAL_MIGRATION_DIR,
    });
    if (result.applied.length === 0) {
      throw new Error('Pre-flight: expected release migrations to apply');
    }
  });

  afterAll(async () => {
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    });
  });

  it('applies zero fixes on a fully release-migrated database (idempotent no-op)', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const db = createPostgresAdapter(TEST_DB_URL);

      await withClient(TEST_DB_URL, async (client) => {
        const before = await client.query<{ c: string }>(
          `SELECT table_name || '.' || column_name AS c
           FROM information_schema.columns
           WHERE table_schema = 'public'
           ORDER BY 1`
        );
        const beforeCols = before.rows.map((row) => row.c);

        await repairSchema(db);
        await repairSchema(db);

        const after = await client.query<{ c: string }>(
          `SELECT table_name || '.' || column_name AS c
           FROM information_schema.columns
           WHERE table_schema = 'public'
           ORDER BY 1`
        );
        expect(after.rows.map((row) => row.c)).toEqual(beforeCols);

        const present = new Set(beforeCols);
        for (const { table, column } of SCHEMA_REPAIR_COLUMNS) {
          expect(present.has(`${table}.${column}`)).toBe(true);
        }
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
