import {
  type InternalSignalKind,
  internalConditionKey,
  normalizeOperationalDiscriminator,
  type OperationalConditionBaselinePolicy,
} from '@dns-ops/contracts';

export interface PersistedConditionBaseline {
  tenantId: string;
  domainId: string;
  kind: InternalSignalKind;
  discriminator: string;
  policy: OperationalConditionBaselinePolicy;
  maxEvidenceAgeSeconds: number;
}

export interface PersistedConditionProbe {
  success: boolean;
  probedAt: Date;
  probeData: unknown;
}

export interface PersistedConditionFinding {
  id: string;
  type: string;
  reviewOnly: boolean;
}

export interface CanonicalConditionObservation {
  kind: InternalSignalKind;
  discriminator: string;
  conditionKey: string;
  evidence: Record<string, unknown>;
}

export interface SetupEvidenceResult {
  kind: InternalSignalKind;
  discriminator: string;
  status: 'MISSING_BASELINE' | 'EVIDENCE_STALE' | 'EVIDENCE_UNAVAILABLE';
  action: 'ACCEPT_BASELINE' | 'RUN_FRESH_SCAN';
}

export interface ConditionEvaluation {
  observations: CanonicalConditionObservation[];
  setupEvidence: SetupEvidenceResult[];
}

interface TlsProbeData {
  check: 'TLS_CERTIFICATE';
  status: 'OBSERVED' | 'UNKNOWN';
  evidence: {
    kind: 'TLS_CERTIFICATE';
    hostname: string;
    port: number;
    hostnameAuthorized: boolean;
    chainAuthorized: boolean;
    validTo: string;
  };
}

function isTlsProbeData(value: unknown): value is TlsProbeData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<TlsProbeData>;
  return (
    data.check === 'TLS_CERTIFICATE' &&
    data.status === 'OBSERVED' &&
    !!data.evidence &&
    data.evidence.kind === 'TLS_CERTIFICATE'
  );
}

function setup(
  kind: InternalSignalKind,
  discriminator: string,
  status: SetupEvidenceResult['status']
): SetupEvidenceResult {
  return {
    kind,
    discriminator,
    status,
    action: status === 'MISSING_BASELINE' ? 'ACCEPT_BASELINE' : 'RUN_FRESH_SCAN',
  };
}

/**
 * Converts already-persisted, complete collection results into canonical observations.
 * It intentionally has no network, persistence, or notification dependency.
 */
export function evaluateOperationalConditions(input: {
  tenantId: string;
  domainId: string;
  snapshotComplete: boolean;
  baselines: PersistedConditionBaseline[];
  probes: PersistedConditionProbe[];
  findings: PersistedConditionFinding[];
  now: Date;
}): ConditionEvaluation {
  const result: ConditionEvaluation = { observations: [], setupEvidence: [] };
  if (!input.snapshotComplete) return result;

  for (const baseline of input.baselines) {
    const discriminator = normalizeOperationalDiscriminator(baseline.discriminator);
    if (baseline.kind === 'TLS_CERTIFICATE_REGRESSION') {
      const probe = input.probes.find((candidate) => {
        if (!candidate.success || !isTlsProbeData(candidate.probeData)) return false;
        return (
          normalizeOperationalDiscriminator(
            `${candidate.probeData.evidence.hostname}:${candidate.probeData.evidence.port}`
          ) === discriminator
        );
      });
      if (!probe) {
        result.setupEvidence.push(setup(baseline.kind, discriminator, 'EVIDENCE_UNAVAILABLE'));
        continue;
      }
      if (input.now.getTime() - probe.probedAt.getTime() > baseline.maxEvidenceAgeSeconds * 1000) {
        result.setupEvidence.push(setup(baseline.kind, discriminator, 'EVIDENCE_STALE'));
        continue;
      }
      const evidence = (probe.probeData as TlsProbeData).evidence;
      const policy = baseline.policy;
      if (policy.kind !== 'TLS_CERTIFICATE') {
        result.setupEvidence.push(setup(baseline.kind, discriminator, 'EVIDENCE_UNAVAILABLE'));
        continue;
      }
      const insufficientValidity =
        Date.parse(evidence.validTo) - input.now.getTime() <
        policy.minimumRemainingValiditySeconds * 1000;
      if (
        (policy.requireHostnameAuthorized && !evidence.hostnameAuthorized) ||
        (policy.requireChainAuthorized && !evidence.chainAuthorized) ||
        insufficientValidity
      ) {
        result.observations.push({
          kind: baseline.kind,
          discriminator,
          conditionKey: internalConditionKey(
            input.tenantId,
            input.domainId,
            baseline.kind,
            discriminator
          ),
          evidence: {
            probeKind: 'TLS_CERTIFICATE',
            probedAt: probe.probedAt.toISOString(),
            hostnameAuthorized: evidence.hostnameAuthorized,
            chainAuthorized: evidence.chainAuthorized,
            validTo: evidence.validTo,
          },
        });
      }
      continue;
    }

    if (baseline.kind === 'MAIL_DNS_CONFIGURATION_REGRESSION') {
      if (baseline.policy.kind !== 'SPF_PRESENT' || discriminator !== 'spf') {
        result.setupEvidence.push(setup(baseline.kind, discriminator, 'EVIDENCE_UNAVAILABLE'));
        continue;
      }
      const finding = input.findings.find(
        (candidate) => candidate.type === 'mail.no-spf-record' && !candidate.reviewOnly
      );
      if (finding) {
        result.observations.push({
          kind: baseline.kind,
          discriminator,
          conditionKey: internalConditionKey(
            input.tenantId,
            input.domainId,
            baseline.kind,
            discriminator
          ),
          evidence: { findingId: finding.id, findingType: finding.type },
        });
      }
    }
  }
  return result;
}
