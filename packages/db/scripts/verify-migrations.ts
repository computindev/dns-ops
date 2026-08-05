#!/usr/bin/env npx tsx
/**
 * Migration Verification Script
 *
 * Verifies that migrations can be applied to a fresh database without errors.
 * Creates a temporary schema, applies migrations, verifies structure, then cleans up.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/verify-migrations.ts
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadSchemaManifest } from './schema-manifest.js';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_SCHEMA = `migration_test_${Date.now()}`;

interface VerificationResult {
  success: boolean;
  migrationApplied: boolean;
  tablesFound: string[];
  tablesMissing: string[];
  enumsFound: string[];
  enumsMissing: string[];
  errors: string[];
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Usage: DATABASE_URL=postgres://... npx tsx scripts/verify-migrations.ts');
    process.exit(1);
  }

  const manifest = await loadSchemaManifest();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║               Migration Verification Script                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Test schema: ${TEST_SCHEMA}`);
  console.log(`Database: ${databaseUrl.replace(/\/\/[^@]+@/, '//***@')}`);
  console.log(`Expected tables: ${manifest.tables.length}`);
  console.log(`Expected enums: ${manifest.enums.length}`);
  console.log('');

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    const result = await verifyMigrations(client, manifest);
    printResult(result, manifest);

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Fatal error:', error);
    process.exit(1);
  } finally {
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
      console.log(`\n✓ Cleaned up test schema: ${TEST_SCHEMA}`);
    } catch {
      console.warn(`⚠ Warning: Could not clean up schema ${TEST_SCHEMA}`);
    }
    await client.end();
  }
}

async function verifyMigrations(
  client: pg.Client,
  manifest: { tables: string[]; enums: string[] }
): Promise<VerificationResult> {
  const result: VerificationResult = {
    success: false,
    migrationApplied: false,
    tablesFound: [],
    tablesMissing: [],
    enumsFound: [],
    enumsMissing: [],
    errors: [],
  };

  try {
    console.log('\n1. Creating test schema...');
    await client.query(`CREATE SCHEMA "${TEST_SCHEMA}"`);
    await client.query(`SET search_path TO "${TEST_SCHEMA}", public`);
    console.log('   ✓ Test schema created');

    console.log('\n2. Applying migrations...');
    const migrationDir = join(__dirname, '../src/migrations');
    const migrationFiles = readdirSync(migrationDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      result.errors.push('No migration files found in src/migrations/');
      return result;
    }

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationDir, file), 'utf-8');
      console.log(`   ${file}: transactionally applying migration`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        result.errors.push(`${file}: ${(error as Error).message}`);
        break;
      }
    }

    result.migrationApplied = result.errors.length === 0;
    if (!result.migrationApplied) {
      return result;
    }

    console.log('\n3. Verifying tables...');
    const tablesResult = await client.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
      [TEST_SCHEMA]
    );
    result.tablesFound = tablesResult.rows.map((row) => row.table_name);
    result.tablesMissing = manifest.tables.filter((table) => !result.tablesFound.includes(table));
    console.log(`   Found ${result.tablesFound.length} tables`);

    console.log('\n4. Verifying enums...');
    const enumsResult = await client.query(
      `
        SELECT typname
        FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typtype = 'e'
          AND n.nspname = $1
        ORDER BY typname
      `,
      [TEST_SCHEMA]
    );
    result.enumsFound = enumsResult.rows.map((row) => row.typname);
    result.enumsMissing = manifest.enums.filter(
      (enumName) => !result.enumsFound.includes(enumName)
    );
    console.log(`   Found ${result.enumsFound.length} enums`);

    console.log('\n5. Verifying foreign key constraints...');
    const fkResult = await client.query(
      `
        SELECT tc.constraint_name
        FROM information_schema.table_constraints AS tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
      `,
      [TEST_SCHEMA]
    );
    console.log(`   Found ${fkResult.rowCount} foreign key constraints`);

    result.success =
      result.migrationApplied &&
      result.errors.length === 0 &&
      result.tablesMissing.length === 0 &&
      result.enumsMissing.length === 0;

    return result;
  } catch (error) {
    result.errors.push(`Verification failed: ${(error as Error).message}`);
    return result;
  }
}

function printResult(
  result: VerificationResult,
  manifest: { tables: string[]; enums: string[] }
): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('VERIFICATION RESULT');
  console.log('═'.repeat(60));

  console.log(result.success ? '\n✅ SUCCESS\n' : '\n❌ FAILURE\n');
  console.log(`Migration applied: ${result.migrationApplied ? 'Yes' : 'No'}`);
  console.log(`Tables found: ${result.tablesFound.length}/${manifest.tables.length}`);
  console.log(`Enums found: ${result.enumsFound.length}/${manifest.enums.length}`);

  if (result.tablesMissing.length > 0) {
    console.log('\nMissing tables:');
    for (const table of result.tablesMissing) {
      console.log(`  - ${table}`);
    }
  }

  if (result.enumsMissing.length > 0) {
    console.log('\nMissing enums:');
    for (const enumName of result.enumsMissing) {
      console.log(`  - ${enumName}`);
    }
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  const extraTables = result.tablesFound.filter((table) => !manifest.tables.includes(table));
  if (extraTables.length > 0) {
    console.log('\nAdditional tables:');
    for (const table of extraTables) {
      console.log(`  + ${table}`);
    }
  }

  const extraEnums = result.enumsFound.filter((enumName) => !manifest.enums.includes(enumName));
  if (extraEnums.length > 0) {
    console.log('\nAdditional enums:');
    for (const enumName of extraEnums) {
      console.log(`  + ${enumName}`);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
}

main();
