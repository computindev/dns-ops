import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCloudflareAdapter } from '../tools/controlled-live-harness/cloudflare-adapter.mjs';
import {
  loadManifest,
  policyFromManifest,
  protectedToken,
  protectedValues,
} from '../tools/controlled-live-harness/runner.mjs';

const token = 'x';
const tokenFingerprint = 'sha256:2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881';
const secret = (value = token) => {
  const p = join(mkdtempSync(join(tmpdir(), 'dnsops-')), 'secret');
  writeFileSync(p, `export CLOUDFLARE_API_TOKEN='${value}'\n`);
  chmodSync(p, 0o600);
  return p;
};
const manifest = () => ({ ...loadManifest(), providerCredentialFingerprint: tokenFingerprint });
const record = {
  id: 'a'.repeat(32),
  name: 'mail.asorin.ai',
  type: 'TXT',
  content: 'v=spf1 -all',
  ttl: 60,
};
const railwayVerificationValues = Object.freeze({
  RAILWAY_ASORIN_AI_VERIFICATION_TXT: randomBytes(24).toString('hex'),
  RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT: randomBytes(24).toString('hex'),
});
const webRecords = Object.freeze([
  {
    id: 'c'.repeat(32),
    name: 'asorin.ai',
    type: 'CNAME',
    content: 'epgybwo0.up.railway.app',
    ttl: 60,
  },
  {
    id: 'd'.repeat(32),
    name: 'www.asorin.ai',
    type: 'CNAME',
    content: '4xbfxxr5.up.railway.app',
    ttl: 60,
  },
  {
    id: 'e'.repeat(32),
    name: '_railway-verify.asorin.ai',
    type: 'TXT',
    content: railwayVerificationValues.RAILWAY_ASORIN_AI_VERIFICATION_TXT,
    ttl: 60,
  },
  {
    id: 'f'.repeat(32),
    name: '_railway-verify.www.asorin.ai',
    type: 'TXT',
    content: railwayVerificationValues.RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT,
    ttl: 60,
  },
]);
const completionEvidence = {
  authoritativeEvidenceIds: ['authoritative-01'],
  scanTaskIds: ['scan-01'],
  signalIds: ['signal-01'],
  caseIds: ['case-01'],
  auditEventIds: ['audit-01'],
};
const ok = (result) => ({ ok: true, status: 200, json: async () => ({ success: true, result }) });
const mockFetch = (...responses) => {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
  };
};

const adapter = (fetch, runtimeValues) =>
  createCloudflareAdapter({
    manifest: manifest(),
    token,
    railwayVerificationValues: runtimeValues,
    fetchImpl: fetch,
    now: () => new Date('2026-08-05T15:00:00.000Z'),
    createRunId: () => 'live-03-test-run',
  });

test('requires a protected secret file', () =>
  assert.equal(protectedToken(secret(), 'CLOUDFLARE_API_TOKEN'), token));
