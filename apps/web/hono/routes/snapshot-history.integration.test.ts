/**
 * Snapshot History Integration Tests — Bead 07 UI
 *
 * Verifies:
 * 1. API response shapes match the client-side types consumed by SnapshotHistoryPanel
 * 2. Diff summary computation correctness (record-only vs combined)
 * 3. Edge cases: empty snapshots, single snapshot, identical diff, scope/ruleset changes
 * 4. Tenant isolation on all snapshot endpoints
 *
 * These tests would have caught:
 * - totalFindingChanges type mismatch (API uses totalChanges)
 * - rulesetChanges vs rulesetChange naming mismatch
 * - summary double-counting records + findings
 * - empty record table when all unchanged
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { snapshotRoutes } from './snapshots.js';

// ---------------------------------------------------------------------------
// Client-side type mirrors (must match SnapshotHistoryPanel.tsx)
// If these stop compiling, the client types drifted from the API.
// ---------------------------------------------------------------------------

interface ClientSnapshotListItem {
  id: string;
  createdAt: string;
  rulesetVersionId: string | null;
  findingsEvaluated: boolean;
  queryScope: { names: string[]; types: string[]; vantages: string[] };
}

interface ClientDiffResponse {
  diff: {
    snapshotA: { id: string; createdAt: string; rulesetVersion: string };
    snapshotB: { id: string; createdAt: string; rulesetVersion: string };
    comparison: {
      recordChanges: Array<{
        type: 'added' | 'removed' | 'modified' | 'unchanged';
        name: string;
        recordType: string;
        valuesA?: string[];
        valuesB?: string[];
        diff?: { added: string[]; removed: string[] };
      }>;
      ttlChanges: Array<{
        name: string;
        recordType: string;
        ttlA: number;
        ttlB: number;
        change: number;
      }>;
      findingChanges: Array<{
        type: 'added' | 'removed' | 'modified' | 'unchanged';
        findingType: string;
        title: string;
      }>;
      scopeChanges: {
        type: 'scope-changed';
        namesAdded: string[];
        namesRemoved: string[];
        typesAdded: string[];
        typesRemoved: string[];
        vantagesAdded: string[];
        vantagesRemoved: string[];
        message: string;
      } | null;
      // CRITICAL: singular "rulesetChange", NOT "rulesetChanges"
      rulesetChange: {
        type: 'ruleset-changed';
        versionA: string;
        versionB: string;
        message: string;
      } | null;
    };
    summary: {
      // CRITICAL: "totalChanges" NOT "totalRecordChanges"
      totalChanges: number;
      // CRITICAL: "additions"/"deletions"/"modifications", NOT "added"/"removed"/"modified"
      additions: number;
      deletions: number;
      modifications: number;
      unchanged: number;
    };
    findingsSummary: {
      // CRITICAL: "totalChanges" NOT "totalFindingChanges"
      totalChanges: number;
      added: number;
      removed: number;
      modified: number;
      unchanged: number;
      severityChanges: number;
    };
  };
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Mock infrastructure (matches snapshots.runtime.test.ts pattern)
// ---------------------------------------------------------------------------

interface MockState {
  domains: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  recordSets: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') return record[symbolName] as string;
  const symbols = Object.getOwnPropertySymbols(record);
  const drizzleName = symbols.find((s) => String(s) === 'Symbol(drizzle:Name)');
  if (drizzleName && typeof record[drizzleName] === 'string') return record[drizzleName] as string;
  return '';
}

function getConditionParam(condition: unknown): unknown {
  const sql = condition as {
    queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
  };
  return sql.queryChunks?.find((chunk) => chunk?.constructor?.name === 'Param')?.value;
}

function createMockDb(state: MockState): IDatabaseAdapter {
  return {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => {
      const name = getTableName(table);
      if (name === 'domains') return [...state.domains];
      if (name === 'snapshots')
        return [...state.snapshots].sort(
          (a, b) =>
            new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
        );
      if (name === 'record_sets') return [...state.recordSets];
      if (name === 'findings') return [...state.findings];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTableName(table);
      const param = getConditionParam(condition);
      if (name === 'domains') {
        return state.domains.filter(
          (r) => r.id === param || r.normalizedName === param || r.name === param
        );
      }
      if (name === 'snapshots')
        return state.snapshots
          .filter((r) => r.domainId === param)
          .sort(
            (a, b) =>
              new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
          );
      if (name === 'record_sets') return state.recordSets.filter((r) => r.snapshotId === param);
      if (name === 'findings') return state.findings.filter((r) => r.snapshotId === param);
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTableName(table);
      const param = getConditionParam(condition);
      if (name === 'domains')
        return state.domains.find(
          (r) => r.id === param || r.normalizedName === param || r.name === param
        );
      if (name === 'snapshots') return state.snapshots.find((r) => r.id === param);
      return undefined;
    }),
    insert: vi.fn(),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(async (cb: (db: IDatabaseAdapter) => Promise<unknown>) =>
      cb(createMockDb(state))
    ),
  } as unknown as IDatabaseAdapter;
}

function createApp(state: MockState, tenantId = 'tenant-1') {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    c.set('tenantId', tenantId);
    c.set('actorId', 'actor-1');
    await next();
  });
  app.route('/api/snapshots', snapshotRoutes);
  return app;
}

const NOW = new Date();
const YESTERDAY = new Date(NOW.getTime() - 86400000);

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snap-1',
    domainId: 'domain-1',
    domainName: 'example.com',
    resultState: 'complete',
    rulesetVersionId: null,
    queriedNames: ['example.com'],
    queriedTypes: ['A', 'MX'],
    vantages: ['google-dns'],
    metadata: {},
    createdAt: NOW,
    collectionDurationMs: 1200,
    triggeredBy: 'manual',
    zoneManagement: 'unmanaged',
    ...overrides,
  };
}

function makeRecordSet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rs-1',
    snapshotId: 'snap-1',
    name: 'example.com',
    type: 'A',
    ttl: 300,
    values: ['1.2.3.4'],
    raw: null,
    ...overrides,
  };
}

function makeFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'finding-1',
    snapshotId: 'snap-1',
    findingType: 'missing-spf',
    title: 'Missing SPF Record',
    severity: 'high',
    confidence: 'high',
    ruleId: 'DNS-SPF-001',
    ruleVersion: '1.0.0',
    evidence: [],
    description: 'No SPF record found',
    ...overrides,
  };
}

const DEFAULT_DOMAIN = {
  id: 'domain-1',
  name: 'example.com',
  normalizedName: 'example.com',
  tenantId: 'tenant-1',
};

// ===========================================================================
// Tests
// ===========================================================================

describe('Snapshot History — API ↔ Client Type Contract', () => {
  /**
   * This test validates that the snapshot list response contains exactly
   * the fields the client expects. If the API shape changes, this test
   * forces the client types to be updated too.
   */
  it('GET /:domain response matches ClientSnapshotListItem shape', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-a', createdAt: YESTERDAY, rulesetVersionId: 'rv-1' }),
        makeSnapshot({ id: 'snap-b', createdAt: NOW, rulesetVersionId: null }),
      ],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);
    const res = await app.request('/api/snapshots/example.com');
    expect(res.status).toBe(200);

    const json = (await res.json()) as { snapshots: ClientSnapshotListItem[] };

    // Verify ALL expected fields exist on every item
    for (const snap of json.snapshots) {
      expect(typeof snap.id).toBe('string');
      // createdAt must be a serializable string (Date auto-serialized to ISO)
      expect(snap.createdAt).toBeDefined();
      expect(snap).toHaveProperty('rulesetVersionId');
      expect(typeof snap.findingsEvaluated).toBe('boolean');
      expect(snap.queryScope).toBeDefined();
      expect(Array.isArray(snap.queryScope.names)).toBe(true);
      expect(Array.isArray(snap.queryScope.types)).toBe(true);
      expect(Array.isArray(snap.queryScope.vantages)).toBe(true);
    }

    // Verify findingsEvaluated correctly derives from rulesetVersionId
    const withRuleset = json.snapshots.find((s) => s.id === 'snap-a');
    const withoutRuleset = json.snapshots.find((s) => s.id === 'snap-b');
    expect(withRuleset?.findingsEvaluated).toBe(true);
    expect(withoutRuleset?.findingsEvaluated).toBe(false);
  });

  /**
   * Validates the diff response shape matches ClientDiffResponse exactly.
   * This test would have caught the original bugs:
   * - "totalFindingChanges" → should be "totalChanges"
   * - "rulesetChanges" → should be "rulesetChange"
   * - "added"/"removed" → should be "additions"/"deletions" in summary
   */
  it('POST /:domain/diff response matches ClientDiffResponse shape', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY, rulesetVersionId: 'rv-1' }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW, rulesetVersionId: 'rv-2' }),
      ],
      recordSets: [
        makeRecordSet({
          id: 'rs-1',
          snapshotId: 'snap-old',
          name: 'example.com',
          type: 'A',
          values: ['1.2.3.4'],
        }),
        makeRecordSet({
          id: 'rs-2',
          snapshotId: 'snap-new',
          name: 'example.com',
          type: 'A',
          values: ['5.6.7.8'],
        }),
        makeRecordSet({
          id: 'rs-3',
          snapshotId: 'snap-new',
          name: 'example.com',
          type: 'AAAA',
          values: ['::1'],
        }),
      ],
      findings: [
        makeFinding({ id: 'f-1', snapshotId: 'snap-old' }),
        makeFinding({ id: 'f-2', snapshotId: 'snap-new', severity: 'medium' }),
      ],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    expect(res.status).toBe(200);

    const json = (await res.json()) as ClientDiffResponse;

    // --- Top-level structure ---
    expect(json.diff).toBeDefined();
    expect(json.diff.snapshotA).toBeDefined();
    expect(json.diff.snapshotB).toBeDefined();
    expect(json.diff.comparison).toBeDefined();
    expect(json.diff.summary).toBeDefined();
    expect(json.diff.findingsSummary).toBeDefined();

    // --- Snapshot metadata ---
    expect(json.diff.snapshotA.id).toBe('snap-old');
    expect(json.diff.snapshotB.id).toBe('snap-new');
    expect(typeof json.diff.snapshotA.rulesetVersion).toBe('string');

    // --- Summary uses correct field names ---
    // CRITICAL: these are the exact names the client reads
    expect(json.diff.summary).toHaveProperty('totalChanges');
    expect(json.diff.summary).toHaveProperty('additions');
    expect(json.diff.summary).toHaveProperty('deletions');
    expect(json.diff.summary).toHaveProperty('modifications');
    expect(json.diff.summary).toHaveProperty('unchanged');
    // MUST NOT have old/wrong names
    expect(json.diff.summary).not.toHaveProperty('totalRecordChanges');
    expect(json.diff.summary).not.toHaveProperty('added');
    expect(json.diff.summary).not.toHaveProperty('removed');

    // --- Findings summary uses correct field names ---
    expect(json.diff.findingsSummary).toHaveProperty('totalChanges');
    expect(json.diff.findingsSummary).toHaveProperty('added');
    expect(json.diff.findingsSummary).toHaveProperty('removed');
    expect(json.diff.findingsSummary).toHaveProperty('severityChanges');
    // MUST NOT have old/wrong names
    expect(json.diff.findingsSummary).not.toHaveProperty('totalFindingChanges');

    // --- Comparison uses correct field names ---
    expect(json.diff.comparison).toHaveProperty('rulesetChange');
    // MUST NOT have plural form
    expect(json.diff.comparison).not.toHaveProperty('rulesetChanges');
    expect(Array.isArray(json.diff.comparison.recordChanges)).toBe(true);
    expect(Array.isArray(json.diff.comparison.ttlChanges)).toBe(true);
    expect(Array.isArray(json.diff.comparison.findingChanges)).toBe(true);
  });

  it('POST /:domain/compare-latest response matches ClientDiffResponse shape', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW }),
      ],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/compare-latest', { method: 'POST' });
    expect(res.status).toBe(200);

    const json = (await res.json()) as ClientDiffResponse;
    // Same structural checks
    expect(json.diff.summary).toHaveProperty('totalChanges');
    expect(json.diff.summary).not.toHaveProperty('totalRecordChanges');
    expect(json.diff.findingsSummary).toHaveProperty('totalChanges');
    expect(json.diff.findingsSummary).not.toHaveProperty('totalFindingChanges');
    expect(json.diff.comparison).toHaveProperty('rulesetChange');
    expect(json.diff.comparison).not.toHaveProperty('rulesetChanges');
  });
});

