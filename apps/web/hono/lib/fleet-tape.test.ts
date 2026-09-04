/**
 * 24h fleet tape digest tests - issue #57
 *
 * Focused behavior checks for the shared digest behind the MCP `fleet_tape`
 * tool and the portfolio UI route:
 * - only the tenant's domains are walked (tenant isolation at the source)
 * - only snapshots captured inside the 24h window produce entries
 * - the diff counts come from comparing against the immediately older snapshot
 * - a domain whose newest capture is its first snapshot is flagged as such
 */
import type { IDatabaseAdapter } from '@dns-ops/db';
import { describe, expect, it } from 'vitest';
import { buildFleetTape, FLEET_TAPE_WINDOW_HOURS } from './fleet-tape.js';

const NOW = new Date('2026-09-03T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

type Row = Record<string, unknown>;

interface Fixture {
  domainRows: Row[];
  snapshotRows: Row[];
  recordRows: Row[];
  findingRows: Row[];
}

function domainRow(id: string, tenantId: string, name = `${id}.example.test`): Row {
  return { id, tenantId, name, normalizedName: name, zoneManagement: 'unknown', metadata: null };
}

function snapshotRow(id: string, domainId: string, capturedAt: Date, extra: Row = {}): Row {
  return {
    id,
    domainId,
    domainName: domainId,
    resultState: 'complete',
    queriedNames: [domainId],
    queriedTypes: ['A'],
    vantages: [],
    rulesetVersionId: 'ruleset-1',
    triggeredBy: 'system',
    createdAt: capturedAt,
    ...extra,
  };
}

function recordRow(id: string, snapshotId: string, values: string[]): Row {
  return { id, snapshotId, name: 'example.test.', type: 'A', ttl: 300, values };
}

function findingRow(id: string, snapshotId: string, type = 'mail.no-dmarc-record'): Row {
  return {
    id,
    snapshotId,
    type,
    title: type,
    severity: 'high',
    confidence: 'certain',
    riskPosture: 'medium',
    blastRadius: 'single-domain',
    reviewOnly: false,
    evidence: [],
    ruleId: 'mail.dmarc.v1',
    ruleVersion: '1',
  };
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  return typeof record[symbolName] === 'string' ? (record[symbolName] as string) : '';
}

function getConditionParam(condition: unknown): unknown {
  if (!condition || typeof condition !== 'object') return undefined;
  const sql = condition as {
    constructor?: { name?: string };
    value?: unknown;
    queryChunks?: unknown[];
  };
  if (sql.constructor?.name === 'Param') return sql.value;
  for (const chunk of sql.queryChunks ?? []) {
    const value = getConditionParam(chunk);
    if (value !== undefined) return value;
  }
  return undefined;
}

function createMockDb(fixture: Fixture): IDatabaseAdapter {
  return {
    select: async (table: unknown) => {
      if (getTableName(table) === 'domains') return [...fixture.domainRows];
      return [];
    },
    selectWhere: async (table: unknown, condition: unknown) => {
      const param = getConditionParam(condition);
      switch (getTableName(table)) {
        case 'snapshots':
          return fixture.snapshotRows.filter((row) => row.domainId === param);
        case 'record_sets':
          return fixture.recordRows.filter((row) => row.snapshotId === param);
        case 'findings':
          return fixture.findingRows.filter((row) => row.snapshotId === param);
        default:
          return [];
      }
    },
  } as unknown as IDatabaseAdapter;
}

describe('buildFleetTape (issue #57)', () => {
  it('digests a domain whose latest snapshot landed inside the window', async () => {
    const fixture: Fixture = {
      domainRows: [domainRow('d1', 'tenant-1')],
      snapshotRows: [
        snapshotRow('s-new', 'd1', new Date(NOW.getTime() - 2 * HOUR_MS)),
        snapshotRow('s-old', 'd1', new Date(NOW.getTime() - 30 * HOUR_MS)),
      ],
      recordRows: [
        recordRow('r1', 's-new', ['192.0.2.10']),
        recordRow('r2', 's-old', ['192.0.2.1']),
      ],
      findingRows: [findingRow('f1', 's-new')],
    };

    const tape = await buildFleetTape(createMockDb(fixture), 'tenant-1', NOW);

    expect(tape.windowHours).toBe(FLEET_TAPE_WINDOW_HOURS);
    expect(tape.totalDomains).toBe(1);
    expect(tape.changedDomains).toBe(1);
    expect(tape.entries).toHaveLength(1);
    const entry = tape.entries[0];
    expect(entry.domainId).toBe('d1');
    expect(entry.snapshotId).toBe('s-new');
    expect(entry.previousSnapshotId).toBe('s-old');
    expect(entry.firstSnapshot).toBe(false);
    // One modified record + one added finding.
    expect(entry.summary.modifications).toBe(1);
    expect(entry.findingsSummary.added).toBe(1);
    expect(tape.generatedAt).toBe(NOW.toISOString());
  });

  it('omits domains whose newest snapshot predates the window', async () => {
    const fixture: Fixture = {
      domainRows: [domainRow('d1', 'tenant-1')],
      snapshotRows: [snapshotRow('s-old', 'd1', new Date(NOW.getTime() - 25 * HOUR_MS))],
      recordRows: [],
      findingRows: [],
    };

    const tape = await buildFleetTape(createMockDb(fixture), 'tenant-1', NOW);

    expect(tape.totalDomains).toBe(1);
    expect(tape.changedDomains).toBe(0);
    expect(tape.entries).toEqual([]);
  });

  it("never walks another tenant's domains", async () => {
    const fixture: Fixture = {
      domainRows: [domainRow('d1', 'tenant-1'), domainRow('d2', 'tenant-2')],
      snapshotRows: [
        snapshotRow('s1', 'd1', new Date(NOW.getTime() - HOUR_MS)),
        snapshotRow('s2', 'd2', new Date(NOW.getTime() - HOUR_MS)),
      ],
      recordRows: [],
      findingRows: [],
    };

    const tape = await buildFleetTape(createMockDb(fixture), 'tenant-1', NOW);

    expect(tape.entries).toHaveLength(1);
    expect(tape.entries[0].domainId).toBe('d1');
  });

  it('flags a first snapshot and diffs it against an empty baseline', async () => {
    const fixture: Fixture = {
      domainRows: [domainRow('d1', 'tenant-1')],
      snapshotRows: [snapshotRow('s-first', 'd1', new Date(NOW.getTime() - HOUR_MS))],
      recordRows: [recordRow('r1', 's-first', ['192.0.2.7'])],
      findingRows: [],
    };

    const tape = await buildFleetTape(createMockDb(fixture), 'tenant-1', NOW);

    expect(tape.entries[0].firstSnapshot).toBe(true);
    expect(tape.entries[0].previousSnapshotId).toBeNull();
    expect(tape.entries[0].summary.additions).toBe(1);
  });

  it('sorts entries newest-first across domains', async () => {
    const fixture: Fixture = {
      domainRows: [domainRow('d1', 'tenant-1'), domainRow('d2', 'tenant-1')],
      snapshotRows: [
        snapshotRow('s1', 'd1', new Date(NOW.getTime() - 5 * HOUR_MS)),
        snapshotRow('s2', 'd2', new Date(NOW.getTime() - HOUR_MS)),
      ],
      recordRows: [],
      findingRows: [],
    };

    const tape = await buildFleetTape(createMockDb(fixture), 'tenant-1', NOW);

    expect(tape.entries.map((entry) => entry.snapshotId)).toEqual(['s2', 's1']);
  });
});
