/**
 * Selectors route runtime tests
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { selectorRoutes } from './selectors.js';

interface MockState {
  domains: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  dkimSelectors: Array<Record<string, unknown>>;
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
      if (tableName === 'snapshots') return [...state.snapshots];
      if (tableName === 'observations') return [...state.observations];
      if (tableName === 'dkim_selectors') return [...state.dkimSelectors];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'observations')
        return state.observations.filter((row) => row.snapshotId === param);
      if (tableName === 'dkim_selectors')
        return state.dkimSelectors.filter((row) => row.snapshotId === param);
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'domains') {
        return state.domains.find(
          (row) => row.id === param || row.normalizedName === param || row.name === param
        );
      }
      if (tableName === 'snapshots') return state.snapshots.find((row) => row.id === param);
      return undefined;
    }),
    insert: vi.fn(),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(),
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
  app.route('/api', selectorRoutes);
  return app;
}

describe('selectorRoutes runtime', () => {
  it('returns persisted selectors when dkim_selectors exist', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      snapshots: [
        {
          id: 'snap-1',
          domainId: 'domain-1',
          domainName: 'example.com',
          resultState: 'complete',
          createdAt: new Date(),
        },
      ],
      observations: [],
      dkimSelectors: [
        {
          id: 'sel-1',
          snapshotId: 'snap-1',
          selector: 'google',
          domain: 'example.com',
          provenance: 'provider-template',
          confidence: 'high',
          provider: 'google-workspace',
          found: true,
          recordData: 'v=DKIM1; k=rsa; p=...',
          isValid: true,
          validationError: null,
          keyType: 'rsa',
          keySize: '2048',
        },
        {
          id: 'sel-2',
          snapshotId: 'snap-1',
          selector: 'selector2',
          domain: 'example.com',
          provenance: 'common-selector',
          confidence: 'medium',
          provider: null,
          found: false,
          recordData: null,
          isValid: false,
          validationError: 'NXDOMAIN',
          keyType: null,
          keySize: null,
        },
      ],
    };
    const app = createApp(state);

    const response = await app.request('/api/snapshot/snap-1/selectors');

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      snapshotId: string;
      selectors: Array<Record<string, unknown>>;
      count: number;
      found: number;
      source: string;
    };
    expect(json.snapshotId).toBe('snap-1');
    expect(json.source).toBe('persisted');
    expect(json.count).toBe(2);
    expect(json.found).toBe(1);
    expect(json.selectors[0]?.selector).toBe('google');
    expect(json.selectors[0]?.provider).toBe('google-workspace');
    expect(json.selectors[1]?.found).toBe(false);
  });

  it('returns 404 when snapshot does not exist', async () => {
    const state: MockState = {
      domains: [],
      snapshots: [],
      observations: [],
      dkimSelectors: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/snapshot/nonexistent/selectors');

    expect(response.status).toBe(404);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('Snapshot not found');
  });

  it('falls back to observation-based inference when no stored selectors', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      snapshots: [
        {
          id: 'snap-1',
          domainId: 'domain-1',
          domainName: 'example.com',
          resultState: 'complete',
          createdAt: new Date(),
        },
      ],
      observations: [
        {
          id: 'obs-1',
          snapshotId: 'snap-1',
          queryName: 'google._domainkey.example.com',
          queryType: 'TXT',
          vantageType: 'resolver',
          vantageIdentifier: '8.8.8.8',
          status: 'success',
          answerSection: [
            { name: 'google._domainkey.example.com', type: 'TXT', data: 'v=DKIM1', ttl: 300 },
          ],
        },
      ],
      dkimSelectors: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/snapshot/snap-1/selectors');

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      source: string;
      selectors: Array<{ selector: string; provenance: string; found: boolean }>;
      count: number;
    };
    expect(json.source).toBe('inferred');
    expect(json.count).toBe(1);
    expect(json.selectors[0]?.selector).toBe('google');
    expect(json.selectors[0]?.provenance).toBe('unknown');
    expect(json.selectors[0]?.found).toBe(true);
  });

  it('returns empty selectors when no DKIM observations exist', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      snapshots: [
        {
          id: 'snap-1',
          domainId: 'domain-1',
          domainName: 'example.com',
          resultState: 'complete',
          createdAt: new Date(),
        },
      ],
      observations: [
        {
          id: 'obs-1',
          snapshotId: 'snap-1',
          queryName: 'example.com',
          queryType: 'MX',
          status: 'success',
          answerSection: [],
        },
      ],
      dkimSelectors: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/snapshot/snap-1/selectors');

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      selectors: unknown[];
      discoveryMethod: string;
    };
    expect(json.selectors).toHaveLength(0);
    expect(json.discoveryMethod).toBe('none');
  });
  it('returns 404 for a snapshot owned by another tenant', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-2',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      snapshots: [
        {
          id: 'snap-1',
          domainId: 'domain-1',
          domainName: 'example.com',
          resultState: 'complete',
          createdAt: new Date(),
        },
      ],
      observations: [],
      dkimSelectors: [
        {
          id: 'sel-1',
          snapshotId: 'snap-1',
          selector: 'google',
          domain: 'example.com',
          provenance: 'provider-template',
          confidence: 'high',
          provider: 'google-workspace',
          found: true,
          recordData: 'v=DKIM1',
          isValid: true,
          validationError: null,
        },
      ],
    };
    const app = createApp(state);

    const response = await app.request('/api/snapshot/snap-1/selectors');

    expect(response.status).toBe(404);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('Snapshot not found');
  });
});
