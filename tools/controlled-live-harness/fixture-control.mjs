import { createHash, randomUUID } from 'node:crypto';

const FIXTURE_ENDPOINT = 'https://asorin.ai/__dnsops/live-mode';
const HEALTHY_MODE = 'healthy';
const FIXTURE_MODES = Object.freeze([
  Object.freeze({
    mutationId: 'LIVE-01',
    mode: 'redirect_fault',
    targetName: 'www.asorin.ai',
  }),
  Object.freeze({
    mutationId: 'LIVE-02',
    mode: 'noindex_fault',
    targetName: 'asorin.ai',
  }),
]);
const artifactKeys = new Set([
  'kind',
  'runId',
  'manifestId',
  'fixtureEndpoint',
  'mutationId',
  'targetNames',
  'baselineHash',
  'fixtureControlCredentialFingerprint',
  'appliedAt',
  'restoredAt',
  'fixtureResponses',
  'result',
]);
const fingerprintPattern = /^sha256:[a-f0-9]{64}$/;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const fail = (message) => {
  throw new Error(`controlled-live fixture control: ${message}`);
};

export const fingerprint = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function sameMode(actual, expected) {
  return (
    actual?.mutationId === expected.mutationId &&
    actual?.mode === expected.mode &&
    actual?.targetName === expected.targetName
  );
}

/** Pins the fixture's sole control URL and the two authorized LIVE fault modes. */
export function validateFixtureControlManifest(manifest) {
  const control = manifest?.fixtureControl;
  if (!control || typeof control !== 'object' || Array.isArray(control))
    fail('fixture control manifest is invalid');
  if (
    control.endpoint !== FIXTURE_ENDPOINT ||
    control.healthyMode !== HEALTHY_MODE ||
    !Array.isArray(control.modes) ||
    control.modes.length !== FIXTURE_MODES.length
  )
    fail('fixture control manifest is invalid');
  for (const [index, expected] of FIXTURE_MODES.entries()) {
    if (!sameMode(control.modes[index], expected)) fail('fixture control manifest is invalid');
  }
  return Object.freeze({
    endpoint: control.endpoint,
    healthyMode: control.healthyMode,
    modes: Object.freeze(FIXTURE_MODES.map((mode) => Object.freeze({ ...mode }))),
  });
}

function modeFor(control, mutationId) {
  const mode = control.modes.find((entry) => entry.mutationId === mutationId);
  if (!mode) fail('fixture mutation is not allowlisted');
  return mode;
}

function baselineHash(control) {
  return fingerprint(JSON.stringify({ endpoint: control.endpoint, mode: control.healthyMode }));
}

function responseSummary(operation, response) {
  return `fixture.${operation}: ${response.status}`;
}

function assertModeBody(body, control, operation) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, 'mode') ||
    typeof body.mode !== 'string' ||
    (body.mode !== control.healthyMode && !control.modes.some((entry) => entry.mode === body.mode))
  )
    fail(`${operation} returned an invalid mode readback`);
  return body.mode;
}

function assertArtifactShape(artifact, manifest, control) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact))
    fail('fixture recovery artifact must be an object');
  if (
    Reflect.ownKeys(artifact).some((key) => typeof key !== 'string' || !artifactKeys.has(key)) ||
    artifact.kind !== 'FIXTURE_LIVE01_02_FAULT' ||
    typeof artifact.runId !== 'string' ||
    !/^[a-zA-Z0-9-]{1,128}$/.test(artifact.runId) ||
    artifact.manifestId !== manifest.manifestId ||
    artifact.fixtureEndpoint !== control.endpoint ||
    !Array.isArray(artifact.targetNames) ||
    artifact.targetNames.length !== 1 ||
    artifact.baselineHash !== baselineHash(control) ||
    !fingerprintPattern.test(artifact.fixtureControlCredentialFingerprint ?? '') ||
    !isoTimestampPattern.test(artifact.appliedAt ?? '') ||
    !Array.isArray(artifact.fixtureResponses) ||
    artifact.fixtureResponses.some((response) => !/^fixture\.[a-z_]+: [1-5]\d\d$/.test(response)) ||
    artifact.result !== 'RECOVERY_REQUIRED' ||
    artifact.restoredAt !== undefined
  )
    fail('fixture recovery artifact is invalid');
  const mode = modeFor(control, artifact.mutationId);
  if (artifact.targetNames[0] !== mode.targetName) fail('fixture recovery artifact is invalid');
  return mode;
}

