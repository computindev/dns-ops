/**
 * Snapshot route runtime tests
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
        return state.domains.find(
          (row) => row.id === param || row.normalizedName === param || row.name === param
        );
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
  app.route('/api/snapshots', snapshotRoutes);
  return app;
}

const now = new Date();
const yesterday = new Date(now.getTime() - 86400000);

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snap-1',
    domainId: 'domain-1',
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

describe('snapshotRoutes runtime', () => {
  describe('GET /:domain', () => {
    it('lists snapshots for a domain sorted by date desc', async () => {
      const state: MockState = {
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1',
          },
        ],
        snapshots: [
          makeSnapshot({ id: 'snap-old', createdAt: yesterday }),
          makeSnapshot({ id: 'snap-new', createdAt: now }),
        ],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        domain: string;
        count: number;
        snapshots: Array<{ id: string; findingsEvaluated: boolean }>;
      };
      expect(json.domain).toBe('example.com');
      expect(json.count).toBe(2);
      // sorted desc by createdAt
      expect(json.snapshots[0]?.id).toBe('snap-new');
      expect(json.snapshots[0]?.findingsEvaluated).toBe(false);
    });

    it('returns 404 for unknown domain', async () => {
      const state: MockState = {
        domains: [],
        snapshots: [],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/unknown.com');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /:domain/latest', () => {
    it('returns the most recent snapshot', async () => {
      const state: MockState = {
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1',
          },
        ],
        snapshots: [
          makeSnapshot({ id: 'snap-old', createdAt: yesterday }),
          makeSnapshot({ id: 'snap-new', createdAt: now, rulesetVersionId: 'rv-1' }),
        ],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com/latest');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        id: string;
        domain: string;
        findingsEvaluated: boolean;
      };
      expect(json.id).toBe('snap-new');
      expect(json.domain).toBe('example.com');
      expect(json.findingsEvaluated).toBe(true);
    });

    it('returns 404 when domain has no snapshots', async () => {
      const state: MockState = {
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1',
          },
        ],
        snapshots: [],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com/latest');

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('No snapshots found for domain');
    });

    it('returns 404 for unknown domain', async () => {
      const state: MockState = {
        domains: [],
        snapshots: [],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/unknown.com/latest');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /:domain/:id', () => {
    it('returns a specific snapshot with metadata', async () => {
      const state: MockState = {
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1',
          },
        ],
        snapshots: [
          makeSnapshot({
            id: 'snap-1',
            metadata: { parentZone: 'com', hasDelegationData: true },
          }),
        ],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com/snap-1');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        id: string;
        metadata: { parentZone: string };
        queryScope: { names: string[] };
      };
      expect(json.id).toBe('snap-1');
      expect(json.metadata.parentZone).toBe('com');
      expect(json.queryScope.names).toContain('example.com');
    });

    it('returns 404 for nonexistent snapshot', async () => {
      const state: MockState = {
        domains: [],
        snapshots: [],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com/nonexistent');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /:domain/diff', () => {
    it('returns 400 when snapshotA or snapshotB missing', async () => {
      const state: MockState = {
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1',
          },
        ],
        snapshots: [],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotA: 'snap-1' }),
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string };
      expect(json.error).toContain('Both snapshotA and snapshotB');
    });

    it('returns 404 when domain not found', async () => {
      const state: MockState = {
        domains: [],
        snapshots: [],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/unknown.com/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotA: 'snap-1', snapshotB: 'snap-2' }),
      });

      expect(response.status).toBe(404);
    });

    it('returns 404 when a snapshot does not exist', async () => {
      const state: MockState = {
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1',
          },
        ],
        snapshots: [makeSnapshot({ id: 'snap-1' })],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotA: 'snap-1', snapshotB: 'snap-missing' }),
      });

      expect(response.status).toBe(404);
    });

    it('returns 404 when snapshots belong to different domain', async () => {
      // Note: Returns 404 instead of 400 to avoid leaking information about other tenants' data
      const state: MockState = {
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1',
          },
        ],
        snapshots: [
          makeSnapshot({ id: 'snap-1', domainId: 'domain-1' }),
          makeSnapshot({ id: 'snap-2', domainId: 'domain-other' }),
        ],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotA: 'snap-1', snapshotB: 'snap-2' }),
      });

      // Returns 404 (not 400) for security - don't leak that the snapshot exists
      expect(response.status).toBe(404);
    });
  });

  describe('POST /:domain/compare-latest', () => {
    it('returns 400 when fewer than 2 snapshots', async () => {
      const state: MockState = {
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1',
          },
        ],
        snapshots: [makeSnapshot({ id: 'snap-1' })],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/example.com/compare-latest', {
        method: 'POST',
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string; availableSnapshots: number };
      expect(json.availableSnapshots).toBe(1);
    });

    it('returns 404 for unknown domain', async () => {
      const state: MockState = {
        domains: [],
        snapshots: [],
        recordSets: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/snapshots/unknown.com/compare-latest', {
        method: 'POST',
      });

      expect(response.status).toBe(404);
    });
  });
});
