/**
 * Mail route runtime tests
 *
 * Tests remediation CRUD and mail validation paths.
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { mailRoutes } from './mail.js';

interface MockState {
  remediationRequests: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
  snapshots?: Array<Record<string, unknown>>;
  domains?: Array<Record<string, unknown>>;
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
      if (tableName === 'remediation_requests') return [...state.remediationRequests];
      if (tableName === 'audit_events') return [...state.auditEvents];
      if (tableName === 'snapshots') return [...(state.snapshots ?? [])];
      if (tableName === 'domains') return [...(state.domains ?? [])];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'remediation_requests')
        return state.remediationRequests.filter(
          (row) =>
            row.tenantId === param ||
            row.domain === param ||
            row.snapshotId === param ||
            row.status === param
        );
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'remediation_requests')
        return state.remediationRequests.find((row) => row.id === param);
      if (tableName === 'snapshots') return state.snapshots?.find((row) => row.id === param);
      if (tableName === 'domains') return state.domains?.find((row) => row.id === param);
      return undefined;
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      const tableName = getTableName(table);
      const row = {
        id: `${tableName}-${state.remediationRequests.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...values,
      };
      if (tableName === 'remediation_requests') state.remediationRequests.push(row);
      if (tableName === 'audit_events') state.auditEvents.push(row);
      return row;
    }),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(
      async (table: unknown, values: Record<string, unknown>, condition: unknown) => {
        const tableName = getTableName(table);
        const param = getConditionParam(condition);
        if (tableName === 'remediation_requests') {
          const idx = state.remediationRequests.findIndex((row) => row.id === param);
          if (idx === -1) return undefined;
          state.remediationRequests[idx] = { ...state.remediationRequests[idx], ...values };
          return state.remediationRequests[idx];
        }
        return undefined;
      }
    ),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(async (callback: (db: IDatabaseAdapter) => Promise<unknown>) =>
      callback(createMockDb(state))
    ),
  } as unknown as IDatabaseAdapter;
}

function createApp(state: MockState) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    c.set('tenantId', 'tenant-1');
    c.set('actorId', 'actor-1');
    await next();
  });
  app.route('/api/mail', mailRoutes);
  return app;
}

describe('mailRoutes remediation runtime', () => {
  describe('POST /remediation', () => {
    it('creates a remediation request with audit trail', async () => {
      const state: MockState = { remediationRequests: [], auditEvents: [] };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'example.com',
          snapshotId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          contactEmail: 'ops@example.com',
          contactName: 'Ops Team',
          issues: ['No DMARC record'],
          priority: 'high',
        }),
      });

      expect(response.status).toBe(201);
      const json = (await response.json()) as {
        remediation: { domain: string; status: string; priority: string };
      };
      expect(json.remediation.domain).toBe('example.com');
      expect(json.remediation.status).toBe('open');
      expect(json.remediation.priority).toBe('high');
      expect(state.auditEvents).toHaveLength(1);
      expect(state.auditEvents[0]?.action).toBe('remediation_request_created');
    });

    it('rejects missing required fields', async () => {
      const state: MockState = { remediationRequests: [], auditEvents: [] };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /remediation', () => {
    it('lists remediation requests for tenant', async () => {
      const state: MockState = {
        remediationRequests: [
          {
            id: 'rem-1',
            tenantId: 'tenant-1',
            domain: 'example.com',
            status: 'open',
            priority: 'high',
            createdAt: new Date(),
          },
          {
            id: 'rem-2',
            tenantId: 'tenant-1',
            domain: 'test.com',
            status: 'resolved',
            priority: 'low',
            createdAt: new Date(),
          },
        ],
        auditEvents: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        remediation: Array<Record<string, unknown>>;
      };
      expect(json.remediation).toBeDefined();
    });

    it('rejects invalid status filter', async () => {
      const state: MockState = { remediationRequests: [], auditEvents: [] };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation?status=invalid');

      expect(response.status).toBe(400);
    });

    it('rejects invalid priority filter', async () => {
      const state: MockState = { remediationRequests: [], auditEvents: [] };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation?priority=invalid');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /remediation/stats', () => {
    it('returns status counts', async () => {
      const state: MockState = {
        remediationRequests: [
          { id: 'rem-1', tenantId: 'tenant-1', status: 'open' },
          { id: 'rem-2', tenantId: 'tenant-1', status: 'open' },
          { id: 'rem-3', tenantId: 'tenant-1', status: 'resolved' },
        ],
        auditEvents: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation/stats');

      expect(response.status).toBe(200);
      const json = (await response.json()) as { counts: Record<string, number> };
      expect(json.counts).toBeDefined();
    });
  });

  describe('GET /remediation/by-id/:id', () => {
    it('returns a specific remediation request', async () => {
      const state: MockState = {
        remediationRequests: [
          {
            id: 'rem-1',
            tenantId: 'tenant-1',
            domain: 'example.com',
            status: 'open',
            priority: 'high',
          },
        ],
        auditEvents: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation/by-id/rem-1');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        remediation: { id: string; domain: string };
      };
      expect(json.remediation.id).toBe('rem-1');
    });

    it('returns 404 for nonexistent request', async () => {
      const state: MockState = { remediationRequests: [], auditEvents: [] };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation/by-id/nonexistent');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /remediation/domain/:domain', () => {
    it('returns remediation requests for a domain', async () => {
      const state: MockState = {
        remediationRequests: [
          { id: 'rem-1', tenantId: 'tenant-1', domain: 'example.com', status: 'open' },
          { id: 'rem-2', tenantId: 'tenant-1', domain: 'other.com', status: 'open' },
        ],
        auditEvents: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation/domain/example.com');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        remediation: Array<Record<string, unknown>>;
      };
      expect(json.remediation).toBeDefined();
    });
  });

  describe('PATCH /remediation/:id', () => {
    it('updates status with audit trail', async () => {
      const state: MockState = {
        remediationRequests: [
          {
            id: 'rem-1',
            tenantId: 'tenant-1',
            domain: 'example.com',
            status: 'open',
            priority: 'high',
            assignedTo: null,
            notes: null,
          },
        ],
        auditEvents: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation/rem-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in-progress',
          assignedTo: 'engineer@example.com',
        }),
      });

      expect(response.status).toBe(200);
      expect(state.auditEvents).toHaveLength(1);
      expect(state.auditEvents[0]?.action).toBe('remediation_request_updated');
      expect(state.auditEvents[0]?.previousValue).toMatchObject({ status: 'open' });
    });

    it('requires fresh complete evidence before resolution', async () => {
      const state: MockState = {
        remediationRequests: [
          {
            id: 'rem-1',
            tenantId: 'tenant-1',
            domain: 'example.com',
            status: 'open',
            priority: 'high',
            createdAt: new Date(Date.now() - 60_000),
          },
        ],
        auditEvents: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation/rem-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'FRESH_EVIDENCE_REQUIRED' });
    });

    it('resolves only with a newer complete same-tenant snapshot', async () => {
      const snapshotId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
      const state: MockState = {
        remediationRequests: [
          {
            id: 'rem-1',
            tenantId: 'tenant-1',
            domain: 'example.com',
            status: 'open',
            priority: 'high',
            assignedTo: null,
            notes: null,
            createdAt: new Date(Date.now() - 60_000),
          },
        ],
        snapshots: [
          {
            id: snapshotId,
            domainId: 'domain-1',
            domainName: 'example.com',
            resultState: 'complete',
            metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
            createdAt: new Date(),
          },
        ],
        domains: [{ id: 'domain-1', tenantId: 'tenant-1', name: 'example.com' }],
        auditEvents: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation/rem-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', verificationSnapshotId: snapshotId }),
      });

      expect(response.status).toBe(200);
      expect(state.auditEvents[0]?.newValue).toMatchObject({ verificationSnapshotId: snapshotId });
    });

    it('rejects evidence captured before the current reopened lifecycle', async () => {
      const snapshotId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
      const state: MockState = {
        remediationRequests: [
          {
            id: 'rem-1',
            tenantId: 'tenant-1',
            domain: 'example.com',
            status: 'open',
            priority: 'high',
            createdAt: new Date(Date.now() - 120_000),
            updatedAt: new Date(),
          },
        ],
        snapshots: [
          {
            id: snapshotId,
            domainId: 'domain-1',
            domainName: 'example.com',
            resultState: 'complete',
            metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
            createdAt: new Date(Date.now() - 30_000),
          },
        ],
        domains: [{ id: 'domain-1', tenantId: 'tenant-1', name: 'example.com' }],
        auditEvents: [],
      };

      const response = await createApp(state).request('/api/mail/remediation/rem-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', verificationSnapshotId: snapshotId }),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'FRESH_EVIDENCE_REQUIRED' });
    });

    it.each([
      ['stale', { createdAt: new Date(0) }, 'tenant-1', 409],
      [
        'partial',
        { resultState: 'partial', metadata: { evaluation: { state: 'PARTIAL', errors: [] } } },
        'tenant-1',
        409,
      ],
      ['wrong-domain', { domainName: 'other.example' }, 'tenant-1', 409],
      ['cross-tenant', {}, 'other-tenant', 404],
    ] as const)('rejects %s verification evidence', async (_label, snapshotOverrides, domainTenant, expectedStatus) => {
      const snapshotId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
      const state: MockState = {
        remediationRequests: [
          {
            id: 'rem-1',
            tenantId: 'tenant-1',
            domain: 'example.com',
            status: 'open',
            priority: 'high',
            createdAt: new Date(Date.now() - 60_000),
          },
        ],
        snapshots: [
          {
            id: snapshotId,
            domainId: 'domain-1',
            domainName: 'example.com',
            resultState: 'complete',
            metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
            createdAt: new Date(),
            ...snapshotOverrides,
          },
        ],
        domains: [{ id: 'domain-1', tenantId: domainTenant, name: 'example.com' }],
        auditEvents: [],
      };
      const response = await createApp(state).request('/api/mail/remediation/rem-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', verificationSnapshotId: snapshotId }),
      });

      expect(response.status).toBe(expectedStatus);
      expect(state.auditEvents).toHaveLength(0);
      expect(state.remediationRequests[0]?.status).toBe('open');
    });

    it('returns 404 for nonexistent request', async () => {
      const state: MockState = { remediationRequests: [], auditEvents: [] };
      const app = createApp(state);

      const response = await app.request('/api/mail/remediation/nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });

      expect(response.status).toBe(404);
    });
  });
});
