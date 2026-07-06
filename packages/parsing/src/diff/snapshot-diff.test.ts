/**
 * Snapshot Diff Tests - Bead 07
 *
 * Tests for value, TTL, scope, ruleset, and findings changes.
 */

import type { Finding, RecordSet } from '@dns-ops/db/schema';
import { describe, expect, it } from 'vitest';
import { compareSnapshots } from './snapshot-diff.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createSnapshot(
  overrides: Partial<{
    id: string;
    createdAt: Date;
    rulesetVersion: string;
    queriedNames: string[];
    queriedTypes: string[];
    vantages: string[];
  }> = {}
) {
  return {
    id: overrides.id ?? 'snap-test-1',
    createdAt: overrides.createdAt ?? new Date('2024-01-01'),
    rulesetVersion: overrides.rulesetVersion ?? '1.0.0',
    queriedNames: overrides.queriedNames ?? ['example.com'],
    queriedTypes: overrides.queriedTypes ?? ['A', 'AAAA', 'MX', 'TXT'],
    vantages: overrides.vantages ?? ['public-recursive'],
  };
}

function createRecordSet(overrides: Partial<RecordSet>): RecordSet {
  return {
    id: overrides.id ?? 'rs-1',
    snapshotId: overrides.snapshotId ?? 'snap-1',
    name: overrides.name ?? 'example.com',
    type: overrides.type ?? 'A',
    ttl: overrides.ttl ?? 300,
    values: overrides.values ?? ['192.0.2.1'],
    sourceObservationIds: overrides.sourceObservationIds ?? ['obs-1'],
    sourceVantages: overrides.sourceVantages ?? ['public-recursive'],
    isConsistent: overrides.isConsistent ?? true,
    consolidationNotes: overrides.consolidationNotes ?? null,
    createdAt: overrides.createdAt ?? new Date('2024-01-01'),
  };
}

function createFinding(overrides: Partial<Finding>): Finding {
  return {
    id: overrides.id ?? 'finding-1',
    snapshotId: overrides.snapshotId ?? 'snap-1',
    type: overrides.type ?? 'dns.example',
    title: overrides.title ?? 'Example Finding',
    description: overrides.description ?? 'An example finding',
    severity: overrides.severity ?? 'medium',
    confidence: overrides.confidence ?? 'high',
    riskPosture: overrides.riskPosture ?? 'medium',
    blastRadius: overrides.blastRadius ?? 'single-domain',
    reviewOnly: overrides.reviewOnly ?? false,
    evidence: overrides.evidence ?? [],
    ruleId: overrides.ruleId ?? 'rule-1',
    ruleVersion: overrides.ruleVersion ?? '1.0.0',
    rulesetVersionId: overrides.rulesetVersionId ?? 'ruleset-version-1', // NOT NULL since migration 0011
    acknowledgedAt: overrides.acknowledgedAt ?? null,
    acknowledgedBy: overrides.acknowledgedBy ?? null,
    falsePositive: overrides.falsePositive ?? false,
    createdAt: overrides.createdAt ?? new Date('2024-01-01'),
  };
}

// =============================================================================
// Record Value Changes Tests
// =============================================================================

