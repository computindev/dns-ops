import { describe, expect, it } from 'vitest';
import { legacyConditionDisposition } from './condition-registry.js';

describe('legacy condition registry', () => {
  it('keeps unmigrated mail findings explicitly legacy', () => {
    expect(legacyConditionDisposition('mail.no-dmarc-record')).toMatchObject({
      disposition: 'LEGACY_ONLY',
      notificationPath: 'LEGACY_ALERT',
    });
  });

  it('migrates SPF absence exclusively to the canonical signal path', () => {
    expect(legacyConditionDisposition('mail.no-spf-record')).toMatchObject({
      disposition: 'MIGRATED',
      replacementSignalKind: 'MAIL_DNS_CONFIGURATION_REGRESSION',
      notificationPath: 'SIGNAL_ALERT',
    });
  });

  it('keeps explicitly unmigrated conditions on the legacy path', () => {
    expect(legacyConditionDisposition('monitoring.collection-failed')).toMatchObject({
      disposition: 'LEGACY_ONLY',
      notificationPath: 'LEGACY_ALERT',
    });
  });

  it('disables unclassified conditions rather than implicitly notifying', () => {
    expect(legacyConditionDisposition('unknown.condition')).toMatchObject({
      disposition: 'DISABLED',
      notificationPath: 'NONE',
    });
  });
});