describe('Snapshot History — Summary Computation Correctness', () => {
  /**
   * The API's summary.totalChanges combines record + finding counts.
   * The client must NOT use this for record-only display.
   * This test proves the combined nature so the client knows to compute its own.
   */
  it('summary.totalChanges includes BOTH record and finding changes', async () => {
    // IMPORTANT: rulesetVersionId must be non-null for findings to be included
    // in the diff — the route filters them out for unevaluated snapshots.
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY, rulesetVersionId: 'rv-1' }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW, rulesetVersionId: 'rv-1' }),
      ],
      recordSets: [
        // 1 added record (only in snap-new)
        makeRecordSet({ id: 'rs-1', snapshotId: 'snap-new', name: 'example.com', type: 'AAAA' }),
      ],
      findings: [
        // 1 added finding (only in snap-new)
        makeFinding({ id: 'f-1', snapshotId: 'snap-new' }),
      ],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    const json = (await res.json()) as ClientDiffResponse;

    // 1 record added + 1 finding added = 2 total
    expect(json.diff.summary.totalChanges).toBe(2);
    expect(json.diff.summary.additions).toBe(2);

    // Finding-only summary is separate and accurate
    expect(json.diff.findingsSummary.totalChanges).toBe(1);
    expect(json.diff.findingsSummary.added).toBe(1);

    // Record changes array has exactly 1 non-unchanged entry
    const nonUnchangedRecords = json.diff.comparison.recordChanges.filter(
      (r) => r.type !== 'unchanged'
    );
    expect(nonUnchangedRecords.length).toBe(1);

    // PROOF: client must compute record-only stats from the array,
    // not from summary.additions which double-counts
    expect(
      json.diff.summary.additions,
      'summary.additions double-counts — client MUST compute record-only stats from recordChanges array'
    ).toBeGreaterThan(nonUnchangedRecords.length);
  });

  it('recordChanges array includes unchanged records', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW }),
      ],
      recordSets: [
        // Same record in both snapshots → unchanged
        makeRecordSet({
          id: 'rs-1',
          snapshotId: 'snap-old',
          name: 'example.com',
          type: 'A',
          values: ['1.2.3.4'],
        }),
        makeRecordSet({
          id: 'rs-2',
          snapshotId: 'snap-new',
          name: 'example.com',
          type: 'A',
          values: ['1.2.3.4'],
        }),
      ],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    const json = (await res.json()) as ClientDiffResponse;

    // Record exists in the array but marked unchanged
    expect(json.diff.comparison.recordChanges.length).toBeGreaterThan(0);
    const unchanged = json.diff.comparison.recordChanges.filter((r) => r.type === 'unchanged');
    expect(unchanged.length).toBeGreaterThan(0);

    // No actual changes
    const nonUnchanged = json.diff.comparison.recordChanges.filter((r) => r.type !== 'unchanged');
    expect(
      nonUnchanged.length,
      'Client must filter unchanged before rendering table rows — empty table body is a visual bug'
    ).toBe(0);
  });
});

