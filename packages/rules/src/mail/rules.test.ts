/**
 * Mail Rules Tests - TDD/BDD for Bead 09
 *
 * Tests for mail rules:
 * 1. MX present/absent
 * 2. Null MX posture
 * 3. SPF exists/malformed/absent
 * 4. DMARC exists/policy posture
 * 5. DKIM key presence for discovered selectors
 * 6. MTA-STS TXT presence
 * 7. TLS-RPT TXT presence
 * 8. BIMI presence (info only)
 */

import type { Observation, RecordSet } from '@dns-ops/db';
import { describe, expect, it } from 'vitest';
import type { RuleContext } from '../engine/index.js';
import {
  bimiRule,
  dkimRule,
  dmarcRule,
  mailRules,
  mtaStsRule,
  mxPresenceRule,
  spfRule,
  tlsRptRule,
} from './rules.js';

// Test helpers
function createMockObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    snapshotId: 'snap-1',
    queryName: 'example.com',
    queryType: 'A',
    vantageType: 'public-recursive',
    vantageIdentifier: '8.8.8.8',
    status: 'success',
    queriedAt: new Date(),
    responseTimeMs: 100,
    responseCode: 0,
    flags: null,
    answerSection: [],
    authoritySection: [],
    additionalSection: [],
    errorMessage: null,
    errorDetails: null,
    rawResponse: null,
    vantageId: null,
    ...overrides,
  };
}

function createMockRecordSet(overrides: Partial<RecordSet> = {}): RecordSet {
  return {
    id: 'rs-1',
    snapshotId: 'snap-1',
    name: 'example.com',
    type: 'A',
    ttl: 300,
    values: ['192.0.2.1'],
    sourceObservationIds: ['obs-1'],
    sourceVantages: ['public-recursive'],
    isConsistent: true,
    consolidationNotes: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    snapshotId: 'snap-1',
    domainId: 'domain-1',
    domainName: 'example.com',
    zoneManagement: 'managed',
    observations: [],
    recordSets: [],
    rulesetVersion: '1.0.0',
    ...overrides,
  };
}

// =============================================================================
// MX Presence Rule Tests
// =============================================================================

describe('MX Presence Rule', () => {
  it('should detect MX record presence', () => {
    const mxObs = createMockObservation({
      queryType: 'MX',
      queryName: 'example.com',
      answerSection: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 mail.example.com.' }],
    });
    const rs = createMockRecordSet({
      type: 'MX',
      values: ['10 mail.example.com.'],
    });
    const context = createMockContext({
      observations: [mxObs],
      recordSets: [rs],
    });

    const result = mxPresenceRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.mx-present');
    expect(result?.finding?.severity).toBe('info');
  });

  it('should detect Null MX configuration', () => {
    const mxObs = createMockObservation({
      queryType: 'MX',
      queryName: 'example.com',
      answerSection: [{ name: 'example.com', type: 'MX', ttl: 300, data: '0 .' }],
    });
    const context = createMockContext({ observations: [mxObs] });

    const result = mxPresenceRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.null-mx-configured');
    expect(result?.finding?.severity).toBe('info');
    expect(result?.finding?.description).toContain('Null MX');
  });

  it('should detect missing MX record', () => {
    const mxObs = createMockObservation({
      queryType: 'MX',
      queryName: 'example.com',
      status: 'success',
      answerSection: [], // No MX records
    });
    const context = createMockContext({ observations: [mxObs] });

    const result = mxPresenceRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.no-mx-record');
    expect(result?.finding?.severity).toBe('medium');
    expect(result?.suggestions).toBeDefined();
    expect(result?.suggestions?.[0]?.title).toContain('Review MX');
  });

  it('should detect MX query failures', () => {
    const mxObs = createMockObservation({
      queryType: 'MX',
      queryName: 'example.com',
      status: 'timeout',
      errorMessage: 'Query timed out after 5s',
    });
    const context = createMockContext({ observations: [mxObs] });

    const result = mxPresenceRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.mx-query-failed');
    expect(result?.finding?.severity).toBe('medium');
    expect(result?.finding?.confidence).toBe('low');
  });

  it('should handle mixed success/failure for MX', () => {
    const successObs = createMockObservation({
      id: 'obs-1',
      queryType: 'MX',
      queryName: 'example.com',
      status: 'success',
      vantageType: 'public-recursive',
      answerSection: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 mail.example.com.' }],
    });
    const timeoutObs = createMockObservation({
      id: 'obs-2',
      queryType: 'MX',
      queryName: 'example.com',
      status: 'timeout',
      vantageType: 'authoritative',
    });
    const rs = createMockRecordSet({ type: 'MX', values: ['10 mail.example.com.'] });
    const context = createMockContext({
      observations: [successObs, timeoutObs],
      recordSets: [rs],
    });

    const result = mxPresenceRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.mx-present');
  });
});

