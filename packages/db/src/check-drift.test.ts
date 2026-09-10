import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
