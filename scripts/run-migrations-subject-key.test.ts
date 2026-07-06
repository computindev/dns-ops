/**
 * Migration 0012 (findings.subject_key + extended uniqueness index) — integration test.
 *
 * Acceptance (TB-3): pre-migration legacy findings get subject_key = '' after
 * migration; rows that collide under the NEW composite key
 * (snapshot_id, rule_id, type, subject_key, ruleset_version_id) are deterministically
 * deduped with acknowledgement/false-positive state PRESERVED on the survivor and
 * their suggestions RE-LINKED (not cascade-deleted); the column becomes NOT NULL;
 * the new index REJECTS a same-key insert and ALLOWS a differing-subject_key insert.
 *
 * Mirrors the DB-provisioning pattern from run-migrations-ruleset-version.test.ts:
 * creates an isolated dedicated database from DATABASE_URL (so it never touches
 * whatever DATABASE_URL points at). SKIPS cleanly when DATABASE_URL is unset —
 * the gate stays green without a Postgres reachable.
 *
 * Strategy: build the schema with the REAL migration set MINUS 0012, seed
 * duplicate findings (the old finding_unique_idx would normally block same-key
 * duplicates, so we drop it first to simulate an impaired-dedupe / restored-partial
 * database — exactly the state the migration's safety net must clean up), then add
 * 0012 and run again (0000-0011 skip via the _migrations_applied ledger; only 0012
 * executes). This exercises the actual production migration SQL.
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
const MIGRATION_0012 = readdirSync(REAL_MIGRATION_DIR).find(
  (file) => file.startsWith('0012_') && file.endsWith('.sql')
);

if (!MIGRATION_0012) {
  throw new Error(
    'Pre-flight: could not find 0012_*.sql in packages/db/src/migrations. ' +
      'Has the migration been added?'
  );
}

const TEST_DB_NAME = 'dns_ops_tb3_subject_key';

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

describe.skipIf(!DATABASE_URL)('migration 0012: findings.subject_key + unique idx', () => {
  let migrationDir: string;
  let activeVersionId: string;
  let snapshotId: string;
  let survivorId: string; // finding A (acknowledged) — kept by the dedupe
  let loserId: string; // finding B (not acknowledged) — deleted by the dedupe
  let distinctId: string; // finding C (different rule/type) — untouched
  let applyResult: { applied: string[]; skipped: string[]; bootstrapped: string[] };

  beforeAll(async () => {
    // 1. Fresh dedicated database.
    await withClient(SERVER_URL, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    });

    // 2. Copy the real migration set, then REMOVE 0012 so the first run builds
    //    the schema at the pre-0012 state (no subject_key column; old
    //    finding_unique_idx active).
    migrationDir = mkdtempSync(join(tmpdir(), 'tb3-subject-key-'));
    cpSync(REAL_MIGRATION_DIR, migrationDir, { recursive: true });
    rmSync(join(migrationDir, MIGRATION_0012));

    const initial = await runMigrations({ databaseUrl: TEST_DB_URL, migrationDir });
    if (initial.applied.length === 0) {
      throw new Error(
        `Pre-flight: expected the schema migrations to apply fresh, but none ran. applied=${JSON.stringify(initial)}`
      );
    }

    // 3. Seed: active ruleset version, domain, snapshot, then DUPLICATE findings
    //    sharing (snapshot_id, rule_id, type, ruleset_version_id). The old
    //    finding_unique_idx would block the second insert, so we DROP it first to
    //    simulate an impaired-dedupe database (the exact state the migration's
    //    safety net targets). Finding A is acknowledged (must survive); B is not
    //    (must be deleted, its suggestion re-linked to A). C is a distinct
    //    rule/type that must survive untouched.
    await withClient(TEST_DB_URL, async (client) => {
      const rv = await client.query(
        `INSERT INTO ruleset_versions (version, name, description, rules, active, created_by)
         VALUES ('tb3-test-2', 'TB3 subject key', 'desc', '[]'::jsonb, TRUE, 'test')
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

      // Drop the old uniqueness index so we can seed genuine same-key duplicates.
      await client.query(`DROP INDEX IF EXISTS "finding_unique_idx"`);

      // Finding A — acknowledged. The dedupe MUST keep this one.
      const a = await client.query(
        `INSERT INTO findings
           (snapshot_id, type, title, description, severity, confidence, risk_posture,
            blast_radius, evidence, rule_id, rule_version, ruleset_version_id,
            acknowledged_at, acknowledged_by)
         VALUES
           ($1, 'dns.authoritative-mismatch', 'A', 'desc-a', 'critical'::severity,
            'certain'::confidence, 'critical'::risk_posture,
            'single-domain'::blast_radius, '[]'::jsonb, 'rule-x', '1.0', $2,
            now(), 'tester')
         RETURNING id`,
        [snapshotId, activeVersionId]
      );
      survivorId = a.rows[0].id;

      // Finding B — same (snapshot, rule, type, ruleset_version) as A, NOT
      // acknowledged. The dedupe MUST delete this one (loser).
      const b = await client.query(
        `INSERT INTO findings
           (snapshot_id, type, title, description, severity, confidence, risk_posture,
            blast_radius, evidence, rule_id, rule_version, ruleset_version_id)
         VALUES
           ($1, 'dns.authoritative-mismatch', 'B', 'desc-b', 'critical'::severity,
            'certain'::confidence, 'critical'::risk_posture,
            'single-domain'::blast_radius, '[]'::jsonb, 'rule-x', '1.0', $2)
         RETURNING id`,
        [snapshotId, activeVersionId]
      );
      loserId = b.rows[0].id;

      // Finding C — distinct (rule, type). Must survive untouched.
      const c = await client.query(
        `INSERT INTO findings
           (snapshot_id, type, title, description, severity, confidence, risk_posture,
            blast_radius, evidence, rule_id, rule_version, ruleset_version_id)
         VALUES
           ($1, 'dns.cname-coexistence-conflict', 'C', 'desc-c', 'critical'::severity,
            'certain'::confidence, 'critical'::risk_posture,
            'single-domain'::blast_radius, '[]'::jsonb, 'rule-y', '1.0', $2)
         RETURNING id`,
        [snapshotId, activeVersionId]
      );
      distinctId = c.rows[0].id;

      // Suggestion on A and a suggestion on B. B's suggestion must be RE-LINKED
      // to A (preserved), not cascade-deleted with B.
      await client.query(
        `INSERT INTO suggestions (finding_id, title, description, action, risk_posture, blast_radius)
         VALUES
           ($1, 'S_A', 'keep on survivor', 'act-a', 'low'::risk_posture, 'single-domain'::blast_radius),
           ($2, 'S_B', 'must be re-linked', 'act-b', 'low'::risk_posture, 'single-domain'::blast_radius)`,
        [survivorId, loserId]
      );
    });

    // 4. Stage 0012 and run again. The ledger skips 0000-0011; only 0012 runs.
    cpSync(join(REAL_MIGRATION_DIR, MIGRATION_0012), join(migrationDir, MIGRATION_0012));
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

  it('runs migration 0012 fresh (and skips the already-applied schema migrations)', () => {
    expect(existsSync(join(REAL_MIGRATION_DIR, MIGRATION_0012))).toBe(true);
    expect(applyResult.applied).toContain(MIGRATION_0012);
    expect(applyResult.skipped.length).toBeGreaterThan(0);
  });

  it('adds findings.subject_key as NOT NULL', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      const cols = await client.query(
        `SELECT is_nullable
         FROM information_schema.columns
         WHERE table_name = 'findings' AND column_name = 'subject_key'`
      );
      expect(cols.rows.length).toBe(1);
      expect(cols.rows[0].is_nullable).toBe('NO');
    });
  });

  it('backfills legacy rows to subject_key = ""', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      const rows = await client.query(`SELECT subject_key FROM findings`);
      // Live success precondition: dedupe left exactly the survivor + the distinct row.
      expect(rows.rows.length).toBe(2);
      for (const row of rows.rows) {
        expect(row.subject_key).toBe('');
      }
    });
  });

  it('dedupes deterministically: keeps the acknowledged survivor, deletes the loser', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      // Survivor A is present and still carries its acknowledgement state.
      const a = await client.query(
        `SELECT id, acknowledged_at, acknowledged_by FROM findings WHERE id = $1`,
        [survivorId]
      );
      expect(a.rows.length).toBe(1);
      expect(a.rows[0].acknowledged_at).not.toBeNull();
      expect(a.rows[0].acknowledged_by).toBe('tester');

      // Loser B is gone.
      const b = await client.query(`SELECT id FROM findings WHERE id = $1`, [loserId]);
      expect(b.rows.length).toBe(0);

      // Distinct C is untouched.
      const c = await client.query(`SELECT id, type FROM findings WHERE id = $1`, [distinctId]);
      expect(c.rows.length).toBe(1);
      expect(c.rows[0].type).toBe('dns.cname-coexistence-conflict');
    });
  });

  it('PRESERVES suggestions: the loser suggestion is re-linked to the survivor', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      const suggestions = await client.query(
        `SELECT title, finding_id FROM suggestions WHERE finding_id = $1 ORDER BY title`,
        [survivorId]
      );
      // Both the survivor's own suggestion AND the re-linked loser suggestion survive.
      expect(suggestions.rows.length).toBe(2);
      expect(suggestions.rows.map((r) => r.title).sort()).toEqual(['S_A', 'S_B']);
    });
  });

  it('REJECTS a findings insert that collides on the new composite key (same subject_key)', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      // 23505 = unique_violation. Same (snapshot, rule, type, subject_key='', version)
      // as the surviving finding A — the new index must block it.
      await expect(
        client.query(
          `INSERT INTO findings
             (snapshot_id, type, title, description, severity, confidence, risk_posture,
              blast_radius, evidence, rule_id, rule_version, ruleset_version_id, subject_key)
           VALUES
             ($1, 'dns.authoritative-mismatch', 'dup', 'd', 'low'::severity,
              'certain'::confidence, 'low'::risk_posture,
              'single-domain'::blast_radius, '[]'::jsonb, 'rule-x', '1.0', $2, '')`,
          [snapshotId, activeVersionId]
        )
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  // Boundary complement: the same-key rejection above is only meaningful if a
  // differing-subject_key insert (same snapshot/rule/type/version) still succeeds —
  // otherwise the rejection could be vacuous (some other constraint blocking all
  // inserts). This is the whole point of TB-3: two findings from one rule, about
  // different subjects, coexisting.
  it('ALLOWS a findings insert with a differing subject_key (boundary complement)', async () => {
    await withClient(TEST_DB_URL, async (client) => {
      const inserted = await client.query(
        `INSERT INTO findings
           (snapshot_id, type, title, description, severity, confidence, risk_posture,
            blast_radius, evidence, rule_id, rule_version, ruleset_version_id, subject_key)
         VALUES
           ($1, 'dns.authoritative-mismatch', 'multi', 'd', 'low'::severity,
            'certain'::confidence, 'low'::risk_posture, 'single-domain'::blast_radius,
            '[]'::jsonb, 'rule-x', '1.0', $2, 'www.example.com|A')
         RETURNING id, subject_key`,
        [snapshotId, activeVersionId]
      );
      expect(inserted.rows.length).toBe(1);
      expect(inserted.rows[0].subject_key).toBe('www.example.com|A');
    });
  });
});
