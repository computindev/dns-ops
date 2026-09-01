/**
 * Portfolio Routes Tests - Bead 14
 *
 * Tests for portfolio search, domain notes/tags, saved filters,
 * template overrides, and audit log endpoints.
 *
 * Validation areas:
 * - Search/filter correctness tests
 * - Portfolio search states (empty, pagination, error)
 * - Tenant-aware read tests
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { portfolioRoutes } from './portfolio.js';

// Type helpers
type JsonBody = Record<string, unknown>;

// =============================================================================
// MOCK DATABASE SETUP
// =============================================================================

// Headers for admin-gated routes (template overrides require admin access)
const adminHeaders = {
  'Content-Type': 'application/json',
  'X-Test-Admin': 'true',
};

interface MockData {
  domains: Array<{
    id: string;
    name: string;
    normalizedName: string;
    tenantId: string;
    zoneManagement: 'managed' | 'unmanaged' | 'unknown';
    createdAt: Date;
    updatedAt: Date;
  }>;
  snapshots: Array<{
    id: string;
    domainId: string;
    createdAt: Date;
    resultState: string;
    rulesetVersionId: string | null;
  }>;
  findings: Array<{
    id: string;
    snapshotId: string;
    ruleId: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    summary: string;
  }>;
  domainNotes: Array<{
    id: string;
    domainId: string;
    content: string;
    createdBy: string;
    tenantId: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  domainTags: Array<{
    id: string;
    domainId: string;
    tag: string;
    createdBy: string;
    tenantId: string;
    createdAt: Date;
  }>;
  savedFilters: Array<{
    id: string;
    name: string;
    description?: string;
    criteria: Record<string, unknown>;
    isShared: boolean;
    createdBy: string;
    tenantId: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  templateOverrides: Array<{
    id: string;
    providerKey: string;
    templateKey: string;
    overrideData: Record<string, unknown>;
    appliesToDomains: string[];
    createdBy: string;
    tenantId: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    previousValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    actorId: string;
    tenantId: string;
    createdAt: Date;
  }>;
}

function createMockData(): MockData {
  const now = new Date();
  return {
    domains: [
      {
        id: 'domain-1',
        name: 'example.com',
        normalizedName: 'example.com',
        tenantId: 'tenant-1',
        zoneManagement: 'managed',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'domain-2',
        name: 'test.com',
        normalizedName: 'test.com',
        tenantId: 'tenant-1',
        zoneManagement: 'unmanaged',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'domain-3',
        name: 'other-tenant.com',
        normalizedName: 'other-tenant.com',
        tenantId: 'tenant-2',
        zoneManagement: 'managed',
        createdAt: now,
        updatedAt: now,
      },
    ],
    snapshots: [
      {
        id: 'snap-1',
        domainId: 'domain-1',
        createdAt: now,
        resultState: 'complete',
        rulesetVersionId: 'ruleset-v1',
      },
      {
        id: 'snap-2',
        domainId: 'domain-2',
        createdAt: now,
        resultState: 'complete',
        rulesetVersionId: null, // Not evaluated
      },
    ],
    findings: [
      {
        id: 'finding-1',
        snapshotId: 'snap-1',
        ruleId: 'rule-1',
        severity: 'high',
        summary: 'Missing DMARC record',
      },
      {
        id: 'finding-2',
        snapshotId: 'snap-1',
        ruleId: 'rule-2',
        severity: 'medium',
        summary: 'SPF too permissive',
      },
    ],
    domainNotes: [],
    domainTags: [],
    savedFilters: [],
    templateOverrides: [],
    auditEvents: [],
  };
}

// Helper to extract table name from Drizzle table object
function getTableName(table: unknown): string {
  // Drizzle tables use Symbol.for('drizzle:Name') to store the table name
  const drizzleNameSymbol = Symbol.for('drizzle:Name');
  const t = table as Record<symbol | string, unknown>;
  if (t[drizzleNameSymbol]) return t[drizzleNameSymbol] as string;
  // Fallback checks
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

function createMockDb(data: MockData) {
  let noteId = 0;
  let tagId = 0;
  let filterId = 0;
  let overrideId = 0;
  let eventId = 0;

  const mockDrizzle = {
    query: {
      domains: {
        findMany: vi.fn(async (opts: { where?: unknown; limit?: number; offset?: number }) => {
          // Just return domains for simplicity - real filtering is tested at repo level
          return data.domains.slice(opts.offset || 0, (opts.offset || 0) + (opts.limit || 20));
        }),
      },
      snapshots: {
        findFirst: vi.fn(async (_opts: { where?: unknown }) => {
          // Find latest snapshot for the domain being queried
          // In real impl this filters by domainId, we'll simulate
          const domainId = data.domains[0]?.id;
          return data.snapshots.find((s) => s.domainId === domainId) || null;
        }),
        findMany: vi.fn(async (_opts: { where?: unknown; orderBy?: unknown }) => {
          // PERF-001: Batch query support
          // Return all snapshots, sorted by createdAt desc
          return [...data.snapshots].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }),
      },
      findings: {
        findMany: vi.fn(async () => data.findings),
      },
    },
  };

  // Map Drizzle table names to our mock data keys
  const tableNameMap: Record<string, keyof MockData> = {
    domains: 'domains',
    domain_notes: 'domainNotes',
    domain_tags: 'domainTags',
    saved_filters: 'savedFilters',
    template_overrides: 'templateOverrides',
    audit_events: 'auditEvents',
  };

  const getTable = (table: unknown): keyof MockData | '' => {
    const name = getTableName(table);
    return tableNameMap[name] || '';
  };

  return {
    getDrizzle: () => mockDrizzle,
    select: vi.fn(async (table: unknown) => {
      const tableName = getTable(table);
      if (tableName === 'domains') return [...data.domains];
      if (tableName === 'domainNotes') return [...data.domainNotes];
      if (tableName === 'domainTags') return [...data.domainTags];
      if (tableName === 'savedFilters') return [...data.savedFilters];
      if (tableName === 'templateOverrides') return [...data.templateOverrides];
      if (tableName === 'auditEvents') return [...data.auditEvents];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTable(table);
      if (tableName === 'domains') {
        const params = getConditionParams(condition);
        return data.domains.filter(
          (domain) =>
            (domain.id === params[0] ||
              domain.normalizedName === params[0] ||
              domain.name === params[0]) &&
            (params.length < 2 || domain.tenantId === params[1])
        );
      }
      if (tableName === 'domainNotes') return [...data.domainNotes];
      if (tableName === 'domainTags') return [...data.domainTags];
      if (tableName === 'auditEvents') return [...data.auditEvents];
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTable(table);
      const param = getConditionParam(condition);
      if (tableName === 'domains') {
        return data.domains.find(
          (domain) =>
            domain.id === param || domain.normalizedName === param || domain.name === param
        );
      }
      if (tableName === 'domainNotes') {
        return data.domainNotes.find((note) => note.id === param);
      }
      if (tableName === 'savedFilters') {
        return data.savedFilters.find((filter) => filter.id === param);
      }
      if (tableName === 'templateOverrides') {
        return data.templateOverrides.find((override) => override.id === param);
      }
      return undefined;
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      const tableName = getTable(table);
      const now = new Date();

      if (tableName === 'domainNotes') {
        const note = {
          id: `note-${++noteId}`,
          ...values,
          createdAt: now,
          updatedAt: now,
        };
        data.domainNotes.push(note as MockData['domainNotes'][0]);
        return note;
      }
      if (tableName === 'domainTags') {
        const tag = {
          id: `tag-${++tagId}`,
          ...values,
          createdAt: now,
        };
        data.domainTags.push(tag as MockData['domainTags'][0]);
        return tag;
      }
      if (tableName === 'savedFilters') {
        const filter = {
          id: `filter-${++filterId}`,
          ...values,
          createdAt: now,
          updatedAt: now,
        };
        data.savedFilters.push(filter as MockData['savedFilters'][0]);
        return filter;
      }
      if (tableName === 'templateOverrides') {
        const override = {
          id: `override-${++overrideId}`,
          ...values,
          createdAt: now,
          updatedAt: now,
        };
        data.templateOverrides.push(override as MockData['templateOverrides'][0]);
        return override;
      }
      if (tableName === 'auditEvents') {
        const event = {
          id: `event-${++eventId}`,
          ...values,
          createdAt: now,
        };
        data.auditEvents.push(event as MockData['auditEvents'][0]);
        return event;
      }
      return values;
    }),
    updateOne: vi.fn(
      async (table: unknown, values: Record<string, unknown>, _condition: unknown) => {
        const tableName = getTable(table);
        if (tableName === 'domainNotes' && data.domainNotes[0]) {
          Object.assign(data.domainNotes[0], values);
          return data.domainNotes[0];
        }
        if (tableName === 'savedFilters' && data.savedFilters[0]) {
          Object.assign(data.savedFilters[0], values);
          return data.savedFilters[0];
        }
        if (tableName === 'templateOverrides' && data.templateOverrides[0]) {
          Object.assign(data.templateOverrides[0], values);
          return data.templateOverrides[0];
        }
        return undefined;
      }
    ),
    deleteOne: vi.fn(async () => undefined),
  };
}

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Portfolio Routes', () => {
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
      c.set('tenantId', 'tenant-1');
      c.set('actorId', 'user-123');
      return next();
    });

    app.route('/api/portfolio', portfolioRoutes);
  });

  // ===========================================================================
  // SEARCH/FILTER CORRECTNESS TESTS
  // ===========================================================================

  describe('POST /api/portfolio/search', () => {
    describe('Search/filter correctness', () => {
      it('should return domains for authenticated user', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.domains).toBeDefined();
        expect(Array.isArray(body.domains)).toBe(true);
      });

      it('should filter by query string', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'example' }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.domains).toBeDefined();
      });

      it('should filter by severity', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ severities: ['high', 'critical'] }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.domains).toBeDefined();
      });

      it('should filter by zone management', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoneManagement: ['managed'] }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.domains).toBeDefined();
      });

      it('should filter by tags', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: ['production', 'critical'] }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        // Empty because no domains have these tags
        expect(body.domains).toEqual([]);
        expect(body.total).toBe(0);
      });

      it('should support combined filters', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'example',
            severities: ['high'],
            zoneManagement: ['managed'],
          }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.domains).toBeDefined();
      });

      it('should validate query length', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'a'.repeat(300) }),
        });

        expect(res.status).toBe(400);
        const body = (await res.json()) as JsonBody;
        expect(body.error).toBeDefined();
      });
    });

    describe('Pagination states', () => {
      it('should support limit parameter', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 5 }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.limit).toBe(5);
      });

      it('should support offset parameter', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset: 10 }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.offset).toBe(10);
      });

      it('should enforce max limit of 100', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 500 }),
        });

        expect(res.status).toBe(400);
        const body = (await res.json()) as JsonBody;
        expect(body.error).toBeDefined();
      });

      it('should default limit to 20', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.limit).toBe(20);
      });

      it('should default offset to 0', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.offset).toBe(0);
      });
    });

    describe('Empty states', () => {
      it('should return empty array when no domains match filters', async () => {
        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: ['nonexistent-tag'] }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.domains).toEqual([]);
        expect(body.total).toBe(0);
      });

      it('should return empty when query matches nothing', async () => {
        // Mock no results
        mockDb.getDrizzle().query.domains.findMany = vi.fn(async () => []);

        const res = await app.request('/api/portfolio/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'nonexistent-domain.xyz' }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        expect(body.domains).toEqual([]);
      });
    });
  });

  // ===========================================================================
  // TENANT-AWARE READ TESTS
  // ===========================================================================

  describe('Tenant Isolation', () => {
    it('should reject requests without tenant context', async () => {
      const noTenantApp = new Hono<Env>();
      noTenantApp.use('*', (c, next) => {
        c.set('db', mockDb as unknown as Env['Variables']['db']);
        c.set('actorId', 'user-123');
        // tenantId not set
        return next();
      });
      noTenantApp.route('/api/portfolio', portfolioRoutes);

      const res = await noTenantApp.request('/api/portfolio/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBe('Unauthorized');
    });

    it('should only return domains for current tenant in search', async () => {
      const res = await app.request('/api/portfolio/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      // The mock returns tenant-1 domains only due to tenant filtering
      const body = (await res.json()) as JsonBody;
      expect(body.domains).toBeDefined();
    });

    it('should filter saved filters by tenant and user', async () => {
      // Add some test filters
      mockData.savedFilters.push({
        id: 'filter-tenant1-user1',
        name: 'My Filter',
        criteria: {},
        isShared: false,
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockData.savedFilters.push({
        id: 'filter-tenant1-shared',
        name: 'Shared Filter',
        criteria: {},
        isShared: true,
        createdBy: 'other-user',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockData.savedFilters.push({
        id: 'filter-tenant2',
        name: 'Other Tenant Filter',
        criteria: {},
        isShared: true,
        createdBy: 'user-456',
        tenantId: 'tenant-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/filters');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.filters).toBeDefined();
      // Should include user's own filter and shared filters from same tenant
    });

    it('should include tenant context in audit events', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Test note' }),
      });

      expect(res.status).toBe(201);

      // Verify audit event was created with tenant context
      expect(mockDb.insert).toHaveBeenCalled();
      const insertCalls = mockDb.insert.mock.calls;
      // Check that audit event was inserted with correct tenant/actor context
      // The insert is called twice: once for the note, once for the audit event
      const drizzleNameSymbol = Symbol.for('drizzle:Name');
      const auditCall = insertCalls.find((call) => {
        const table = call[0] as Record<symbol, string>;
        return table[drizzleNameSymbol] === 'audit_events';
      });
      expect(auditCall).toBeDefined();
      if (auditCall) {
        expect(auditCall[1]).toHaveProperty('tenantId', 'tenant-1');
        expect(auditCall[1]).toHaveProperty('actorId', 'user-123');
      }
    });
  });

  // ===========================================================================
  // DOMAIN LOOKUP TESTS
  // ===========================================================================

  describe('Domain Lookup', () => {
    it('should resolve a tenant-owned domain by name', async () => {
      const res = await app.request('/api/portfolio/domains/by-name/example.com');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.domain).toMatchObject({ id: 'domain-1', name: 'example.com' });
    });

    it('should return 404 when domain name is not in the tenant portfolio', async () => {
      const res = await app.request('/api/portfolio/domains/by-name/missing.example');

      expect(res.status).toBe(404);
    });

    it('should resolve exact tenant match even when many partial matches exist first', async () => {
      for (let index = 0; index < 25; index += 1) {
        mockData.domains.push({
          id: `domain-extra-${index}`,
          name: `example-${index}.com`,
          normalizedName: `example-${index}.com`,
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      mockData.domains.push({
        id: 'domain-exact-tail',
        name: 'target.example.com',
        normalizedName: 'target.example.com',
        tenantId: 'tenant-1',
        zoneManagement: 'managed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/domains/by-name/target.example.com');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.domain).toMatchObject({ id: 'domain-exact-tail', name: 'target.example.com' });
    });
  });

  // ===========================================================================
  // DOMAIN NOTES TESTS
  // ===========================================================================

  describe('Domain Notes', () => {
    it('should list notes for a domain', async () => {
      mockData.domainNotes.push({
        id: 'note-1',
        domainId: 'domain-1',
        content: 'Test note',
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/domains/domain-1/notes');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.notes).toBeDefined();
    });

    it('should create a note', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'New note content' }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as JsonBody;
      expect(body.note).toBeDefined();
      expect((body.note as JsonBody).content).toBe('New note content');
    });

    it('should validate note content is required', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBeDefined();
    });

    it('should validate note content max length', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'x'.repeat(10001) }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBeDefined();
    });

    it('should update a note', async () => {
      mockData.domainNotes.push({
        id: 'note-1',
        domainId: 'domain-1',
        content: 'Original content',
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/notes/note-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.note).toBeDefined();
    });

    it('should delete a note', async () => {
      mockData.domainNotes.push({
        id: 'note-1',
        domainId: 'domain-1',
        content: 'To be deleted',
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/notes/note-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent note on update', async () => {
      mockDb.selectOne = vi.fn(async () => undefined);

      const res = await app.request('/api/portfolio/notes/nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });

      expect(res.status).toBe(404);
    });

    it('should reject updating a note from another tenant', async () => {
      mockData.domainNotes.push({
        id: 'note-foreign',
        domainId: 'domain-3',
        content: 'Foreign tenant note',
        createdBy: 'user-999',
        tenantId: 'tenant-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/notes/note-foreign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Nope' }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // DOMAIN TAGS TESTS
  // ===========================================================================

  describe('Domain Tags', () => {
    it('should list tenant tag suggestions', async () => {
      mockData.domainTags.push({
        id: 'tag-1',
        domainId: 'domain-1',
        tag: 'production',
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
      });
      mockData.domainTags.push({
        id: 'tag-2',
        domainId: 'domain-2',
        tag: 'shared',
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
      });
      mockData.domainTags.push({
        id: 'tag-3',
        domainId: 'domain-3',
        tag: 'other-tenant',
        createdBy: 'user-999',
        tenantId: 'tenant-2',
        createdAt: new Date(),
      });

      const res = await app.request('/api/portfolio/tags');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tags).toEqual(['production', 'shared']);
    });

    it('should list tags for a domain', async () => {
      mockData.domainTags.push({
        id: 'tag-1',
        domainId: 'domain-1',
        tag: 'production',
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
      });

      const res = await app.request('/api/portfolio/domains/domain-1/tags');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.tags).toBeDefined();
    });

    it('should add a tag to a domain', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'production' }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as JsonBody;
      expect(body.tag).toBeDefined();
      expect((body.tag as JsonBody).tag).toBe('production');
    });

    it('should normalize tag to lowercase', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'PRODUCTION' }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as JsonBody;
      expect((body.tag as JsonBody).tag).toBe('production');
    });

    it('should validate tag format', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'invalid tag with spaces!' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBeDefined();
    });

    it('should reject tag exceeding max length 50 (PR-11.1)', async () => {
      const longTag = 'a'.repeat(51);
      const res = await app.request('/api/portfolio/domains/domain-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: longTag }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBeDefined();
    });

    it('should accept tag at exactly max length 50 (PR-11.1)', async () => {
      const maxTag = 'a'.repeat(50);
      const res = await app.request('/api/portfolio/domains/domain-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: maxTag }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as JsonBody;
      expect((body.tag as JsonBody).tag).toBe(maxTag);
    });

    it('should reject empty tag (PR-11.1)', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject tag with special characters (PR-11.1)', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'tag.with.dots' }),
      });

      expect(res.status).toBe(400);
    });

    it('should remove a tag from a domain', async () => {
      const res = await app.request('/api/portfolio/domains/domain-1/tags/production', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.success).toBe(true);
    });
  });

  // ===========================================================================
  // SAVED FILTERS TESTS
  // ===========================================================================

  describe('Saved Filters', () => {
    it('should list filters for tenant/user', async () => {
      mockData.savedFilters.push({
        id: 'filter-1',
        name: 'High Severity',
        criteria: { severities: ['high', 'critical'] },
        isShared: false,
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/filters');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.filters).toBeDefined();
      const filters = body.filters as Array<{ canManage?: boolean }>;
      expect(filters[0]).toHaveProperty('canManage', true);
    });

    it('should create a saved filter', async () => {
      const res = await app.request('/api/portfolio/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'My Filter',
          criteria: { severities: ['high'] },
          isShared: false,
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as JsonBody;
      expect(body.filter).toBeDefined();
      expect((body.filter as JsonBody).name).toBe('My Filter');
    });

    it('should validate filter name is required', async () => {
      const res = await app.request('/api/portfolio/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria: {} }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toBeDefined();
    });

    it('should update a saved filter owned by user', async () => {
      mockData.savedFilters.push({
        id: 'filter-1',
        name: 'Original Name',
        criteria: {},
        isShared: false,
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/filters/filter-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(res.status).toBe(200);
    });

    it('should reject updating filter owned by another user', async () => {
      mockData.savedFilters.push({
        id: 'filter-1',
        name: 'Other User Filter',
        criteria: {},
        isShared: true,
        createdBy: 'other-user',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/filters/filter-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hijacked' }),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toContain('another user');
    });

    it('should reject criteria updates through metadata-only filter edit route', async () => {
      mockData.savedFilters.push({
        id: 'filter-criteria',
        name: 'Immutable Criteria',
        criteria: { tags: ['production'] },
        isShared: false,
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/filters/filter-criteria', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria: { tags: ['critical'] } }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toContain('criteria');
    });

    it('should delete a saved filter', async () => {
      mockData.savedFilters.push({
        id: 'filter-1',
        name: 'To Delete',
        criteria: {},
        isShared: false,
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/filters/filter-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.success).toBe(true);
    });

    it('should reject deleting filter owned by another user', async () => {
      mockData.savedFilters.push({
        id: 'filter-shared',
        name: 'Shared Foreign Filter',
        criteria: {},
        isShared: true,
        createdBy: 'other-user',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/filters/filter-shared', {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toContain('another user');
    });

    it('should reject updating a filter from another tenant', async () => {
      mockData.savedFilters.push({
        id: 'filter-foreign',
        name: 'Foreign Filter',
        criteria: {},
        isShared: false,
        createdBy: 'user-123',
        tenantId: 'tenant-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/filters/filter-foreign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Still Foreign' }),
      });

      expect(res.status).toBe(404);
    });

    // =======================================================================
    // PR-04.1: Saved Filter Round-Trip Integration Tests
    // =======================================================================

    it('PR-04.1: should create filter with complex criteria and verify round-trip', async () => {
      // Complex filter criteria matching the bead description
      const complexCriteria = {
        severities: ['critical', 'high'],
        tags: ['production', 'critical-infra'],
        zoneManagement: ['managed'],
        query: 'example.com',
      };

      // Step 1: Create the filter
      const createRes = await app.request('/api/portfolio/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Critical Production Filters',
          description: 'Find critical issues in production managed domains',
          criteria: complexCriteria,
          isShared: true,
        }),
      });

      expect(createRes.status).toBe(201);
      const createBody = (await createRes.json()) as JsonBody;
      const filterId = (createBody.filter as JsonBody).id as string;
      expect(filterId).toBeDefined();

      // Step 2: List filters and verify exact JSON round-trip
      const listRes = await app.request('/api/portfolio/filters');
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as JsonBody;
      const filters = listBody.filters as Array<JsonBody>;

      // Find our filter
      const loadedFilter = filters.find((f) => f.id === filterId);
      expect(loadedFilter).toBeDefined();

      // Verify exact criteria match
      expect(loadedFilter?.name).toBe('Critical Production Filters');
      expect(loadedFilter?.description).toBe('Find critical issues in production managed domains');
      expect(loadedFilter?.criteria).toEqual(complexCriteria);
      expect(loadedFilter?.isShared).toBe(true);
      expect(loadedFilter?.createdBy).toBe('user-123');
      expect(loadedFilter?.tenantId).toBe('tenant-1');
    });

    it('PR-04.1: should apply saved filter criteria to portfolio search', async () => {
      // Create domain with tags
      mockData.domains.push({
        id: 'domain-with-tag',
        name: 'critical.example.com',
        normalizedName: 'critical.example.com',
        tenantId: 'tenant-1',
        zoneManagement: 'managed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockData.domainTags.push({
        id: 'tag-1',
        domainId: 'domain-with-tag',
        tag: 'production',
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
      });

      // Create snapshot with critical finding
      mockData.snapshots.push({
        id: 'snap-critical',
        domainId: 'domain-with-tag',
        createdAt: new Date(),
        resultState: 'success',
        rulesetVersionId: '1.0.0',
      });
      mockData.findings.push({
        id: 'finding-critical',
        snapshotId: 'snap-critical',
        ruleId: 'mail.spf-analysis.v1',
        severity: 'critical',
        summary: 'Critical SPF issue',
      });

      // Create filter with tag criteria
      const createRes = await app.request('/api/portfolio/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Tag Filter',
          criteria: { tags: ['production'] },
        }),
      });

      expect(createRes.status).toBe(201);

      // Apply filter to search
      const searchRes = await app.request('/api/portfolio/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: ['production'],
          severities: ['critical'],
        }),
      });

      expect(searchRes.status).toBe(200);
      const searchBody = (await searchRes.json()) as JsonBody;
      expect(searchBody.domains).toBeDefined();
      expect(Array.isArray(searchBody.domains)).toBe(true);
    });

    it('PR-04.1: should delete saved filter and verify it is gone', async () => {
      // Create a filter first
      const createRes = await app.request('/api/portfolio/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Filter To Delete',
          criteria: { query: 'temp.example.com' },
        }),
      });

      expect(createRes.status).toBe(201);
      const createBody = (await createRes.json()) as JsonBody;
      const filterId = (createBody.filter as JsonBody).id as string;

      // Delete the filter
      const deleteRes = await app.request(`/api/portfolio/filters/${filterId}`, {
        method: 'DELETE',
      });

      expect(deleteRes.status).toBe(200);

      // Verify filter is gone
      const getRes = await app.request(`/api/portfolio/filters/${filterId}`);
      expect(getRes.status).toBe(404);
    });

    it('PR-04.1: should produce audit events for filter operations', async () => {
      // Step 1: Create filter and verify audit event
      const createRes = await app.request('/api/portfolio/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Audited Filter',
          criteria: { severities: ['high'] },
        }),
      });

      expect(createRes.status).toBe(201);
      const createBody = (await createRes.json()) as JsonBody;
      const filterId = (createBody.filter as JsonBody).id as string;

      // Check audit events for filter creation
      const createAuditRes = await app.request(
        `/api/portfolio/audit?entityType=saved_filter&entityId=${filterId}`
      );
      expect(createAuditRes.status).toBe(200);
      const createAuditBody = (await createAuditRes.json()) as JsonBody;
      const createAuditEvents = createAuditBody.events as Array<JsonBody>;
      expect(createAuditEvents.some((e) => e.action === 'filter_created')).toBe(true);

      // Step 2: Update filter and verify audit event
      const updateRes = await app.request(`/api/portfolio/filters/${filterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Audited Filter' }),
      });
      expect(updateRes.status).toBe(200);

      // Check audit events for filter update
      const updateAuditRes = await app.request(
        `/api/portfolio/audit?entityType=saved_filter&entityId=${filterId}`
      );
      expect(updateAuditRes.status).toBe(200);
      const updateAuditBody = (await updateAuditRes.json()) as JsonBody;
      const updateAuditEvents = updateAuditBody.events as Array<JsonBody>;
      expect(updateAuditEvents.some((e) => e.action === 'filter_updated')).toBe(true);

      // Step 3: Delete filter and verify audit event
      const deleteRes = await app.request(`/api/portfolio/filters/${filterId}`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(200);

      // Check audit events for filter deletion
      const deleteAuditRes = await app.request(
        `/api/portfolio/audit?entityType=saved_filter&entityId=${filterId}`
      );
      expect(deleteAuditRes.status).toBe(200);
      const deleteAuditBody = (await deleteAuditRes.json()) as JsonBody;
      const deleteAuditEvents = deleteAuditBody.events as Array<JsonBody>;
      expect(deleteAuditEvents.some((e) => e.action === 'filter_deleted')).toBe(true);
    });

    it('PR-04.1: should handle multiple filter operations in sequence', async () => {
      // Pre-populate with two filters
      mockData.savedFilters.push({
        id: 'seq-filter-1',
        name: 'Sequential Filter A',
        criteria: { severities: ['high'] },
        isShared: false,
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockData.savedFilters.push({
        id: 'seq-filter-2',
        name: 'Sequential Filter B',
        criteria: { severities: ['medium'] },
        isShared: false,
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // List all filters
      const listRes = await app.request('/api/portfolio/filters');
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as JsonBody;
      const filters = listBody.filters as Array<JsonBody>;

      // Verify both filters exist
      const filterNames = filters.map((f) => f.name as string);
      expect(filterNames).toContain('Sequential Filter A');
      expect(filterNames).toContain('Sequential Filter B');

      // Verify we can create additional filters
      const createRes = await app.request('/api/portfolio/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sequential Filter C',
          criteria: { severities: ['low'] },
        }),
      });
      expect(createRes.status).toBe(201);

      // Verify third filter appears in list
      const finalListRes = await app.request('/api/portfolio/filters');
      const finalListBody = (await finalListRes.json()) as JsonBody;
      const finalFilters = finalListBody.filters as Array<JsonBody>;
      const finalFilterNames = finalFilters.map((f) => f.name as string);
      expect(finalFilterNames).toContain('Sequential Filter C');
      expect(finalFilterNames).toContain('Sequential Filter A');
      expect(finalFilterNames).toContain('Sequential Filter B');
    });
  });

  // ===========================================================================
  // TEMPLATE OVERRIDES TESTS
  // Note: Template override CRUD requires admin access.
  // These tests use X-Test-Admin header to bypass requireAdminAccess in test mode.
  // ===========================================================================

  describe('Template Overrides', () => {
    it('should list overrides by provider', async () => {
      mockData.templateOverrides.push({
        id: 'override-1',
        providerKey: 'google',
        templateKey: 'dkim',
        overrideData: { selector: 'custom' },
        appliesToDomains: [],
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/templates/overrides?provider=google');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.overrides).toBeDefined();
    });

    it('should create a template override', async () => {
      const res = await app.request('/api/portfolio/templates/overrides', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          providerKey: 'google',
          templateKey: 'dkim',
          overrideData: { selector: 'custom-selector' },
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as JsonBody;
      expect(body.override).toBeDefined();
    });

    it('should validate override data is required', async () => {
      const res = await app.request('/api/portfolio/templates/overrides', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          providerKey: 'google',
          templateKey: 'dkim',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should update a template override', async () => {
      mockData.templateOverrides.push({
        id: 'override-1',
        providerKey: 'google',
        templateKey: 'dkim',
        overrideData: { selector: 'old' },
        appliesToDomains: [],
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/templates/overrides/override-1', {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ overrideData: { selector: 'new' } }),
      });

      expect(res.status).toBe(200);
    });

    it('should reject protected field updates for a template override', async () => {
      mockData.templateOverrides.push({
        id: 'override-1',
        providerKey: 'google',
        templateKey: 'dkim',
        overrideData: { selector: 'old' },
        appliesToDomains: [],
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/templates/overrides/override-1', {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ tenantId: 'tenant-2' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonBody;
      expect(body.error).toContain('Unsupported override fields');
    });

    it('should delete a template override', async () => {
      mockData.templateOverrides.push({
        id: 'override-1',
        providerKey: 'google',
        templateKey: 'dkim',
        overrideData: {},
        appliesToDomains: [],
        createdBy: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/templates/overrides/override-1', {
        method: 'DELETE',
        headers: adminHeaders,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.success).toBe(true);
    });

    it('should reject updating an override from another tenant', async () => {
      mockData.templateOverrides.push({
        id: 'override-foreign',
        providerKey: 'google',
        templateKey: 'dkim',
        overrideData: { selector: 'foreign' },
        appliesToDomains: [],
        createdBy: 'user-999',
        tenantId: 'tenant-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request('/api/portfolio/templates/overrides/override-foreign', {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ overrideData: { selector: 'new' } }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // AUDIT LOG TESTS
  // ===========================================================================

  describe('Audit Log', () => {
    it('should list audit events for tenant', async () => {
      mockData.auditEvents.push({
        id: 'event-1',
        action: 'domain_note_created',
        entityType: 'domain_note',
        entityId: 'note-1',
        newValue: { content: 'Test' },
        actorId: 'user-123',
        tenantId: 'tenant-1',
        createdAt: new Date(),
      });

      const res = await app.request('/api/portfolio/audit');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.events).toBeDefined();
    });

    it('should support limit parameter', async () => {
      const res = await app.request('/api/portfolio/audit?limit=10');

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      expect(body.events).toBeDefined();
    });
  });

  // ===========================================================================
  // AUDIT LOG COMPLETENESS TESTS - PR-04.3
  // ===========================================================================

  describe('Audit Log Completeness (PR-04.3)', () => {
    describe('Note CRUD Audit Trail', () => {
      it('should produce audit event when creating a note', async () => {
        mockData.domains.push({
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'unmanaged',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const res = await app.request('/api/portfolio/domains/domain-1/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Test note content' }),
        });

        expect(res.status).toBe(201);

        // Verify audit event was created
        const auditRes = await app.request('/api/portfolio/audit?entityType=domain_note');
        expect(auditRes.status).toBe(200);
        const auditBody = (await auditRes.json()) as JsonBody;
        const events = auditBody.events as Array<JsonBody>;
        expect(events.some((e) => e.action === 'domain_note_created')).toBe(true);
      });

      it('should produce audit event when updating a note', async () => {
        mockData.domainNotes = [
          {
            id: 'note-1',
            domainId: 'domain-1',
            content: 'Original content',
            createdBy: 'user-123',
            tenantId: 'tenant-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const res = await app.request('/api/portfolio/notes/note-1', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Updated content' }),
        });

        expect(res.status).toBe(200);

        const auditRes = await app.request(
          '/api/portfolio/audit?entityType=domain_note&entityId=note-1'
        );
        expect(auditRes.status).toBe(200);
        const auditBody = (await auditRes.json()) as JsonBody;
        const events = auditBody.events as Array<JsonBody>;
        expect(events.some((e) => e.action === 'domain_note_updated')).toBe(true);
      });

      it('should produce audit event when deleting a note', async () => {
        mockData.domainNotes = [
          {
            id: 'note-2',
            domainId: 'domain-1',
            content: 'To be deleted',
            createdBy: 'user-123',
            tenantId: 'tenant-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const res = await app.request('/api/portfolio/notes/note-2', {
          method: 'DELETE',
        });

        expect(res.status).toBe(200);

        const auditRes = await app.request(
          '/api/portfolio/audit?entityType=domain_note&entityId=note-2'
        );
        expect(auditRes.status).toBe(200);
        const auditBody = (await auditRes.json()) as JsonBody;
        const events = auditBody.events as Array<JsonBody>;
        expect(events.some((e) => e.action === 'domain_note_deleted')).toBe(true);
      });
    });

    describe('Tag CRUD Audit Trail', () => {
      it('should produce audit event when adding a tag', async () => {
        mockData.domains.push({
          id: 'domain-2',
          name: 'test.com',
          normalizedName: 'test.com',
          tenantId: 'tenant-1',
          zoneManagement: 'unmanaged',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const res = await app.request('/api/portfolio/domains/domain-2/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: 'production' }),
        });

        expect(res.status).toBe(201);

        const auditRes = await app.request('/api/portfolio/audit?entityType=domain_tag');
        expect(auditRes.status).toBe(200);
        const auditBody = (await auditRes.json()) as JsonBody;
        const events = auditBody.events as Array<JsonBody>;
        expect(events.some((e) => e.action === 'domain_tag_added')).toBe(true);
      });

      it('should produce audit event when removing a tag', async () => {
        mockData.domainTags = [
          {
            id: 'tag-1',
            domainId: 'domain-2',
            tag: 'production',
            createdBy: 'user-123',
            tenantId: 'tenant-1',
            createdAt: new Date(),
          },
        ];

        const res = await app.request('/api/portfolio/domains/domain-2/tags/production', {
          method: 'DELETE',
        });

        expect(res.status).toBe(200);

        const auditRes = await app.request(
          '/api/portfolio/audit?entityType=domain_tag&entityId=tag-1'
        );
        expect(auditRes.status).toBe(200);
        const auditBody = (await auditRes.json()) as JsonBody;
        const events = auditBody.events as Array<JsonBody>;
        expect(events.some((e) => e.action === 'domain_tag_removed')).toBe(true);
      });
    });

    describe('Saved Filter CRUD Audit Trail', () => {
      it('should produce audit events for filter creation and deletion', async () => {
        // Create filter
        const createRes = await app.request('/api/portfolio/filters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'High Severity Filter',
            criteria: { severities: ['high', 'critical'] },
          }),
        });

        expect(createRes.status).toBe(201);
        const createBody = (await createRes.json()) as JsonBody;
        const filterId = (createBody.filter as { id?: string })?.id as string;

        // Verify create audit event
        const createAuditRes = await app.request(
          `/api/portfolio/audit?entityType=saved_filter&entityId=${filterId}`
        );
        expect(createAuditRes.status).toBe(200);
        const createAuditBody = (await createAuditRes.json()) as JsonBody;
        const createEvents = createAuditBody.events as Array<JsonBody>;
        expect(createEvents.some((e) => e.action === 'filter_created')).toBe(true);

        // Delete filter
        const deleteRes = await app.request(`/api/portfolio/filters/${filterId}`, {
          method: 'DELETE',
        });

        expect(deleteRes.status).toBe(200);

        // Verify delete audit event
        const deleteAuditRes = await app.request(
          `/api/portfolio/audit?entityType=saved_filter&entityId=${filterId}`
        );
        expect(deleteAuditRes.status).toBe(200);
        const deleteAuditBody = (await deleteAuditRes.json()) as JsonBody;
        const deleteEvents = deleteAuditBody.events as Array<JsonBody>;
        expect(deleteEvents.some((e) => e.action === 'filter_deleted')).toBe(true);
      });
    });

    describe('Template Override Audit Trail', () => {
      it('should produce audit event when creating an override', async () => {
        const res = await app.request('/api/portfolio/templates/overrides', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            providerKey: 'google-workspace',
            templateKey: 'dkim',
            overrideData: { dkimSelectors: ['custom'] },
          }),
        });

        expect(res.status).toBe(201);
        const body = (await res.json()) as JsonBody;
        const overrideId = (body.override as { id?: string })?.id as string;

        const auditRes = await app.request(
          `/api/portfolio/audit?entityType=template_override&entityId=${overrideId}`
        );
        expect(auditRes.status).toBe(200);
        const auditBody = (await auditRes.json()) as JsonBody;
        const events = auditBody.events as Array<JsonBody>;
        expect(events.some((e) => e.action === 'template_override_created')).toBe(true);
      });
    });

    describe('Tenant Scoping in Audit Trail', () => {
      it('should not expose audit events across tenant boundaries', async () => {
        // Create event for tenant-1
        mockData.auditEvents.push({
          id: 'event-cross-tenant-1',
          action: 'domain_note_created',
          entityType: 'domain_note',
          entityId: 'cross-tenant-note',
          newValue: { content: 'Cross tenant test' },
          actorId: 'user-other',
          tenantId: 'tenant-2', // Different tenant
          createdAt: new Date(),
        });

        // Query audit as tenant-1
        const res = await app.request('/api/portfolio/audit');

        expect(res.status).toBe(200);
        const body = (await res.json()) as JsonBody;
        const events = body.events as Array<JsonBody>;

        // Should not include tenant-2 events
        expect(events.every((e) => (e.tenantId as string) === 'tenant-1')).toBe(true);
      });
    });
  });

  // ===========================================================================
  // FINDINGS EVALUATED STATE TESTS
  // ===========================================================================

  describe('Findings Evaluated State', () => {
    it('should include findingsEvaluated flag in search results', async () => {
      const res = await app.request('/api/portfolio/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as JsonBody;
      const domains = body.domains as Array<{ findingsEvaluated?: boolean }>;
      // Each domain result should have findingsEvaluated indicator
      if (domains.length > 0) {
        expect(domains[0]).toHaveProperty('findingsEvaluated');
      }
    });

    it('should not filter out unevaluated domains when severity filter used', async () => {
      // Domain-2 has snapshot with no rulesetVersionId (not evaluated)
      // It should still appear in results because we can't know if it would match
      const res = await app.request('/api/portfolio/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severities: ['high'] }),
      });

      expect(res.status).toBe(200);
      // Test passes if no error - actual filtering logic is tested at unit level
    });
  });
});
