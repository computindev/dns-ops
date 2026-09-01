/**
 * Fleet Report Routes Tests
 *
 * Tests for the fleet report API endpoints.
 * Verifies that DB context is properly available and routes work correctly.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import { fleetReportRoutes } from './fleet-report.js';

describe('Fleet Report Routes', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    // Create app with fleet report routes and mock DB middleware
    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      // Mock DB adapter - simulating what dbMiddleware provides
      c.set('db', {
        query: () => Promise.resolve([]),
        getDrizzle: () => ({
          query: {
            domains: { findMany: () => Promise.resolve([]) },
            snapshots: { findFirst: () => Promise.resolve(null) },
            findings: { findMany: () => Promise.resolve([]) },
          },
        }),
      } as unknown as import('@dns-ops/db').IDatabaseAdapter);
      c.set('tenantId', 'test-tenant-uuid');
      c.set('actorId', 'test-actor');
      await next();
    });
    app.route('/api/fleet-report', fleetReportRoutes);
  });

  describe('POST /api/fleet-report/run', () => {
    it('should return 503 if database is not available', async () => {
      // Create app WITHOUT db middleware to simulate missing db context
      const appWithoutDb = new Hono<Env>();
      appWithoutDb.route('/api/fleet-report', fleetReportRoutes);

      const res = await appWithoutDb.request('/api/fleet-report/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: ['example.com'] }),
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe('Database not available');
    });

    it('should return 400 if inventory is empty', async () => {
      const res = await app.request('/api/fleet-report/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: [] }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Inventory required');
    });

    it('should return 400 if inventory is missing', async () => {
      const res = await app.request('/api/fleet-report/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Inventory required');
    });

    it('should return 400 if inventory exceeds max size', async () => {
      const largeInventory = Array(1001).fill('example.com');

      const res = await app.request('/api/fleet-report/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: largeInventory }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('too large');
    });

    it('should process valid inventory (DB context available)', async () => {
      // This test verifies that the DB context is properly available
      // The route successfully uses c.get('db') without crashing
      const res = await app.request('/api/fleet-report/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: ['example.com'] }),
      });

      // The route should work (200) or fail gracefully with a domain/repository error
      // The key assertion is that we DON'T get a "DB context missing" crash
      expect([200, 500]).toContain(res.status);
      const json = await res.json();
      // Should NOT be a "DB context missing" error (if error exists)
      if (json.error) {
        expect(json.error).not.toContain('DB context missing');
      }
    });
  });

  describe('GET /api/fleet-report/templates', () => {
    it('should return available report templates', async () => {
      const res = await app.request('/api/fleet-report/templates');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.templates).toBeInstanceOf(Array);
      expect(json.templates.length).toBeGreaterThan(0);
      expect(json.templates[0]).toHaveProperty('id');
      expect(json.templates[0]).toHaveProperty('name');
      expect(json.templates[0]).toHaveProperty('checks');
    });

    it('should include mail-security-baseline template with mail checks', async () => {
      const res = await app.request('/api/fleet-report/templates');
      const json = await res.json();

      const mailTemplate = json.templates.find(
        (t: { id: string }) => t.id === 'mail-security-baseline'
      );
      expect(mailTemplate).toBeDefined();
      expect(mailTemplate.checks).toContain('spf');
      expect(mailTemplate.checks).toContain('dmarc');
      expect(mailTemplate.checks).toContain('dkim');
      expect(mailTemplate.checks).toContain('mx');
    });

    it('should include infrastructure-audit template with infrastructure and delegation checks', async () => {
      const res = await app.request('/api/fleet-report/templates');
      const json = await res.json();

      const infraTemplate = json.templates.find(
        (t: { id: string }) => t.id === 'infrastructure-audit'
      );
      expect(infraTemplate).toBeDefined();
      expect(infraTemplate.checks).toContain('infrastructure');
      expect(infraTemplate.checks).toContain('delegation');
    });

    it('should include pre-migration-check template with all check types', async () => {
      const res = await app.request('/api/fleet-report/templates');
      const json = await res.json();

      const migrationTemplate = json.templates.find(
        (t: { id: string }) => t.id === 'pre-migration-check'
      );
      expect(migrationTemplate).toBeDefined();
      expect(migrationTemplate.checks).toContain('spf');
      expect(migrationTemplate.checks).toContain('dmarc');
      expect(migrationTemplate.checks).toContain('dkim');
      expect(migrationTemplate.checks).toContain('mx');
      expect(migrationTemplate.checks).toContain('infrastructure');
      expect(migrationTemplate.checks).toContain('delegation');
    });
  });

  describe('POST /api/fleet-report/import-csv', () => {
    it('should import domains from CSV', async () => {
      const csv = 'domain\nexample.com\nexample.org\n';

      const res = await app.request('/api/fleet-report/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.imported).toBe(2);
      expect(json.inventory).toContain('example.com');
      expect(json.inventory).toContain('example.org');
    });

    it('should return 400 for empty CSV', async () => {
      const res = await app.request('/api/fleet-report/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: '',
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('CSV data required');
    });

    it('should return 400 if domain column is missing', async () => {
      const csv = 'name\nexample.com\n';

      const res = await app.request('/api/fleet-report/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('domain" column');
    });
  });
});

// =============================================================================
// FLEET REPORT LOGIC TESTS (PR-07.5)
// =============================================================================

/**
 * PR-07.5: Fleet Report Processing Logic Tests
 *
 * Tests the exported helper functions (findingsToCheckResults,
 * mapSeverityToStatus, generateSummary) that drive fleet report output.
 * These are pure functions — no DB needed.
 */
