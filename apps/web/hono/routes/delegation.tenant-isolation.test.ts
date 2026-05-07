/**
 * Delegation Routes Tenant Isolation Tests - AUTH-001
 *
 * Tests for delegation endpoint tenant isolation:
 * - Unauthenticated requests → 401
 * - Own-tenant access → 200
 * - Other-tenant access → 404 (not 403, to avoid leaking existence)
 *
 * Endpoints tested:
 * - GET /api/snapshot/:snapshotId/delegation
 * - GET /api/snapshot/:snapshotId/delegation/issues
 * - GET /api/snapshot/:snapshotId/delegation/dnssec
 * - GET /api/snapshot/:snapshotId/delegation/evidence
 * - GET /api/domain/:domain/delegation/latest
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { delegationRoutes } from './delegation.js';

interface MockState {
  snapshots: Array<Record<string, unknown>>;
  domains: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
}

// Extract table name from Drizzle table object
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

// Extract condition parameter value from SQL condition
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
      if (tableName === 'snapshots') return [...state.snapshots];
      if (tableName === 'domains') return [...state.domains];
      if (tableName === 'observations') return [...state.observations];
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const condVal = getConditionParam(condition);
      if (tableName === 'snapshots') return state.snapshots.find((s) => s.id === condVal) || null;
      if (tableName === 'domains') {
        // getConditionParam may not parse Drizzle eq() correctly — fall back to first domain
        if (condVal === undefined) return state.domains[0] ?? null;
        return (
          state.domains.find(
            (d) => d.id === condVal || d.normalizedName === condVal || d.name === condVal
          ) ?? null
        );
      }
      return null;
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const condVal = getConditionParam(condition);
      if (tableName === 'domains') {
        return state.domains.filter(
          (d) => d.id === condVal || d.normalizedName === condVal || d.name === condVal
        );
      }
      if (tableName === 'observations') {
        return state.observations.filter(
          (o) => (o as { snapshotId: string }).snapshotId === condVal
        );
      }
      if (tableName === 'snapshots') {
        // filter by domainId (the entity ID, not domain name)
        return state.snapshots.filter((s) => (s as { domainId: string }).domainId === condVal);
      }
      return [];
    }),
    insert: vi.fn(),
    insertMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as IDatabaseAdapter;
}

// Helper to create app with specific tenant context
function createAppWithTenant(state: MockState, tenantId?: string, actorId?: string) {
  const app = new Hono<Env>();
  const mockDb = createMockDb(state);
  app.use('*', async (c, next) => {
    c.set('db', mockDb);
    if (tenantId) {
      c.set('tenantId', tenantId);
      c.set('actorId', actorId || 'test-actor');
    }
    await next();
  });
  app.route('/api', delegationRoutes);
  return app;
}

const SNAPSHOT_ID = 'snapshot-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const DOMAIN_ID = 'domain-b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const UNAUTHENTICATED = undefined;

describe('AUTH-001: Delegation Route Tenant Isolation', () => {
  describe('GET /api/snapshot/:snapshotId/delegation', () => {
    it('should return 401 when unauthenticated', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            metadata: { hasDelegationData: true },
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, UNAUTHENTICATED);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation`);

      expect(response.status).toBe(401);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Unauthorized');
    });

    it('should return 200 when tenant accesses their own snapshot', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            metadata: { hasDelegationData: true },
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation`);

      expect(response.status).toBe(200);
      const json = (await response.json()) as { snapshotId: string };
      expect(json.snapshotId).toBe(SNAPSHOT_ID);
    });

    it('should return 404 when tenant B accesses tenant A snapshot', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            metadata: { hasDelegationData: true },
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation`);

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Snapshot not found');
    });
  });

  describe('GET /api/snapshot/:snapshotId/delegation/issues', () => {
    it('should return 401 when unauthenticated', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, UNAUTHENTICATED);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/issues`);

      expect(response.status).toBe(401);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Unauthorized');
    });

    it('should return 200 when tenant accesses their own snapshot', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/issues`);

      expect(response.status).toBe(200);
      const json = (await response.json()) as { snapshotId: string };
      expect(json.snapshotId).toBe(SNAPSHOT_ID);
    });

    it('should return 404 when tenant B accesses tenant A snapshot', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/issues`);

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Snapshot not found');
    });
  });

  describe('GET /api/snapshot/:snapshotId/delegation/dnssec', () => {
    it('should return 401 when unauthenticated', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, UNAUTHENTICATED);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/dnssec`);

      expect(response.status).toBe(401);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Unauthorized');
    });

    it('should return 200 when tenant accesses their own snapshot', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/dnssec`);

      expect(response.status).toBe(200);
      const json = (await response.json()) as { snapshotId: string };
      expect(json.snapshotId).toBe(SNAPSHOT_ID);
    });

    it('should return 404 when tenant B accesses tenant A snapshot', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/dnssec`);

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Snapshot not found');
    });
  });

  describe('GET /api/snapshot/:snapshotId/delegation/evidence', () => {
    it('should return 401 when unauthenticated', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, UNAUTHENTICATED);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/evidence`);

      expect(response.status).toBe(401);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Unauthorized');
    });

    it('should return 200 when tenant accesses their own snapshot', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/evidence`);

      expect(response.status).toBe(200);
      const json = (await response.json()) as { snapshotId: string };
      expect(json.snapshotId).toBe(SNAPSHOT_ID);
    });

    it('should return 404 when tenant B accesses tenant A snapshot', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/evidence`);

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Snapshot not found');
    });
  });

  describe('GET /api/domain/:domain/delegation/latest', () => {
    it('should return 401 when unauthenticated', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            metadata: { hasDelegationData: true },
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, UNAUTHENTICATED);

      const response = await app.request('/api/domain/example.com/delegation/latest');

      expect(response.status).toBe(401);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Unauthorized');
    });

    it('should return 200 when tenant accesses their own domain', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            metadata: { hasDelegationData: true },
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request('/api/domain/example.com/delegation/latest');

      // Should redirect to snapshot-specific endpoint or succeed
      expect([200, 302, 307, 308]).toContain(response.status);
    });

    it('should return 404 when tenant B accesses tenant A domain', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: TENANT_A,
            metadata: { hasDelegationData: true },
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: TENANT_A,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_B);

      const response = await app.request('/api/domain/example.com/delegation/latest');

      expect(response.status).toBe(404);
    });
  });

  describe('Unowned domain access (null tenantId)', () => {
    it('should allow any authenticated tenant to access unowned snapshots', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: null, // Unowned
            metadata: { hasDelegationData: true },
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: null, // Unowned
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, TENANT_A);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation`);

      expect(response.status).toBe(200);
      const json = (await response.json()) as { snapshotId: string };
      expect(json.snapshotId).toBe(SNAPSHOT_ID);
    });

    it('should still require authentication for unowned snapshots', async () => {
      const state: MockState = {
        snapshots: [
          {
            id: SNAPSHOT_ID,
            domainId: DOMAIN_ID,
            domainName: 'example.com',
            resultState: 'complete',
            tenantId: null, // Unowned
            metadata: { hasDelegationData: true },
            createdAt: new Date(),
          },
        ],
        domains: [
          {
            id: DOMAIN_ID,
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: null, // Unowned
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        observations: [],
      };

      const app = createAppWithTenant(state, UNAUTHENTICATED);

      const response = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation`);

      expect(response.status).toBe(401);
    });
  });
});