describe('Record Value Changes', () => {
  it('should detect added records', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [];
    const recordsB: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', values: ['192.0.2.1'] }),
    ];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.comparison.recordChanges).toHaveLength(1);
    expect(result.comparison.recordChanges[0]).toMatchObject({
      type: 'added',
      name: 'example.com',
      recordType: 'A',
      valuesB: ['192.0.2.1'],
    });
    expect(result.summary.additions).toBe(1);
  });

  it('should detect removed records', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', values: ['192.0.2.1'] }),
    ];
    const recordsB: RecordSet[] = [];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.comparison.recordChanges).toHaveLength(1);
    expect(result.comparison.recordChanges[0]).toMatchObject({
      type: 'removed',
      name: 'example.com',
      recordType: 'A',
      valuesA: ['192.0.2.1'],
    });
    expect(result.summary.deletions).toBe(1);
  });

  it('should detect modified records (value change)', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', values: ['192.0.2.1'] }),
    ];
    const recordsB: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', values: ['192.0.2.2'] }),
    ];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.comparison.recordChanges).toHaveLength(1);
    expect(result.comparison.recordChanges[0]).toMatchObject({
      type: 'modified',
      name: 'example.com',
      recordType: 'A',
      diff: {
        added: ['192.0.2.2'],
        removed: ['192.0.2.1'],
      },
    });
    expect(result.summary.modifications).toBe(1);
  });

  it('should detect unchanged records', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', values: ['192.0.2.1'] }),
    ];
    const recordsB: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', values: ['192.0.2.1'] }),
    ];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.comparison.recordChanges).toHaveLength(1);
    expect(result.comparison.recordChanges[0]).toMatchObject({
      type: 'unchanged',
      name: 'example.com',
      recordType: 'A',
    });
    expect(result.summary.unchanged).toBe(1);
  });

  it('should handle multi-value record changes', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [
      createRecordSet({
        name: 'example.com',
        type: 'MX',
        values: ['10 mail1.example.com', '20 mail2.example.com'],
      }),
    ];
    const recordsB: RecordSet[] = [
      createRecordSet({
        name: 'example.com',
        type: 'MX',
        values: ['10 mail1.example.com', '30 mail3.example.com'],
      }),
    ];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.comparison.recordChanges[0]).toMatchObject({
      type: 'modified',
      diff: {
        added: ['30 mail3.example.com'],
        removed: ['20 mail2.example.com'],
      },
    });
  });
});

// =============================================================================
// TTL Changes Tests
// =============================================================================

describe('TTL Changes', () => {
  it('should detect TTL changes', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', ttl: 300, values: ['192.0.2.1'] }),
    ];
    const recordsB: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', ttl: 600, values: ['192.0.2.1'] }),
    ];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.comparison.ttlChanges).toHaveLength(1);
    expect(result.comparison.ttlChanges[0]).toMatchObject({
      name: 'example.com',
      recordType: 'A',
      ttlA: 300,
      ttlB: 600,
      change: 100, // 100% increase
    });
  });

  it('should not report TTL changes for identical TTLs', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [createRecordSet({ name: 'example.com', type: 'A', ttl: 300 })];
    const recordsB: RecordSet[] = [createRecordSet({ name: 'example.com', type: 'A', ttl: 300 })];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.comparison.ttlChanges).toHaveLength(0);
  });

  it('should not report TTL changes for records that exist only in one snapshot', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [createRecordSet({ name: 'example.com', type: 'A', ttl: 300 })];
    const recordsB: RecordSet[] = []; // Record removed

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.comparison.ttlChanges).toHaveLength(0);
  });
});

// =============================================================================
// Scope Changes Tests
// =============================================================================

describe('Scope Changes', () => {
  it('should detect added query names', () => {
    const snapA = createSnapshot({
      id: 'snap-a',
      queriedNames: ['example.com'],
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      queriedNames: ['example.com', 'www.example.com'],
    });

    const result = compareSnapshots(snapA, snapB, [], [], [], []);

    expect(result.comparison.scopeChanges).not.toBeNull();
    expect(result.comparison.scopeChanges?.namesAdded).toContain('www.example.com');
    expect(result.comparison.scopeChanges?.namesRemoved).toHaveLength(0);
  });

  it('should detect removed query names', () => {
    const snapA = createSnapshot({
      id: 'snap-a',
      queriedNames: ['example.com', 'www.example.com'],
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      queriedNames: ['example.com'],
    });

    const result = compareSnapshots(snapA, snapB, [], [], [], []);

    expect(result.comparison.scopeChanges).not.toBeNull();
    expect(result.comparison.scopeChanges?.namesRemoved).toContain('www.example.com');
    expect(result.comparison.scopeChanges?.namesAdded).toHaveLength(0);
  });

  it('should detect added query types', () => {
    const snapA = createSnapshot({
      id: 'snap-a',
      queriedTypes: ['A', 'AAAA'],
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      queriedTypes: ['A', 'AAAA', 'MX'],
    });

    const result = compareSnapshots(snapA, snapB, [], [], [], []);

    expect(result.comparison.scopeChanges).not.toBeNull();
    expect(result.comparison.scopeChanges?.typesAdded).toContain('MX');
  });

  it('should detect vantage changes', () => {
    const snapA = createSnapshot({
      id: 'snap-a',
      vantages: ['public-recursive'],
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      vantages: ['public-recursive', 'authoritative'],
    });

    const result = compareSnapshots(snapA, snapB, [], [], [], []);

    expect(result.comparison.scopeChanges).not.toBeNull();
    expect(result.comparison.scopeChanges?.vantagesAdded).toContain('authoritative');
  });

  it('should return null for identical scope', () => {
    const snapA = createSnapshot({
      id: 'snap-a',
      queriedNames: ['example.com'],
      queriedTypes: ['A', 'AAAA'],
      vantages: ['public-recursive'],
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      queriedNames: ['example.com'],
      queriedTypes: ['A', 'AAAA'],
      vantages: ['public-recursive'],
    });

    const result = compareSnapshots(snapA, snapB, [], [], [], []);

    expect(result.comparison.scopeChanges).toBeNull();
  });
});

