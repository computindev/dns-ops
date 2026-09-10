import {
  type HomepageIndexabilityBaselinePolicy,
  type InternalSignalKind,
  internalConditionKey,
  normalizeOperationalDiscriminator,
  normalizeOperationalHttpUrl,
  type OperationalConditionBaselinePolicy,
  operationalHttpDiscriminator,
  type RedirectTopologyBaselinePolicy,
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

export type EvaluatedConditionOutcome =
  | 'HEALTHY'
  | 'FAULTY'
  | 'UNKNOWN'
  | 'STALE'
  | 'MALFORMED'
  | 'TRUNCATED';

export interface EvaluatedConditionKey {
  conditionKey: string;
  kind: InternalSignalKind;
  discriminator: string;
  outcome: EvaluatedConditionOutcome;
}

export interface ConditionEvaluation {
  observations: CanonicalConditionObservation[];
  setupEvidence: SetupEvidenceResult[];
  evaluatedConditionKeys: EvaluatedConditionKey[];
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

function evaluated(
  tenantId: string,
  domainId: string,
  kind: InternalSignalKind,
  discriminator: string,
  outcome: EvaluatedConditionOutcome
): EvaluatedConditionKey {
  return {
    conditionKey: internalConditionKey(tenantId, domainId, kind, discriminator),
    kind,
    discriminator,
    outcome,
  };
}

function emptyEvaluation(): ConditionEvaluation {
  return { observations: [], setupEvidence: [], evaluatedConditionKeys: [] };
}

function probeCheck(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const check = (value as { check?: unknown }).check;
  return typeof check === 'string' ? check : undefined;
}

function matchingHttpProbe(
  probes: PersistedConditionProbe[],
  check: 'REDIRECT_TOPOLOGY' | 'HOMEPAGE_INDEXABILITY',
  discriminator: string,
  urlFromEvidence: (evidence: unknown) => unknown
): PersistedConditionProbe | undefined {
  return probes.find((candidate) => {
    if (probeCheck(candidate.probeData) !== check) return false;
    const evidence =
      candidate.probeData && typeof candidate.probeData === 'object'
        ? (candidate.probeData as { evidence?: unknown }).evidence
        : undefined;
    try {
      return operationalHttpDiscriminator(String(urlFromEvidence(evidence))) === discriminator;
    } catch {
      return false;
    }
  });
}

function isFresh(
  probe: PersistedConditionProbe,
  baseline: PersistedConditionBaseline,
  now: Date
): boolean {
  return now.getTime() - probe.probedAt.getTime() <= baseline.maxEvidenceAgeSeconds * 1000;
}

function canonicalHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return normalizeOperationalHttpUrl(value);
  } catch {
    return null;
  }
}