test('derives LIVE-03 authorization from the manifest and pins token fingerprint', () => {
  const m = manifest();
  assert.throws(() => policyFromManifest(m, 'wrong'), /fingerprint/);
});
test('requires an exact mode-600 Railway verification secret file', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'dnsops-')), 'railway-verification');
  writeFileSync(
    path,
    `export RAILWAY_ASORIN_AI_VERIFICATION_TXT='${railwayVerificationValues.RAILWAY_ASORIN_AI_VERIFICATION_TXT}'\nexport RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT='${railwayVerificationValues.RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT}'\n`
  );
  chmodSync(path, 0o600);
  assert.deepEqual(
    protectedValues(path, [
      'RAILWAY_ASORIN_AI_VERIFICATION_TXT',
      'RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT',
    ]),
    railwayVerificationValues
  );
  chmodSync(path, 0o644);
  assert.throws(() => protectedValues(path, ['RAILWAY_ASORIN_AI_VERIFICATION_TXT']), /mode 600/);
});
test('runner keeps LIVE-01/02 fixture mode changes blocked before reading credentials', () => {
  const runner = fileURLToPath(
    new URL('../tools/controlled-live-harness/runner.mjs', import.meta.url)
  );
  const result = spawnSync(process.execPath, [runner, 'fixture-mode', 'redirect_fault'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported command/);
  assert.doesNotMatch(result.stderr, /secret file/);
});

test('runner rejects a caller-supplied completion evidence file before reading credentials', () => {
  const runner = fileURLToPath(
    new URL('../tools/controlled-live-harness/runner.mjs', import.meta.url)
  );
  const result = spawnSync(
    process.execPath,
    [runner, 'restore', 'recovery.json', 'restored.json', 'completion-evidence.json'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not accept a caller-supplied completion evidence file/);
  assert.doesNotMatch(result.stderr, /secret file/);
});

test('runner rejects a missing web-bootstrap artifact path before reading credentials', () => {
  const runner = fileURLToPath(
    new URL('../tools/controlled-live-harness/runner.mjs', import.meta.url)
  );
  const result = spawnSync(process.execPath, [runner, 'web-bootstrap'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /web-bootstrap requires an output artifact path/);
  assert.doesNotMatch(result.stderr, /secret file/);
});

test('LIVE-01/02 web preflight is read-only, validates every bootstrap record, and redacts TXT values', async () => {
  const mocked = mockFetch(
    ok({ id: manifest().zoneId, name: 'asorin.ai' }),
    ...webRecords.map((entry) => ok([entry]))
  );
  const result = await adapter(mocked.fetch, railwayVerificationValues).webPreflight();
  assert.equal(result.status, 'WEB_PREFLIGHT_OK');
  assert.equal(mocked.calls.length, 5);
  assert.deepEqual(
    mocked.calls.map(({ init }) => init.method),
    ['GET', 'GET', 'GET', 'GET', 'GET']
  );
  assert.deepEqual(result.providerResponses, [
    'cloudflare.web_zone_preflight: 200',
    'cloudflare.web_dns_verify: 200',
    'cloudflare.web_dns_verify: 200',
    'cloudflare.web_dns_verify: 200',
    'cloudflare.web_dns_verify: 200',
  ]);
  const emitted = JSON.stringify(result);
  assert.doesNotMatch(
    emitted,
    new RegExp(railwayVerificationValues.RAILWAY_ASORIN_AI_VERIFICATION_TXT)
  );
  assert.doesNotMatch(
    emitted,
    new RegExp(railwayVerificationValues.RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT)
  );
  const verificationFetch = mockFetch(
    ok({ id: manifest().zoneId, name: 'asorin.ai' }),
    ...webRecords.map((entry) => ok([entry]))
  );
  const verification = await adapter(
    verificationFetch.fetch,
    railwayVerificationValues
  ).webVerify();
  assert.equal(verification.status, 'WEB_BOOTSTRAP_VERIFIED');
  assert.equal(verificationFetch.calls.length, 5);
});

test('LIVE-01/02 web bootstrap fails before provider access without exact runtime values', async () => {
  const mocked = mockFetch(ok({}));
  await assert.rejects(
    adapter(mocked.fetch, {
      RAILWAY_ASORIN_AI_VERIFICATION_TXT: 'valid-but-incomplete',
    }).webBootstrap(),
    /runtime values are invalid/
  );
  assert.equal(mocked.calls.length, 0);
});

test('LIVE-01/02 web bootstrap creates only exact missing CNAME/TXT records and emits no TXT values', async () => {
  const created = webRecords.map((entry) => ok(entry));
  const mocked = mockFetch(
    ok({ id: manifest().zoneId, name: 'asorin.ai' }),
    ok([]),
    created[0],
    ok([]),
    created[1],
    ok([]),
    created[2],
    ok([]),
    created[3]
  );
  const artifact = await adapter(mocked.fetch, railwayVerificationValues).webBootstrap();
  assert.equal(artifact.kind, 'CLOUDFLARE_LIVE01_02_WEB_BOOTSTRAP');
  assert.equal(mocked.calls.length, 9);
  assert.deepEqual(
    mocked.calls.map(({ init }) => init.method),
    ['GET', 'GET', 'POST', 'GET', 'POST', 'GET', 'POST', 'GET', 'POST']
  );
  assert.deepEqual(JSON.parse(mocked.calls[4].init.body), {
    type: 'CNAME',
    name: 'www.asorin.ai',
    content: '4xbfxxr5.up.railway.app',
    ttl: 60,
  });
  const emitted = JSON.stringify(artifact);
  assert.doesNotMatch(
    emitted,
    new RegExp(railwayVerificationValues.RAILWAY_ASORIN_AI_VERIFICATION_TXT)
  );
  assert.doesNotMatch(
    emitted,
    new RegExp(railwayVerificationValues.RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT)
  );
});

test('preflight is read-only, verifies zone and exact approved record, and emits redacted summaries', async () => {
  const mocked = mockFetch(ok({ id: manifest().zoneId, name: 'asorin.ai' }), ok([record]));
  const result = await adapter(mocked.fetch).preflight();
  assert.equal(result.status, 'PREFLIGHT_OK');
  assert.deepEqual(result.providerResponses, [
    'cloudflare.zone_preflight: 200',
    'cloudflare.dns_preflight: 200',
  ]);
  assert.equal(mocked.calls.length, 2);
  assert.deepEqual(
    mocked.calls.map(({ init }) => init.method),
    ['GET', 'GET']
  );
  assert.match(mocked.calls[1].url, /name=mail.asorin.ai&type=TXT$/);
  assert.equal(mocked.calls[0].init.headers.Authorization, `Bearer ${token}`);
  assert.doesNotMatch(JSON.stringify(result), /Bearer|secret|authorization/i);
});

test('preflight fails closed on a non-approved provider record without exposing response data', async () => {
  const mocked = mockFetch(
    ok({ id: manifest().zoneId, name: 'asorin.ai' }),
    ok([{ ...record, content: 'sensitive-provider-value' }])
  );
  await assert.rejects(adapter(mocked.fetch).preflight(), /approved LIVE-03 baseline/);
});

test('bootstrap emits a tamper-evident structured baseline artifact', async () => {
  const mocked = mockFetch(ok([record]));
  const artifact = await adapter(mocked.fetch).bootstrap();
  assert.equal(artifact.kind, 'CLOUDFLARE_LIVE03_BASELINE');
  assert.equal(artifact.record.content, 'v=spf1 -all');
  assert.equal(artifact.providerResponses[0], 'cloudflare.dns_bootstrap_read: 200');
  assert.match(artifact.baselineHash, /^sha256:[a-f0-9]{64}$/);
});

test('bootstrap creates only the explicitly approved missing SPF baseline', async () => {
  const mocked = mockFetch(ok([]), ok(record));
  const artifact = await adapter(mocked.fetch).bootstrap();
  assert.deepEqual(
    mocked.calls.map(({ init }) => init.method),
    ['GET', 'POST']
  );
  assert.deepEqual(JSON.parse(mocked.calls[1].init.body), {
    type: 'TXT',
    name: 'mail.asorin.ai',
    content: 'v=spf1 -all',
    ttl: 60,
  });
  assert.equal(artifact.record.id, record.id);
});

test('apply and restore validate the current and restored baselines before emitting RESTORED_PENDING_EVIDENCE', async () => {
  const bootstrapFetch = mockFetch(ok([record]));
  const baseline = await adapter(bootstrapFetch.fetch).bootstrap();
  const applyFetch = mockFetch(ok([record]), ok({ id: record.id }));
  const recovery = await adapter(applyFetch.fetch).apply(baseline);
  assert.deepEqual(
    applyFetch.calls.map(({ init }) => init.method),
    ['GET', 'DELETE']
  );
  assert.match(applyFetch.calls[1].url, new RegExp(`/dns_records/${record.id}$`));
  assert.equal(recovery.result, 'RECOVERY_REQUIRED');
  assert.deepEqual(recovery.recovery.records, [
    { name: 'mail.asorin.ai', type: 'TXT', desiredValue: 'v=spf1 -all' },
  ]);
  assert.deepEqual(recovery.providerResponses, [
    'cloudflare.dns_apply_baseline_read: 200',
    'cloudflare.dns_delete: 200',
  ]);

  const restoredRecord = { ...record, id: 'b'.repeat(32) };
  const restoreFetch = mockFetch(ok(restoredRecord), ok([restoredRecord]));
  const restored = await adapter(restoreFetch.fetch).restore(recovery);
  assert.deepEqual(
    restoreFetch.calls.map(({ init }) => init.method),
    ['POST', 'GET']
  );
  assert.deepEqual(JSON.parse(restoreFetch.calls[0].init.body), {
    type: 'TXT',
    name: 'mail.asorin.ai',
    content: 'v=spf1 -all',
    ttl: 60,
  });
  assert.equal(restored.result, 'RESTORED_PENDING_EVIDENCE');
  assert.equal(restored.recovery, undefined);
  assert.equal(restored.restoredAt, '2026-08-05T15:00:00.000Z');
  assert.deepEqual(restored.authoritativeEvidenceIds, []);
  assert.deepEqual(restored.scanTaskIds, []);
  assert.deepEqual(restored.signalIds, []);
  assert.deepEqual(restored.caseIds, []);
  assert.deepEqual(restored.auditEventIds, []);
  assert.deepEqual(restored.providerResponses, [
    'cloudflare.dns_apply_baseline_read: 200',
    'cloudflare.dns_delete: 200',
    'cloudflare.dns_restore: 200',
    'cloudflare.dns_restore_readback: 200',
  ]);
});

test('apply refuses to delete when the immediate provider baseline differs from bootstrap', async () => {
  const baseline = await adapter(mockFetch(ok([record])).fetch).bootstrap();
  const mocked = mockFetch(ok([{ ...record, id: 'c'.repeat(32) }]));
  await assert.rejects(
    adapter(mocked.fetch).apply(baseline),
    /current provider baseline does not match/
  );
  assert.equal(mocked.calls.length, 1);
});

test('restore rejects caller-supplied completion evidence before making a provider request', async () => {
  const baseline = await adapter(mockFetch(ok([record])).fetch).bootstrap();
  const recovery = await adapter(mockFetch(ok([record]), ok({ id: record.id })).fetch).apply(
    baseline
  );
  const restoreFetch = mockFetch(ok(record));
  await assert.rejects(
    adapter(restoreFetch.fetch).restore(recovery, completionEvidence),
    /does not accept caller-supplied completion evidence/
  );
  assert.equal(restoreFetch.calls.length, 0);
});

test('restore rejects a mismatched provider response or readback before completion', async () => {
  const baseline = await adapter(mockFetch(ok([record])).fetch).bootstrap();
  const recovery = await adapter(mockFetch(ok([record]), ok({ id: record.id })).fetch).apply(
    baseline
  );
  await assert.rejects(
    adapter(mockFetch(ok({ ...record, ttl: 120 })).fetch).restore(recovery),
    /approved LIVE-03 baseline/
  );
  await assert.rejects(
    adapter(mockFetch(ok({ ...record, id: 'b'.repeat(32) }), ok([])).fetch).restore(recovery),
    /exactly one approved LIVE-03 record/
  );
});

test('apply rejects tampered baselines before making any provider request', async () => {
  const mocked = mockFetch(ok({}));
  const baseline = {
    kind: 'CLOUDFLARE_LIVE03_BASELINE',
    manifestId: manifest().manifestId,
    zoneId: manifest().zoneId,
    providerCredentialFingerprint: tokenFingerprint,
    baselineHash: tokenFingerprint,
    record: { ...record, name: 'other.asorin.ai' },
  };
  await assert.rejects(adapter(mocked.fetch).apply(baseline), /approved LIVE-03 baseline/);
  assert.equal(mocked.calls.length, 0);
});

test('manifest fingerprint and exact allowlist are rechecked before an injected fetch can run', async () => {
  const malformed = manifest();
  malformed.allowlist = [{ name: 'mail.asorin.ai', types: ['TXT', 'A'], mutationIds: ['LIVE-03'] }];
  const mocked = mockFetch(ok([]));
  assert.throws(
    () => createCloudflareAdapter({ manifest: malformed, token, fetchImpl: mocked.fetch }),
    /allowlist/
  );
  assert.equal(mocked.calls.length, 0);
  assert.throws(
    () =>
      createCloudflareAdapter({ manifest: manifest(), token: 'wrong', fetchImpl: mocked.fetch }),
    /fingerprint/
  );
  const wrongTarget = JSON.parse(JSON.stringify(manifest()));
  wrongTarget.bootstrapAllowlist[0].content = 'unapproved.example';
  assert.throws(
    () => createCloudflareAdapter({ manifest: wrongTarget, token, fetchImpl: mocked.fetch }),
    /bootstrap allowlist/
  );
  assert.equal(mocked.calls.length, 0);
});

test('provider errors are fail-closed and redact provider bodies', async () => {
  const response = {
    ok: false,
    status: 403,
    json: async () => ({ success: false, errors: [{ message: 'token leaked value' }] }),
  };
  const mocked = mockFetch(response);
  await assert.rejects(
    adapter(mocked.fetch).bootstrap(),
    (error) => !error.message.includes('token leaked value') && /rejected/.test(error.message)
  );
});
