/**
 * Integration test for scripts/run-migrations.mjs
 *
 * Acceptance (TB-0 Fix 1): a fresh migration against an empty ledger is applied
 * AND recorded in `_migrations_applied`; a second run SKIPS it — the side effect
 * happens exactly once.
 *
 * Requires a real PostgreSQL. Mirrors CI's PG15 service container: the test
 * creates an isolated dedicated database, so it never touches whatever
 * DATABASE_URL points at. Skipped entirely when DATABASE_URL is unset.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './run-migrations.mjs';

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Dedicated test database. Created fresh in beforeAll, dropped in afterAll.
 * Fixed name (not random) — CI and local runs are single-tenant; a recognizable
 * name aids debugging if a run is interrupted and leaves it behind.
 */
const TEST_DB_NAME = 'dns_ops_tb0_migtest';

/** Connection string to the same server's `postgres` maintenance database. */
const SERVER_URL = (() => {
  if (!DATABASE_URL) return '';
  const u = new URL(DATABASE_URL);
  u.pathname = '/postgres';
  return u.toString();
})();

/** Connection string to the dedicated test database on the same server. */
const TEST_DB_URL = (() => {
  if (!DATABASE_URL) return '';
  const u = new URL(DATABASE_URL);
  u.pathname = `/${TEST_DB_NAME}`;
  return u.toString();
})();

/** Second dedicated database for the legacy-bootstrap scenario (independent lifecycle). */
const LEGACY_DB_NAME = 'dns_ops_tb0_migtest_legacy';
const LEGACY_DB_URL = (() => {
  if (!DATABASE_URL) return '';
  const u = new URL(DATABASE_URL);
  u.pathname = `/${LEGACY_DB_NAME}`;
  return u.toString();
})();

/** Marker table the test migration creates — non-idempotent (no IF NOT EXISTS). */
const MARKER_TABLE = '_tb0_run_once_marker';

function markerMigrationSql(): string {
  return [
    `CREATE TABLE ${MARKER_TABLE} (id integer PRIMARY KEY, n integer NOT NULL);`,
    `INSERT INTO ${MARKER_TABLE} (id, n) VALUES (1, 1);`,
    '',
  ].join('\n');
}

async function withClient(url: string, fn: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

// `skipIf(!DATABASE_URL)` — runs in CI (DATABASE_URL always set) and locally when
// a Postgres is reachable; skipped otherwise so `bun run test` never fails for
// lacking a database.
describe.skipIf(!DATABASE_URL)('run-migrations integration (real PostgreSQL)', () => {
  let migrationDir: string;

  beforeAll(async () => {
    // Fresh dedicated database — isolated from DATABASE_URL's own database.
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    });

    // Isolated migration directory with a NON-idempotent test migration.
    // No IF NOT EXISTS: if the runner erroneously re-applied it, CREATE TABLE
    // would raise "already exists" — so a clean second run proves the ledger
    // skip is real, not masked by idempotent SQL.
    migrationDir = mkdtempSync(join(tmpdir(), 'tb0-migrations-'));
    writeFileSync(join(migrationDir, '0011_test.sql'), markerMigrationSql());
  });

  afterAll(async () => {
    if (migrationDir) {
      rmSync(migrationDir, { recursive: true, force: true });
    }
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    });
  });

  it('applies a fresh migration and records it in the ledger', async () => {
    const result = await runMigrations({ databaseUrl: TEST_DB_URL, migrationDir });

    expect(result.applied).toContain('0011_test.sql');

    await withClient(TEST_DB_URL, async (client) => {
      const marker = await client.query(`SELECT n FROM ${MARKER_TABLE}`);
      // Live success precondition: the migration's side effect happened.
      expect(marker.rows).toHaveLength(1);
      expect(marker.rows[0].n).toBe(1);

      const ledger = await client.query(
        "SELECT name, checksum FROM _migrations_applied WHERE name = '0011_test.sql'"
      );
      expect(ledger.rows).toHaveLength(1);
      expect(String(ledger.rows[0].checksum)).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('skips an already-recorded migration on re-run (side effect happens exactly once)', async () => {
    const result = await runMigrations({ databaseUrl: TEST_DB_URL, migrationDir });

    // Boundary complement to the first test: previously applied → now skipped.
    expect(result.applied).not.toContain('0011_test.sql');
    expect(result.skipped).toContain('0011_test.sql');

    await withClient(TEST_DB_URL, async (client) => {
      const marker = await client.query(`SELECT count(*)::int AS c FROM ${MARKER_TABLE}`);
      // Exactly once — the runner did not re-execute the migration.
      expect(marker.rows[0].c).toBe(1);

      const ledger = await client.query(
        "SELECT count(*)::int AS c FROM _migrations_applied WHERE name = '0011_test.sql'"
      );
      // Ledger row not duplicated.
      expect(ledger.rows[0].c).toBe(1);
    });
  });
});

// A database populated by the legacy (pre-ledger) runner already has the
// migration's objects. The bridge must record such a migration as applied
// instead of failing the deploy — and must NOT count it as freshly applied.
describe.skipIf(!DATABASE_URL)('run-migrations legacy bootstrap bridge (real PostgreSQL)', () => {
  let migrationDir: string;

  beforeAll(async () => {
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${LEGACY_DB_NAME}`);
      await admin.query(`CREATE DATABASE ${LEGACY_DB_NAME}`);
    });
    // Simulate a legacy database: the migration's table already exists.
    await withClient(LEGACY_DB_URL, async (legacy) => {
      await legacy.query(
        `CREATE TABLE ${MARKER_TABLE} (id integer PRIMARY KEY, n integer NOT NULL)`
      );
    });
    migrationDir = mkdtempSync(join(tmpdir(), 'tb0-migrations-legacy-'));
    writeFileSync(join(migrationDir, '0011_test.sql'), markerMigrationSql());
  });

  afterAll(async () => {
    if (migrationDir) {
      rmSync(migrationDir, { recursive: true, force: true });
    }
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${LEGACY_DB_NAME}`);
    });
  });

  it('records an already-existing migration as bootstrapped, not applied', async () => {
    const result = await runMigrations({ databaseUrl: LEGACY_DB_URL, migrationDir });

    expect(result.applied).not.toContain('0011_test.sql');
    expect(result.bootstrapped).toContain('0011_test.sql');

    await withClient(LEGACY_DB_URL, async (client) => {
      const ledger = await client.query(
        "SELECT name, checksum FROM _migrations_applied WHERE name = '0011_test.sql'"
      );
      expect(ledger.rows).toHaveLength(1);
      expect(String(ledger.rows[0].checksum)).toMatch(/^[0-9a-f]{64}$/);

      // The INSERT from the migration did NOT execute (the CREATE raised
      // "already exists" first and the transaction rolled back) — marker stays empty.
      const marker = await client.query(`SELECT count(*)::int AS c FROM ${MARKER_TABLE}`);
      expect(marker.rows[0].c).toBe(0);
    });
  });

  it('skips the bootstrapped migration on the next run (ledger now populated)', async () => {
    const result = await runMigrations({ databaseUrl: LEGACY_DB_URL, migrationDir });

    expect(result.applied).not.toContain('0011_test.sql');
    expect(result.bootstrapped).not.toContain('0011_test.sql');
    expect(result.skipped).toContain('0011_test.sql');
  });
});
