/**
 * RecordSet Normalization Tests
 *
 * Tests for:
 * - Grouping observations by name/type
 * - Value extraction and deduplication
 * - Consistency detection across vantages
 * - TTL averaging
 * - Failure handling
 * - MX priority handling
 * - Record type formatting
 */

import type { Observation } from '@dns-ops/db/schema';
import { describe, expect, it } from 'vitest';
import {
  formatRecordValue,
  getRecordTypeDescription,
  groupRecordsByType,
  observationsToRecordSets,
} from './recordset.js';

// Helper to create mock observation
function createObservation(
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

describe('observationsToRecordSets', () => {
  describe('Basic Normalization', () => {
    it('should normalize a single successful observation', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'example.com',
        type: 'A',
        values: ['192.0.2.1'],
        isConsistent: true,
      });
    });

    it('should group multiple observations by name and type', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '8.8.8.8',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '1.1.1.1',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'AAAA',
          answerSection: [{ name: 'example.com', type: 'AAAA', ttl: 300, data: '2001:db8::1' }],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.type === 'A')?.sourceVantages).toContain('8.8.8.8');
      expect(result.find((r) => r.type === 'A')?.sourceVantages).toContain('1.1.1.1');
      expect(result.find((r) => r.type === 'AAAA')?.values).toEqual(['2001:db8::1']);
    });

    it('should deduplicate values', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '8.8.8.8',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '1.1.1.1',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result).toHaveLength(1);
      expect(result[0].values).toEqual(['192.0.2.1']);
    });

    it('should normalize query names to lowercase', () => {
      const observations = [
        createObservation({
          queryName: 'EXAMPLE.COM',
          queryType: 'A',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].name).toBe('example.com');
    });
  });

  describe('Consistency Detection', () => {
    it('should mark consistent when all vantages agree', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '8.8.8.8',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '1.1.1.1',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].isConsistent).toBe(true);
    });

    it('should mark inconsistent when vantages disagree', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '8.8.8.8',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '1.1.1.1',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.99' }],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].isConsistent).toBe(false);
      expect(result[0].consolidationNotes).toContain('Values differ across vantages');
    });

    it('should consider order-independent value equality', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '8.8.8.8',
          answerSection: [
            { name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' },
            { name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.2' },
          ],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '1.1.1.1',
          answerSection: [
            { name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.2' },
            { name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' },
          ],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].isConsistent).toBe(true);
    });
  });

  describe('Failure Handling', () => {
    it('should handle failed observations without contributing values', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '8.8.8.8',
          status: 'success',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '1.1.1.1',
          status: 'timeout',
          answerSection: [],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].values).toEqual(['192.0.2.1']);
      expect(result[0].isConsistent).toBe(false);
      expect(result[0].consolidationNotes).toContain('Failures from 1 vantage(s)');
    });

    it('should handle all-failed observations', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          status: 'timeout',
          answerSection: [],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          status: 'nxdomain',
          answerSection: [],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].values).toEqual([]);
      expect(result[0].isConsistent).toBe(false);
      expect(result[0].consolidationNotes).toContain('timeout');
    });
  });

  describe('TTL Handling', () => {
    it('should calculate average TTL', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '8.8.8.8',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        }),
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          vantageIdentifier: '1.1.1.1',
          answerSection: [{ name: 'example.com', type: 'A', ttl: 600, data: '192.0.2.1' }],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].ttl).toBe(450); // (300 + 600) / 2
    });

    it('should return 0 TTL when no successful observations', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'A',
          status: 'timeout',
          answerSection: [],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].ttl).toBe(0);
    });
  });

  describe('MX Priority Handling', () => {
    it('should include MX priority in values', () => {
      const observations = [
        createObservation({
          queryName: 'example.com',
          queryType: 'MX',
          answerSection: [
            { name: 'example.com', type: 'MX', ttl: 300, data: 'mail.example.com', priority: 10 },
            { name: 'example.com', type: 'MX', ttl: 300, data: 'backup.example.com', priority: 20 },
          ],
        }),
      ];

      const result = observationsToRecordSets(observations);

      expect(result[0].values).toContain('10 mail.example.com');
      expect(result[0].values).toContain('20 backup.example.com');
    });
  });

  describe('Source Tracking', () => {
    it('should track source observation IDs', () => {
      const obs1 = createObservation({
        queryName: 'example.com',
        queryType: 'A',
        answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
      });
      const obs2 = createObservation({
        queryName: 'example.com',
        queryType: 'A',
        answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
      });

      const result = observationsToRecordSets([obs1, obs2]);

      expect(result[0].sourceObservationIds).toContain(obs1.id);
      expect(result[0].sourceObservationIds).toContain(obs2.id);
    });
  });
});

