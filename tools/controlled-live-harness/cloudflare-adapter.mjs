import { createHash, randomUUID } from 'node:crypto';
import {
  authorizeControlledFaultMutation,
  validateControlledFaultHarnessPolicy,
  validateFaultRunArtifact,
} from '../../packages/contracts/dist/index.js';

const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const LIVE_03 = Object.freeze({ name: 'mail.asorin.ai', type: 'TXT', mutationId: 'LIVE-03' });
const WEB_BOOTSTRAP = Object.freeze([
  Object.freeze({
    name: 'asorin.ai',
    type: 'CNAME',
    content: 'epgybwo0.up.railway.app',
    ttl: 60,
    mutationId: 'LIVE-02',
  }),
  Object.freeze({
    name: 'www.asorin.ai',
    type: 'CNAME',
    content: '4xbfxxr5.up.railway.app',
    ttl: 60,
    mutationId: 'LIVE-01',
  }),
  Object.freeze({
    name: '_railway-verify.asorin.ai',
    type: 'TXT',
    runtimeValue: 'RAILWAY_ASORIN_AI_VERIFICATION_TXT',
    ttl: 60,
    mutationId: 'LIVE-02',
  }),
  Object.freeze({
    name: '_railway-verify.www.asorin.ai',
    type: 'TXT',
    runtimeValue: 'RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT',
    ttl: 60,
    mutationId: 'LIVE-01',
  }),
]);
const LIVE_03_BOOTSTRAP = Object.freeze({
  name: LIVE_03.name,
  type: LIVE_03.type,
  content: 'v=spf1 -all',
  ttl: 60,
  mutationId: LIVE_03.mutationId,
});
const EXPECTED_ALLOWLIST = Object.freeze([
  ...WEB_BOOTSTRAP.map(({ name, type, mutationId }) => ({ name, type, mutationId })),
  { name: LIVE_03.name, type: LIVE_03.type, mutationId: LIVE_03.mutationId },
]);
const runtimeTxtPattern = /^[\x21-\x7e]{1,255}$/;
const recordIdPattern = /^[a-f0-9]{32}$/;
const fingerprintPattern = /^sha256:[a-f0-9]{64}$/;
const fail = (message) => {
  throw new Error(`controlled-live Cloudflare adapter: ${message}`);
};
const fingerprint = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function freezeManifest(manifest) {
  return Object.freeze({
    ...manifest,
    testAssets: Object.freeze({ ...manifest.testAssets }),
    allowlist: Object.freeze(
      manifest.allowlist.map((entry) =>
        Object.freeze({
          ...entry,
          types: Object.freeze([...entry.types]),
          mutationIds: Object.freeze([...entry.mutationIds]),
        })
      )
    ),
    bootstrapAllowlist: Object.freeze(
      manifest.bootstrapAllowlist.map((entry) => Object.freeze({ ...entry }))
    ),
  });
}

/** Validate the only provider/zone/scenario this isolated adapter can address. */
export function validateCloudflareManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    fail('manifest must be an object');
  if (
    manifest.manifestId !== 'ASORIN-AI-CONTROLLED-LIVE-01-03' ||
    manifest.zone !== 'asorin.ai' ||
    manifest.provider !== 'cloudflare'
  )
    fail('unrecognized manifest');
  if (
    !recordIdPattern.test(manifest.zoneId ?? '') ||
    !fingerprintPattern.test(manifest.providerCredentialFingerprint ?? '')
  )
    fail('manifest identity is invalid');
  if (
    manifest.testAssets?.webHost !== 'asorin.ai' ||
    manifest.testAssets?.wwwHost !== 'www.asorin.ai' ||
    manifest.testAssets?.mailSubdomain !== LIVE_03.name
  )
    fail('manifest test assets are invalid');
  if (!Array.isArray(manifest.allowlist) || manifest.allowlist.length !== EXPECTED_ALLOWLIST.length)
    fail('manifest allowlist is invalid');
  for (const [index, expected] of EXPECTED_ALLOWLIST.entries()) {
    const entry = manifest.allowlist[index];
    if (
      !entry ||
      entry.name !== expected.name ||
      !Array.isArray(entry.types) ||
      entry.types.length !== 1 ||
      entry.types[0] !== expected.type ||
      !Array.isArray(entry.mutationIds) ||
      entry.mutationIds.length !== 1 ||
      entry.mutationIds[0] !== expected.mutationId
    )
      fail('manifest allowlist is invalid');
  }
  const expectedBootstrap = [...WEB_BOOTSTRAP, LIVE_03_BOOTSTRAP];
  const bootstrap = manifest.bootstrapAllowlist;
  if (!Array.isArray(bootstrap) || bootstrap.length !== expectedBootstrap.length)
    fail('manifest bootstrap allowlist is invalid');
  for (const [index, expected] of expectedBootstrap.entries()) {
    const entry = bootstrap[index];
    if (
      !entry ||
      entry.name !== expected.name ||
      entry.type !== expected.type ||
      entry.ttl !== expected.ttl ||
      entry.mutationId !== expected.mutationId ||
      (expected.content !== undefined
        ? entry.content !== expected.content || entry.runtimeValue !== undefined
        : entry.runtimeValue !== expected.runtimeValue || entry.content !== undefined)
    )
      fail('manifest bootstrap allowlist is invalid');
  }
  const policy = {
    testDomain: manifest.zone,
    testWebHost: manifest.testAssets.webHost,
    testMailSubdomain: manifest.testAssets.mailSubdomain,
    providerKind: manifest.provider,
    zoneId: manifest.zoneId,
    providerCredentialFingerprint: manifest.providerCredentialFingerprint,
    allowlist: manifest.allowlist,
  };
  validateControlledFaultHarnessPolicy(policy);
  return freezeManifest(manifest);
}

