import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { runMigrations } from './run-migrations.mjs';

const databaseUrl = process.env.DATABASE_URL;
const { Client } = pg;

test('rolls back an interrupted migration and applies it on a safe re-run', {
  skip: !databaseUrl,
}, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const schema = `migration_runner_${suffix}`;
  const migrationDir = await mkdtemp(join(tmpdir(), 'dns-ops-migrations-'));
  const client = new Client({ connectionString: databaseUrl });
  let connected = false;

  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);

    await writeFile(
      join(migrationDir, '0000_initial.sql'),
      'CREATE TABLE migration_probe (id integer);'
    );
    await writeFile(
      join(migrationDir, '0001_interrupted.sql'),
      'CREATE TABLE migration_atomic_probe (id integer);\nSELECT * FROM missing_migration_table;'
    );

    await assert.rejects(
      runMigrations({ databaseUrl, migrationDir, schema }),
      /missing_migration_table/
    );

    const atomicTable = await client.query('SELECT to_regclass($1) AS relation', [
      `"${schema}".migration_atomic_probe`,
    ]);
    assert.equal(atomicTable.rows[0].relation, null, 'failed migration must be rolled back');

    const ledger = await client.query(
      `SELECT name FROM "${schema}"._migrations_applied ORDER BY name`
    );
    assert.deepEqual(
      ledger.rows.map((row) => row.name),
      ['0000_initial.sql']
    );

    await writeFile(
      join(migrationDir, '0001_interrupted.sql'),
      'CREATE TABLE migration_atomic_probe (id integer);'
    );

    const resumed = await runMigrations({ databaseUrl, migrationDir, schema });
    assert.deepEqual(resumed.applied, ['0001_interrupted.sql']);
    assert.deepEqual(resumed.skipped, ['0000_initial.sql']);

    const rerun = await runMigrations({ databaseUrl, migrationDir, schema });
    assert.deepEqual(rerun.applied, []);
    assert.deepEqual(rerun.skipped, ['0000_initial.sql', '0001_interrupted.sql']);
  } finally {
    if (connected) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
      await client.end().catch(() => undefined);
    }
    await rm(migrationDir, { recursive: true, force: true });
  }
});
