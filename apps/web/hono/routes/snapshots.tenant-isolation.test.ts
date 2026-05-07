/**
 * Snapshot Routes Tenant Isolation Tests
 *
 * Tests for SEC-001: Snapshot routes auth + tenant isolation
 * - All snapshot routes require authentication
 * - Cross-tenant access is prevented (returns 404, not 403)
 * - Unowned domains are not publicly readable (unlike simulation routes)
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { snapshotRoutes } from './snapshots.js';

interface MockState {
  domains: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  recordSets: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') {
    return record[symbolName] as string;
  }
  const symbols = Object.getOwnPropertySymbols(record);
  const drizzleName = symbols.find((symbol) => String(symbol) === 'Symbol(drizzle:Name)');
  if (drizzleName && typeof record[drizzleName] === 'string') {
    return record[drizzleName] as string;
  }
  return '';
}

function getConditionParam(condition: unknown): unknown {
  const sql = condition as {
    queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
  };
  return sql.queryChunks?.find((chunk) => chunk?.constructor?.name === 'Param')?.value;
}

function createMockDb(state: MockState): IDatabaseAdapter {
  return {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => {
      const tableName = getTableName(table);
      if (tableName === 'domains') return [...state.domains];
      if (tableName === 'snapshots')
        return [...state.snapshots].sort(
          (a, b) =>
            new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
        );
      if (tableName === 'record_sets') return [...state.recordSets];
      if (tableName === 'findings') return [...state.findings];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'domains') {
        return state.domains.filter(
          (row) => row.id === param || row.normalizedName === param || row.name === param
        );
      }
      if (tableName === 'snapshots')
        return state.snapshots
          .filter((row) => row.domainId === param)
          .sort(
            (a, b) =>
              new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
          );
      if (tableName === 'record_sets')
        return state.recordSets.filter((row) => row.snapshotId === param);
      if (tableName === 'findings') return state.findings.filter((row) => row.snapshotId === param);
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'domains')
        return (
          state.domains.find(
            (row) => row.id === param || row.normalizedName === param || row.name === param
          ) || null
        );
      if (tableName === 'snapshots') return state.snapshots.find((row) => row.id === param) || null;
      return null;
    }),
    insert: vi.fn(),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(async (callback: (db: IDatabaseAdapter) => Promise<unknown>) =>
      callback(createMockDb(state))
    ),
  } as unknown as IDatabaseAdapter;
}

// Helper to create app with specific tenant context
function createAppWithTenant(state: MockState, tenantId?: string) {
  const app = new Hono<Env>();
  const mockDb = createMockDb(state);
  app.use('*', async (c, next) => {
    c.set('db', mockDb);
    if (tenantId) {
      c.set('tenantId', tenantId);
      c.set('actorId', 'test-actor');
    }
    await next();
  });
  app.route('/api/snapshots', snapshotRoutes);
  return app;
}

const DOMAIN_ID = 'domain-tenant-a';
const SNAPSHOT_ID_1 = 'snapshot-1';
const SNAPSHOT_ID_2 = 'snapshot-2';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const now = new Date();
const yesterday = new Date(now.getTime() - 86400000);

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: SNAPSHOT_ID_1,
    domainId: DOMAIN_ID,
    domainName: 'example.com',
    resultState: 'complete',
    rulesetVersionId: null,
    queriedNames: ['example.com'],
    queriedTypes: ['A', 'MX'],
    vantages: ['google-dns'],
    metadata: {},
    createdAt: now,
    ...overrides,
  };
}

describe('SEC-001: Snapshot Routes Tenant Isolation', () => {
  describe('Authentication requirement', () => {
    it('should return 401 when accessing snapshots without authentication', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      // No tenant context (not authenticated)
      const app = createAppWithTenant(state, undefined);

      const response = await app.request('/api/snapshots/example.com');
      expect(response.status).toBe(401);
    });

    it('should return 401 for latest endpoint without authentication', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, undefined);

      const response = await app.request('/api/snapshots/example.com/latest');
      expect(response.status).toBe(401);
    });

    it('should return 401 for specific snapshot without authentication', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, undefined);

      const response = await app.request('/api/snapshots/example.com/snapshot-1');
      expect(response.status).toBe(401);
    });

    it('should return 401 for diff endpoint without authentication', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot(), makeSnapshot({ id: SNAPSHOT_ID_2, createdAt: yesterday })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, undefined);

      const response = await app.request('/api/snapshots/example.com/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotA: SNAPSHOT_ID_1, snapshotB: SNAPSHOT_ID_2 }),
      });
      expect(response.status).toBe(401);
    });

    it('should return 401 for compare-latest endpoint without authentication', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot(), makeSnapshot({ id: SNAPSHOT_ID_2, createdAt: yesterday })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, undefined);

      const response = await app.request('/api/snapshots/example.com/compare-latest', {
        method: 'POST',
      });
      expect(response.status).toBe(401);
    });
  });

  describe('Cross-tenant access prevention', () => {
    it('should return 404 when tenant B accesses tenant A domain snapshots', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      // Tenant B tries to access
      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request('/api/snapshots/example.com');
      // Returns 404 (not 403) to avoid leaking existence
      expect(response.status).toBe(404);
    });

    it('should return 404 when tenant B accesses latest snapshot of tenant A domain', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request('/api/snapshots/example.com/latest');
      expect(response.status).toBe(404);
    });

    it('should return 404 when tenant B accesses specific tenant A snapshot', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request(`/api/snapshots/example.com/${SNAPSHOT_ID_1}`);
      expect(response.status).toBe(404);
    });

    it('should return 404 when tenant B tries to diff tenant A snapshots', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot(), makeSnapshot({ id: SNAPSHOT_ID_2, createdAt: yesterday })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request('/api/snapshots/example.com/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotA: SNAPSHOT_ID_1, snapshotB: SNAPSHOT_ID_2 }),
      });
      expect(response.status).toBe(404);
    });

    it('should return 404 when tenant B tries to compare-latest tenant A snapshots', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot(), makeSnapshot({ id: SNAPSHOT_ID_2, createdAt: yesterday })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request('/api/snapshots/example.com/compare-latest', {
        method: 'POST',
      });
      expect(response.status).toBe(404);
    });
  });

  describe('Same-tenant access allowed', () => {
    it('should allow tenant A to list their own domain snapshots', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot(), makeSnapshot({ id: SNAPSHOT_ID_2, createdAt: yesterday })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/example.com');
      expect(response.status).toBe(200);
      const json = (await response.json()) as { count: number; snapshots: unknown[] };
      expect(json.count).toBe(2);
    });

    it('should allow tenant A to access latest snapshot of their domain', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/example.com/latest');
      expect(response.status).toBe(200);
      const json = (await response.json()) as { id: string };
      expect(json.id).toBe(SNAPSHOT_ID_1);
    });

    it('should allow tenant A to access specific snapshot of their domain', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot({ metadata: { testKey: 'testValue' } })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request(`/api/snapshots/example.com/${SNAPSHOT_ID_1}`);
      expect(response.status).toBe(200);
      const json = (await response.json()) as { id: string; metadata: { testKey: string } };
      expect(json.id).toBe(SNAPSHOT_ID_1);
      expect(json.metadata.testKey).toBe('testValue');
    });

    it('should allow tenant A to diff their own snapshots', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot(), makeSnapshot({ id: SNAPSHOT_ID_2, createdAt: yesterday })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/example.com/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotA: SNAPSHOT_ID_1, snapshotB: SNAPSHOT_ID_2 }),
      });
      expect(response.status).toBe(200);
      const json = (await response.json()) as { diff: unknown };
      expect(json.diff).toBeDefined();
    });

    it('should allow tenant A to compare-latest snapshots', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot(), makeSnapshot({ id: SNAPSHOT_ID_2, createdAt: yesterday })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/example.com/compare-latest', {
        method: 'POST',
      });
      expect(response.status).toBe(200);
      const json = (await response.json()) as { diff: unknown };
      expect(json.diff).toBeDefined();
    });
  });

  describe('Snapshot not found scenarios', () => {
    it('should return 404 when snapshot exists but belongs to different domain', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot({ domainId: 'other-domain' })],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      // The snapshot exists but belongs to a different domain
      const response = await app.request(`/api/snapshots/example.com/${SNAPSHOT_ID_1}`);
      expect(response.status).toBe(404);
    });

    it('should return 404 when diffing snapshots from different domains', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [
          makeSnapshot({ id: SNAPSHOT_ID_1 }),
          makeSnapshot({ id: SNAPSHOT_ID_2, domainId: 'other-domain' }),
        ],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/example.com/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotA: SNAPSHOT_ID_1, snapshotB: SNAPSHOT_ID_2 }),
      });
      // Returns 404 because snapshotB belongs to different domain
      expect(response.status).toBe(404);
    });
  });

  describe('Pagination and edge cases', () => {
    it('should handle pagination correctly', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: Array.from({ length: 25 }, (_, i) =>
          makeSnapshot({ id: `snapshot-${i}`, createdAt: new Date(now.getTime() - i * 3600000) })
        ),
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      // First page
      const response1 = await app.request('/api/snapshots/example.com?limit=10&offset=0');
      expect(response1.status).toBe(200);
      const json1 = (await response1.json()) as { count: number; snapshots: unknown[] };
      expect(json1.count).toBe(10);

      // Second page
      const response2 = await app.request('/api/snapshots/example.com?limit=10&offset=10');
      expect(response2.status).toBe(200);
      const json2 = (await response2.json()) as { count: number; snapshots: unknown[] };
      expect(json2.count).toBe(10);

      // Third page
      const response3 = await app.request('/api/snapshots/example.com?limit=10&offset=20');
      expect(response3.status).toBe(200);
      const json3 = (await response3.json()) as { count: number; snapshots: unknown[] };
      expect(json3.count).toBe(5);
    });

    it('should return 400 when fewer than 2 snapshots for compare-latest', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/example.com/compare-latest', {
        method: 'POST',
      });
      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string; availableSnapshots: number };
      expect(json.availableSnapshots).toBe(1);
    });

    it('should return 404 for unknown domain', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/unknown-domain.com');
      expect(response.status).toBe(404);
    });

    it('should return 404 when latest snapshot requested but none exist', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
          },
        ],
        snapshots: [],
        recordSets: [],
        findings: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/example.com/latest');
      expect(response.status).toBe(404);
    });
  });

  describe('Unowned domains (tenantId = null)', () => {
    // Note: Snapshot routes are designed for tenant-owned domains only
    // Unowned domains (tenantId = null) are NOT accessible through snapshot routes
    // This is different from simulation routes which allow public read for unowned domains

    it('should return 401 for unowned domain snapshots without auth', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: null, // Unowned domain
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      // No auth context
      const app = createAppWithTenant(state, undefined);

      const response = await app.request('/api/snapshots/example.com');
      // requireAuth middleware returns 401 when no tenantId
      expect(response.status).toBe(401);
    });

    it('should return 404 for unowned domain snapshots with auth (findByNameForTenant excludes null tenantId)', async () => {
      const state: MockState = {
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: null, // Unowned domain
          },
        ],
        snapshots: [makeSnapshot()],
        recordSets: [],
        findings: [],
      };

      // Authenticated tenant tries to access unowned domain
      // findByNameForTenant returns undefined for unowned domains
      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/snapshots/example.com');
      // Returns 404 because findByNameForTenant doesn't find unowned domains
      expect(response.status).toBe(404);
    });
  });
});
