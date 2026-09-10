export type InternalSignalKind =
  | 'DOMAIN_EXPIRING_SOON'
  | 'TLS_CERTIFICATE_REGRESSION'
  | 'HTTP_ENDPOINT_UNAVAILABLE'
  | 'REDIRECT_TOPOLOGY_REGRESSION'
  | 'HOMEPAGE_INDEXABILITY_REGRESSION'
  | 'MAIL_DNS_CONFIGURATION_REGRESSION';

export type InternalSignalStatus = 'ACTIVE' | 'RESOLVED';

export type InternalCaseStatus = 'OPEN' | 'ACKNOWLEDGED' | 'BLOCKED' | 'RESOLVED' | 'DISMISSED';

export type LegacyConditionDisposition = 'MIGRATED' | 'LEGACY_ONLY' | 'DISABLED';

export interface TlsCertificateBaselinePolicy {
  kind: 'TLS_CERTIFICATE';
  requireHostnameAuthorized: boolean;
  requireChainAuthorized: boolean;
  minimumRemainingValiditySeconds: number;
}

export interface SpfPresenceBaselinePolicy {
  kind: 'SPF_PRESENT';
}

export interface RedirectTopologyBaselinePolicy {
  kind: 'REDIRECT_TOPOLOGY';
  startUrl: string;
  expectedFinalUrl: string;
}

export interface HomepageIndexabilityBaselinePolicy {
  kind: 'HOMEPAGE_INDEXABILITY';
  requestedUrl: string;
  requireIndexable: boolean;
}

/** Accepted, explicit policy — never inferred from a scan. */
export type OperationalConditionBaselinePolicy =
  | TlsCertificateBaselinePolicy
  | SpfPresenceBaselinePolicy
  | RedirectTopologyBaselinePolicy
  | HomepageIndexabilityBaselinePolicy;

/** Baseline policies are only valid for their corresponding signal kinds. */
export type SupportedOperationalBaseline =
  | {
      signalKind: 'TLS_CERTIFICATE_REGRESSION';
      policy: TlsCertificateBaselinePolicy;
    }
  | {
      signalKind: 'MAIL_DNS_CONFIGURATION_REGRESSION';
      policy: SpfPresenceBaselinePolicy;
    }
  | {
      signalKind: 'REDIRECT_TOPOLOGY_REGRESSION';
      policy: RedirectTopologyBaselinePolicy;
    }
  | {
      signalKind: 'HOMEPAGE_INDEXABILITY_REGRESSION';
      policy: HomepageIndexabilityBaselinePolicy;
    };

export type ParsedOperationalBaseline = SupportedOperationalBaseline & {
  discriminator: string;
};

export interface OperationalConditionBaseline {
  id: string;
  tenantId: string;
  domainId: string;
  signalKind: InternalSignalKind;
  discriminator: string;
  sourceSnapshotId: string;
  policy: OperationalConditionBaselinePolicy;
  maxEvidenceAgeSeconds: number;
  acceptedAt: string;
  acceptedBy: string;
  supersededAt?: string;
  supersededBy?: string;
}

export function normalizeOperationalDiscriminator(discriminator: string): string {
  const normalized = discriminator.trim().toLowerCase();
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    const url = normalizeOperationalHttpUrl(normalized);
    if (url.length > 512) {
      throw new Error('Signal discriminator must contain 1-512 characters');
    }
    return url;
  }
  if (!normalized || normalized.length > 512) {
    throw new Error('Signal discriminator must contain 1-512 characters');
  }
  return normalized;
}

function hostnameLooksLikeIp(hostname: string): boolean {
  if (hostname.includes(':')) return true;
  const parts = hostname.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part));
}

/** Canonical http(s) URL used as an operator-declared redirect/indexability target. */
export function normalizeOperationalHttpUrl(value: string): string {
  if (typeof value !== 'string') {
    throw new Error('Operational HTTP URL is invalid');
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('Operational HTTP URL is invalid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Operational HTTP URL must be http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Operational HTTP URL must not include credentials');
  }
  const hostname = parsed.hostname.replace(/\.$/, '').toLowerCase();
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname.includes('/') ||
    hostname.includes(':') ||
    hostname.includes('[') ||
    hostname.includes(']') ||
    !hostname.includes('.') ||
    hostnameLooksLikeIp(hostname)
  ) {
    throw new Error('Operational HTTP URL requires a registered hostname');
  }
  parsed.hostname = hostname;
  parsed.hash = '';
  return parsed.href;
}

export function operationalHttpDiscriminator(url: string): string {
  return normalizeOperationalDiscriminator(normalizeOperationalHttpUrl(url));
}

function isHttpOriginRoot(url: string): boolean {
  const parsed = new URL(url);
  return parsed.pathname === '/' && parsed.search === '';
}

export function collectedRedirectStartUrls(hostname: string): string[] {
  const host = hostname.replace(/\.$/, '').toLowerCase();
  return [`http://${host}/`, `https://${host}/`, `http://www.${host}/`, `https://www.${host}/`];
}

export function collectedIndexabilityUrl(hostname: string): string {
  return `https://${hostname.replace(/\.$/, '').toLowerCase()}/`;
}

function assertCollectedRedirectStart(url: string): void {
  const parsed = new URL(url);
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !isHttpOriginRoot(url)) {
    throw new Error('Redirect start URL must be a collected http(s) origin root');
  }
}

