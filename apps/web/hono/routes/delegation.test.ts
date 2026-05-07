/**
 * Delegation Routes Tests - Bead dns-ops-1j4.6.5
 *
 * Tests for delegation analysis endpoints:
 * - /api/snapshot/:snapshotId/delegation
 * - /api/snapshot/:snapshotId/delegation/issues
 * - /api/domain/:domain/delegation/latest
 *
 * Validation areas:
 * - Delegation data retrieval from stored snapshots
 * - Issue detection (divergence, missing glue)
 * - Handling of snapshots with/without delegation data
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { delegationRoutes } from './delegation.js';

// Type helpers
type JsonBody = Record<string, unknown>;

// =============================================================================
// MOCK DATABASE SETUP
// =============================================================================

interface MockSnapshot {
  id: string;
  domainId: string;
  domainName: string;
  resultState: string;
  metadata?: {
    hasDelegationData?: boolean;
    parentZone?: string;
    nsServers?: string[];
    hasDivergence?: boolean;
    divergenceDetails?: Array<{
      queryName: string;
      queryType: string;
      groups: Array<{
        servers: string[];
        signature: string;
      }>;
      totalServers: number;
    }>;
    missingGlue?: string[];
    lameDelegations?: Array<{
      server: string;
      reason: string;
    }>;
    hasDnssec?: boolean;
  };
  createdAt: Date;
}

interface MockObservation {
  id: string;
  snapshotId: string;
  queryName: string;
  queryType: string;
  vantageType: string;
  vantageIdentifier: string;
  status: string;
  answerSection: Array<{ name: string; type: string; data: string; ttl: number }>;
}

interface MockDomain {
  id: string;
  name: string;
  normalizedName: string;
  tenantId: string;
  createdAt: Date;
}

interface MockData {
  snapshots: MockSnapshot[];
  observations: MockObservation[];
  domains: MockDomain[];
}

function createMockData(): MockData {
  const now = new Date();
  return {
    snapshots: [
      {
        id: 'snap-with-delegation',
        domainId: 'domain-1',
        domainName: 'example.com',
        resultState: 'complete',
        metadata: {
          hasDelegationData: true,
          parentZone: 'com',
          nsServers: ['ns1.example.com', 'ns2.example.com'],
          hasDivergence: false,
          divergenceDetails: [],
          missingGlue: [],
          lameDelegations: [],
          hasDnssec: true,
        },
        createdAt: now,
      },
      {
        id: 'snap-with-divergence',
        domainId: 'domain-2',
        domainName: 'divergent.com',
        resultState: 'complete',
        metadata: {
          hasDelegationData: true,
          parentZone: 'com',
          nsServers: ['ns1.divergent.com', 'ns2.divergent.com'],
          hasDivergence: true,
          divergenceDetails: [
            {
              queryName: 'divergent.com',
              queryType: 'NS',
              groups: [
                {
                  servers: ['ns1.divergent.com'],
                  signature: 'ns1.divergent.com,ns2.divergent.com',
                },
                {
                  servers: ['ns2.divergent.com'],
                  signature: 'ns1.divergent.com,ns3.divergent.com',
                },
              ],
              totalServers: 2,
            },
          ],
          missingGlue: ['ns1.divergent.com'],
          lameDelegations: [],
          hasDnssec: false,
        },
        createdAt: now,
      },
      {
        id: 'snap-without-delegation',
        domainId: 'domain-3',
        domainName: 'nodelegation.com',
        resultState: 'complete',
        metadata: undefined,
        createdAt: now,
      },
    ],
    observations: [
      // Observations for snap-with-delegation
      {
        id: 'obs-1',
        snapshotId: 'snap-with-delegation',
        queryName: 'example.com',
        queryType: 'NS',
        vantageType: 'public-recursive',
        vantageIdentifier: '8.8.8.8',
        status: 'success',
        answerSection: [
          { name: 'example.com', type: 'NS', data: 'ns1.example.com', ttl: 86400 },
          { name: 'example.com', type: 'NS', data: 'ns2.example.com', ttl: 86400 },
        ],
      },
      // Glue records for snap-with-delegation (required to avoid missing-glue issues)
      {
        id: 'obs-glue-1',
        snapshotId: 'snap-with-delegation',
        queryName: 'ns1.example.com',
        queryType: 'A',
        vantageType: 'parent-zone',
        vantageIdentifier: 'a.gtld-servers.net',
        status: 'success',
        answerSection: [{ name: 'ns1.example.com', type: 'A', data: '192.0.2.1', ttl: 172800 }],
      },
      {
        id: 'obs-glue-2',
        snapshotId: 'snap-with-delegation',
        queryName: 'ns2.example.com',
        queryType: 'A',
        vantageType: 'parent-zone',
        vantageIdentifier: 'a.gtld-servers.net',
        status: 'success',
        answerSection: [{ name: 'ns2.example.com', type: 'A', data: '192.0.2.2', ttl: 172800 }],
      },
      // Observations for snap-with-divergence with different NS answers
      {
        id: 'obs-2',
        snapshotId: 'snap-with-divergence',
        queryName: 'divergent.com',
        queryType: 'NS',
        vantageType: 'authoritative',
        vantageIdentifier: 'ns1.divergent.com',
        status: 'success',
        answerSection: [
          { name: 'divergent.com', type: 'NS', data: 'ns1.divergent.com', ttl: 86400 },
          { name: 'divergent.com', type: 'NS', data: 'ns2.divergent.com', ttl: 86400 },
        ],
      },
      {
        id: 'obs-3',
        snapshotId: 'snap-with-divergence',
        queryName: 'divergent.com',
        queryType: 'NS',
        vantageType: 'authoritative',
        vantageIdentifier: 'ns2.divergent.com',
        status: 'success',
        answerSection: [
          { name: 'divergent.com', type: 'NS', data: 'ns1.divergent.com', ttl: 86400 },
          { name: 'divergent.com', type: 'NS', data: 'ns3.divergent.com', ttl: 86400 },
        ],
      },
    ],
    domains: [
      {
        id: 'domain-1',
        name: 'example.com',
        normalizedName: 'example.com',
        tenantId: 'test-tenant',
        createdAt: now,
      },
      {
        id: 'domain-2',
        name: 'divergent.com',
        normalizedName: 'divergent.com',
        tenantId: 'test-tenant',
        createdAt: now,
      },
      {
        id: 'domain-3',
        name: 'nodelegation.com',
        normalizedName: 'nodelegation.com',
        tenantId: 'test-tenant',
        createdAt: now,
      },
      // Cross-tenant domain for isolation tests
      {
        id: 'domain-other',
        name: 'other-tenant.com',
        normalizedName: 'other-tenant.com',
        tenantId: 'other-tenant',
        createdAt: now,
      },
    ],
  };
}

// Helper to extract table name from Drizzle table object
function getTableName(table: unknown): string {
  const drizzleNameSymbol = Symbol.for('drizzle:Name');
  const t = table as Record<symbol | string, unknown>;
  if (t[drizzleNameSymbol]) return t[drizzleNameSymbol] as string;
  if (
    t._ &&
    typeof t._ === 'object' &&
    'name' in t._ &&
    typeof (t._ as Record<string, string>).name === 'string'
  ) {
    return (t._ as Record<string, string>).name;
  }
  return '';
}

function createMockDb(data: MockData) {
  const tableNameMap: Record<string, 'snapshots' | 'observations' | 'domains'> = {
    snapshots: 'snapshots',
    observations: 'observations',
    domains: 'domains',
  };

  const getTable = (table: unknown): 'snapshots' | 'observations' | 'domains' | '' => {
    const name = getTableName(table);
    return tableNameMap[name] || '';
  };

  return {
    selectOne: vi.fn(async (table: unknown, _condition: unknown) => {
      const tableName = getTable(table);
      if (tableName === 'snapshots') {
        // The condition contains the ID, but we can't easily parse SQL expressions
        // For testing, we return based on what the test needs
        return data.snapshots[0];
      }
      if (tableName === 'domains') {
        // Return first domain for findByName queries
        return data.domains[0] ?? null;
      }
      return undefined;
    }),
    selectWhere: vi.fn(async (table: unknown, _condition: unknown) => {
      const tableName = getTable(table);
      if (tableName === 'observations') {
        return data.observations;
      }
      if (tableName === 'snapshots') {
        return data.snapshots;
      }
      if (tableName === 'domains') {
        return data.domains;
      }
      return [];
    }),
    select: vi.fn(async (table: unknown) => {
      const tableName = getTable(table);
      if (tableName === 'snapshots') {
        return data.snapshots;
      }
      if (tableName === 'observations') {
        return data.observations;
      }
      if (tableName === 'domains') {
        return data.domains;
      }
      return [];
    }),
    findById: vi.fn(async (table: unknown, id: string) => {
      const name = getTableName(table);
      if (name === 'domains') {
        return data.domains.find((d) => d.id === id) ?? null;
      }
      if (name === 'snapshots') {
        return data.snapshots.find((s) => s.id === id) ?? null;
      }
      return null;
    }),
  };
}

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Delegation Routes', () => {
  let app: Hono<Env>;
  let mockData: MockData;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockData = createMockData();
    mockDb = createMockDb(mockData);

    app = new Hono<Env>();

    // Setup middleware to inject dependencies
    app.use('*', (c, next) => {
      c.set('db', mockDb as unknown as Env['Variables']['db']);
      c.set('tenantId', 'test-tenant');
      c.set('actorId', 'test-actor');
      return next();
    });

    app.route('/api', delegationRoutes);
  });

  // ===========================================================================
  // GET /api/snapshot/:snapshotId/delegation
  // ===========================================================================

  describe('GET /api/snapshot/:snapshotId/delegation', () => {
    it('should return delegation data for snapshot with delegation metadata', async () => {
      // Configure mock to return snapshot with delegation
      mockDb.selectOne = vi.fn(async () => mockData.snapshots[0]); // snap-with-delegation
      mockDb.selectWhere = vi.fn(async () =>
        mockData.observations.filter((o) => o.snapshotId === 'snap-with-delegation')
      );

      const res = await app.request('/api/snapshot/snap-with-delegation/delegation');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.snapshotId).toBe('snap-with-delegation');
      expect(body.delegation).toBeDefined();

      const delegation = body.delegation as JsonBody;
      expect(delegation.domain).toBe('example.com');
      expect(delegation.parentZone).toBe('com');
      expect(delegation.hasDivergence).toBe(false);
      expect(delegation.hasDnssec).toBe(true);
    });

    it('should return message when snapshot has no delegation data', async () => {
      // Configure mock to return snapshot without delegation
      mockDb.selectOne = vi.fn(async () => mockData.snapshots[2]); // snap-without-delegation
      mockDb.selectWhere = vi.fn(async () => []);

      const res = await app.request('/api/snapshot/snap-without-delegation/delegation');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.snapshotId).toBe('snap-without-delegation');
      expect(body.delegation).toBeNull();
      expect(body.message).toContain('No delegation data');
    });

    it('should return 404 for non-existent snapshot', async () => {
      mockDb.selectOne = vi.fn(async () => undefined);

      const res = await app.request('/api/snapshot/nonexistent/delegation');

      expect(res.status).toBe(404);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Snapshot not found');
    });

    it('should include nameServers from observations', async () => {
      mockDb.selectOne = vi.fn(async () => mockData.snapshots[0]);
      mockDb.selectWhere = vi.fn(async () =>
        mockData.observations.filter((o) => o.snapshotId === 'snap-with-delegation')
      );

      const res = await app.request('/api/snapshot/snap-with-delegation/delegation');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      const delegation = body.delegation as JsonBody;
      expect(delegation.nameServers).toBeDefined();
      expect(Array.isArray(delegation.nameServers)).toBe(true);
    });
  });

  // ===========================================================================
  // GET /api/snapshot/:snapshotId/delegation/issues
  // ===========================================================================

  describe('GET /api/snapshot/:snapshotId/delegation/issues', () => {
    it('should return empty issues for healthy delegation', async () => {
      mockDb.selectOne = vi.fn(async () => mockData.snapshots[0]); // healthy
      mockDb.selectWhere = vi.fn(async () =>
        mockData.observations.filter((o) => o.snapshotId === 'snap-with-delegation')
      );

      const res = await app.request('/api/snapshot/snap-with-delegation/delegation/issues');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.snapshotId).toBe('snap-with-delegation');
      expect(body.domain).toBe('example.com');
      expect(body.issues).toBeDefined();
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issueCount).toBe(0);
    });

    it('should detect NS divergence issue', async () => {
      mockDb.selectOne = vi.fn(async () => mockData.snapshots[1]); // divergent
      mockDb.selectWhere = vi.fn(async () =>
        mockData.observations.filter((o) => o.snapshotId === 'snap-with-divergence')
      );

      const res = await app.request('/api/snapshot/snap-with-divergence/delegation/issues');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      const issues = body.issues as Array<{ type: string; severity: string }>;

      // Should have at least one divergence issue (from different NS answers)
      const divergenceIssue = issues.find((i) => i.type === 'ns-divergence');
      expect(divergenceIssue).toBeDefined();
      if (divergenceIssue) {
        expect(divergenceIssue.severity).toBe('critical');
      }
    });

    it('should return 404 for non-existent snapshot', async () => {
      mockDb.selectOne = vi.fn(async () => undefined);

      const res = await app.request('/api/snapshot/nonexistent/delegation/issues');

      expect(res.status).toBe(404);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Snapshot not found');
    });

    it('should include issue count', async () => {
      mockDb.selectOne = vi.fn(async () => mockData.snapshots[0]);
      mockDb.selectWhere = vi.fn(async () => []);

      const res = await app.request('/api/snapshot/snap-with-delegation/delegation/issues');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(typeof body.issueCount).toBe('number');
    });
  });

  // ===========================================================================
  // GET /api/domain/:domain/delegation/latest
  // ===========================================================================

  describe('GET /api/domain/:domain/delegation/latest', () => {
    it('should redirect to snapshot-specific endpoint when delegation data exists', async () => {
      // findByDomain returns snapshots with delegation after domain lookup succeeds.
      mockDb.selectWhere = vi.fn(async (table: unknown) => {
        const tableName = getTableName(table);
        if (tableName === 'domains') return [mockData.domains[0]];
        if (tableName === 'snapshots') return [mockData.snapshots[0]];
        return [];
      });

      const res = await app.request('/api/domain/example.com/delegation/latest', {
        redirect: 'manual',
      });

      // Should be a redirect (302 or 307) or success if following
      expect([302, 307, 308].includes(res.status) || res.status === 200).toBe(true);
    });

    it('should return 404 when no delegation data for domain', async () => {
      // Return snapshots without delegation after domain lookup succeeds.
      mockDb.selectWhere = vi.fn(async (table: unknown) => {
        const tableName = getTableName(table);
        if (tableName === 'domains') return [mockData.domains[2]];
        if (tableName === 'snapshots') return [mockData.snapshots[2]];
        return [];
      });

      const res = await app.request('/api/domain/nodelegation.com/delegation/latest');

      expect(res.status).toBe(404);
      const body = (await res.json()) as JsonBody;
      expect(body.domain).toBe('nodelegation.com');
      expect(body.message).toContain('No delegation data');
    });

    it('should return 404 for non-existent domain', async () => {
      mockDb.selectWhere = vi.fn(async () => []);

      const res = await app.request('/api/domain/nonexistent.com/delegation/latest');

      expect(res.status).toBe(404);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Domain not found');
    });
  });

  // ===========================================================================
  // DELEGATION DATA STRUCTURE TESTS
  // ===========================================================================

  describe('Delegation Data Structure', () => {
    it('should include all required fields in delegation response', async () => {
      mockDb.selectOne = vi.fn(async () => mockData.snapshots[0]);
      mockDb.selectWhere = vi.fn(async () =>
        mockData.observations.filter((o) => o.snapshotId === 'snap-with-delegation')
      );

      const res = await app.request('/api/snapshot/snap-with-delegation/delegation');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      const delegation = body.delegation as JsonBody;

      // Required fields
      expect(delegation).toHaveProperty('domain');
      expect(delegation).toHaveProperty('parentZone');
      expect(delegation).toHaveProperty('nameServers');
      expect(delegation).toHaveProperty('glue');
      expect(delegation).toHaveProperty('hasDivergence');
      expect(delegation).toHaveProperty('hasDnssec');
    });

    it('should include nameServer source information', async () => {
      mockDb.selectOne = vi.fn(async () => mockData.snapshots[0]);
      mockDb.selectWhere = vi.fn(async () =>
        mockData.observations.filter((o) => o.snapshotId === 'snap-with-delegation')
      );

      const res = await app.request('/api/snapshot/snap-with-delegation/delegation');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      const delegation = body.delegation as JsonBody;
      const nameServers = delegation.nameServers as Array<{ name: string; source?: string }>;

      if (nameServers.length > 0) {
        expect(nameServers[0]).toHaveProperty('name');
        expect(nameServers[0]).toHaveProperty('source');
      }
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle snapshot with empty metadata', async () => {
      const emptyMetadataSnapshot = {
        id: 'snap-empty-metadata',
        domainId: 'domain-4',
        domainName: 'empty.com',
        resultState: 'complete',
        metadata: {},
        createdAt: new Date(),
      };
      mockDb.selectOne = vi.fn(async () => emptyMetadataSnapshot);

      const res = await app.request('/api/snapshot/snap-empty-metadata/delegation');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      // Should treat as no delegation data
      expect(body.delegation).toBeNull();
    });

    it('should handle snapshot with partial metadata', async () => {
      const partialSnapshot = {
        id: 'snap-partial',
        domainId: 'domain-5',
        domainName: 'partial.com',
        resultState: 'complete',
        metadata: {
          hasDelegationData: true,
          parentZone: 'com',
          // Missing nsServers, hasDivergence, etc.
        },
        createdAt: new Date(),
      };
      mockDb.selectOne = vi.fn(async () => partialSnapshot);
      mockDb.selectWhere = vi.fn(async () => []);

      const res = await app.request('/api/snapshot/snap-partial/delegation');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.delegation).toBeDefined();
      const delegation = body.delegation as JsonBody;
      expect(delegation.parentZone).toBe('com');
    });

    it('should handle error gracefully', async () => {
      // Mock selectOne to return null for the snapshot (simulates not found)
      // Note: findById internally calls selectOne, so we mock that
      mockDb.selectOne = vi.fn(async (table: unknown, _condition: unknown) => {
        const name = getTableName(table);
        if (name === 'snapshots') {
          return undefined; // snapshot not found
        }
        if (name === 'domains') {
          return mockData.domains[0] ?? undefined;
        }
        return undefined;
      });

      const res = await app.request('/api/snapshot/snap-error/delegation');

      expect(res.status).toBe(404);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBeDefined();
    });
  });
});