describe('Fleet Report Processing Logic (PR-07.5)', () => {
  describe('findingsToCheckResults', () => {
    it('returns unknown for check type with no matching findings', () => {
      const results = findingsToCheckResults([], ['spf', 'dmarc']);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        check: 'spf',
        status: 'unknown',
        severity: 'ok',
        message: 'No SPF evidence persisted for this snapshot',
      });
      expect(results[1]).toEqual({
        check: 'dmarc',
        status: 'unknown',
        severity: 'ok',
        message: 'No DMARC evidence persisted for this snapshot',
      });
    });

    it('maps SPF findings to spf check results with correct severity', () => {
      const findings = [makeFinding('mail.no-spf-record', 'high', 'No SPF record found')];
      const results = findingsToCheckResults(findings, ['spf']);
      expect(results.length).toBeGreaterThanOrEqual(1);
      const spfResult = results.find((r) => r.check === 'spf' && r.status !== 'pass');
      expect(spfResult, 'expected an SPF fail result').toBeDefined();
      if (!spfResult) throw new Error('unreachable');
      expect(spfResult.status).toBe('fail');
      expect(spfResult.severity).toBe('high');
    });

    it('maps DMARC findings to dmarc check results', () => {
      const findings = [makeFinding('mail.dmarc-policy-none', 'medium', 'DMARC policy is none')];
      const results = findingsToCheckResults(findings, ['dmarc']);
      const dmarcResult = results.find((r) => r.check === 'dmarc' && r.status !== 'pass');
      expect(dmarcResult, 'expected a DMARC warning result').toBeDefined();
      if (!dmarcResult) throw new Error('unreachable');
      expect(dmarcResult.status).toBe('warning');
    });

    it('handles multiple findings across multiple check types', () => {
      const findings = [
        makeFinding('mail.no-spf-record', 'high', 'No SPF'),
        makeFinding('mail.no-dmarc-record', 'high', 'No DMARC'),
        makeFinding('mail.mx-present', 'info', 'MX present'),
      ];
      const results = findingsToCheckResults(findings, ['spf', 'dmarc', 'mx']);
      // spf: at least one fail, dmarc: at least one fail, mx: should have a result
      expect(results.some((r) => r.check === 'spf')).toBe(true);
      expect(results.some((r) => r.check === 'dmarc')).toBe(true);
      expect(results.some((r) => r.check === 'mx')).toBe(true);
    });

    it('infrastructure findings map to infrastructure check', () => {
      const findings = [makeFinding('dns.authoritative-timeout', 'critical', 'NS timeout')];
      const results = findingsToCheckResults(findings, ['infrastructure']);
      const infraResult = results.find((r) => r.check === 'infrastructure' && r.status !== 'pass');
      expect(infraResult, 'expected an infrastructure fail result').toBeDefined();
      if (!infraResult) throw new Error('unreachable');
      expect(infraResult.severity).toBe('critical');
      expect(infraResult.status).toBe('fail');
    });
  });

  describe('mapSeverityToStatus', () => {
    it('maps critical and high to fail', () => {
      expect(mapSeverityToStatus('critical')).toBe('fail');
      expect(mapSeverityToStatus('high')).toBe('fail');
    });

    it('maps medium to warning', () => {
      expect(mapSeverityToStatus('medium')).toBe('warning');
    });

    it('maps low and info to pass', () => {
      expect(mapSeverityToStatus('low')).toBe('pass');
      expect(mapSeverityToStatus('info')).toBe('pass');
    });

    it('maps unknown severity to unknown, never pass', () => {
      expect(mapSeverityToStatus('unknown')).toBe('unknown');
    });
  });

  describe('generateSummary', () => {
    it('returns correct totals for empty results', () => {
      const summary = generateSummary([], ['spf', 'dmarc']);
      expect(summary.totalDomains).toBe(0);
      expect(summary.domainsWithIssues).toBe(0);
      expect(summary.issueSeverity).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
    });

    it('counts domains with issues correctly', () => {
      const results = [
        makeFleetResult('a.com', [
          { check: 'spf', status: 'fail', severity: 'high', message: 'No SPF' },
        ]),
        makeFleetResult('b.com', [
          { check: 'spf', status: 'pass', severity: 'ok', message: 'SPF OK' },
        ]),
        makeFleetResult('c.com', [
          { check: 'dmarc', status: 'fail', severity: 'critical', message: 'No DMARC' },
          { check: 'spf', status: 'warning', severity: 'medium', message: 'SPF weak' },
        ]),
      ];
      const summary = generateSummary(results, ['spf', 'dmarc']);
      expect(summary.totalDomains).toBe(3);
      expect(summary.domainsWithIssues).toBe(2); // a.com and c.com
    });

    it('calculates severity breakdown correctly', () => {
      const results = [
        makeFleetResult('a.com', [
          { check: 'spf', status: 'fail', severity: 'critical', message: 'x' },
          { check: 'spf', status: 'fail', severity: 'critical', message: 'y' },
        ]),
        makeFleetResult('b.com', [
          { check: 'dmarc', status: 'fail', severity: 'high', message: 'z' },
          { check: 'mx', status: 'warning', severity: 'medium', message: 'w' },
        ]),
      ];
      const summary = generateSummary(results, ['spf', 'dmarc', 'mx']);
      const severity = summary.issueSeverity as Record<string, number>;
      expect(severity.critical).toBe(2);
      expect(severity.high).toBe(1);
      expect(severity.medium).toBe(1);
      expect(severity.low).toBe(0);
    });
  });
});

