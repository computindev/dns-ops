import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCloudflareAdapter } from '../tools/controlled-live-harness/cloudflare-adapter.mjs';
import {
  createFixtureControlAdapter,
  fingerprint as fixtureFingerprint,
} from '../tools/controlled-live-harness/fixture-control.mjs';
import {
  loadManifest,
  loadWebEvidencePreflightSecret,
  policyFromManifest,
  protectedToken,
  protectedValues,
  reserveFixtureArtifact,
  runWebEvidencePreflight,
  validateWebEvidenceEndpoint,
  writeArtifact,
  writeFixtureArtifactAfterTransition,
} from '../tools/controlled-live-harness/runner.mjs';

const token = 'fixture-control-credential-value';
const tokenFingerprint = fixtureFingerprint(token);
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
const fixtureOk = (mode) => ({ ok: true, status: 200, json: async () => ({ mode }) });
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

const fixtureAdapter = (fetch) =>
  createFixtureControlAdapter({
    manifest: manifest(),
    token,
    fetchImpl: fetch,
    now: () => new Date('2026-08-05T15:00:00.000Z'),
    createRunId: () => 'fixture-test-run',
  });

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

test('runner rejects an unapproved fixture mutation before reading credentials', () => {
  const runner = fileURLToPath(
    new URL('../tools/controlled-live-harness/runner.mjs', import.meta.url)
  );
  const result = spawnSync(process.execPath, [runner, 'fixture-apply', 'LIVE-03', 'fault.json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires an approved LIVE-01 or LIVE-02/);
  assert.doesNotMatch(result.stderr, /secret file/);
});

test('runner rejects malformed fixture recovery input before reading credentials', () => {
  const runner = fileURLToPath(
    new URL('../tools/controlled-live-harness/runner.mjs', import.meta.url)
  );
  const recoveryPath = join(mkdtempSync(join(tmpdir(), 'dnsops-')), 'recovery.json');
  writeFileSync(recoveryPath, '[]\n');
  const result = spawnSync(
    process.execPath,
    [runner, 'fixture-restore', recoveryPath, 'restored.json'],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture recovery artifact must be an object/);
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

test('fixture apply and restore use the exact manifest endpoint, read back both transitions, and redact the token', async () => {
  const applyFetch = mockFetch(
    fixtureOk('healthy'),
    fixtureOk('redirect_fault'),
    fixtureOk('redirect_fault')
  );
  const recovery = await fixtureAdapter(applyFetch.fetch).apply('LIVE-01');
  assert.equal(recovery.result, 'RECOVERY_REQUIRED');
  assert.deepEqual(
    applyFetch.calls.map(({ init }) => init.method),
    ['GET', 'POST', 'GET']
  );
  assert.deepEqual(JSON.parse(applyFetch.calls[1].init.body), { mode: 'redirect_fault' });
  assert.equal(applyFetch.calls[0].url, 'https://asorin.ai/__dnsops/live-mode');
  assert.deepEqual(recovery.fixtureResponses, [
    'fixture.mode_apply_before_readback: 200',
    'fixture.mode_apply: 200',
    'fixture.mode_apply_after_readback: 200',
  ]);
  assert.doesNotMatch(JSON.stringify(recovery), new RegExp(token));
  assert.doesNotMatch(JSON.stringify(recovery), /Bearer/);

  const restoreFetch = mockFetch(
    fixtureOk('redirect_fault'),
    fixtureOk('healthy'),
    fixtureOk('healthy')
  );
  const restored = await fixtureAdapter(restoreFetch.fetch).restore(recovery);
  assert.equal(restored.result, 'RESTORED');
  assert.equal(restored.restoredAt, '2026-08-05T15:00:00.000Z');
  assert.deepEqual(
    restoreFetch.calls.map(({ init }) => init.method),
    ['GET', 'POST', 'GET']
  );
  assert.deepEqual(JSON.parse(restoreFetch.calls[1].init.body), { mode: 'healthy' });
  assert.match(restored.fixtureControlCredentialFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(restored), new RegExp(token));
});

test('fixture control fails closed before a mutation when readback or manifest authorization is invalid', async () => {
  const unexpectedState = mockFetch(fixtureOk('noindex_fault'));
  await assert.rejects(
    fixtureAdapter(unexpectedState.fetch).apply('LIVE-01'),
    /pre-transition readback/
  );
  assert.equal(unexpectedState.calls.length, 1);

  const malformed = JSON.parse(JSON.stringify(manifest()));
  malformed.fixtureControl.endpoint = 'https://unapproved.example/__dnsops/live-mode';
  const noRequest = mockFetch(ok({ mode: 'healthy' }));
  assert.throws(
    () => createFixtureControlAdapter({ manifest: malformed, token, fetchImpl: noRequest.fetch }),
    /fixture control manifest/
  );
  assert.equal(noRequest.calls.length, 0);
});

test('fixture artifacts are written mode 600', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'dnsops-')), 'fixture-artifact.json');
  writeArtifact(path, { status: 'redacted' });
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('web evidence preflight pins a public HTTPS endpoint, accepts only the scoped session format, and redacts its artifact', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-'));
  const secretPath = join(directory, 'web-evidence.env');
  const artifactPath = join(directory, 'web-evidence-preflight.json');
  const sessionToken = 'a'.repeat(64);
  writeFileSync(
    secretPath,
    [
      "export DNSOPS_WEB_EVIDENCE_ENDPOINT='https://evidence.example'",
      `export DNSOPS_WEB_EVIDENCE_SESSION_TOKEN='${sessionToken}'`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  chmodSync(secretPath, 0o600);
  const calls = [];
  const artifact = await runWebEvidencePreflight({
    secretFile: secretPath,
    artifactPath,
    resolveHostname: async () => [{ address: '8.8.8.8', family: 4 }],
    fetchImpl: async (endpoint, init) => {
      calls.push({ endpoint, init });
      await new Promise((resolve, reject) =>
        init.lookup('evidence.example', { family: 4 }, (error, address, family) => {
          if (error) reject(error);
          else {
            assert.equal(address, '8.8.8.8');
            assert.equal(family, 4);
            resolve();
          }
        })
      );
      if (endpoint.pathname === '/api/portfolio/audit')
        return { ok: true, status: 200, json: async () => ({ events: [{ private: 'value' }] }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ alerts: [{ private: 'value' }], pagination: { total: 1 } }),
      };
    },
  });
  assert.equal(artifact.status, 'WEB_EVIDENCE_PREFLIGHT_OK');
  assert.deepEqual(artifact.verifiedReadPaths, [
    'GET /api/portfolio/audit: 200',
    'GET /api/alerts: 200',
  ]);
  assert.equal(statSync(artifactPath).mode & 0o777, 0o600);
  const serialized = readFileSync(artifactPath, 'utf8');
  assert.equal(serialized.includes(sessionToken), false);
  assert.equal(serialized.includes('private'), false);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map(({ endpoint }) => `${endpoint.pathname}${endpoint.search}`),
    ['/api/portfolio/audit?limit=1', '/api/alerts?limit=1']
  );
  assert.equal(calls[0].init.headers.Cookie, `dns_ops_session=${sessionToken}`);
  assert.equal(calls[1].init.headers.Cookie, `dns_ops_session=${sessionToken}`);
});

test('web evidence preflight rejects a missing artifact path before reading its session secret', () => {
  const runner = fileURLToPath(
    new URL('../tools/controlled-live-harness/runner.mjs', import.meta.url)
  );
  const result = spawnSync(process.execPath, [runner, 'web-evidence-preflight'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DNSOPS_WEB_EVIDENCE_SECRET_FILE: '/definitely-not-readable/web-evidence.env',
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires one output artifact path/);
  assert.doesNotMatch(result.stderr, /secret file/);
});

test('web evidence preflight rejects unsafe origins and response shapes without publishing an artifact', async () => {
  assert.throws(() => validateWebEvidenceEndpoint('https://127.0.0.1'), /web evidence endpoint/);
  assert.throws(() => validateWebEvidenceEndpoint('https://evidence.example/api'), /web evidence endpoint/);
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-'));
  const secretPath = join(directory, 'web-evidence.env');
  const artifactPath = join(directory, 'web-evidence-preflight.json');
  const existingArtifactPath = join(directory, 'existing-artifact.json');
  writeFileSync(existingArtifactPath, 'existing artifact\n', { mode: 0o600 });
  await assert.rejects(
    runWebEvidencePreflight({
      secretFile: '/definitely-not-readable/web-evidence.env',
      artifactPath: existingArtifactPath,
      fetchImpl: async () => {
        throw new Error('network must not run');
      },
    }),
    /output artifact path already exists/
  );
  assert.equal(readFileSync(existingArtifactPath, 'utf8'), 'existing artifact\n');
  writeFileSync(
    secretPath,
    [
      "export DNSOPS_WEB_EVIDENCE_ENDPOINT='https://evidence.example'",
      `export DNSOPS_WEB_EVIDENCE_SESSION_TOKEN='${'B'.repeat(64)}'`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  chmodSync(secretPath, 0o600);
  assert.throws(() => loadWebEvidencePreflightSecret(secretPath), /session token is invalid/);
  writeFileSync(
    secretPath,
    [
      "export DNSOPS_WEB_EVIDENCE_ENDPOINT='https://evidence.example'",
      `export DNSOPS_WEB_EVIDENCE_SESSION_TOKEN='${'b'.repeat(64)}'`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  let calls = 0;
  await assert.rejects(
    runWebEvidencePreflight({
      secretFile: secretPath,
      artifactPath,
      resolveHostname: async () => [{ address: '8.8.8.8', family: 4 }],
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => ({ events: 'not-an-array' }) };
      },
    }),
    /web evidence .*failed/
  );
  assert.equal(calls, 1);
  assert.equal(existsSync(artifactPath), false);
  assert.deepEqual(readdirSync(directory).sort(), ['existing-artifact.json', 'web-evidence.env']);
});

test('fixture output preflight rejects invalid or existing destinations before any fixture fetch', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-'));
  let fixtureFetchCalls = 0;
  const fixtureFetch = async () => {
    fixtureFetchCalls += 1;
    return { status: 'unreachable' };
  };
  await assert.rejects(
    writeFixtureArtifactAfterTransition(
      join(directory, 'missing', 'fixture-artifact.json'),
      fixtureFetch
    ),
    /destination is invalid/
  );

  const path = join(directory, 'fixture-artifact.json');
  writeFileSync(path, 'existing artifact\n', { mode: 0o600 });
  await assert.rejects(writeFixtureArtifactAfterTransition(path, fixtureFetch), /already exists/);
  assert.equal(fixtureFetchCalls, 0);
  assert.equal(readFileSync(path, 'utf8'), 'existing artifact\n');

  const failedDirectory = mkdtempSync(join(tmpdir(), 'dnsops-'));
  await assert.rejects(
    writeFixtureArtifactAfterTransition(join(failedDirectory, 'failed-artifact.json'), async () => {
      throw new Error('fixture transition failed');
    }),
    /fixture transition failed/
  );
  assert.deepEqual(readdirSync(failedDirectory), []);
});

test('fixture artifact publication creates the final name atomically and never replaces a raced output', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-'));
  const path = join(directory, 'fixture-artifact.json');
  const artifact = { status: 'redacted' };
  const written = await writeFixtureArtifactAfterTransition(path, async () => artifact);
  assert.deepEqual(written, artifact);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), artifact);
  assert.equal(statSync(path).mode & 0o777, 0o600);

  const racedPath = join(directory, 'raced-fixture-artifact.json');
  const reservation = reserveFixtureArtifact(racedPath);
  assert.equal(statSync(reservation.temporaryPath).mode & 0o777, 0o600);
  writeFileSync(racedPath, 'concurrent artifact\n', { mode: 0o600 });
  assert.throws(() => reservation.publish(artifact), /EEXIST/);
  assert.equal(readFileSync(racedPath, 'utf8'), 'concurrent artifact\n');
  assert.equal(existsSync(reservation.temporaryPath), false);
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
