import type { IDatabaseAdapter } from '@dns-ops/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPersistedMtaStsEvidence } from './persisted-dns-authorization.js';

interface Row extends Record<string, unknown> {}

function tableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') return record[symbolName] as string;
  const symbol = Object.getOwnPropertySymbols(record).find(
    (candidate) => String(candidate) === 'Symbol(drizzle:Name)'
  );
  return symbol && typeof record[symbol] === 'string' ? (record[symbol] as string) : '';
}

function conditionValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const record = value as {
      constructor?: { name?: string };
      queryChunks?: unknown[];
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

function createDb(state: Record<string, Row[]>): IDatabaseAdapter {
  const rows = (table: unknown): Row[] => state[tableName(table)] ?? [];
  const matches = (row: Row, condition: unknown): boolean =>
    conditionValues(condition).every((value) =>
      Object.values(row).some((field) => field === value)
    );

  return {
    type: 'postgres',
    getDrizzle: () => undefined,
    select: async (table: unknown) => [...rows(table)],
    selectWhere: async (table: unknown, condition: unknown) =>
      rows(table).filter((row) => matches(row, condition)),
    selectOne: async (table: unknown, condition: unknown) =>
      rows(table).find((row) => matches(row, condition)),
    insert: async () => ({}),
    insertMany: async () => [],
    update: async () => [],
    updateOne: async () => undefined,
    delete: async () => [],
    deleteOne: async () => undefined,
    transaction: async () => undefined,
  } as unknown as IDatabaseAdapter;
}

const NOW = new Date('2026-09-01T00:00:00.000Z');
const DOMAIN = '_mta-sts.example.com';
const TXT = 'v=STSv1; id=20260901';

function recordSet(
  id: string,
  name: string,
  type: string,
  values: string[],
  sourceObservationIds: string[]
): Row {
  return {
    id,
    snapshotId: 'snapshot-1',
    name,
    type,
    ttl: 300,
    values,
    sourceObservationIds,
    sourceVantages: ['1.1.1.1'],
    isConsistent: true,
    createdAt: NOW,
  };
}

function observation(
  id: string,
  queryName: string,
  queryType: string,
  answerSection: Row[],
  queriedAt = new Date(NOW.getTime() - 1_000)
): Row {
  return {
    id,
    snapshotId: 'snapshot-1',
    queryName,
    queryType,
    vantageType: 'public-recursive',
    vantageIdentifier: '1.1.1.1',
    status: 'success',
    queriedAt,
    responseTimeMs: 1,
    responseCode: 0,
    flags: null,
    answerSection,
  };
}

function cnameAnswer(name: string, target: string): Row {
  return { name, type: 'CNAME', ttl: 300, data: target };
}

function txtAnswer(name: string): Row {
  return { name, type: 'TXT', ttl: 300, data: TXT };
}

function state(
  overrides: { cname?: Row[]; observations?: Row[]; recordSets?: Row[]; txtOwnerName?: string } = {}
) {
  const txtOwnerName = overrides.txtOwnerName ?? DOMAIN;
  return {
    domains: [
      {
        id: 'domain-1',
        name: 'example.com',
        normalizedName: 'example.com',
        tenantId: 'tenant-a',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    snapshots: [
      {
        id: 'snapshot-1',
        domainId: 'domain-1',
        resultState: 'complete',
        createdAt: NOW,
        observationCount: 3,
      },
    ],
    record_sets: overrides.recordSets ?? [
      recordSet('record-txt', txtOwnerName, 'TXT', [TXT], ['observation-txt']),
      ...(overrides.cname ?? []),
    ],
    observations: overrides.observations ?? [
      observation('observation-txt', txtOwnerName, 'TXT', [txtAnswer(txtOwnerName)]),
    ],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('loadPersistedMtaStsEvidence CNAME authorization', () => {
  it('accepts direct TXT evidence when the persisted CNAME lookup is terminal NODATA', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const terminalCname = recordSet('record-cname', DOMAIN, 'CNAME', [], ['observation-cname']);
    terminalCname.isConsistent = false;
    const result = await loadPersistedMtaStsEvidence(
      createDb(
        state({
          cname: [terminalCname],
          observations: [
            observation('observation-txt', DOMAIN, 'TXT', [txtAnswer(DOMAIN)]),
            observation('observation-cname', DOMAIN, 'CNAME', []),
          ],
        })
      ),
      { domain: 'example.com', tenantId: 'tenant-a' }
    );

    expect(result).toMatchObject({ ok: true, txtRecord: TXT, txtRecordId: '20260901' });
  });

  it('follows a persisted multi-hop CNAME chain to the canonical TXT owner', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const firstTarget = '_mta-sts.canonical.example.com';
    const finalTarget = 'mta-sts-policy.example.net';
    const db = createDb(
      state({
        cname: [
          recordSet('record-cname-1', DOMAIN, 'CNAME', [firstTarget], ['observation-cname-1']),
          recordSet('record-cname-2', firstTarget, 'CNAME', [finalTarget], ['observation-cname-2']),
        ],
        txtOwnerName: finalTarget,
        observations: [
          observation('observation-txt', finalTarget, 'TXT', [txtAnswer(finalTarget)]),
          observation('observation-cname-1', DOMAIN, 'CNAME', [cnameAnswer(DOMAIN, firstTarget)]),
          observation('observation-cname-2', firstTarget, 'CNAME', [
            cnameAnswer(firstTarget, finalTarget),
          ]),
        ],
      })
    );

    const result = await loadPersistedMtaStsEvidence(db, {
      domain: 'example.com',
      tenantId: 'tenant-a',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.txtRecord).toBe(TXT);
      expect(result.txtRecordId).toBe('20260901');
      expect(result.dnsResults[0]?.answers[0]?.name).toBe(finalTarget);
      expect(result.dnsResults).toHaveLength(3);
      expect(result.dnsResults[1]?.query).toEqual({ name: DOMAIN, type: 'CNAME' });
      expect(result.dnsResults[2]?.query).toEqual({ name: firstTarget, type: 'CNAME' });
      expect(result.expiresAt.getTime()).toBe(NOW.getTime() + 299_000);
    }
  });

  it('rejects a TXT answer from an unrelated canonical owner', async () => {
    const cnameTarget = '_mta-sts.canonical.example.com';
    const result = await loadPersistedMtaStsEvidence(
      createDb(
        state({
          cname: [recordSet('record-cname', DOMAIN, 'CNAME', [cnameTarget], ['observation-cname'])],
          txtOwnerName: cnameTarget,
          observations: [
            observation('observation-txt', cnameTarget, 'TXT', [
              txtAnswer('unrelated.example.net'),
            ]),
            observation('observation-cname', DOMAIN, 'CNAME', [cnameAnswer(DOMAIN, cnameTarget)]),
          ],
        })
      ),
      { domain: 'example.com', tenantId: 'tenant-a' }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing-answer');
  });

  it('rejects CNAME loops before accepting a TXT record', async () => {
    const target = '_mta-sts.loop.example.com';
    const result = await loadPersistedMtaStsEvidence(
      createDb(
        state({
          cname: [
            recordSet('record-cname-1', DOMAIN, 'CNAME', [target], ['observation-cname-1']),
            recordSet('record-cname-2', target, 'CNAME', [DOMAIN], ['observation-cname-2']),
          ],
          txtOwnerName: target,
          observations: [
            observation('observation-txt', target, 'TXT', [txtAnswer(target)]),
            observation('observation-cname-1', DOMAIN, 'CNAME', [cnameAnswer(DOMAIN, target)]),
            observation('observation-cname-2', target, 'CNAME', [cnameAnswer(target, DOMAIN)]),
          ],
        })
      ),
      { domain: 'example.com', tenantId: 'tenant-a' }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('cname-chain-loop');
  });

  it('rejects malformed persisted CNAME targets', async () => {
    const target = 'not a hostname';
    const result = await loadPersistedMtaStsEvidence(
      createDb(
        state({
          cname: [recordSet('record-cname', DOMAIN, 'CNAME', [target], ['observation-cname'])],
          observations: [
            observation('observation-txt', DOMAIN, 'TXT', [txtAnswer(DOMAIN)]),
            observation('observation-cname', DOMAIN, 'CNAME', [cnameAnswer(DOMAIN, target)]),
          ],
        })
      ),
      { domain: 'example.com', tenantId: 'tenant-a' }
    );

    expect(result).toMatchObject({ ok: false, reason: 'malformed-cname-target' });
  });

  it('includes CNAME TTL freshness in the persisted evidence expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const target = '_mta-sts.canonical.example.com';
    const stale = new Date(NOW.getTime() - 301_000);
    const result = await loadPersistedMtaStsEvidence(
      createDb(
        state({
          cname: [recordSet('record-cname', DOMAIN, 'CNAME', [target], ['observation-cname'])],
          txtOwnerName: target,
          observations: [
            observation('observation-txt', target, 'TXT', [txtAnswer(target)]),
            observation('observation-cname', DOMAIN, 'CNAME', [cnameAnswer(DOMAIN, target)], stale),
          ],
        })
      ),
      { domain: 'example.com', tenantId: 'tenant-a' }
    );

    expect(result).toMatchObject({ ok: false, reason: 'stale-evidence' });
  });
});