function policyFor(manifest, token) {
  const approved = validateCloudflareManifest(manifest);
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    fingerprint(token) !== approved.providerCredentialFingerprint
  )
    fail('provider credential fingerprint does not match manifest');
  return {
    manifest: approved,
    policy: {
      testDomain: approved.zone,
      testWebHost: approved.testAssets.webHost,
      testMailSubdomain: approved.testAssets.mailSubdomain,
      providerKind: approved.provider,
      zoneId: approved.zoneId,
      providerCredentialFingerprint: approved.providerCredentialFingerprint,
      allowlist: approved.allowlist,
    },
  };
}

function canonicalBaseline(record) {
  return JSON.stringify({
    id: record.id,
    name: record.name,
    type: record.type,
    content: record.content,
    ttl: record.ttl,
  });
}

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record))
    fail('provider returned an invalid DNS record');
  if (
    !recordIdPattern.test(record.id ?? '') ||
    record.name !== LIVE_03.name ||
    record.type !== LIVE_03.type ||
    record.content !== 'v=spf1 -all' ||
    record.ttl !== 60
  )
    fail('provider record does not match the approved LIVE-03 baseline');
  return Object.freeze({
    id: record.id,
    name: record.name,
    type: record.type,
    content: record.content,
    ttl: record.ttl,
  });
}

/** Runtime TXT verification values are never placed in manifests or artifacts. */
function webBootstrapRecords(runtimeValues) {
  if (
    !runtimeValues ||
    typeof runtimeValues !== 'object' ||
    Array.isArray(runtimeValues) ||
    Object.getPrototypeOf(runtimeValues) !== Object.prototype ||
    Object.keys(runtimeValues).length !== 2
  )
    fail('Railway verification runtime values are invalid');
  const values = {};
  for (const key of [
    'RAILWAY_ASORIN_AI_VERIFICATION_TXT',
    'RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT',
  ]) {
    const value = runtimeValues[key];
    if (typeof value !== 'string' || !runtimeTxtPattern.test(value))
      fail('Railway verification runtime values are invalid');
    values[key] = value;
  }
  return WEB_BOOTSTRAP.map((record) =>
    Object.freeze({
      ...record,
      content: record.runtimeValue === undefined ? record.content : values[record.runtimeValue],
    })
  );
}

function validateWebRecord(record, expected) {
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    !recordIdPattern.test(record.id ?? '') ||
    record.name !== expected.name ||
    record.type !== expected.type ||
    record.content !== expected.content ||
    record.ttl !== expected.ttl
  )
    fail('provider record does not match the approved LIVE-01/02 bootstrap baseline');
  return Object.freeze({
    id: record.id,
    name: record.name,
    type: record.type,
    content: record.content,
    ttl: record.ttl,
  });
}

function canonicalWebBaseline(records) {
  return JSON.stringify(
    records.map((record) => ({
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl,
    }))
  );
}

