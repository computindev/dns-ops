import { describe, expect, it, vi } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { OperationalConditionService } from './operations.js';

function tableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const value = (table as Record<symbol, unknown>)[Symbol.for('drizzle:Name')];
  return typeof value === 'string' ? value : '';
}

function conditionParam(condition: unknown): unknown {
  if (!condition || typeof condition !== 'object') return undefined;
  const candidate = condition as {
    constructor?: { name?: string };
    value?: unknown;
    queryChunks?: unknown[];
  };
  if (candidate.constructor?.name === 'Param') return candidate.value;
  for (const chunk of candidate.queryChunks ?? []) {
    const value = conditionParam(chunk);
    if (value !== undefined) return value;
  }
  return undefined;
}

function createDb() {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    internal_signals: [],
    internal_cases: [],
    internal_case_events: [],
    alerts: [],
    monitored_domains: [{ id: 'monitored-1', tenantId: 'tenant-1', domainId: 'domain-1' }],
    domains: [{ id: 'domain-1', tenantId: 'tenant-1', name: 'example.com' }],
    snapshots: [
      {
        id: 'snapshot-1',
        domainId: 'domain-1',
        resultState: 'complete',
        metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'snapshot-2',
        domainId: 'domain-1',
        resultState: 'complete',
        metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        createdAt: new Date('2099-01-01T00:00:00Z'),
      },
      {
        id: 'snapshot-3',
        domainId: 'domain-1',
        resultState: 'complete',
        metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        createdAt: new Date('2099-01-02T00:00:00Z'),
      },
    ],
  };
  let nextId = 1;

  const db = {
    select: vi.fn(async (table: unknown) => [...(rows[tableName(table)] ?? [])]),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const name = tableName(table);
      const param = conditionParam(condition);
      const key =
        name === 'internal_signals'
          ? 'conditionKey'
          : name === 'internal_cases' || name === 'alerts'
            ? 'signalId'
            : 'id';
      return (rows[name] ?? []).filter(
        (row) => row[key] === param || (name === 'internal_cases' && row.id === param)
      );
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const name = tableName(table);
      const param = conditionParam(condition);
      return (rows[name] ?? []).find((row) => row.id === param);
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      const name = tableName(table);
      const now = new Date();
      const row = {
        id: `${name}-${nextId++}`,
        createdAt: now,
        updatedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        ...(name === 'internal_cases' ? { version: 1 } : {}),
        ...values,
      };
      rows[name] ??= [];
      rows[name].push(row);
      return row;
    }),
    updateOne: vi.fn(
      async (table: unknown, values: Record<string, unknown>, condition: unknown) => {
        const name = tableName(table);
        const param = conditionParam(condition);
        const row = (rows[name] ?? []).find((candidate) => candidate.id === param);
        if (!row) return undefined;
        Object.assign(row, values);
        return row;
      }
    ),
    insertMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(async (callback: (adapter: IDatabaseAdapter) => Promise<unknown>) =>
      callback(db as unknown as IDatabaseAdapter)
    ),
    getDrizzle: vi.fn(),
  } as unknown as IDatabaseAdapter;

  return { db, rows };
}

const observation = {
  tenantId: 'tenant-1',
  domainId: 'domain-1',
  snapshotId: 'snapshot-1',
  kind: 'MAIL_DNS_CONFIGURATION_REGRESSION' as const,
  monitoredDomainId: 'monitored-1',
  title: 'Mail DNS regression',
  description: 'Seeded test condition',
  severity: 'high' as const,
};

