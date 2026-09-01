/**
 * Serial clean-start proof for the collector.
 *
 * This command intentionally mutates only the ignored build outputs listed
 * below. Keep it outside Vitest: parallel workers must never observe a
 * partially rebuilt workspace.
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const workspaceRoot = resolve(import.meta.dirname, '..');
const collectorRoot = join(workspaceRoot, 'apps', 'collector');
const collectorDist = join(collectorRoot, 'dist');
const collectorEntry = join(collectorDist, 'index.js');

const buildOutputPaths = [
  collectorDist,
  ...['contracts', 'db', 'logging', 'parsing', 'rules'].map((packageName) =>
    join(workspaceRoot, 'packages', packageName, 'dist')
  ),
];
const requiredBuiltFiles = buildOutputPaths.map((outputPath) => join(outputPath, 'index.js'));
const rmOptions = { force: true, maxRetries: 3, recursive: true, retryDelay: 100 };

function fail(message) {
  throw new Error(`Collector clean-start verification failed: ${message}`);
}

function ensureIgnoredBuildOutputs() {
  for (const outputPath of buildOutputPaths) {
    const result = spawnSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', relative(workspaceRoot, outputPath)],
      { cwd: workspaceRoot, stdio: 'ignore' }
    );
    if (result.error || result.status !== 0) {
      fail(`refusing to remove non-ignored output ${relative(workspaceRoot, outputPath)}`);
    }
  }
}

function runCollectorStart(staleMarkerPath) {
  const childEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? tmpdir(),
    CI: process.env.CI,
    COLLECTOR_SKIP_LISTEN: 'true',
    DATABASE_URL: 'postgresql://127.0.0.1:1/collector-start-verification',
    ENABLE_ACTIVE_PROBES: 'false',
    NODE_ENV: 'test',
    RUN_LIVE_DNS_TESTS: '0',
    TURBO_FORCE: 'true',
    WORKER_ENABLED: 'false',
  };

  const result = spawnSync('bun', ['run', 'start'], {
    cwd: collectorRoot,
    encoding: 'utf8',
    env: childEnv,
    stdio: 'inherit',
    timeout: 120_000,
  });

  if (existsSync(staleMarkerPath)) {
    fail('the stale collector entry executed');
  }
  if (result.error) {
    fail(`collector start command errored: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`collector start command exited with status ${result.status}`);
  }
}

function verifyRebuiltTree(staleEntrySource) {
  for (const requiredFile of requiredBuiltFiles) {
    if (!existsSync(requiredFile)) {
      fail(`dependency-aware start did not rebuild ${relative(workspaceRoot, requiredFile)}`);
    }
  }

  const rebuiltEntry = readFileSync(collectorEntry, 'utf8');
  if (rebuiltEntry.includes(staleEntrySource)) {
    fail('the stale collector entry remains after start');
  }
}

function verifyCollectorStart() {
  ensureIgnoredBuildOutputs();

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'dns-ops-collector-start-'));
  const backupDirectory = join(temporaryDirectory, 'backups');
  const staleMarkerPath = join(temporaryDirectory, 'stale-entry-ran');
  const staleEntrySource = [
    "import { writeFileSync } from 'node:fs';",
    `writeFileSync(${JSON.stringify(staleMarkerPath)}, 'stale');`,
    'process.exit(73);',
  ].join('\n');
  const backups = [];
  const removedOutputs = [];
  let passed = false;

  try {
    mkdirSync(backupDirectory, { recursive: true });
    for (const [index, outputPath] of buildOutputPaths.entries()) {
      if (!existsSync(outputPath)) continue;
      const backupPath = join(backupDirectory, String(index));
      cpSync(outputPath, backupPath, { recursive: true });
      backups.push({ backupPath, outputPath });
    }

    for (const outputPath of buildOutputPaths) {
      removedOutputs.push(outputPath);
      rmSync(outputPath, rmOptions);
    }

    if (buildOutputPaths.some((outputPath) => existsSync(outputPath))) {
      fail('could not remove every allowlisted build output');
    }

    mkdirSync(dirname(collectorEntry), { recursive: true });
    writeFileSync(collectorEntry, staleEntrySource);
    runCollectorStart(staleMarkerPath);
    verifyRebuiltTree(staleEntrySource);
    passed = true;
  } finally {
    try {
      if (!passed) {
        for (const outputPath of removedOutputs) rmSync(outputPath, rmOptions);
        for (const { backupPath, outputPath } of backups) {
          if (existsSync(backupPath)) cpSync(backupPath, outputPath, { recursive: true });
        }
      }
    } finally {
      rmSync(temporaryDirectory, rmOptions);
    }
  }
}

try {
  verifyCollectorStart();
  console.log(
    `Collector clean-start verification passed: rebuilt ${buildOutputPaths.length} ignored outputs; stale entry did not execute.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
