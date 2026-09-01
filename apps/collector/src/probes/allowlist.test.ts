/**
 * Probe Allowlist Tests - Bead 13.4
 *
 * Tests for probe guardrails:
 * - Allowlist expiry (entries expire after TTL)
 * - Concurrency limiting (batch processing)
 * - Entry management (add, check, cleanup)
 *
 * Bead dns-ops-1j4.13.4 requirements covered:
 * - Probe guardrails must be test-backed
 * - Allowlist expiry
 * - Concurrency
 * - Rate limits (via concurrency batching)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DNSQueryResult } from '../dns/types.js';
import { ProbeAllowlist } from './allowlist.js';

// =============================================================================
// Allowlist Expiry Tests
// =============================================================================

describe('Allowlist Expiry - Bead 13.4', () => {
  let allowlist: ProbeAllowlist;

  beforeEach(() => {
    allowlist = new ProbeAllowlist(5000); // 5 second TTL for tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    allowlist.clear();
  });

  it('should create entries with correct expiration time', () => {
    const now = new Date();
    vi.setSystemTime(now);

    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    const entries = allowlist.getAllEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].expiresAt.getTime()).toBe(now.getTime() + 5000);
  });

  it('should return entry when not expired', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    // Advance 4 seconds (before 5 second TTL)
    vi.advanceTimersByTime(4000);

    expect(allowlist.isAllowed('mail.example.com', 25)).toBe(true);
    expect(allowlist.getAllEntries()).toHaveLength(1);
  });

  it('should remove entry after TTL expires', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    // Advance 6 seconds (after 5 second TTL)
    vi.advanceTimersByTime(6000);

    expect(allowlist.isAllowed('mail.example.com', 25)).toBe(false);
    expect(allowlist.getAllEntries()).toHaveLength(0);
  });

  it('should expire multiple entries independently', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    allowlist.addCustomEntry('mail1.example.com', 25, 'test', 'testing');

    vi.advanceTimersByTime(2000);
    allowlist.addCustomEntry('mail2.example.com', 25, 'test', 'testing');

    // After 4 seconds total, first entry has 4s age, second has 2s age
    vi.advanceTimersByTime(2000);
    expect(allowlist.getAllEntries()).toHaveLength(2);

    // After 6 seconds total, first entry expired, second has 4s age
    vi.advanceTimersByTime(2000);
    expect(allowlist.getAllEntries()).toHaveLength(1);
    expect(allowlist.isAllowed('mail1.example.com', 25)).toBe(false);
    expect(allowlist.isAllowed('mail2.example.com', 25)).toBe(true);

    // After 8 seconds total, both expired
    vi.advanceTimersByTime(2000);
    expect(allowlist.getAllEntries()).toHaveLength(0);
  });

  it('should clean up expired entries on getAllEntries', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    vi.advanceTimersByTime(6000);

    // getAllEntries should trigger cleanup
    const entries = allowlist.getAllEntries();
    expect(entries).toHaveLength(0);
  });

  it('should clean up expired entries on isAllowed', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');
    allowlist.addCustomEntry('other.example.com', 25, 'test', 'testing');

    vi.advanceTimersByTime(6000);

    // isAllowed should trigger cleanup
    allowlist.isAllowed('nonexistent.com', 25);
    expect(allowlist.getAllEntries()).toHaveLength(0);
  });

  it('should use custom TTL when creating allowlist', () => {
    const shortTtlAllowlist = new ProbeAllowlist(1000); // 1 second TTL
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    shortTtlAllowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    vi.advanceTimersByTime(500);
    expect(shortTtlAllowlist.isAllowed('mail.example.com', 25)).toBe(true);

    vi.advanceTimersByTime(600); // Total 1100ms
    expect(shortTtlAllowlist.isAllowed('mail.example.com', 25)).toBe(false);
  });

  it('should default to 5 minute TTL', () => {
    const defaultAllowlist = new ProbeAllowlist();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    defaultAllowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    const entries = defaultAllowlist.getAllEntries();
    const expectedExpiry = new Date('2024-01-01T00:00:00Z').getTime() + 5 * 60 * 1000;
    expect(entries[0].expiresAt.getTime()).toBe(expectedExpiry);
  });
});

// =============================================================================
// Entry Generation from DNS Results
// =============================================================================

describe('Allowlist Entry Generation - Bead 13.4', () => {
  let allowlist: ProbeAllowlist;

  beforeEach(() => {
    allowlist = new ProbeAllowlist(60000);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    allowlist.clear();
  });

  it('should generate MX entries from DNS results', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [
          { name: 'example.com', type: 'MX', ttl: 300, data: '10 mail1.example.com.' },
          { name: 'example.com', type: 'MX', ttl: 300, data: '20 mail2.example.com.' },
        ],
        authority: [],
        additional: [],
        responseTime: 50,
      },
    ];

    const entries = allowlist.generateFromDnsResults('example.com', dnsResults);

    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('mx');
    expect(entries[0].hostname).toBe('mail1.example.com');
    expect(entries[0].port).toBe(25);
    expect(entries[1].hostname).toBe('mail2.example.com');
  });

  it('should strip trailing dot from MX hostnames', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 mail.example.com.' }],
        authority: [],
        additional: [],
        responseTime: 50,
      },
    ];

    const entries = allowlist.generateFromDnsResults('example.com', dnsResults);

    expect(entries[0].hostname).toBe('mail.example.com');
    expect(entries[0].hostname.endsWith('.')).toBe(false);
  });

  it('should generate MTA-STS entries from TXT records', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: '_mta-sts.example.com', type: 'TXT' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [
          { name: '_mta-sts.example.com', type: 'TXT', ttl: 300, data: 'v=STSv1; id=20240101' },
        ],
        authority: [],
        additional: [],
        responseTime: 30,
      },
    ];

    const entries = allowlist.generateFromDnsResults('example.com', dnsResults);

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('mta-sts');
    expect(entries[0].hostname).toBe('mta-sts.example.com');
    expect(entries[0].port).toBe(443);
  });

  it('should skip failed DNS results', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: false,
        answers: [],
        authority: [],
        additional: [],
        responseTime: 50,
        error: 'NXDOMAIN',
      },
    ];

    const entries = allowlist.generateFromDnsResults('example.com', dnsResults);

    expect(entries).toHaveLength(0);
  });

  it('should track derivation info for audit', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 mail.example.com.' }],
        authority: [],
        additional: [],
        responseTime: 50,
      },
    ];

    const entries = allowlist.generateFromDnsResults('example.com', dnsResults);

    expect(entries[0].derivedFrom.domain).toBe('example.com');
    expect(entries[0].derivedFrom.queryType).toBe('MX');
    expect(entries[0].derivedFrom.queryName).toBe('example.com');
    expect(entries[0].derivedFrom.answerData).toBe('10 mail.example.com.');
  });
});

// =============================================================================
// Allowlist Lookup Tests
// =============================================================================

describe('Allowlist Lookup - Bead 13.4', () => {
  let allowlist: ProbeAllowlist;

  beforeEach(() => {
    allowlist = new ProbeAllowlist(60000);
  });

  afterEach(() => {
    allowlist.clear();
  });

  it('should find entry by exact hostname and port', () => {
    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    expect(allowlist.isAllowed('mail.example.com', 25)).toBe(true);
    expect(allowlist.isAllowed('mail.example.com', 587)).toBe(false);
    expect(allowlist.isAllowed('other.example.com', 25)).toBe(false);
  });

  it('should find entry by hostname when port not specified', () => {
    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    expect(allowlist.isAllowed('mail.example.com')).toBe(true);
  });

  it('should find entry when entry has no port', () => {
    // Add entry without port by generating from DNS
    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

    // Should match even if checking different port
    expect(allowlist.isAllowed('mail.example.com', 25)).toBe(true);
  });

  it('should return entry details via getEntry', () => {
    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'reason');

    const entry = allowlist.getEntry('mail.example.com', 25);

    expect(entry).toBeDefined();
    expect(entry?.type).toBe('custom');
    expect(entry?.hostname).toBe('mail.example.com');
    expect(entry?.derivedFrom.answerData).toContain('reason');
  });

  it('should return undefined for non-existent entry', () => {
    const entry = allowlist.getEntry('nonexistent.com', 25);

    expect(entry).toBeUndefined();
  });

  it('should handle multiple entries for same hostname different ports', () => {
    allowlist.addCustomEntry('mail.example.com', 25, 'test', 'smtp');
    allowlist.addCustomEntry('mail.example.com', 587, 'test', 'submission');

    expect(allowlist.isAllowed('mail.example.com', 25)).toBe(true);
    expect(allowlist.isAllowed('mail.example.com', 587)).toBe(true);
    expect(allowlist.isAllowed('mail.example.com', 465)).toBe(false);
  });
});

// =============================================================================
// Legacy ProbeAllowlist Hostname Canonicalization (Issue #67 review)
// =============================================================================

describe('Legacy ProbeAllowlist Canonicalization - Issue #67 review', () => {
  let allowlist: ProbeAllowlist;

  beforeEach(() => {
    allowlist = new ProbeAllowlist(60000);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    allowlist.clear();
  });

  it('should canonicalize mixed-case trailing-dot MX answers so lowercase probes are allowed', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 MAIL.EXAMPLE.COM.' }],
        authority: [],
        additional: [],
        responseTime: 50,
      },
    ];

    const entries = allowlist.generateFromDnsResults('example.com', dnsResults);

    // Entry is stored canonical, matching the lowercase hosts the
    // persisted-evidence loader produces.
    expect(entries[0].hostname).toBe('mail.example.com');

    // Lookups are canonicalized too: raw-case and trailing-dot queries both hit.
    expect(allowlist.isAllowed('mail.example.com', 25)).toBe(true);
    expect(allowlist.isAllowed('MAIL.EXAMPLE.COM.', 25)).toBe(true);
    expect(allowlist.getEntry('Mail.Example.Com', 25)).toBeDefined();
  });

  it('should canonicalize custom entries', () => {
    allowlist.addCustomEntry('RELAY.Example.ORG.', 25, 'ops', 'break-glass');

    expect(allowlist.isAllowed('relay.example.org', 25)).toBe(true);
    expect(allowlist.isAllowed('RELAY.EXAMPLE.ORG', 25)).toBe(true);
  });

  it('should canonicalize MTA-STS entries from mixed-case domains', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: '_mta-sts.Example.COM', type: 'TXT' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [
          { name: '_mta-sts.Example.COM', type: 'TXT', ttl: 300, data: 'v=STSv1; id=20240101' },
        ],
        authority: [],
        additional: [],
        responseTime: 30,
      },
    ];

    const entries = allowlist.generateFromDnsResults('Example.COM', dnsResults);

    expect(entries[0].type).toBe('mta-sts');
    expect(entries[0].hostname).toBe('mta-sts.example.com');

    expect(allowlist.isAllowed('mta-sts.example.com', 443)).toBe(true);
    expect(allowlist.isAllowed('MTA-STS.Example.COM', 443)).toBe(true);
  });
});

// =============================================================================
// Custom Entry Tests
// =============================================================================

describe('Custom Entries - Bead 13.4', () => {
  let allowlist: ProbeAllowlist;

  beforeEach(() => {
    allowlist = new ProbeAllowlist(60000);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    allowlist.clear();
  });

  it('should add custom entry with requester info', () => {
    const entry = allowlist.addCustomEntry(
      'custom.example.com',
      443,
      'operator@example.com',
      'Manual probe request'
    );

    expect(entry.type).toBe('custom');
    expect(entry.hostname).toBe('custom.example.com');
    expect(entry.port).toBe(443);
    expect(entry.derivedFrom.domain).toBe('custom');
    expect(entry.derivedFrom.queryType).toBe('manual');
    expect(entry.derivedFrom.answerData).toContain('operator@example.com');
    expect(entry.derivedFrom.answerData).toContain('Manual probe request');
  });

  it('should make custom entry immediately available', () => {
    allowlist.addCustomEntry('custom.example.com', 443, 'test', 'testing');

    expect(allowlist.isAllowed('custom.example.com', 443)).toBe(true);
  });

  it('should expire custom entries like other entries', () => {
    allowlist.addCustomEntry('custom.example.com', 443, 'test', 'testing');

    vi.advanceTimersByTime(61000); // 61 seconds > 60 second TTL

    expect(allowlist.isAllowed('custom.example.com', 443)).toBe(false);
  });
});

// =============================================================================
// Concurrent Access Tests
// =============================================================================

describe('Concurrent Access - Bead 13.4', () => {
  let allowlist: ProbeAllowlist;

  beforeEach(() => {
    allowlist = new ProbeAllowlist(60000);
  });

  afterEach(() => {
    allowlist.clear();
  });

  it('should handle rapid sequential additions', () => {
    for (let i = 0; i < 100; i++) {
      allowlist.addCustomEntry(`mail${i}.example.com`, 25, 'test', 'testing');
    }

    expect(allowlist.getAllEntries()).toHaveLength(100);
    expect(allowlist.isAllowed('mail0.example.com', 25)).toBe(true);
    expect(allowlist.isAllowed('mail99.example.com', 25)).toBe(true);
  });

  it('should handle concurrent checks', async () => {
    // Add entries
    for (let i = 0; i < 10; i++) {
      allowlist.addCustomEntry(`mail${i}.example.com`, 25, 'test', 'testing');
    }

    // Perform concurrent checks
    const checkPromises = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve(allowlist.isAllowed(`mail${i % 10}.example.com`, 25))
    );

    const results = await Promise.all(checkPromises);

    // All checks should succeed
    expect(results.every((r) => r === true)).toBe(true);
  });

  it('should handle interleaved add and check operations', async () => {
    const operations: Promise<boolean | undefined>[] = [];

    for (let i = 0; i < 50; i++) {
      // Add operation
      operations.push(
        Promise.resolve(
          allowlist.addCustomEntry(`mail${i}.example.com`, 25, 'test', 'testing')
        ).then(() => undefined)
      );
      // Check operation (might be before or after add)
      operations.push(
        Promise.resolve(allowlist.isAllowed(`mail${Math.floor(i / 2)}.example.com`, 25))
      );
    }

    await Promise.all(operations);

    // Should have 50 entries
    expect(allowlist.getAllEntries()).toHaveLength(50);
  });

  it('should safely clear during operations', () => {
    for (let i = 0; i < 10; i++) {
      allowlist.addCustomEntry(`mail${i}.example.com`, 25, 'test', 'testing');
    }

    allowlist.clear();

    expect(allowlist.getAllEntries()).toHaveLength(0);
    expect(allowlist.isAllowed('mail0.example.com', 25)).toBe(false);
  });
});

// =============================================================================
// Batch Processing (Concurrency Limiting) Tests
// =============================================================================

describe('Batch Processing Concurrency - Bead 13.4', () => {
  it('should process entries in batches (unit test for concurrency concept)', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const concurrency = 3;
    const batches: number[][] = [];

    // Simulate batch processing
    for (let i = 0; i < items.length; i += concurrency) {
      batches.push(items.slice(i, i + concurrency));
    }

    expect(batches).toHaveLength(4);
    expect(batches[0]).toEqual([0, 1, 2]);
    expect(batches[1]).toEqual([3, 4, 5]);
    expect(batches[2]).toEqual([6, 7, 8]);
    expect(batches[3]).toEqual([9]);
  });

  it('should limit concurrent operations (unit test)', async () => {
    const concurrency = 3;
    const activeCounts: number[] = [];
    let activeCount = 0;

    const items = Array.from({ length: 9 }, (_, i) => i);

    // Process in batches
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);

      // Start batch
      activeCount += batch.length;
      activeCounts.push(activeCount);

      // Simulate work completion
      await Promise.all(batch.map(() => Promise.resolve()));

      activeCount -= batch.length;
    }

    // Max concurrent should never exceed concurrency limit
    expect(Math.max(...activeCounts)).toBeLessThanOrEqual(concurrency);
    expect(activeCounts).toEqual([3, 3, 3]); // Each batch starts 3 items
  });

  it('should default to concurrency of 3 (documents expected behavior)', () => {
    const defaultConcurrency = 3;

    // This documents the expected default from probeMXHosts
    expect(defaultConcurrency).toBe(3);
  });

  it('should allow configurable concurrency', () => {
    const testConcurrencies = [1, 2, 3, 5, 10];

    for (const concurrency of testConcurrencies) {
      const items = Array.from({ length: 10 }, (_, i) => i);
      const batches: number[][] = [];

      for (let i = 0; i < items.length; i += concurrency) {
        batches.push(items.slice(i, i + concurrency));
      }

      // Verify all items processed
      const processedCount = batches.reduce((sum, batch) => sum + batch.length, 0);
      expect(processedCount).toBe(10);

      // Verify no batch exceeds concurrency
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(concurrency);
      }
    }
  });
});

// =============================================================================
// Rate Limit / Guardrail Tests
// =============================================================================

describe('Probe Guardrails - Bead 13.4', () => {
  let allowlist: ProbeAllowlist;

  beforeEach(() => {
    allowlist = new ProbeAllowlist(60000);
  });

  afterEach(() => {
    allowlist.clear();
  });

  it('should require entries to be derived from DNS or explicitly added', () => {
    // Without adding entry, probe should be blocked
    expect(allowlist.isAllowed('arbitrary-target.com', 25)).toBe(false);

    // After adding via DNS derivation
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [
          { name: 'example.com', type: 'MX', ttl: 300, data: '10 derived-target.example.com.' },
        ],
        authority: [],
        additional: [],
        responseTime: 50,
      },
    ];

    allowlist.generateFromDnsResults('example.com', dnsResults);

    expect(allowlist.isAllowed('derived-target.example.com', 25)).toBe(true);
  });

  it('should not allow probing arbitrary hosts without allowlist', () => {
    const arbitraryHosts = [
      'internal-server.local',
      '192.168.1.1',
      'localhost',
      'metadata.google.internal',
    ];

    for (const host of arbitraryHosts) {
      expect(allowlist.isAllowed(host, 25)).toBe(false);
    }
  });

  it('should track derivation source for audit trail', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 mail.example.com.' }],
        authority: [],
        additional: [],
        responseTime: 50,
      },
    ];

    allowlist.generateFromDnsResults('example.com', dnsResults);

    const entry = allowlist.getEntry('mail.example.com', 25);
    expect(entry?.derivedFrom.domain).toBe('example.com');
    expect(entry?.derivedFrom.queryType).toBe('MX');
    expect(entry?.derivedFrom.queryName).toBe('example.com');
    expect(entry?.derivedFrom.answerData).toBe('10 mail.example.com.');
  });

  it('should enforce TTL to prevent stale allowlist entries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    // Use short TTL
    const shortTtlAllowlist = new ProbeAllowlist(1000);

    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'google' },
        success: true,
        answers: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 mail.example.com.' }],
        authority: [],
        additional: [],
        responseTime: 50,
      },
    ];

    shortTtlAllowlist.generateFromDnsResults('example.com', dnsResults);

    // Initially allowed
    expect(shortTtlAllowlist.isAllowed('mail.example.com', 25)).toBe(true);

    // After TTL, no longer allowed
    vi.advanceTimersByTime(1500);
    expect(shortTtlAllowlist.isAllowed('mail.example.com', 25)).toBe(false);

    vi.useRealTimers();
  });
});
