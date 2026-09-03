/**
 * Portfolio Expiry Radar Tests - Issue #60
 *
 * Focused route tests for the RDAP-derived expiration read model:
 * - Only latest-snapshot, successful OBSERVED RDAP_EXPIRATION evidence becomes a date.
 * - Missing, failed, conflicting, mismatched, or unparseable evidence is UNKNOWN.
 * - Exact inclusive 7/30/90 day boundaries with a fixed clock.
 * - Expiry filtering and sorting happen before pagination; `total` reflects all matches.
 * - Tenant isolation at the response level.
 *
 * The mock database deliberately ignores Drizzle predicates (a known limitation of
 * broad mocks) so these tests must assert on route output, not on predicate fidelity.
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { portfolioRoutes } from './portfolio.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

// Fixed "now" for boundary tests: 2026-09-01T00:00:00.000Z
const NOW = new Date('2026-09-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

type MockDomain = {
  id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  zoneManagement: 'managed' | 'unmanaged' | 'unknown';
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown> | null;
};

type MockSnapshot = {
  id: string;
  domainId: string;
  domainName: string;
  createdAt: Date;
  resultState: 'complete' | 'partial';
  rulesetVersionId: string | null;
  metadata?: Record<string, unknown> | null;
};

type MockProbeObservation = {
  id: string;
  snapshotId: string;
  probeType: 'rdap' | 'tls_cert' | 'http';
  status: 'success' | 'error';
  hostname: string;
  port: number | null;
  success: boolean;
  errorMessage: string | null;
  probedAt: Date;
  responseTimeMs: number | null;
  probeData: Record<string, unknown> | null;
};

interface Fixture {
  domains: MockDomain[];
  snapshots: MockSnapshot[];
  findings: Array<Record<string, unknown>>;
  probeObservations: MockProbeObservation[];
  savedFilters: Array<Record<string, unknown>>;
}

function domain(id: string, name: string, tenantId = TENANT_A): MockDomain {
  return {
    id,
    tenantId,
    name,
    normalizedName: name,
    zoneManagement: 'managed',
    createdAt: NOW,
    updatedAt: NOW,
    metadata: null,
  };
}

function snapshot(id: string, domainId: string, createdAt: Date): MockSnapshot {
  return {
    id,
    domainId,
    domainName: domainId,
    createdAt,
    resultState: 'complete',
    rulesetVersionId: 'ruleset-v1',
    metadata: { evaluation: { state: 'COMPLETE' } },
  };
}

function rdapObservation(
  id: string,
  snapshotId: string,
  domainName: string,
  opts: {
    probedAt?: Date;
    status?: 'OBSERVED' | 'UNKNOWN';
    check?: string;
    expirationDate?: string;
    evidenceDomain?: string;
    evidenceKind?: string;
    success?: boolean;
  } = {}
): MockProbeObservation {
  const status = opts.status ?? 'OBSERVED';
  const success = opts.success ?? status === 'OBSERVED';
  return {
    id,
    snapshotId,
    probeType: 'rdap',
    status: success ? 'success' : 'error',
    hostname: opts.evidenceDomain ?? domainName,
    port: 443,
    success,
    errorMessage: success ? null : 'probe failed',
    probedAt: opts.probedAt ?? NOW,
    responseTimeMs: null,
    probeData: {
      check: opts.check ?? 'RDAP_EXPIRATION',
      status,
      evidence: {
        kind: opts.evidenceKind ?? 'RDAP_EXPIRATION',
        domain: opts.evidenceDomain ?? domainName,
        sourceUrl: `https://rdap.example.test/domain/${domainName}`,
        responseStatus: 200,
        events: opts.expirationDate ? [{ action: 'expiration', date: opts.expirationDate }] : [],
        expirationDate: opts.expirationDate,
        notices: [],
      },
      unknown:
        status === 'UNKNOWN'
          ? {
              reason: 'PROBE_FAILED',
              explanation: 'x',
              action: 'RETRY_PROBE',
              actionLabel: 'Retry',
              blocking: true,
            }
          : undefined,
    },
  };
}

function createMockDb(fixture: Fixture): IDatabaseAdapter {
  const drizzleNameSymbol = Symbol.for('drizzle:Name');
  const tableNameOf = (table: unknown): string =>
    (table as Record<symbol, unknown>)[drizzleNameSymbol] as string;

  const drizzle = {
    query: {
      domains: {
        // Deliberately ignores the where predicate: the route must enforce
        // tenant ownership in memory (defense in depth asserted by these tests).
        findMany: vi.fn(async () => fixture.domains),
      },
      snapshots: {
        findMany: vi.fn(async () =>
          [...fixture.snapshots].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        ),
      },
      findings: {
        findMany: vi.fn(async () => fixture.findings),
      },
      probeObservations: {
        // Honor the route's newest-first ordering like real Drizzle would.
        findMany: vi.fn(async () =>
          [...fixture.probeObservations].sort(
            (a, b) => new Date(b.probedAt).getTime() - new Date(a.probedAt).getTime()
          )
        ),
      },
    },
  };

  return {
    getDrizzle: () => drizzle,
    select: vi.fn(async (table: unknown) => {
      if (tableNameOf(table) === 'saved_filters') return [...fixture.savedFilters];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown) => {
      if (tableNameOf(table) === 'saved_filters') return [...fixture.savedFilters];
      return [];
    }),
    selectOne: vi.fn(async (table: unknown) => {
      if (tableNameOf(table) === 'saved_filters') {
        return fixture.savedFilters[0];
      }
      return undefined;
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      if (tableNameOf(table) === 'saved_filters') {
        const record = {
          id: `filter-${fixture.savedFilters.length + 1}`,
          ...values,
          createdAt: NOW,
          updatedAt: NOW,
        };
        fixture.savedFilters.push(record);
        return record;
      }
      return values;
    }),
    updateOne: vi.fn(async () => undefined),
    deleteOne: vi.fn(async () => undefined),
    transaction: vi.fn(),
  } as unknown as IDatabaseAdapter;
}

function createApp(tenantId: string, fixture: Fixture): Hono<Env> {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(fixture) as Env['Variables']['db']);
    c.set('tenantId', tenantId);
    c.set('actorId', 'actor-a');
    c.set('actorEmail', 'actor-a@example.test');
    await next();
  });
  app.route('/api/portfolio', portfolioRoutes);
  return app;
}

async function search(app: Hono<Env>, body: Record<string, unknown> = {}) {
  const res = await app.request('/api/portfolio/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function names(body: Record<string, unknown>): string[] {
  return ((body.domains as Array<Record<string, unknown>>) || []).map((d) => d.name as string);
}

function expirationOf(body: Record<string, unknown>, name: string): Record<string, unknown> {
  const row = (body.domains as Array<Record<string, unknown>>).find((d) => d.name === name);
  return row?.expiration as Record<string, unknown>;
}

let fixture: Fixture;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fixture = { domains: [], snapshots: [], findings: [], probeObservations: [], savedFilters: [] };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('issue #60: RDAP expiration projection', () => {
  it('projects only successful OBSERVED RDAP_EXPIRATION evidence as a dated expiry', async () => {
    const expires = new Date(NOW.getTime() + 4 * DAY_MS).toISOString();
    fixture.domains.push(domain('d1', 'expiring.example.test'));
    fixture.snapshots.push(snapshot('s1', 'd1', NOW));
    fixture.probeObservations.push(
      rdapObservation('p1', 's1', 'expiring.example.test', {
        probedAt: new Date(NOW.getTime() - DAY_MS),
        expirationDate: expires,
      })
    );

    const app = createApp(TENANT_A, fixture);
    const { status, body } = await search(app);

    expect(status).toBe(200);
    expect(expirationOf(body, 'expiring.example.test')).toEqual({
      status: 'OBSERVED',
      expirationDate: expires,
      observedAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
      bucket: 'WITHIN_7',
    });
  });

  it('returns UNKNOWN for every missing or invalid evidence case', async () => {
    const futureDate = new Date(NOW.getTime() + 5 * DAY_MS).toISOString();

    fixture.domains.push(
      domain('d1', 'no-snapshot.example.test'),
      domain('d2', 'no-rdap-row.example.test'),
      domain('d3', 'unknown-with-date.example.test'),
      domain('d4', 'failed-probe.example.test'),
      domain('d5', 'domain-mismatch.example.test'),
      domain('d6', 'no-date.example.test'),
      domain('d7', 'unparseable-date.example.test'),
      domain('d8', 'wrong-kind.example.test'),
      domain('d9', 'wrong-check.example.test')
    );
    fixture.snapshots.push(
      snapshot('s2', 'd2', NOW),
      snapshot('s3', 'd3', NOW),
      snapshot('s4', 'd4', NOW),
      snapshot('s5', 'd5', NOW),
      snapshot('s6', 'd6', NOW),
      snapshot('s7', 'd7', NOW),
      snapshot('s8', 'd8', NOW),
      snapshot('s9', 'd9', NOW)
    );
    fixture.probeObservations.push(
      // UNKNOWN status that still carries an embedded expiration date
      rdapObservation('p3', 's3', 'unknown-with-date.example.test', {
        status: 'UNKNOWN',
        expirationDate: futureDate,
      }),
      // row marked failed
      rdapObservation('p4', 's4', 'failed-probe.example.test', {
        success: false,
        status: 'OBSERVED',
        expirationDate: futureDate,
      }),
      // evidence domain does not match the portfolio domain
      rdapObservation('p5', 's5', 'domain-mismatch.example.test', {
        expirationDate: futureDate,
        evidenceDomain: 'other.example.test',
      }),
      // no expiration date on the evidence
      rdapObservation('p6', 's6', 'no-date.example.test'),
      // date that does not parse
      rdapObservation('p7', 's7', 'unparseable-date.example.test', {
        expirationDate: 'not-a-date',
      }),
      // evidence of a different kind
      rdapObservation('p8', 's8', 'wrong-kind.example.test', {
        expirationDate: futureDate,
        evidenceKind: 'TLS_CERTIFICATE',
      }),
      // probeData check does not match RDAP expiration
      rdapObservation('p9', 's9', 'wrong-check.example.test', {
        expirationDate: futureDate,
        check: 'TLS_CERTIFICATE',
      })
    );

    const app = createApp(TENANT_A, fixture);
    const { status, body } = await search(app);

    expect(status).toBe(200);
    for (const name of names(body)) {
      expect(expirationOf(body, name)).toEqual({ status: 'UNKNOWN' });
    }
    expect(names(body)).toHaveLength(9);

    // UNKNOWN rows, including domains with no snapshot, do not match within filters.
    const filtered = await search(app, { expirationWithinDays: 90 });
    expect(names(filtered.body)).toEqual([]);
    expect(filtered.body.total).toBe(0);
  });

  it('rejects date-only values that violate the collector RFC3339 date-time contract', async () => {
    fixture.domains.push(
      domain('d1', 'date-only.example.test'),
      domain('d2', 'offset-datetime.example.test')
    );
    fixture.snapshots.push(snapshot('s1', 'd1', NOW), snapshot('s2', 'd2', NOW));
    fixture.probeObservations.push(
      // Parses via Date.parse but apps/collector/src/probes/rdap.ts rejects it.
      rdapObservation('p1', 's1', 'date-only.example.test', {
        expirationDate: '2026-12-15',
      }),
      // Numeric offsets are valid RFC3339 date-times and stay OBSERVED.
      rdapObservation('p2', 's2', 'offset-datetime.example.test', {
        expirationDate: '2026-09-05T12:00:00+02:00',
      })
    );

    const app = createApp(TENANT_A, fixture);
    const { body } = await search(app);

    expect(expirationOf(body, 'date-only.example.test')).toEqual({ status: 'UNKNOWN' });
    expect(expirationOf(body, 'offset-datetime.example.test')).toMatchObject({
      status: 'OBSERVED',
      bucket: 'WITHIN_7',
    });
  });

  it('uses only the latest snapshot and the newest RDAP row within it', async () => {
    const futureDate = new Date(NOW.getTime() + 5 * DAY_MS).toISOString();
    fixture.domains.push(
      domain('d1', 'stale-snapshot.example.test'),
      domain('d2', 'superseded-row.example.test')
    );

    // d1: older snapshot OBSERVED, latest snapshot UNKNOWN -> UNKNOWN
    fixture.snapshots.push(
      snapshot('s-old', 'd1', new Date(NOW.getTime() - 10 * DAY_MS)),
      snapshot('s-new', 'd1', new Date(NOW.getTime() - 1 * DAY_MS))
    );
    fixture.probeObservations.push(
      rdapObservation('p-old', 's-old', 'stale-snapshot.example.test', {
        expirationDate: futureDate,
      }),
      rdapObservation('p-new', 's-new', 'stale-snapshot.example.test', {
        status: 'UNKNOWN',
        expirationDate: futureDate,
      })
    );

    // d2: within one snapshot, an older OBSERVED row is superseded by a newer UNKNOWN row
    fixture.snapshots.push(snapshot('s2', 'd2', NOW));
    fixture.probeObservations.push(
      rdapObservation('p2-old', 's2', 'superseded-row.example.test', {
        probedAt: new Date(NOW.getTime() - 2 * DAY_MS),
        expirationDate: futureDate,
      }),
      rdapObservation('p2-new', 's2', 'superseded-row.example.test', {
        probedAt: new Date(NOW.getTime() - 1 * DAY_MS),
        status: 'UNKNOWN',
        expirationDate: futureDate,
      })
    );

    const app = createApp(TENANT_A, fixture);
    const { body } = await search(app);

    expect(expirationOf(body, 'stale-snapshot.example.test')).toEqual({ status: 'UNKNOWN' });
    expect(expirationOf(body, 'superseded-row.example.test')).toEqual({ status: 'UNKNOWN' });
  });
});

describe('issue #60: exact 7/30/90 day boundaries', () => {
  it('buckets and filters with inclusive upper boundaries', async () => {
    const cases: Array<{
      name: string;
      offsetMs: number;
      bucket: string;
      maxWindow: number | null;
    }> = [
      { name: 'at-seven-days', offsetMs: 7 * DAY_MS, bucket: 'WITHIN_7', maxWindow: 7 },
      { name: 'seven-plus-one-ms', offsetMs: 7 * DAY_MS + 1, bucket: 'WITHIN_30', maxWindow: 30 },
      { name: 'at-thirty-days', offsetMs: 30 * DAY_MS, bucket: 'WITHIN_30', maxWindow: 30 },
      {
        name: 'thirty-plus-one-ms',
        offsetMs: 30 * DAY_MS + 1,
        bucket: 'WITHIN_90',
        maxWindow: 90,
      },
      { name: 'at-ninety-days', offsetMs: 90 * DAY_MS, bucket: 'WITHIN_90', maxWindow: 90 },
      { name: 'ninety-plus-one-ms', offsetMs: 90 * DAY_MS + 1, bucket: 'LATER', maxWindow: null },
    ];

    for (const [index, testCase] of cases.entries()) {
      fixture.domains.push(domain(`d-${index}`, `${testCase.name}.example.test`));
      fixture.snapshots.push(snapshot(`s-${index}`, `d-${index}`, NOW));
      fixture.probeObservations.push(
        rdapObservation(`p-${index}`, `s-${index}`, `${testCase.name}.example.test`, {
          expirationDate: new Date(NOW.getTime() + testCase.offsetMs).toISOString(),
        })
      );
    }

    const app = createApp(TENANT_A, fixture);

    for (const testCase of cases) {
      const { body } = await search(app);
      expect(expirationOf(body, `${testCase.name}.example.test`).bucket).toBe(testCase.bucket);
    }

    // Each window includes every bucket at or below it and excludes the rest.
    const windows: Array<{ window: number; expected: string[] }> = [
      { window: 7, expected: ['at-seven-days.example.test'] },
      {
        window: 30,
        expected: [
          'at-seven-days.example.test',
          'seven-plus-one-ms.example.test',
          'at-thirty-days.example.test',
        ],
      },
      {
        window: 90,
        expected: [
          'at-seven-days.example.test',
          'seven-plus-one-ms.example.test',
          'at-thirty-days.example.test',
          'thirty-plus-one-ms.example.test',
          'at-ninety-days.example.test',
        ],
      },
    ];
    for (const { window, expected } of windows) {
      const { body } = await search(app, { expirationWithinDays: window });
      expect(names(body)).toEqual(expected);
      expect(body.total).toBe(expected.length);
    }
  });

  it('excludes expired and exactly-now expirations from within windows', async () => {
    fixture.domains.push(
      domain('d-past', 'already-expired.example.test'),
      domain('d-now', 'expires-now.example.test')
    );
    fixture.snapshots.push(snapshot('s-past', 'd-past', NOW), snapshot('s-now', 'd-now', NOW));
    fixture.probeObservations.push(
      rdapObservation('p-past', 's-past', 'already-expired.example.test', {
        expirationDate: new Date(NOW.getTime() - DAY_MS).toISOString(),
      }),
      rdapObservation('p-now', 's-now', 'expires-now.example.test', {
        expirationDate: NOW.toISOString(),
      })
    );

    const app = createApp(TENANT_A, fixture);

    const unfiltered = await search(app);
    expect(expirationOf(unfiltered.body, 'already-expired.example.test').bucket).toBe('EXPIRED');
    expect(expirationOf(unfiltered.body, 'expires-now.example.test').bucket).toBe('EXPIRED');

    const { body } = await search(app, { expirationWithinDays: 90 });
    expect(names(body)).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('rejects expirationWithinDays values other than 7, 30, or 90', async () => {
    const app = createApp(TENANT_A, fixture);
    for (const invalid of [45, 0, 365]) {
      const { status, body } = await search(app, { expirationWithinDays: invalid });
      expect(status).toBe(400);
      expect(body.error).toBeDefined();
    }
    const stringWindow = await search(app, { expirationWithinDays: '90' });
    expect(stringWindow.status).toBe(400);
  });
});

describe('issue #60: sort and paginate after filtering', () => {
  it('sorts observed expirations ascending with UNKNOWN last and a name tie-break', async () => {
    fixture.domains.push(
      domain('d1', 'zzz-later.example.test'),
      domain('d2', 'aaa-soonest.example.test'),
      domain('d3', 'mmm-unknown-b.example.test'),
      domain('d4', 'bbb-soon.example.test'),
      domain('d5', 'aaa-unknown-a.example.test')
    );
    const at = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString();
    for (const [dId, sId, name, days] of [
      ['d1', 's1', 'zzz-later.example.test', 60],
      ['d2', 's2', 'aaa-soonest.example.test', 2],
      ['d4', 's4', 'bbb-soon.example.test', 10],
    ] as const) {
      fixture.snapshots.push(snapshot(sId, dId, NOW));
      fixture.probeObservations.push(
        rdapObservation(`p-${sId}`, sId, name, { expirationDate: at(days) })
      );
    }

    const app = createApp(TENANT_A, fixture);
    const { body } = await search(app);

    expect(names(body)).toEqual([
      'aaa-soonest.example.test',
      'bbb-soon.example.test',
      'zzz-later.example.test',
      'aaa-unknown-a.example.test',
      'mmm-unknown-b.example.test',
    ]);
  });

  it('reflects all filtered rows in total and slices the page afterward', async () => {
    const at = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString();
    for (let i = 1; i <= 3; i += 1) {
      fixture.domains.push(domain(`d${i}`, `page-${i}.example.test`));
      fixture.snapshots.push(snapshot(`s${i}`, `d${i}`, NOW));
      fixture.probeObservations.push(
        rdapObservation(`p${i}`, `s${i}`, `page-${i}.example.test`, {
          expirationDate: at(i * 10),
        })
      );
    }

    const app = createApp(TENANT_A, fixture);

    const pageOne = await search(app, { expirationWithinDays: 90, limit: 1, offset: 0 });
    expect(pageOne.body.total).toBe(3);
    expect(names(pageOne.body)).toEqual(['page-1.example.test']);

    const pageThree = await search(app, { expirationWithinDays: 90, limit: 1, offset: 2 });
    expect(pageThree.body.total).toBe(3);
    expect(names(pageThree.body)).toEqual(['page-3.example.test']);
  });
});

describe('issue #60: tenant isolation', () => {
  it('never returns another tenant domain or its probe evidence', async () => {
    const nearExpiry = new Date(NOW.getTime() + 3 * DAY_MS).toISOString();
    fixture.domains.push(
      domain('d-a', 'tenant-a.example.test', TENANT_A),
      domain('d-b', 'tenant-b.example.test', TENANT_B)
    );
    fixture.snapshots.push(snapshot('s-a', 'd-a', NOW), snapshot('s-b', 'd-b', NOW));
    fixture.probeObservations.push(
      rdapObservation('p-a', 's-a', 'tenant-a.example.test', { expirationDate: nearExpiry }),
      rdapObservation('p-b', 's-b', 'tenant-b.example.test', { expirationDate: nearExpiry })
    );

    const app = createApp(TENANT_A, fixture);
    const { body } = await search(app, { expirationWithinDays: 7 });

    expect(names(body)).toEqual(['tenant-a.example.test']);
    expect(body.total).toBe(1);
    expect(JSON.stringify(body)).not.toContain('tenant-b.example.test');
  });
});

describe('issue #60: saved 90-day filter round-trip', () => {
  it('stores and reloads expirationWithinDays criteria through the saved-filter route', async () => {
    const app = createApp(TENANT_A, fixture);

    const createRes = await app.request('/api/portfolio/filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Expiring within 90 days',
        criteria: { expirationWithinDays: 90 },
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { filter: { criteria: Record<string, unknown> } };
    expect(created.filter.criteria).toEqual({ expirationWithinDays: 90 });

    const listRes = await app.request('/api/portfolio/filters');
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as {
      filters: Array<{ criteria: Record<string, unknown> }>;
    };
    const loaded = listed.filters.find((f) => f.criteria.expirationWithinDays === 90);
    expect(loaded).toBeDefined();
  });
});
