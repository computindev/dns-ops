/**
 * Findings route runtime tests
 *
 * Covers the read-path endpoints:
 * - GET /snapshot/:snapshotId/findings (idempotent return of cached findings)
 * - GET /snapshot/:snapshotId/findings/summary
 * - PATCH /findings/:findingId/acknowledge
 * - PATCH /findings/:findingId/false-positive
 * - GET /findings/backfill/status
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { findingsRoutes } from './findings.js';

interface MockState {
  snapshots: Array<Record<string, unknown>>;
  domains: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  recordSets: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  suggestions: Array<Record<string, unknown>>;
  rulesetVersions: Array<Record<string, unknown>>;
  mailEvidence: Array<Record<string, unknown>>;
  dkimSelectors: Array<Record<string, unknown>>;
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') {
    return record[symbolName] as string;
  }
  const symbols = Object.getOwnPropertySymbols(record);
  const drizzleName = symbols.find((symbol) => String(symbol) === 'Symbol(drizzle:Name)');
  if (drizzleName && typeof record[drizzleName] === 'string') {
    return record[drizzleName] as string;
  }
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
      const tableName = getTableName(table);
      if (tableName === 'snapshots') return [...state.snapshots];
      if (tableName === 'domains') return [...state.domains];
      if (tableName === 'observations') return [...state.observations];
      if (tableName === 'record_sets') return [...state.recordSets];
      if (tableName === 'findings') return [...state.findings];
      if (tableName === 'suggestions') return [...state.suggestions];
      if (tableName === 'ruleset_versions') return [...state.rulesetVersions];
      if (tableName === 'mail_evidence') return [...state.mailEvidence];
      if (tableName === 'dkim_selectors') return [...state.dkimSelectors];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'findings')
        return state.findings.filter(
          (row) => row.snapshotId === param || row.rulesetVersionId === param
        );
      if (tableName === 'suggestions')
        return state.suggestions.filter((row) => row.findingId === param);
      if (tableName === 'observations')
        return state.observations.filter((row) => row.snapshotId === param);
      if (tableName === 'record_sets')
        return state.recordSets.filter((row) => row.snapshotId === param);
      if (tableName === 'mail_evidence')
        return state.mailEvidence.filter((row) => row.snapshotId === param);
      if (tableName === 'dkim_selectors')
        return state.dkimSelectors.filter((row) => row.snapshotId === param);
      if (tableName === 'snapshots')
        return state.snapshots.filter(
          (row) => row.domainId === param || row.rulesetVersionId === param
        );
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'snapshots') return state.snapshots.find((row) => row.id === param);
      if (tableName === 'domains')
        return state.domains.find(
          (row) => row.id === param || row.name === param || row.normalizedName === param
        );
      if (tableName === 'ruleset_versions')
        return state.rulesetVersions.find((row) => row.id === param || row.version === param);
      if (tableName === 'findings') return state.findings.find((row) => row.id === param);
      if (tableName === 'mail_evidence')
        return state.mailEvidence.find((row) => row.snapshotId === param);
      return undefined;
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      const tableName = getTableName(table);
      if (tableName === 'ruleset_versions') {
        const row = {
          id: `rv-${state.rulesetVersions.length + 1}`,
          createdAt: new Date(),
          ...values,
        };
        state.rulesetVersions.push(row);
        return row;
      }
      if (tableName === 'findings') {
        const row = {
          id: `finding-${state.findings.length + 1}`,
          createdAt: new Date(),
          ...values,
        };
        state.findings.push(row);
        return row;
      }
      return { id: `new-${Date.now()}`, ...values };
    }),
    insertMany: vi.fn(async (table: unknown, rows: Array<Record<string, unknown>>) => {
      const tableName = getTableName(table);
      return rows.map((values, i) => {
        const row = {
          id: `${tableName}-bulk-${i}`,
          createdAt: new Date(),
          ...values,
        };
        if (tableName === 'findings') state.findings.push(row);
        if (tableName === 'suggestions') state.suggestions.push(row);
        return row;
      });
    }),
    update: vi.fn(async (table: unknown, values: Record<string, unknown>, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'findings') {
        const index = state.findings.findIndex((row) => row.id === param);
        if (index !== -1) {
          state.findings[index] = { ...state.findings[index], ...values };
        }
      }
    }),
    updateOne: vi.fn(
      async (table: unknown, values: Record<string, unknown>, condition: unknown) => {
        const tableName = getTableName(table);
        const param = getConditionParam(condition);
        if (tableName === 'findings') {
          const index = state.findings.findIndex((row) => row.id === param);
          if (index === -1) return undefined;
          state.findings[index] = { ...state.findings[index], ...values };
          return state.findings[index];
        }
        return undefined;
      }
    ),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(async (callback: (db: IDatabaseAdapter) => Promise<unknown>) =>
      callback(createMockDb(state))
    ),
  } as unknown as IDatabaseAdapter;
}

function createApp(state: MockState, auth = true) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    if (auth) {
      c.set('tenantId', 'tenant-1');
      c.set('actorId', 'actor-1');
    }
    await next();
  });
  app.route('/api', findingsRoutes);
  return app;
}

function makeState(overrides: Partial<MockState> = {}): MockState {
  return {
    snapshots: [
      {
        id: 'snap-1',
        domainId: 'domain-1',
        domainName: 'example.com',
        resultState: 'complete',
        rulesetVersionId: null,
        zoneManagement: 'managed',
        queriedNames: ['example.com'],
        queriedTypes: ['A', 'MX'],
        vantages: ['google-dns'],
        metadata: {},
        createdAt: new Date(),
      },
    ],
    domains: [
      {
        id: 'domain-1',
        name: 'example.com',
        normalizedName: 'example.com',
        tenantId: 'tenant-1',
        zoneManagement: 'managed',
      },
    ],
    observations: [],
    recordSets: [],
    findings: [],
    suggestions: [],
    rulesetVersions: [],
    mailEvidence: [],
    dkimSelectors: [],
    ...overrides,
  };
}

describe('findingsRoutes runtime', () => {
  describe('GET /snapshot/:snapshotId/findings', () => {
    it('returns 404 when snapshot not found', async () => {
      const state = makeState({ snapshots: [] });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/nonexistent/findings');

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Snapshot not found');
    });

    it('returns 404 when domain not found for snapshot', async () => {
      const state = makeState({ domains: [] });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/snap-1/findings');

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Domain not found');
    });

    it('returns cached findings idempotently when version matches', async () => {
      const state = makeState({
        rulesetVersions: [
          {
            id: 'rv-1',
            version: '1.2.0',
            name: 'DNS and Mail Rules',
            active: true,
            createdAt: new Date(),
          },
        ],
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            rulesetVersionId: 'rv-1',
            type: 'dns.authoritative-failure',
            title: 'Authoritative failure',
            description: 'Test',
            severity: 'high',
            confidence: 'high',
            riskPosture: 'high',
            blastRadius: 'single-domain',
            reviewOnly: false,
            evidence: [],
            ruleId: 'dns.authoritative-failure',
            ruleVersion: '1.0.0',
          },
        ],
        suggestions: [
          {
            id: 'sug-1',
            findingId: 'finding-1',
            title: 'Fix authoritative',
            description: 'Fix it',
            action: 'manual',
          },
        ],
      });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/snap-1/findings');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        snapshotId: string;
        idempotent: boolean;
        persisted: boolean;
        summary: { totalFindings: number; dnsFindings: number; mailFindings: number };
      };
      expect(json.snapshotId).toBe('snap-1');
      expect(json.idempotent).toBe(true);
      expect(json.persisted).toBe(true);
      expect(json.summary.totalFindings).toBe(1);
      expect(json.summary.dnsFindings).toBe(1);
      expect(json.summary.mailFindings).toBe(0);
    });

    it('evaluates and persists findings when no cached version exists', async () => {
      const state = makeState({
        observations: [
          {
            id: 'obs-1',
            snapshotId: 'snap-1',
            queryName: 'example.com',
            queryType: 'MX',
            vantageType: 'resolver',
            vantageIdentifier: '8.8.8.8',
            status: 'success',
            answerSection: [
              { name: 'example.com', type: 'MX', data: '10 mail.example.com.', ttl: 3600 },
            ],
            authoritySection: [],
            additionalSection: [],
            responseTime: 50,
          },
        ],
      });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/snap-1/findings');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        idempotent: boolean;
        evaluated: boolean;
        persisted: boolean;
        rulesetVersion: string;
      };
      expect(json.idempotent).toBe(false);
      expect(json.evaluated).toBe(true);
      expect(json.persisted).toBe(true);
      expect(json.rulesetVersion).toBe('1.2.0');
    });
  });

  describe('GET /snapshot/:snapshotId/findings/summary', () => {
    it('returns severity counts for a snapshot', async () => {
      const state = makeState({
        findings: [
          {
            id: 'f1',
            snapshotId: 'snap-1',
            severity: 'high',
            type: 'dns.authoritative-failure',
          },
          {
            id: 'f2',
            snapshotId: 'snap-1',
            severity: 'medium',
            type: 'mail.no-mx-record',
          },
          {
            id: 'f3',
            snapshotId: 'snap-1',
            severity: 'high',
            type: 'dns.recursive-mismatch',
          },
        ],
      });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/snap-1/findings/summary');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        snapshotId: string;
        hasFindings: boolean;
        total: number;
      };
      expect(json.snapshotId).toBe('snap-1');
      expect(json.hasFindings).toBe(true);
      expect(json.total).toBeGreaterThan(0);
    });

    it('returns empty summary for snapshot with no findings', async () => {
      const state = makeState();
      const app = createApp(state);

      const response = await app.request('/api/snapshot/snap-1/findings/summary');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        hasFindings: boolean;
        total: number;
      };
      expect(json.hasFindings).toBe(false);
      expect(json.total).toBe(0);
    });

    it('returns 401 when unauthenticated', async () => {
      const state = makeState();
      const app = createApp(state, false); // No auth

      const response = await app.request('/api/snapshot/snap-1/findings/summary');

      expect(response.status).toBe(401);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Unauthorized');
    });

    it('returns 200 for own tenant snapshot', async () => {
      const state = makeState({
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-1', // Same as auth tenant
            zoneManagement: 'managed',
          },
        ],
      });
      const app = createApp(state, true);

      const response = await app.request('/api/snapshot/snap-1/findings/summary');

      expect(response.status).toBe(200);
      const json = (await response.json()) as { snapshotId: string };
      expect(json.snapshotId).toBe('snap-1');
    });

    it('returns 404 for other tenant snapshot', async () => {
      const state = makeState({
        domains: [
          {
            id: 'domain-1',
            name: 'example.com',
            normalizedName: 'example.com',
            tenantId: 'tenant-other', // Different from auth tenant
            zoneManagement: 'managed',
          },
        ],
      });
      const app = createApp(state, true);

      const response = await app.request('/api/snapshot/snap-1/findings/summary');

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Snapshot not found');
    });

    it('returns 404 when snapshot not found', async () => {
      const state = makeState({ snapshots: [] });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/nonexistent/findings/summary');

      expect(response.status).toBe(404);
      const json = (await response.json()) as { error: string };
      expect(json.error).toBe('Snapshot not found');
    });
  });

  describe('PATCH /findings/:findingId/acknowledge', () => {
    it('acknowledges a finding', async () => {
      const state = makeState({
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'Auth failure',
            acknowledgedAt: null,
            acknowledgedBy: null,
            falsePositive: false,
          },
        ],
      });
      const app = createApp(state);

      const response = await app.request('/api/findings/finding-1/acknowledge', {
        method: 'PATCH',
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as { success: boolean };
      expect(json.success).toBe(true);
    });

    it('returns 404 for nonexistent finding', async () => {
      const state = makeState();
      const app = createApp(state);

      const response = await app.request('/api/findings/nonexistent/acknowledge', {
        method: 'PATCH',
      });

      expect(response.status).toBe(404);
    });

    it('returns 401 when X-Actor-Id header provided but no auth context', async () => {
      const state = makeState({
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'Auth failure',
            acknowledgedAt: null,
            acknowledgedBy: null,
            falsePositive: false,
          },
        ],
      });
      const app = createApp(state, false); // No auth context

      const response = await app.request('/api/findings/finding-1/acknowledge', {
        method: 'PATCH',
        headers: { 'X-Actor-Id': 'spoofed-actor' },
      });

      expect(response.status).toBe(401);
    });

    it('uses actor from auth context, not X-Actor-Id header', async () => {
      const state = makeState({
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'Auth failure',
            acknowledgedAt: null,
            acknowledgedBy: null,
            falsePositive: false,
          },
        ],
      });
      const app = createApp(state, true); // Auth context sets actorId = 'actor-1'

      const response = await app.request('/api/findings/finding-1/acknowledge', {
        method: 'PATCH',
        headers: { 'X-Actor-Id': 'spoofed-actor' }, // Should be ignored
      });

      expect(response.status).toBe(200);
      // Verify the finding was updated with actor from context, not header
      const updatedFinding = state.findings.find((f) => f.id === 'finding-1');
      expect(updatedFinding?.acknowledgedBy).toBe('actor-1');
      expect(updatedFinding?.acknowledgedBy).not.toBe('spoofed-actor');
    });

    it('returns 401 when no auth context (no actorId in context)', async () => {
      const state = makeState({
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'Auth failure',
            acknowledgedAt: null,
            acknowledgedBy: null,
            falsePositive: false,
          },
        ],
      });
      const app = createApp(state, false); // No auth context

      const response = await app.request('/api/findings/finding-1/acknowledge', {
        method: 'PATCH',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /findings/:findingId/false-positive', () => {
    it('marks a finding as false positive', async () => {
      const state = makeState({
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'Auth failure',
            acknowledgedAt: null,
            acknowledgedBy: null,
            falsePositive: false,
          },
        ],
      });
      const app = createApp(state);

      const response = await app.request('/api/findings/finding-1/false-positive', {
        method: 'PATCH',
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as { success: boolean };
      expect(json.success).toBe(true);
    });

    it('returns 404 for nonexistent finding', async () => {
      const state = makeState();
      const app = createApp(state);

      const response = await app.request('/api/findings/nonexistent/false-positive', {
        method: 'PATCH',
      });

      expect(response.status).toBe(404);
    });

    it('returns 401 when X-Actor-Id header provided but no auth context', async () => {
      const state = makeState({
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'Auth failure',
            acknowledgedAt: null,
            acknowledgedBy: null,
            falsePositive: false,
          },
        ],
      });
      const app = createApp(state, false); // No auth context

      const response = await app.request('/api/findings/finding-1/false-positive', {
        method: 'PATCH',
        headers: { 'X-Actor-Id': 'spoofed-actor' },
      });

      expect(response.status).toBe(401);
    });

    it('uses actor from auth context, not X-Actor-Id header', async () => {
      const state = makeState({
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'Auth failure',
            acknowledgedAt: null,
            acknowledgedBy: null,
            falsePositive: false,
          },
        ],
      });
      const app = createApp(state, true); // Auth context sets actorId = 'actor-1'

      const response = await app.request('/api/findings/finding-1/false-positive', {
        method: 'PATCH',
        headers: { 'X-Actor-Id': 'spoofed-actor' }, // Should be ignored
      });

      expect(response.status).toBe(200);
      // Verify the finding was updated with actor from context, not header
      const updatedFinding = state.findings.find((f) => f.id === 'finding-1');
      expect(updatedFinding?.acknowledgedBy).toBe('actor-1');
      expect(updatedFinding?.acknowledgedBy).not.toBe('spoofed-actor');
    });

    it('returns 401 when no auth context (no actorId in context)', async () => {
      const state = makeState({
        findings: [
          {
            id: 'finding-1',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'Auth failure',
            acknowledgedAt: null,
            acknowledgedBy: null,
            falsePositive: false,
          },
        ],
      });
      const app = createApp(state, false); // No auth context

      const response = await app.request('/api/findings/finding-1/false-positive', {
        method: 'PATCH',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /findings/backfill', () => {
    it('returns 401 when X-Actor-Id header provided but no auth context', async () => {
      const state = makeState();
      const app = createApp(state, false); // No auth context

      const response = await app.request('/api/findings/backfill', {
        method: 'POST',
        headers: {
          'X-Actor-Id': 'spoofed-actor',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 10 }),
      });

      expect(response.status).toBe(401);
    });

    it('uses actor from auth context, not X-Actor-Id header', async () => {
      const state = makeState();
      const app = createApp(state, true); // Auth context sets actorId = 'actor-1'

      const response = await app.request('/api/findings/backfill', {
        method: 'POST',
        headers: {
          'X-Actor-Id': 'spoofed-actor', // Should be ignored
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 10 }),
      });

      // Should succeed with auth context, ignoring header
      // The response may be 200 (processed) or indicate no snapshots to backfill
      expect(response.status).toBeLessThan(500);
      const json = (await response.json()) as { processed?: number };
      expect(json.processed).toBeDefined();
    });

    it('returns 401 when no auth context (no actorId in context)', async () => {
      const state = makeState();
      const app = createApp(state, false); // No auth context

      const response = await app.request('/api/findings/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /findings/backfill/status', () => {
    it('returns backfill completion stats', async () => {
      const state = makeState({
        rulesetVersions: [
          {
            id: 'rv-1',
            version: '1.2.0',
            name: 'DNS and Mail Rules',
            active: true,
            createdAt: new Date(),
          },
        ],
      });
      const app = createApp(state);

      const response = await app.request('/api/findings/backfill/status');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        rulesetVersion: string;
        completionPercent: number;
      };
      expect(json.rulesetVersion).toBe('1.2.0');
      expect(typeof json.completionPercent).toBe('number');
    });
  });

  describe('GET /snapshot/:snapshotId/findings/mail', () => {
    it('returns 404 when snapshot not found', async () => {
      const state = makeState({ snapshots: [] });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/nonexistent/findings/mail');

      expect(response.status).toBe(404);
    });

    it('returns mail findings with evidence when findings exist', async () => {
      const state = makeState({
        findings: [
          {
            id: 'f1',
            snapshotId: 'snap-1',
            type: 'mail.no-mx-record',
            title: 'No MX',
            severity: 'medium',
            ruleVersion: '1.0.0',
          },
          {
            id: 'f2',
            snapshotId: 'snap-1',
            type: 'dns.authoritative-failure',
            title: 'DNS issue',
            severity: 'high',
            ruleVersion: '1.0.0',
          },
        ],
        mailEvidence: [
          {
            id: 'me-1',
            snapshotId: 'snap-1',
            hasMx: false,
            hasSpf: true,
            hasDmarc: false,
            hasDkim: false,
            hasMtaSts: false,
            hasTlsRpt: false,
            securityScore: '20',
          },
        ],
        dkimSelectors: [
          {
            id: 'sel-1',
            snapshotId: 'snap-1',
            selector: 'google',
            domain: 'example.com',
            provenance: 'provider-template',
            confidence: 'high',
            found: false,
          },
        ],
      });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/snap-1/findings/mail');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        snapshotId: string;
        domain: string;
        summary: { totalFindings: number };
        mailConfig: { hasMx: boolean; hasSpf: boolean };
        findings: Array<{ type: string }>;
      };
      expect(json.snapshotId).toBe('snap-1');
      expect(json.domain).toBe('example.com');
      // Should only include mail findings, not DNS
      expect(json.findings.every((f) => f.type.startsWith('mail.'))).toBe(true);
      expect(json.summary.totalFindings).toBe(1);
      expect(json.mailConfig.hasSpf).toBe(true);
    });

    it('FIX-01: exposes partial UNKNOWN coverage even when no mail issue finding exists', async () => {
      const evaluationCoverage = {
        state: 'PARTIAL',
        errors: [
          {
            code: 'RULE_EXECUTION_FAILED',
            ruleId: 'mail.test-throw',
            message: 'Rule mail.test-throw could not be evaluated',
            status: 'UNKNOWN',
            unknown: {
              reason: 'CHECK_EVALUATION_FAILED',
              explanation: 'The mail check failed before it produced a trustworthy result.',
              action: 'RUN_FRESH_SCAN',
              actionLabel: 'Run a fresh scan',
              blocking: true,
            },
          },
        ],
      };
      const state = makeState({
        snapshots: [
          {
            ...makeState().snapshots[0],
            resultState: 'partial',
            metadata: { evaluation: evaluationCoverage },
          },
        ],
        findings: [
          {
            id: 'dns-only',
            snapshotId: 'snap-1',
            type: 'dns.partial-coverage-unmanaged',
            title: 'Coverage is partial',
            severity: 'info',
            ruleVersion: '1.0.0',
          },
        ],
      });
      const app = createApp(state);

      const response = await app.request('/api/snapshot/snap-1/findings/mail');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        findings: unknown[];
        evaluationCoverage: typeof evaluationCoverage;
      };
      expect(json.findings).toEqual([]);
      expect(json.evaluationCoverage).toEqual(evaluationCoverage);
      expect(json.evaluationCoverage.errors[0]?.status).toBe('UNKNOWN');
    });
  });
});
