/**
 * Mail Checker Tests (TDD)
 *
 * Tests for DMARC/DKIM/SPF checking logic.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkDKIM,
  checkDMARC,
  checkSPF,
  PROVIDER_SELECTORS,
  performMailCheck,
} from './checker.js';

// Mock DNS resolution
vi.mock('./dns.js', () => ({
  resolveDomainExists: vi.fn(),
  resolveTXT: vi.fn(),
}));

import { resolveDomainExists, resolveTXT } from './dns.js';

describe('Mail Checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveDomainExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  describe('performMailCheck', () => {
    it('should perform all three checks in parallel', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(['v=DMARC1; p=reject']) // DMARC
        .mockResolvedValueOnce(['v=DKIM1; k=rsa; p=xxx']) // DKIM
        .mockResolvedValueOnce(['v=spf1 include:_spf.google.com ~all']); // SPF

      const result = await performMailCheck('example.com');

      expect(result.domain).toBe('example.com');
      expect(result.dmarc.present).toBe(true);
      expect(result.dkim.present).toBe(true);
      expect(result.spf.present).toBe(true);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('should handle all checks failing', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NXDOMAIN'));

      const result = await performMailCheck('example.com');

      expect(result.dmarc.present).toBe(false);
      expect(result.dkim.present).toBe(false);
      expect(result.spf.present).toBe(false);
      expect(result.dmarc.dmarcDiscovery?.status).toBe('UNKNOWN');
    });
  });

  describe('checkDMARC', () => {
    it('should detect valid DMARC record', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue([
        'v=DMARC1; p=reject; rua=mailto:dmarc@example.com',
      ]);

      const result = await checkDMARC('example.com');

      expect(result.present).toBe(true);
      expect(result.valid).toBe(true);
      expect(result.record).toContain('v=DMARC1');
    });

    it('should handle missing DMARC record', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NXDOMAIN'));

      const result = await checkDMARC('example.com');

      expect(result.present).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.dmarcDiscovery?.status).toBe('UNKNOWN');
    });

    it('should handle TXT records without DMARC', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue([
        'v=spf1 include:_spf.example.com ~all',
        'some other txt',
      ]);

      const result = await checkDMARC('example.com');

      expect(result.present).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No applicable DMARC policy record found');
      expect(result.dmarcDiscovery?.queries.length).toBeLessThanOrEqual(8);
    });

    it('should store raw record content', async () => {
      const dmarcRecord = 'v=DMARC1; p=quarantine; pct=50; rua=mailto:reports@example.com';
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue([dmarcRecord]);

      const result = await checkDMARC('example.com');

      expect(result.record).toBe(dmarcRecord);
    });
  });

  describe('checkDKIM', () => {
    it('should use explicit selectors when provided', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('NXDOMAIN'))
        .mockResolvedValueOnce(['v=DKIM1; k=rsa; p=xxx']); // Second selector works

      const result = await checkDKIM('example.com', {
        explicitSelectors: ['selector1', 'selector2'],
      });

      expect(result.present).toBe(true);
      expect(result.selector).toBe('selector2');
      expect(result.selectorProvenance).toBe('operator');
      expect(result.triedSelectors).toEqual(['selector1', 'selector2']);
    });

    it('should use provider heuristic for Google', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue(['v=DKIM1; k=rsa; p=xxx']);

      const result = await checkDKIM('example.com', {
        preferredProvider: 'google',
      });

      expect(result.present).toBe(true);
      expect(result.selector).toBe('google');
      expect(result.selectorProvenance).toBe('provider');
      expect(result.provider).toBe('google');
      expect(resolveTXT).toHaveBeenCalledWith('google._domainkey.example.com');
    });

    it('should use provider heuristic for Microsoft', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue(['v=DKIM1; k=rsa; p=xxx']);

      const result = await checkDKIM('example.com', {
        preferredProvider: 'microsoft',
      });

      expect(result.present).toBe(true);
      expect(result.selector).toBe('selector1');
      expect(resolveTXT).toHaveBeenCalledWith('selector1._domainkey.example.com');
    });

    it('should fall back to common selectors when provider heuristic fails', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('NXDOMAIN')) // 'default' fails
        .mockRejectedValueOnce(new Error('NXDOMAIN')) // 'dkim' fails
        .mockRejectedValueOnce(new Error('NXDOMAIN')) // 'mail' fails
        .mockResolvedValueOnce(['v=DKIM1; k=rsa; p=xxx']); // 'email' selector works

      const result = await checkDKIM('example.com');

      expect(result.present).toBe(true);
      expect(result.selector).toBe('email');
      expect(result.selectorProvenance).toBe('default');
      expect(result.triedSelectors).toContain('default');
      expect(result.triedSelectors).toContain('email');
    });

    it('should report all tried selectors when none work', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NXDOMAIN'));

      const result = await checkDKIM('example.com');

      expect(result.present).toBe(false);
      expect(result.triedSelectors.length).toBeGreaterThan(0);
      expect(result.errors?.[0]).toContain('Tried selectors');
    });

    it('should validate DKIM record format', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue([
        'invalid record without proper format',
      ]);

      const result = await checkDKIM('example.com');

      expect(result.present).toBe(true);
      expect(result.valid).toBe(false); // Invalid format
    });
  });

  describe('checkSPF', () => {
    it('should detect valid SPF record', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue([
        'v=spf1 include:_spf.google.com ~all',
      ]);

      const result = await checkSPF('example.com');

      expect(result.present).toBe(true);
      expect(result.valid).toBe(true);
      expect(result.record).toContain('v=spf1');
      expect(result.spfAssessment).toMatchObject({
        scope: 'FIRST_LEVEL_ONLY',
        includeDomains: ['_spf.google.com'],
        completeEvaluation: false,
      });
    });

    it('should handle missing SPF record', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue([
        'some other txt record',
        'another record',
      ]);

      const result = await checkSPF('example.com');

      expect(result.present).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No SPF record found');
    });

    it('should handle DNS errors', async () => {
      (resolveTXT as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('SERVFAIL'));

      const result = await checkSPF('example.com');

      expect(result.present).toBe(false);
      expect(result.errors).toContain('DNS error: SERVFAIL');
    });
  });

  describe('PROVIDER_SELECTORS', () => {
    it('should have expected provider mappings', () => {
      expect(PROVIDER_SELECTORS.google.selector).toBe('google');
      expect(PROVIDER_SELECTORS.microsoft.selector).toBe('selector1');
      expect(PROVIDER_SELECTORS.zoho.selector).toBe('zoho');
    });

    it('should have confidence scores', () => {
      expect(PROVIDER_SELECTORS.google.confidence).toBeGreaterThan(0.9);
      expect(PROVIDER_SELECTORS.microsoft.confidence).toBeGreaterThan(0.8);
    });
  });
});

describe('BDD Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Complete mail security check passes', () => {
    it('should report all records present and valid', async () => {
      // Given example.com has proper mail configuration
      (resolveTXT as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(['v=DMARC1; p=reject; rua=mailto:dmarc@example.com'])
        .mockResolvedValueOnce([
          'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1TaNgLlSyQMNWVLNLvyY/neDgaL2oqQE8T5illKqCgDtFHc8eHVAU+nlcaGmrKmDMw9dbgiGk1ocgZ56NR4ycfUHwQhvQPMUZw0cveel/8EAGoi/UyPmqfcPibytH81NFtTMAxUeM4Op8A6iHkvAMj5qLf4YRNsTkKAKW3OkwPQIDAQAB',
        ])
        .mockResolvedValueOnce(['v=spf1 include:_spf.google.com ~all']);

      // When the mail check is performed
      const result = await performMailCheck('example.com');

      // Then all checks should pass
      expect(result.dmarc.present && result.dmarc.valid).toBe(true);
      expect(result.dkim.present && result.dkim.valid).toBe(true);
      expect(result.spf.present && result.spf.valid).toBe(true);
    });
  });

  describe('Scenario: Missing all mail records', () => {
    it('should report all records missing with errors', async () => {
      // Given example.com has no mail configuration
      (resolveTXT as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NXDOMAIN'));

      // When the mail check is performed
      const result = await performMailCheck('example.com');

      // Then all checks should fail with appropriate errors
      expect(result.dmarc.present).toBe(false);
      expect(result.dkim.present).toBe(false);
      expect(result.spf.present).toBe(false);
      expect(result.dmarc.errors).toBeDefined();
      expect(result.dkim.errors).toBeDefined();
      expect(result.spf.errors).toBeDefined();
    });
  });

  describe('Scenario: Provider-specific DKIM discovery', () => {
    it('should discover Google Workspace DKIM using provider hint', async () => {
      // Given a domain using Google Workspace
      (resolveTXT as ReturnType<typeof vi.fn>).mockResolvedValue(['v=DKIM1; k=rsa; p=xxx']);

      // When checking with Google provider hint
      const result = await checkDKIM('example.com', { preferredProvider: 'google' });

      // Then it should find the record with provider provenance
      expect(result.present).toBe(true);
      expect(result.selectorProvenance).toBe('provider');
      expect(result.provider).toBe('google');
      expect(result.selector).toBe('google');
    });
  });
});
