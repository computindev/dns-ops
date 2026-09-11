import { describe, expect, it, vi } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { MonitoredDomainRepository } from './portfolio.js';

function conditionValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as {
      constructor?: { name?: string };
      value?: unknown;
      queryChunks?: unknown[];
    };
    if (candidate.constructor?.name === 'Param' && candidate.value !== undefined) {
      values.push(candidate.value);
    }
    for (const chunk of candidate.queryChunks ?? []) walk(chunk);
  };
  walk(condition);
  return values;
}

describe('MonitoredDomainRepository tenant predicates', () => {
  it('includes tenantId in findByDomainId and delete SQL', async () => {
    const rows = [
      { id: 'mon-a', domainId: 'dom-1', tenantId: 'tenant-a' },
      { id: 'mon-b', domainId: 'dom-1', tenantId: 'tenant-b' },
    ];
    const deleted: unknown[][] = [];
    const selectWhere = vi.fn(async (_table: unknown, condition: unknown) => {
      const params = conditionValues(condition);
      return rows.filter((row) => params.includes(row.domainId) && params.includes(row.tenantId));
    });
    const deleteOne = vi.fn(async (_table: unknown, condition: unknown) => {
      const params = conditionValues(condition);
      deleted.push(params);
      const index = rows.findIndex(
        (row) => params.includes(row.id) && params.includes(row.tenantId)
      );
      if (index === -1) return undefined;
      const [removed] = rows.splice(index, 1);
      return removed;
    });
    const db = { selectWhere, deleteOne } as unknown as IDatabaseAdapter;
    const repo = new MonitoredDomainRepository(db);

    await expect(repo.findByDomainId('dom-1', 'tenant-a')).resolves.toMatchObject({
      id: 'mon-a',
      tenantId: 'tenant-a',
    });
    expect(conditionValues(selectWhere.mock.calls[0]?.[1])).toEqual(
      expect.arrayContaining(['dom-1', 'tenant-a'])
    );

    await repo.delete('mon-b', 'tenant-a');
    expect(deleted[0]).toEqual(expect.arrayContaining(['mon-b', 'tenant-a']));
    expect(rows.some((row) => row.id === 'mon-b')).toBe(true);

    await repo.delete('mon-b', 'tenant-b');
    expect(rows.some((row) => row.id === 'mon-b')).toBe(false);
  });

  it('includes tenantId in findActiveBySchedule and updateLastCheck SQL', async () => {
    const rows = [
      {
        id: 'mon-a',
        domainId: 'dom-1',
        tenantId: 'tenant-a',
        schedule: 'daily',
        isActive: true,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 'mon-b',
        domainId: 'dom-2',
        tenantId: 'tenant-b',
        schedule: 'daily',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const selectWhere = vi.fn(async (_table: unknown, condition: unknown) => {
      const params = conditionValues(condition);
      return rows.filter(
        (row) =>
          params.includes(row.schedule) && params.includes(true) && params.includes(row.tenantId)
      );
    });
    const updateOne = vi.fn(async (_table: unknown, _values: unknown, condition: unknown) => {
      const params = conditionValues(condition);
      return rows.find(
        (row) =>
          params.includes(row.id) &&
          params.includes(row.tenantId) &&
          params.includes(true) &&
          row.isActive
      );
    });
    const db = { selectWhere, updateOne } as unknown as IDatabaseAdapter;
    const repo = new MonitoredDomainRepository(db);

    await expect(repo.findActiveBySchedule('daily', 'tenant-a')).resolves.toMatchObject([
      { id: 'mon-a', tenantId: 'tenant-a' },
    ]);
    expect(conditionValues(selectWhere.mock.calls[0]?.[1])).toEqual(
      expect.arrayContaining(['daily', true, 'tenant-a'])
    );

    await expect(repo.updateLastCheck('mon-a', 'tenant-a')).resolves.toBe(true);
    expect(conditionValues(updateOne.mock.calls[0]?.[2])).toEqual(
      expect.arrayContaining(['mon-a', 'tenant-a', true])
    );
    await expect(repo.updateLastCheck('mon-b', 'tenant-a')).resolves.toBe(false);
    expect(conditionValues(updateOne.mock.calls[1]?.[2])).toEqual(
      expect.arrayContaining(['mon-b', 'tenant-a', true])
    );
  });

  it('refuses updateLastCheck when the monitor is inactive', async () => {
    const updateOne = vi.fn(async (_table: unknown, _values: unknown, condition: unknown) => {
      const params = conditionValues(condition);
      if (!params.includes(true)) return undefined;
      return undefined;
    });
    const db = { updateOne } as unknown as IDatabaseAdapter;
    const repo = new MonitoredDomainRepository(db);
    await expect(repo.updateLastCheck('mon-inactive', 'tenant-a')).resolves.toBe(false);
    expect(conditionValues(updateOne.mock.calls[0]?.[2])).toEqual(
      expect.arrayContaining(['mon-inactive', 'tenant-a', true])
    );
  });
});
