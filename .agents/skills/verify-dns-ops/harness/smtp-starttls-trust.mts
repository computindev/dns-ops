#!/usr/bin/env bun
/**
 * Deterministic critical verification for the collector SMTP trust contract.
 *
 * This helper runs production collector/API tests that replace only external
 * DNS, TCP, TLS, and persistence boundaries with deterministic fixtures. The
 * test route is the real Hono collector route; no provider is contacted and
 * no credential-bearing SMTP command is available to the fixtures.
 *
 * Run from the repository root after `bun run build`:
 * VERIFY_RUN_DIR=verification/runs/<id> bun .agents/skills/verify-dns-ops/harness/smtp-starttls-trust.mts
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const runDir = process.env.VERIFY_RUN_DIR;
if (!runDir) {
  console.error('VERIFY_RUN_DIR is not set — run verify.mjs run-new first');
  process.exit(2);
}

const root = process.cwd();
const absoluteRunDir = path.resolve(root, runDir);
fs.mkdirSync(absoluteRunDir, { recursive: true });

const focusedTests = [
  'apps/collector/src/probes/smtp-starttls.e2e.test.ts',
  'apps/collector/src/probes/smtp-starttls.test.ts',
  'apps/collector/src/probes/tls-certificate.test.ts',
  'apps/collector/src/probes/probe-observation.test.ts',
  'apps/collector/src/e2e/probe-observation-persistence.e2e.test.ts',
  'apps/collector/src/jobs/probe-routes.authorization.test.ts',
];

type Command = {
  name: string;
  executable: string;
  args: string[];
};

const commands: Command[] = [
  {
    name: 'collector-trust-tests',
    executable: 'bun',
    args: ['x', 'vitest', 'run', ...focusedTests, '--reporter=verbose'],
  },
  {
    name: 'built-repository-proof',
    executable: 'node',
    args: ['verification/builder/issue74-smtp-fail-closed.proof.mjs'],
  },
];

const results: Array<{
  name: string;
  command: string;
  exitCode: number | null;
}> = [];

for (const command of commands) {
  const result = spawnSync(command.executable, command.args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ENABLE_ACTIVE_PROBES: 'false' },
  });
  const output = [
    `$ ${command.executable} ${command.args.join(' ')}`,
    result.stdout ?? '',
    result.stderr ?? '',
    `exit_code: ${result.status ?? 'signal'}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(absoluteRunDir, `cli-${command.name}.txt`), output);
  results.push({
    name: command.name,
    command: `${command.executable} ${command.args.join(' ')}`,
    exitCode: result.status,
  });
  if (result.status !== 0) {
    throw new Error(`${command.name} failed with exit code ${result.status ?? 'signal'}`);
  }
}

fs.mkdirSync(path.join(absoluteRunDir, 'readback'), { recursive: true });
fs.writeFileSync(
  path.join(absoluteRunDir, 'readback', 'verification-boundaries.json'),
  `${JSON.stringify(
    {
      surface: 'collector API route, SMTP/TLS probes, and ProbeObservationRepository',
      commands: results,
      activeProbesAgainstProviders: false,
      credentialsProvided: false,
      readBackPaths: [
        'ProbeObservationRepository.findById',
        'ProbeObservationRepository.findBySnapshotAndType',
        'ProbeObservationRepository.findByHostname',
        'ProbeObservationRepository.findFailedProbes',
        'ProbeObservationRepository.findSlowProbes',
        'ProbeObservationRepository.findByTimeRange',
        'ProbeObservationRepository.countByStatus',
        'ProbeObservationRepository.getSummary',
        'collector probe route response and persisted-evidence adapter state',
      ],
    },
    null,
    2
  )}\n`
);

console.log(`smtp.starttls-trust finished; evidence in ${absoluteRunDir}`);
