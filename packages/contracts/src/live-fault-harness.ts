export const LIVE_FAULT_MUTATION_IDS = ['LIVE-01', 'LIVE-02', 'LIVE-03'] as const;

export type LiveFaultMutationId = (typeof LIVE_FAULT_MUTATION_IDS)[number];

export const CONTROLLED_FAULT_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT'] as const;

export type ControlledFaultRecordType = (typeof CONTROLLED_FAULT_RECORD_TYPES)[number];

/**
 * Secret-free configuration required by an isolated future live-fault harness.
 * DNS Ops and MCP must never receive a provider token; the harness resolves its
 * credential from its own runtime secret only after this policy is validated.
 */
export interface ControlledFaultHarnessPolicy {
  testDomain: string;
  testWebHost: string;
  testMailSubdomain: string;
  providerKind: string;
  zoneId: string;
  providerCredentialFingerprint: string;
  allowlist: readonly ControlledFaultAllowlistEntry[];
}

export interface ControlledFaultAllowlistEntry {
  name: string;
  types: readonly ControlledFaultRecordType[];
  mutationIds: readonly LiveFaultMutationId[];
}

export interface ControlledFaultMutationRequest {
  zoneId: string;
  name: string;
  type: ControlledFaultRecordType;
  mutationId: LiveFaultMutationId;
}

export interface AuthorizedControlledFaultMutation {
  zoneId: string;
  name: string;
  type: ControlledFaultRecordType;
  mutationId: LiveFaultMutationId;
  providerKind: string;
  providerCredentialFingerprint: string;
}

export const FAULT_RUN_RESULTS = ['PASS', 'FAIL', 'RECOVERY_REQUIRED'] as const;

export type FaultRunResult = (typeof FAULT_RUN_RESULTS)[number];

/**
 * Redacted, durable evidence emitted by the future isolated provider harness.
 * It intentionally permits only a credential fingerprint, never a token value.
 */
export interface FaultRecoveryArtifact {
  provider: string;
  zoneId: string;
  records: readonly FaultRecoveryRecord[];
  operatorCommands: readonly string[];
}

export interface FaultRecoveryRecord {
  name: string;
  type: ControlledFaultRecordType;
  desiredValue: string;
}

export interface FaultRunArtifact {
  runId: string;
  mutationId: LiveFaultMutationId;
  zoneId: string;
  targetNames: readonly string[];
  baselineHash: string;
  providerCredentialFingerprint: string;
  appliedAt?: string;
  restoredAt?: string;
  providerResponses: readonly string[];
  authoritativeEvidenceIds: readonly string[];
  recursiveEvidenceIds: readonly string[];
  scanTaskIds: readonly string[];
  signalIds: readonly string[];
  caseIds: readonly string[];
  auditEventIds: readonly string[];
  result: FaultRunResult;
  recovery?: FaultRecoveryArtifact;
}

interface ValidatedControlledFaultPolicy {
  testDomain: string;
  testWebHost: string;
  testMailSubdomain: string;
  providerKind: string;
  zoneId: string;
  providerCredentialFingerprint: string;
  allowlist: readonly {
    name: string;
    types: readonly ControlledFaultRecordType[];
    mutationIds: readonly LiveFaultMutationId[];
  }[];
}

interface ValidatedControlledFaultRequest {
  zoneId: string;
  name: string;
  type: ControlledFaultRecordType;
  mutationId: LiveFaultMutationId;
}

