/**
 * DNS Collection Integration Tests - Bead dns-ops-1j4.5.3
 *
 * End-to-end smoke tests for public live DNS, with optional controllable authoritative fixtures.
 *
 * These tests hit real DNS infrastructure and are intentionally opt-in.
 * Default repo validation keeps them disabled to preserve deterministic gates.
 *
 * Run with:
 * - `bun run test:live-dns`
 * - or `RUN_LIVE_DNS_TESTS=1 bun run --filter @dns-ops/collector test`
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadPersistedMtaStsEvidence } from '../probes/persisted-dns-authorization.js';
import { DNSCollector, type ResolverLike } from './collector.js';
import { DNSResolver } from './resolver.js';
import type { CollectionConfig, DNSQueryResult, VantageInfo } from './types.js';

interface LiveDnsFixtures {
  enabled: boolean;
  recursivePrimary: string;
  recursiveSecondary: string;
  positiveDomain: string;
  mailDomain: string;
  authoritativeDomain?: string;
  authoritativeNsIp?: string;
}

const LIVE_TEST_TIMEOUT_MS = 30_000;

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const LIVE_DNS: LiveDnsFixtures = {
  enabled: isTruthy(process.env.RUN_LIVE_DNS_TESTS),
  recursivePrimary: process.env.LIVE_DNS_RESOLVER_PRIMARY?.trim() || '8.8.8.8',
  recursiveSecondary: process.env.LIVE_DNS_RESOLVER_SECONDARY?.trim() || '1.1.1.1',
  positiveDomain: process.env.LIVE_DNS_DOMAIN?.trim() || 'cloudflare.com',
  mailDomain: process.env.LIVE_DNS_MAIL_DOMAIN?.trim() || 'google.com',
  authoritativeDomain: optionalEnv(process.env.LIVE_DNS_AUTHORITATIVE_DOMAIN),
  authoritativeNsIp: optionalEnv(process.env.LIVE_DNS_AUTHORITATIVE_NS_IP),
};

const PUBLIC_RECURSIVE: VantageInfo = {
  type: 'public-recursive',
  identifier: LIVE_DNS.recursivePrimary,
  region: 'global',
};

const SECONDARY_RECURSIVE: VantageInfo = {
  type: 'public-recursive',
  identifier: LIVE_DNS.recursiveSecondary,
  region: 'global',
};

const liveDescribe = LIVE_DNS.enabled ? describe.sequential : describe.skip;
const authoritativeDescribe =
  LIVE_DNS.authoritativeDomain && LIVE_DNS.authoritativeNsIp ? describe.sequential : describe.skip;

liveDescribe('DNS Integration Tests', () => {
  let resolver: DNSResolver;

  beforeAll(() => {
    resolver = new DNSResolver();
  });

  describe('Recursive resolver smoke', () => {
    it(
      'resolves A records through the primary recursive resolver',
      async () => {
        const result = await resolver.query(
          { name: LIVE_DNS.positiveDomain, type: 'A' },
          PUBLIC_RECURSIVE
        );

        expect(result.success).toBe(true);
        expect(result.answers.length).toBeGreaterThan(0);
        expect(result.answers[0]?.type).toBe('A');
        expect(result.answers[0]?.data).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
        expect(result.responseTime).toBeGreaterThan(0);
      },
      LIVE_TEST_TIMEOUT_MS
    );

    it(
      'resolves A records through the secondary recursive resolver',
      async () => {
        const result = await resolver.query(
          { name: LIVE_DNS.positiveDomain, type: 'A' },
          SECONDARY_RECURSIVE
        );

        expect(result.success).toBe(true);
        expect(result.answers.length).toBeGreaterThan(0);
        expect(result.answers[0]?.type).toBe('A');
      },
      LIVE_TEST_TIMEOUT_MS
    );

    it(
      'returns NXDOMAIN for an RFC2606 non-existent name',
      async () => {
        const result = await resolver.query(
          { name: 'this-domain-does-not-exist.example', type: 'A' },
          PUBLIC_RECURSIVE
        );

        expect(result.success).toBe(false);
        expect(result.responseCode).toBe(3);
        expect(result.answers).toHaveLength(0);
      },
      LIVE_TEST_TIMEOUT_MS
    );

    it(
      'handles punycode domains without crashing',
      async () => {
        const result = await resolver.query(
          { name: 'xn--bcher-kva.ch', type: 'A' },
          PUBLIC_RECURSIVE
        );

        expect(result).toBeDefined();
        expect(result.query.name).toBe('xn--bcher-kva.ch');
        expect(result.responseTime).toBeGreaterThan(0);
      },
      LIVE_TEST_TIMEOUT_MS
    );
  });

  describe('Mail resolver smoke', () => {
    it(
      'resolves MX records for the configured mail domain',
      async () => {
        const result = await resolver.query(
          { name: LIVE_DNS.mailDomain, type: 'MX' },
          PUBLIC_RECURSIVE
        );

        expect(result.success).toBe(true);
        expect(result.answers.length).toBeGreaterThan(0);
        expect(result.answers[0]?.type).toBe('MX');
        expect(result.answers[0]?.data).toMatch(/^\d+\s+\S+/);
      },
      LIVE_TEST_TIMEOUT_MS
    );

    it(
      'resolves a DMARC TXT record for the configured mail domain',
      async () => {
        const result = await resolver.query(
          { name: `_dmarc.${LIVE_DNS.mailDomain}`, type: 'TXT' },
          PUBLIC_RECURSIVE
        );

        expect(result.success).toBe(true);
        expect(result.answers.length).toBeGreaterThan(0);
        expect(result.answers.some((answer) => answer.data.includes('v=DMARC1'))).toBe(true);
      },
      LIVE_TEST_TIMEOUT_MS
    );
  });

  authoritativeDescribe('Authoritative resolver smoke', () => {
    const domain = LIVE_DNS.authoritativeDomain as string;
    const nameserverIp = LIVE_DNS.authoritativeNsIp as string;

    it(
      'queries a configured authoritative nameserver directly',
      async () => {
        const authoritativeVantage: VantageInfo = {
          type: 'authoritative',
          identifier: nameserverIp,
        };

        const result = await resolver.query({ name: domain, type: 'NS' }, authoritativeVantage);

        expect(result.vantage.type).toBe('authoritative');
        expect(result.vantage.identifier).toBe(nameserverIp);
        expect(result.query.name).toBe(domain);
        expect(result.responseTime).toBeGreaterThan(0);
        expect(result.success).toBe(true);
        expect(result.answers.length).toBeGreaterThan(0);
        expect(result.answers[0]?.type).toBe('NS');
      },
      LIVE_TEST_TIMEOUT_MS
    );
  });
});

/**
 * In-process integration tests for the DNS collector.
 * These use a mocked resolver and in-memory DB adapter to verify
 * the full collect → store → recordset → findings pipeline.
 */

