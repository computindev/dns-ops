import { describe, expect, it } from 'vitest';
import {
  type DomainEvidenceCheck,
  type DomainPurpose,
  evidenceApplicability,
} from './domain-profile.js';
import { probeFailedUnknown, purposeUndeclaredUnknown } from './web-evidence.js';

describe('domain evidence applicability', () => {
  it.each<[DomainPurpose, DomainEvidenceCheck, string]>([
    ['WEB', 'HOMEPAGE_INDEXABILITY', 'APPLICABLE'],
    ['WEB_AND_MAIL', 'TLS_CERTIFICATE', 'APPLICABLE'],
    ['REDIRECT', 'REDIRECT_TOPOLOGY', 'APPLICABLE'],
    ['REDIRECT', 'HOMEPAGE_INDEXABILITY', 'NOT_APPLICABLE'],
    ['MAIL', 'HTTP_REACHABILITY', 'NOT_APPLICABLE'],
    ['PARKED', 'TLS_CERTIFICATE', 'NOT_APPLICABLE'],
    ['MAIL', 'RDAP_EXPIRATION', 'APPLICABLE'],
    ['UNKNOWN', 'RDAP_EXPIRATION', 'APPLICABLE'],
    ['UNKNOWN', 'HTTP_REACHABILITY', 'UNKNOWN'],
  ])('%s / %s is %s', (purpose, check, expected) => {
    expect(evidenceApplicability(purpose, check)).toBe(expected);
  });

  it('gives every unknown an actionable explanation', () => {
    for (const unknown of [
      purposeUndeclaredUnknown('TLS certificate'),
      probeFailedUnknown('HTTP', 'request timed out'),
    ]) {
      expect(unknown.explanation.length).toBeGreaterThan(0);
      expect(unknown.actionLabel.length).toBeGreaterThan(0);
      expect(unknown.blocking).toBe(true);
    }
  });
});