const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const recordLabel = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/;
const fingerprintPattern = /^sha256:[a-f0-9]{64}$/;
const providerKindPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const policyKeys = new Set([
  'testDomain',
  'testWebHost',
  'testMailSubdomain',
  'providerKind',
  'zoneId',
  'providerCredentialFingerprint',
  'allowlist',
]);
const allowlistEntryKeys = new Set(['name', 'types', 'mutationIds']);
const requestKeys = new Set(['zoneId', 'name', 'type', 'mutationId']);
const faultRunArtifactKeys = new Set([
  'runId',
  'mutationId',
  'zoneId',
  'targetNames',
  'baselineHash',
  'providerCredentialFingerprint',
  'appliedAt',
  'restoredAt',
  'providerResponses',
  'authoritativeEvidenceIds',
  'recursiveEvidenceIds',
  'scanTaskIds',
  'signalIds',
  'caseIds',
  'auditEventIds',
  'result',
  'recovery',
]);
const faultRecoveryKeys = new Set(['provider', 'zoneId', 'records', 'operatorCommands']);
const faultRecoveryRecordKeys = new Set(['name', 'type', 'desiredValue']);
const maximumAllowlistEntries = 64;
const maximumArtifactItems = 128;
const maximumArtifactSummaryLength = 1_024;
const artifactIdentifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/;
const providerResponsePattern = /^[a-z][a-z0-9._-]{0,63}: (?:[1-5]\d\d|[A-Z][A-Z0-9_]{1,63})$/;
const isoTimestampPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;
const credentialMaterialPattern =
  /(?:token|secret|password|credential|authorization|bearer|cookie|session|api[ _-]?key|private[ _-]?key|sk_(?:live|test)_|gh[pousr]_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[a-zA-Z0-9-]{10,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/i;
const recoveryOperationPattern = /^[a-z][a-z0-9._-]{0,63}: (?:[1-5]\d\d|[A-Z][A-Z0-9_]{1,63})$/;

type DataDescriptorMap = Record<string, PropertyDescriptor>;

function assertNonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a non-empty string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function assertCanonicalArtifactText(value: unknown, label: string): string {
  const normalized = assertNonEmpty(value, label);
  if (value !== normalized) {
    throw new Error(`${label} must not contain surrounding whitespace`);
  }
  return normalized;
}

function normalizeDnsName(value: unknown, label: string, pattern: RegExp): string {
  const normalized = assertNonEmpty(value, label).toLowerCase().replace(/\.$/, '');
  if (normalized.length > 253) {
    throw new Error(`${label} must contain a DNS name of 1-253 characters`);
  }

  const labels = normalized.split('.');
  if (labels.some((part) => !pattern.test(part))) {
    throw new Error(`${label} must be a valid lowercase DNS name`);
  }

  return normalized;
}

function normalizeHostname(value: unknown, label: string): string {
  return normalizeDnsName(value, label, hostnameLabel);
}

function normalizeRecordName(value: unknown, label: string): string {
  return normalizeDnsName(value, label, recordLabel);
}

function normalizeRecordType(value: unknown, label: string): ControlledFaultRecordType {
  if (!CONTROLLED_FAULT_RECORD_TYPES.includes(value as ControlledFaultRecordType)) {
    throw new Error(`${label} is not permitted`);
  }
  return value as ControlledFaultRecordType;
}

function normalizeMutationId(value: unknown, label: string): LiveFaultMutationId {
  if (!LIVE_FAULT_MUTATION_IDS.includes(value as LiveFaultMutationId)) {
    throw new Error(`${label} is not permitted`);
  }
  return value as LiveFaultMutationId;
}

function isNameInDomain(name: string, domain: string): boolean {
  return name === domain || name.endsWith(`.${domain}`);
}

/**
 * Accept only plain, enumerable data objects. This rejects accessors,
 * non-enumerable keys, symbols, prototypes, and unknown fields before values
 * are copied into a canonical immutable validation snapshot.
 */
function readPlainDataObject(value: unknown, allowedKeys: ReadonlySet<string>): DataDescriptorMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Controlled fault policy objects must be plain enumerable data objects');
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Controlled fault policy objects must be plain enumerable data objects');
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowedKeys.has(key)) {
      throw new Error(
        'Controlled fault policy must not contain a provider credential value or unknown field'
      );
    }

    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new Error('Controlled fault policy objects must contain only enumerable data fields');
    }
  }

  return descriptors;
}

function readDataField(descriptors: DataDescriptorMap, key: string): unknown {
  return descriptors[key]?.value;
}

