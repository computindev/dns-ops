import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatReleaseMigrationReport,
  inspectReleaseMigrationInventory,
} from './release-migration-inventory.js';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function writeInventory(files: string[], tags: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'check-drift-'));
  dirs.push(dir);
  await mkdir(join(dir, 'meta'));
  for (const file of files) {
    await writeFile(join(dir, file), '-- test\n');
  }
  await writeFile(
    join(dir, 'meta/_journal.json'),
    JSON.stringify({ entries: tags.map((tag) => ({ tag })) })
  );
  return dir;
}

describe('inspectReleaseMigrationInventory', () => {
  it('flags SQL beyond a stale Drizzle journal instead of claiming sync', async () => {
    const dir = await writeInventory(
      ['0009_drop_vantage_points.sql', '0025_widen_operational_discriminators.sql'],
      ['0009_drop_vantage_points']
    );
    const inventory = inspectReleaseMigrationInventory(dir);
    expect(inventory.drizzleMetadataStale).toBe(true);
    expect(inventory.sqlBeyondJournal).toEqual(['0025_widen_operational_discriminators']);
    expect(formatReleaseMigrationReport(inventory)).toContain('CATALOG PARITY NOT CERTIFIED');
    expect(formatReleaseMigrationReport(inventory)).not.toContain('NO DRIFT');
    expect(formatReleaseMigrationReport(inventory)).toContain('verify-migrations');
  });

  it('fails closed when journal tags lack SQL files', async () => {
    const dir = await writeInventory(['0000_nebulous_steve_rogers.sql'], ['0000_missing']);
    const inventory = inspectReleaseMigrationInventory(dir);
    expect(inventory.journalMissingFiles).toEqual(['0000_missing']);
    expect(inventory.drizzleMetadataStale).toBe(true);
  });

  it('inventories 0026 among release-runner SQL beyond the Drizzle journal', () => {
    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
    const inventory = inspectReleaseMigrationInventory(migrationsDir);
    expect(inventory.sqlFiles).toContain('0026_widen_alert_dedup_key.sql');
    expect(inventory.sqlBeyondJournal).toContain('0026_widen_alert_dedup_key');
  });
});