function parseRedirectHop(value: unknown): { url: string; status: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const hop = value as Record<string, unknown>;
  const url = canonicalHttpUrl(hop.url);
  if (
    !url ||
    !Number.isInteger(hop.status) ||
    (hop.status as number) < 100 ||
    (hop.status as number) > 599 ||
    typeof hop.observedAt !== 'string' ||
    Number.isNaN(Date.parse(hop.observedAt)) ||
    !Array.isArray(hop.resolvedAddresses) ||
    !hop.resolvedAddresses.every((address) => typeof address === 'string') ||
    (hop.location !== undefined && typeof hop.location !== 'string')
  ) {
    return null;
  }
  return { url, status: hop.status as number };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function hasNoindex(values: string[]): boolean {
  return values.some((value) => {
    const token = value.trim().toLowerCase();
    return token === 'noindex' || token === 'none';
  });
}

type InconclusiveReason = 'UNKNOWN' | 'MALFORMED' | 'TRUNCATED';

function parseRedirectEvidence(
  probe: PersistedConditionProbe
): { status: 'conclusive'; startUrl: string; finalUrl: string } | { status: InconclusiveReason } {
  if (!probe.success || !probe.probeData || typeof probe.probeData !== 'object') {
    return { status: 'UNKNOWN' };
  }
  const data = probe.probeData as {
    check?: unknown;
    status?: unknown;
    evidence?: Record<string, unknown>;
  };
  if (data.check !== 'REDIRECT_TOPOLOGY') return { status: 'MALFORMED' };
  if (data.status !== 'OBSERVED' || !data.evidence) return { status: 'UNKNOWN' };
  const evidence = data.evidence;
  if (
    evidence.kind !== 'HTTP_REDIRECT' ||
    typeof evidence.startUrl !== 'string' ||
    typeof evidence.finalUrl !== 'string' ||
    typeof evidence.truncated !== 'boolean' ||
    !Array.isArray(evidence.hops)
  ) {
    return { status: 'MALFORMED' };
  }
  if (evidence.truncated || evidence.hops.length === 0) return { status: 'TRUNCATED' };
  const startUrl = canonicalHttpUrl(evidence.startUrl);
  const finalUrl = canonicalHttpUrl(evidence.finalUrl);
  const hops = evidence.hops.map(parseRedirectHop);
  if (!startUrl || !finalUrl || hops.some((hop) => !hop)) return { status: 'MALFORMED' };
  const first = hops[0];
  const last = hops[hops.length - 1];
  if (!first || !last || first.url !== startUrl || last.url !== finalUrl) {
    return { status: 'MALFORMED' };
  }
  return { status: 'conclusive', startUrl, finalUrl };
}

function parseIndexabilityEvidence(
  probe: PersistedConditionProbe
):
  | { status: 'conclusive'; requestedUrl: string; noindex: boolean }
  | { status: InconclusiveReason } {
  if (!probe.success || !probe.probeData || typeof probe.probeData !== 'object') {
    return { status: 'UNKNOWN' };
  }
  const data = probe.probeData as {
    check?: unknown;
    status?: unknown;
    evidence?: Record<string, unknown>;
  };
  if (data.check !== 'HOMEPAGE_INDEXABILITY') return { status: 'MALFORMED' };
  if (data.status !== 'OBSERVED' || !data.evidence) return { status: 'UNKNOWN' };
  const evidence = data.evidence;
  if (
    evidence.kind !== 'HOMEPAGE_INDEXABILITY' ||
    typeof evidence.requestedUrl !== 'string' ||
    typeof evidence.finalUrl !== 'string' ||
    typeof evidence.responseStatus !== 'number' ||
    typeof evidence.bodyTruncated !== 'boolean' ||
    !isStringArray(evidence.xRobotsTags) ||
    !isStringArray(evidence.metaRobots)
  ) {
    return { status: 'MALFORMED' };
  }
  const noindex = hasNoindex(evidence.xRobotsTags) || hasNoindex(evidence.metaRobots);
  if (evidence.bodyTruncated && !noindex) return { status: 'TRUNCATED' };
  try {
    return {
      status: 'conclusive',
      requestedUrl: operationalHttpDiscriminator(evidence.requestedUrl),
      noindex,
    };
  } catch {
    return { status: 'MALFORMED' };
  }
}

function recordInconclusive(
  result: ConditionEvaluation,
  input: { tenantId: string; domainId: string },
  kind: InternalSignalKind,
  discriminator: string,
  outcome: InconclusiveReason | 'STALE'
) {
  result.setupEvidence.push(
    setup(kind, discriminator, outcome === 'STALE' ? 'EVIDENCE_STALE' : 'EVIDENCE_UNAVAILABLE')
  );
  result.evaluatedConditionKeys.push(
    evaluated(input.tenantId, input.domainId, kind, discriminator, outcome)
  );
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
  const result = emptyEvaluation();
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
        recordInconclusive(result, input, baseline.kind, discriminator, 'UNKNOWN');
        continue;
      }
      if (!isFresh(probe, baseline, input.now)) {
        recordInconclusive(result, input, baseline.kind, discriminator, 'STALE');
        continue;
      }
      const evidence = (probe.probeData as TlsProbeData).evidence;
      const policy = baseline.policy;
      if (policy.kind !== 'TLS_CERTIFICATE') {
        recordInconclusive(result, input, baseline.kind, discriminator, 'MALFORMED');
        continue;
      }
      const insufficientValidity =
        Date.parse(evidence.validTo) - input.now.getTime() <
        policy.minimumRemainingValiditySeconds * 1000;
      const faulty =
        (policy.requireHostnameAuthorized && !evidence.hostnameAuthorized) ||
        (policy.requireChainAuthorized && !evidence.chainAuthorized) ||
        insufficientValidity;
      result.evaluatedConditionKeys.push(
        evaluated(
          input.tenantId,
          input.domainId,
          baseline.kind,
          discriminator,
          faulty ? 'FAULTY' : 'HEALTHY'
        )
      );
      if (faulty) {
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
        recordInconclusive(result, input, baseline.kind, discriminator, 'MALFORMED');
        continue;
      }
      const finding = input.findings.find(
        (candidate) => candidate.type === 'mail.no-spf-record' && !candidate.reviewOnly
      );
      result.evaluatedConditionKeys.push(
        evaluated(
          input.tenantId,
          input.domainId,
          baseline.kind,
          discriminator,
          finding ? 'FAULTY' : 'HEALTHY'
        )
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
      continue;
    }

    if (baseline.kind === 'REDIRECT_TOPOLOGY_REGRESSION') {
      const policy = baseline.policy;
      if (policy.kind !== 'REDIRECT_TOPOLOGY') {
        recordInconclusive(result, input, baseline.kind, discriminator, 'MALFORMED');
        continue;
      }
      evaluateRedirect(result, input, baseline, discriminator, policy);
      continue;
    }

    if (baseline.kind === 'HOMEPAGE_INDEXABILITY_REGRESSION') {
      const policy = baseline.policy;
      if (policy.kind !== 'HOMEPAGE_INDEXABILITY') {
        recordInconclusive(result, input, baseline.kind, discriminator, 'MALFORMED');
        continue;
      }
      evaluateIndexability(result, input, baseline, discriminator, policy);
    }
  }
  return result;
}

