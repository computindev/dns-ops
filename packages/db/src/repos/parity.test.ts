/**
 * Parity Repository — tenant-isolation unit tests
 *
 * Boundary-pair coverage for LegacyAccessLogRepository.findByDomain(domain, tenantId):
 * the /shadow-stats leak fix requires that a tenant caller NEVER receives
 * another tenant's rows or NULL-tenant (system) rows.
 *
 * TB-1 (AuthZ hardening).
 */

import type { IDatabaseAdapter } from '../database/index.js';
import { describe, expect, it, vi } from 'vitest';
import { LegacyAccessLogRepository } from './parity.js';

const TENANT_A = 'tenant-aaaa-0001';
const TENANT_B = 'tenant-bbbb-0002';

/**
 * Extract the bound value of a single `eq(column, value)` condition produced by
 * drizzle-orm. The mock DB routes selectWhere calls by matching on this value.
 */
function getConditionParam(condition: unknown): unknown {
  const sql = condition as {
    queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
  };
  return sql.queryChunks?.find((chunk) => chunk?.constructor?.name === 'Param')?.value;
}

function createMockDb(rows: Array<Record<string, unknown>>): IDatabaseAdapter {
  return {
    selectWhere: vi.fn(async (_table: unknown, condition: unknown) => {
      const param = getConditionParam(condition);
      // findByDomain queries by domain equality; return every row for that
      // domain across tenants + system. The repository must narrow by tenant.
      return rows.filter((r) => r.domain === param);
    }),
  } as unknown as IDatabaseAdapter;
}

function seededRows() {
  const now = new Date();
  const base = {
    domain: 'shared.com',
    toolType: 'dmarc-check',
    requestedAt: now,
    requestSource: 'api',
    responseStatus: 'success',
    outputSummary: {},
  };
  return [
    { ...base, id: 'log-a', tenantId: TENANT_A },
    { ...base, id: 'log-b', tenantId: TENANT_B },
    // NULL tenantId = system-generated; must never reach a tenant caller.
    { ...base, id: 'log-sys', tenantId: undefined },
  ];
}

describe('LegacyAccessLogRepository.findByDomain — tenant isolation', () => {
  it('returns the caller tenant row (positive boundary side)', async () => {
    const repo = new LegacyAccessLogRepository(createMockDb(seededRows()));
    const result = await repo.findByDomain('shared.com', TENANT_A);
    const ids = result.map((r) => r.id);

    // Live success precondition: the caller's own row IS returned.
    expect(ids).toContain('log-a');
    expect(ids).toHaveLength(1);
  });

  it('excludes other-tenant and NULL-tenant (system) rows (negative boundary side)', async () => {
    const repo = new LegacyAccessLogRepository(createMockDb(seededRows()));
    const result = await repo.findByDomain('shared.com', TENANT_A);
    const ids = result.map((r) => r.id);

    // Precondition first: caller's own row present (proves the query ran + succeeded).
    expect(ids).toContain('log-a');
    // Then the negative assertions are meaningful.
    expect(ids).not.toContain('log-b'); // other tenant
    expect(ids).not.toContain('log-sys'); // NULL / system
  });

  it('returns the other tenant row when called as that tenant (complement)', async () => {
    const repo = new LegacyAccessLogRepository(createMockDb(seededRows()));
    const result = await repo.findByDomain('shared.com', TENANT_B);
    const ids = result.map((r) => r.id);

    expect(ids).toEqual(['log-b']);
    expect(ids).not.toContain('log-a');
    expect(ids).not.toContain('log-sys');
  });
});
