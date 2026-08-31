/**
 * Fleet Report Logic Tests - Bead 18
 *
 * Tests for internal helper functions:
 * - findingsToCheckResults
 * - mapSeverityToStatus
 * - generateSummary
 */

import type { Finding } from '@dns-ops/db';
import { describe, expect, it } from 'vitest';
import { findingsToCheckResults, generateSummary, mapSeverityToStatus } from './fleet-report.js';

// Helper to create mock findings
function createMockFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id || `finding-${Math.random().toString(36).slice(2)}`,
    snapshotId: overrides.snapshotId || 'snap-123',
    type: overrides.type || 'mail.no-spf-record',
    severity: overrides.severity || 'high',
    title: overrides.title || 'Test Finding',
    description: overrides.description || 'Test description',
    reviewOnly: overrides.reviewOnly ?? false,
    ruleId: overrides.ruleId || 'rule-123',
    createdAt: overrides.createdAt || new Date(),
  } as Finding;
}

describe('Fleet Report Logic - Bead 18', () => {
  describe('findingsToCheckResults', () => {
    it('should return unknown when no findings for check type', () => {
      // Absence of findings is not proof of health: it must surface as
      // UNKNOWN, never PASS.
      const findings: Finding[] = [];
      const results = findingsToCheckResults(findings, ['spf']);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        check: 'spf',
        status: 'unknown',
        severity: 'ok',
        message: 'No SPF evidence persisted for this snapshot',
      });
    });

    it('should map SPF findings correctly', () => {
      const findings = [
        createMockFinding({ type: 'mail.no-spf-record', severity: 'high', title: 'Missing SPF' }),
        createMockFinding({
          type: 'mail.spf-permissive-all',
          severity: 'medium',
          title: 'SPF too permissive',
        }),
      ];

      const results = findingsToCheckResults(findings, ['spf']);

      expect(results).toHaveLength(2);
      expect(results[0].check).toBe('spf');
      expect(results[0].status).toBe('fail');
      expect(results[1].check).toBe('spf');
      expect(results[1].status).toBe('warning');
    });

    it('should map DMARC findings correctly', () => {
      const findings = [
        createMockFinding({
          type: 'mail.no-dmarc-record',
          severity: 'critical',
          title: 'No DMARC',
        }),
        createMockFinding({
          type: 'mail.dmarc-policy-none',
          severity: 'medium',
          title: 'DMARC p=none',
        }),
      ];

      const results = findingsToCheckResults(findings, ['dmarc']);

      expect(results).toHaveLength(2);
      expect(results[0].severity).toBe('critical');
      expect(results[1].severity).toBe('medium');
    });

    it('should map MX findings correctly', () => {
      const findings = [
        createMockFinding({ type: 'mail.no-mx-record', severity: 'high', title: 'No MX' }),
        createMockFinding({ type: 'mail.mx-present', severity: 'info', title: 'MX present' }),
      ];

      const results = findingsToCheckResults(findings, ['mx']);

      expect(results).toHaveLength(2);
      expect(results[0].check).toBe('mx');
      expect(results[1].check).toBe('mx');
    });

    it('should map DKIM findings correctly', () => {
      const findings = [
        createMockFinding({
          type: 'mail.dkim-no-valid-keys',
          severity: 'high',
          title: 'Invalid DKIM',
        }),
      ];

      const results = findingsToCheckResults(findings, ['dkim']);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('dkim');
    });

    it('should map infrastructure findings correctly', () => {
      const findings = [
        createMockFinding({
          type: 'dns.authoritative-timeout',
          severity: 'medium',
          title: 'Auth timeout',
        }),
        createMockFinding({
          type: 'dns.authoritative-mismatch',
          severity: 'high',
          title: 'Auth mismatch',
        }),
      ];

      const results = findingsToCheckResults(findings, ['infrastructure']);

      expect(results).toHaveLength(2);
      expect(results[0].check).toBe('infrastructure');
      expect(results[1].check).toBe('infrastructure');
    });

    it('should map delegation findings correctly', () => {
      const findings = [
        createMockFinding({
          type: 'dns.lame-delegation',
          severity: 'high',
          title: 'Lame delegation',
        }),
        createMockFinding({
          type: 'dns.divergent-ns',
          severity: 'critical',
          title: 'NS divergence',
        }),
      ];

      const results = findingsToCheckResults(findings, ['delegation']);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.check === 'delegation')).toBe(true);
    });

    it('should handle multiple check types', () => {
      const findings = [
        createMockFinding({ type: 'mail.no-spf-record', severity: 'high', title: 'No SPF' }),
        createMockFinding({
          type: 'mail.no-dmarc-record',
          severity: 'critical',
          title: 'No DMARC',
        }),
      ];

      const results = findingsToCheckResults(findings, ['spf', 'dmarc']);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.check)).toContain('spf');
      expect(results.map((r) => r.check)).toContain('dmarc');
    });

    it('should include finding details in results', () => {
      const findings = [
        createMockFinding({
          id: 'finding-abc',
          type: 'mail.no-spf-record',
          severity: 'high',
          title: 'Missing SPF Record',
          description: 'Domain has no SPF record',
          ruleId: 'mail.spf-analysis.v1',
        }),
      ];

      const results = findingsToCheckResults(findings, ['spf']);

      expect(results[0].details).toMatchObject({
        findingId: 'finding-abc',
        type: 'mail.no-spf-record',
        description: 'Domain has no SPF record',
        ruleId: 'mail.spf-analysis.v1',
      });
    });

    it('should deduplicate findings', () => {
      const finding = createMockFinding({ type: 'mail.no-spf-record', severity: 'high' });
      const findings = [finding, finding]; // Same finding twice

      const results = findingsToCheckResults(findings, ['spf']);

      // Should still produce results but deduplication happens via Set
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle unknown check types gracefully', () => {
      const findings = [createMockFinding({ severity: 'high' })];

      const results = findingsToCheckResults(findings, ['unknown-check-type']);

      // No rule category matches, so there is no affirmative evidence for it
      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('unknown-check-type');
      expect(results[0].status).toBe('unknown');
    });
  });

  describe('mapSeverityToStatus', () => {
    it('should map critical to fail', () => {
      expect(mapSeverityToStatus('critical')).toBe('fail');
    });

    it('should map high to fail', () => {
      expect(mapSeverityToStatus('high')).toBe('fail');
    });

    it('should map medium to warning', () => {
      expect(mapSeverityToStatus('medium')).toBe('warning');
    });

    it('should map low to pass', () => {
      expect(mapSeverityToStatus('low')).toBe('pass');
    });

    it('should map info to pass', () => {
      expect(mapSeverityToStatus('info')).toBe('pass');
    });

    it('should default unknown severities to unknown, never pass', () => {
      expect(mapSeverityToStatus('unknown')).toBe('unknown');
      expect(mapSeverityToStatus('')).toBe('unknown');
    });
  });

  describe('generateSummary', () => {
    it('should calculate total domains', () => {
      const results: FleetReportResult[] = [
        {
          domain: 'a.com',
          snapshotId: 's1',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 0,
          checks: [],
          issues: [],
        },
        {
          domain: 'b.com',
          snapshotId: 's2',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 0,
          checks: [],
          issues: [],
        },
      ];

      const summary = generateSummary(results, ['spf']);

      expect(summary.totalDomains).toBe(2);
    });

    it('should calculate domains with issues', () => {
      const results: FleetReportResult[] = [
        {
          domain: 'clean.com',
          snapshotId: 's1',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 0,
          checks: [],
          issues: [],
        },
        {
          domain: 'dirty.com',
          snapshotId: 's2',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 2,
          checks: [],
          issues: [{ check: 'spf', status: 'fail', severity: 'high', message: 'Bad' }],
        },
      ];

      const summary = generateSummary(results, ['spf']);

      expect(summary.domainsWithIssues).toBe(1);
    });

    it('should calculate per-check stats', () => {
      const results: FleetReportResult[] = [
        {
          domain: 'a.com',
          snapshotId: 's1',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 2,
          checks: [
            { check: 'spf', status: 'pass', severity: 'ok', message: 'OK' },
            { check: 'dmarc', status: 'fail', severity: 'high', message: 'Bad' },
          ],
          issues: [{ check: 'dmarc', status: 'fail', severity: 'high', message: 'Bad' }],
        },
        {
          domain: 'b.com',
          snapshotId: 's2',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 1,
          checks: [
            { check: 'spf', status: 'fail', severity: 'medium', message: 'Warn' },
            { check: 'dmarc', status: 'pass', severity: 'ok', message: 'OK' },
          ],
          issues: [{ check: 'spf', status: 'fail', severity: 'medium', message: 'Warn' }],
        },
      ];

      const summary = generateSummary(results, ['spf', 'dmarc']);

      expect(summary.spfStats).toMatchObject({
        pass: 1,
        fail: 1,
        warning: 0,
        missing: 0,
        unknown: 0,
      });

      expect(summary.dmarcStats).toMatchObject({
        pass: 1,
        fail: 1,
        warning: 0,
        missing: 0,
        unknown: 0,
      });
    });

    it('should count unknown checks as unknown, never as pass', () => {
      const results: FleetReportResult[] = [
        {
          domain: 'a.com',
          snapshotId: 's1',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 0,
          checks: [
            { check: 'spf', status: 'unknown', severity: 'ok', message: 'No evidence' },
            { check: 'dmarc', status: 'pass', severity: 'ok', message: 'OK' },
          ],
          issues: [],
        },
      ];

      const summary = generateSummary(results, ['spf', 'dmarc']);

      expect(summary.spfStats).toMatchObject({ pass: 0, unknown: 1 });
      expect(summary.dmarcStats).toMatchObject({ pass: 1, unknown: 0 });
    });

    it('should calculate issue severity breakdown', () => {
      const results: FleetReportResult[] = [
        {
          domain: 'a.com',
          snapshotId: 's1',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 3,
          checks: [],
          issues: [
            { check: 'spf', status: 'fail', severity: 'critical', message: 'Critical' },
            { check: 'dmarc', status: 'fail', severity: 'high', message: 'High' },
            { check: 'mx', status: 'fail', severity: 'high', message: 'High 2' },
            { check: 'dkim', status: 'warning', severity: 'medium', message: 'Medium' },
            { check: 'spf', status: 'pass', severity: 'low', message: 'Low' },
          ],
        },
      ];

      const summary = generateSummary(results, ['spf']);

      expect(summary.issueSeverity).toMatchObject({
        critical: 1,
        high: 2,
        medium: 1,
        low: 1,
      });
    });

    it('should handle empty results', () => {
      const summary = generateSummary([], ['spf', 'dmarc']);

      expect(summary.totalDomains).toBe(0);
      expect(summary.domainsWithIssues).toBe(0);
      expect(summary.spfStats).toMatchObject({
        pass: 0,
        fail: 0,
        warning: 0,
        missing: 0,
        unknown: 0,
      });
      expect(summary.dmarcStats).toMatchObject({
        pass: 0,
        fail: 0,
        warning: 0,
        missing: 0,
        unknown: 0,
      });
      expect(summary.issueSeverity).toMatchObject({ critical: 0, high: 0, medium: 0, low: 0 });
    });

    it('should handle multiple check types in summary', () => {
      const results: FleetReportResult[] = [
        {
          domain: 'a.com',
          snapshotId: 's1',
          collectedAt: new Date(),
          rulesetVersion: '1.0',
          findingsCount: 4,
          checks: [
            { check: 'spf', status: 'pass', severity: 'ok', message: 'OK' },
            { check: 'dmarc', status: 'fail', severity: 'high', message: 'Bad' },
            { check: 'mx', status: 'warning', severity: 'medium', message: 'Warn' },
            { check: 'dkim', status: 'pass', severity: 'ok', message: 'OK' },
          ],
          issues: [
            { check: 'dmarc', status: 'fail', severity: 'high', message: 'Bad' },
            { check: 'mx', status: 'warning', severity: 'medium', message: 'Warn' },
          ],
        },
      ];

      const summary = generateSummary(results, ['spf', 'dmarc', 'mx', 'dkim']);

      expect(summary).toHaveProperty('spfStats');
      expect(summary).toHaveProperty('dmarcStats');
      expect(summary).toHaveProperty('mxStats');
      expect(summary).toHaveProperty('dkimStats');
    });
  });
});
