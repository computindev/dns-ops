import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const collectorRoot = resolve(import.meta.dirname, '..');
const distDirectory = join(collectorRoot, 'dist');
const distEntry = join(distDirectory, 'index.js');

describe('collector start lifecycle', () => {
  it('builds source before executing a pre-existing dist entry', () => {
    const markerDirectory = mkdtempSync(join(tmpdir(), 'dns-ops-collector-start-'));
    const staleMarker = join(markerDirectory, 'stale-entry-ran');
    const previousEntry = existsSync(distEntry) ? readFileSync(distEntry) : undefined;

    try {
      mkdirSync(distDirectory, { recursive: true });
      writeFileSync(
        distEntry,
        [
          "import { writeFileSync } from 'node:fs';",
          `writeFileSync(${JSON.stringify(staleMarker)}, 'stale');`,
          'process.exit(73);',
        ].join('\n')
      );

      const childEnv = {
        PATH: process.env.PATH,
        COLLECTOR_SKIP_LISTEN: 'true',
        DATABASE_URL: 'postgresql://127.0.0.1:1/collector-start-test',
        NODE_ENV: 'test',
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
      expect(existsSync(staleMarker)).toBe(false);
      expect(readFileSync(distEntry, 'utf8')).not.toContain('stale-entry-ran');
    } finally {
      if (previousEntry === undefined) {
        rmSync(distDirectory, { force: true, recursive: true });
      } else {
        writeFileSync(distEntry, previousEntry);
      }
      rmSync(markerDirectory, { force: true, recursive: true });
    }
  });
});
