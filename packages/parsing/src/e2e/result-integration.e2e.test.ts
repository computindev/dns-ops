/**
 * E2E Integration Tests for Result-based Parsing
 *
 * These tests verify that the Result-based parsing layer correctly:
 * 1. Wraps existing throwing/null-returning functions
 * 2. Handles edge cases and error conditions
 * 3. Maintains backward compatibility
 * 4. Provides consistent error structures
 *
 * Issues these tests catch:
 * - Interface mismatches (e.g., MTA-STS required fields)
 * - Error property shadowing
 * - Missing exports
 * - Inconsistent error codes
 * - Type narrowing failures
 */

import { Result } from '@dns-ops/contracts';
import type { DNSRecord, Observation } from '@dns-ops/db/schema';
import { describe, expect, it } from 'vitest';
import {
  DNSParseError,
  isDNSParseError,
  parseDNSAnswerResult,
  parseRecordSetResult,
  parseTXTRecordResult,
} from '../dns/result.js';
import {
  isDomainValidationError,
  normalizeDomainResult,
  partitionDomainResults,
} from '../domain/result.js';
import {
  isMailParseError,
  MailParseError,
  parseAnyMailRecord,
  parseDKIMResult,
  parseDMARCResult,
  parseMTASTSResult,
  parseSPFResult,
} from '../mail/result.js';

// =============================================================================
// E2E Test Suite 1: Domain Normalization Integration
// =============================================================================

describe('E2E: Domain Normalization Result Integration', () => {
  it('should handle complete domain validation pipeline', () => {
    const domains = [
      'Example.COM',
      'sub.domain.org',
      'münchen.de',
      '',
      'invalid..domain',
      '-bad.com',
      'also-.com',
    ];

    const results = domains.map(normalizeDomainResult);

    // Verify successes
    expect(results[0].isOk()).toBe(true);
    expect(results[1].isOk()).toBe(true);
    expect(results[2].isOk()).toBe(true);

    // Verify failures with correct error codes
    expect(results[3].isErr()).toBe(true);
    if (results[3].isErr()) {
      expect(results[3].error.code).toBe('EMPTY_DOMAIN');
      expect(isDomainValidationError(results[3].error)).toBe(true);
    }

    expect(results[4].isErr()).toBe(true);
    if (results[4].isErr()) {
      expect(results[4].error.code).toBe('DOUBLE_DOT');
    }

    expect(results[5].isErr()).toBe(true);
    expect(results[6].isErr()).toBe(true);
  });

  it('should maintain consistency between throwing and Result variants', () => {
    const validDomain = 'test.example.com';
    const invalidDomain = 'invalid..domain';

    // Result variant
    const resultOk = normalizeDomainResult(validDomain);
    expect(resultOk.isOk()).toBe(true);

    const resultErr = normalizeDomainResult(invalidDomain);
    expect(resultErr.isErr()).toBe(true);

    // Verify Result.error contains the same info as throwing variant would
    if (resultErr.isErr()) {
      expect(resultErr.error.message).toContain('consecutive dots');
      expect(resultErr.error.code).toBe('DOUBLE_DOT');
      expect(resultErr.error.details?.domain).toBe(invalidDomain);
    }
  });

  it('should handle batch processing with partitionDomainResults', () => {
    const domains = ['a.com', 'b.com', '', 'c.com', 'bad..domain'];
    const { ok, err } = partitionDomainResults(domains);

    expect(ok).toHaveLength(3);
    expect(err).toHaveLength(2);

    // Verify structure of successful results
    expect(ok[0]?.normalized).toBe('a.com');
    expect(ok[0]?.original).toBe('a.com');

    // Verify structure of errors
    expect(err[0]?.code).toBe('EMPTY_DOMAIN');
    expect(err[1]?.code).toBe('DOUBLE_DOT');
  });

  it('should support exhaustive pattern matching', () => {
    const results = ['valid.com', ''].map(normalizeDomainResult);

    const messages = results.map((r) =>
      Result.match(r, {
        ok: (d) => `OK: ${d.normalized}`,
        err: (e) => `ERR: ${e.code}`,
      })
    );

    expect(messages).toEqual(['OK: valid.com', 'ERR: EMPTY_DOMAIN']);
  });

  it('should preserve IDN domain information', () => {
    const result = normalizeDomainResult('München.de');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Punycode for DNS queries
      expect(result.value.normalized).toBe('xn--mnchen-3ya.de');
      // Unicode for display (normalized to lowercase)
      expect(result.value.unicode).toBe('münchen.de');
      expect(result.value.punycode).toBe('xn--mnchen-3ya.de');
    }
  });
});