describe('OperationalConditionService', () => {
  it('deduplicates repeated observations to one signal, case, and alert', async () => {
    const { db, rows } = createDb();
    const service = new OperationalConditionService(db);

    const first = await service.observe(observation);
    const duplicate = await service.observe(observation);

    expect(first.created).toEqual({ signal: true, case: true, alert: true });
    expect(duplicate.created).toEqual({ signal: false, case: false, alert: false });
    expect(rows.internal_signals).toHaveLength(1);
    expect(rows.internal_cases).toHaveLength(1);
    expect(rows.alerts).toHaveLength(1);
    expect(rows.internal_case_events).toHaveLength(1);
  });

  it('opens only an existing active canonical signal case', async () => {
    const { db } = createDb();
    const service = new OperationalConditionService(db);
    const observed = await service.observe({ ...observation, discriminator: 'spf' });
    await expect(
      service.openCanonicalCase('tenant-1', 'domain-1', observed.signal.conditionKey)
    ).resolves.toMatchObject({
      case: { id: observed.case.id },
      signal: { id: observed.signal.id },
    });
    await expect(
      service.openCanonicalCase(
        'tenant-1',
        'domain-1',
        'tenant-1:domain-1:MAIL_DNS_CONFIGURATION_REGRESSION:absent'
      )
    ).resolves.toBeNull();
    await expect(
      service.openCanonicalCase('other-tenant', 'domain-1', observed.signal.conditionKey)
    ).resolves.toBeNull();
  });

  it('sets an attributed disposition with numeric optimistic concurrency', async () => {
    const { db, rows } = createDb();
    const service = new OperationalConditionService(db);
    const first = await service.observe(observation);
    const updated = await service.setCaseDisposition({
      tenantId: 'tenant-1',
      caseId: first.case.id,
      expectedVersion: first.case.version,
      disposition: 'Investigating with owner',
      actorId: 'operator-1',
    });
    expect(updated).toMatchObject({ disposition: 'Investigating with owner', version: 2 });
    await expect(
      service.setCaseDisposition({
        tenantId: 'tenant-1',
        caseId: first.case.id,
        expectedVersion: 1,
        disposition: 'Stale write',
        actorId: 'operator-2',
      })
    ).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    expect(rows.internal_case_events).toHaveLength(2);
    expect(rows.audit_events).toMatchObject([
      { action: 'mcp_case_disposition_set', actorId: 'operator-1', tenantId: 'tenant-1' },
    ]);
  });

  it('resolves from fresh evidence and reopens the same operational objects', async () => {
    const { db, rows } = createDb();
    const service = new OperationalConditionService(db);
    const first = await service.observe(observation);

    const resolved = await service.resolveCase(
      first.case.id,
      'tenant-1',
      'snapshot-2',
      [],
      'Fresh scan cleared condition'
    );
    expect(resolved?.status).toBe('RESOLVED');
    if (!resolved) throw new Error('Expected case resolution fixture');
    // Model a newer scan captured before the resolution transaction committed.
    resolved.updatedAt = new Date('2100-01-01T00:00:00Z');

    await expect(service.observe({ ...observation, snapshotId: 'snapshot-2' })).rejects.toThrow(
      'newer than its resolution lifecycle'
    );

    const reopened = await service.observe({ ...observation, snapshotId: 'snapshot-3' });
    expect(reopened.reopened).toEqual({ signal: true, case: true, alert: true });
    expect(reopened.signal.id).toBe(first.signal.id);
    expect(reopened.case.id).toBe(first.case.id);
    expect(reopened.alert.id).toBe(first.alert.id);
    expect(rows.internal_signals).toHaveLength(1);
    expect(rows.internal_cases).toHaveLength(1);
    expect(rows.alerts).toHaveLength(1);
    expect(rows.internal_case_events).toHaveLength(3);
  });

  it('rejects cross-tenant observation ownership', async () => {
    const { db } = createDb();
    await expect(
      new OperationalConditionService(db).observe({ ...observation, tenantId: 'other-tenant' })
    ).rejects.toThrow('outside the tenant');
  });

  it('rejects cross-tenant, stale, and condition-present resolution evidence', async () => {
    const { db } = createDb();
    const service = new OperationalConditionService(db);
    const first = await service.observe(observation);

    await expect(service.resolveCase(first.case.id, 'tenant-1', 'snapshot-1', [])).rejects.toThrow(
      'Fresh complete evidence'
    );
    await expect(
      service.resolveCase(first.case.id, 'other-tenant', 'snapshot-2', [])
    ).resolves.toBeNull();
    await expect(
      service.resolveCase(first.case.id, 'tenant-1', 'snapshot-2', [first.signal.conditionKey])
    ).rejects.toThrow('still reproduces');
  });
});
