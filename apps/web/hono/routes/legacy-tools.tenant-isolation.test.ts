/**
 * Legacy Tools Routes — Tenant Isolation BDD tests for GET /shadow-stats
 *
 * REGRESSION: GET /api/legacy-tools/shadow-stats previously called
 *   legacyLogRepo.getStats(), shadowRepo.getStats(),
 *   legacyLogRepo.findByDomain(domain), shadowRepo.findByDomain(domain)
 * with NO tenant scoping, plus an unscoped snapshot/findings lookup. A caller
 * could read any tenant's shadow stats, legacy access logs, discrepancies and
 * newFindingsCount.
 *
 * TEST STRATEGY: Two-tenant mock DB. Tenant A calls /shadow-stats (aggregate
 * and ?domain=…) and must see ONLY its own data — never tenant B's rows and
 * never NULL-tenant (system) rows.
 *
 * Run: bun run test apps/web/hono/routes/legacy-tools.tenant-isolation.test.ts
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { legacyToolsRoutes } from './legacy-tools.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TENANT_A = 'tenant-aaaa-0001';
const TENANT_B = 'tenant-bbbb-0002';

// =============================================================================
// MOCK DB INFRASTRUCTURE
// =============================================================================

interface MockState {
  domains: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  shadowComparisons: Array<Record<string, unknown>>;
  legacyAccessLogs: Array<Record<string, unknown>>;
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') return record[symbolName] as string;
  const symbols = Object.getOwnPropertySymbols(record);
  const drizzleName = symbols.find((s) => String(s) === 'Symbol(drizzle:Name)');
  if (drizzleName && typeof record[drizzleName] === 'string') {
    return record[drizzleName] as string;
  }
  return '';
}

function getConditionParam(condition: unknown): unknown {
  const sql = condition as {
    queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
  };
  return sql.queryChunks?.find((c) => c?.constructor?.name === 'Param')?.value;
}

function createMockDb(state: MockState): IDatabaseAdapter {
  return {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => {
      const name = getTableName(table);
      if (name === 'legacy_access_logs') return [...state.legacyAccessLogs];
      if (name === 'shadow_comparisons') return [...state.shadowComparisons];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTableName(table);
      const param = getConditionParam(condition);
      if (name === 'legacy_access_logs')
        return state.legacyAccessLogs.filter((r) => r.domain === param);
      if (name === 'shadow_comparisons')
        return state.shadowComparisons.filter((r) => r.domain === param);
      if (name === 'snapshots') return state.snapshots.filter((r) => r.domainName === param);
      if (name === 'findings') return state.findings.filter((r) => r.snapshotId === param);
      if (name === 'domains') return state.domains.filter((r) => r.normalizedName === param);
      return [];
    }),
    selectOne: vi.fn(async () => null),
    insert: vi.fn(),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(async (cb: (db: IDatabaseAdapter) => Promise<unknown>) =>
      cb(createMockDb(state))
    ),
  } as unknown as IDatabaseAdapter;
}

// =============================================================================
// APP FACTORY
// =============================================================================

function createAppForTenant(state: MockState, tenantId?: string) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    if (tenantId) {
      c.set('tenantId', tenantId);
      c.set('actorId', `actor-${tenantId}`);
    }
    await next();
  });
  app.route('/api/legacy-tools', legacyToolsRoutes);
  return app;
}

// =============================================================================
// SEEDED TWO-TENANT STATE
// =============================================================================

interface ShadowStatsBody {
  legacyAccessCount: number;
  newFindingsCount: number;
  discrepancies: Array<{ id: string; field: string }>;
  stats: {
    legacy: { total: number };
    shadow: { total: number; mismatches: number };
    domain: {
      legacyAccessCount: number;
      comparisonCount: number;
      mismatchCount: number;
    } | null;
  };
}

function twoTenantState(): MockState {
  const now = new Date();
  return {
    domains: [
      { id: 'dom-a', name: 'alpha.com', normalizedName: 'alpha.com', tenantId: TENANT_A },
      { id: 'dom-b', name: 'bravo.com', normalizedName: 'bravo.com', tenantId: TENANT_B },
    ],
    snapshots: [
      {
        id: 'snap-a',
        domainId: 'dom-a',
        domainName: 'alpha.com',
        createdAt: now,
      },
      {
        id: 'snap-b',
        domainId: 'dom-b',
        domainName: 'bravo.com',
        createdAt: now,
      },
    ],
    findings: [
      { id: 'find-a1', snapshotId: 'snap-a', type: 'mail.no-spf' },
      { id: 'find-a2', snapshotId: 'snap-a', type: 'mail.no-dmarc' },
      { id: 'find-b1', snapshotId: 'snap-b', type: 'mail.no-spf' },
      { id: 'find-b2', snapshotId: 'snap-b', type: 'mail.no-dmarc' },
      { id: 'find-b3', snapshotId: 'snap-b', type: 'mail.no-dkim' },
    ],
    legacyAccessLogs: [
      {
        id: 'log-a',
        domain: 'alpha.com',
        tenantId: TENANT_A,
        toolType: 'dmarc-check',
        requestedAt: now,
        requestSource: 'api',
        responseStatus: 'success',
        outputSummary: {},
      },
      {
        id: 'log-b',
        domain: 'bravo.com',
        tenantId: TENANT_B,
        toolType: 'dmarc-check',
        requestedAt: now,
        requestSource: 'api',
        responseStatus: 'success',
        outputSummary: {},
      },
      // NULL tenantId = system-generated; must never surface to a tenant.
      {
        id: 'log-sys',
        domain: 'alpha.com',
        tenantId: undefined,
        toolType: 'dmarc-check',
        requestedAt: now,
        requestSource: 'scheduled',
        responseStatus: 'success',
        outputSummary: {},
      },
    ],
    shadowComparisons: [
      {
        id: 'sc-a',
        domain: 'alpha.com',
        tenantId: TENANT_A,
        status: 'mismatch',
        comparedAt: now,
        comparisons: [
          {
            field: 'dmarc-present',
            status: 'mismatch',
            legacyValue: false,
            newValue: true,
          },
        ],
        metrics: {},
        summary: 'A mismatch',
        adjudication: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        adjudicationNotes: null,
      },
      {
        id: 'sc-b',
        domain: 'bravo.com',
        tenantId: TENANT_B,
        status: 'match',
        comparedAt: now,
        comparisons: [],
        metrics: {},
        summary: 'B match',
        adjudication: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        adjudicationNotes: null,
      },
      // NULL tenantId system comparison with its own mismatch field; must never
      // surface to a tenant caller.
      {
        id: 'sc-sys',
        domain: 'alpha.com',
        tenantId: undefined,
        status: 'mismatch',
        comparedAt: now,
        comparisons: [
          {
            field: 'spf-present',
            status: 'mismatch',
            legacyValue: false,
            newValue: true,
          },
        ],
        metrics: {},
        summary: 'System mismatch',
        adjudication: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        adjudicationNotes: null,
      },
    ],
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Legacy Tools /shadow-stats — Tenant Isolation', () => {
  // ===========================================================================
  // Aggregate stats (no domain) must be tenant-scoped.
  // ===========================================================================
  describe('GET /shadow-stats (aggregate)', () => {
    it('tenant-A aggregate legacy/shadow totals reflect only own rows', async () => {
      const state = twoTenantState();
      const app = createAppForTenant(state, TENANT_A);

      const res = await app.request('/api/legacy-tools/shadow-stats');
      expect(res.status).toBe(200);
      const json = (await res.json()) as ShadowStatsBody;

      // Success precondition: tenant-A's own rows are counted.
      expect(json.stats.legacy.total).toBe(1);
      expect(json.stats.shadow.total).toBe(1);
      expect(json.stats.shadow.mismatches).toBe(1); // sc-a
    });

    it('tenant-B aggregate legacy/shadow totals reflect only own rows', async () => {
      const state = twoTenantState();
      const app = createAppForTenant(state, TENANT_B);

      const res = await app.request('/api/legacy-tools/shadow-stats');
      expect(res.status).toBe(200);
      const json = (await res.json()) as ShadowStatsBody;

      expect(json.stats.legacy.total).toBe(1);
      expect(json.stats.shadow.total).toBe(1);
      expect(json.stats.shadow.mismatches).toBe(0); // sc-b is a match
    });

    it('system (NULL-tenant) rows are never surfaced to either tenant', async () => {
      const state = twoTenantState();
      const appA = createAppForTenant(state, TENANT_A);
      const appB = createAppForTenant(state, TENANT_B);

      const jsonA = (await (
        await appA.request('/api/legacy-tools/shadow-stats')
      ).json()) as ShadowStatsBody;
      const jsonB = (await (
        await appB.request('/api/legacy-tools/shadow-stats')
      ).json()) as ShadowStatsBody;

      // 3 legacy logs exist (A, B, system). Each tenant sees exactly 1, so the
      // system log is excluded from both — sum is 2, not 3.
      expect(jsonA.stats.legacy.total + jsonB.stats.legacy.total).toBe(2);
      // 3 shadow comparisons exist (A, B, system). Same reasoning.
      expect(jsonA.stats.shadow.total + jsonB.stats.shadow.total).toBe(2);
    });
  });

  // ===========================================================================
  // Domain-specific stats must be tenant-scoped, incl. newFindingsCount.
  // ===========================================================================
  describe('GET /shadow-stats?domain=…', () => {
    it('tenant-A sees only own data for an owned domain', async () => {
      const state = twoTenantState();
      const app = createAppForTenant(state, TENANT_A);

      const res = await app.request('/api/legacy-tools/shadow-stats?domain=alpha.com');
      expect(res.status).toBe(200);
      const json = (await res.json()) as ShadowStatsBody;

      // Success precondition: own domain data present.
      expect(json.stats.domain?.legacyAccessCount).toBe(1); // log-a
      expect(json.stats.domain?.comparisonCount).toBe(1); // sc-a
      expect(json.stats.domain?.mismatchCount).toBe(1);
      expect(json.newFindingsCount).toBe(2); // tenant-A's 2 findings on snap-a
    });

    it('tenant-A querying tenant-B domain leaks NOTHING', async () => {
      const state = twoTenantState();
      const app = createAppForTenant(state, TENANT_A);

      const res = await app.request('/api/legacy-tools/shadow-stats?domain=bravo.com');
      expect(res.status).toBe(200);
      const json = (await res.json()) as ShadowStatsBody;

      // Precondition: request succeeded and domain block ran.
      expect(json.stats.domain).not.toBeNull();
      // No cross-tenant leak: B's logs/comparisons excluded by tenant filter.
      expect(json.stats.domain?.legacyAccessCount).toBe(0);
      expect(json.stats.domain?.comparisonCount).toBe(0);
      // Domain not owned by A → newFindingsCount must stay 0 (no findings leak).
      expect(json.newFindingsCount).toBe(0);
    });

    it('system (NULL-tenant) discrepancies never surface to a tenant', async () => {
      const state = twoTenantState();
      const app = createAppForTenant(state, TENANT_A);

      const res = await app.request('/api/legacy-tools/shadow-stats?domain=alpha.com');
      expect(res.status).toBe(200);
      const json = (await res.json()) as ShadowStatsBody;

      // Success precondition: tenant-A's own mismatch discrepancy IS present.
      const fields = json.discrepancies.map((d) => d.field);
      expect(fields).toContain('dmarc-present'); // from sc-a
      // System comparison sc-sys's field must not leak.
      expect(fields).not.toContain('spf-present');
      // And only tenant-A's comparison id appears.
      expect(json.discrepancies.every((d) => d.id === 'sc-a')).toBe(true);
    });
  });

  // ===========================================================================
  // Authentication requirement
  // ===========================================================================
  describe('Authentication', () => {
    it('unauthenticated request to /shadow-stats returns 401', async () => {
      const state = twoTenantState();
      const app = createAppForTenant(state, undefined);

      const res = await app.request('/api/legacy-tools/shadow-stats');
      expect(res.status).toBe(401);
    });
  });
});