// =============================================================================
// E2E Test Suite 2: DNS Record Parsing Integration
// =============================================================================

describe('E2E: DNS Record Result Integration', () => {
  it('should handle complete DNS answer parsing pipeline', () => {
    const records: DNSRecord[] = [
      { name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' },
      { name: 'example.com', type: 'MX', ttl: 3600, data: 'mail.example.com', priority: 10 },
      { name: 'example.com', type: 'TXT', ttl: 300, data: 'v=spf1 ~all' },
      { name: 'example.com', type: 'NS', ttl: 86400, data: 'ns1.example.com' },
    ];

    const results = records.map(parseDNSAnswerResult);

    expect(results.every((r) => r.isOk())).toBe(true);

    // Verify MX priority is preserved
    if (results[1].isOk()) {
      expect(results[1].value.priority).toBe(10);
      expect(results[1].value.type).toBe('MX');
    }
  });

  it('should handle TXT record with multiple quoted strings', () => {
    const txtData = '"v=spf1" "include:_spf.google.com" "~all"';
    const result = parseTXTRecordResult(txtData);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.strings).toHaveLength(3);
      expect(result.value.strings).toContain('v=spf1');
      expect(result.value.raw).toBe(txtData);
    }
  });

  it('should handle empty TXT data with structured error', () => {
    const result = parseTXTRecordResult('');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DNSParseError);
      expect(result.error.code).toBe('EMPTY_DATA');
      expect(result.error.details?.code).toBe('EMPTY_DATA');
      expect(result.error.details?.input).toBe('');
      expect(isDNSParseError(result.error)).toBe(true);
    }
  });

  it('should parse RecordSet from observations with mixed success/failure', () => {
    const observations: Observation[] = [
      createMockObservation({
        queryName: 'example.com',
        queryType: 'A',
        status: 'success',
        vantageIdentifier: '8.8.8.8',
        answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
      }),
      createMockObservation({
        queryName: 'example.com',
        queryType: 'A',
        status: 'timeout',
        vantageIdentifier: '1.1.1.1',
      }),
    ];

    const result = parseRecordSetResult(observations);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should have one record (grouped by name/type)
      expect(result.value.records).toHaveLength(1);

      // Should have error for failed observation
      expect(result.value.hasErrors).toBe(true);
      expect(result.value.errors).toHaveLength(1);
      expect(result.value.errors[0]?.error.code).toBe('OBSERVATION_PARSE_FAILED');

      // Record should be marked inconsistent due to failure
      expect(result.value.records[0]?.isConsistent).toBe(false);
    }
  });

  it('should detect cross-vantage inconsistency', () => {
    const observations: Observation[] = [
      createMockObservation({
        queryName: 'example.com',
        queryType: 'A',
        status: 'success',
        vantageIdentifier: 'aws-us-east-1',
        answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
      }),
      createMockObservation({
        queryName: 'example.com',
        queryType: 'A',
        status: 'success',
        vantageIdentifier: 'aws-us-west-2',
        answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.2' }],
      }),
    ];

    const result = parseRecordSetResult(observations);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.records[0]?.isConsistent).toBe(false);
      expect(result.value.records[0]?.consolidationNotes).toContain('differ');
    }
  });

  it('should handle escaped characters in TXT records', () => {
    const txtData = '"path=\\"value\\""';
    const result = parseTXTRecordResult(txtData);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.strings[0]).toBe('path="value"');
    }
  });
});

// =============================================================================
// E2E Test Suite 3: Mail Record Parsing Integration
// =============================================================================