function assertCollectedIndexabilityTarget(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    !isHttpOriginRoot(url) ||
    parsed.hostname.startsWith('www.')
  ) {
    throw new Error('Homepage indexability URL must be the HTTPS apex root');
  }
}

function requireMatchingHttpDiscriminator(
  discriminator: string,
  url: string,
  label: string
): string {
  const normalizedUrl = operationalHttpDiscriminator(url);
  let normalizedDiscriminator: string;
  try {
    normalizedDiscriminator = operationalHttpDiscriminator(discriminator);
  } catch {
    throw new Error(`${label} discriminator must match the declared URL`);
  }
  if (normalizedDiscriminator !== normalizedUrl) {
    throw new Error(`${label} discriminator must match the declared URL`);
  }
  return normalizedUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates an operator-declared baseline. Policy is never inferred from evidence.
 */
export function parseSupportedOperationalBaseline(input: {
  signalKind: unknown;
  policy: unknown;
  discriminator: unknown;
}): ParsedOperationalBaseline {
  if (typeof input.discriminator !== 'string') {
    throw new Error('Signal discriminator must contain 1-512 characters');
  }
  if (!isRecord(input.policy) || typeof input.policy.kind !== 'string') {
    throw new Error('Unsupported baseline policy');
  }
  const policy = input.policy;

  if (input.signalKind === 'TLS_CERTIFICATE_REGRESSION') {
    if (
      policy.kind !== 'TLS_CERTIFICATE' ||
      typeof policy.requireHostnameAuthorized !== 'boolean' ||
      typeof policy.requireChainAuthorized !== 'boolean' ||
      !Number.isInteger(policy.minimumRemainingValiditySeconds) ||
      (policy.minimumRemainingValiditySeconds as number) < 0
    ) {
      throw new Error('Invalid TLS certificate baseline policy');
    }
    return {
      signalKind: 'TLS_CERTIFICATE_REGRESSION',
      discriminator: normalizeOperationalDiscriminator(input.discriminator),
      policy: {
        kind: 'TLS_CERTIFICATE',
        requireHostnameAuthorized: policy.requireHostnameAuthorized,
        requireChainAuthorized: policy.requireChainAuthorized,
        minimumRemainingValiditySeconds: policy.minimumRemainingValiditySeconds as number,
      },
    };
  }

  if (input.signalKind === 'MAIL_DNS_CONFIGURATION_REGRESSION') {
    if (policy.kind !== 'SPF_PRESENT') throw new Error('Invalid SPF baseline policy');
    const discriminator = normalizeOperationalDiscriminator(input.discriminator);
    if (discriminator !== 'spf') throw new Error('Invalid SPF baseline policy');
    return {
      signalKind: 'MAIL_DNS_CONFIGURATION_REGRESSION',
      discriminator,
      policy: { kind: 'SPF_PRESENT' },
    };
  }

  if (input.signalKind === 'REDIRECT_TOPOLOGY_REGRESSION') {
    if (policy.kind !== 'REDIRECT_TOPOLOGY') {
      throw new Error('Invalid redirect topology baseline policy');
    }
    if (typeof policy.startUrl !== 'string' || typeof policy.expectedFinalUrl !== 'string') {
      throw new Error('Invalid redirect topology baseline policy');
    }
    const startUrl = normalizeOperationalHttpUrl(policy.startUrl);
    const expectedFinalUrl = normalizeOperationalHttpUrl(policy.expectedFinalUrl);
    assertCollectedRedirectStart(startUrl);
    return {
      signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
      discriminator: requireMatchingHttpDiscriminator(
        input.discriminator,
        startUrl,
        'Redirect topology'
      ),
      policy: { kind: 'REDIRECT_TOPOLOGY', startUrl, expectedFinalUrl },
    };
  }

  if (input.signalKind === 'HOMEPAGE_INDEXABILITY_REGRESSION') {
    if (policy.kind !== 'HOMEPAGE_INDEXABILITY') {
      throw new Error('Invalid homepage indexability baseline policy');
    }
    if (typeof policy.requestedUrl !== 'string' || typeof policy.requireIndexable !== 'boolean') {
      throw new Error('Invalid homepage indexability baseline policy');
    }
    const requestedUrl = normalizeOperationalHttpUrl(policy.requestedUrl);
    assertCollectedIndexabilityTarget(requestedUrl);
    return {
      signalKind: 'HOMEPAGE_INDEXABILITY_REGRESSION',
      discriminator: requireMatchingHttpDiscriminator(
        input.discriminator,
        requestedUrl,
        'Homepage indexability'
      ),
      policy: {
        kind: 'HOMEPAGE_INDEXABILITY',
        requestedUrl,
        requireIndexable: policy.requireIndexable,
      },
    };
  }

  throw new Error('Unsupported baseline policy');
}

export interface LegacyConditionMapEntry {
  conditionId: string;
  disposition: LegacyConditionDisposition;
  replacementSignalKind?: InternalSignalKind;
  notificationPath: 'SIGNAL_ALERT' | 'LEGACY_ALERT' | 'NONE';
}

export function internalConditionKey(
  tenantId: string,
  domainId: string,
  kind: InternalSignalKind,
  discriminator = 'default'
): string {
  const normalizedDiscriminator = normalizeOperationalDiscriminator(discriminator);
  return `${tenantId}:${domainId}:${kind}:${normalizedDiscriminator}`;
}
