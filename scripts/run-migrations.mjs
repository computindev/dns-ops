/**
 * Transactional migration runner for CI and Railway releases.
 *
 * Every migration file is applied once, in its own transaction, and recorded
 * atomically in _migrations_applied. Failed migrations are rolled back and are
 * deliberately not treated as applied: an operator must correct the database
 * state rather than silently accepting a potentially partial schema.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const LEDGER_TABLE = '_migrations_applied';
const LOCK_KEY = 'dns-ops:migrations:v1';

export function discoverMigrationFiles(migrationDir) {
  return readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

export function computeChecksum(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL schema name: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(`SELECT name, checksum FROM ${LEDGER_TABLE}`);
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

async function applyPending(client, migrationDir, file, checksum) {
  const sql = readFileSync(join(migrationDir, file), 'utf8');

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(`INSERT INTO ${LEDGER_TABLE} (name, checksum) VALUES ($1, $2)`, [
      file,
      checksum,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/**
 * Run every unapplied migration against one database.
 *
 * @param {{ databaseUrl: string; migrationDir: string; schema?: string; ssl?: import('pg').ConnectionConfig['ssl'] }} options
 * @returns {Promise<{ applied: string[]; skipped: string[] }>}
 */
export async function runMigrations({ databaseUrl, migrationDir, schema, ssl }) {
  if (!databaseUrl) throw new Error('databaseUrl is required to run migrations');

  const sslConfig =
    ssl ?? (databaseUrl.includes('sslmode=no-verify') ? { rejectUnauthorized: false } : undefined);
  const client = new Client({ connectionString: databaseUrl, ssl: sslConfig });
  let lockHeld = false;

  try {
    await client.connect();
    if (schema) {
      await client.query(`SET search_path TO ${quoteIdentifier(schema)}, public`);
    }

    await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
    lockHeld = true;
    await ensureLedger(client);

    const appliedMigrations = await getAppliedMigrations(client);
    const applied = [];
    const skipped = [];

    for (const file of discoverMigrationFiles(migrationDir)) {
      const checksum = computeChecksum(readFileSync(join(migrationDir, file), 'utf8'));
      const recordedChecksum = appliedMigrations.get(file);

      if (recordedChecksum) {
        if (recordedChecksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${file}`);
        }
        skipped.push(file);
        continue;
      }

      await applyPending(client, migrationDir, file, checksum);
      applied.push(file);
    }

    return { applied, skipped };
  } finally {
    if (lockHeld) {
      await client
        .query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY])
        .catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const databaseUrl = process.env.DATABASE_URL;
  const migrationDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../packages/db/src/migrations'
  );

  runMigrations({ databaseUrl, migrationDir })
    .then(({ applied, skipped }) => {
      if (applied.length) console.log(`Applied (${applied.length}): ${applied.join(', ')}`);
      if (skipped.length)
        console.log(`Skipped already-applied (${skipped.length}): ${skipped.join(', ')}`);
      console.log('Migration runner finished');
    })
    .catch((error) => {
      console.error('Migration runner failed:', error);
      process.exit(1);
    });
}