describe('E2E: Mail Record Result Integration', () => {
  it('should handle complete SPF parsing pipeline', () => {
    const spfRecord = 'v=spf1 include:_spf.google.com include:sendgrid.net ~all';
    const result = parseSPFResult(spfRecord);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.version).toBe('spf1');
      expect(result.value.mechanisms).toHaveLength(3);

      const includes = result.value.mechanisms
        .filter((m) => m.type === 'include')
        .map((m) => m.value);
      expect(includes).toContain('_spf.google.com');
      expect(includes).toContain('sendgrid.net');
    }
  });

  it('should reject non-SPF records with specific error', () => {
    const result = parseSPFResult('this is not an SPF record');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MailParseError);
      expect(result.error.code).toBe('NOT_SPF_RECORD');
      expect(result.error.message).toContain('v=spf1');
      expect(isMailParseError(result.error)).toBe(true);
    }
  });

  it('should handle DMARC with all optional fields', () => {
    const dmarcRecord =
      'v=DMARC1; p=reject; sp=quarantine; pct=100; rua=mailto:dmarc@example.com; ruf=mailto:forensic@example.com; fo=1:d:s; adkim=s; aspf=s; rf=afrf; ri=86400';
    const result = parseDMARCResult(dmarcRecord);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.policy).toBe('reject');
      expect(result.value.subdomainPolicy).toBe('quarantine');
      expect(result.value.percentage).toBe(100);
      expect(result.value.rua).toContain('mailto:dmarc@example.com');
      expect(result.value.ruf).toContain('mailto:forensic@example.com');
      expect(result.value.fo).toBe('1:d:s');
      expect(result.value.adkim).toBe('s');
      expect(result.value.aspf).toBe('s');
      expect(result.value.rf).toBe('afrf');
      expect(result.value.ri).toBe(86400);
    }
  });

  it('should apply RFC 9989 p=none fallback without p when rua is valid', () => {
    const result = parseDMARCResult('v=DMARC1; rua=mailto:test@example.com');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.policy).toBe('none');
  });

  it('should handle DKIM with all fields', () => {
    const dkimRecord = 'v=DKIM1; k=rsa; p=MIGfMA0G; s=email; t=s:y; n=notes';
    const result = parseDKIMResult(dkimRecord);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.version).toBe('DKIM1');
      expect(result.value.keyType).toBe('rsa');
      expect(result.value.publicKey).toBe('MIGfMA0G');
      expect(result.value.serviceType).toEqual(['email']);
      expect(result.value.flags).toEqual(['s', 'y']);
      expect(result.value.notes).toBe('notes');
    }
  });

  it('should reject DKIM without public key', () => {
    const result = parseDKIMResult('v=DKIM1; k=rsa');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.error.details?.field).toBe('p');
    }
  });

  it('should handle MTA-STS TXT record', () => {
    const mtastsRecord = 'v=STSv1; id=20240101';
    const result = parseMTASTSResult(mtastsRecord);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.version).toBe('STSv1');
    }
  });

  it('should auto-detect record type with parseAnyMailRecord', () => {
    const spf = parseAnyMailRecord('v=spf1 ~all');
    expect(spf.type).toBe('spf');
    expect(spf.result?.isOk()).toBe(true);

    const dmarc = parseAnyMailRecord('v=DMARC1; p=reject');
    expect(dmarc.type).toBe('dmarc');
    expect(dmarc.result?.isOk()).toBe(true);

    const dkim = parseAnyMailRecord('v=DKIM1; k=rsa; p=KEY');
    expect(dkim.type).toBe('dkim');
    expect(dkim.result?.isOk()).toBe(true);

    const mtasts = parseAnyMailRecord('v=STSv1; id=2024');
    expect(mtasts.type).toBe('mtasts');
    expect(mtasts.result?.isOk()).toBe(true);

    const unknown = parseAnyMailRecord('random text');
    expect(unknown.type).toBe('unknown');
    expect(unknown.result).toBeNull();
  });
});

// =============================================================================
// E2E Test Suite 4: Error Handling Consistency
// =============================================================================

