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

function matchingTlsProbe(
  probes: PersistedConditionProbe[],
  discriminator: string
): PersistedConditionProbe | undefined {
  return probes.find((candidate) => {
    if (probeCheck(candidate.probeData) !== 'TLS_CERTIFICATE') return false;
    const evidence =
      candidate.probeData && typeof candidate.probeData === 'object'
        ? (candidate.probeData as { evidence?: unknown }).evidence
        : undefined;
    if (!evidence || typeof evidence !== 'object') return false;
    const hostname = (evidence as { hostname?: unknown }).hostname;
    const port = (evidence as { port?: unknown }).port;
    if (typeof hostname !== 'string' || !Number.isInteger(port)) return false;
    try {
      return normalizeOperationalDiscriminator(`${hostname}:${port}`) === discriminator;
    } catch {
      return false;
    }
  });
}

const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

function isCanonicalRfc3339Utc(value: string): boolean {
  const match = RFC3339_UTC.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  const iso = new Date(parsed).toISOString();
  const canonical = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  return iso.startsWith(canonical);
}

function parseTlsEvidence(probe: PersistedConditionProbe):
  | {
      status: 'conclusive';
      evidence: TlsProbeData['evidence'];
    }
  | { status: InconclusiveReason } {
  if (!probe.success || !probe.probeData || typeof probe.probeData !== 'object') {
    return { status: 'UNKNOWN' };
  }
  const data = probe.probeData as {
    check?: unknown;
    status?: unknown;
    evidence?: Record<string, unknown>;
  };
  if (data.check !== 'TLS_CERTIFICATE') return { status: 'MALFORMED' };
  if (data.status !== 'OBSERVED' || !data.evidence) return { status: 'UNKNOWN' };
  const evidence = data.evidence;
  if (
    evidence.kind !== 'TLS_CERTIFICATE' ||
    typeof evidence.hostname !== 'string' ||
    evidence.hostname.length === 0 ||
    !Number.isInteger(evidence.port) ||
    (evidence.port as number) < 1 ||
    (evidence.port as number) > 65535 ||
    typeof evidence.hostnameAuthorized !== 'boolean' ||
    typeof evidence.chainAuthorized !== 'boolean'
  ) {
    return { status: 'MALFORMED' };
  }
  if (typeof evidence.validTo !== 'string' || !isCanonicalRfc3339Utc(evidence.validTo)) {
    return { status: 'UNKNOWN' };
  }
  return {
    status: 'conclusive',
    evidence: {
      kind: 'TLS_CERTIFICATE',
      hostname: evidence.hostname,
      port: evidence.port as number,
      hostnameAuthorized: evidence.hostnameAuthorized,
      chainAuthorized: evidence.chainAuthorized,
      validTo: evidence.validTo,
    },
  };
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

function parseRedirectHop(
  value: unknown
): { url: string; status: number; location?: string } | null {
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
  return {
    url,
    status: hop.status as number,
    location: typeof hop.location === 'string' ? hop.location : undefined,
  };
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status <= 399;
}

function resolvedHopLocation(hopUrl: string, location: string): string | null {
  try {
    return canonicalHttpUrl(new URL(location, hopUrl).href);
  } catch {
    return null;
  }
}

function redirectChainIsLinked(
  hops: Array<{ url: string; status: number; location?: string }>
): boolean {
  for (let index = 0; index < hops.length - 1; index += 1) {
    const hop = hops[index];
    const next = hops[index + 1];
    if (!hop || !next || !isRedirectStatus(hop.status) || !hop.location) return false;
    const resolved = resolvedHopLocation(hop.url, hop.location);
    if (!resolved || resolved !== next.url) return false;
  }
  return true;
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
  const chain = hops.filter((hop): hop is NonNullable<typeof hop> => Boolean(hop));
  const first = chain[0];
  const last = chain[chain.length - 1];
  if (!first || !last || first.url !== startUrl || last.url !== finalUrl) {
    return { status: 'MALFORMED' };
  }
  if (isRedirectStatus(last.status) || !redirectChainIsLinked(chain)) {
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
  const requestedUrl = canonicalHttpUrl(evidence.requestedUrl);
  const finalUrl = canonicalHttpUrl(evidence.finalUrl);
  if (
    evidence.kind !== 'HOMEPAGE_INDEXABILITY' ||
    !requestedUrl ||
    !finalUrl ||
    !Number.isInteger(evidence.responseStatus) ||
    (evidence.responseStatus as number) < 100 ||
    (evidence.responseStatus as number) > 599 ||
    !Number.isInteger(evidence.bodyBytesInspected) ||
    (evidence.bodyBytesInspected as number) < 0 ||
    typeof evidence.bodyTruncated !== 'boolean' ||
    !isStringArray(evidence.xRobotsTags) ||
    !isStringArray(evidence.metaRobots)
  ) {
    return { status: 'MALFORMED' };
  }
  const responseStatus = evidence.responseStatus as number;
  if (responseStatus < 200 || responseStatus > 299) {
    return { status: 'UNKNOWN' };
  }
  const noindex = hasNoindex(evidence.xRobotsTags) || hasNoindex(evidence.metaRobots);
  if (evidence.bodyTruncated && !noindex) return { status: 'TRUNCATED' };
  return { status: 'conclusive', requestedUrl, noindex };
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
      const probe = matchingTlsProbe(input.probes, discriminator);
      if (!probe) {
        recordInconclusive(result, input, baseline.kind, discriminator, 'UNKNOWN');
        continue;
      }
      if (probe.probedAt.getTime() > input.now.getTime()) {
        recordInconclusive(result, input, baseline.kind, discriminator, 'UNKNOWN');
        continue;
      }
      if (!isFresh(probe, baseline, input.now)) {
        recordInconclusive(result, input, baseline.kind, discriminator, 'STALE');
        continue;
      }
      const parsed = parseTlsEvidence(probe);
      if (parsed.status !== 'conclusive') {
        recordInconclusive(result, input, baseline.kind, discriminator, parsed.status);
        continue;
      }
      const policy = baseline.policy;
      if (policy.kind !== 'TLS_CERTIFICATE') {
        recordInconclusive(result, input, baseline.kind, discriminator, 'MALFORMED');
        continue;
      }
      const evidence = parsed.evidence;
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
