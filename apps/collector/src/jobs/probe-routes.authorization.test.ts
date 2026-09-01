/**
 * Probe Route Authorization Tests - Issue #67
 *
 * Proves that probe authorization requires fresh, persisted, tenant-owned DNS
 * evidence from the collector's domain → snapshot → record-set →
 * source-observation chain. Caller-supplied DNS arrays (txtRecords, mxRecords,
 * dnsResults), mock/probe vantage provenance, stale TTLs, and cross-tenant
 * access must all fail closed without invoking probe functions.
 *
 * The existing probe functions are mocked at the module boundary so no socket,
 * fetch, or DNS call ever occurs.
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMTASTSPolicy,
  probeAllowlistManager,
  probeMXHosts,
  probeSMTPStarttls,
} from '../probes/index.js';
import { getProbeSemaphore, resetProbeSemaphore } from '../probes/semaphore.js';
import type { Env } from '../types.js';
import { probeRoutes } from './probe-routes.js';

vi.mock('../probes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../probes/index.js')>();
  return {
    ...actual,
    fetchMTASTSPolicy: vi.fn(),
    probeMXHosts: vi.fn(),
    probeSMTPStarttls: vi.fn(),
  };
});

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const ORIGINAL_ENABLE_ACTIVE_PROBES = process.env.ENABLE_ACTIVE_PROBES;

// =============================================================================
// Mock DB (in-memory, Drizzle table-name aware) — same approach as
// monitoring.test.ts / packages/testkit mock-db, kept local to avoid a new dep.
// =============================================================================

type Row = Record<string, unknown>;

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') return record[symbolName] as string;
  const symbols = Object.getOwnPropertySymbols(record);
  const drizzleName = symbols.find((s) => String(s) === 'Symbol(drizzle:Name)');
  if (drizzleName && typeof record[drizzleName] === 'string') {
    return record[drizzleName] as string;
  }
  return '';
}

function getConditionParams(condition: unknown): unknown[] {
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

function matches(row: Row, condition: unknown): boolean {
  return getConditionParams(condition).every((value) =>
    Object.values(row).some((field) => field === value)
  );
}

function createMockDb(state: Record<string, Row[]>): IDatabaseAdapter {
  const rows = (name: string): Row[] => state[name] ?? [];
  return {
    type: 'postgres',
    getDrizzle: () => undefined,
    select: async (table: unknown) => [...rows(getTableName(table))],
    selectWhere: async (table: unknown, condition: unknown) =>
      rows(getTableName(table)).filter((row) => matches(row, condition)),
    selectOne: async (table: unknown, condition: unknown) =>
      rows(getTableName(table)).find((row) => matches(row, condition)),
    insert: async () => ({}),
    insertMany: async () => [],
    update: async () => [],
    updateOne: async () => undefined,
    delete: async () => 0,
    transaction: async () => undefined,
  } as unknown as IDatabaseAdapter;
}

// =============================================================================
// Persisted evidence fixture: valid fresh collector chain for example.com
// =============================================================================

interface EvidenceOptions {
  tenantId?: string;
  snapshotState?: string;
  includeMx?: boolean;
  includeMtaSts?: boolean;
  mxConsistent?: boolean;
  txtConsistent?: boolean;
  mxSourceIds?: string[];
  txtSourceIds?: string[];
  mxTtl?: number;
  txtTtl?: number;
  queriedOffsetMs?: number;
  futureDated?: boolean;
  mxVantageIdentifier?: string | null;
  mxVantageType?: string;
  mxStatus?: string;
  mxResponseCode?: number;
  mxFlags?: Record<string, boolean> | null;
  mxAnswerSection?: Row[];
}

function evidenceState(overrides: EvidenceOptions = {}): Record<string, Row[]> {
  const now = Date.now();
  const o: Required<Omit<EvidenceOptions, 'mxAnswerSection'>> &
    Pick<EvidenceOptions, 'mxAnswerSection'> = {
    tenantId: TENANT_A,
    snapshotState: 'complete',
    includeMx: true,
    includeMtaSts: true,
    mxConsistent: true,
    txtConsistent: true,
    mxSourceIds: ['obs-mx'],
    txtSourceIds: ['obs-txt'],
    mxTtl: 3600,
    txtTtl: 3600,
    queriedOffsetMs: 60_000,
    futureDated: false,
    mxVantageIdentifier: '1.1.1.1',
    mxVantageType: 'public-recursive',
    mxStatus: 'success',
    mxResponseCode: 0,
    mxFlags: null,
    ...overrides,
  };
  const queriedAt = o.futureDated ? new Date(now + 60_000) : new Date(now - o.queriedOffsetMs);

  const recordSets: Row[] = [];
  const observations: Row[] = [];

  if (o.includeMx) {
    recordSets.push({
      id: 'rs-mx',
      snapshotId: 'snap-1',
      name: 'example.com',
      type: 'MX',
      ttl: o.mxTtl,
      values: ['10 mail.example.com.'],
      sourceObservationIds: o.mxSourceIds,
      sourceVantages: ['1.1.1.1'],
      isConsistent: o.mxConsistent,
      createdAt: queriedAt,
    });
    observations.push({
      id: 'obs-mx',
      snapshotId: 'snap-1',
      queryName: 'example.com',
      queryType: 'MX',
      vantageType: o.mxVantageType,
      vantageIdentifier: o.mxVantageIdentifier,
      status: o.mxStatus,
      queriedAt,
      responseTimeMs: 20,
      responseCode: o.mxResponseCode,
      flags: o.mxFlags,
      answerSection:
        o.mxAnswerSection === undefined
          ? [{ name: 'example.com', type: 'MX', ttl: o.mxTtl, data: '10 mail.example.com.' }]
          : o.mxAnswerSection,
    });
  }

  if (o.includeMtaSts) {
    recordSets.push({
      id: 'rs-txt',
      snapshotId: 'snap-1',
      name: '_mta-sts.example.com',
      type: 'TXT',
      ttl: o.txtTtl,
      values: ['v=STSv1; id=20260831'],
      sourceObservationIds: o.txtSourceIds,
      sourceVantages: ['1.1.1.1'],
      isConsistent: o.txtConsistent,
      createdAt: queriedAt,
    });
    observations.push({
      id: 'obs-txt',
      snapshotId: 'snap-1',
      queryName: '_mta-sts.example.com',
      queryType: 'TXT',
      vantageType: 'public-recursive',
      vantageIdentifier: '1.1.1.1',
      status: 'success',
      queriedAt,
      responseTimeMs: 20,
      responseCode: 0,
      flags: null,
      answerSection: [
        { name: '_mta-sts.example.com', type: 'TXT', ttl: o.txtTtl, data: 'v=STSv1; id=20260831' },
      ],
    });
  }

  return {
    domains: [
      {
        id: 'dom-1',
        name: 'example.com',
        normalizedName: 'example.com',
        tenantId: o.tenantId,
        createdAt: new Date(now - 86_400_000),
        updatedAt: new Date(now - 86_400_000),
      },
    ],
    snapshots: [
      {
        id: 'snap-1',
        domainId: 'dom-1',
        resultState: o.snapshotState,
        createdAt: new Date(now - 120_000),
        observationCount: observations.length,
      },
    ],
    record_sets: recordSets,
    observations,
  };
}

// =============================================================================
// App/request helpers
// =============================================================================

function createApp(db: IDatabaseAdapter | undefined, tenantId: string = TENANT_A): Hono<Env> {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    if (db) c.set('db', db);
    c.set('tenantId', tenantId);
    await next();
  });
  app.route('/api/probe', probeRoutes);
  return app;
}

function post(app: Hono<Env>, path: string, body: unknown): Promise<Response> {
  return app.request(`/api/probe${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function tenantAllowlistCount(): number {
  return probeAllowlistManager.getTenantAllowlist(TENANT_A).getAllEntries().length;
}

const mockedFetchMTASTSPolicy = vi.mocked(fetchMTASTSPolicy);
const mockedProbeSMTPStarttls = vi.mocked(probeSMTPStarttls);
const mockedProbeMXHosts = vi.mocked(probeMXHosts);

beforeEach(() => {
  resetProbeSemaphore(5);
  vi.clearAllMocks();
  process.env.ENABLE_ACTIVE_PROBES = 'true';
  probeAllowlistManager.clearAll();
  mockedFetchMTASTSPolicy.mockResolvedValue({
    success: true,
    domain: 'example.com',
    policyUrl: 'https://mta-sts.example.com/.well-known/mta-sts.txt',
    responseTimeMs: 1,
  });
  mockedProbeSMTPStarttls.mockResolvedValue({
    success: true,
    hostname: 'mail.example.com',
    port: 25,
    supportsStarttls: true,
    tlsNegotiated: true,
    tlsTrusted: true,
    responseTimeMs: 1,
  });
  mockedProbeMXHosts.mockResolvedValue([
    {
      success: true,
      hostname: 'mail.example.com',
      port: 25,
      supportsStarttls: true,
      tlsNegotiated: true,
      tlsTrusted: true,
      responseTimeMs: 1,
    },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  resetProbeSemaphore(5);
  probeAllowlistManager.clearAll();
});

afterAll(() => {
  if (ORIGINAL_ENABLE_ACTIVE_PROBES === undefined) {
    delete process.env.ENABLE_ACTIVE_PROBES;
  } else {
    process.env.ENABLE_ACTIVE_PROBES = ORIGINAL_ENABLE_ACTIVE_PROBES;
  }
});

// =============================================================================
// Tests
// =============================================================================

describe('Issue #67: probe authorization requires persisted DNS evidence', () => {
  describe('caller-supplied DNS evidence never authorizes', () => {
    it('rejects txtRecords on /mta-sts even when valid persisted evidence exists', async () => {
      const app = createApp(createMockDb(evidenceState()));
      const res = await post(app, '/mta-sts', {
        domain: 'example.com',
        txtRecords: ['v=STSv1; id=20260831'],
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('caller-supplied-dns-evidence');
      expect(mockedFetchMTASTSPolicy).not.toHaveBeenCalled();
      expect(tenantAllowlistCount()).toBe(0);
    });

    it('rejects mxRecords on /smtp-starttls and does not probe', async () => {
      const app = createApp(createMockDb(evidenceState()));
      const res = await post(app, '/smtp-starttls', {
        hostname: 'mail.example.com',
        mxRecords: ['10 mail.example.com.'],
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('caller-supplied-dns-evidence');
      expect(mockedProbeSMTPStarttls).not.toHaveBeenCalled();
      expect(mockedProbeMXHosts).not.toHaveBeenCalled();
      expect(tenantAllowlistCount()).toBe(0);
    });

    it('rejects dnsResults on /allowlist/generate and leaves the allowlist empty', async () => {
      const app = createApp(createMockDb(evidenceState()));
      const res = await post(app, '/allowlist/generate', {
        domain: 'example.com',
        dnsResults: [
          {
            query: { name: 'example.com', type: 'MX' },
            vantage: { type: 'public-recursive', identifier: 'mock' },
            success: true,
            answers: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 evil.example.com.' }],
          },
        ],
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('caller-supplied-dns-evidence');
      expect(tenantAllowlistCount()).toBe(0);
    });

    it.each([
      ['/mta-sts', { domain: 'example.com', mxRecords: ['10 mail.example.com.'] }],
      ['/mta-sts', { domain: 'example.com', dnsResults: [] }],
      [
        '/smtp-starttls',
        {
          domain: 'example.com',
          hostname: 'mail.example.com',
          txtRecords: ['v=STSv1; id=20260831'],
        },
      ],
      ['/smtp-starttls', { domain: 'example.com', dnsResults: [] }],
      ['/allowlist/generate', { domain: 'example.com', txtRecords: ['v=STSv1; id=20260831'] }],
      ['/allowlist/generate', { domain: 'example.com', mxRecords: ['10 mail.example.com.'] }],
    ])('rejects DNS-shaped fields irrelevant to the route %s (cross-field rejection)', async (path, body) => {
      const app = createApp(createMockDb(evidenceState()));
      const res = await post(app, path, body);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('caller-supplied-dns-evidence');
      expect(mockedFetchMTASTSPolicy).not.toHaveBeenCalled();
      expect(mockedProbeSMTPStarttls).not.toHaveBeenCalled();
      expect(mockedProbeMXHosts).not.toHaveBeenCalled();
      expect(tenantAllowlistCount()).toBe(0);
    });
  });

  describe('fresh persisted evidence authorizes (no network)', () => {
    it('/mta-sts probes the persisted policy host with allowlist checks enabled', async () => {
      const app = createApp(createMockDb(evidenceState()));
      const res = await post(app, '/mta-sts', { domain: 'example.com' });

      expect(res.status).toBe(200);
      expect(mockedFetchMTASTSPolicy).toHaveBeenCalledTimes(1);
      expect(mockedFetchMTASTSPolicy).toHaveBeenCalledWith(
        'example.com',
        TENANT_A,
        expect.objectContaining({ checkAllowlist: true })
      );
      const json = await res.json();
      expect(json.domain).toBe('example.com');
      expect(json.txtRecordId).toBe('20260831');
      expect(
        probeAllowlistManager.getTenantAllowlist(TENANT_A).isAllowed('mta-sts.example.com', 443)
      ).toBe(true);
    });

    it('/smtp-starttls probes a persisted MX target on port 25', async () => {
      const app = createApp(createMockDb(evidenceState()));
      const res = await post(app, '/smtp-starttls', {
        domain: 'example.com',
        hostname: 'MAIL.EXAMPLE.COM.',
      });

      expect(res.status).toBe(200);
      expect(mockedProbeSMTPStarttls).toHaveBeenCalledTimes(1);
      expect(mockedProbeSMTPStarttls).toHaveBeenCalledWith(
        'mail.example.com',
        TENANT_A,
        expect.objectContaining({ port: 25, checkAllowlist: true })
      );
      expect(
        probeAllowlistManager.getTenantAllowlist(TENANT_A).isAllowed('mail.example.com', 25)
      ).toBe(true);
    });

    it('/smtp-starttls batch probes exactly the persisted MX hosts', async () => {
      const app = createApp(createMockDb(evidenceState()));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(200);
      expect(mockedProbeMXHosts).toHaveBeenCalledTimes(1);
      expect(mockedProbeMXHosts).toHaveBeenCalledWith(
        [{ hostname: 'mail.example.com', priority: 10 }],
        TENANT_A,
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      const json = await res.json();
      expect(json.summary.total).toBe(1);
    });

    it('/smtp-starttls batch summary counts only trusted TLS as successful (issue #74)', async () => {
      mockedProbeMXHosts.mockResolvedValue([
        {
          success: true,
          hostname: 'mail.example.com',
          port: 25,
          supportsStarttls: true,
          tlsNegotiated: true,
          tlsTrusted: true,
          responseTimeMs: 1,
        },
        {
          // Negotiated but untrusted (expired certificate): never successful.
          success: false,
          hostname: 'mx2.example.com',
          port: 25,
          supportsStarttls: true,
          tlsNegotiated: true,
          tlsTrusted: false,
          responseTimeMs: 1,
        },
        {
          // No STARTTLS advertised: not successful, not counted as supporting.
          success: false,
          hostname: 'mx3.example.com',
          port: 25,
          supportsStarttls: false,
          tlsNegotiated: false,
          tlsTrusted: false,
          responseTimeMs: 1,
        },
      ]);
      const app = createMockApp(evidenceState());
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.summary.total).toBe(3);
      expect(json.summary.successful).toBe(1);
      expect(json.summary.supportsStarttls).toBe(2);
    });

    it('/smtp-starttls allowlists mixed-case persisted MX data canonically', async () => {
      const state = evidenceState({
        mxAnswerSection: [
          { name: 'example.com', type: 'MX', ttl: 3600, data: '10 MAIL.EXAMPLE.COM.' },
        ],
      });
      const app = createMockApp(state);
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(200);
      expect(mockedProbeMXHosts).toHaveBeenCalledWith(
        [{ hostname: 'mail.example.com', priority: 10 }],
        TENANT_A,
        expect.anything()
      );
      // The allowlist entry derived from the raw mixed-case answer must
      // match the normalized probe target.
      expect(
        probeAllowlistManager.getTenantAllowlist(TENANT_A).isAllowed('mail.example.com', 25)
      ).toBe(true);
    });

    it('/allowlist/generate derives entries from persisted evidence only', async () => {
      const app = createApp(createMockDb(evidenceState()));
      const res = await post(app, '/allowlist/generate', { domain: 'example.com' });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.entriesAdded).toBe(json.entries.length);
      expect(json.entriesAdded).toBeGreaterThanOrEqual(2);
      expect(
        probeAllowlistManager.getTenantAllowlist(TENANT_A).isAllowed('mail.example.com', 25)
      ).toBe(true);
      expect(
        probeAllowlistManager.getTenantAllowlist(TENANT_A).isAllowed('mta-sts.example.com', 443)
      ).toBe(true);
    });
  });

  describe('unattached observations do not authorize', () => {
    it('rejects a record set with no source observation links', async () => {
      const state = evidenceState({ mxSourceIds: [], txtSourceIds: [] });
      const app = createApp(createMockDb(state));
      const res = await post(app, '/mta-sts', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('missing-source-observations');
      expect(mockedFetchMTASTSPolicy).not.toHaveBeenCalled();
      expect(tenantAllowlistCount()).toBe(0);
    });

    it('rejects a source observation id that cannot be resolved', async () => {
      const state = evidenceState({ txtSourceIds: ['obs-ghost'] });
      const app = createMockApp(state);
      const res = await post(app, '/mta-sts', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('missing-source-observation');
      expect(mockedFetchMTASTSPolicy).not.toHaveBeenCalled();
    });
  });

  describe('tenant ownership', () => {
    it('rejects a domain owned by another tenant', async () => {
      const app = createApp(createMockDb(evidenceState({ tenantId: TENANT_B })), TENANT_A);
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('unknown-domain');
      expect(mockedProbeMXHosts).not.toHaveBeenCalled();
      expect(tenantAllowlistCount()).toBe(0);
    });
  });

  describe('missing evidence fails closed', () => {
    it('rejects an unregistered domain', async () => {
      const app = createApp(createMockDb({}));
      const res = await post(app, '/mta-sts', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('unknown-domain');
      expect(mockedFetchMTASTSPolicy).not.toHaveBeenCalled();
    });

    it('rejects a non-complete snapshot', async () => {
      const app = createMockApp(evidenceState({ snapshotState: 'partial' }));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('incomplete-snapshot');
      expect(mockedProbeMXHosts).not.toHaveBeenCalled();
    });

    it('rejects a missing MX record set', async () => {
      const app = createMockApp(evidenceState({ includeMx: false }));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('missing-record-set');
      expect(mockedProbeMXHosts).not.toHaveBeenCalled();
    });

    it('rejects a successful observation with no answers', async () => {
      const app = createMockApp(evidenceState({ mxAnswerSection: [] }));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('missing-answer');
      expect(mockedProbeMXHosts).not.toHaveBeenCalled();
    });

    it('rejects a missing domain parameter', async () => {
      const app = createMockApp(evidenceState());
      const res = await post(app, '/mta-sts', {});

      expect(res.status).toBe(400);
    });

    it('rejects an invalid domain value', async () => {
      const app = createMockApp(evidenceState());
      const res = await post(app, '/mta-sts', { domain: 'not a domain' });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.reason).toBe('invalid-domain');
    });
  });

  describe('stale evidence fails closed', () => {
    it('does not fetch MTA-STS after semaphore wait crosses evidence expiry', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
      resetProbeSemaphore(1);

      let release!: () => void;
      const holder = getProbeSemaphore().run(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );
      const request = post(
        createMockApp(evidenceState({ txtTtl: 0.1, queriedOffsetMs: 0 })),
        '/mta-sts',
        { domain: 'example.com' }
      );

      for (let i = 0; i < 200 && getProbeSemaphore().queued === 0; i++) {
        await Promise.resolve();
      }
      expect(getProbeSemaphore().queued).toBe(1);

      vi.advanceTimersByTime(101);
      release();
      await holder;
      const response = await request;

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ reason: 'stale-evidence' });
      expect(mockedFetchMTASTSPolicy).not.toHaveBeenCalled();
    });

    it('does not start an SMTP probe after semaphore wait crosses evidence expiry', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
      resetProbeSemaphore(1);

      let release!: () => void;
      const holder = getProbeSemaphore().run(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );
      const request = post(
        createMockApp(evidenceState({ mxTtl: 0.1, queriedOffsetMs: 0 })),
        '/smtp-starttls',
        { domain: 'example.com', hostname: 'mail.example.com' }
      );

      for (let i = 0; i < 200 && getProbeSemaphore().queued === 0; i++) {
        await Promise.resolve();
      }
      expect(getProbeSemaphore().queued).toBe(1);

      vi.advanceTimersByTime(101);
      release();
      await holder;
      const response = await request;

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ reason: 'stale-evidence' });
      expect(mockedProbeSMTPStarttls).not.toHaveBeenCalled();
    });

    it('rejects evidence older than the five-minute ceiling', async () => {
      const app = createMockApp(evidenceState({ queriedOffsetMs: 400_000 }));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('stale-evidence');
      expect(mockedProbeMXHosts).not.toHaveBeenCalled();
      expect(tenantAllowlistCount()).toBe(0);
    });

    it('rejects zero-TTL answers', async () => {
      const app = createMockApp(evidenceState({ mxTtl: 0 }));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('stale-evidence');
    });

    it('rejects future-dated observations', async () => {
      const app = createMockApp(evidenceState({ futureDated: true }));
      const res = await post(app, '/mta-sts', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('stale-evidence');
      expect(mockedFetchMTASTSPolicy).not.toHaveBeenCalled();
    });

    it('treats the exact expiry boundary as stale', async () => {
      const app = createMockApp(evidenceState({ queriedOffsetMs: 300_000 }));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('stale-evidence');
    });

    it('honors a shorter answer TTL below the ceiling', async () => {
      const fresh = createMockApp(evidenceState({ mxTtl: 60, queriedOffsetMs: 10_000 }));
      const resFresh = await post(fresh, '/smtp-starttls', { domain: 'example.com' });
      expect(resFresh.status).toBe(200);

      const expired = createMockApp(evidenceState({ mxTtl: 60, queriedOffsetMs: 61_000 }));
      const resExpired = await post(expired, '/smtp-starttls', { domain: 'example.com' });
      expect(resExpired.status).toBe(403);
      const json = await resExpired.json();
      expect(json.reason).toBe('stale-evidence');
    });
  });

  describe('untrusted provenance fails closed', () => {
    it.each([
      ['mock vantage identifier', { mxVantageIdentifier: 'mock' }],
      ['missing vantage identifier', { mxVantageIdentifier: null }],
      ['probe vantage type', { mxVantageType: 'probe' }],
      ['failed observation status', { mxStatus: 'error' }],
      ['non-NOERROR response code', { mxResponseCode: 2 }],
      ['inconsistent record set', { mxConsistent: false }],
    ])('rejects %s', async (_label, overrides) => {
      const app = createMockApp(evidenceState(overrides));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      expect(mockedProbeMXHosts).not.toHaveBeenCalled();
      expect(mockedProbeSMTPStarttls).not.toHaveBeenCalled();
      expect(tenantAllowlistCount()).toBe(0);
    });

    it('rejects authoritative vantage data without the AA flag', async () => {
      const app = createMockApp(evidenceState({ mxVantageType: 'authoritative', mxFlags: null }));
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('authoritative-answer-flag-missing');
    });

    it('accepts authoritative vantage data carrying the AA flag', async () => {
      const app = createMockApp(
        evidenceState({ mxVantageType: 'authoritative', mxFlags: { authoritative: true } })
      );
      const res = await post(app, '/smtp-starttls', { domain: 'example.com' });

      expect(res.status).toBe(200);
      expect(mockedProbeMXHosts).toHaveBeenCalledTimes(1);
    });
  });

  describe('targets cannot be overridden by the caller', () => {
    it('rejects a hostname that is not a persisted MX target', async () => {
      const app = createMockApp(evidenceState());
      const res = await post(app, '/smtp-starttls', {
        domain: 'example.com',
        hostname: 'evil.example.com',
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('hostname-not-in-evidence');
      expect(mockedProbeSMTPStarttls).not.toHaveBeenCalled();
      expect(tenantAllowlistCount()).toBe(0);
    });

    it('rejects ports other than 25', async () => {
      const app = createMockApp(evidenceState());
      const res = await post(app, '/smtp-starttls', {
        domain: 'example.com',
        hostname: 'mail.example.com',
        port: 587,
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.reason).toBe('port-not-permitted');
      expect(mockedProbeSMTPStarttls).not.toHaveBeenCalled();
    });
  });

  describe('missing database fails closed', () => {
    it('returns 503 when no database is bound to the request context', async () => {
      const app = createApp(undefined);
      const res = await post(app, '/mta-sts', { domain: 'example.com' });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.reason).toBe('database-unavailable');
      expect(mockedFetchMTASTSPolicy).not.toHaveBeenCalled();
    });
  });
});

function createMockApp(state: Record<string, Row[]>, tenantId: string = TENANT_A): Hono<Env> {
  return createApp(createMockDb(state), tenantId);
}