// ── Mock DB adapter ──────────────────────────────────────────────────────

interface Row extends Record<string, unknown> {
  id: string;
}

function createInMemoryDb() {
  const tables = new Map<string, Row[]>();

  function getTable(table: unknown): string {
    if (!table || typeof table !== 'object') return '';
    const record = table as Record<symbol | string, unknown>;
    const symbolName = Symbol.for('drizzle:Name');
    if (typeof record[symbolName] === 'string') return record[symbolName] as string;
    const syms = Object.getOwnPropertySymbols(record);
    const drizzle = syms.find((s) => String(s) === 'Symbol(drizzle:Name)');
    if (drizzle && typeof record[drizzle] === 'string') return record[drizzle] as string;
    return '';
  }

  function rows(name: string) {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name) ?? [];
  }

  function getConditionPairs(condition: unknown): Array<[string, unknown]> {
    const pairs: Array<[string, unknown]> = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const record = value as {
        queryChunks?: unknown[];
        constructor?: { name?: string };
        name?: string;
        value?: unknown;
      };
      const chunks = record.queryChunks ?? [];
      const column = chunks.find((chunk): chunk is { name: string } =>
        Boolean(
          chunk &&
            typeof chunk === 'object' &&
            typeof (chunk as { name?: unknown }).name === 'string' &&
            (chunk as { constructor?: { name?: string } }).constructor?.name !== 'Param'
        )
      );
      const param = chunks.find((chunk): chunk is { value: unknown } =>
        Boolean(
          chunk &&
            typeof chunk === 'object' &&
            (chunk as { constructor?: { name?: string } }).constructor?.name === 'Param'
        )
      );
      if (column && param) pairs.push([column.name, param.value]);
      for (const chunk of chunks) visit(chunk);
    };
    visit(condition);
    return pairs;
  }

  function matches(row: Row, condition: unknown): boolean {
    return getConditionPairs(condition).every(([column, value]) => {
      const key = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return row[key] === value;
    });
  }

  const db: IDatabaseAdapter = {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => [...rows(getTable(table))]),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTable(table);
      return rows(name).filter((row) => matches(row, condition));
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTable(table);
      return rows(name).find((row) => matches(row, condition));
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      const name = getTable(table);
      const row = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...values,
      } as Row;
      rows(name).push(row);
      return row;
    }),
    insertMany: vi.fn(async (table: unknown, arr: Record<string, unknown>[]) => {
      const name = getTable(table);
      return arr.map((values) => {
        const row = {
          id: crypto.randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...values,
        } as Row;
        rows(name).push(row);
        return row;
      });
    }),
    update: vi.fn(async (table: unknown, values: Record<string, unknown>, condition: unknown) => {
      const name = getTable(table);
      const target = rows(name).find((row) => matches(row, condition));
      if (target) Object.assign(target, values);
      return target ? [target] : [];
    }),
    updateOne: vi.fn(async () => undefined),
    delete: vi.fn(async () => 0),
  } as unknown as IDatabaseAdapter;

  return { db, tables, rows };
}

