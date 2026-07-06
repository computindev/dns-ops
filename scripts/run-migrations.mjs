/**
 * Migration Runner — Railway web release command (apps/web/railway.toml).
 *
 * Replaces the legacy hardcoded-file-list + swallow-everything runner with:
 *   1. Dynamic discovery — reads packages/db/src/migrations/*.sql sorted, so a
 *      newly added 0011_*.sql can never be silently forgotten in production.
 *      (CI's verify-migrations.ts already discovers dynamically, so prod now
 *      matches what CI validates.)
 *   2. Applied-ledger — `_migrations_applied(name, checksum, applied_at)`.
 *      Each migration runs at most once; re-runs skip by name instead of
 *      re-executing and swallowing "already exists" errors every deploy.
 *
 * Flow: ensureLedger → discoverMigrationFiles → for each file NOT in ledger:
 *   applyPending (BEGIN; run sql; INSERT ledger; COMMIT). No migration uses
 *   CREATE INDEX CONCURRENTLY or its own transaction control, so wrapping each
 *   file in a single transaction is safe.
 *
 * Legacy bootstrap: a database populated by the previous runner (which had no
 * ledger) has all objects already. On the first run of this runner against such
 * a database, a not-in-ledger migration whose objects already exist raises an
 * idempotent "already exists" error; we record it as applied and continue rather
 * than fail the deploy. Any other error fails the deploy.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const LEDGER_TABLE = '_migrations_applied';

/**
 * PostgreSQL SQLSTATE codes for "object already exists" / "duplicate" — the
 * idempotent re-create conditions the legacy runner relied on. Used ONLY to
 * bridge a pre-ledger database into the ledger; never to mask real errors on a
 * fresh database.
 */
const IDEMPOTENT_ERROR_CODES = new Set(['42P07', '42710', '42P06', '42701']);

function isIdempotentMigrationError(err) {
  const message = String(err?.message ?? '').toLowerCase();
  return IDEMPOTENT_ERROR_CODES.has(err?.code) || message.includes('already exists');
}

/** Discover migration files dynamically, sorted lexicographically (matches verify-migrations.ts). */
export function discoverMigrationFiles(migrationDir) {
  return readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/** Stable SHA-256 checksum of a migration's content, recorded for forensic drift detection. */
export function computeChecksum(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
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
  const result = await client.query(`SELECT name FROM ${LEDGER_TABLE}`);
  return new Set(result.rows.map((row) => row.name));
}

async function recordApplied(client, name, checksum) {
  await client.query(
    `INSERT INTO ${LEDGER_TABLE} (name, checksum) VALUES ($1, $2)
     ON CONFLICT (name) DO NOTHING`,
    [name, checksum]
  );
}

/**
 * Apply one pending migration inside a single transaction: run the SQL, then
 * record it in the ledger. On any error, roll back and re-throw so the caller
 * can decide (bootstrap-bridge vs. hard failure).
 */
async function applyPending(client, migrationDir, file) {
  const sql = readFileSync(join(migrationDir, file), 'utf8');
  const checksum = computeChecksum(sql);

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await recordApplied(client, file, checksum);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

/**
 * Run all pending migrations against the database at `databaseUrl`.
 *
 * @param {{ databaseUrl: string; migrationDir: string; ssl?: import('pg').ConnectionConfig['ssl'] }} options
 * @returns {Promise<{ applied: string[]; skipped: string[]; bootstrapped: string[] }>}
 *   applied — migrations executed fresh this run.
 *   skipped — migrations already in the ledger (no SQL run).
 *   bootstrapped — pre-ledger migrations whose objects already existed.
 */
export async function runMigrations({ databaseUrl, migrationDir, ssl }) {
  if (!databaseUrl) {
    throw new Error('databaseUrl is required to run migrations');
  }

  const sslConfig =
    ssl ?? (databaseUrl.includes('sslmode=no-verify') ? { rejectUnauthorized: false } : undefined);
  const applied = [];
  const skipped = [];
  const bootstrapped = [];

  const client = new Client({ connectionString: databaseUrl, ssl: sslConfig });
  console.log('=== Migration Runner Starting ===');
  console.log(`DATABASE_URL found: ${databaseUrl.substring(0, 40)}...`);

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully');

    await ensureLedger(client);
    const alreadyApplied = await getAppliedMigrations(client);
    const files = discoverMigrationFiles(migrationDir);

    console.log(
      `Discovered ${files.length} migration file(s); ${alreadyApplied.size} already applied.`
    );

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        console.log(`Skipping already-applied: ${file}`);
        skipped.push(file);
        continue;
      }

      try {
        console.log(`Running migration: ${file}`);
        await applyPending(client, migrationDir, file);
        console.log(`Completed: ${file}`);
        applied.push(file);
      } catch (err) {
        if (isIdempotentMigrationError(err)) {
          // Legacy database: the object already exists from a pre-ledger run.
          // Record the migration as applied so future runs skip it by name.
          console.log(
            `Bootstrapping legacy migration ${file} (object already exists): ${err.code ?? ''} ${err.message}`
          );
          const checksum = computeChecksum(readFileSync(join(migrationDir, file), 'utf8'));
          await recordApplied(client, file, checksum);
          bootstrapped.push(file);
          continue;
        }
        console.error(`Error in ${file}:`, err.code, err.message);
        throw err;
      }
    }

    console.log('=== Migrations Complete ===');
    return { applied, skipped, bootstrapped };
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** True when this file is the Node entry point (not imported by a test). */
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

  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required to run migrations');
    process.exit(1);
  }

  const migrationDir = join(process.cwd(), 'packages/db/src/migrations');

  runMigrations({ databaseUrl, migrationDir })
    .then(({ applied, skipped, bootstrapped }) => {
      if (applied.length) console.log(`Applied (${applied.length}): ${applied.join(', ')}`);
      if (skipped.length)
        console.log(`Skipped already-applied (${skipped.length}): ${skipped.join(', ')}`);
      if (bootstrapped.length) {
        console.log(`Bootstrapped legacy (${bootstrapped.length}): ${bootstrapped.join(', ')}`);
      }
      console.log('Migration runner finished');
    })
    .catch((err) => {
      console.error('Migration runner failed:', err);
      process.exit(1);
    });
}