function readDataArray(value: unknown, label: string, maximumLength: number): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  const declaredLengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !declaredLengthDescriptor ||
    !('value' in declaredLengthDescriptor) ||
    !Number.isSafeInteger(declaredLengthDescriptor.value)
  ) {
    throw new Error(`${label} must be a plain data array`);
  }
  if (declaredLengthDescriptor.value > maximumLength) {
    throw new Error(`${label} must contain no more than ${maximumLength} values`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value) as DataDescriptorMap;
  const lengthDescriptor = descriptors.length;
  if (
    !lengthDescriptor ||
    !('value' in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value)
  ) {
    throw new Error(`${label} must be a plain data array`);
  }

  const length = lengthDescriptor.value as number;
  const indexedValues: Array<{ index: number; value: unknown }> = [];
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) {
      throw new Error(`${label} must not contain extra fields`);
    }

    const index = Number(key);
    if (index >= length) {
      throw new Error(`${label} contains an index outside its declared length`);
    }

    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label} must contain only enumerable data values`);
    }
    indexedValues.push({ index, value: descriptor.value });
  }

  if (indexedValues.length !== length) {
    throw new Error(`${label} must not be sparse or accessor-backed`);
  }

  return indexedValues.sort((left, right) => left.index - right.index).map(({ value }) => value);
}

function normalizeAllowlist(
  value: unknown,
  testDomain: string
): ValidatedControlledFaultPolicy['allowlist'] {
  const entries = readDataArray(value, 'allowlist', maximumAllowlistEntries);
  if (entries.length === 0) {
    throw new Error('allowlist must contain at least one explicitly approved record');
  }

  const seenEntries = new Set<string>();
  return entries.map((entry) => {
    const fields = readPlainDataObject(entry, allowlistEntryKeys);
    const name = normalizeRecordName(readDataField(fields, 'name'), 'allowlist record name');
    if (!isNameInDomain(name, testDomain)) {
      throw new Error('allowlist record name must remain inside testDomain');
    }

    const types = readDataArray(
      readDataField(fields, 'types'),
      'allowlist record types',
      CONTROLLED_FAULT_RECORD_TYPES.length
    ).map((type) => normalizeRecordType(type, 'allowlist record type'));
    const mutationIds = readDataArray(
      readDataField(fields, 'mutationIds'),
      'allowlist mutation IDs',
      LIVE_FAULT_MUTATION_IDS.length
    ).map((mutationId) => normalizeMutationId(mutationId, 'allowlist mutation ID'));
    if (types.length === 0 || mutationIds.length === 0) {
      throw new Error(
        'each allowlist entry must authorize at least one record type and mutation ID'
      );
    }
    if (new Set(types).size !== types.length || new Set(mutationIds).size !== mutationIds.length) {
      throw new Error('allowlist record types and mutation IDs must not contain duplicates');
    }

    const entryKey = `${name}:${[...types].sort().join(',')}:${[...mutationIds].sort().join(',')}`;
    if (seenEntries.has(entryKey)) {
      throw new Error('allowlist must not contain duplicate authorization entries');
    }
    seenEntries.add(entryKey);

    return { name, types, mutationIds };
  });
}

function normalizeControlledFaultHarnessPolicy(policy: unknown): ValidatedControlledFaultPolicy {
  const fields = readPlainDataObject(policy, policyKeys);
  const testDomain = normalizeHostname(readDataField(fields, 'testDomain'), 'testDomain');
  const testWebHost = normalizeHostname(readDataField(fields, 'testWebHost'), 'testWebHost');
  const testMailSubdomain = normalizeHostname(
    readDataField(fields, 'testMailSubdomain'),
    'testMailSubdomain'
  );

  if (!isNameInDomain(testWebHost, testDomain)) {
    throw new Error('testWebHost must be the test domain or one of its subdomains');
  }
  if (testMailSubdomain === testDomain || !isNameInDomain(testMailSubdomain, testDomain)) {
    throw new Error('testMailSubdomain must be a strict subdomain of testDomain');
  }

  const providerKind = assertNonEmpty(
    readDataField(fields, 'providerKind'),
    'providerKind'
  ).toLowerCase();
  if (!providerKindPattern.test(providerKind)) {
    throw new Error(
      'providerKind must contain 1-64 lowercase letters, digits, dots, underscores, or hyphens'
    );
  }

  const zoneId = assertCanonicalArtifactText(readDataField(fields, 'zoneId'), 'zoneId');
  validateArtifactIdentifier(zoneId, 'zoneId');
  const providerCredentialFingerprint = assertNonEmpty(
    readDataField(fields, 'providerCredentialFingerprint'),
    'providerCredentialFingerprint'
  );
  if (!fingerprintPattern.test(providerCredentialFingerprint)) {
    throw new Error(
      'providerCredentialFingerprint must be a sha256:<64 lowercase hex> fingerprint'
    );
  }

  return {
    testDomain,
    testWebHost,
    testMailSubdomain,
    providerKind,
    zoneId,
    providerCredentialFingerprint,
    allowlist: normalizeAllowlist(readDataField(fields, 'allowlist'), testDomain),
  };
}

function normalizeControlledFaultMutationRequest(
  request: unknown
): ValidatedControlledFaultRequest {
  const fields = readPlainDataObject(request, requestKeys);
  const zoneId = assertCanonicalArtifactText(
    readDataField(fields, 'zoneId'),
    'controlled fault mutation zoneId'
  );
  validateArtifactIdentifier(zoneId, 'controlled fault mutation zoneId');
  return {
    zoneId,
    name: normalizeRecordName(
      readDataField(fields, 'name'),
      'controlled fault mutation record name'
    ),
    type: normalizeRecordType(
      readDataField(fields, 'type'),
      'controlled fault mutation record type'
    ),
    mutationId: normalizeMutationId(
      readDataField(fields, 'mutationId'),
      'controlled fault mutation ID'
    ),
  };
}

function validateArtifactIdentifier(value: unknown, label: string): void {
  const identifier = assertCanonicalArtifactText(value, label);
  if (!artifactIdentifierPattern.test(identifier) || credentialMaterialPattern.test(identifier)) {
    throw new Error(`${label} must be a bounded non-secret identifier`);
  }
}

function validateArtifactIdList(value: unknown, label: string): void {
  const values = readDataArray(value, label, maximumArtifactItems);
  for (const item of values) {
    validateArtifactIdentifier(item, label);
  }
}

function validateProviderResponseList(value: unknown): void {
  const values = readDataArray(value, 'providerResponses', maximumArtifactItems);
  for (const item of values) {
    const response = assertCanonicalArtifactText(item, 'providerResponses');
    if (!providerResponsePattern.test(response)) {
      throw new Error('providerResponses must contain only operation/status summaries');
    }
  }
}

function validateRecoveryText(value: unknown, label: string, maximumLength: number): void {
  const text = assertCanonicalArtifactText(value, label);
  if (text.length > maximumLength || /[\r\n]/.test(text) || credentialMaterialPattern.test(text)) {
    throw new Error(`${label} must be bounded and must not contain credential material`);
  }
}

function validateRecoveryOperationReference(value: unknown): void {
  validateRecoveryText(value, 'recovery.operatorCommands', maximumArtifactSummaryLength);
  if (!recoveryOperationPattern.test(value as string)) {
    throw new Error('recovery.operatorCommands must contain approved operation references');
  }
}

function validateRecoveryArtifact(
  value: unknown,
  artifactZoneId: string,
  artifactTargetNames: readonly string[]
): void {
  const fields = readPlainDataObject(value, faultRecoveryKeys);
  validateArtifactIdentifier(readDataField(fields, 'provider'), 'recovery.provider');
  const recoveryZoneId = assertCanonicalArtifactText(
    readDataField(fields, 'zoneId'),
    'recovery.zoneId'
  );
  validateArtifactIdentifier(recoveryZoneId, 'recovery.zoneId');
  if (recoveryZoneId !== artifactZoneId) {
    throw new Error('recovery.zoneId must match the fault artifact zoneId');
  }

  const records = readDataArray(
    readDataField(fields, 'records'),
    'recovery.records',
    maximumAllowlistEntries
  );
  if (records.length === 0) {
    throw new Error('recovery.records must contain at least one record');
  }
  for (const record of records) {
    const recordFields = readPlainDataObject(record, faultRecoveryRecordKeys);
    const name = assertCanonicalArtifactText(
      readDataField(recordFields, 'name'),
      'recovery.records name'
    );
    const normalizedName = normalizeRecordName(name, 'recovery.records name');
    if (name !== normalizedName) {
      throw new Error('recovery.records names must be lowercase DNS names without a trailing dot');
    }
    if (!artifactTargetNames.includes(normalizedName)) {
      throw new Error('recovery.records names must be declared fault artifact targets');
    }
    normalizeRecordType(readDataField(recordFields, 'type'), 'recovery.records type');
    validateRecoveryText(
      readDataField(recordFields, 'desiredValue'),
      'recovery.records desiredValue',
      4_096
    );
  }

  const commands = readDataArray(
    readDataField(fields, 'operatorCommands'),
    'recovery.operatorCommands',
    maximumArtifactItems
  );
  if (commands.length === 0) {
    throw new Error('recovery.operatorCommands must contain at least one command');
  }
  for (const command of commands) {
    validateRecoveryOperationReference(command);
  }
}

function validateIsoTimestamp(value: unknown, label: string): number {
  const timestamp = assertCanonicalArtifactText(value, label);
  const match = isoTimestampPattern.exec(timestamp);
  if (!match) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp`);
  }

  const fraction = (match[2] ?? '').padEnd(3, '0');
  const canonicalTimestamp = `${match[1]}.${fraction}Z`;
  const milliseconds = Date.parse(timestamp);
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== canonicalTimestamp) {
    throw new Error(`${label} must be a calendar-valid ISO-8601 UTC timestamp`);
  }
  return milliseconds;
}