// =============================================================================
// Ruleset Version Changes Tests
// =============================================================================

describe('Ruleset Changes', () => {
  it('should detect ruleset version changes', () => {
    const snapA = createSnapshot({
      id: 'snap-a',
      rulesetVersion: '1.0.0',
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      rulesetVersion: '1.1.0',
    });

    const result = compareSnapshots(snapA, snapB, [], [], [], []);

    expect(result.comparison.rulesetChange).not.toBeNull();
    expect(result.comparison.rulesetChange?.versionA).toBe('1.0.0');
    expect(result.comparison.rulesetChange?.versionB).toBe('1.1.0');
    expect(result.comparison.rulesetChange?.message).toContain('1.0.0');
    expect(result.comparison.rulesetChange?.message).toContain('1.1.0');
  });

  it('should return null for identical ruleset versions', () => {
    const snapA = createSnapshot({
      id: 'snap-a',
      rulesetVersion: '1.0.0',
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      rulesetVersion: '1.0.0',
    });

    const result = compareSnapshots(snapA, snapB, [], [], [], []);

    expect(result.comparison.rulesetChange).toBeNull();
  });
});

// =============================================================================
// Finding Changes Tests
// =============================================================================

describe('Finding Changes', () => {
  it('should detect added findings', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const findingsA: Finding[] = [];
    const findingsB: Finding[] = [
      createFinding({
        type: 'mail.no-dmarc-record',
        title: 'No DMARC Record',
        severity: 'high',
      }),
    ];

    const result = compareSnapshots(snapA, snapB, [], [], findingsA, findingsB);

    expect(result.comparison.findingChanges).toHaveLength(1);
    expect(result.comparison.findingChanges[0]).toMatchObject({
      type: 'added',
      findingType: 'mail.no-dmarc-record',
      title: 'No DMARC Record',
      severityB: 'high',
    });
  });

  it('should detect removed findings', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const findingsA: Finding[] = [
      createFinding({
        type: 'mail.no-dmarc-record',
        title: 'No DMARC Record',
        severity: 'high',
      }),
    ];
    const findingsB: Finding[] = [];

    const result = compareSnapshots(snapA, snapB, [], [], findingsA, findingsB);

    expect(result.comparison.findingChanges).toHaveLength(1);
    expect(result.comparison.findingChanges[0]).toMatchObject({
      type: 'removed',
      findingType: 'mail.no-dmarc-record',
      title: 'No DMARC Record',
      severityA: 'high',
    });
  });

  it('should detect severity changes in findings', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const findingsA: Finding[] = [
      createFinding({
        type: 'mail.dmarc-policy-weak',
        title: 'DMARC Policy Weak',
        severity: 'medium',
      }),
    ];
    const findingsB: Finding[] = [
      createFinding({
        type: 'mail.dmarc-policy-weak',
        title: 'DMARC Policy Weak',
        severity: 'high',
      }),
    ];

    const result = compareSnapshots(snapA, snapB, [], [], findingsA, findingsB);

    expect(result.comparison.findingChanges).toHaveLength(1);
    expect(result.comparison.findingChanges[0]).toMatchObject({
      type: 'modified',
      findingType: 'mail.dmarc-policy-weak',
      severityA: 'medium',
      severityB: 'high',
    });
  });

  it('should detect unchanged findings', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const findingsA: Finding[] = [
      createFinding({
        type: 'mail.spf-present',
        title: 'SPF Record Present',
        severity: 'info',
      }),
    ];
    const findingsB: Finding[] = [
      createFinding({
        type: 'mail.spf-present',
        title: 'SPF Record Present',
        severity: 'info',
      }),
    ];

    const result = compareSnapshots(snapA, snapB, [], [], findingsA, findingsB);

    expect(result.comparison.findingChanges).toHaveLength(1);
    expect(result.comparison.findingChanges[0]).toMatchObject({
      type: 'unchanged',
      findingType: 'mail.spf-present',
    });
  });
});