// =============================================================================
// SPF Rule Tests
// =============================================================================

describe('SPF Rule', () => {
  it('should detect valid SPF record', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'example.com',
      answerSection: [
        { name: 'example.com', type: 'TXT', ttl: 300, data: 'v=spf1 include:_spf.google.com ~all' },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = spfRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.spf-present');
    // SPF present is informational - severity may be 'info' or 'medium' depending on direct policy.
    expect(['info', 'medium']).toContain(result?.finding?.severity);
    expect(result?.finding?.description).toContain('FIRST_LEVEL_ONLY');
    expect(result?.finding?.description).toContain('completeEvaluation=false');
    expect(result?.finding?.description).toContain('were not evaluated');
  });

  it('should detect missing SPF record', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'example.com',
      answerSection: [
        { name: 'example.com', type: 'TXT', ttl: 300, data: 'some other txt record' },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = spfRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.no-spf-record');
    expect(result?.finding?.severity).toBe('high');
    expect(result?.suggestions).toBeDefined();
  });

  it('should preserve NODATA evidence for a missing SPF finding', () => {
    const txtObs = createMockObservation({
      id: 'obs-spf-nodata',
      queryType: 'TXT',
      queryName: 'example.com',
      status: 'nodata',
      answerSection: [],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = spfRule.evaluate(context);

    expect(result?.finding?.type).toBe('mail.no-spf-record');
    expect(result?.finding?.evidence).toEqual([
      expect.objectContaining({ observationId: 'obs-spf-nodata' }),
    ]);
  });

  it('should detect SPF with softfail (~all)', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'example.com',
      answerSection: [
        { name: 'example.com', type: 'TXT', ttl: 300, data: 'v=spf1 include:_spf.google.com ~all' },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = spfRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.spf-present');
    expect(result?.finding?.severity).toBe('medium'); // Medium due to ~all
    expect(result?.finding?.description).toContain('~all');
  });

  it('should detect dangerous +all configuration', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'example.com',
      answerSection: [{ name: 'example.com', type: 'TXT', ttl: 300, data: 'v=spf1 +all' }],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = spfRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.spf-present');
    expect(result?.finding?.severity).toBe('critical'); // Critical due to +all
    expect(result?.finding?.description).toContain('DANGEROUS');
  });

  it('should detect malformed SPF record', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'example.com',
      answerSection: [
        {
          name: 'example.com',
          type: 'TXT',
          ttl: 300,
          data: 'v=spf1 invalid-mechanism-without-prefix',
        },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = spfRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.spf-malformed');
  });

  it('should detect SPF query failures', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'example.com',
      status: 'timeout',
      errorMessage: 'Query timed out after 5s',
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = spfRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.spf-query-failed');
    expect(result?.finding?.severity).toBe('medium');
    expect(result?.finding?.confidence).toBe('low');
  });
});

// =============================================================================
// DMARC Rule Tests
// =============================================================================