/**
 * Validates the runbook's durable artifact shape and rejects credential/header
 * material before an artifact can be stored or emitted. It performs no I/O.
 */
export function validateFaultRunArtifact(artifact: FaultRunArtifact): void {
  const fields = readPlainDataObject(artifact, faultRunArtifactKeys);
  validateArtifactIdentifier(readDataField(fields, 'runId'), 'runId');
  normalizeMutationId(readDataField(fields, 'mutationId'), 'mutationId');
  const artifactZoneId = assertCanonicalArtifactText(readDataField(fields, 'zoneId'), 'zoneId');
  validateArtifactIdentifier(artifactZoneId, 'zoneId');

  const targetNames = readDataArray(
    readDataField(fields, 'targetNames'),
    'targetNames',
    maximumAllowlistEntries
  );
  if (targetNames.length === 0) {
    throw new Error('targetNames must contain at least one name');
  }
  const normalizedTargetNames = targetNames.map((name) => {
    const canonicalName = assertCanonicalArtifactText(name, 'targetNames entry');
    const normalizedName = normalizeRecordName(canonicalName, 'targetNames entry');
    if (canonicalName !== normalizedName) {
      throw new Error('targetNames entries must be lowercase DNS names without a trailing dot');
    }
    return normalizedName;
  });
  if (new Set(normalizedTargetNames).size !== normalizedTargetNames.length) {
    throw new Error('targetNames must not contain duplicates');
  }

  const baselineHash = assertCanonicalArtifactText(
    readDataField(fields, 'baselineHash'),
    'baselineHash'
  );
  if (!fingerprintPattern.test(baselineHash)) {
    throw new Error('baselineHash must be a sha256:<64 lowercase hex> hash');
  }
  const credentialFingerprint = assertCanonicalArtifactText(
    readDataField(fields, 'providerCredentialFingerprint'),
    'providerCredentialFingerprint'
  );
  if (!fingerprintPattern.test(credentialFingerprint)) {
    throw new Error(
      'providerCredentialFingerprint must be a sha256:<64 lowercase hex> fingerprint'
    );
  }

  const appliedAt = readDataField(fields, 'appliedAt');
  const appliedAtMilliseconds =
    appliedAt === undefined ? undefined : validateIsoTimestamp(appliedAt, 'appliedAt');
  const restoredAt = readDataField(fields, 'restoredAt');
  const restoredAtMilliseconds =
    restoredAt === undefined ? undefined : validateIsoTimestamp(restoredAt, 'restoredAt');
  if (restoredAtMilliseconds !== undefined && appliedAtMilliseconds === undefined) {
    throw new Error('restoredAt requires appliedAt');
  }
  if (
    appliedAtMilliseconds !== undefined &&
    restoredAtMilliseconds !== undefined &&
    restoredAtMilliseconds < appliedAtMilliseconds
  ) {
    throw new Error('restoredAt must not be earlier than appliedAt');
  }

  validateProviderResponseList(readDataField(fields, 'providerResponses'));
  validateArtifactIdList(
    readDataField(fields, 'authoritativeEvidenceIds'),
    'authoritativeEvidenceIds'
  );
  validateArtifactIdList(readDataField(fields, 'recursiveEvidenceIds'), 'recursiveEvidenceIds');
  validateArtifactIdList(readDataField(fields, 'scanTaskIds'), 'scanTaskIds');
  validateArtifactIdList(readDataField(fields, 'signalIds'), 'signalIds');
  validateArtifactIdList(readDataField(fields, 'caseIds'), 'caseIds');
  validateArtifactIdList(readDataField(fields, 'auditEventIds'), 'auditEventIds');

  const result = readDataField(fields, 'result');
  if (!FAULT_RUN_RESULTS.includes(result as FaultRunResult)) {
    throw new Error('result is not permitted');
  }
  const recovery = readDataField(fields, 'recovery');
  if (result === 'RECOVERY_REQUIRED' && recovery === undefined) {
    throw new Error('recovery is required when result is RECOVERY_REQUIRED');
  }
  if (result !== 'RECOVERY_REQUIRED' && recovery !== undefined) {
    throw new Error('recovery is only permitted when result is RECOVERY_REQUIRED');
  }
  if (recovery !== undefined) {
    validateRecoveryArtifact(recovery, artifactZoneId, normalizedTargetNames);
  }
}

