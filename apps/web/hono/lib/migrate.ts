/**
 * Database Migration Runner
 *
 * Applies SQL migrations on startup. Startup migrations are defense-in-depth;
 * Railway releaseCommand runs the same migrations before traffic reaches the app.
 */

import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IDatabaseAdapter } from '@dns-ops/db';
import { sql } from 'drizzle-orm';
import { getWebLogger } from '../middleware/error-tracking.js';

interface MigrationRow {
  id: number;
  name?: string;
  hash?: string;
  created_at?: Date;
  applied_at?: Date;
}

interface ColumnRow {
  column_name: string;
}

interface MigrationFailure {
  file?: string;
  message: string;
  at: string;
}

interface MigrationStatus {
  ok: boolean | null;
  lastError?: MigrationFailure;
}

interface MigrationExecutor {
  execute<T = unknown>(query: unknown): Promise<{ rows: T[] }>;
}

const logger = getWebLogger();
const IDEMPOTENT_SKIP_PATTERNS = ['already exists'];

let migrationStatus: MigrationStatus = { ok: null };

export function getMigrationStatus(): MigrationStatus {
  return migrationStatus;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveMigrationsDir(): Promise<string> {
  const candidates = [
    process.env.DNS_OPS_MIGRATIONS_DIR,
    join(process.cwd(), 'packages', 'db', 'src', 'migrations'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Migrations directory not found. Tried: ${candidates.join(', ')}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isIdempotentStatementError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return IDEMPOTENT_SKIP_PATTERNS.some((pattern) => message.includes(pattern));
}

export async function runMigrations(db: IDatabaseAdapter): Promise<void> {
  migrationStatus = { ok: null };

  try {
    const drizzle = db.getDrizzle() as unknown as MigrationExecutor;
    const migrationsDir = await resolveMigrationsDir();

    await drizzle.execute(sql`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    const columns = await drizzle.execute(sql<ColumnRow>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '__drizzle_migrations'
    `);
    const columnNames = new Set((columns.rows as ColumnRow[]).map((row) => row.column_name));
    const migrationNameColumn = columnNames.has('name') ? 'name' : 'hash';

    const applied = await drizzle.execute(sql<MigrationRow>`SELECT * FROM "__drizzle_migrations"`);
    const appliedRows = applied.rows as MigrationRow[];
    const appliedHashes = new Set(
      appliedRows
        .map((row) => row[migrationNameColumn as keyof MigrationRow])
        .filter((value): value is string => typeof value === 'string')
    );

    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

    logger.info('Running database migrations', {
      migrationsDir,
      totalFiles: files.length,
      appliedCount: appliedHashes.size,
    });

    for (const file of files) {
      if (appliedHashes.has(file)) {
        continue;
      }

      logger.info(`Applying migration: ${file}`);
      const content = await readFile(join(migrationsDir, file), 'utf-8');
      const statements = content
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        try {
          await drizzle.execute(sql.raw(statement));
        } catch (error) {
          if (isIdempotentStatementError(error)) {
            logger.warn('Skipping idempotent migration statement error', {
              file,
              error: errorMessage(error),
            });
            continue;
          }

          const failure = {
            file,
            message: errorMessage(error),
            at: new Date().toISOString(),
          };
          migrationStatus = { ok: false, lastError: failure };
          logger.error('Migration statement failed', error instanceof Error ? error : undefined, {
            file,
            statement: `${statement.slice(0, 160)}${statement.length > 160 ? '...' : ''}`,
            message: failure.message,
          });
          throw new Error(`Migration ${file} failed: ${failure.message}`, { cause: error });
        }
      }

      await drizzle.execute(
        sql.raw(`INSERT INTO "__drizzle_migrations" (${migrationNameColumn}) VALUES ('${file}')`)
      );
      logger.info(`Migration applied: ${file}`);
    }

    migrationStatus = { ok: true };
    logger.info('Database migrations complete');
  } catch (error) {
    const failure = {
      file: migrationStatus.lastError?.file,
      message: errorMessage(error),
      at: new Date().toISOString(),
    };
    migrationStatus = { ok: false, lastError: failure };
    logger.error('Database migration failed', error instanceof Error ? error : undefined, failure);
    throw error;
  }
}
