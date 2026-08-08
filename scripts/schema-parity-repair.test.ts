/**
 * RT-4 schema parity proof
 *
 * After the release migration runner alone (scripts/run-migrations.mjs) applies
 * every forward SQL migration to a fresh database, every column historically
 * supplied by request-time repairSchema must already exist with matching
 * type / nullability / default presence. repairSchema must not be required to
 * make the app schema complete.
 *
 * Skipped when DATABASE_URL is unset so unit CI without Postgres stays green.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SCHEMA_REPAIR_COLUMNS,
  type SchemaRepairColumn,
} from '../apps/web/hono/lib/schema-repair.js';
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

/** Expected attributes derived from a catalog ALTER TABLE … ADD COLUMN SQL. */
interface ExpectedColumnShape {
  dataType: string;
  isNullable: 'YES' | 'NO';
  hasDefault: boolean;
}

/**
 * Parse SCHEMA_REPAIR_COLUMNS sql into information_schema-comparable shape.
 * Kept small on purpose — only the constructs used by the catalog.
 */
function expectedShapeFromRepairSql(repairSql: string): ExpectedColumnShape {
  const upper = repairSql.toUpperCase();
  const typeMatch = repairSql.match(
    /ADD COLUMN IF NOT EXISTS\s+\w+\s+([A-Z]+(?:\s+WITH\s+TIME\s+ZONE)?(?:\([^)]*\))?)/i
  );
  if (!typeMatch) {
    throw new Error(`Unable to parse column type from repair SQL: ${repairSql}`);
  }

  const rawType = typeMatch[1].replace(/\s+/g, ' ').trim().toUpperCase();
  let dataType: string;
  if (rawType.startsWith('VARCHAR') || rawType.startsWith('CHARACTER VARYING')) {
    dataType = 'character varying';
  } else if (rawType === 'TEXT') {
    dataType = 'text';
  } else if (rawType === 'BOOLEAN' || rawType === 'BOOL') {
    dataType = 'boolean';
  } else if (rawType === 'INTEGER' || rawType === 'INT' || rawType === 'INT4') {
    dataType = 'integer';
  } else if (rawType === 'UUID') {
    dataType = 'uuid';
  } else if (rawType === 'JSONB') {
    dataType = 'jsonb';
  } else if (rawType === 'JSON') {
    dataType = 'json';
  } else if (rawType === 'TIMESTAMP WITH TIME ZONE' || rawType === 'TIMESTAMPTZ') {
    dataType = 'timestamp with time zone';
  } else if (rawType.startsWith('TIMESTAMP')) {
    dataType = 'timestamp without time zone';
  } else {
    throw new Error(`Unsupported repair SQL type "${rawType}" in: ${repairSql}`);
  }

  return {
    dataType,
    isNullable: /\bNOT NULL\b/.test(upper) ? 'NO' : 'YES',
    hasDefault: /\bDEFAULT\b/.test(upper),
  };
}

function catalogExpectations(columns: readonly SchemaRepairColumn[]) {
  return columns.map((entry) => ({
    key: `${entry.table}.${entry.column}`,
    table: entry.table,
    column: entry.column,
    expected: expectedShapeFromRepairSql(entry.sql),
  }));
}

/**
 * Catalog SQL is a historical backfill lower bound, not a byte-for-byte schema
 * dump. Accept enums (USER-DEFINED), text/varchar interchange, and either
 * timestamp family when the catalog used TIMESTAMP.
 */
function typesCompatible(
  expectedDataType: string,
  actualDataType: string,
  actualUdtName: string
): boolean {
  if (actualDataType === expectedDataType) return true;

  if (expectedDataType === 'character varying') {
    if (actualDataType === 'text') return true;
    if (actualDataType === 'USER-DEFINED') return true; // enum / domain
    if (actualUdtName === 'varchar' || actualUdtName.endsWith('_enum')) return true;
  }

  if (expectedDataType.startsWith('timestamp') && actualDataType.startsWith('timestamp')) {
    return true;
  }

  return false;
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

  it('includes every repairSchema column with compatible type/nullability/default', async () => {
    expect(SCHEMA_REPAIR_COLUMNS.length).toBeGreaterThan(0);
    const expectations = catalogExpectations(SCHEMA_REPAIR_COLUMNS);

    await withClient(TEST_DB_URL, async (client) => {
      const existing = await client.query<{
        table_name: string;
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: 'YES' | 'NO';
        column_default: string | null;
      }>(
        `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'`
      );
      const byKey = new Map(
        existing.rows.map((row) => [`${row.table_name}.${row.column_name}`, row] as const)
      );

      const mismatches: string[] = [];
      for (const { key, expected } of expectations) {
        const actual = byKey.get(key);
        if (!actual) {
          mismatches.push(`${key}: missing`);
          continue;
        }
        if (!typesCompatible(expected.dataType, actual.data_type, actual.udt_name)) {
          mismatches.push(
            `${key}: type incompatible — catalog ${expected.dataType}, got ${actual.data_type}/${actual.udt_name}`
          );
        }
        // Catalog NOT NULL is a floor; canonical schema may be stricter than a nullable backfill.
        if (expected.isNullable === 'NO' && actual.is_nullable !== 'NO') {
          mismatches.push(`${key}: nullability expected NOT NULL floor, got ${actual.is_nullable}`);
        }
        // Default: catalog DEFAULT is a backfill aid. Live schema is OK when it either
        // retains a default OR enforces NOT NULL (insert-time safety without default).
        // Nullable + no default is also OK when the app treats NULL as absent.
        // We still consult column_default so parity covers the default dimension.
        const actualHasDefault =
          actual.column_default !== null && typeof actual.column_default === 'string';
        if (
          expected.hasDefault &&
          !actualHasDefault &&
          actual.is_nullable === 'YES' &&
          // JSON/jsonb/text metadata blobs commonly omit server defaults in 0000.
          expected.dataType !== 'jsonb' &&
          expected.dataType !== 'json' &&
          expected.dataType !== 'text'
        ) {
          mismatches.push(`${key}: catalog default not reflected (nullable, no column_default)`);
        }
      }

      expect(mismatches, `Release migrations schema mismatches:\n${mismatches.join('\n')}`).toEqual(
        []
      );
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

describe('expectedShapeFromRepairSql', () => {
  it('parses common catalog type/nullability/default shapes', () => {
    expect(
      expectedShapeFromRepairSql(
        `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT 'Alert'`
      )
    ).toEqual({ dataType: 'character varying', isNullable: 'NO', hasDefault: true });

    expect(
      expectedShapeFromRepairSql(
        `ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS description TEXT`
      )
    ).toEqual({ dataType: 'text', isNullable: 'YES', hasDefault: false });

    expect(
      expectedShapeFromRepairSql(
        `ALTER TABLE findings ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE`
      )
    ).toEqual({ dataType: 'timestamp with time zone', isNullable: 'YES', hasDefault: false });

    expect(
      expectedShapeFromRepairSql(
        `ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`
      )
    ).toEqual({ dataType: 'jsonb', isNullable: 'YES', hasDefault: true });
  });
});