/**
 * Validates the complete fail-closed policy before a future isolated harness can
 * resolve a runtime credential or contact a provider. This module has no
 * provider client and therefore cannot perform any DNS or hosting mutation.
 */
export function validateControlledFaultHarnessPolicy(policy: ControlledFaultHarnessPolicy): void {
  normalizeControlledFaultHarnessPolicy(policy);
}

/**
 * Returns an authorization only for an exact zone/name/type/mutation tuple.
 * Policy and request values are canonicalized before comparison, so later
 * getter/mutation changes to caller-owned objects cannot alter authorization.
 * A future provider adapter must call this before every provider operation.
 */
export function authorizeControlledFaultMutation(
  policy: ControlledFaultHarnessPolicy,
  request: ControlledFaultMutationRequest
): AuthorizedControlledFaultMutation {
  const validatedPolicy = normalizeControlledFaultHarnessPolicy(policy);
  const validatedRequest = normalizeControlledFaultMutationRequest(request);

  if (validatedRequest.zoneId !== validatedPolicy.zoneId) {
    throw new Error('controlled fault mutation zone is not authorized');
  }

  const authorized = validatedPolicy.allowlist.some(
    (entry) =>
      entry.name === validatedRequest.name &&
      entry.types.includes(validatedRequest.type) &&
      entry.mutationIds.includes(validatedRequest.mutationId)
  );
  if (!authorized) {
    throw new Error('controlled fault mutation is not allowlisted');
  }

  return {
    zoneId: validatedPolicy.zoneId,
    name: validatedRequest.name,
    type: validatedRequest.type,
    mutationId: validatedRequest.mutationId,
    providerKind: validatedPolicy.providerKind,
    providerCredentialFingerprint: validatedPolicy.providerCredentialFingerprint,
  };
}
