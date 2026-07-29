import type { LegacyConditionMapEntry } from '@dns-ops/contracts';

const MAIL_REGRESSION_FINDINGS = [
  'mail.no-mx-record',
  'mail.no-spf-record',
  'mail.spf-malformed',
  'mail.no-dmarc-record',
  'mail.dmarc-malformed',
  'mail.no-dkim-queried',
  'mail.dkim-no-valid-keys',
] as const;

export const LEGACY_CONDITION_REGISTRY: readonly LegacyConditionMapEntry[] = [
  ...MAIL_REGRESSION_FINDINGS.map((conditionId) => ({
    conditionId,
    disposition: 'LEGACY_ONLY' as const,
    notificationPath: 'LEGACY_ALERT' as const,
  })),
  {
    conditionId: 'monitoring.collection-failed',
    disposition: 'LEGACY_ONLY',
    notificationPath: 'LEGACY_ALERT',
  },
];

export function legacyConditionDisposition(conditionId: string): LegacyConditionMapEntry {
  return (
    LEGACY_CONDITION_REGISTRY.find((entry) => entry.conditionId === conditionId) ?? {
      conditionId,
      disposition: 'DISABLED',
      notificationPath: 'NONE',
    }
  );
}
