import { Result } from '@dns-ops/contracts';
import { describe, expect, it } from 'vitest';
import {
  isMailParseError,
  MailParseError,
  parseAnyMailRecord,
  parseDKIMResult,
  parseDMARCResult,
  parseMailRecordsResult,
  parseMTASTSResult,
  parseSPFResult,
  partitionMailResults,
} from './result.js';

describe('Mail Record Result Utilities', () => {
  describe('parseSPFResult', () => {
    it('should return Ok for valid SPF record', () => {
      const result = parseSPFResult('v=spf1 include:_spf.google.com ~all');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.version).toBe('spf1');
        expect(result.value.mechanisms).toHaveLength(2);
        expect(result.value.mechanisms[0]?.type).toBe('include');
        expect(result.value.mechanisms[0]?.value).toBe('_spf.google.com');
        expect(result.value.mechanisms[1]?.type).toBe('all');
        expect(result.value.mechanisms[1]?.prefixName).toBe('softfail');
        expect(result.value.raw).toBe('v=spf1 include:_spf.google.com ~all');
      }
    });

    it('should parse SPF with multiple mechanisms', () => {
      const result = parseSPFResult('v=spf1 mx a:mail.example.com -all');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.mechanisms).toHaveLength(3);
        expect(result.value.mechanisms[0]?.type).toBe('mx');
        expect(result.value.mechanisms[1]?.type).toBe('a');
        expect(result.value.mechanisms[1]?.value).toBe('mail.example.com');
        expect(result.value.mechanisms[2]?.type).toBe('all');
        expect(result.value.mechanisms[2]?.prefix).toBe('-');
      }
    });

    it('should parse SPF with modifiers', () => {
      const result = parseSPFResult('v=spf1 ~all redirect=_spf.google.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.modifiers).toHaveLength(1);
        expect(result.value.modifiers[0]?.name).toBe('redirect');
        expect(result.value.modifiers[0]?.value).toBe('_spf.google.com');
      }
    });

    it('should handle different prefixes', () => {
      const result = parseSPFResult('v=spf1 +a -mx ~ptr ?include:test.com -all');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.mechanisms[0]?.prefix).toBe('+');
        expect(result.value.mechanisms[0]?.prefixName).toBe('pass');
        expect(result.value.mechanisms[1]?.prefix).toBe('-');
        expect(result.value.mechanisms[1]?.prefixName).toBe('fail');
        expect(result.value.mechanisms[2]?.prefix).toBe('~');
        expect(result.value.mechanisms[2]?.prefixName).toBe('softfail');
        expect(result.value.mechanisms[3]?.prefix).toBe('?');
        expect(result.value.mechanisms[3]?.prefixName).toBe('neutral');
      }
    });

    it('should return Err for non-SPF record', () => {
      const result = parseSPFResult('some random text');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(MailParseError);
        expect(result.error.code).toBe('NOT_SPF_RECORD');
        expect(result.error.message).toContain('v=spf1');
      }
    });

    it('should return Err for empty string', () => {
      const result = parseSPFResult('');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_SPF_RECORD');
      }
    });

    it('should support pattern matching with Result.match', () => {
      const result = parseSPFResult('v=spf1 -all');

      const message = Result.match(result, {
        ok: (r) => `SPF version: ${r.version}`,
        err: (e) => `Error: ${e.code}`,
      });

      expect(message).toBe('SPF version: spf1');
    });
  });

  describe('parseDMARCResult', () => {
    it('should return Ok for valid DMARC record', () => {
      const result = parseDMARCResult('v=DMARC1; p=reject');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.version).toBe('DMARC1');
        expect(result.value.policy).toBe('reject');
        expect(result.value.raw).toBe('v=DMARC1; p=reject');
      }
    });

    it('should parse DMARC with all optional fields', () => {
      const result = parseDMARCResult(
        'v=DMARC1; p=quarantine; sp=none; pct=50; rua=mailto:dmarc@example.com,mailto:aggregate@other.com; ruf=mailto:forensic@example.com; fo=1:d:s; adkim=r; aspf=s; rf=afrf; ri=86400'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.policy).toBe('quarantine');
        expect(result.value.subdomainPolicy).toBe('none');
        expect(result.value.percentage).toBe(50);
        expect(result.value.rua).toEqual([
          'mailto:dmarc@example.com',
          'mailto:aggregate@other.com',
        ]);
        expect(result.value.ruf).toEqual(['mailto:forensic@example.com']);
        expect(result.value.fo).toBe('1:d:s');
        expect(result.value.adkim).toBe('r');
        expect(result.value.aspf).toBe('s');
        expect(result.value.rf).toBe('afrf');
        expect(result.value.ri).toBe(86400);
      }
    });

    it('should parse DMARC with none policy', () => {
      const result = parseDMARCResult('v=DMARC1; p=none; rua=mailto:reports@example.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.policy).toBe('none');
        expect(result.value.rua).toEqual(['mailto:reports@example.com']);
      }
    });

    it('should return Err for non-DMARC record', () => {
      const result = parseDMARCResult('v=spf1 -all');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(MailParseError);
        expect(result.error.code).toBe('NOT_DMARC_RECORD');
        expect(result.error.message).toContain('v=DMARC1');
      }
    });

    it('applies RFC 9989 p=none fallback when p is missing and rua is valid', () => {
      const result = parseDMARCResult('v=DMARC1; rua=mailto:test@example.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.policy).toBe('none');
    });

    it('should support error pattern matching', () => {
      const result = parseDMARCResult('invalid');

      const message = Result.match(result, {
        ok: (r) => `Policy: ${r.policy}`,
        err: (e) => `Error: ${e.code}`,
      });

      expect(message).toBe('Error: NOT_DMARC_RECORD');
    });
  });

  describe('parseDKIMResult', () => {
    it('should return Ok for valid DKIM record', () => {
      const result = parseDKIMResult('v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.version).toBe('DKIM1');
        expect(result.value.keyType).toBe('rsa');
        expect(result.value.publicKey).toBe('MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC');
        expect(result.value.raw).toBe('v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC');
      }
    });

    it('should parse DKIM with service type and flags', () => {
      const result = parseDKIMResult('v=DKIM1; k=rsa; p=KEY123; s=email; t=s:y; n=notes here');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.serviceType).toEqual(['email']);
        expect(result.value.flags).toEqual(['s', 'y']);
        expect(result.value.notes).toBe('notes here');
      }
    });

    it('should parse DKIM with multiple service types', () => {
      const result = parseDKIMResult('k=rsa; p=KEY; s=email:other');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.serviceType).toEqual(['email', 'other']);
      }
    });

    it('should default keyType to rsa', () => {
      const result = parseDKIMResult('p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.keyType).toBe('rsa');
      }
    });

    it('should return Err for DKIM missing public key', () => {
      const result = parseDKIMResult('v=DKIM1; k=rsa');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(MailParseError);
        expect(result.error.code).toBe('MISSING_REQUIRED_FIELD');
        expect(result.error.details?.field).toBe('p');
      }
    });

    it('should return Err for empty DKIM record', () => {
      const result = parseDKIMResult('');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('MISSING_REQUIRED_FIELD');
      }
    });
  });

  describe('parseMTASTSResult', () => {
    it('should return Ok for valid MTA-STS record', () => {
      const result = parseMTASTSResult('v=STSv1; id=20240101');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.version).toBe('STSv1');
        expect(result.value.raw).toBe('v=STSv1; id=20240101');
      }
    });

    it('should return Err for non-MTA-STS record', () => {
      const result = parseMTASTSResult('v=spf1 -all');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(MailParseError);
        expect(result.error.code).toBe('NOT_MTASTS_RECORD');
        expect(result.error.message).toContain('v=STSv1');
      }
    });

    it('should handle MTA-STS without id', () => {
      const result = parseMTASTSResult('v=STSv1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.version).toBe('STSv1');
      }
    });
  });

  describe('parseMailRecordsResult (batch)', () => {
    it('should process multiple SPF records', () => {
      const records = ['v=spf1 include:_spf.google.com ~all', 'v=spf1 -all', 'v=spf1 mx a ~all'];
      const results = parseMailRecordsResult(records, parseSPFResult);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.isOk())).toBe(true);
    });

    it('should handle mixed valid and invalid records', () => {
      const records = ['v=spf1 -all', 'not an spf record', 'v=spf1 mx ~all'];
      const results = parseMailRecordsResult(records, parseSPFResult);

      expect(results[0].isOk()).toBe(true);
      expect(results[1].isErr()).toBe(true);
      expect(results[2].isOk()).toBe(true);
    });

    it('should batch process DMARC records', () => {
      const records = [
        'v=DMARC1; p=none',
        'v=DMARC1; p=reject; rua=mailto:a@b.com',
        'v=DMARC1; p=quarantine; pct=25',
      ];
      const results = parseMailRecordsResult(records, parseDMARCResult);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.isOk())).toBe(true);
    });
  });

  describe('partitionMailResults', () => {
    it('should separate successes and failures', () => {
      const records = ['v=spf1 -all', 'invalid', 'v=spf1 mx ~all', 'also invalid'];
      const { ok, err } = partitionMailResults(records, parseSPFResult);

      expect(ok).toHaveLength(2);
      expect(err).toHaveLength(2);

      expect(ok[0]?.mechanisms).toBeDefined();
      expect(err[0]?.code).toBe('NOT_SPF_RECORD');
    });

    it('should handle all successes', () => {
      const records = ['v=spf1 -all', 'v=spf1 ~all', 'v=spf1 +all'];
      const { ok, err } = partitionMailResults(records, parseSPFResult);

      expect(ok).toHaveLength(3);
      expect(err).toHaveLength(0);
    });

    it('should handle all failures', () => {
      const records = ['invalid1', 'invalid2', 'invalid3'];
      const { ok, err } = partitionMailResults(records, parseSPFResult);

      expect(ok).toHaveLength(0);
      expect(err).toHaveLength(3);
    });

    it('should work with DMARC parser', () => {
      const records = [
        'v=DMARC1; p=reject',
        'v=spf1 -all', // wrong type
        'v=DMARC1; p=none',
      ];
      const { ok, err } = partitionMailResults(records, parseDMARCResult);

      expect(ok).toHaveLength(2);
      expect(err).toHaveLength(1);
    });
  });

  describe('parseAnyMailRecord', () => {
    it('should detect SPF record', () => {
      const detected = parseAnyMailRecord('v=spf1 -all');

      expect(detected.type).toBe('spf');
      expect(detected.result?.isOk()).toBe(true);
    });

    it('should detect only exact DMARC1 records including RFC whitespace', () => {
      expect(parseAnyMailRecord('v=DMARC1; p=reject').type).toBe('dmarc');
      expect(parseAnyMailRecord('v = DMARC1 ; p=none').type).toBe('dmarc');
      expect(parseAnyMailRecord('v=DMARC10; p=reject').type).toBe('unknown');
    });

    it('should detect DKIM record', () => {
      const detected = parseAnyMailRecord('v=DKIM1; k=rsa; p=KEY123');

      expect(detected.type).toBe('dkim');
      expect(detected.result?.isOk()).toBe(true);
    });

    it('should detect MTA-STS record', () => {
      const detected = parseAnyMailRecord('v=STSv1; id=20240101');

      expect(detected.type).toBe('mtasts');
      expect(detected.result?.isOk()).toBe(true);
    });

    it('should return unknown for unrecognized records', () => {
      const detected = parseAnyMailRecord('some random text');

      expect(detected.type).toBe('unknown');
      expect(detected.result).toBeNull();
    });

    it('should prefer SPF over other types when multiple patterns present', () => {
      // This is an edge case - SPF is checked first
      // The SPF parser successfully parses this as it contains 'v=spf1'
      const detected = parseAnyMailRecord('v=spf1 v=DMARC1; p=reject');

      // SPF parser accepts the string (extra tokens are treated as modifiers)
      expect(detected.type).toBe('spf');
      expect(detected.result?.isOk()).toBe(true);
    });
  });

  describe('MailParseError', () => {
    it('should have correct error structure', () => {
      const error = new MailParseError({
        message: 'Test error',
        code: 'NOT_SPF_RECORD',
        input: 'test input',
        field: 'testField',
      });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('NOT_SPF_RECORD');
      expect(error.details?.input).toBe('test input');
      expect(error.details?.field).toBe('testField');
      expect(error._tag).toBe('ParseError');
    });

    it('should include details in error object', () => {
      const error = new MailParseError({
        message: 'Missing field',
        code: 'MISSING_REQUIRED_FIELD',
        input: 'v=DMARC1',
        field: 'p',
      });

      expect(error.details?.code).toBe('MISSING_REQUIRED_FIELD');
      expect(error.details?.field).toBe('p');
    });
  });

  describe('isMailParseError', () => {
    it('should return true for MailParseError', () => {
      const error = new MailParseError({
        message: 'Test',
        code: 'INVALID_FORMAT',
      });

      expect(isMailParseError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      expect(isMailParseError(new Error('test'))).toBe(false);
    });

    it('should return false for null', () => {
      expect(isMailParseError(null)).toBe(false);
    });

    it('should return false for plain object', () => {
      expect(isMailParseError({ message: 'test' })).toBe(false);
    });
  });

  describe('Real-world record examples', () => {
    it('should parse Google Workspace SPF', () => {
      const result = parseSPFResult(
        'v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const includes = result.value.mechanisms
          .filter((m) => m.type === 'include')
          .map((m) => m.value);
        expect(includes).toContain('_spf.google.com');
        expect(includes).toContain('spf.protection.outlook.com');
      }
    });

    it('should parse strict DMARC policy', () => {
      const result = parseDMARCResult(
        'v=DMARC1; p=reject; rua=mailto:dmarc@example.com; pct=100; adkim=s; aspf=s'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.policy).toBe('reject');
        expect(result.value.percentage).toBe(100);
        expect(result.value.adkim).toBe('s');
        expect(result.value.aspf).toBe('s');
      }
    });

    it('should parse relaxed DMARC for monitoring', () => {
      const result = parseDMARCResult(
        'v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com; ruf=mailto:dmarc-failures@example.com; fo=1'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.policy).toBe('none');
        expect(result.value.rua).toContain('mailto:dmarc-reports@example.com');
        expect(result.value.ruf).toContain('mailto:dmarc-failures@example.com');
      }
    });
  });
});
