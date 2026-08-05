import { createHash, randomUUID } from 'node:crypto';
import {
  authorizeControlledFaultMutation,
  validateControlledFaultHarnessPolicy,
  validateFaultRunArtifact,
} from '../../packages/contracts/dist/index.js';

const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const LIVE_03 = Object.freeze({ name: 'mail.asorin.ai', type: 'TXT', mutationId: 'LIVE-03' });
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
    manifest.testAssets?.mailSubdomain !== LIVE_03.name
  )
    fail('manifest test assets are invalid');
  if (!Array.isArray(manifest.allowlist) || manifest.allowlist.length !== 1)
    fail('manifest allowlist is invalid');
  const [entry] = manifest.allowlist;
  if (
    !entry ||
    entry.name !== LIVE_03.name ||
    !Array.isArray(entry.types) ||
    entry.types.length !== 1 ||
    entry.types[0] !== LIVE_03.type ||
    !Array.isArray(entry.mutationIds) ||
    entry.mutationIds.length !== 1 ||
    entry.mutationIds[0] !== LIVE_03.mutationId
  )
    fail('manifest allowlist is invalid');
  const bootstrap = manifest.bootstrapAllowlist;
  if (
    !Array.isArray(bootstrap) ||
    bootstrap.length !== 1 ||
    bootstrap[0]?.name !== LIVE_03.name ||
    bootstrap[0]?.type !== LIVE_03.type ||
    bootstrap[0]?.content !== 'v=spf1 -all' ||
    bootstrap[0]?.ttl !== 60
  )
    fail('manifest bootstrap allowlist is invalid');
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

const completionEvidenceFields = Object.freeze([
  'authoritativeEvidenceIds',
  'scanTaskIds',
  'signalIds',
  'caseIds',
  'auditEventIds',
]);

/**
 * Completion evidence is deliberately separate from the recovery artifact so
 * a prior or caller-supplied artifact cannot self-attest a PASS result.
 */
function completionEvidenceFor(value, runArtifact, restoredAt, providerResponses) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== completionEvidenceFields.length ||
    !completionEvidenceFields.every((field) => Object.hasOwn(value, field))
  )
    return undefined;
  if (
    completionEvidenceFields.some((field) => !Array.isArray(value[field]) || !value[field].length)
  )
    return undefined;

  const evidence = Object.fromEntries(
    completionEvidenceFields.map((field) => [field, [...value[field]]])
  );
  const candidate = {
    ...runArtifact,
    ...evidence,
    providerResponses,
    restoredAt,
    result: 'PASS',
  };
  delete candidate.recovery;
  try {
    validateFaultRunArtifact(candidate);
  } catch {
    return undefined;
  }
  return Object.freeze(evidence);
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

  async function request(operation, path, init) {
    const { manifest: approved } = authorize(operation);
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

  return Object.freeze({
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

    async restore(runArtifact, completionEvidence) {
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
      const evidence = completionEvidenceFor(
        completionEvidence,
        runArtifact,
        restoredAt,
        providerResponses
      );
      const artifact = evidence
        ? {
            ...runArtifact,
            ...evidence,
            providerResponses,
            restoredAt,
            result: 'PASS',
          }
        : {
            ...runArtifact,
            providerResponses,
            restoredAt,
            result: 'RECOVERY_REQUIRED',
            recovery: runArtifact.recovery,
          };
      if (evidence) delete artifact.recovery;
      validateFaultRunArtifact(artifact);
      return Object.freeze(artifact);
    },
  });
}

export { fingerprint, policyFor as policyFromCloudflareManifest };