function evaluateRedirect(
  result: ConditionEvaluation,
  input: {
    tenantId: string;
    domainId: string;
    probes: PersistedConditionProbe[];
    now: Date;
  },
  baseline: PersistedConditionBaseline,
  discriminator: string,
  policy: RedirectTopologyBaselinePolicy
) {
  const probe = matchingHttpProbe(
    input.probes,
    'REDIRECT_TOPOLOGY',
    discriminator,
    (evidence) => (evidence as { startUrl?: unknown } | undefined)?.startUrl
  );
  if (!probe) {
    recordInconclusive(result, input, baseline.kind, discriminator, 'UNKNOWN');
    return;
  }
  if (probe.probedAt.getTime() > input.now.getTime()) {
    recordInconclusive(result, input, baseline.kind, discriminator, 'UNKNOWN');
    return;
  }
  if (!isFresh(probe, baseline, input.now)) {
    recordInconclusive(result, input, baseline.kind, discriminator, 'STALE');
    return;
  }
  const parsed = parseRedirectEvidence(probe);
  if (parsed.status !== 'conclusive') {
    recordInconclusive(result, input, baseline.kind, discriminator, parsed.status);
    return;
  }
  const expectedFinalUrl = canonicalHttpUrl(policy.expectedFinalUrl);
  if (!expectedFinalUrl) {
    recordInconclusive(result, input, baseline.kind, discriminator, 'MALFORMED');
    return;
  }
  const faulty = parsed.finalUrl !== expectedFinalUrl;
  result.evaluatedConditionKeys.push(
    evaluated(
      input.tenantId,
      input.domainId,
      baseline.kind,
      discriminator,
      faulty ? 'FAULTY' : 'HEALTHY'
    )
  );
  if (!faulty) return;
  const evidence = (probe.probeData as { evidence: Record<string, unknown> }).evidence;
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
      probeKind: 'REDIRECT_TOPOLOGY',
      probedAt: probe.probedAt.toISOString(),
      startUrl: evidence.startUrl,
      finalUrl: evidence.finalUrl,
      expectedFinalUrl: policy.expectedFinalUrl,
      truncated: evidence.truncated,
    },
  });
}

function evaluateIndexability(
  result: ConditionEvaluation,
  input: {
    tenantId: string;
    domainId: string;
    probes: PersistedConditionProbe[];
    now: Date;
  },
  baseline: PersistedConditionBaseline,
  discriminator: string,
  policy: HomepageIndexabilityBaselinePolicy
) {
  const probe = matchingHttpProbe(
    input.probes,
    'HOMEPAGE_INDEXABILITY',
    discriminator,
    (evidence) => (evidence as { requestedUrl?: unknown } | undefined)?.requestedUrl
  );
  if (!probe) {
    recordInconclusive(result, input, baseline.kind, discriminator, 'UNKNOWN');
    return;
  }
  if (probe.probedAt.getTime() > input.now.getTime()) {
    recordInconclusive(result, input, baseline.kind, discriminator, 'UNKNOWN');
    return;
  }
  if (!isFresh(probe, baseline, input.now)) {
    recordInconclusive(result, input, baseline.kind, discriminator, 'STALE');
    return;
  }
  const parsed = parseIndexabilityEvidence(probe);
  if (parsed.status !== 'conclusive') {
    recordInconclusive(result, input, baseline.kind, discriminator, parsed.status);
    return;
  }
  const indexable = !parsed.noindex;
  const faulty = policy.requireIndexable ? !indexable : indexable;
  result.evaluatedConditionKeys.push(
    evaluated(
      input.tenantId,
      input.domainId,
      baseline.kind,
      discriminator,
      faulty ? 'FAULTY' : 'HEALTHY'
    )
  );
  if (!faulty) return;
  const evidence = (probe.probeData as { evidence: Record<string, unknown> }).evidence;
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
      probeKind: 'HOMEPAGE_INDEXABILITY',
      probedAt: probe.probedAt.toISOString(),
      requestedUrl: evidence.requestedUrl,
      finalUrl: evidence.finalUrl,
      responseStatus: evidence.responseStatus,
      xRobotsTags: evidence.xRobotsTags,
      metaRobots: evidence.metaRobots,
      bodyTruncated: evidence.bodyTruncated,
      requireIndexable: policy.requireIndexable,
    },
  });
}
