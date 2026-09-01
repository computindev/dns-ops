import { describe, expect, it, vi } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { recordSets } from '../schema/index.js';
import { RecordSetRepository } from './recordset.js';

function parameterValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const record = value as {
      queryChunks?: unknown[];
      constructor?: { name?: string };
      value?: unknown;
    };
    if (record.constructor?.name === 'Param') {
      values.push(record.value);
      return;
    }
    for (const chunk of record.queryChunks ?? []) visit(chunk);
  };
  visit(condition);
  return values;
}

describe('RecordSetRepository.findByNameAndType', () => {
  it('uses one constrained query with normalized snapshot, name, and type', async () => {
    const selectOne = vi.fn().mockResolvedValue(null);
    const select = vi.fn();
    const db = { selectOne, select } as unknown as IDatabaseAdapter;

    await new RecordSetRepository(db).findByNameAndType(
      'snapshot-1',
      '  _MTA-STS.Example.COM. ',
      ' txt '
    );

    expect(select).not.toHaveBeenCalled();
    expect(selectOne).toHaveBeenCalledTimes(1);
    expect(selectOne.mock.calls[0]?.[0]).toBe(recordSets);
    expect(parameterValues(selectOne.mock.calls[0]?.[1])).toEqual([
      'snapshot-1',
      '_mta-sts.example.com',
      'TXT',
    ]);
  });
});