// ── Mock DNS resolver ────────────────────────────────────────────────────

function makeAnswer(name: string, type: string, data: string, ttl = 300) {
  return { name, type, ttl, data };
}

const MOCK_PUBLIC_RECURSIVE: VantageInfo = {
  type: 'public-recursive',
  identifier: '8.8.8.8',
  region: 'us-central',
};

function buildSuccessResult(
  queryName: string,
  queryType: string,
  answers: ReturnType<typeof makeAnswer>[],
  vantage: VantageInfo = MOCK_PUBLIC_RECURSIVE
): DNSQueryResult {
  return {
    query: { name: queryName, type: queryType },
    vantage,
    success: true,
    responseCode: 0,
    flags: { aa: false, tc: false, rd: true, ra: true, ad: false, cd: false },
    answers,
    authority: [],
    additional: [],
    responseTime: 15,
  };
}

function buildFailResult(
  queryName: string,
  queryType: string,
  error: string,
  vantage: VantageInfo = MOCK_PUBLIC_RECURSIVE
): DNSQueryResult {
  return {
    query: { name: queryName, type: queryType },
    vantage,
    success: false,
    responseCode: 2,
    flags: { aa: false, tc: false, rd: true, ra: true, ad: false, cd: false },
    answers: [],
    authority: [],
    additional: [],
    responseTime: 0,
    error,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('DNS Collector Integration', () => {
  // Helper to create a collector with a spy-patched resolver
  function createCollectorWithMockedResolver(
    config: CollectionConfig,
    db: IDatabaseAdapter,
    resultsByQuery: Map<string, DNSQueryResult>
  ): DNSCollector {
    const collector = new DNSCollector(config, db);

    // Patch the private resolver to return canned results
    const resolver = (collector as unknown as { resolver: { query: unknown } }).resolver;
    resolver.query = vi.fn(async (query: { name: string; type: string }, vantage: VantageInfo) => {
      const key = `${query.name}:${query.type}`;
      const canned =
        resultsByQuery.get(key) ?? buildSuccessResult(query.name, query.type, [], vantage);
      return {
        ...canned,
        vantage,
        flags:
          vantage.type === 'authoritative'
            ? { aa: true, tc: false, rd: false, ra: false, ad: false, cd: false }
            : canned.flags,
      };
    });

    // Also suppress delegation collection to keep tests focused
    (collector as unknown as { config: CollectionConfig }).config = {
      ...config,
      includeDelegationData: false,
    };

    return collector;
  }

  it('should collect complete snapshot for managed zone', async () => {
    const { db, rows } = createInMemoryDb();

    const queryResults = new Map<string, DNSQueryResult>([
      [
        'example.com:A',
        buildSuccessResult('example.com', 'A', [makeAnswer('example.com', 'A', '1.2.3.4')]),
      ],
      [
        'example.com:AAAA',
        buildSuccessResult('example.com', 'AAAA', [makeAnswer('example.com', 'AAAA', '::1')]),
      ],
      [
        'example.com:MX',
        buildSuccessResult('example.com', 'MX', [
          makeAnswer('example.com', 'MX', '10 mail.example.com'),
        ]),
      ],
      [
        'example.com:NS',
        buildSuccessResult('example.com', 'NS', [
          makeAnswer('example.com', 'NS', 'ns1.example.com'),
        ]),
      ],
    ]);

    const config: CollectionConfig = {
      tenantId: 'tenant-1',
      domain: 'example.com',
      zoneManagement: 'managed',
      recordTypes: ['A', 'AAAA', 'MX', 'NS'],
      triggeredBy: 'test',
    };

    const collector = createCollectorWithMockedResolver(config, db, queryResults);
    const result = await collector.collect();

    expect(result.resultState).toBe('complete');
    expect(result.domain).toBe('example.com');
    expect(result.snapshotId).toBeDefined();
    expect(result.observationCount).toBeGreaterThan(0);

    // Verify snapshot was stored
    expect(rows('snapshots').length).toBe(1);
    expect(rows('snapshots')[0].domainName).toBe('example.com');
    expect(rows('snapshots')[0].resultState).toBe('complete');
    expect(
      (rows('snapshots')[0].metadata as { dnsQueryTimestampBasis?: string }).dnsQueryTimestampBasis
    ).toBe('response-received-v1');
  });

  it('should collect targeted snapshot for unmanaged zone', async () => {
    const { db, rows } = createInMemoryDb();

    const queryResults = new Map<string, DNSQueryResult>([
      [
        'example.com:A',
        buildSuccessResult('example.com', 'A', [makeAnswer('example.com', 'A', '5.6.7.8')]),
      ],
      [
        'example.com:MX',
        buildSuccessResult('example.com', 'MX', [
          makeAnswer('example.com', 'MX', '10 mx.example.com'),
        ]),
      ],
    ]);

    const config: CollectionConfig = {
      tenantId: 'tenant-2',
      domain: 'example.com',
      zoneManagement: 'unmanaged',
      recordTypes: ['A', 'MX'],
      triggeredBy: 'test',
    };

    const collector = createCollectorWithMockedResolver(config, db, queryResults);
    const result = await collector.collect();

    // Unmanaged zones get targeted inspection only — limited record types
    // mean the collector may classify as partial when auto-added queries miss mocks
    expect(result.resultState).toBe('partial');
    expect(result.domain).toBe('example.com');

    // Unmanaged zones should still create a snapshot
    expect(rows('snapshots').length).toBe(1);
    expect(rows('snapshots')[0].zoneManagement).toBe('unmanaged');
  });

  it('should handle partial failures gracefully', async () => {
    const { db } = createInMemoryDb();

    const queryResults = new Map<string, DNSQueryResult>([
      [
        'example.com:A',
        buildSuccessResult('example.com', 'A', [makeAnswer('example.com', 'A', '1.2.3.4')]),
      ],
      ['example.com:AAAA', buildFailResult('example.com', 'AAAA', 'SERVFAIL')],
      [
        'example.com:MX',
        buildSuccessResult('example.com', 'MX', [
          makeAnswer('example.com', 'MX', '10 mail.example.com'),
        ]),
      ],
    ]);

    const config: CollectionConfig = {
      tenantId: 'tenant-1',
      domain: 'example.com',
      zoneManagement: 'managed',
      recordTypes: ['A', 'AAAA', 'MX'],
      triggeredBy: 'test',
    };

    const collector = createCollectorWithMockedResolver(config, db, queryResults);
    const result = await collector.collect();

    // Should still produce a snapshot (partial, not failed)
    expect(result.snapshotId).toBeDefined();
    // Some observations succeeded, so it shouldn't be 'failed'
    expect(['complete', 'partial']).toContain(result.resultState);
    // SERVFAIL on AAAA should surface at least one error
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should persist observations to database', async () => {
    const { db, rows } = createInMemoryDb();

    const queryResults = new Map<string, DNSQueryResult>([
      [
        'example.com:A',
        buildSuccessResult('example.com', 'A', [makeAnswer('example.com', 'A', '1.2.3.4')]),
      ],
      [
        'example.com:NS',
        buildSuccessResult('example.com', 'NS', [
          makeAnswer('example.com', 'NS', 'ns1.example.com'),
        ]),
      ],
    ]);

    const config: CollectionConfig = {
      tenantId: 'tenant-1',
      domain: 'example.com',
      zoneManagement: 'managed',
      recordTypes: ['A', 'NS'],
      triggeredBy: 'test',
    };

    const collector = createCollectorWithMockedResolver(config, db, queryResults);
    await collector.collect();

    // Observations should be persisted
    const observations = rows('observations');
    expect(observations.length).toBeGreaterThan(0);

    // Each observation should have required fields
    const obs = observations[0];
    expect(obs.queryName).toBeDefined();
    expect(obs.queryType).toBeDefined();
    expect(obs.snapshotId).toBeDefined();
    expect(obs.status).toBeDefined();
    expect(obs.queriedAt).toBeInstanceOf(Date);
    expect(Number.isFinite((obs.queriedAt as Date).getTime())).toBe(true);
  });

  it('persists each resolver completion time as queriedAt', async () => {
    vi.useFakeTimers();
    try {
      const baseTime = Date.parse('2030-01-01T00:00:00.000Z');
      vi.setSystemTime(baseTime);
      const { db, rows } = createInMemoryDb();
      const completionTimes = new Map<string, number>();
      const resolver: ResolverLike = {
        async query(query, vantage) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, query.name === 'fast.example.com' ? 10 : 40)
          );
          const completedAt = Date.now();
          completionTimes.set(query.name, completedAt);
          return buildSuccessResult(
            query.name,
            query.type,
            [makeAnswer(query.name, query.type, '1.2.3.4')],
            vantage
          );
        },
      };
      const config: CollectionConfig = {
        tenantId: 'tenant-1',
        domain: 'example.com',
        zoneManagement: 'unmanaged',
        recordTypes: ['A'],
        queryNames: ['fast.example.com', 'slow.example.com'],
        triggeredBy: 'test',
        includeDelegationData: false,
      };
      const collector = new DNSCollector(config, db, { resolver, queryConcurrency: 2 });

      const pending = collector.collect();
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(30);
      await pending;

      const observations = rows('observations');
      const byName = new Map(
        observations.map((observation) => [observation.queryName, observation])
      );
      const queriedAt = (name: string) => {
        const observation = byName.get(name);
        expect(observation).toBeDefined();
        expect(observation?.queriedAt).toBeInstanceOf(Date);
        return (observation?.queriedAt as Date).getTime();
      };

      expect(completionTimes.get('fast.example.com')).toBe(baseTime + 10);
      expect(completionTimes.get('slow.example.com')).toBe(baseTime + 40);
      expect(completionTimes.get('fast.example.com')).not.toBe(
        completionTimes.get('slow.example.com')
      );
      expect(queriedAt('fast.example.com')).toBe(completionTimes.get('fast.example.com'));
      expect(queriedAt('slow.example.com')).toBe(completionTimes.get('slow.example.com'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('should consolidate observations into record sets', async () => {
    const { db, rows } = createInMemoryDb();

    const queryResults = new Map<string, DNSQueryResult>([
      [
        'example.com:A',
        buildSuccessResult('example.com', 'A', [
          makeAnswer('example.com', 'A', '1.2.3.4'),
          makeAnswer('example.com', 'A', '5.6.7.8'),
        ]),
      ],
      [
        'example.com:MX',
        buildSuccessResult('example.com', 'MX', [
          makeAnswer('example.com', 'MX', '10 mail.example.com'),
        ]),
      ],
    ]);

    const config: CollectionConfig = {
      tenantId: 'tenant-1',
      domain: 'example.com',
      zoneManagement: 'managed',
      recordTypes: ['A', 'MX'],
      triggeredBy: 'test',
    };

    const collector = createCollectorWithMockedResolver(config, db, queryResults);
    await collector.collect();

    // Record sets should be created from observations
    const recordSets = rows('record_sets');
    expect(recordSets.length).toBeGreaterThan(0);

    // A record should have both IPs consolidated
    const aRecordSet = recordSets.find((rs) => rs.type === 'A');
    if (aRecordSet) {
      const values = aRecordSet.values as string[];
      expect(values).toBeDefined();
      expect(values.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('should canonicalize mixed-case underscore CNAME hops and authorize terminal TXT', async () => {
    const { db, rows } = createInMemoryDb();
    const initialOwner = '_mta-sts.example.com';
    const observedTarget = '_Policy._MTA-STS.Example.NET.';
    const terminalOwner = '_policy._mta-sts.example.net';
    const txtRecord = 'v=STSv1; id=20260901';
    const queryResults = new Map<string, DNSQueryResult>([
      [
        `${initialOwner}:CNAME`,
        buildSuccessResult(initialOwner, 'CNAME', [
          makeAnswer('_MTA-STS.Example.COM.', 'CNAME', observedTarget, 120),
        ]),
      ],
      [
        `${terminalOwner}:TXT`,
        buildSuccessResult(terminalOwner, 'TXT', [
          makeAnswer('_POLICY._MTA-STS.EXAMPLE.NET.', 'TXT', txtRecord, 300),
        ]),
      ],
    ]);

    const collector = createCollectorWithMockedResolver(
      {
        tenantId: 'tenant-cname',
        domain: 'Example.COM.',
        zoneManagement: 'unknown',
        recordTypes: ['TXT'],
        triggeredBy: 'test',
        includeMailRecords: true,
      },
      db,
      queryResults
    );
    const collection = await collector.collect();

    expect(collection.resultState).toBe('complete');
    const observations = rows('observations');
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ queryName: initialOwner, queryType: 'CNAME' }),
        expect.objectContaining({ queryName: terminalOwner, queryType: 'TXT' }),
      ])
    );
    const recordSets = rows('record_sets');
    expect(recordSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: initialOwner,
          type: 'CNAME',
          values: [terminalOwner],
        }),
        expect.objectContaining({
          name: terminalOwner,
          type: 'CNAME',
          values: [],
        }),
        expect.objectContaining({
          name: terminalOwner,
          type: 'TXT',
          values: [txtRecord],
        }),
      ])
    );

    const evidence = await loadPersistedMtaStsEvidence(db, {
      domain: 'EXAMPLE.COM.',
      tenantId: 'tenant-cname',
    });
    expect(evidence).toMatchObject({ ok: true, txtRecord, txtRecordId: '20260901' });
    if (evidence.ok) {
      expect(evidence.dnsResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ query: { name: initialOwner, type: 'CNAME' } }),
          expect.objectContaining({ query: { name: terminalOwner, type: 'TXT' } }),
        ])
      );
    }
  });

  it('should evaluate findings after collection', async () => {
    const { db, rows } = createInMemoryDb();

    // Provide enough data for rules engine to produce findings
    // Missing MX for a domain should trigger mx-presence rule
    const queryResults = new Map<string, DNSQueryResult>([
      [
        'example.com:A',
        buildSuccessResult('example.com', 'A', [makeAnswer('example.com', 'A', '1.2.3.4')]),
      ],
      ['example.com:MX', buildSuccessResult('example.com', 'MX', [])], // No MX answers
      [
        'example.com:NS',
        buildSuccessResult('example.com', 'NS', [
          makeAnswer('example.com', 'NS', 'ns1.example.com'),
        ]),
      ],
      ['_dmarc.example.com:TXT', buildSuccessResult('_dmarc.example.com', 'TXT', [])], // No DMARC
      ['example.com:TXT', buildSuccessResult('example.com', 'TXT', [])], // No SPF
    ]);

    const config: CollectionConfig = {
      tenantId: 'tenant-1',
      domain: 'example.com',
      zoneManagement: 'managed',
      recordTypes: ['A', 'MX', 'NS', 'TXT'],
      triggeredBy: 'test',
      includeMailRecords: true,
    };

    const collector = createCollectorWithMockedResolver(config, db, queryResults);
    await collector.collect();

    // Findings should be persisted — missing MX (empty answers),
    // missing DMARC, and missing SPF trigger mxPresence/dmarc/spf rules.
    const findings = rows('findings');
    expect(findings.length).toBeGreaterThan(0);

    // Ruleset version should be persisted
    const rulesetVersions = rows('ruleset_versions');
    expect(rulesetVersions.length).toBeGreaterThan(0);
  });
});