describe('CNAME owner and target normalization', () => {
  it('canonicalizes valid CNAME targets while retaining malformed observations', () => {
    const observation = createObservation({
      queryName: '_MTA-STS.Example.NET.',
      queryType: 'CNAME',
      answerSection: [
        {
          name: '_mta-sts.example.net.',
          type: 'CNAME',
          ttl: 300,
          data: '_Policy._MTA-STS.Example.NET.',
        },
        {
          name: '_mta-sts.example.net.',
          type: 'CNAME',
          ttl: 300,
          data: 'not a valid target',
        },
        {
          name: 'unrelated.example.net.',
          type: 'CNAME',
          ttl: 300,
          data: 'ignored.example.net.',
        },
      ],
    });

    expect(observationsToRecordSets([observation])).toMatchObject([
      {
        name: '_mta-sts.example.net',
        type: 'CNAME',
        values: ['_policy._mta-sts.example.net', 'not a valid target'],
      },
    ]);
  });
});

describe('groupRecordsByType', () => {
  it('should group records by type in preferred order', () => {
    const records = [
      {
        name: 'example.com',
        type: 'TXT',
        ttl: 300,
        values: ['v=spf1...'],
        sourceVantages: [],
        sourceObservationIds: [],
        isConsistent: true,
      },
      {
        name: 'example.com',
        type: 'A',
        ttl: 300,
        values: ['192.0.2.1'],
        sourceVantages: [],
        sourceObservationIds: [],
        isConsistent: true,
      },
      {
        name: 'example.com',
        type: 'MX',
        ttl: 300,
        values: ['10 mail.example.com'],
        sourceVantages: [],
        sourceObservationIds: [],
        isConsistent: true,
      },
      {
        name: 'example.com',
        type: 'NS',
        ttl: 300,
        values: ['ns1.example.com'],
        sourceVantages: [],
        sourceObservationIds: [],
        isConsistent: true,
      },
    ];

    const groups = groupRecordsByType(records);
    const keys = [...groups.keys()];

    // Preferred order: SOA, NS, A, AAAA, CNAME, MX, TXT, CAA
    expect(keys.indexOf('NS')).toBeLessThan(keys.indexOf('A'));
    expect(keys.indexOf('A')).toBeLessThan(keys.indexOf('MX'));
    expect(keys.indexOf('MX')).toBeLessThan(keys.indexOf('TXT'));
  });
});

describe('formatRecordValue', () => {
  it('should format MX records with priority', () => {
    const formatted = formatRecordValue('MX', '10 mail.example.com');
    expect(formatted).toBe('mail.example.com (priority: 10)');
  });

  it('should format SOA records', () => {
    const formatted = formatRecordValue(
      'SOA',
      'ns1.example.com admin.example.com 2024010101 3600 900 604800 86400'
    );
    expect(formatted).toContain('Primary: ns1.example.com');
    expect(formatted).toContain('Contact: admin.example.com');
  });

  it('should remove quotes from TXT records', () => {
    const formatted = formatRecordValue('TXT', '"v=spf1 include:_spf.google.com ~all"');
    expect(formatted).toBe('v=spf1 include:_spf.google.com ~all');
  });

  it('should return value unchanged for other types', () => {
    const formatted = formatRecordValue('A', '192.0.2.1');
    expect(formatted).toBe('192.0.2.1');
  });
});

describe('getRecordTypeDescription', () => {
  it('should return descriptions for known types', () => {
    expect(getRecordTypeDescription('A')).toBe('IPv4 Address');
    expect(getRecordTypeDescription('AAAA')).toBe('IPv6 Address');
    expect(getRecordTypeDescription('MX')).toBe('Mail Exchange');
    expect(getRecordTypeDescription('TXT')).toBe('Text');
    expect(getRecordTypeDescription('CAA')).toBe('Certification Authority Authorization');
  });

  it('should return type itself for unknown types', () => {
    expect(getRecordTypeDescription('UNKNOWN')).toBe('UNKNOWN');
  });
});
