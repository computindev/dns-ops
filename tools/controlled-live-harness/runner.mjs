#!/usr/bin/env node
import { chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCloudflareAdapter,
  fingerprint,
  policyFromCloudflareManifest,
  validateCloudflareManifest,
} from './cloudflare-adapter.mjs';
import {
  createFixtureControlAdapter,
  validateFixtureRecoveryArtifact,
} from './fixture-control.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_MANIFEST = resolve(
  ROOT,
  'docs/domain-operations/evidence/gate-3/asorin-live-mutation-manifest.json'
);
const fail = (message) => {
  throw new Error(`controlled-live harness: ${message}`);
};

/** Reads the runtime secret only from this isolated harness process. */
export function protectedToken(path, name) {
  if ((statSync(path).mode & 0o777) !== 0o600) fail(`${name} secret file must be mode 600`);
  const match = readFileSync(path, 'utf8').match(new RegExp(`^export ${name}='([^'\\n]+)'\\n?$`));
  if (!match) fail(`${name} secret file has invalid format`);
  return match[1];
}

export function protectedValues(path, names) {
  if (!Array.isArray(names) || names.length === 0 || new Set(names).size !== names.length)
    fail('protected runtime value names are invalid');
  if ((statSync(path).mode & 0o777) !== 0o600) fail('runtime secret file must be mode 600');
  const lines = readFileSync(path, 'utf8').split('\n');
  if (lines.at(-1) !== '') fail('runtime secret file has invalid format');
  lines.pop();
  if (lines.length !== names.length) fail('runtime secret file has invalid format');
  const expected = new Set(names);
  const values = {};
  for (const line of lines) {
    const match = line.match(/^export ([A-Z][A-Z0-9_]*)='([^'\r\n]+)'$/);
    if (!match || !expected.has(match[1]) || Object.hasOwn(values, match[1]))
      fail('runtime secret file has invalid format');
    values[match[1]] = match[2];
  }
  if (Object.keys(values).length !== names.length) fail('runtime secret file has invalid format');
  return Object.freeze(values);
}

export function loadManifest(path = DEFAULT_MANIFEST) {
  return validateCloudflareManifest(JSON.parse(readFileSync(path, 'utf8')));
}

export function policyFromManifest(manifest, token) {
  return policyFromCloudflareManifest(manifest, token).policy;
}

function readArtifact(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('artifact file must contain valid JSON');
  }
}

