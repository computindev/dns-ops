/**
 * Migration 0011 (findings.ruleset_version_id NOT NULL) — integration test.
 *
 * Acceptance (TB-3 prerequisite, step 0): pre-migration rows with NULL
 * findings.ruleset_version_id are backfilled to the active ruleset version's
 * id, the column becomes NOT NULL, and a subsequent insert with NULL is
 * REJECTED by the database while an insert with a valid id SUCCEEDS.
 *
 * Mirrors the DB-provisioning pattern from run-migrations.test.ts: creates an
 * isolated dedicated database from DATABASE_URL, so it never touches whatever
 * DATABASE_URL points at. SKIPS cleanly when DATABASE_URL is unset — the gate
 * stays green without a Postgres reachable.
 *
 * Strategy: build the schema with the REAL migration set MINUS 0011, seed NULL
 * findings, then add 0011 and run again (0000-0010 skip via the
 * _migrations_applied ledger; only 0011 executes). This exercises the actual
 * production migration SQL rather than a re-typed copy.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './run-migrations.mjs';

const DATABASE_URL = process.env.DATABASE_URL;

const TEST_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const REAL_MIGRATION_DIR = resolve(TEST_FILE_DIR, '../packages/db/src/migrations');
const MIGRATION_0011 = readdirSync(REAL_MIGRATION_DIR).find(
  (file) => file.startsWith('0011_') && file.endsWith('.sql')
);

if (!MIGRATION_0011) {
  throw new Error(
    'Pre-flight: could not find 0011_*.sql in packages/db/src/migrations. ' +
      'Has the migration been added?'
  );
}

const TEST_DB_NAME = 'dns_ops_tb3_ruleset_notnull';

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

describe.skipIf(!DATABASE_URL)('migration 0011: findings.ruleset_version_id NOT NULL', () => {
  let migrationDir: string;
  let activeVersionId: string;
  let snapshotId: string;
  let applyResult: { applied: string[]; skipped: string[]; bootstrapped: string[] };

  beforeAll(async () => {
    // 1. Fresh dedicated database.
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    });

    // 2. Copy the real migration set, then REMOVE 0011 so the first run builds
    //    the schema at the pre-0011 state (findings.ruleset_version_id still
    //    nullable).
    migrationDir = mkdtempSync(join(tmpdir(), 'tb3-ruleset-notnull-'));
    cpSync(REAL_MIGRATION_DIR, migrationDir, { recursive: true });
    rmSync(join(migrationDir, MIGRATION_0011));

    const initial = await runMigrations({ databaseUrl: TEST_DB_URL, migrationDir });
    if (initial.applied.length === 0) {
      throw new Error(
        `Pre-flight: expected the schema migrations to apply fresh, but none ran. applied=${JSON.stringify(initial)}`
      );
    }

    // 3. Seed an active ruleset version, a domain, a snapshot, and two findings
    //    with NULL ruleset_version_id (the pre-migration state the backfill
    //    must fix). Capture ids for later assertions.
    await withClient(TEST_DB_URL, async (client) => {
      const rv = await client.query(
        `INSERT INTO ruleset_versions (version, name, description, rules, active, created_by)
         VALUES ('tb3-test-1', 'TB3 test', 'desc', '[]'::jsonb, TRUE, 'test')
         RETURNING id`
      );
      activeVersionId = rv.rows[0].id;

      const dom = await client.query(
        `INSERT INTO domains (name, normalized_name)
         VALUES ('example.com', 'example.com')
         RETURNING id`
      );
      const domainId = dom.rows[0].id;

      const snap = await client.query(
        `INSERT INTO snapshots
           (domain_id, domain_name, result_state, queried_names, queried_types,
            vantages, zone_management, triggered_by)
         VALUES
           ($1, 'example.com', 'complete'::result_state, '[]'::jsonb, '[]'::jsonb,
            '[]'::jsonb, 'unknown'::zone_management, 'test')
         RETURNING id`,
        [domainId]
      );
      snapshotId = snap.rows[0].id;

      // Two NULL findings — distinct (rule_id, type) so the unique index can't
      // collide once they share the backfilled ruleset_version_id.
      await client.query(
        `INSERT INTO findings
           (snapshot_id, type, title, description, severity, confidence,
            risk_posture, blast_radius, evidence, rule_id, rule_version,
            ruleset_version_id)
         VALUES
           ($1, 'type-a', 'ta', 'da', 'low'::severity, 'certain'::confidence,
            'low'::risk_posture, 'single-domain'::blast_radius, '[]'::jsonb,
            'rule-a', '1.0', NULL),
           ($1, 'type-b', 'tb', 'db', 'low'::severity, 'certain'::confidence,
            'low'::risk_posture, 'single-domain'::blast_radius, '[]'::jsonb,
            'rule-b', '1.0', NULL)`,
        [snapshotId]
      );
    });

    // 4. Stage 0011 and run again. The ledger skips 0000-0010; only 0011 runs.
    cpSync(join(REAL_MIGRATION_DIR, MIGRATION_0011), join(migrationDir, MIGRATION_0011));
    applyResult = await runMigrations({ databaseUrl: TEST_DB_URL, migrationDir });
  });

  afterAll(async () => {
    if (migrationDir) {
      rmSync(migrationDir, { recursive: true, force: true });
    }
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    });
  });

  it('runs migration 0011 fresh (and skips the already-applied schema migrations)', () => {
    expect(existsSync(join(REAL_MIGRATION_DIR, MIGRATION_0011))).toBe(true);
    expect(applyResult.applied).toContain(MIGRATION_0011);
    // The schema migrations were applied in beforeAll and recorded in the
    // ledger — the second run must skip them, not re-execute.
    expect(applyResult.skipped.length).toBeGreaterThan(0);
  });

  it('backfills NULL findings.ruleset_version_id to the active ruleset version', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      const rows = await client.query(`SELECT ruleset_version_id FROM findings ORDER BY rule_id`);
      // Live success precondition: the seeded rows are still there.
      expect(rows.rows.length).toBe(2);
      for (const row of rows.rows) {
        expect(row.ruleset_version_id).toBe(activeVersionId);
      }
    });
  });

  it('enforces NOT NULL on findings.ruleset_version_id at the column level', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      const cols = await client.query(
        `SELECT is_nullable
         FROM information_schema.columns
         WHERE table_name = 'findings' AND column_name = 'ruleset_version_id'`
      );
      expect(cols.rows.length).toBe(1);
      expect(cols.rows[0].is_nullable).toBe('NO');
    });
  });

  it('REJECTS a findings insert with NULL ruleset_version_id', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      // 23502 = not_null_violation. Provide valid values for every other column
      // so the only reason this fails is the NOT NULL on ruleset_version_id.
      await expect(
        client.query(
          `INSERT INTO findings
             (snapshot_id, type, title, description, severity, confidence,
              risk_posture, blast_radius, evidence, rule_id, rule_version,
              ruleset_version_id)
           VALUES
             ($1, 'type-c', 'tc', 'dc', 'low'::severity, 'certain'::confidence,
              'low'::risk_posture, 'single-domain'::blast_radius, '[]'::jsonb,
              'rule-c', '1.0', NULL)`,
          [snapshotId]
        )
      ).rejects.toMatchObject({ code: '23502' });
    });
  });

  // Boundary complement: the NOT-NULL rejection above is only meaningful if a
  // well-formed insert (valid ruleset_version_id) still succeeds — otherwise the
  // rejection could be vacuous (some other constraint blocking all inserts).
  it('ACCEPTS a findings insert with a valid ruleset_version_id (boundary complement)', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      const inserted = await client.query(
        `INSERT INTO findings
           (snapshot_id, type, title, description, severity, confidence,
            risk_posture, blast_radius, evidence, rule_id, rule_version,
            ruleset_version_id)
         VALUES
           ($1, 'type-d', 'td', 'dd', 'low'::severity, 'certain'::confidence,
            'low'::risk_posture, 'single-domain'::blast_radius, '[]'::jsonb,
            'rule-d', '1.0', $2)
         RETURNING id, ruleset_version_id`,
        [snapshotId, activeVersionId]
      );
      expect(inserted.rows.length).toBe(1);
      expect(inserted.rows[0].ruleset_version_id).toBe(activeVersionId);
    });
  });
});