/** Validates untrusted fixture recovery input before the runner reads a token. */
export function validateFixtureRecoveryArtifact(artifact, manifest) {
  return assertArtifactShape(artifact, manifest, validateFixtureControlManifest(manifest));
}

/**
 * Isolated fixture-control client. It accepts only the manifest-pinned endpoint
 * and modes, and emits status summaries rather than HTTP bodies or credentials.
 */
export function createFixtureControlAdapter({
  manifest,
  token,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  createRunId = randomUUID,
}) {
  if (typeof fetchImpl !== 'function') fail('fetch implementation is required');
  if (typeof token !== 'string' || token.length === 0) fail('fixture control token is invalid');
  const control = validateFixtureControlManifest(manifest);

  async function request(operation, init) {
    // Revalidate the immutable manifest-derived endpoint/modes before every request.
    const approved = validateFixtureControlManifest(manifest);
    let response;
    try {
      response = await fetchImpl(approved.endpoint, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch {
      fail(`${operation} request failed without a fixture response`);
    }
    const summary = responseSummary(operation, response);
    if (!response.ok) fail(`${operation} was rejected (${summary})`);
    let body;
    try {
      body = await response.json();
    } catch {
      fail(`${operation} returned invalid JSON (${summary})`);
    }
    return { mode: assertModeBody(body, control, operation), summary };
  }

  async function readback(operation) {
    return request(operation, { method: 'GET' });
  }

  async function transition(expectedBefore, desiredMode, operation) {
    const before = await readback(`${operation}_before_readback`);
    if (before.mode !== expectedBefore)
      fail(`${operation} pre-transition readback does not match the expected mode`);
    const applied = await request(operation, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: desiredMode }),
    });
    if (applied.mode !== desiredMode) fail(`${operation} response does not match the desired mode`);
    const after = await readback(`${operation}_after_readback`);
    if (after.mode !== desiredMode)
      fail(`${operation} post-transition readback does not match the desired mode`);
    return [before.summary, applied.summary, after.summary];
  }

  return Object.freeze({
    async apply(mutationId) {
      const mode = modeFor(validateFixtureControlManifest(manifest), mutationId);
      const fixtureResponses = await transition(control.healthyMode, mode.mode, 'mode_apply');
      return Object.freeze({
        kind: 'FIXTURE_LIVE01_02_FAULT',
        runId: createRunId(),
        manifestId: manifest.manifestId,
        fixtureEndpoint: control.endpoint,
        mutationId: mode.mutationId,
        targetNames: Object.freeze([mode.targetName]),
        baselineHash: baselineHash(control),
        fixtureControlCredentialFingerprint: fingerprint(token),
        appliedAt: now().toISOString(),
        fixtureResponses: Object.freeze(fixtureResponses),
        result: 'RECOVERY_REQUIRED',
      });
    },

    async restore(runArtifact) {
      const mode = assertArtifactShape(runArtifact, manifest, control);
      if (runArtifact.fixtureControlCredentialFingerprint !== fingerprint(token))
        fail('fixture recovery artifact does not match the current control credential');
      const fixtureResponses = await transition(mode.mode, control.healthyMode, 'mode_restore');
      return Object.freeze({
        ...runArtifact,
        restoredAt: now().toISOString(),
        fixtureResponses: Object.freeze([...runArtifact.fixtureResponses, ...fixtureResponses]),
        result: 'RESTORED',
      });
    },
  });
}