describe('E2E: Error Handling Consistency', () => {
  it('should have consistent error structure across all error types', () => {
    const domainError = normalizeDomainResult('');
    const dnsError = parseTXTRecordResult('');
    const mailError = parseSPFResult('invalid');

    expect(domainError.isErr()).toBe(true);
    expect(dnsError.isErr()).toBe(true);
    expect(mailError.isErr()).toBe(true);

    if (domainError.isErr()) {
      expect(domainError.error.message).toBeDefined();
      expect(domainError.error.code).toBeDefined();
      expect(domainError.error._tag).toBe('ValidationError');
    }

    if (dnsError.isErr()) {
      expect(dnsError.error.message).toBeDefined();
      expect(dnsError.error.code).toBeDefined();
      expect(dnsError.error._tag).toBe('ParseError');
    }

    if (mailError.isErr()) {
      expect(mailError.error.message).toBeDefined();
      expect(mailError.error.code).toBeDefined();
      expect(mailError.error._tag).toBe('ParseError');
    }
  });

  it('should support type guards for all error types', () => {
    const results = [
      normalizeDomainResult(''),
      parseTXTRecordResult(''),
      parseSPFResult('invalid'),
    ];

    const errors = results.filter((r) => r.isErr()).map((r) => (r.isErr() ? r.error : null));

    expect(isDomainValidationError(errors[0])).toBe(true);
    expect(isDNSParseError(errors[1])).toBe(true);
    expect(isMailParseError(errors[2])).toBe(true);
  });

  it('should preserve error context through Result operations', () => {
    const result = normalizeDomainResult('invalid..domain');

    // Map should preserve error
    const mapped = Result.map(result, (d) => d.normalized);
    expect(mapped.isErr()).toBe(true);

    // unwrapOr should provide default
    const unwrapped = Result.unwrapOr(mapped, 'default');
    expect(unwrapped).toBe('default');

    // Original error should still be accessible
    if (result.isErr()) {
      expect(result.error.code).toBe('DOUBLE_DOT');
    }
  });

  it('should handle chaining multiple Result operations', () => {
    const pipeline = (domain: string) => {
      // Step 1: Normalize domain
      const normalized = normalizeDomainResult(domain);
      if (normalized.isErr()) return normalized;

      // Step 2: Create DNS record (always succeeds in this test)
      const record: DNSRecord = {
        name: normalized.value.normalized,
        type: 'TXT',
        ttl: 300,
        data: 'v=spf1 ~all',
      };

      // Step 3: Parse DNS answer
      const parsed = parseDNSAnswerResult(record);
      if (parsed.isErr()) return parsed;

      // Step 4: Parse SPF from data
      const spf = parseSPFResult(parsed.value.data);
      return spf;
    };

    // Valid domain should complete pipeline
    const validResult = pipeline('Example.COM');
    expect(validResult.isOk()).toBe(true);

    // Invalid domain should fail at step 1
    const invalidResult = pipeline('invalid..domain');
    expect(invalidResult.isErr()).toBe(true);
    if (invalidResult.isErr()) {
      expect(invalidResult.error.code).toBe('DOUBLE_DOT');
    }
  });
});

// =============================================================================
// E2E Test Suite 5: Backward Compatibility
// =============================================================================

describe('E2E: Backward Compatibility', () => {
  it('should not affect existing throwing functions', async () => {
    // These should still work exactly as before
    const { normalizeDomain } = await import('../domain/index.js');
    const { parseSPF } = await import('../mail/index.js');

    // Throwing function still throws
    expect(() => normalizeDomain('')).toThrow();

    // Null-returning function still returns null
    expect(parseSPF('not spf')).toBeNull();
  });

  it('should allow mixing Result and non-Result variants', async () => {
    const domains = ['example.com', 'test.org'];

    // Using throwing variant for some operations
    const { normalizeDomain } = await import('../domain/index.js');
    const normalized = domains.map((d) => {
      try {
        return normalizeDomain(d);
      } catch {
        return null;
      }
    });

    // Using Result variant for others
    const results = domains.map(normalizeDomainResult);

    // normalizeDomain returns a NormalizedDomain object
    expect(normalized[0]).toEqual({
      original: 'example.com',
      unicode: 'example.com',
      punycode: 'example.com',
      normalized: 'example.com',
    });
    expect(results[0].isOk()).toBe(true);
    if (results[0].isOk()) {
      expect(results[0].value.normalized).toBe('example.com');
    }
  });

  it('should export all Result functions from package index', async () => {
    // These should all be accessible from the package
    const parsing = await import('../index.js');

    expect(parsing.normalizeDomainResult).toBeDefined();
    expect(parsing.parseDNSAnswerResult).toBeDefined();
    expect(parsing.parseTXTRecordResult).toBeDefined();
    expect(parsing.parseSPFResult).toBeDefined();
    expect(parsing.parseDMARCResult).toBeDefined();
    expect(parsing.DNSParseError).toBeDefined();
    expect(parsing.MailParseError).toBeDefined();
  });
});

