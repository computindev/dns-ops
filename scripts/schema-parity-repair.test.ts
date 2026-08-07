/**
 * RT-4 schema parity proof
 *
 * After the release migration runner alone (scripts/run-migrations.mjs) applies
 * every forward SQL migration to a fresh database, every column historically
 * supplied by request-time repairSchema must already exist. repairSchema must
 * not be required to make the app schema complete.
 *
 * Skipped when DATABASE_URL is unset so unit CI without Postgres stays green.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCHEMA_REPAIR_COLUMNS } from '../apps/web/hono/lib/schema-repair.js';
import { runMigrations } from './run-migrations.mjs';

const DATABASE_URL = process.env.DATABASE_URL;

const TEST_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const REAL_MIGRATION_DIR = resolve(TEST_FILE_DIR, '../packages/db/src/migrations');
const TEST_DB_NAME = 'dns_ops_rt4_schema_parity';

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

describe.skipIf(!DATABASE_URL)('RT-4: release migrations supply repairSchema columns', () => {
  let firstRun: { applied: string[]; skipped: string[] };

  beforeAll(async () => {
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    });

    firstRun = await runMigrations({
      databaseUrl: TEST_DB_URL,
      migrationDir: REAL_MIGRATION_DIR,
    });

    if (firstRun.applied.length === 0) {
      throw new Error(
        `Pre-flight: expected fresh release migrations to apply, got ${JSON.stringify(firstRun)}`
      );
    }
  });

  afterAll(async () => {
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    });
  });

  it('applies the full forward migration set on a fresh database', () => {
    expect(firstRun.applied.length).toBeGreaterThan(0);
    expect(firstRun.skipped).toEqual([]);
    // Ledger-backed runner must record every on-disk SQL migration.
    expect(firstRun.applied.some((name) => name.startsWith('0000_'))).toBe(true);
  });

  it('includes every repairSchema column without running repairSchema', async () => {
    expect(SCHEMA_REPAIR_COLUMNS.length).toBeGreaterThan(0);

    await withClient(TEST_DB_URL, async (client) => {
      const existing = await client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'`
      );
      const cols = new Set(existing.rows.map((row) => `${row.table_name}.${row.column_name}`));

      const missing = SCHEMA_REPAIR_COLUMNS.filter(
        ({ table, column }) => !cols.has(`${table}.${column}`)
      ).map(({ table, column }) => `${table}.${column}`);

      expect(
        missing,
        `Release migrations alone missing repair columns: ${missing.join(', ')}`
      ).toEqual([]);
    });
  });

  it('is idempotent on a second release-migration run', async () => {
    const second = await runMigrations({
      databaseUrl: TEST_DB_URL,
      migrationDir: REAL_MIGRATION_DIR,
    });

    expect(second.applied).toEqual([]);
    expect(second.skipped.length).toBe(firstRun.applied.length);
    expect(second.skipped).toEqual(expect.arrayContaining(firstRun.applied));
  });
});
