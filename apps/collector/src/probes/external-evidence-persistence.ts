import type {
  EvidenceCheckResult,
  HomepageIndexabilityEvidence,
  HttpReachabilityEvidence,
  HttpRedirectEvidence,
  RdapExpirationEvidence,
  TLSCertificateEvidence,
} from '@dns-ops/contracts';
import type { NewProbeObservation } from '@dns-ops/db';

type ExternalEvidence =
  | RdapExpirationEvidence
  | TLSCertificateEvidence
  | HttpReachabilityEvidence
  | HttpRedirectEvidence
  | HomepageIndexabilityEvidence;

type Check =
  | 'RDAP_EXPIRATION'
  | 'TLS_CERTIFICATE'
  | 'HTTP_REACHABILITY'
  | 'REDIRECT_TOPOLOGY'
  | 'HOMEPAGE_INDEXABILITY';

function checkForEvidence(evidence: ExternalEvidence): Check {
  switch (evidence.kind) {
    case 'RDAP_EXPIRATION':
      return 'RDAP_EXPIRATION';
    case 'TLS_CERTIFICATE':
      return 'TLS_CERTIFICATE';
    case 'HTTP_REACHABILITY':
      return 'HTTP_REACHABILITY';
    case 'HTTP_REDIRECT':
      return 'REDIRECT_TOPOLOGY';
    case 'HOMEPAGE_INDEXABILITY':
      return 'HOMEPAGE_INDEXABILITY';
  }
}

function probeType(check: Check): 'rdap' | 'tls_cert' | 'http' {
  if (check === 'RDAP_EXPIRATION') return 'rdap';
  if (check === 'TLS_CERTIFICATE') return 'tls_cert';
  return 'http';
}

function hostnameForEvidence(evidence: ExternalEvidence): string {
  switch (evidence.kind) {
    case 'RDAP_EXPIRATION':
      return evidence.domain;
    case 'TLS_CERTIFICATE':
      return evidence.hostname;
    case 'HTTP_REACHABILITY':
      return new URL(evidence.url).hostname;
    case 'HTTP_REDIRECT':
      return new URL(evidence.startUrl).hostname;
    case 'HOMEPAGE_INDEXABILITY':
      return new URL(evidence.requestedUrl).hostname;
  }
}

function portForEvidence(evidence: ExternalEvidence): number | null {
  if (evidence.kind === 'TLS_CERTIFICATE') return evidence.port;
  if (evidence.kind === 'RDAP_EXPIRATION') return 443;
  const url =
    evidence.kind === 'HTTP_REDIRECT'
      ? evidence.startUrl
      : evidence.kind === 'HOMEPAGE_INDEXABILITY'
        ? evidence.requestedUrl
        : evidence.url;
  return new URL(url).port
    ? Number(new URL(url).port)
    : new URL(url).protocol === 'https:'
      ? 443
      : 80;
}

export function externalEvidenceToObservation(
  snapshotId: string,
  result: EvidenceCheckResult<ExternalEvidence>,
  fallback: { check: Check; hostname: string; port?: number }
): NewProbeObservation | null {
  if (result.status === 'NOT_APPLICABLE') return null;
  const evidence = result.evidence;
  const check = evidence ? checkForEvidence(evidence) : fallback.check;
  const hostname = evidence ? hostnameForEvidence(evidence) : fallback.hostname;
  const port = evidence ? portForEvidence(evidence) : (fallback.port ?? null);
  const observedAt = result.status === 'OBSERVED' ? new Date(result.observedAt) : new Date();

  return {
    snapshotId,
    probeType: probeType(check),
    status: result.status === 'OBSERVED' ? 'success' : 'error',
    hostname,
    port,
    success: result.status === 'OBSERVED',
    errorMessage: result.status === 'UNKNOWN' ? result.unknown.explanation : null,
    probedAt: observedAt,
    responseTimeMs: evidence?.kind === 'HTTP_REACHABILITY' ? evidence.responseTimeMs : null,
    probeData: {
      check,
      status: result.status,
      evidence,
      unknown: result.status === 'UNKNOWN' ? result.unknown : undefined,
    },
  };
}
