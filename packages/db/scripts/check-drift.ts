#!/usr/bin/env npx tsx
/**
 * Schema Drift Check
 *
 * Release-runner SQL under src/migrations is authoritative. Drizzle journal/
 * snapshots currently stop at 0009 and must not be treated as catalog parity.
 * This script reports that inventory; `verify-migrations` certifies a live DB.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatReleaseMigrationReport,
  inspectReleaseMigrationInventory,
} from '../src/release-migration-inventory.ts';
import { ensureCompiledSchemaExists } from './schema-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(PACKAGE_ROOT, 'src/migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta/_journal.json');

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Schema Drift Check                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('1. Checking compiled schema...');
  if (!ensureCompiledSchemaExists()) {
    console.error('❌ Error: dist/schema/index.js not found');
    console.error('   Run "bun run build" first to compile the schema');
    process.exit(1);
  }
  console.log('   ✓ dist/schema/index.js found');
  console.log('');

  try {
    const inventory = inspectReleaseMigrationInventory(MIGRATIONS_DIR, JOURNAL_PATH);
    console.log(formatReleaseMigrationReport(inventory));

    if (inventory.journalMissingFiles.length > 0) {
      console.error('\n❌ Journal references SQL files that are not present.');
      process.exit(1);
    }
    if (inventory.sqlFiles.length === 0) {
      console.error('\n❌ No release-runner SQL migrations found.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error: could not read release-runner SQL inventory');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