describe('Snapshot History — Scope and Ruleset Change Detection', () => {
  it('detects scope changes between snapshots', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({
          id: 'snap-old',
          createdAt: YESTERDAY,
          queriedNames: ['example.com'],
          queriedTypes: ['A'],
          vantages: ['google-dns'],
        }),
        makeSnapshot({
          id: 'snap-new',
          createdAt: NOW,
          queriedNames: ['example.com', 'www.example.com'],
          queriedTypes: ['A', 'MX'],
          vantages: ['google-dns'],
        }),
      ],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    const json = (await res.json()) as ClientDiffResponse;

    expect(json.diff.comparison.scopeChanges).not.toBeNull();
    expect(json.diff.comparison.scopeChanges?.type).toBe('scope-changed');
    expect(json.diff.comparison.scopeChanges?.namesAdded).toContain('www.example.com');
    expect(json.diff.comparison.scopeChanges?.typesAdded).toContain('MX');
  });

  it('detects ruleset version changes', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY, rulesetVersionId: 'rv-1' }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW, rulesetVersionId: 'rv-2' }),
      ],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    const json = (await res.json()) as ClientDiffResponse;

    expect(json.diff.comparison.rulesetChange).not.toBeNull();
    expect(json.diff.comparison.rulesetChange?.type).toBe('ruleset-changed');
    expect(json.diff.comparison.rulesetChange?.versionA).toBe('rv-1');
    expect(json.diff.comparison.rulesetChange?.versionB).toBe('rv-2');
  });

  it('returns null for scopeChanges and rulesetChange when identical', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY, rulesetVersionId: 'rv-1' }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW, rulesetVersionId: 'rv-1' }),
      ],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    const json = (await res.json()) as ClientDiffResponse;

    expect(json.diff.comparison.scopeChanges).toBeNull();
    expect(json.diff.comparison.rulesetChange).toBeNull();
  });
});

