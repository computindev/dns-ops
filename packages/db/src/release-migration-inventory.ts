import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ReleaseMigrationInventory = {
  sqlFiles: string[];
  journalTags: string[];
  sqlBeyondJournal: string[];
  journalMissingFiles: string[];
  drizzleMetadataStale: boolean;
};

type JournalFile = {
  entries?: Array<{ tag?: unknown }>;
};

export function inspectReleaseMigrationInventory(
  migrationsDir: string,
  journalPath = join(migrationsDir, 'meta/_journal.json')
): ReleaseMigrationInventory {
  const sqlFiles = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as JournalFile;
  const journalTags = (journal.entries ?? [])
    .map((entry) => (typeof entry.tag === 'string' ? entry.tag : ''))
    .filter((tag) => tag.length > 0);
  const journalSet = new Set(journalTags);
  const sqlStems = sqlFiles.map((name) => name.replace(/\.sql$/, ''));
  const sqlSet = new Set(sqlStems);
  const sqlBeyondJournal = sqlStems.filter((stem) => !journalSet.has(stem));
  const journalMissingFiles = journalTags.filter((tag) => !sqlSet.has(tag));
  return {
    sqlFiles,
    journalTags,
    sqlBeyondJournal,
    journalMissingFiles,
    drizzleMetadataStale: sqlBeyondJournal.length > 0 || journalMissingFiles.length > 0,
  };
}

export function formatReleaseMigrationReport(inventory: ReleaseMigrationInventory): string {
  const lines = [
    '2. Release-runner SQL inventory (authoritative)...',
    `   SQL files: ${inventory.sqlFiles.length} (${inventory.sqlFiles[0] ?? 'none'} … ${inventory.sqlFiles.at(-1) ?? 'none'})`,
    `   Drizzle journal tags: ${inventory.journalTags.length} (${inventory.journalTags[0] ?? 'none'} … ${inventory.journalTags.at(-1) ?? 'none'})`,
  ];
  if (inventory.sqlBeyondJournal.length > 0) {
    lines.push(
      `   SQL not in Drizzle journal: ${inventory.sqlBeyondJournal[0]} … ${inventory.sqlBeyondJournal.at(-1)} (${inventory.sqlBeyondJournal.length})`
    );
  }
  if (inventory.journalMissingFiles.length > 0) {
    lines.push(`   Journal tags missing SQL files: ${inventory.journalMissingFiles.join(', ')}`);
  }
  lines.push('');
  if (inventory.drizzleMetadataStale) {
    lines.push('STATUS: CATALOG PARITY NOT CERTIFIED');
    lines.push('Release runner SQL (scripts/run-migrations.mjs) is authoritative.');
    lines.push('Drizzle journal/snapshots are stale and must not be used as a sync signal.');
    lines.push(
      'Catalog parity requires: DATABASE_URL=... bun run --filter @dns-ops/db verify-migrations'
    );
  } else {
    lines.push('STATUS: DRIZZLE JOURNAL MATCHES CHECKED-IN SQL');
    lines.push('Catalog parity still requires verify-migrations against a live database.');
  }
  return lines.join('\n');
}
