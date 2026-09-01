import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const collectorRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(collectorRoot, '../..');
const buildOutputDirectories = [
  join(collectorRoot, 'dist'),
  ...['contracts', 'db', 'logging', 'parsing', 'rules'].map((packageName) =>
    join(workspaceRoot, 'packages', packageName, 'dist')
  ),
];

describe('collector start lifecycle', () => {
  it('builds the collector and workspace dependencies before starting from a clean checkout', () => {
    const backupDirectory = mkdtempSync(join(tmpdir(), 'dns-ops-collector-start-'));
    let outputsRemoved = false;

    try {
      for (const [index, outputDirectory] of buildOutputDirectories.entries()) {
        if (existsSync(outputDirectory)) {
          cpSync(outputDirectory, join(backupDirectory, String(index)), { recursive: true });
        }
      }
      for (const outputDirectory of buildOutputDirectories) {
        rmSync(outputDirectory, { force: true, recursive: true });
      }
      outputsRemoved = true;

      expect(buildOutputDirectories.every((outputDirectory) => !existsSync(outputDirectory))).toBe(
        true
      );

      const childEnv = {
        PATH: process.env.PATH,
        COLLECTOR_SKIP_LISTEN: 'true',
        DATABASE_URL: 'postgresql://127.0.0.1:1/collector-start-test',
        NODE_ENV: 'test',
        TURBO_FORCE: 'true',
        WORKER_ENABLED: 'false',
      };

      const result = spawnSync('bun', ['run', 'start'], {
        cwd: collectorRoot,
        encoding: 'utf8',
        env: childEnv,
        timeout: 30_000,
      });

      expect(result.error, result.error?.message).toBeUndefined();
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(buildOutputDirectories.every((outputDirectory) => existsSync(outputDirectory))).toBe(
        true
      );
    } finally {
      if (outputsRemoved) {
        for (const outputDirectory of buildOutputDirectories) {
          rmSync(outputDirectory, { force: true, recursive: true });
        }
        for (const [index, outputDirectory] of buildOutputDirectories.entries()) {
          const backupPath = join(backupDirectory, String(index));
          if (existsSync(backupPath)) {
            cpSync(backupPath, outputDirectory, { recursive: true });
          }
        }
      }
      rmSync(backupDirectory, { force: true, recursive: true });
    }
  }, 60_000);
});