describe('Snapshot History — Edge Cases', () => {
  it('returns empty snapshot list for domain with no snapshots', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com');
    expect(res.status).toBe(200);

    const json = (await res.json()) as { count: number; snapshots: ClientSnapshotListItem[] };
    expect(json.count).toBe(0);
    expect(json.snapshots).toEqual([]);
  });

  it('compare-latest returns 400 with only 1 snapshot (not crash)', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [makeSnapshot({ id: 'snap-only' })],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/compare-latest', { method: 'POST' });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; availableSnapshots: number };
    expect(json.availableSnapshots).toBe(1);
  });

  it('compare-latest returns 400 with 0 snapshots', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/compare-latest', { method: 'POST' });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; availableSnapshots: number };
    expect(json.availableSnapshots).toBe(0);
  });

  it('diff of identical snapshots produces all-unchanged with zero totalChanges', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW }),
      ],
      recordSets: [
        makeRecordSet({
          id: 'rs-a',
          snapshotId: 'snap-old',
          name: 'example.com',
          type: 'A',
          values: ['1.2.3.4'],
        }),
        makeRecordSet({
          id: 'rs-b',
          snapshotId: 'snap-new',
          name: 'example.com',
          type: 'A',
          values: ['1.2.3.4'],
        }),
      ],
      findings: [
        makeFinding({ id: 'f-a', snapshotId: 'snap-old' }),
        makeFinding({ id: 'f-b', snapshotId: 'snap-new' }),
      ],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    const json = (await res.json()) as ClientDiffResponse;

    expect(json.diff.summary.totalChanges).toBe(0);
    expect(json.diff.findingsSummary.totalChanges).toBe(0);

    // All records should be unchanged
    for (const rc of json.diff.comparison.recordChanges) {
      expect(rc.type).toBe('unchanged');
    }
    for (const fc of json.diff.comparison.findingChanges) {
      expect(fc.type).toBe('unchanged');
    }
  });

  it('findings warnings emitted when snapshots lack ruleset evaluation', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY, rulesetVersionId: null }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW, rulesetVersionId: null }),
      ],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state);

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    const json = (await res.json()) as ClientDiffResponse;

    expect(json.warnings).toBeDefined();
    expect(json.warnings?.length).toBeGreaterThan(0);
    expect(json.warnings?.some((w) => w.includes('neither snapshot has been evaluated'))).toBe(
      true
    );
  });
});

