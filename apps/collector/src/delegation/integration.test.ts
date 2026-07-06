/**
 * Delegation Integration Tests
 *
 * Verifies the full delegation evidence chain:
 * - Parent-NS lookup → divergence detection → lame delegation → DNSSEC metadata
 * - Delegation summary → snapshot metadata persistence via DNSCollector
 *
 * Uses a mocked resolver and in-memory DB adapter (same pattern as dns/integration.test.ts).
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DNSCollector } from '../dns/collector.js';
import type { CollectionConfig, DNSQueryResult, VantageInfo } from '../dns/types.js';
import { DelegationCollector } from './collector.js';

// ── Mock dnssec-resolver for DNSKEY/DS queries ────────────────────────────

// vi.hoisted ensures mocks are available during vi.mock hoisting
const mockQueryDNSKEY = vi.hoisted(() => vi.fn());
const mockQueryDS = vi.hoisted(() => vi.fn());
// TB-2 routes MX/TXT/NS/CNAME/SOA/CAA through queryWithDnsPacket inside
// DNSResolver. DelegationCollector builds its OWN resolver, so NS queries in
// the delegation chain reach this mock (the DNSCollector resolver patch does
// not cover it). Default returns empty NOERROR; overridden per-test where
// canned delegation NS data is required.
const mockQueryWithDnsPacket = vi.hoisted(() => vi.fn());

vi.mock('../dns/dnssec-resolver.js', () => ({
  queryDNSKEY: mockQueryDNSKEY,
  queryDS: mockQueryDS,
  queryWithDnsPacket: mockQueryWithDnsPacket,
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeAnswer(name: string, type: string, data: string, ttl = 300) {
  return { name, type, ttl, data };
}

const PUBLIC_RECURSIVE: VantageInfo = {
  type: 'public-recursive',
  identifier: '8.8.8.8',
  region: 'us-central',
};

function buildSuccessResult(
  queryName: string,
  queryType: string,
  answers: ReturnType<typeof makeAnswer>[],
  vantage: VantageInfo = PUBLIC_RECURSIVE,
  extra?: {
    flags?: Record<string, boolean>;
    authority?: ReturnType<typeof makeAnswer>[];
    additional?: ReturnType<typeof makeAnswer>[];
  }
): DNSQueryResult {
  return {
    query: { name: queryName, type: queryType },
    vantage,
    success: true,
    responseCode: 0,
    flags: { aa: false, tc: false, rd: true, ra: true, ad: false, cd: false, ...extra?.flags },
    answers,
    authority: extra?.authority ?? [],
    additional: extra?.additional ?? [],
    responseTime: 12,
  };
}

/**
 * Build the raw dns-packet sections shape that queryWithDnsPacket returns
 * (and DNSResolver.queryViaDnsPacket consumes): responseCode + answer /
 * authority / additional sections. NOERROR (responseCode 0) by default.
 */
function buildDnsPacketSections(
  answers: ReturnType<typeof makeAnswer>[],
  extra?: {
    responseCode?: number;
    authority?: ReturnType<typeof makeAnswer>[];
    additional?: ReturnType<typeof makeAnswer>[];
  }
) {
  return {
    responseCode: extra?.responseCode ?? 0,
    answers,
    authority: extra?.authority ?? [],
    additional: extra?.additional ?? [],
    flags: { aa: false, tc: false, rd: true, ra: true, ad: false, cd: false },
  };
}

// ── In-memory DB (mirrors dns/integration.test.ts) ───────────────────────

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

  function getConditionParam(condition: unknown): unknown {
    const sql = condition as {
      queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
    };
    return sql.queryChunks?.find((c) => c?.constructor?.name === 'Param')?.value;
  }

  const db: IDatabaseAdapter = {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => [...rows(getTable(table))]),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTable(table);
      const param = getConditionParam(condition);
      return rows(name).filter((r) => Object.values(r).some((v) => v === param));
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTable(table);
      const param = getConditionParam(condition);
      return rows(name).find((r) => Object.values(r).some((v) => v === param));
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
      const param = getConditionParam(condition);
      const target = rows(name).find((r) => Object.values(r).some((v) => v === param));
      if (target) Object.assign(target, values);
      return target ? [target] : [];
    }),
    updateOne: vi.fn(async () => undefined),
    delete: vi.fn(async () => 0),
  } as unknown as IDatabaseAdapter;

  return { db, tables, rows };
}

