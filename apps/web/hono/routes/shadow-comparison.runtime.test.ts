/**
 * Shadow comparison route runtime tests
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { shadowComparisonRoutes } from './shadow-comparison.js';

interface MockState {
  snapshots: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  shadowComparisons: Array<Record<string, unknown>>;
  legacyAccessLogs: Array<Record<string, unknown>>;
  providerBaselines: Array<Record<string, unknown>>;
  templateOverrides: Array<Record<string, unknown>>;
  mismatchReports: Array<Record<string, unknown>>;
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
      if (tableName === 'snapshots') return [...state.snapshots];
      if (tableName === 'findings') return [...state.findings];
      if (tableName === 'shadow_comparisons') return [...state.shadowComparisons];
      if (tableName === 'legacy_access_logs') return [...state.legacyAccessLogs];
      if (tableName === 'provider_baselines') return [...state.providerBaselines];
      if (tableName === 'template_overrides') return [...state.templateOverrides];
      if (tableName === 'mismatch_reports') return [...state.mismatchReports];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'findings') return state.findings.filter((row) => row.snapshotId === param);
      if (tableName === 'shadow_comparisons')
        return state.shadowComparisons.filter(
          (row) => row.domain === param || row.snapshotId === param
        );
      if (tableName === 'legacy_access_logs')
        return state.legacyAccessLogs.filter(
          (row) => row.domain === param || row.toolType === param
        );
      if (tableName === 'provider_baselines')
        return state.providerBaselines.filter(
          (row) => row.providerKey === param || row.status === param
        );
      if (tableName === 'template_overrides')
        return state.templateOverrides.filter((row) => row.providerKey === param);
      if (tableName === 'mismatch_reports')
        return state.mismatchReports.filter((row) => row.domain === param);
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'snapshots') return state.snapshots.find((row) => row.id === param);
      if (tableName === 'shadow_comparisons')
        return state.shadowComparisons.find((row) => row.id === param);
      if (tableName === 'provider_baselines')
        return state.providerBaselines.find((row) => row.id === param || row.providerKey === param);
      return undefined;
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      const tableName = getTableName(table);
      const row = {
        id: `${tableName}-${Date.now()}`,
        createdAt: new Date(),
        ...values,
      };
      if (tableName === 'shadow_comparisons') state.shadowComparisons.push(row);
      if (tableName === 'legacy_access_logs') state.legacyAccessLogs.push(row);
      if (tableName === 'mismatch_reports') state.mismatchReports.push(row);
      return row;
    }),
    insertMany: vi.fn(),
    update: vi.fn(async (table: unknown, values: Record<string, unknown>, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'shadow_comparisons') {
        const idx = state.shadowComparisons.findIndex((r) => r.id === param);
        if (idx >= 0) {
          state.shadowComparisons[idx] = { ...state.shadowComparisons[idx], ...values };
          return [state.shadowComparisons[idx]];
        }
      }
      return [];
    }),
    updateOne: vi.fn(
      async (table: unknown, values: Record<string, unknown>, condition: unknown) => {
        const tableName = getTableName(table);
        const param = getConditionParam(condition);
        if (tableName === 'shadow_comparisons') {
          const idx = state.shadowComparisons.findIndex((r) => r.id === param);
          if (idx >= 0) {
            state.shadowComparisons[idx] = { ...state.shadowComparisons[idx], ...values };
            return state.shadowComparisons[idx];
          }
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

function createApp(state: MockState, withAdminAccess = false) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    c.set('tenantId', 'tenant-1');
    c.set('actorId', 'actor-1');
    if (withAdminAccess) {
      // Mock admin by setting internal secret header
      c.req.raw.headers.set('x-internal-secret', 'test-secret');
    }
    await next();
  });
  app.route('/api/shadow-comparison', shadowComparisonRoutes);
  return app;
}

function emptyState(): MockState {
  return {
    snapshots: [],
    findings: [],
    shadowComparisons: [],
    legacyAccessLogs: [],
    providerBaselines: [],
    templateOverrides: [],
    mismatchReports: [],
  };
}

describe('shadowComparisonRoutes runtime', () => {
  // ===========================================================================
  // TEMPLATE OVERRIDE SCOPING TESTS (Bead 57pa.2)
  // ===========================================================================

  describe('Template Override Scoping', () => {
    it('should apply override to specific domain when appliesToDomains contains that domain', async () => {
      const state = emptyState();
      state.templateOverrides = [
        {
          id: 'override-specific',
          providerKey: 'google-workspace',
          templateKey: 'dkim',
          overrideData: { dkimSelectors: ['custom-selector'] },
          appliesToDomains: ['specific.example.com'],
          tenantId: 'tenant-1',
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      state.providerBaselines = [
        {
          id: 'pb-1',
          providerKey: 'google-workspace',
          providerName: 'Google Workspace',
          baseline: {},
          dkimSelectors: ['default-google'],
          mxPatterns: ['*.google.com'],
          spfIncludes: ['_spf.google.com'],
          version: '1.0.0',
        },
      ];
      const app = createApp(state);

      // Request with the specific domain - should apply override
      const response = await app.request(
        '/api/shadow-comparison/provider-baselines/google-workspace?domainName=specific.example.com'
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        baseline: { dkimSelectors: string[]; overridesApplied: string[] };
      };
      expect(json.baseline.overridesApplied).toContain('override-specific');
      expect(json.baseline.dkimSelectors).toContain('custom-selector');
    });

    it('should NOT apply override to different domain when appliesToDomains contains other domain', async () => {
      const state = emptyState();
      state.templateOverrides = [
        {
          id: 'override-specific',
          providerKey: 'google-workspace',
          templateKey: 'dkim',
          overrideData: { dkimSelectors: ['custom-selector'] },
          appliesToDomains: ['specific.example.com'],
          tenantId: 'tenant-1',
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      state.providerBaselines = [
        {
          id: 'pb-1',
          providerKey: 'google-workspace',
          providerName: 'Google Workspace',
          baseline: {},
          dkimSelectors: ['default-google'],
          mxPatterns: ['*.google.com'],
          spfIncludes: ['_spf.google.com'],
          version: '1.0.0',
        },
      ];
      const app = createApp(state);

      // Request with a different domain - should NOT apply override
      const response = await app.request(
        '/api/shadow-comparison/provider-baselines/google-workspace?domainName=other.example.com'
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        baseline: { dkimSelectors: string[]; overridesApplied: string[] };
      };
      expect(json.baseline.overridesApplied).not.toContain('override-specific');
      expect(json.baseline.dkimSelectors).toContain('default-google');
    });

    it('should apply global override (empty appliesToDomains) to all domains', async () => {
      const state = emptyState();
      state.templateOverrides = [
        {
          id: 'override-global',
          providerKey: 'google-workspace',
          templateKey: 'dkim',
          overrideData: { dkimSelectors: ['global-custom'] },
          appliesToDomains: [], // Empty = global override
          tenantId: 'tenant-1',
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      state.providerBaselines = [
        {
          id: 'pb-1',
          providerKey: 'google-workspace',
          providerName: 'Google Workspace',
          baseline: {},
          dkimSelectors: ['default-google'],
          mxPatterns: ['*.google.com'],
          spfIncludes: ['_spf.google.com'],
          version: '1.0.0',
        },
      ];
      const app = createApp(state);

      // Request with any domain - should apply global override
      const response = await app.request(
        '/api/shadow-comparison/provider-baselines/google-workspace?domainName=any-domain.com'
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        baseline: { dkimSelectors: string[]; overridesApplied: string[] };
      };
      expect(json.baseline.overridesApplied).toContain('override-global');
      expect(json.baseline.dkimSelectors).toContain('global-custom');
    });

    it('should apply both global and domain-specific overrides when matching', async () => {
      const state = emptyState();
      state.templateOverrides = [
        {
          id: 'override-global',
          providerKey: 'google-workspace',
          templateKey: 'dkim',
          overrideData: { dkimSelectors: ['global-selector'] },
          appliesToDomains: [], // Global
          tenantId: 'tenant-1',
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'override-specific',
          providerKey: 'google-workspace',
          templateKey: 'dkim',
          overrideData: { dkimSelectors: ['specific-selector'] },
          appliesToDomains: ['priority.example.com'], // Domain-specific
          tenantId: 'tenant-1',
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      state.providerBaselines = [
        {
          id: 'pb-1',
          providerKey: 'google-workspace',
          providerName: 'Google Workspace',
          baseline: {},
          dkimSelectors: ['default-google'],
          mxPatterns: ['*.google.com'],
          spfIncludes: ['_spf.google.com'],
          version: '1.0.0',
        },
      ];
      const app = createApp(state);

      // Request with the specific domain - both overrides should be applied
      const response = await app.request(
        '/api/shadow-comparison/provider-baselines/google-workspace?domainName=priority.example.com'
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        baseline: { dkimSelectors: string[]; overridesApplied: string[] };
      };
      // Both overrides should be in the applied list
      expect(json.baseline.overridesApplied).toContain('override-global');
      expect(json.baseline.overridesApplied).toContain('override-specific');
      // Specific selector should be in the list (last applied wins for same field)
      expect(json.baseline.dkimSelectors).toContain('specific-selector');
    });
  });

  describe('GET /stats', () => {
    it('returns aggregate shadow stats', async () => {
      const state = emptyState();
      state.shadowComparisons = [
        {
          id: 'sc-1',
          domain: 'example.com',
          status: 'match',
          summary: 'All match',
          comparedAt: new Date(),
          adjudication: null,
        },
        {
          id: 'sc-2',
          domain: 'test.com',
          status: 'mismatch',
          summary: 'DMARC differs',
          comparedAt: new Date(),
          adjudication: null,
        },
      ];
      const app = createApp(state);

      const response = await app.request('/api/shadow-comparison/stats');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        durable: boolean;
        pendingAdjudication: number;
      };
      expect(json.durable).toBe(true);
      expect(json.pendingAdjudication).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /:id', () => {
    it('returns a specific comparison', async () => {
      const state = emptyState();
      state.shadowComparisons = [
        {
          id: 'sc-1',
          domain: 'example.com',
          status: 'match',
          summary: 'All match',
          comparedAt: new Date(),
        },
      ];
      const app = createApp(state);

      const response = await app.request('/api/shadow-comparison/sc-1');

      expect(response.status).toBe(200);
      const json = (await response.json()) as { comparison: { id: string } };
      expect(json.comparison.id).toBe('sc-1');
    });

    it('returns 404 for nonexistent comparison', async () => {
      const app = createApp(emptyState());

      const response = await app.request('/api/shadow-comparison/nonexistent');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /domain/:domain', () => {
    it('returns comparisons for a domain', async () => {
      const state = emptyState();
      // TB-1: ShadowComparisonRepository.findByDomain is strictly tenant-scoped
      // (c.tenantId === tenantId), so rows must carry the requesting tenant.
      state.shadowComparisons = [
        {
          id: 'sc-1',
          domain: 'example.com',
          status: 'match',
          summary: 'OK',
          comparedAt: new Date(),
          adjudication: null,
          tenantId: 'tenant-1',
        },
        {
          id: 'sc-2',
          domain: 'other.com',
          status: 'match',
          summary: 'OK',
          comparedAt: new Date(),
          adjudication: null,
          tenantId: 'tenant-1',
        },
      ];
      const app = createApp(state);

      const response = await app.request('/api/shadow-comparison/domain/example.com');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        domain: string;
        count: number;
        comparisons: Array<{ id: string }>;
      };
      expect(json.domain).toBe('example.com');
      expect(json.count).toBe(1);
      expect(json.comparisons[0]?.id).toBe('sc-1');
    });

    it('returns empty for unknown domain', async () => {
      const app = createApp(emptyState());

      const response = await app.request('/api/shadow-comparison/domain/unknown.com');

      expect(response.status).toBe(200);
      const json = (await response.json()) as { count: number };
      expect(json.count).toBe(0);
    });
  });

  describe('GET /legacy-logs', () => {
    it('returns legacy access logs', async () => {
      const state = emptyState();
      state.legacyAccessLogs = [
        {
          id: 'log-1',
          toolType: 'dmarc-check',
          domain: 'example.com',
          requestedAt: new Date(),
          requestSource: 'api',
          responseStatus: 'success',
          outputSummary: {},
          tenantId: 'tenant-1',
        },
      ];
      const app = createApp(state);

      const response = await app.request('/api/shadow-comparison/legacy-logs');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        logs: Array<{ id: string }>;
      };
      expect(json.logs).toHaveLength(1);
    });
  });

  describe('GET /provider-baselines', () => {
    it('returns active baselines with overrides', async () => {
      const state = emptyState();
      state.providerBaselines = [
        {
          id: 'pb-1',
          providerKey: 'google-workspace',
          providerName: 'Google Workspace',
          status: 'active',
          baseline: {},
          dkimSelectors: ['google'],
          mxPatterns: ['*.google.com'],
          spfIncludes: ['_spf.google.com'],
          version: '1.0.0',
        },
      ];
      const app = createApp(state);

      const response = await app.request('/api/shadow-comparison/provider-baselines');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        baselines: Array<{ providerKey: string; overridesApplied: string[] }>;
        overridesActive: boolean;
      };
      expect(json.baselines).toHaveLength(1);
      expect(json.baselines[0]?.providerKey).toBe('google-workspace');
      expect(json.overridesActive).toBe(false);
    });
  });

  describe('GET /provider-baselines/:providerKey', () => {
    it('returns a specific baseline', async () => {
      const state = emptyState();
      state.providerBaselines = [
        {
          id: 'pb-1',
          providerKey: 'google-workspace',
          providerName: 'Google Workspace',
          baseline: {},
          dkimSelectors: ['google'],
          mxPatterns: [],
          spfIncludes: [],
          version: '1.0.0',
        },
      ];
      const app = createApp(state);

      const response = await app.request(
        '/api/shadow-comparison/provider-baselines/google-workspace'
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        baseline: { providerKey: string };
      };
      expect(json.baseline.providerKey).toBe('google-workspace');
    });

    it('returns 404 for unknown provider', async () => {
      const app = createApp(emptyState());

      const response = await app.request(
        '/api/shadow-comparison/provider-baselines/unknown-provider'
      );

      expect(response.status).toBe(404);
    });
  });

  describe('GET /mismatch-reports/:domain', () => {
    it('returns mismatch reports for a domain', async () => {
      const state = emptyState();
      state.mismatchReports = [
        {
          id: 'mr-1',
          domain: 'example.com',
          tenantId: 'tenant-1',
          periodStart: new Date(),
          periodEnd: new Date(),
          matchRate: 0.95,
          cutoverReady: true,
          totalComparisons: 100,
          mismatchBreakdown: {},
          cutoverNotes: 'Ready',
          generatedAt: new Date(),
        },
      ];
      const app = createApp(state);

      const response = await app.request('/api/shadow-comparison/mismatch-reports/example.com');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        domain: string;
        reports: Array<{ cutoverReady: boolean }>;
        latestReport: { matchRate: number } | null;
      };
      expect(json.domain).toBe('example.com');
      expect(json.reports).toHaveLength(1);
      expect(json.latestReport?.matchRate).toBe(0.95);
    });

    it('returns null latestReport when no reports exist', async () => {
      const app = createApp(emptyState());

      const response = await app.request('/api/shadow-comparison/mismatch-reports/unknown.com');

      expect(response.status).toBe(200);
      const json = (await response.json()) as { latestReport: null };
      expect(json.latestReport).toBeNull();
    });
  });

  describe('POST /compare', () => {
    it('returns 400 when missing required fields', async () => {
      const app = createApp(emptyState());

      const response = await app.request('/api/shadow-comparison/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('returns 404 when snapshot not found', async () => {
      const app = createApp(emptyState());

      const response = await app.request('/api/shadow-comparison/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotId: 'nonexistent',
          legacyOutput: {
            domain: 'example.com',
            dmarc: { present: true, valid: true },
            spf: { present: true, valid: true },
            dkim: { present: true, valid: true },
          },
        }),
      });

      expect(response.status).toBe(404);
    });

    it('returns 400 for invalid legacy output', async () => {
      const state = emptyState();
      state.snapshots = [
        {
          id: 'snap-1',
          domainId: 'domain-1',
          domainName: 'example.com',
          resultState: 'complete',
          createdAt: new Date(),
        },
      ];
      const app = createApp(state);

      const response = await app.request('/api/shadow-comparison/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotId: 'snap-1',
          legacyOutput: { domain: 'example.com' }, // missing dmarc/spf/dkim
        }),
      });

      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string; details: string[] };
      expect(json.details).toBeDefined();
      expect(json.details.length).toBeGreaterThan(0);
    });
  });
});
