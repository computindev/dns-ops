import { describe, expect, it } from 'vitest';
import { loadCasePlaybook } from './case-playbooks.js';

// The closed-world case-kind set (InternalSignalKind in @dns-ops/contracts).
const CASE_KINDS = [
  'DOMAIN_EXPIRING_SOON',
  'TLS_CERTIFICATE_REGRESSION',
  'HTTP_ENDPOINT_UNAVAILABLE',
  'REDIRECT_TOPOLOGY_REGRESSION',
  'HOMEPAGE_INDEXABILITY_REGRESSION',
  'MAIL_DNS_CONFIGURATION_REGRESSION',
] as const;

const EXPECTED_PLAYBOOKS: Record<(typeof CASE_KINDS)[number], string> = {
  DOMAIN_EXPIRING_SOON: 'domain-expiry',
  TLS_CERTIFICATE_REGRESSION: 'tls-regression',
  HTTP_ENDPOINT_UNAVAILABLE: 'unknown-evidence',
  REDIRECT_TOPOLOGY_REGRESSION: 'redirect-regression',
  HOMEPAGE_INDEXABILITY_REGRESSION: 'indexability-regression',
  MAIL_DNS_CONFIGURATION_REGRESSION: 'mail-dns-configuration-regression',
};

describe('case playbooks', () => {
  it('maps every case kind to its approved playbook with the required sections', async () => {
    for (const caseKind of CASE_KINDS) {
      const playbook = await loadCasePlaybook(caseKind);
      expect(playbook, caseKind).not.toBeNull();
      expect(playbook?.playbookId, caseKind).toBe(EXPECTED_PLAYBOOKS[caseKind]);
      expect(playbook?.sections['What the condition proves'], caseKind).toBeTruthy();
      expect(playbook?.sections['Safe next action'], caseKind).toBeTruthy();
      expect(playbook?.sections['Escalation boundary'], caseKind).toBeTruthy();
    }
  });

  it('returns the domain-expiry excerpt from the real document', async () => {
    const playbook = await loadCasePlaybook('DOMAIN_EXPIRING_SOON');
    expect(playbook?.title).toBe('Domain expiry');
    expect(playbook?.sections['What the condition proves']).toContain('RDAP');
  });

  it('returns null for a kind outside the closed world', async () => {
    await expect(loadCasePlaybook('NOT_A_CASE_KIND')).resolves.toBeNull();
  });
});
