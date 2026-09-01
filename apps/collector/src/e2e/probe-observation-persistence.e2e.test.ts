/**
 * E2E Integration Tests: Probe Observation Persistence - DATA-003
 *
 * Tests that verify probe observations are correctly persisted:
 * 1. SMTP probe results are mapped to observation format
 * 2. MTA-STS probe results are mapped to observation format
 * 3. All probe status types are correctly handled
 * 4. Failed probes (SSRF, allowlist, timeout) have correct status
 * 5. Observations can be persisted and retrieved
 *
 * These tests catch issues like:
 * - SSRF/allowlist errors mapped to generic 'error' instead of specific status
 * - Empty string error messages not properly handled
 * - Missing status types for different error conditions
 */

import { describe, expect, it } from 'vitest';
import type { MTASTSProbeResult } from '../probes/mta-sts.js';
import {
  mtastsResultToObservation,
  smtpResultToObservation,
} from '../probes/persist-observations.js';
import type { SMTPProbeResult } from '../probes/smtp-starttls.js';

describe('Probe Observation Persistence E2E', () => {
  describe('SMTP Result Mapping - Status Types', () => {
    it('should map a trusted STARTTLS result to success status', () => {
      const result: SMTPProbeResult = {
        success: true,
        hostname: 'mail.example.com',
        port: 25,
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        tlsVersion: 'TLSv1.3',
        tlsCipher: 'AES256-GCM-SHA384',
        certificate: {
          subject: 'mail.example.com',
          issuer: 'DigiCert SHA2 Extended Validation Server CA',
          validFrom: '2024-01-01',
          validTo: '2025-01-01',
          fingerprint: 'AA:BB:CC:DD:EE:FF',
          chainAuthorized: true,
          hostnameAuthorized: true,
        },
        smtpBanner: '220 mail.example.com ESMTP',
        responseTimeMs: 150,
      };

      const observation = smtpResultToObservation('snap-123', result);

      expect(observation.snapshotId).toBe('snap-123');
      expect(observation.probeType).toBe('smtp_starttls');
      expect(observation.status).toBe('success');
      expect(observation.hostname).toBe('mail.example.com');
      expect(observation.port).toBe(25);
      expect(observation.success).toBe(true);
      expect(observation.errorMessage).toBeNull();
      expect(observation.responseTimeMs).toBe(150);
      expect(observation.probeData?.supportsStarttls).toBe(true);
      expect(observation.probeData?.tlsNegotiated).toBe(true);
      expect(observation.probeData?.tlsTrusted).toBe(true);
      expect(observation.probeData?.tlsVersion).toBe('TLSv1.3');
      expect(observation.probeData?.certificate).toEqual({
        subject: 'mail.example.com',
        issuer: 'DigiCert SHA2 Extended Validation Server CA',
        validFrom: '2024-01-01',
        validTo: '2025-01-01',
        fingerprint: 'AA:BB:CC:DD:EE:FF',
        chainAuthorized: true,
        hostnameAuthorized: true,
      });
    });

    it('should never persist a negotiated-but-untrusted TLS result as successful (issue #74)', () => {
      const result: SMTPProbeResult = {
        success: true, // forged caller-asserted success must not survive
        hostname: 'expired.example.com',
        port: 25,
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: false,
        tlsVersion: 'TLSv1.3',
        tlsCipher: 'AES256-GCM-SHA384',
        certificate: {
          subject: 'expired.example.com',
          issuer: 'DigiCert SHA2 Extended Validation Server CA',
          validFrom: '2023-01-01',
          validTo: '2024-01-01',
          fingerprint: 'FF:EE:DD:CC:BB:AA',
          chainAuthorized: false,
          hostnameAuthorized: true,
          authorizationError: 'certificate has expired',
        },
        smtpBanner: '220 expired.example.com ESMTP',
        error: 'TLS certificate not trusted: certificate has expired',
        responseTimeMs: 150,
      };

      const observation = smtpResultToObservation('snap-untrusted', result);

      expect(observation.status).not.toBe('success');
      expect(observation.success).toBe(false);
      expect(observation.errorMessage).toBe('TLS certificate not trusted: certificate has expired');
      // Diagnostic certificate evidence is preserved for the failed observation.
      expect(observation.probeData?.tlsNegotiated).toBe(true);
      expect(observation.probeData?.tlsTrusted).toBe(false);
      expect(observation.probeData?.certificate).toMatchObject({
        fingerprint: 'FF:EE:DD:CC:BB:AA',
        chainAuthorized: false,
        hostnameAuthorized: true,
        authorizationError: 'certificate has expired',
      });
    });

    it('should map SMTP result with timeout error to timeout status', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'slow.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Connection timeout after 30000ms',
        responseTimeMs: 30000,
      };

      const observation = smtpResultToObservation('snap-456', result);

      expect(observation.status).toBe('timeout');
      expect(observation.success).toBe(false);
      expect(observation.errorMessage).toBe('Connection timeout after 30000ms');
      expect(observation.probeData).toEqual({
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        smtpBanner: undefined,
      });
    });

    it('should map SMTP result with connection refused to refused status', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'blocked.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Connection refused',
        responseTimeMs: 500,
      };

      const observation = smtpResultToObservation('snap-789', result);

      expect(observation.status).toBe('refused');
      expect(observation.success).toBe(false);
    });

    it('should map SMTP result with generic error to error status', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'error.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'SSL certificate verification failed',
        responseTimeMs: 2000,
      };

      const observation = smtpResultToObservation('snap-abc', result);

      expect(observation.status).toBe('error');
      expect(observation.success).toBe(false);
      expect(observation.errorMessage).toBe('SSL certificate verification failed');
    });

    it('should map SMTP result without STARTTLS support to error status', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'legacy.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        smtpBanner: '220 legacy.example.com ESMTP',
        responseTimeMs: 100,
      };

      const observation = smtpResultToObservation('snap-xyz', result);

      // Server responded but doesn't support STARTTLS - this is marked as error
      expect(observation.status).toBe('error');
      expect(observation.success).toBe(false);
      expect(observation.probeData?.supportsStarttls).toBe(false);
    });

    // =============================================================================
    // SSRF BLOCKED STATUS TESTS - Critical for security isolation
    // These tests verify that SSRF errors are properly categorized
    // =============================================================================

    it('should map SSRF blocked to ssrf_blocked status', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: '10.0.0.1',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'SSRF blocked: Private IP address',
        responseTimeMs: 5,
      };

      const observation = smtpResultToObservation('snap-ssrf', result);

      expect(observation.status).toBe('ssrf_blocked');
      expect(observation.errorMessage).toContain('SSRF');
    });

    it('should map SSRF with lowercase error to ssrf_blocked status', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: '192.168.1.1',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'ssrf blocked: private ip',
        responseTimeMs: 3,
      };

      const observation = smtpResultToObservation('snap-ssrf-lower', result);

      expect(observation.status).toBe('ssrf_blocked');
    });

    it('should map SSRF with mixed case error to ssrf_blocked status', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: '127.0.0.1',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Ssrf Blocked: Localhost Detected',
        responseTimeMs: 1,
      };

      const observation = smtpResultToObservation('snap-ssrf-mixed', result);

      expect(observation.status).toBe('ssrf_blocked');
    });

    // =============================================================================
    // ALLOWLIST DENIED STATUS TESTS - Critical for tenant isolation
    // These tests verify that allowlist violations are properly categorized
    // =============================================================================

    it('should map allowlist denied to allowlist_denied status', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'unlisted.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Destination not in allowlist',
        responseTimeMs: 5,
      };

      const observation = smtpResultToObservation('snap-allow', result);

      expect(observation.status).toBe('allowlist_denied');
    });

    it('should map allowlist with "not in allowlist" error to allowlist_denied', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'not-allowed.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Host not in allowlist: unauthorized destination',
        responseTimeMs: 3,
      };

      const observation = smtpResultToObservation('snap-allow-2', result);

      expect(observation.status).toBe('allowlist_denied');
    });

    it('should map allowlist denied with lowercase error to allowlist_denied', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'cross-tenant.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'allowlist denied: tenant-b cannot probe tenant-a resources',
        responseTimeMs: 2,
      };

      const observation = smtpResultToObservation('snap-allow-3', result);

      expect(observation.status).toBe('allowlist_denied');
    });

    // =============================================================================
    // STATUS ORDERING TESTS - Specific statuses take precedence
    // SSRF and allowlist should be checked before generic error
    // =============================================================================

    it('should check SSRF before generic error matching', () => {
      // Error that mentions SSRF but also contains "error" in the message
      const result: SMTPProbeResult = {
        success: false,
        hostname: '10.0.0.1',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'SSRF blocked: Internal error occurred',
        responseTimeMs: 5,
      };

      const observation = smtpResultToObservation('snap-ssrf-first', result);

      // Should be ssrf_blocked, not error (SSRF check comes first)
      expect(observation.status).toBe('ssrf_blocked');
    });

    it('should check allowlist before generic error matching', () => {
      // Error that mentions allowlist but also contains "refused" in the message
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'blocked.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Allowlist denied: Connection refused',
        responseTimeMs: 5,
      };

      const observation = smtpResultToObservation('snap-allow-first', result);

      // Should be allowlist_denied, not refused (allowlist check comes first)
      expect(observation.status).toBe('allowlist_denied');
    });
  });

  describe('MTA-STS Result Mapping', () => {
    it('should map successful MTA-STS result', () => {
      const result: MTASTSProbeResult = {
        success: true,
        domain: 'example.com',
        policyUrl: 'https://mta-sts.example.com/.well-known/mta-sts.txt',
        policy: {
          version: 'STSv1',
          mode: 'enforce',
          maxAge: 86400,
          mx: ['mail.example.com', 'mail2.example.com'],
          raw: 'version: STSv1\nmode: enforce\nmx: mail.example.com\nmx: mail2.example.com\nmax_age: 86400',
        },
        responseTimeMs: 200,
        tlsVersion: 'TLSv1.3',
        certificateValid: true,
      };

      const observation = mtastsResultToObservation('snap-123', 'mta-sts.example.com', result);

      expect(observation.snapshotId).toBe('snap-123');
      expect(observation.probeType).toBe('mta_sts');
      expect(observation.status).toBe('success');
      expect(observation.hostname).toBe('mta-sts.example.com');
      expect(observation.port).toBe(443);
      expect(observation.success).toBe(true);
      expect(observation.probeData?.policyMode).toBe('enforce');
      expect(observation.probeData?.policyMaxAge).toBe(86400);
      expect(observation.probeData?.tlsVersion).toBe('TLSv1.3');
    });

    it('should map failed MTA-STS result', () => {
      const result: MTASTSProbeResult = {
        success: false,
        domain: 'example.com',
        policyUrl: 'https://mta-sts.example.com/.well-known/mta-sts.txt',
        error: 'TLS handshake failed',
        responseTimeMs: 5000,
      };

      const observation = mtastsResultToObservation('snap-456', 'mta-sts.example.com', result);

      expect(observation.status).toBe('error');
      expect(observation.success).toBe(false);
      expect(observation.errorMessage).toBe('TLS handshake failed');
      expect(observation.probeData?.policyMode).toBeUndefined();
    });

    it('should handle MTA-STS with no policy (null MX)', () => {
      const result: MTASTSProbeResult = {
        success: true,
        domain: 'nullmx.example.com',
        policyUrl: 'https://mta-sts.nullmx.example.com/.well-known/mta-sts.txt',
        responseTimeMs: 150,
        // No policy field means policy fetch failed or domain doesn't support MTA-STS
      };

      const observation = mtastsResultToObservation(
        'snap-null',
        'mta-sts.nullmx.example.com',
        result
      );

      expect(observation.success).toBe(true); // Connection succeeded
      expect(observation.probeData?.policyMode).toBeUndefined();
    });
  });

  describe('Probe Data Field Mapping', () => {
    it('should include certificate data when available', () => {
      const result: SMTPProbeResult = {
        success: true,
        hostname: 'secure.example.com',
        port: 465,
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        tlsVersion: 'TLSv1.2',
        tlsCipher: 'ECDHE-RSA-AES256-SHA',
        certificate: {
          subject: 'secure.example.com',
          issuer: "Let's Encrypt Authority X3",
          validFrom: '2024-01-15',
          validTo: '2024-04-15',
          fingerprint: 'FINGERPRINT',
          chainAuthorized: true,
          hostnameAuthorized: true,
        },
        smtpBanner: '220 secure.example.com ESMTP',
        responseTimeMs: 100,
      };

      const observation = smtpResultToObservation('snap-cert', result);

      expect(observation.probeData).toEqual({
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        tlsVersion: 'TLSv1.2',
        tlsCipher: 'ECDHE-RSA-AES256-SHA',
        certificate: {
          subject: 'secure.example.com',
          issuer: "Let's Encrypt Authority X3",
          validFrom: '2024-01-15',
          validTo: '2024-04-15',
          fingerprint: 'FINGERPRINT',
          chainAuthorized: true,
          hostnameAuthorized: true,
        },
        smtpBanner: '220 secure.example.com ESMTP',
      });
    });

    it('should handle missing certificate gracefully', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'nocert.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Connection refused',
        responseTimeMs: 50,
      };

      const observation = smtpResultToObservation('snap-nocert', result);

      expect(observation.probeData).toEqual({
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        smtpBanner: undefined,
      });
    });
  });

  // =============================================================================
  // EMPTY/WHITESPACE ERROR MESSAGE TESTS
  // Empty or whitespace-only error messages should be handled gracefully
  // =============================================================================

  describe('Empty Error Message Handling', () => {
    it('should convert empty string error to null', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'empty.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: '',
        responseTimeMs: 0,
      };

      const observation = smtpResultToObservation('snap-empty', result);

      expect(observation.errorMessage).toBeNull();
      expect(observation.status).toBe('error');
    });

    it('should convert whitespace-only error to null', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'whitespace.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: '   ',
        responseTimeMs: 0,
      };

      const observation = smtpResultToObservation('snap-whitespace', result);

      expect(observation.errorMessage).toBeNull();
    });

    it('should convert tab/newline error to null', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'newline.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: '\n\t  \r',
        responseTimeMs: 0,
      };

      const observation = smtpResultToObservation('snap-newline', result);

      expect(observation.errorMessage).toBeNull();
    });

    it('should preserve single-character error message', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'single-char.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'x',
        responseTimeMs: 0,
      };

      const observation = smtpResultToObservation('snap-single', result);

      expect(observation.errorMessage).toBe('x');
    });
  });

  // =============================================================================
  // MTA-STS STATUS TYPE TESTS
  // =============================================================================

  describe('MTA-STS Result Mapping - Status Types', () => {
    it('should map successful MTA-STS result to success status', () => {
      const result: MTASTSProbeResult = {
        success: true,
        domain: 'example.com',
        policyUrl: 'https://mta-sts.example.com/.well-known/mta-sts.txt',
        policy: {
          version: 'STSv1',
          mode: 'enforce',
          maxAge: 86400,
          mx: ['mail.example.com', 'mail2.example.com'],
          raw: 'version: STSv1\nmode: enforce\nmx: mail.example.com\nmx: mail2.example.com\nmax_age: 86400',
        },
        responseTimeMs: 200,
        tlsVersion: 'TLSv1.3',
        certificateValid: true,
      };

      const observation = mtastsResultToObservation('snap-123', 'mta-sts.example.com', result);

      expect(observation.snapshotId).toBe('snap-123');
      expect(observation.probeType).toBe('mta_sts');
      expect(observation.status).toBe('success');
      expect(observation.hostname).toBe('mta-sts.example.com');
      expect(observation.port).toBe(443);
      expect(observation.success).toBe(true);
      expect(observation.probeData?.policyMode).toBe('enforce');
      expect(observation.probeData?.policyMaxAge).toBe(86400);
      expect(observation.probeData?.tlsVersion).toBe('TLSv1.3');
    });

    it('should map MTA-STS TLS error to error status', () => {
      const result: MTASTSProbeResult = {
        success: false,
        domain: 'example.com',
        policyUrl: 'https://mta-sts.example.com/.well-known/mta-sts.txt',
        error: 'TLS handshake failed',
        responseTimeMs: 5000,
      };

      const observation = mtastsResultToObservation('snap-456', 'mta-sts.example.com', result);

      expect(observation.status).toBe('error');
      expect(observation.success).toBe(false);
      expect(observation.errorMessage).toBe('TLS handshake failed');
      expect(observation.probeData?.policyMode).toBeUndefined();
    });

    it('should map MTA-STS timeout to timeout status', () => {
      const result: MTASTSProbeResult = {
        success: false,
        domain: 'example.com',
        policyUrl: 'https://mta-sts.example.com/.well-known/mta-sts.txt',
        error: 'Connection timeout after 10000ms',
        responseTimeMs: 10000,
      };

      const observation = mtastsResultToObservation('snap-timeout', 'mta-sts.example.com', result);

      expect(observation.status).toBe('timeout');
      expect(observation.success).toBe(false);
    });

    it('should map MTA-STS certificate error to error status', () => {
      const result: MTASTSProbeResult = {
        success: false,
        domain: 'example.com',
        policyUrl: 'https://mta-sts.example.com/.well-known/mta-sts.txt',
        error: 'Certificate verification failed',
        responseTimeMs: 2000,
      };

      const observation = mtastsResultToObservation('snap-cert-err', 'mta-sts.example.com', result);

      expect(observation.status).toBe('error');
    });

    it('should handle MTA-STS with no policy (null MX)', () => {
      const result: MTASTSProbeResult = {
        success: true,
        domain: 'nullmx.example.com',
        policyUrl: 'https://mta-sts.nullmx.example.com/.well-known/mta-sts.txt',
        responseTimeMs: 150,
        // No policy field means policy fetch failed or domain doesn't support MTA-STS
      };

      const observation = mtastsResultToObservation(
        'snap-null',
        'mta-sts.nullmx.example.com',
        result
      );

      expect(observation.success).toBe(true); // Connection succeeded
      expect(observation.probeData?.policyMode).toBeUndefined();
    });

    it('should convert empty MTA-STS error to null', () => {
      const result: MTASTSProbeResult = {
        success: false,
        domain: 'example.com',
        policyUrl: 'https://mta-sts.example.com/.well-known/mta-sts.txt',
        error: '',
        responseTimeMs: 0,
      };

      const observation = mtastsResultToObservation('snap-empty', 'mta-sts.example.com', result);

      expect(observation.errorMessage).toBeNull();
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle very long hostname', () => {
      const longHostname = `${'a'.repeat(60)}.example.com`;
      const result: SMTPProbeResult = {
        success: true,
        hostname: longHostname,
        port: 25,
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        responseTimeMs: 100,
      };

      const observation = smtpResultToObservation('snap-long', result);

      expect(observation.hostname).toBe(longHostname);
    });

    it('should handle special characters in error message', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'special.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Error with "quotes" and \'apostrophes\' and <brackets>',
        responseTimeMs: 100,
      };

      const observation = smtpResultToObservation('snap-special', result);

      expect(observation.errorMessage).toBe(
        'Error with "quotes" and \'apostrophes\' and <brackets>'
      );
    });

    it('should handle very large response time', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'slow.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Timeout',
        responseTimeMs: 300000, // 5 minutes
      };

      const observation = smtpResultToObservation('snap-slow', result);

      expect(observation.responseTimeMs).toBe(300000);
    });

    it('should handle zero response time', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'instant.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Connection refused',
        responseTimeMs: 0,
      };

      const observation = smtpResultToObservation('snap-zero', result);

      expect(observation.responseTimeMs).toBe(0);
    });

    it('should preserve error message with leading/trailing whitespace', () => {
      const result: SMTPProbeResult = {
        success: false,
        hostname: 'whitespace.example.com',
        port: 25,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: '  Error message  ',
        responseTimeMs: 100,
      };

      const observation = smtpResultToObservation('snap-trim', result);

      // Leading/trailing whitespace is preserved in the error message
      expect(observation.errorMessage).toBe('  Error message  ');
    });
  });
});