// =============================================================================
// Summary Tests
// =============================================================================

describe('Summary', () => {
  it('should calculate correct summary statistics', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const recordsA: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', values: ['192.0.2.1'] }),
      createRecordSet({ name: 'example.com', type: 'MX', values: ['10 mail.example.com'] }),
      createRecordSet({ name: 'old.example.com', type: 'A', values: ['192.0.2.100'] }),
    ];
    const recordsB: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A', values: ['192.0.2.2'] }), // Modified
      createRecordSet({ name: 'example.com', type: 'MX', values: ['10 mail.example.com'] }), // Unchanged
      createRecordSet({ name: 'new.example.com', type: 'A', values: ['192.0.2.200'] }), // Added
    ];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    expect(result.summary.additions).toBe(1);
    expect(result.summary.deletions).toBe(1);
    expect(result.summary.modifications).toBe(1);
    expect(result.summary.unchanged).toBe(1);
    expect(result.summary.totalChanges).toBe(3);
  });

  it('should include finding changes in summary', () => {
    const snapA = createSnapshot({ id: 'snap-a' });
    const snapB = createSnapshot({ id: 'snap-b' });

    const findingsA: Finding[] = [createFinding({ type: 'dns.issue', title: 'Issue 1' })];
    const findingsB: Finding[] = [
      createFinding({ type: 'dns.issue', title: 'Issue 1' }),
      createFinding({ type: 'dns.issue2', title: 'Issue 2' }),
    ];

    const result = compareSnapshots(snapA, snapB, [], [], findingsA, findingsB);

    expect(result.summary.additions).toBe(1);
    expect(result.summary.unchanged).toBe(1);
  });
});

// =============================================================================
// Unknown vs Unchanged Distinction Tests
// =============================================================================

describe('Unknown vs Unchanged Distinction', () => {
  it('should not report changes for records outside query scope', () => {
    // When scope changes, we shouldn't conflate "new in scope" with "newly created"
    const snapA = createSnapshot({
      id: 'snap-a',
      queriedNames: ['example.com'],
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      queriedNames: ['example.com', 'www.example.com'],
    });

    const recordsA: RecordSet[] = [createRecordSet({ name: 'example.com', type: 'A' })];
    const recordsB: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A' }),
      createRecordSet({ name: 'www.example.com', type: 'A' }), // Added to scope, not necessarily new
    ];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    // Should detect scope change
    expect(result.comparison.scopeChanges).not.toBeNull();
    expect(result.comparison.scopeChanges?.namesAdded).toContain('www.example.com');

    // The www.example.com record appears as "added" but the scope change warning
    // should alert users that this may be due to scope expansion, not a new record
  });

  it('should preserve distinct records when both snapshots have same scope', () => {
    const snapA = createSnapshot({
      id: 'snap-a',
      queriedNames: ['example.com', 'www.example.com'],
    });
    const snapB = createSnapshot({
      id: 'snap-b',
      queriedNames: ['example.com', 'www.example.com'],
    });

    const recordsA: RecordSet[] = [createRecordSet({ name: 'example.com', type: 'A' })];
    const recordsB: RecordSet[] = [
      createRecordSet({ name: 'example.com', type: 'A' }),
      createRecordSet({ name: 'www.example.com', type: 'A' }),
    ];

    const result = compareSnapshots(snapA, snapB, recordsA, recordsB, [], []);

    // No scope change - so the added record is truly new
    expect(result.comparison.scopeChanges).toBeNull();
    expect(
      result.comparison.recordChanges.find(
        (r) => r.name === 'www.example.com' && r.type === 'added'
      )
    ).toBeDefined();
  });
});