export function writeArtifact(path, artifact) {
  if (!path) fail('an output artifact path is required');
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

async function main() {
  const command = process.argv[2] ?? 'status';
  if (
    ![
      'status',
      'preflight',
      'bootstrap',
      'apply',
      'restore',
      'web-preflight',
      'web-verify',
      'web-bootstrap',
      'fixture-apply',
      'fixture-restore',
    ].includes(command)
  )
    fail('unsupported command');
  if (command === 'restore' && process.argv[5] !== undefined)
    fail('restore does not accept a caller-supplied completion evidence file');
  if (['bootstrap', 'web-bootstrap'].includes(command) && !process.argv[3])
    fail(`${command} requires an output artifact path before provider access`);
  if (['apply', 'restore'].includes(command) && (!process.argv[3] || !process.argv[4]))
    fail(`${command} requires input and output artifact paths before provider access`);
  if (command === 'fixture-apply') {
    if (!['LIVE-01', 'LIVE-02'].includes(process.argv[3] ?? ''))
      fail(
        'fixture-apply requires an approved LIVE-01 or LIVE-02 mutation ID before credential access'
      );
    if (!process.argv[4] || process.argv[5] !== undefined)
      fail('fixture-apply requires one output artifact path before credential access');
  }
  if (command === 'fixture-restore') {
    if (!process.argv[3] || !process.argv[4] || process.argv[5] !== undefined)
      fail('fixture-restore requires input and output artifact paths before credential access');
  }
  const fixtureRecoveryArtifact =
    command === 'fixture-restore' ? readArtifact(process.argv[3]) : undefined;
  const manifest = loadManifest();
  if (command === 'fixture-restore')
    validateFixtureRecoveryArtifact(fixtureRecoveryArtifact, manifest);
  // Railway TXT values are resolved and validated before the Cloudflare client exists.
  const railwayVerificationValues = command.startsWith('web-')
    ? protectedValues(
        process.env.DNSOPS_RAILWAY_VERIFICATION_SECRET_FILE ??
          `${process.env.HOME}/.config/dns-ops/railway-verification.env`,
        ['RAILWAY_ASORIN_AI_VERIFICATION_TXT', 'RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT']
      )
    : undefined;
  if (command === 'fixture-apply' || command === 'fixture-restore') {
    const token = protectedToken(
      process.env.DNSOPS_FIXTURE_CONTROL_SECRET_FILE ??
        `${process.env.HOME}/.config/dns-ops/fixture-control.env`,
      'DNSOPS_FIXTURE_CONTROL_TOKEN'
    );
    const adapter = createFixtureControlAdapter({ manifest, token });
    const artifact =
      command === 'fixture-apply'
        ? await adapter.apply(process.argv[3])
        : await adapter.restore(fixtureRecoveryArtifact);
    writeArtifact(process.argv[4], artifact);
    console.log(
      JSON.stringify({
        status:
          command === 'fixture-apply'
            ? 'FIXTURE_RECOVERY_ARTIFACT_WRITTEN'
            : 'FIXTURE_RESTORE_ARTIFACT_WRITTEN',
        artifactPath: process.argv[4],
        runId: artifact.runId,
      })
    );
    return;
  }
  // Credential resolution is intentionally here rather than in DNS Ops/MCP or the adapter module.
  const token = protectedToken(
    process.env.DNSOPS_CLOUDFLARE_SECRET_FILE ??
      `${process.env.HOME}/.config/dns-ops/cloudflare-test.env`,
    'CLOUDFLARE_API_TOKEN'
  );
  if (command === 'status') {
    policyFromManifest(manifest, token);
    console.log(
      JSON.stringify({
        status: 'READY_FOR_PREFLIGHT_ONLY',
        manifestId: manifest.manifestId,
        zoneId: manifest.zoneId,
        providerCredentialFingerprint: manifest.providerCredentialFingerprint,
        allowlist: manifest.allowlist,
      })
    );
    return;
  }
  const adapter = createCloudflareAdapter({ manifest, token, railwayVerificationValues });
  if (command === 'web-preflight') {
    console.log(JSON.stringify(await adapter.webPreflight()));
    return;
  }
  if (command === 'web-verify') {
    console.log(JSON.stringify(await adapter.webVerify()));
    return;
  }
  if (command === 'web-bootstrap') {
    const artifact = await adapter.webBootstrap();
    writeArtifact(process.argv[3], artifact);
    console.log(
      JSON.stringify({
        status: 'WEB_BOOTSTRAP_ARTIFACT_WRITTEN',
        artifactPath: process.argv[3],
        baselineHash: artifact.baselineHash,
      })
    );
    return;
  }
  if (command === 'preflight') {
    console.log(JSON.stringify(await adapter.preflight()));
    return;
  }
  if (command === 'bootstrap') {
    const artifact = await adapter.bootstrap();
    writeArtifact(process.argv[3], artifact);
    console.log(
      JSON.stringify({
        status: 'BOOTSTRAP_ARTIFACT_WRITTEN',
        artifactPath: process.argv[3],
        baselineHash: artifact.baselineHash,
      })
    );
    return;
  }
  if (command === 'apply') {
    const artifact = await adapter.apply(readArtifact(process.argv[3]));
    writeArtifact(process.argv[4], artifact);
    console.log(
      JSON.stringify({
        status: 'RECOVERY_ARTIFACT_WRITTEN',
        artifactPath: process.argv[4],
        runId: artifact.runId,
      })
    );
    return;
  }
  const artifact = await adapter.restore(readArtifact(process.argv[3]));
  writeArtifact(process.argv[4], artifact);
  console.log(
    JSON.stringify({
      status: 'RESTORE_ARTIFACT_WRITTEN',
      artifactPath: process.argv[4],
      runId: artifact.runId,
    })
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { fingerprint };