describe('DMARC Rule', () => {
  it('should detect valid DMARC with p=reject', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_dmarc.example.com',
      answerSection: [
        {
          name: '_dmarc.example.com',
          type: 'TXT',
          ttl: 300,
          data: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com',
        },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = dmarcRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.dmarc-present');
    expect(result?.finding?.severity).toBe('info');
    expect(result?.finding?.description).toContain('reject');
  });

  it('should detect DMARC with p=none (monitoring only)', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_dmarc.example.com',
      answerSection: [
        {
          name: '_dmarc.example.com',
          type: 'TXT',
          ttl: 300,
          data: 'v=DMARC1; p=none; rua=mailto:dmarc@example.com',
        },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = dmarcRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.dmarc-present');
    expect(result?.finding?.severity).toBe('medium'); // Medium due to p=none
    expect(result?.suggestions).toBeDefined();
    expect(result?.suggestions?.[0]?.title).toContain('Strengthen');
  });

  it('should detect missing DMARC record', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_dmarc.example.com',
      status: 'nodata',
      answerSection: [],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = dmarcRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.no-dmarc-record');
    expect(result?.finding?.severity).toBe('high');
  });

  it('should preserve NODATA evidence for a missing DMARC finding', () => {
    const txtObs = createMockObservation({
      id: 'obs-dmarc-nodata',
      queryType: 'TXT',
      queryName: '_dmarc.example.com',
      status: 'nodata',
      answerSection: [],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = dmarcRule.evaluate(context);

    expect(result?.finding?.type).toBe('mail.no-dmarc-record');
    expect(result?.finding?.evidence).toEqual([
      expect.objectContaining({ observationId: 'obs-dmarc-nodata' }),
    ]);
  });

  it('should detect malformed DMARC record', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_dmarc.example.com',
      answerSection: [
        { name: '_dmarc.example.com', type: 'TXT', ttl: 300, data: 'v=DMARC1; invalid-tag' },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = dmarcRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.dmarc-malformed');
    expect(result?.finding?.severity).toBe('critical');
  });

  it('should note missing rua in DMARC', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_dmarc.example.com',
      answerSection: [
        { name: '_dmarc.example.com', type: 'TXT', ttl: 300, data: 'v=DMARC1; p=quarantine' },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = dmarcRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.description).toContain('No aggregate report');
  });

  it('should detect partial deployment via pct tag', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_dmarc.example.com',
      answerSection: [
        {
          name: '_dmarc.example.com',
          type: 'TXT',
          ttl: 300,
          data: 'v=DMARC1; p=quarantine; pct=50',
        },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = dmarcRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.description).toContain('50%');
  });
});

// =============================================================================
// DKIM Rule Tests
// =============================================================================

describe('DKIM Rule', () => {
  it('should detect valid DKIM keys', () => {
    const dkimObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'google._domainkey.example.com',
      answerSection: [
        {
          name: 'google._domainkey.example.com',
          type: 'TXT',
          ttl: 300,
          data: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1TaNgLlSyQMNWVLNLvyY/neDgaL2oqQE8T5illKqCgDtFHc8eHVAU+nlcaGmrKmDMw9dbgiGk1ocgZ56NR4ycfUHwQhvQPMUZw0cveel/8EAGoi/UyPmqfcPibytH81NFtTMAxUeM4Op8A6iHkvAMj5qLf4YRNsTkKAKW3OkwPQIDAQAB',
        },
      ],
    });
    const context = createMockContext({ observations: [dkimObs] });

    const result = dkimRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.dkim-keys-present');
    expect(result?.finding?.severity).toBe('info');
  });

  it('should handle no DKIM selectors queried', () => {
    const context = createMockContext({ observations: [] });

    const result = dkimRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.no-dkim-queried');
    expect(result?.finding?.severity).toBe('medium');
    expect(result?.finding?.confidence).toBe('heuristic');
  });

  it('should detect no valid DKIM keys', () => {
    const dkimObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'selector1._domainkey.example.com',
      status: 'nxdomain',
    });
    const dkimObs2 = createMockObservation({
      id: 'obs-2',
      queryType: 'TXT',
      queryName: 'selector2._domainkey.example.com',
      status: 'nxdomain',
    });
    const context = createMockContext({ observations: [dkimObs, dkimObs2] });

    const result = dkimRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.dkim-no-valid-keys');
    expect(result?.finding?.severity).toBe('high');
  });

  it('should handle DKIM query failures', () => {
    const dkimObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'google._domainkey.example.com',
      status: 'timeout',
    });
    const context = createMockContext({ observations: [dkimObs] });

    const result = dkimRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.dkim-no-valid-keys');
  });

  it('should reject DKIM records missing key data', () => {
    const dkimObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'bad._domainkey.example.com',
      answerSection: [
        { name: 'bad._domainkey.example.com', type: 'TXT', ttl: 300, data: 'v=DKIM1' },
      ], // Missing k= and p=
    });
    const context = createMockContext({ observations: [dkimObs] });

    const result = dkimRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.dkim-no-valid-keys');
  });

  it('should reject DKIM records missing version tag', () => {
    const dkimObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'bad._domainkey.example.com',
      answerSection: [
        { name: 'bad._domainkey.example.com', type: 'TXT', ttl: 300, data: 'k=rsa; p=ABCD1234' },
      ], // Missing v=DKIM1
    });
    const context = createMockContext({ observations: [dkimObs] });

    const result = dkimRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.dkim-no-valid-keys');
  });
});

