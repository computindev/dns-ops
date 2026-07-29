import { describe, expect, it } from 'vitest';
import { legacyConditionDisposition } from './condition-registry.js';

describe('legacy condition registry', () => {
  it('keeps mail findings explicitly legacy until production signal evaluation is wired', () => {
    expect(legacyConditionDisposition('mail.no-dmarc-record')).toMatchObject({
      disposition: 'LEGACY_ONLY',
      notificationPath: 'LEGACY_ALERT',
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
