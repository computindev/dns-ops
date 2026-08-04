#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateControlledFaultHarnessPolicy, authorizeControlledFaultMutation } from '../../packages/contracts/dist/index.js';

const ROOT = resolve(import.meta.dirname, '../..');
const DEFAULT_MANIFEST = resolve(ROOT, 'docs/domain-operations/evidence/gate-3/asorin-live-mutation-manifest.json');
const fail = (message) => { throw new Error(`controlled-live harness: ${message}`); };
const fingerprint = (token) => `sha256:${createHash('sha256').update(token).digest('hex')}`;

export function protectedToken(path, name) {
  if ((statSync(path).mode & 0o777) !== 0o600) fail(`${name} secret file must be mode 600`);
  const match = readFileSync(path, 'utf8').match(new RegExp(`^export ${name}='([^'\\n]+)'\\n?$`));
  if (!match) fail(`${name} secret file has invalid format`);
  return match[1];
}
export function loadManifest(path = DEFAULT_MANIFEST) {
  const m = JSON.parse(readFileSync(path, 'utf8'));
  if (m.manifestId !== 'ASORIN-AI-CONTROLLED-LIVE-01-03' || m.zone !== 'asorin.ai' || m.provider !== 'cloudflare') fail('unrecognized manifest');
  if (!/^[a-f0-9]{32}$/.test(m.zoneId) || !/^sha256:[a-f0-9]{64}$/.test(m.providerCredentialFingerprint)) fail('manifest identity is invalid');
  if (m.testAssets?.webHost !== 'asorin.ai' || m.testAssets?.mailSubdomain !== 'mail.asorin.ai') fail('manifest test assets are invalid');
  if (!Array.isArray(m.allowlist) || m.allowlist.length !== 1 || m.allowlist[0]?.name !== 'mail.asorin.ai' || m.allowlist[0]?.types?.join() !== 'TXT' || m.allowlist[0]?.mutationIds?.join() !== 'LIVE-03') fail('manifest allowlist is invalid');
  return Object.freeze(m);
}
export function policyFromManifest(manifest, token) {
  if (fingerprint(token) !== manifest.providerCredentialFingerprint) fail('provider credential fingerprint does not match manifest');
  const policy = { testDomain: manifest.zone, testWebHost: manifest.testAssets.webHost, testMailSubdomain: manifest.testAssets.mailSubdomain, providerKind: manifest.provider, zoneId: manifest.zoneId, providerCredentialFingerprint: manifest.providerCredentialFingerprint, allowlist: manifest.allowlist };
  validateControlledFaultHarnessPolicy(policy); return policy;
}
export function requireLive03Preconditions({ manifest, token, evidence }) {
  const policy = policyFromManifest(manifest, token);
  authorizeControlledFaultMutation(policy, { zoneId: policy.zoneId, name: 'mail.asorin.ai', type: 'TXT', mutationId: 'LIVE-03' });
  if (!evidence || evidence.spfRecords !== 1 || evidence.ttl !== 60 || evidence.mxRecords !== 0) fail('LIVE-03 authoritative baseline rejected');
  for (const id of ['scanTaskIds', 'signalIds', 'caseIds', 'auditEventIds']) if (!Array.isArray(evidence[id]) || evidence[id].length === 0) fail(`missing required ${id}`);
}
function main() {
  const command = process.argv[2] ?? 'status';
  if (!['status', 'prepare', 'apply', 'verify', 'restore', 'run', 'recover'].includes(command)) fail('unsupported command');
  const token = protectedToken(process.env.DNSOPS_CLOUDFLARE_SECRET_FILE ?? `${process.env.HOME}/.config/dns-ops/cloudflare-test.env`, 'CLOUDFLARE_API_TOKEN');
  const manifest = loadManifest(); policyFromManifest(manifest, token);
  if (command === 'status') return console.log(JSON.stringify({ status: 'READY_FOR_PREFLIGHT_ONLY', manifestId: manifest.manifestId, zoneId: manifest.zoneId }));
  fail(`${command} requires a provider-specific adapter; no provider request was made`);
}
if (process.argv[1] === new URL(import.meta.url).pathname) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