// =============================================================================
// MTA-STS Rule Tests
// =============================================================================

describe('MTA-STS Rule', () => {
  it('should detect MTA-STS configuration', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_mta-sts.example.com',
      answerSection: [
        { name: '_mta-sts.example.com', type: 'TXT', ttl: 300, data: 'v=STSv1; id=20240101' },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = mtaStsRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.mta-sts-present');
    expect(result?.finding?.severity).toBe('info');
  });

  it('should suggest MTA-STS when missing', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_mta-sts.example.com',
      status: 'nodata',
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = mtaStsRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.no-mta-sts');
    expect(result?.finding?.severity).toBe('low');
    expect(result?.suggestions).toBeDefined();
  });
});

// =============================================================================
// TLS-RPT Rule Tests
// =============================================================================

describe('TLS-RPT Rule', () => {
  it('should detect TLS-RPT configuration', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_smtp._tls.example.com',
      answerSection: [
        {
          name: '_smtp._tls.example.com',
          type: 'TXT',
          ttl: 300,
          data: 'v=TLSRPTv1; rua=mailto:tls-rpt@example.com',
        },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = tlsRptRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.tls-rpt-present');
    expect(result?.finding?.severity).toBe('info');
  });

  it('should suggest TLS-RPT when missing', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: '_smtp._tls.example.com',
      status: 'nodata',
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = tlsRptRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.no-tls-rpt');
    expect(result?.suggestions).toBeDefined();
  });
});

// =============================================================================
// BIMI Rule Tests
// =============================================================================

describe('BIMI Rule', () => {
  it('should detect BIMI configuration (info only)', () => {
    const txtObs = createMockObservation({
      queryType: 'TXT',
      queryName: 'default._bimi.example.com',
      answerSection: [
        {
          name: 'default._bimi.example.com',
          type: 'TXT',
          ttl: 300,
          data: 'v=BIMI1; l=https://example.com/logo.svg',
        },
      ],
    });
    const context = createMockContext({ observations: [txtObs] });

    const result = bimiRule.evaluate(context);

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('mail.bimi-present');
    expect(result?.finding?.severity).toBe('info');
  });

  it('should not report missing BIMI (info only)', () => {
    const context = createMockContext({ observations: [] });

    const result = bimiRule.evaluate(context);

    expect(result).toBeNull();
  });
});

// =============================================================================
// All Mail Rules Export Tests
// =============================================================================

describe('Mail Rules Export', () => {
  it('should export all 7 mail rules', () => {
    expect(mailRules).toHaveLength(7);
    expect(mailRules.map((r) => r.id)).toContain('mail.mx-presence.v1');
    expect(mailRules.map((r) => r.id)).toContain('mail.spf-analysis.v1');
    expect(mailRules.map((r) => r.id)).toContain('mail.dmarc-analysis.v1');
    expect(mailRules.map((r) => r.id)).toContain('mail.dkim-presence.v1');
    expect(mailRules.map((r) => r.id)).toContain('mail.mta-sts-presence.v1');
    expect(mailRules.map((r) => r.id)).toContain('mail.tls-rpt-presence.v1');
    expect(mailRules.map((r) => r.id)).toContain('mail.bimi-presence.v1');
  });

  it('should have unique rule IDs', () => {
    const ids = mailRules.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have all rules enabled', () => {
    expect(mailRules.every((r) => r.enabled)).toBe(true);
  });
});
