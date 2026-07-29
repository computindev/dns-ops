import type { UnknownResolution } from './evaluation.js';

export type EvidenceCheckResult<T> =
  | {
      status: 'OBSERVED';
      observedAt: string;
      evidence: T;
    }
  | {
      status: 'UNKNOWN';
      observedAt?: string;
      evidence?: T;
      unknown: UnknownResolution;
    }
  | {
      status: 'NOT_APPLICABLE';
      explanation: string;
    };

export interface RdapEventEvidence {
  action: string;
  date: string;
}

export interface RdapExpirationEvidence {
  kind: 'RDAP_EXPIRATION';
  domain: string;
  sourceUrl: string;
  responseStatus: number;
  events: RdapEventEvidence[];
  expirationDate?: string;
  notices: string[];
}

export interface TLSCertificateEvidence {
  kind: 'TLS_CERTIFICATE';
  hostname: string;
  port: number;
  protocol: string;
  cipher: string;
  hostnameAuthorized: boolean;
  chainAuthorized: boolean;
  authorizationError?: string;
  subject: string;
  issuer: string;
  subjectAlternativeNames: string[];
  validFrom: string;
  validTo: string;
  fingerprintSha256: string;
}

export interface HttpRedirectHopEvidence {
  url: string;
  status: number;
  location?: string;
  resolvedAddresses: string[];
  observedAt: string;
}

export interface HttpReachabilityEvidence {
  kind: 'HTTP_REACHABILITY';
  url: string;
  responseStatus: number;
  resolvedAddresses: string[];
  responseTimeMs: number;
}

export interface HttpRedirectEvidence {
  kind: 'HTTP_REDIRECT';
  startUrl: string;
  hops: HttpRedirectHopEvidence[];
  finalUrl: string;
  truncated: boolean;
}

export interface HomepageIndexabilityEvidence {
  kind: 'HOMEPAGE_INDEXABILITY';
  requestedUrl: string;
  finalUrl: string;
  responseStatus: number;
  xRobotsTags: string[];
  metaRobots: string[];
  canonicalUrl?: string;
  bodyBytesInspected: number;
  bodyTruncated: boolean;
}

export type ExternalEvidenceData =
  | RdapExpirationEvidence
  | TLSCertificateEvidence
  | HttpReachabilityEvidence
  | HttpRedirectEvidence
  | HomepageIndexabilityEvidence;

export function purposeUndeclaredUnknown(checkLabel: string): UnknownResolution {
  return {
    reason: 'PURPOSE_UNDECLARED',
    explanation: `${checkLabel} applicability cannot be determined until domain purpose is declared.`,
    action: 'DECLARE_PURPOSE',
    actionLabel: 'Declare domain purpose',
    blocking: true,
  };
}

export function probeFailedUnknown(checkLabel: string, detail: string): UnknownResolution {
  return {
    reason: 'PROBE_FAILED',
    explanation: `${checkLabel} evidence could not be collected: ${detail}`,
    action: 'RETRY_PROBE',
    actionLabel: `Retry ${checkLabel.toLowerCase()} probe`,
    blocking: true,
  };
}
