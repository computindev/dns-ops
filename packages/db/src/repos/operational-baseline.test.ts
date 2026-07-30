import { describe, expect, it } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { auditEvents, domains, operationalConditionBaselines, snapshots } from '../schema/index.js';
import { OperationalBaselineRepository } from './operational-baseline.js';

function params(condition: unknown): unknown[] {
  if (!condition || typeof condition !== 'object') return [];
  const candidate = condition as {
    constructor?: { name?: string };
    value?: unknown;
    queryChunks?: unknown[];
  };
  if (candidate.constructor?.name === 'Param') return [candidate.value];
  return (candidate.queryChunks ?? []).flatMap(params);
}

function createDb(failAuditAt?: number, snapshotState: 'complete' | 'partial' = 'complete') {
  const baselines: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const db = {
    async selectOne(table: unknown, condition: unknown) {
      const values = params(condition);
      if (table === domains)
        return values.includes('domain-1') ? { id: 'domain-1', tenantId: 'tenant-1' } : undefined;
      if (table === snapshots)
        return values.includes('snapshot-1')
          ? { id: 'snapshot-1', domainId: 'domain-1', resultState: snapshotState }
          : undefined;
      return undefined;
    },
    async selectWhere(table: unknown, condition: unknown) {
      if (table !== operationalConditionBaselines) return [];
      const values = params(condition);
      return baselines.filter(
        (baseline) =>
          values.includes(baseline.tenantId) &&
          values.includes(baseline.domainId) &&
          values.includes(baseline.kind) &&
          values.includes(baseline.discriminator) &&
          !baseline.supersededAt
      );
    },
    async insert(table: unknown, values: Record<string, unknown>) {
      if (table === operationalConditionBaselines) {
        const row = {
          id: `baseline-${baselines.length + 1}`,
          acceptedAt: new Date(),
          supersededAt: null,
          supersededBy: null,
          ...values,
        };
        baselines.push(row);
        return row;
      }
      if (table === auditEvents) {
        if (failAuditAt !== undefined && audits.length + 1 === failAuditAt) {
          throw new Error('audit unavailable');
        }
        const row = { id: `audit-${audits.length + 1}`, ...values };
        audits.push(row);
        return row;
      }
      throw new Error('Unexpected table');
    },
    async updateOne(table: unknown, values: Record<string, unknown>, condition: unknown) {
      if (table !== operationalConditionBaselines) return undefined;
      const id = params(condition).find(
        (value) => typeof value === 'string' && value.startsWith('baseline-')
      );
      const row = baselines.find((baseline) => baseline.id === id);
      if (!row) return undefined;
      Object.assign(row, values);
      return row;
    },
    async transaction<T>(callback: (tx: IDatabaseAdapter) => Promise<T>) {
      const baselineSnapshot = structuredClone(baselines);
      const auditSnapshot = structuredClone(audits);
      try {
        return await callback(db as unknown as IDatabaseAdapter);
      } catch (error) {
        baselines.splice(0, baselines.length, ...baselineSnapshot);
        audits.splice(0, audits.length, ...auditSnapshot);
        throw error;
      }
    },
  };
  return { db: db as unknown as IDatabaseAdapter, baselines, audits };
}

const input = {
  tenantId: 'tenant-1',
  domainId: 'domain-1',
  kind: 'TLS_CERTIFICATE_REGRESSION' as const,
  discriminator: 'Example.COM:443',
  sourceSnapshotId: 'snapshot-1',
  policy: {
    kind: 'TLS_CERTIFICATE' as const,
    requireHostnameAuthorized: true,
    requireChainAuthorized: true,
    minimumRemainingValiditySeconds: 86400,
  },
  maxEvidenceAgeSeconds: 3600,
  actorId: 'operator-1',
};

describe('OperationalBaselineRepository', () => {
  it('accepts immutable baseline and atomically supersedes the prior active baseline', async () => {
    const { db, baselines, audits } = createDb();
    const repository = new OperationalBaselineRepository(db);
    await repository.accept(input);
    const active = await repository.accept({ ...input, sourceSnapshotId: 'snapshot-1' });
    expect(baselines).toHaveLength(2);
    expect(baselines[0]).toMatchObject({ supersededBy: 'operator-1' });
    expect(active).toMatchObject({ discriminator: 'example.com:443' });
    expect(audits).toHaveLength(2);
  });

  it('rolls back supersession and insert when its audit event cannot be stored', async () => {
    const { db, baselines, audits } = createDb(2);
    const repository = new OperationalBaselineRepository(db);
    await repository.accept(input);
    await expect(repository.accept(input)).rejects.toThrow('audit unavailable');
    expect(baselines).toHaveLength(1);
    expect(baselines[0]).toMatchObject({ supersededAt: null, supersededBy: null });
    expect(audits).toHaveLength(1);
  });

  it('rejects a source snapshot outside the tenant domain', async () => {
    const { db } = createDb();
    await expect(
      new OperationalBaselineRepository(db).accept({ ...input, tenantId: 'other-tenant' })
    ).rejects.toThrow('outside the tenant domain');
  });

  it('rejects incomplete source snapshots before persistence', async () => {
    const { db, baselines, audits } = createDb(undefined, 'partial');
    await expect(new OperationalBaselineRepository(db).accept(input)).rejects.toThrow(
      'source snapshot must be complete'
    );
    expect(baselines).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('rejects an unsupported signal kind before persistence', async () => {
    const { db } = createDb();
    await expect(
      new OperationalBaselineRepository(db).accept({
        ...input,
        kind: 'HTTP_ENDPOINT_UNAVAILABLE',
      } as never)
    ).rejects.toThrow('Invalid SPF baseline policy');
  });
});