function assertBootstrapArtifact(value, manifest) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('bootstrap artifact must be an object');
  if (
    value.kind !== 'CLOUDFLARE_LIVE03_BASELINE' ||
    value.manifestId !== manifest.manifestId ||
    value.zoneId !== manifest.zoneId ||
    value.providerCredentialFingerprint !== manifest.providerCredentialFingerprint
  )
    fail('bootstrap artifact does not match the validated manifest');
  const record = validateRecord(value.record);
  if (value.baselineHash !== fingerprint(canonicalBaseline(record)))
    fail('bootstrap artifact baseline hash is invalid');
  return Object.freeze({
    kind: value.kind,
    manifestId: value.manifestId,
    zoneId: value.zoneId,
    providerCredentialFingerprint: value.providerCredentialFingerprint,
    baselineHash: value.baselineHash,
    record,
  });
}

function matchesRestorationBaseline(record, baseline) {
  return (
    record.name === baseline.name &&
    record.type === baseline.type &&
    record.content === baseline.content &&
    record.ttl === baseline.ttl
  );
}

function redactedStatus(operation, response) {
  return `cloudflare.${operation}: ${response.status}`;
}

/**
 * The adapter receives its token from runner.mjs only. It never emits raw
 * provider responses or headers; artifacts contain only strict baseline fields
 * needed for the exact restore and operation/status summaries.
 */
