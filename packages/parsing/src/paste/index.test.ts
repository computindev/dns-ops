import { describe, expect, it } from 'vitest';
import {
  authResultsToFindings,
  detectPasteKind,
  parseBounceHeaders,
  parseDigOutput,
} from './index.js';

const DIG_MX_TXT = `; <<>> DiG 9.18.1 <<>> example.com MX
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

;; ANSWER SECTION:
example.com.		300	IN	MX	10 mail.example.com.
example.com.		3600	IN	TXT	"v=spf1 -all"

;; Query time: 20 msec
;; MSG SIZE  rcvd: 65`;

const BOUNCE = `Received: from mail-out.example.net (mail-out.example.net. [203.0.113.9]) by mx.example.org with SMTP id 123
Authentication-Results: mx.example.org; spf=pass smtp.mailfrom=user@example.com; dkim=pass header.d=example.com; dmarc=none header.from=example.com
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=sel1;
Subject: Delivery Status Notification`;

describe('detectPasteKind', () => {
  it('detects dig output by header, sections, and bare record lines', () => {
    expect(detectPasteKind(DIG_MX_TXT)).toBe('dig');
    expect(detectPasteKind('example.com. 300 IN A 93.184.216.34')).toBe('dig');
    expect(detectPasteKind(';; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN')).toBe('dig');
  });

  it('detects RFC5322 header blocks and unknown text', () => {
    expect(detectPasteKind(BOUNCE)).toBe('bounce-header');
    expect(detectPasteKind('Received: from mx.example.org by mx2 with ESMTPS')).toBe(
      'bounce-header'
    );
    expect(detectPasteKind('')).toBe('unknown');
    expect(detectPasteKind('random prose without structure')).toBe('unknown');
  });
});

describe('parseDigOutput', () => {
  it('builds one observation and record set per name/type with TXT quotes stripped', () => {
    const { observations, recordSets, parse } = parseDigOutput(DIG_MX_TXT);

    expect(parse.rcode).toBe('NOERROR');
    expect(parse.flags).toEqual({ qr: true, rd: true, ra: true });
    expect(parse.queryName).toBe('example.com');
    expect(parse.queryType).toBe('MX');
    expect(parse.recordCount).toBe(2);

    expect(observations).toHaveLength(2);
    const mx = observations.find((o) => o.queryType === 'MX');
    expect(mx?.queryName).toBe('example.com');
    expect(mx?.status).toBe('success');
    expect(mx?.vantageType).toBe('public-recursive');
    expect(mx?.vantageIdentifier).toBe('pasted');
    expect(mx?.answerSection).toEqual([
      { name: 'example.com', type: 'MX', ttl: 300, data: '10 mail.example.com.' },
    ]);

    const txtRecordSet = recordSets.find((rs) => rs.type === 'TXT');
    expect(txtRecordSet?.values).toEqual(['v=spf1 -all']);
    expect(txtRecordSet?.isConsistent).toBe(true);
  });

  it('maps rcode to status and skips record sets on failure', () => {
    const nxdomain = parseDigOutput(
      ';; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN\n;; flags: qr rd ra;'
    );
    expect(nxdomain.observations).toHaveLength(0);
    expect(nxdomain.recordSets).toHaveLength(0);
    expect(nxdomain.parse.rcode).toBe('NXDOMAIN');
  });

  it('ignores non-record lines and unknown types', () => {
    const result = parseDigOutput(
      'example.com. 300 IN MX 10 mail.example.com.\nexample.com. 300 IN BOGUS x\n;; Query time: 1 msec\nNote this line'
    );
    expect(result.parse.recordCount).toBe(1);
    expect(result.observations).toHaveLength(1);
  });
});

describe('parseBounceHeaders', () => {
  it('extracts header block, authentication results, and received hosts', () => {
    const parsed = parseBounceHeaders(BOUNCE);
    expect(Object.keys(parsed.headers)).toContain('dkim-signature');
    expect(parsed.receivedHosts).toEqual(['mail-out.example.net']);
    expect(parsed.authResults).toEqual([
      { method: 'spf', result: 'pass', domain: 'example.com' },
      { method: 'dkim', result: 'pass', domain: 'example.com' },
      { method: 'dmarc', result: 'none', domain: 'example.com' },
    ]);
  });

  it('stops at the body and handles continuation lines', () => {
    const parsed = parseBounceHeaders(
      'Authentication-Results: mx.test;\n\tspf=fail smtp.mailfrom=other.example;\n\nBody line: not a header'
    );
    expect(parsed.headers['authentication-results']).toContain('spf=fail');
    expect(parsed.authResults).toEqual([
      { method: 'spf', result: 'fail', domain: 'other.example' },
    ]);
  });
});

describe('authResultsToFindings', () => {
  it('maps provable pass/none results to snapshot finding types', () => {
    const findings = authResultsToFindings([
      { method: 'spf', result: 'pass', domain: 'example.com' },
      { method: 'spf', result: 'none', domain: 'example.com' },
      { method: 'dmarc', result: 'none', domain: 'example.com' },
      { method: 'dmarc', result: 'pass', domain: 'example.com' },
      { method: 'dkim', result: 'pass', domain: 'example.com' },
    ]);

    expect(findings.map((f) => f.type)).toEqual([
      'mail.spf-present',
      'mail.no-spf-record',
      'mail.no-dmarc-record',
      'mail.dmarc-present',
      'mail.dkim-keys-present',
    ]);
    expect(findings[0].ruleId).toBe('paste.auth-results.v1');
    expect(findings.find((f) => f.type === 'mail.no-spf-record')?.severity).toBe('high');
    for (const finding of findings) {
      expect(JSON.stringify(finding.evidence)).toContain('pasted evidence');
    }
  });

  it('never maps per-message failures to configuration findings', () => {
    const findings = authResultsToFindings([
      { method: 'spf', result: 'fail', domain: 'example.com' },
      { method: 'spf', result: 'softfail', domain: 'example.com' },
      { method: 'dkim', result: 'none', domain: 'example.com' },
      { method: 'dmarc', result: 'temperror', domain: 'example.com' },
    ]);
    expect(findings).toEqual([]);
  });
});