// =============================================================================
// FLEET REPORT TRUTH MODEL (issue #65)
// =============================================================================

/**
 * Route-level tests for the evidence truth model:
 * - PASS requires affirmative persisted, correlated evidence.
 * - Stale (missing/partial evaluation coverage) or uncorrelated findings are UNKNOWN.
 */
describe('Fleet Report truth model (issue #65)', () => {
  const TENANT_ID = 'tenant-uuid-1';

  interface MockData {
    domains: Array<Record<string, unknown>>;
    snapshots: Array<Record<string, unknown>>;
    findings: Array<Record<string, unknown>>;
    observations: Array<Record<string, unknown>>;
  }

  function getTableName(table: unknown): string {
    if (!table || typeof table !== 'object') return '';
    const record = table as Record<symbol | string, unknown>;
    const symbolName = Symbol.for('drizzle:Name');
    if (typeof record[symbolName] === 'string') return record[symbolName] as string;
    const symbols = Object.getOwnPropertySymbols(record);
    const drizzleName = symbols.find((s) => String(s) === 'Symbol(drizzle:Name)');
    return drizzleName && typeof record[drizzleName] === 'string'
      ? (record[drizzleName] as string)
      : '';
  }

  function getConditionParam(condition: unknown): unknown {
    const sql = condition as {
      queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
    };
    return sql.queryChunks?.find((c) => c?.constructor?.name === 'Param')?.value;
  }

  function createMockDb(data: MockData) {
    return {
      selectWhere: async (table: unknown, condition: unknown) => {
        const tableName = getTableName(table);
        const param = getConditionParam(condition);
        if (tableName === 'domains') {
          return data.domains.filter((d) => d.normalizedName === param || d.tenantId === param);
        }
        if (tableName === 'snapshots') {
          return data.snapshots.filter((s) => s.domainId === param);
        }
        if (tableName === 'findings') {
          return data.findings.filter((f) => f.snapshotId === param);
        }
        if (tableName === 'observations') {
          return data.observations.filter((o) => o.snapshotId === param);
        }
        return [];
      },
    } as unknown as Env['Variables']['db'];
  }

  function buildApp(data: MockData) {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', createMockDb(data));
      c.set('tenantId', TENANT_ID);
      c.set('actorId', 'actor-1');
      await next();
    });
    app.route('/api/fleet-report', fleetReportRoutes);
    return app;
  }

  function runReport(app: Hono<Env>, inventory: string[]) {
    return app.request('/api/fleet-report/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory, checks: ['spf'] }),
    });
  }

  function mockDomain(name: string) {
    return {
      id: `domain-${name}`,
      name,
      normalizedName: name,
      tenantId: TENANT_ID,
    };
  }

  function mockSnapshot(overrides: Record<string, unknown> = {}) {
    return {
      id: 'snap-1',
      domainId: 'domain-stale.example',
      resultState: 'complete',
      rulesetVersionId: 'rv-1',
      metadata: {},
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  function mockFinding(overrides: Record<string, unknown> = {}) {
    return {
      id: `finding-${Math.random().toString(36).slice(2, 8)}`,
      snapshotId: 'snap-1',
      type: 'mail.no-spf-record',
      title: 'Missing SPF',
      description: 'No SPF record',
      severity: 'high',
      confidence: 'high',
      riskPosture: 'risk',
      blastRadius: 'zone',
      reviewOnly: false,
      ruleId: 'mail.spf-analysis.v1',
      ruleVersion: '1',
      rulesetVersionId: 'rv-1',
      evidence: [{ observationId: 'obs-1', description: 'TXT lookup' }],
      createdAt: new Date('2026-01-01T00:01:00Z'),
      ...overrides,
    };
  }

  function mockObservation(overrides: Record<string, unknown> = {}) {
    return {
      id: 'obs-1',
      snapshotId: 'snap-1',
      queryName: 'stale.example',
      queryType: 'TXT',
      ...overrides,
    };
  }

  it('returns unknown, not pass, when evaluation coverage metadata is missing (stale)', async () => {
    const app = buildApp({
      domains: [mockDomain('stale.example')],
      snapshots: [mockSnapshot({ metadata: {} })],
      findings: [mockFinding()],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['stale.example']);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.errors).toBeUndefined();
    expect(json.results).toHaveLength(1);
    const spf = json.results[0].checks.find((c: { check: string }) => c.check === 'spf');
    expect(spf.status).toBe('unknown');
    expect(json.summary.spfStats).toMatchObject({ pass: 0, fail: 0, unknown: 1 });
  });

  it('returns unknown when evaluation coverage is PARTIAL, even with findings present', async () => {
    const app = buildApp({
      domains: [mockDomain('partial.example')],
      snapshots: [
        mockSnapshot({
          domainId: 'domain-partial.example',
          metadata: {
            evaluation: {
              state: 'PARTIAL',
              errors: [
                {
                  code: 'RULE_EXECUTION_FAILED',
                  ruleId: 'mail.spf-analysis.v1',
                  message: 'rule failed',
                  status: 'UNKNOWN',
                  unknown: {
                    reason: 'CHECK_EVALUATION_FAILED',
                    explanation: 'rule failed',
                    action: 'RETRY_PROBE',
                    actionLabel: 'Retry',
                    blocking: false,
                  },
                },
              ],
            },
          },
        }),
      ],
      findings: [mockFinding()],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['partial.example']);
    expect(res.status).toBe(200);
    const json = await res.json();

    const spf = json.results[0].checks.find((c: { check: string }) => c.check === 'spf');
    expect(spf.status).toBe('unknown');
    expect(json.summary.spfStats).toMatchObject({ pass: 0, fail: 0, unknown: 1 });
  });

  it('returns unknown when the snapshot result state is partial', async () => {
    const app = buildApp({
      domains: [mockDomain('incomplete.example')],
      snapshots: [
        mockSnapshot({
          domainId: 'domain-incomplete.example',
          resultState: 'partial',
          metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        }),
      ],
      findings: [mockFinding()],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['incomplete.example']);
    const json = await res.json();

    const spf = json.results[0].checks.find((c: { check: string }) => c.check === 'spf');
    expect(spf.status).toBe('unknown');
    expect(json.summary.spfStats).toMatchObject({ pass: 0, unknown: 1 });
  });

  it('returns unknown for uncorrelated evidence: foreign observation, empty evidence, wrong ruleset', async () => {
    const app = buildApp({
      domains: [mockDomain('uncorrelated.example')],
      snapshots: [
        mockSnapshot({
          domainId: 'domain-uncorrelated.example',
          metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        }),
      ],
      findings: [
        mockFinding({
          id: 'f-foreign',
          evidence: [{ observationId: 'obs-foreign', description: 'other snapshot' }],
        }),
        mockFinding({ id: 'f-empty', evidence: [] }),
        mockFinding({ id: 'f-oldruleset', rulesetVersionId: 'rv-0' }),
      ],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['uncorrelated.example']);
    const json = await res.json();

    const spf = json.results[0].checks.find((c: { check: string }) => c.check === 'spf');
    expect(spf.status).toBe('unknown');
    expect(json.summary.spfStats).toMatchObject({ pass: 0, fail: 0, warning: 0, unknown: 1 });
    expect(json.summary.unknownChecks).toBe(1);
    expect(json.results[0].findingsCount).toBe(0);
  });

  it('returns unknown when a finding mixes current and foreign observation evidence', async () => {
    const app = buildApp({
      domains: [mockDomain('mixed-evidence.example')],
      snapshots: [
        mockSnapshot({
          domainId: 'domain-mixed-evidence.example',
          metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        }),
      ],
      findings: [
        mockFinding({
          evidence: [
            { observationId: 'obs-1', description: 'current snapshot' },
            { observationId: 'obs-foreign', description: 'foreign snapshot' },
          ],
        }),
      ],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['mixed-evidence.example']);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.results[0].findingsCount).toBe(0);
    expect(json.results[0].checks[0].status).toBe('unknown');
    expect(json.results[0].issues).toEqual([]);
    expect(json.summary).toMatchObject({ unknownChecks: 1, domainsWithIssues: 0 });
  });

  it('returns pass for a complete, correlated snapshot with an affirmative info finding', async () => {
    const app = buildApp({
      domains: [mockDomain('clean.example')],
      snapshots: [
        mockSnapshot({
          domainId: 'domain-clean.example',
          metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        }),
      ],
      findings: [mockFinding({ type: 'mail.spf-present', severity: 'info', title: 'SPF present' })],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['clean.example']);
    const json = await res.json();

    const spf = json.results[0].checks.find((c: { check: string }) => c.check === 'spf');
    expect(spf.status).toBe('pass');
    expect(json.summary.spfStats).toMatchObject({ pass: 1, unknown: 0 });
  });

  it('returns fail for a complete, correlated snapshot with a high finding', async () => {
    const app = buildApp({
      domains: [mockDomain('broken.example')],
      snapshots: [
        mockSnapshot({
          domainId: 'domain-broken.example',
          metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        }),
      ],
      findings: [mockFinding()],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['broken.example']);
    const json = await res.json();

    const spf = json.results[0].checks.find((c: { check: string }) => c.check === 'spf');
    expect(spf.status).toBe('fail');
    expect(json.results[0].issues).toHaveLength(1);
    expect(json.summary.spfStats).toMatchObject({ fail: 1, unknown: 0 });
  });

  it('emits requested unknown checks when the snapshot has no ruleset version', async () => {
    // A snapshot without a ruleset version is stale, not an error: every
    // requested check must degrade to unknown, never pass and never a
    // per-domain error entry.
    const app = buildApp({
      domains: [mockDomain('never-evaluated.example')],
      snapshots: [
        mockSnapshot({ domainId: 'domain-never-evaluated.example', rulesetVersionId: null }),
      ],
      // Findings exist but must not drive any verdict without a ruleset.
      findings: [mockFinding()],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['never-evaluated.example']);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.errors).toBeUndefined();
    expect(json.results).toHaveLength(1);
    const spf = json.results[0].checks.find((c: { check: string }) => c.check === 'spf');
    expect(spf.status).toBe('unknown');
    expect(json.results[0].findingsCount).toBe(0);
    expect(json.results[0].issues).toEqual([]);
    expect(json.summary.spfStats).toMatchObject({ pass: 0, fail: 0, unknown: 1 });
    expect(json.summary.unknownChecks).toBe(1);
    expect(json.summary.domainsWithIssues).toBe(0);
  });

  it('never counts unknown-status checks as issues, including unrecognized severities', async () => {
    // An unrecognized raw severity maps to status unknown; it must stay out
    // of issues (and domainsWithIssues), not ride in on severity !== 'ok'.
    const app = buildApp({
      domains: [mockDomain('weird.example')],
      snapshots: [
        mockSnapshot({
          domainId: 'domain-weird.example',
          metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
        }),
      ],
      findings: [mockFinding({ severity: 'urgent' })],
      observations: [mockObservation()],
    });

    const res = await runReport(app, ['weird.example']);
    const json = await res.json();

    const spf = json.results[0].checks.find((c: { check: string }) => c.check === 'spf');
    expect(spf.status).toBe('unknown');
    expect(json.results[0].issues).toEqual([]);
    expect(json.summary.spfStats).toMatchObject({ pass: 0, fail: 0, unknown: 1 });
    expect(json.summary.domainsWithIssues).toBe(0);
    expect(json.summary.unknownChecks).toBe(1);
    expect(json.highPriorityIssues).toEqual([]);
  });

  it('keeps every rule producer path in the critical fleet feature map', () => {
    const featureMapPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../.agents/skills/verify-dns-ops/features/fleet.reports.md'
    );
    const featureMap = readFileSync(featureMapPath, 'utf8');

    expect(featureMap).toContain('profile: critical');
    expect(featureMap).toContain('  - apps/collector/src/dns/collector.ts');
    expect(featureMap).toContain('  - apps/web/hono/routes/findings.ts');
    expect(featureMap).toContain('  - packages/rules/src/mail/rules.ts');
    expect(featureMap).toContain('  - packages/rules/src/dns/rules.ts');
  });
});

// -- Test data helpers --------------------------------------------------------

import type { Finding } from '@dns-ops/db';
import { findingsToCheckResults, generateSummary, mapSeverityToStatus } from './fleet-report.js';

function makeFinding(type: string, severity: string, title: string): Finding {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    snapshotId: 'snap-1',
    type,
    title,
    description: title,
    severity,
    confidence: 'high',
    ruleId: `rule-${type}`,
    evidenceRef: null,
    suggestion: null,
    metadata: null,
    createdAt: new Date(),
  } as Finding;
}

interface CheckResultLike {
  check: string;
  status: string;
  severity: string;
  message: string;
}

function makeFleetResult(domain: string, checks: CheckResultLike[]) {
  return {
    domain,
    snapshotId: `snap-${domain}`,
    collectedAt: new Date(),
    rulesetVersion: 'v1',
    findingsCount: checks.length,
    checks: checks as Array<{
      check: string;
      status: 'pass' | 'fail' | 'warning' | 'missing' | 'unknown';
      severity: 'ok' | 'low' | 'medium' | 'high' | 'critical';
      message: string;
    }>,
    issues: checks.filter((c) => c.severity !== 'ok') as Array<{
      check: string;
      status: 'pass' | 'fail' | 'warning' | 'missing' | 'unknown';
      severity: 'ok' | 'low' | 'medium' | 'high' | 'critical';
      message: string;
    }>,
  };
}