export function createCloudflareAdapter({
  manifest,
  token,
  railwayVerificationValues,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  createRunId = randomUUID,
}) {
  if (typeof fetchImpl !== 'function') fail('fetch implementation is required');
  const initial = policyFor(manifest, token);

  function authorize(_operation) {
    // Revalidate the immutable manifest and token fingerprint before every HTTP operation.
    const current = policyFor(initial.manifest, token);
    authorizeControlledFaultMutation(current.policy, { zoneId: current.policy.zoneId, ...LIVE_03 });
    return current;
  }

  function authorizeWebBootstrap(_operation) {
    // Revalidate the zone and every exact CNAME/TXT tuple before every HTTP operation.
    const current = policyFor(initial.manifest, token);
    for (const record of webBootstrapRecords(railwayVerificationValues)) {
      authorizeControlledFaultMutation(current.policy, {
        zoneId: current.policy.zoneId,
        name: record.name,
        type: record.type,
        mutationId: record.mutationId,
      });
    }
    return current;
  }

  async function request(operation, path, init, authorizeRequest = authorize) {
    const { manifest: approved } = authorizeRequest(operation);
    let response;
    try {
      response = await fetchImpl(`${API_ORIGIN}/zones/${approved.zoneId}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch {
      fail(`${operation} request failed without a provider response`);
    }
    const summary = redactedStatus(operation, response);
    if (!response.ok) fail(`${operation} was rejected (${summary})`);
    let body;
    try {
      body = await response.json();
    } catch {
      fail(`${operation} returned invalid JSON (${summary})`);
    }
    if (!body || body.success !== true)
      fail(`${operation} returned an unsuccessful response (${summary})`);
    return { body, summary };
  }

  async function readBaseline(operation) {
    const query = `?name=${encodeURIComponent(LIVE_03.name)}&type=${LIVE_03.type}`;
    const { body, summary } = await request(operation, `/dns_records${query}`, { method: 'GET' });
    if (!Array.isArray(body.result) || body.result.length !== 1)
      fail('provider must return exactly one approved LIVE-03 record');
    return { record: validateRecord(body.result[0]), summary };
  }

  async function readWebRecord(operation, expected) {
    const query = `?name=${encodeURIComponent(expected.name)}&type=${expected.type}`;
    const { body, summary } = await request(
      operation,
      `/dns_records${query}`,
      { method: 'GET' },
      authorizeWebBootstrap
    );
    if (!Array.isArray(body.result) || body.result.length !== 1)
      fail('provider must return exactly one approved LIVE-01/02 bootstrap record');
    return { record: validateWebRecord(body.result[0], expected), summary };
  }

  async function verifyWebBootstrap(status) {
    // Resolve and validate both TXT values before the first provider request.
    const records = webBootstrapRecords(railwayVerificationValues);
    const zone = await request('web_zone_preflight', '', { method: 'GET' }, authorizeWebBootstrap);
    if (
      zone.body.result?.id !== initial.manifest.zoneId ||
      zone.body.result?.name !== initial.manifest.zone
    )
      fail('provider zone does not match the validated manifest');
    const providerResponses = [zone.summary];
    for (const expected of records) {
      const verified = await readWebRecord('web_dns_verify', expected);
      providerResponses.push(verified.summary);
    }
    return Object.freeze({
      status,
      manifestId: initial.manifest.manifestId,
      zoneId: initial.manifest.zoneId,
      targetNames: records.map(({ name }) => name),
      providerResponses: Object.freeze(providerResponses),
    });
  }

  return Object.freeze({
    /** Read-only LIVE-01/02 DNS preflight with status-only provider evidence. */
    async webPreflight() {
      return verifyWebBootstrap('WEB_PREFLIGHT_OK');
    },

    /** Read-only post-bootstrap verification; never emits TXT verification values. */
    async webVerify() {
      return verifyWebBootstrap('WEB_BOOTSTRAP_VERIFIED');
    },

    async webBootstrap() {
      // Resolve and validate both TXT values before the first provider request.
      const expectedRecords = webBootstrapRecords(railwayVerificationValues);
      const zone = await request(
        'web_zone_bootstrap',
        '',
        { method: 'GET' },
        authorizeWebBootstrap
      );
      if (
        zone.body.result?.id !== initial.manifest.zoneId ||
        zone.body.result?.name !== initial.manifest.zone
      )
        fail('provider zone does not match the validated manifest');
      const providerResponses = [zone.summary];
      const baselineRecords = [];
      for (const expected of expectedRecords) {
        const query = `?name=${encodeURIComponent(expected.name)}&type=${expected.type}`;
        const listed = await request(
          'web_dns_bootstrap_read',
          `/dns_records${query}`,
          { method: 'GET' },
          authorizeWebBootstrap
        );
        providerResponses.push(listed.summary);
        if (!Array.isArray(listed.body.result))
          fail('provider returned an invalid DNS record list');
        if (listed.body.result.length === 0) {
          const created = await request(
            'web_dns_bootstrap_create',
            '/dns_records',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: expected.type,
                name: expected.name,
                content: expected.content,
                ttl: expected.ttl,
              }),
            },
            authorizeWebBootstrap
          );
          providerResponses.push(created.summary);
          baselineRecords.push(validateWebRecord(created.body.result, expected));
        } else if (listed.body.result.length === 1) {
          baselineRecords.push(validateWebRecord(listed.body.result[0], expected));
        } else {
          fail('provider must return at most one approved LIVE-01/02 bootstrap record');
        }
      }
      return Object.freeze({
        kind: 'CLOUDFLARE_LIVE01_02_WEB_BOOTSTRAP',
        manifestId: initial.manifest.manifestId,
        zoneId: initial.manifest.zoneId,
        providerCredentialFingerprint: initial.manifest.providerCredentialFingerprint,
        targetNames: Object.freeze(expectedRecords.map(({ name }) => name)),
        baselineHash: fingerprint(canonicalWebBaseline(baselineRecords)),
        providerResponses: Object.freeze(providerResponses),
      });
    },

    async preflight() {
      const zone = await request('zone_preflight', '', { method: 'GET' });
      if (
        zone.body.result?.id !== initial.manifest.zoneId ||
        zone.body.result?.name !== initial.manifest.zone
      )
        fail('provider zone does not match the validated manifest');
      const baseline = await readBaseline('dns_preflight');
      return Object.freeze({
        status: 'PREFLIGHT_OK',
        manifestId: initial.manifest.manifestId,
        zoneId: initial.manifest.zoneId,
        allowlist: initial.manifest.allowlist,
        providerResponses: [zone.summary, baseline.summary],
      });
    },

    async bootstrap() {
      const query = `?name=${encodeURIComponent(LIVE_03.name)}&type=${LIVE_03.type}`;
      const listed = await request('dns_bootstrap_read', `/dns_records${query}`, { method: 'GET' });
      if (!Array.isArray(listed.body.result)) fail('provider returned an invalid DNS record list');
      let record;
      const responses = [listed.summary];
      if (listed.body.result.length === 0) {
        const created = await request('dns_bootstrap_create', '/dns_records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: LIVE_03.type,
            name: LIVE_03.name,
            content: 'v=spf1 -all',
            ttl: 60,
          }),
        });
        record = validateRecord(created.body.result);
        responses.push(created.summary);
      } else if (listed.body.result.length === 1) {
        record = validateRecord(listed.body.result[0]);
      } else {
        fail('provider must return at most one approved LIVE-03 record for bootstrap');
      }
      const artifact = {
        kind: 'CLOUDFLARE_LIVE03_BASELINE',
        manifestId: initial.manifest.manifestId,
        zoneId: initial.manifest.zoneId,
        providerCredentialFingerprint: initial.manifest.providerCredentialFingerprint,
        baselineHash: fingerprint(canonicalBaseline(record)),
        record,
      };
      return Object.freeze({ ...artifact, providerResponses: Object.freeze(responses) });
    },

    async apply(bootstrapArtifact) {
      const bootstrap = assertBootstrapArtifact(bootstrapArtifact, initial.manifest);
      const current = await readBaseline('dns_apply_baseline_read');
      if (fingerprint(canonicalBaseline(current.record)) !== bootstrap.baselineHash)
        fail('current provider baseline does not match the bootstrap artifact');
      const deleted = await request('dns_delete', `/dns_records/${bootstrap.record.id}`, {
        method: 'DELETE',
      });
      const appliedAt = now().toISOString();
      const artifact = {
        runId: createRunId(),
        mutationId: LIVE_03.mutationId,
        zoneId: initial.manifest.zoneId,
        targetNames: [LIVE_03.name],
        baselineHash: bootstrap.baselineHash,
        providerCredentialFingerprint: initial.manifest.providerCredentialFingerprint,
        appliedAt,
        providerResponses: [current.summary, deleted.summary],
        authoritativeEvidenceIds: [],
        recursiveEvidenceIds: [],
        scanTaskIds: [],
        signalIds: [],
        caseIds: [],
        auditEventIds: [],
        result: 'RECOVERY_REQUIRED',
        recovery: {
          provider: 'cloudflare',
          zoneId: initial.manifest.zoneId,
          records: [
            {
              name: bootstrap.record.name,
              type: bootstrap.record.type,
              desiredValue: bootstrap.record.content,
            },
          ],
          operatorCommands: ['cloudflare.dns_restore: PENDING'],
        },
      };
      validateFaultRunArtifact(artifact);
      return Object.freeze(artifact);
    },

    async restore(runArtifact, ...unexpectedArguments) {
      if (unexpectedArguments.length !== 0)
        fail('restore does not accept caller-supplied completion evidence');
      validateFaultRunArtifact(runArtifact);
      const approved = authorize('dns_restore');
      if (
        runArtifact.mutationId !== LIVE_03.mutationId ||
        runArtifact.zoneId !== approved.policy.zoneId ||
        runArtifact.providerCredentialFingerprint !==
          approved.policy.providerCredentialFingerprint ||
        runArtifact.result !== 'RECOVERY_REQUIRED' ||
        !runArtifact.recovery ||
        runArtifact.recovery.provider !== 'cloudflare'
      )
        fail('recovery artifact is not approved for LIVE-03 restoration');
      const [record] = runArtifact.recovery.records;
      if (
        runArtifact.recovery.records.length !== 1 ||
        record.name !== LIVE_03.name ||
        record.type !== LIVE_03.type ||
        record.desiredValue !== 'v=spf1 -all'
      )
        fail('recovery artifact contains an unapproved record');
      const baseline = Object.freeze({
        name: record.name,
        type: record.type,
        content: record.desiredValue,
        ttl: 60,
      });
      const restored = await request('dns_restore', '/dns_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: baseline.type,
          name: baseline.name,
          content: baseline.content,
          ttl: baseline.ttl,
        }),
      });
      const returnedRecord = validateRecord(restored.body.result);
      if (!matchesRestorationBaseline(returnedRecord, baseline))
        fail('provider restore response does not match the captured baseline');
      const readback = await readBaseline('dns_restore_readback');
      if (!matchesRestorationBaseline(readback.record, baseline))
        fail('provider restoration readback does not match the captured baseline');

      const restoredAt = now().toISOString();
      const providerResponses = [
        ...runArtifact.providerResponses,
        restored.summary,
        readback.summary,
      ];
      const artifact = {
        ...runArtifact,
        providerResponses,
        restoredAt,
        result: 'RESTORED_PENDING_EVIDENCE',
      };
      delete artifact.recovery;
      validateFaultRunArtifact(artifact);
      return Object.freeze(artifact);
    },
  });
}

export { fingerprint, policyFor as policyFromCloudflareManifest };
