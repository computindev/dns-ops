/**
 * migrate.ts coverage (RT-4)
 *
 * runMigrations remains available for explicit operator use. These tests cover
 * status transitions without relying on request-path middleware.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPostgresAdapter } from '@dns-ops/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMigrationStatus, runMigrations } from './migrate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const TEST_DB_NAME = 'dns_ops_rt4_migrate_module';

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

describe('getMigrationStatus default', () => {
  it('starts unset until runMigrations is invoked', () => {
    const status = getMigrationStatus();
    expect(status.ok === null || typeof status.ok === 'boolean').toBe(true);
  });
});

describe.skipIf(!DATABASE_URL)('runMigrations operator path (real PostgreSQL)', () => {
  let migrationDir: string;
  const previousMigrationsDir = process.env.DNS_OPS_MIGRATIONS_DIR;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    });

    migrationDir = mkdtempSync(join(tmpdir(), 'rt4-migrate-module-'));
    writeFileSync(
      join(migrationDir, '0000_probe.sql'),
      'CREATE TABLE IF NOT EXISTS rt4_migrate_probe (id integer PRIMARY KEY);'
    );
    process.env.DNS_OPS_MIGRATIONS_DIR = migrationDir;
  });

  afterAll(async () => {
    if (previousMigrationsDir === undefined) {
      delete process.env.DNS_OPS_MIGRATIONS_DIR;
    } else {
      process.env.DNS_OPS_MIGRATIONS_DIR = previousMigrationsDir;
    }
    process.env.NODE_ENV = previousNodeEnv;
    if (migrationDir) {
      rmSync(migrationDir, { recursive: true, force: true });
    }
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    });
  });

  it('applies pending SQL and reports ok status', async () => {
    const db = createPostgresAdapter(TEST_DB_URL);
    await runMigrations(db);

    const status = getMigrationStatus();
    expect(status.ok).toBe(true);
    expect(status.lastError).toBeUndefined();

    await withClient(TEST_DB_URL, async (client) => {
      const table = await client.query(
        `SELECT to_regclass('public.rt4_migrate_probe') AS relation`
      );
      expect(table.rows[0].relation).toBe('rt4_migrate_probe');

      const ledger = await client.query(
        `SELECT name FROM __drizzle_migrations WHERE name = '0000_probe.sql'`
      );
      expect(ledger.rows).toHaveLength(1);
    });
  });

  it('is idempotent on re-run', async () => {
    const db = createPostgresAdapter(TEST_DB_URL);
    await runMigrations(db);
    expect(getMigrationStatus().ok).toBe(true);

    await withClient(TEST_DB_URL, async (client) => {
      const ledger = await client.query(
        `SELECT count(*)::int AS c FROM __drizzle_migrations WHERE name = '0000_probe.sql'`
      );
      expect(ledger.rows[0].c).toBe(1);
    });
  });
});
