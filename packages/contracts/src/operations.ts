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

/** Accepted, explicit policy — never inferred from a scan. */
export type OperationalConditionBaselinePolicy =
  | TlsCertificateBaselinePolicy
  | SpfPresenceBaselinePolicy;

/** The initial baseline policies are only valid for their corresponding signal kinds. */
export type SupportedOperationalBaseline =
  | {
      signalKind: 'TLS_CERTIFICATE_REGRESSION';
      policy: TlsCertificateBaselinePolicy;
    }
  | {
      signalKind: 'MAIL_DNS_CONFIGURATION_REGRESSION';
      policy: SpfPresenceBaselinePolicy;
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
  if (!normalized || normalized.length > 64) {
    throw new Error('Signal discriminator must contain 1-64 characters');
  }
  return normalized;
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
