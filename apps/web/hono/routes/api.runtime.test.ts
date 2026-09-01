import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { apiRoutes } from './api.js';

interface MockState {
  domains: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  recordSets: Array<Record<string, unknown>>;
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') {
    return record[symbolName] as string;
  }
  return '';
}

function getConditionParams(condition: unknown): unknown[] {
  if (!condition || typeof condition !== 'object') return [];
  const sql = condition as {
    constructor?: { name?: string };
    value?: unknown;
    queryChunks?: unknown[];
  };
  if (sql.constructor?.name === 'Param') return [sql.value];
  return (sql.queryChunks ?? []).flatMap(getConditionParams);
}

function getConditionParam(condition: unknown): unknown {
  return getConditionParams(condition)[0];
}

function createMockDb(state: MockState): IDatabaseAdapter {
  return {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => {
      const tableName = getTableName(table);
      if (tableName === 'domains') return [...state.domains];
      if (tableName === 'snapshots') return [...state.snapshots];
      if (tableName === 'observations') return [...state.observations];
      if (tableName === 'record_sets') return [...state.recordSets];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'domains') {
        const params = getConditionParams(condition);
        return state.domains.filter(
          (domain) =>
            (domain.id === params[0] ||
              domain.normalizedName === params[0] ||
              domain.name === params[0]) &&
            (params.length < 2 || domain.tenantId === params[1])
        );
      }
      if (tableName === 'snapshots') {
        return state.snapshots.filter((snapshot) => snapshot.domainId === param);
      }
      if (tableName === 'observations') {
        return state.observations.filter((observation) => observation.snapshotId === param);
      }
      if (tableName === 'record_sets') {
        return state.recordSets.filter((recordSet) => recordSet.snapshotId === param);
      }
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'domains') {
        return state.domains.find(
          (domain) =>
            domain.id === param || domain.normalizedName === param || domain.name === param
        );
      }
      if (tableName === 'snapshots') {
        const byId = state.snapshots.find((snapshot) => snapshot.id === param);
        if (byId) return byId;
        return [...state.snapshots]
          .filter((snapshot) => snapshot.domainId === param)
          .sort(
            (a, b) =>
              new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
          )[0];
      }
      return undefined;
    }),
    insert: vi.fn(),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(),
  } as unknown as IDatabaseAdapter;
}

function createApp(state: MockState, auth?: { tenantId?: string; actorId?: string }) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    if (auth?.tenantId) c.set('tenantId', auth.tenantId);
    if (auth?.actorId) c.set('actorId', auth.actorId);
    await next();
  });
  app.route('/api', apiRoutes);
  return app;
}

describe('apiRoutes runtime', () => {
  it('serves latest snapshot for an unscoped domain without auth', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-public',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: null,
          zoneManagement: 'unmanaged',
        },
      ],
      snapshots: [
        {
          id: 'snap-public',
          domainId: 'domain-public',
          domainName: 'example.com',
          resultState: 'complete',
          queriedNames: ['example.com'],
          queriedTypes: ['A'],
          vantages: ['public-recursive'],
          zoneManagement: 'unmanaged',
          triggeredBy: 'system',
          createdAt: new Date(),
        },
      ],
      observations: [{ id: 'obs-1', snapshotId: 'snap-public' }],
      recordSets: [{ id: 'rs-1', snapshotId: 'snap-public' }],
    };
    const app = createApp(state);

    const snapshotResponse = await app.request('/api/domain/example.com/latest');
    expect(snapshotResponse.status).toBe(200);

    const observationsResponse = await app.request('/api/snapshot/snap-public/observations');
    expect(observationsResponse.status).toBe(200);
  });

  it('does not expose tenant-owned snapshots without auth', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-private',
          name: 'private.example.com',
          normalizedName: 'private.example.com',
          tenantId: 'tenant-2',
          zoneManagement: 'managed',
        },
      ],
      snapshots: [
        {
          id: 'snap-private',
          domainId: 'domain-private',
          domainName: 'private.example.com',
          resultState: 'complete',
          queriedNames: ['private.example.com'],
          queriedTypes: ['A'],
          vantages: ['public-recursive'],
          zoneManagement: 'managed',
          triggeredBy: 'user',
          createdAt: new Date(),
        },
      ],
      observations: [{ id: 'obs-1', snapshotId: 'snap-private' }],
      recordSets: [],
    };
    const anonymousApp = createApp(state);
    const tenantApp = createApp(state, { tenantId: 'tenant-2', actorId: 'actor-2' });

    expect((await anonymousApp.request('/api/domain/private.example.com/latest')).status).toBe(404);
    expect((await anonymousApp.request('/api/snapshot/snap-private/observations')).status).toBe(
      404
    );
    expect((await tenantApp.request('/api/domain/private.example.com/latest')).status).toBe(200);
  });
});
