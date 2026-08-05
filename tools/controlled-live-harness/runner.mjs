#!/usr/bin/env node
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCloudflareAdapter,
  fingerprint,
  policyFromCloudflareManifest,
  validateCloudflareManifest,
} from './cloudflare-adapter.mjs';

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

export function loadManifest(path = DEFAULT_MANIFEST) {
  return validateCloudflareManifest(JSON.parse(readFileSync(path, 'utf8')));
}

export function policyFromManifest(manifest, token) {
  return policyFromCloudflareManifest(manifest, token).policy;
}

export function requireLive03Preconditions({ manifest, token, evidence }) {
  policyFromManifest(manifest, token);
  if (!evidence || evidence.spfRecords !== 1 || evidence.ttl !== 60 || evidence.mxRecords !== 0)
    fail('LIVE-03 authoritative baseline rejected');
  for (const id of [
    'authoritativeEvidenceIds',
    'scanTaskIds',
    'signalIds',
    'caseIds',
    'auditEventIds',
  ])
    if (!Array.isArray(evidence[id]) || evidence[id].length === 0) fail(`missing required ${id}`);
}

function readArtifact(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('artifact file must contain valid JSON');
  }
}

function writeArtifact(path, artifact) {
  if (!path) fail('an output artifact path is required');
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function main() {
  const command = process.argv[2] ?? 'status';
  if (!['status', 'preflight', 'bootstrap', 'apply', 'restore'].includes(command))
    fail('unsupported command');
  // Credential resolution is intentionally here rather than in DNS Ops/MCP or the adapter module.
  const token = protectedToken(
    process.env.DNSOPS_CLOUDFLARE_SECRET_FILE ??
      `${process.env.HOME}/.config/dns-ops/cloudflare-test.env`,
    'CLOUDFLARE_API_TOKEN'
  );
  const manifest = loadManifest();
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
  const adapter = createCloudflareAdapter({ manifest, token });
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