describe('Snapshot History — Tenant Isolation', () => {
  it('cannot list snapshots for another tenant domain', async () => {
    const state: MockState = {
      domains: [{ ...DEFAULT_DOMAIN, tenantId: 'tenant-OTHER' }],
      snapshots: [makeSnapshot()],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state, 'tenant-1');

    const res = await app.request('/api/snapshots/example.com');
    expect(res.status).toBe(404);
  });

  it('cannot diff snapshots across tenant boundaries', async () => {
    const state: MockState = {
      domains: [{ ...DEFAULT_DOMAIN, tenantId: 'tenant-OTHER' }],
      snapshots: [
        makeSnapshot({ id: 'snap-old', createdAt: YESTERDAY }),
        makeSnapshot({ id: 'snap-new', createdAt: NOW }),
      ],
      recordSets: [],
      findings: [],
    };
    const app = createApp(state, 'tenant-1');

    const res = await app.request('/api/snapshots/example.com/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotA: 'snap-old', snapshotB: 'snap-new' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 when tenantId is missing', async () => {
    const state: MockState = {
      domains: [DEFAULT_DOMAIN],
      snapshots: [],
      recordSets: [],
      findings: [],
    };
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', createMockDb(state));
      // deliberately NOT setting tenantId
      await next();
    });
    app.route('/api/snapshots', snapshotRoutes);

    const res = await app.request('/api/snapshots/example.com');
    expect(res.status).toBe(401);
  });
});
