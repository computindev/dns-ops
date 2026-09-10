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
});
