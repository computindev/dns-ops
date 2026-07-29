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
  const normalizedDiscriminator = discriminator.trim().toLowerCase();
  if (!normalizedDiscriminator || normalizedDiscriminator.length > 64) {
    throw new Error('Signal discriminator must contain 1-64 characters');
  }
  return `${tenantId}:${domainId}:${kind}:${normalizedDiscriminator}`;
}