// =============================================================================
// E2E Test Suite 6: Edge Cases and Bug Fixes
// =============================================================================

describe('E2E: Edge Cases and Bug Fixes', () => {
  it('should handle domain with trailing dot', () => {
    const result = normalizeDomainResult('example.com.');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.normalized).toBe('example.com');
    }
  });

  it('should handle uppercase domains', () => {
    const result = normalizeDomainResult('EXAMPLE.COM');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.normalized).toBe('example.com');
    }
  });

  it('should handle SPF with many includes', () => {
    const spf =
      'v=spf1 include:a.com include:b.com include:c.com include:d.com include:e.com include:f.com include:g.com include:h.com include:i.com include:j.com ~all';
    const result = parseSPFResult(spf);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.mechanisms.filter((m) => m.type === 'include')).toHaveLength(10);
    }
  });

  it('should handle DMARC with multiple report URIs', () => {
    const dmarc =
      'v=DMARC1; p=reject; rua=mailto:a@example.com,mailto:b@example.com,mailto:c@example.com';
    const result = parseDMARCResult(dmarc);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.rua).toHaveLength(3);
    }
  });

  it('should handle empty batch operations', () => {
    const { ok, err } = partitionDomainResults([]);

    expect(ok).toHaveLength(0);
    expect(err).toHaveLength(0);
  });

  it('should handle all-failing batch operations', () => {
    const domains = ['', '-bad', 'also..bad'];
    const { ok, err } = partitionDomainResults(domains);

    expect(ok).toHaveLength(0);
    expect(err).toHaveLength(3);
  });

  it('should handle mixed record types in parseAnyMailRecord', () => {
    // This tests that the order of checking doesn't cause false positives
    const testCases = [
      { input: 'v=spf1 ~all', expected: 'spf' },
      { input: 'v=DMARC1; p=none', expected: 'dmarc' },
      { input: 'v=DKIM1; k=rsa; p=KEY', expected: 'dkim' },
      { input: 'v=STSv1; id=2024', expected: 'mtasts' },
    ];

    for (const { input, expected } of testCases) {
      const detected = parseAnyMailRecord(input);
      expect(detected.type).toBe(expected);
    }
  });

  it('should handle very long TXT records', () => {
    const longString = 'a'.repeat(500);
    const txtData = `"${longString}"`;
    const result = parseTXTRecordResult(txtData);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.strings[0]).toBe(longString);
    }
  });

  it('should handle DNS records with special characters in data', () => {
    const record: DNSRecord = {
      name: 'example.com',
      type: 'TXT',
      ttl: 300,
      data: 'data with spaces and \\"quotes\\"',
    };

    const result = parseDNSAnswerResult(record);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.data).toBe('data with spaces and \\"quotes\\"');
    }
  });

  it('should handle consecutive error recoveries', () => {
    // Test that we can recover from errors and continue processing
    const domains = ['valid1.com', 'invalid..domain', 'valid2.com', '-bad', 'valid3.com'];

    const results = domains.map((domain) => {
      const result = normalizeDomainResult(domain);
      return Result.unwrapOr(
        Result.map(result, (d) => d.normalized),
        'RECOVERED'
      );
    });

    expect(results).toEqual(['valid1.com', 'RECOVERED', 'valid2.com', 'RECOVERED', 'valid3.com']);
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

function createMockObservation(
  overrides: Partial<Observation> & { queryName: string; queryType: string }
): Observation {
  const { queryName, queryType, ...rest } = overrides;
  return {
    id: `obs-${Math.random().toString(36).slice(2)}`,
    snapshotId: 'snapshot-1',
    queryName,
    queryType,
    vantageType: 'public-recursive',
    vantageIdentifier: '8.8.8.8',
    status: 'success',
    queriedAt: new Date(),
    responseTimeMs: 50,
    responseCode: 0,
    flags: null,
    answerSection: [],
    authoritySection: [],
    additionalSection: [],
    errorMessage: null,
    ...rest,
  } as Observation;
}