// ── Mock resolver factory ────────────────────────────────────────────────

function patchResolver(target: unknown, resultsByQuery: Map<string, DNSQueryResult>) {
  const obj = target as { resolver: { query: unknown } };
  obj.resolver.query = vi.fn(
    async (query: { name: string; type: string }, vantage: VantageInfo) => {
      const key = `${query.name}:${query.type}:${vantage.identifier}`;
      const fallbackKey = `${query.name}:${query.type}`;
      return (
        resultsByQuery.get(key) ??
        resultsByQuery.get(fallbackKey) ??
        buildSuccessResult(query.name, query.type, [], vantage)
      );
    }
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Delegation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: well-formed empty NOERROR sections for the dns-packet raw path.
    // Tests needing canned delegation NS data override this per-test.
    mockQueryWithDnsPacket.mockResolvedValue(buildDnsPacketSections([]));
  });

  describe('DelegationCollector full chain', () => {
    it('should produce a complete delegation summary with DNSSEC info', async () => {
      const collector = new DelegationCollector('example.com');

      const queryResults = new Map<string, DNSQueryResult>([
        // Parent NS lookup
        [
          'example.com:NS',
          buildSuccessResult(
            'example.com',
            'NS',
            [
              makeAnswer('example.com', 'NS', 'ns1.example.com'),
              makeAnswer('example.com', 'NS', 'ns2.example.com'),
            ],
            PUBLIC_RECURSIVE,
            {
              additional: [
                makeAnswer('ns1.example.com', 'A', '192.0.2.1'),
                makeAnswer('ns2.example.com', 'A', '192.0.2.2'),
              ],
            }
          ),
        ],
        // Authoritative responses (both agree)
        [
          'example.com:NS:ns1.example.com',
          buildSuccessResult(
            'example.com',
            'NS',
            [
              makeAnswer('example.com', 'NS', 'ns1.example.com'),
              makeAnswer('example.com', 'NS', 'ns2.example.com'),
            ],
            { type: 'authoritative', identifier: 'ns1.example.com' },
            { flags: { aa: true } }
          ),
        ],
        [
          'example.com:NS:ns2.example.com',
          buildSuccessResult(
            'example.com',
            'NS',
            [
              makeAnswer('example.com', 'NS', 'ns1.example.com'),
              makeAnswer('example.com', 'NS', 'ns2.example.com'),
            ],
            { type: 'authoritative', identifier: 'ns2.example.com' },
            { flags: { aa: true } }
          ),
        ],
        // Sample A query with AD flag for DNSSEC
        [
          'example.com:A',
          buildSuccessResult(
            'example.com',
            'A',
            [makeAnswer('example.com', 'A', '192.0.2.1')],
            PUBLIC_RECURSIVE,
            {
              flags: { ad: true },
              authority: [makeAnswer('example.com', 'RRSIG', 'A 8 2 300...')],
            }
          ),
        ],
      ]);

      // Mock DNSKEY and DS queries
      mockQueryDNSKEY.mockResolvedValueOnce({
        success: true,
        answers: [
          makeAnswer('example.com', 'DNSKEY', '256 3 8 AwEAA...'),
          makeAnswer('example.com', 'DNSKEY', '257 3 8 AwEAA...'),
        ],
      });
      mockQueryDS.mockResolvedValueOnce({
        success: true,
        answers: [makeAnswer('example.com', 'DS', '12345 8 2 abc...')],
      });

      patchResolver(collector, queryResults);

      const summary = await collector.collectDelegationSummary('8.8.8.8');

      // Parent NS
      expect(summary.parentNs).toHaveLength(2);
      expect(summary.parentZone).toBe('com');

      // Glue records present
      expect(summary.glueRecords).toHaveLength(2);
      expect(summary.missingGlue).toHaveLength(0);

      // No divergence (both NS servers agree)
      expect(summary.hasDivergence).toBe(false);
      expect(summary.divergenceDetails).toHaveLength(0);

      // No lame delegation
      expect(summary.lameDelegations).toHaveLength(0);

      // DNSSEC info
      expect(summary.dnssecInfo).not.toBeNull();
      expect(summary.dnssecInfo?.adFlagSet).toBe(true);
      expect(summary.dnssecInfo?.hasRrsig).toBe(true);
      expect(summary.dnssecInfo?.dnskeyRecords).toHaveLength(2);
      expect(summary.dnssecInfo?.dsRecords).toHaveLength(1);
    });

    it('should detect divergence + lame delegation in a mixed scenario', async () => {
      const collector = new DelegationCollector('broken.example.com');

      const queryResults = new Map<string, DNSQueryResult>([
        // Parent NS lookup
        [
          'broken.example.com:NS',
          buildSuccessResult(
            'broken.example.com',
            'NS',
            [
              makeAnswer('broken.example.com', 'NS', 'ns1.broken.example.com'),
              makeAnswer('broken.example.com', 'NS', 'ns2.broken.example.com'),
              makeAnswer('broken.example.com', 'NS', 'ns3.broken.example.com'),
            ],
            PUBLIC_RECURSIVE,
            {
              additional: [
                makeAnswer('ns1.broken.example.com', 'A', '192.0.2.10'),
                // ns2 and ns3 missing glue
              ],
            }
          ),
        ],
        // ns1: authoritative, different answer
        [
          'broken.example.com:NS:ns1.broken.example.com',
          buildSuccessResult(
            'broken.example.com',
            'NS',
            [makeAnswer('broken.example.com', 'NS', 'ns1.broken.example.com')],
            { type: 'authoritative', identifier: 'ns1.broken.example.com' },
            { flags: { aa: true } }
          ),
        ],
        // ns2: authoritative, different answer (divergence)
        [
          'broken.example.com:NS:ns2.broken.example.com',
          buildSuccessResult(
            'broken.example.com',
            'NS',
            [
              makeAnswer('broken.example.com', 'NS', 'ns1.broken.example.com'),
              makeAnswer('broken.example.com', 'NS', 'ns2.broken.example.com'),
            ],
            { type: 'authoritative', identifier: 'ns2.broken.example.com' },
            { flags: { aa: true } }
          ),
        ],
        // ns3: timeout (lame)
        [
          'broken.example.com:NS:ns3.broken.example.com',
          {
            query: { name: 'broken.example.com', type: 'NS' },
            vantage: { type: 'authoritative', identifier: 'ns3.broken.example.com' },
            success: false,
            responseCode: 2,
            flags: {},
            answers: [],
            authority: [],
            additional: [],
            responseTime: 5000,
            error: 'timeout',
          } as DNSQueryResult,
        ],
        // DNSKEY / DS / A for DNSSEC (no DNSSEC)
        ['broken.example.com:DNSKEY', buildSuccessResult('broken.example.com', 'DNSKEY', [])],
        ['broken.example.com:DS', buildSuccessResult('broken.example.com', 'DS', [])],
        ['broken.example.com:A', buildSuccessResult('broken.example.com', 'A', [])],
      ]);

      patchResolver(collector, queryResults);

      const summary = await collector.collectDelegationSummary('8.8.8.8');

      // Divergence: ns1 and ns2 return different NS sets
      expect(summary.hasDivergence).toBe(true);
      expect(summary.divergenceDetails.length).toBeGreaterThan(0);

      // Lame delegation: ns3 timed out
      expect(summary.lameDelegations).toHaveLength(1);
      expect(summary.lameDelegations[0].server).toBe('ns3.broken.example.com');
      expect(summary.lameDelegations[0].reason).toBe('timeout');

      // Missing glue for in-zone NS
      expect(summary.missingGlue.length).toBeGreaterThan(0);

      // No DNSSEC
      expect(summary.dnssecInfo?.dnskeyRecords).toHaveLength(0);
      expect(summary.dnssecInfo?.dsRecords).toHaveLength(0);
    });
  });

  describe('Delegation data in snapshot metadata', () => {
    it('should persist delegation evidence into snapshot metadata via DNSCollector', async () => {
      const { db, rows } = createInMemoryDb();

      const queryResults = new Map<string, DNSQueryResult>([
        // Standard DNS queries
        [
          'example.com:A',
          buildSuccessResult('example.com', 'A', [makeAnswer('example.com', 'A', '1.2.3.4')]),
        ],
        [
          'example.com:NS',
          buildSuccessResult(
            'example.com',
            'NS',
            [
              makeAnswer('example.com', 'NS', 'ns1.example.com'),
              makeAnswer('example.com', 'NS', 'ns2.example.com'),
            ],
            PUBLIC_RECURSIVE,
            {
              additional: [
                makeAnswer('ns1.example.com', 'A', '192.0.2.1'),
                makeAnswer('ns2.example.com', 'A', '192.0.2.2'),
              ],
            }
          ),
        ],
        // Auth server responses for delegation
        [
          'example.com:NS:ns1.example.com',
          buildSuccessResult(
            'example.com',
            'NS',
            [
              makeAnswer('example.com', 'NS', 'ns1.example.com'),
              makeAnswer('example.com', 'NS', 'ns2.example.com'),
            ],
            { type: 'authoritative', identifier: 'ns1.example.com' },
            { flags: { aa: true } }
          ),
        ],
        [
          'example.com:NS:ns2.example.com',
          buildSuccessResult(
            'example.com',
            'NS',
            [
              makeAnswer('example.com', 'NS', 'ns1.example.com'),
              makeAnswer('example.com', 'NS', 'ns2.example.com'),
            ],
            { type: 'authoritative', identifier: 'ns2.example.com' },
            { flags: { aa: true } }
          ),
        ],
        // DNSSEC queries
        [
          'example.com:DNSKEY',
          buildSuccessResult('example.com', 'DNSKEY', [
            makeAnswer('example.com', 'DNSKEY', '256 3 8 AwEAA...'),
          ]),
        ],
        [
          'example.com:DS',
          buildSuccessResult('example.com', 'DS', [
            makeAnswer('example.com', 'DS', '12345 8 2 abc...'),
          ]),
        ],
      ]);

      const config: CollectionConfig = {
        tenantId: 'tenant-delegation',
        domain: 'example.com',
        zoneManagement: 'managed',
        recordTypes: ['A', 'NS'],
        triggeredBy: 'test',
        includeDelegationData: true,
      };

      const collector = new DNSCollector(config, db);
      patchResolver(collector, queryResults);

      // TB-2: DelegationCollector constructs its own DNSResolver, whose NS
      // queries now flow through queryWithDnsPacket (dns-packet raw path).
      // Return the canned NS set from every vantage so parentNs/nsServers are
      // non-empty and the authoritative servers agree (no divergence). The
      // DNSCollector-resolver patch above does not reach this fresh resolver.
      mockQueryWithDnsPacket.mockImplementation(async (query: { type: string }) => {
        if (query.type === 'NS') {
          return buildDnsPacketSections(
            [
              makeAnswer('example.com', 'NS', 'ns1.example.com'),
              makeAnswer('example.com', 'NS', 'ns2.example.com'),
            ],
            {
              additional: [
                makeAnswer('ns1.example.com', 'A', '192.0.2.1'),
                makeAnswer('ns2.example.com', 'A', '192.0.2.2'),
              ],
            }
          );
        }
        return buildDnsPacketSections([]);
      });

      const result = await collector.collect();

      expect(result.snapshotId).toBeDefined();
      expect(result.resultState).toBe('complete');

      // Verify snapshot metadata contains delegation data
      const snapshots = rows('snapshots');
      expect(snapshots).toHaveLength(1);

      const metadata = snapshots[0].metadata as Record<string, unknown> | null;
      expect(metadata).toBeDefined();

      if (metadata) {
        expect(metadata.hasDelegationData).toBe(true);
        expect(metadata.parentZone).toBe('com');
        expect(metadata.nsServers).toBeDefined();
        expect((metadata.nsServers as string[]).length).toBeGreaterThan(0);
        expect(metadata.hasDivergence).toBe(false);
      }
    });
  });
});
