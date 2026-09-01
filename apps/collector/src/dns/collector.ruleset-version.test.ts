/**
 * Collector → findings.rulesetVersionId persistence (TB-3 prerequisite, step 0)
 *
 * Asserts that DNSCollector.evaluateAndPersistFindings threads the resolved
 * active ruleset version id onto every persisted finding. Required because
 * migration 0011 makes findings.ruleset_version_id NOT NULL: any insert site
 * that omits it now fails. The collector is the only insert site that used to
 * omit it; this test guards against regressions.
 *
 * Pattern mirrors collector.authoritative.test.ts: module mocks for the repos,
 * rules engine, resolver, delegation/mail/parsing; drive the public collect()
 * with discoverAuthoritativeServers + collectFromVantage spied, then inspect
 * the FindingRepository.createMany payload.
 */
import type { IDatabaseAdapter, NewFinding } from '@dns-ops/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DNSCollector } from './collector.js';
import type { CollectionConfig } from './types.js';

// Canned finding the mocked RulesEngine will emit. Includes every field the
// collector reads when mapping to NewFinding.
const CANNED_FINDING: NewFinding = {
  id: 'finding-seed-1',
  snapshotId: 'snapshot-1',
  type: 'dns-misconfig',
  title: 'Test finding',
  description: 'Canned finding for rulesetVersionId persistence assertion',
  severity: 'low',
  confidence: 'certain',
  riskPosture: 'low',
  blastRadius: 'single-domain',
  reviewOnly: false,
  evidence: [{ observationId: 'obs-1', description: 'evidence' }],
  ruleId: 'test-rule',
  ruleVersion: '1.0',
  rulesetVersionId: 'ruleset-1',
  createdAt: new Date(),
};

// The id the mocked RulesetVersionRepository.create returns. The collector
// resolves this (findByVersion → null, so it takes the create branch) and must
// stamp it onto every finding.
const RULESET_VERSION_ID = 'ruleset-1';

vi.mock('./resolver.js', () => ({
  DNSResolver: vi.fn().mockImplementation(function () {
    this.query = vi.fn();
  }),
}));

vi.mock('@dns-ops/db', () => ({
  DomainRepository: vi.fn().mockImplementation(function () {
    this.findByNameForTenant = vi.fn().mockResolvedValue(null);
    this.create = vi
      .fn()
      .mockResolvedValue({ id: 'domain-1', name: 'example.com', tenantId: 'tenant-1' });
    this.update = vi.fn().mockResolvedValue({ id: 'domain-1', name: 'example.com' });
  }),
  SnapshotRepository: vi.fn().mockImplementation(function () {
    this.create = vi.fn().mockResolvedValue({ id: 'snapshot-1' });
    this.updateRulesetVersion = vi.fn().mockResolvedValue(undefined);
    this.updateEvaluationCoverage = vi.fn().mockResolvedValue(undefined);
  }),
  ObservationRepository: vi.fn().mockImplementation(function () {
    this.createMany = vi.fn().mockResolvedValue([]);
  }),
  RecordSetRepository: vi.fn().mockImplementation(function () {
    this.createMany = vi.fn().mockResolvedValue([]);
  }),
  FindingRepository: vi.fn().mockImplementation(function () {
    this.createMany = vi.fn().mockResolvedValue([{ id: 'finding-1' }]);
  }),
  SuggestionRepository: vi.fn().mockImplementation(function () {
    this.createMany = vi.fn().mockResolvedValue(undefined);
  }),
  RulesetVersionRepository: vi.fn().mockImplementation(function () {
    this.findByVersion = vi.fn().mockResolvedValue(null);
    this.create = vi.fn().mockResolvedValue({ id: RULESET_VERSION_ID });
  }),
}));

vi.mock('@dns-ops/rules', () => ({
  RulesEngine: vi.fn().mockImplementation(function () {
    this.evaluate = vi.fn().mockReturnValue({
      findings: [CANNED_FINDING],
      suggestions: [],
      errors: [],
      complete: true,
    });
  }),
  authoritativeFailureRule: {
    id: 'auth-failure',
    name: 'Auth Failure',
    version: '1.0',
    enabled: true,
  },
  authoritativeMismatchRule: {
    id: 'auth-mismatch',
    name: 'Auth Mismatch',
    version: '1.0',
    enabled: true,
  },
  bimiRule: { id: 'bimi', name: 'BIMI', version: '1.0', enabled: true },
  cnameCoexistenceRule: { id: 'cname', name: 'CNAME', version: '1.0', enabled: true },
  dkimRule: { id: 'dkim', name: 'DKIM', version: '1.0', enabled: true },
  dmarcRule: { id: 'dmarc', name: 'DMARC', version: '1.0', enabled: true },
  mtaStsRule: { id: 'mta-sts', name: 'MTA-STS', version: '1.0', enabled: true },
  mxPresenceRule: { id: 'mx', name: 'MX', version: '1.0', enabled: true },
  recursiveAuthoritativeMismatchRule: {
    id: 'rec-auth-mismatch',
    name: 'Recursive Auth Mismatch',
    version: '1.0',
    enabled: true,
  },
  spfRule: { id: 'spf', name: 'SPF', version: '1.0', enabled: true },
  tlsRptRule: { id: 'tls-rpt', name: 'TLS-RPT', version: '1.0', enabled: true },
  unmanagedZonePartialCoverageRule: {
    id: 'unmanaged',
    name: 'Unmanaged',
    version: '1.0',
    enabled: true,
  },
}));

vi.mock('../delegation/collector.js', () => ({
  DelegationCollector: vi.fn().mockImplementation(function () {
    this.collectDelegationSummary = vi.fn().mockResolvedValue(null);
  }),
}));

vi.mock('../mail/collector.js', () => ({
  generateMailQueries: vi.fn().mockResolvedValue({ queries: [] }),
}));

vi.mock('../middleware/error-tracking.js', () => ({
  getCollectorLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@dns-ops/parsing', () => ({
  MAX_DNS_CNAME_HOPS: 5,
  observationsToRecordSets: vi.fn().mockReturnValue([]),
  tryNormalizeDNSOwner: (name: string) => ({
    original: name,
    normalized: name.toLowerCase().replace(/\.$/, ''),
  }),
}));

describe('TB-3 step 0: collector persists rulesetVersionId on findings', () => {
  let mockDb: IDatabaseAdapter;
  let baseConfig: CollectionConfig;

  beforeEach(() => {
    mockDb = {} as IDatabaseAdapter;
    baseConfig = {
      domain: 'example.com',
      tenantId: 'tenant-1',
      triggeredBy: 'test',
      zoneManagement: 'managed',
      recordTypes: ['A', 'AAAA', 'NS'],
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stamps the resolved ruleset version id onto every persisted finding', async () => {
    const collector = new DNSCollector(baseConfig, mockDb);

    // Drive collection: one authoritative vantage returning one answer. This is
    // the proven path from collector.authoritative.test.ts to reach
    // evaluateAndPersistFindings inside storeResults.
    vi.spyOn(
      collector as unknown as { discoverAuthoritativeServers: () => Promise<string[]> },
      'discoverAuthoritativeServers'
    ).mockResolvedValue(['ns1.example.com']);
    vi.spyOn(
      collector as unknown as {
        collectFromVantage: (
          queries: unknown[],
          vantage: { type: string; identifier: string }
        ) => Promise<unknown[]>;
      },
      'collectFromVantage'
    ).mockResolvedValue([
      {
        query: { name: 'example.com', type: 'A' },
        vantage: { type: 'authoritative', identifier: 'ns1.example.com' },
        success: true,
        answers: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        authority: [],
        additional: [],
        responseTime: 50,
        responseCode: 0,
      },
    ]);

    await collector.collect();

    // Recover the FindingRepository instance the collector constructed and
    // inspect the createMany payload.
    const { FindingRepository } = await import('@dns-ops/db');
    const instances = vi.mocked(FindingRepository).mock.instances;
    expect(instances.length).toBeGreaterThan(0);
    const findingRepo = instances[instances.length - 1] as { createMany: ReturnType<typeof vi.fn> };
    expect(findingRepo.createMany).toHaveBeenCalledTimes(1);

    const inserted = findingRepo.createMany.mock.calls[0]?.[0] as NewFinding[];
    expect(inserted).toBeDefined();
    expect(inserted.length).toBeGreaterThan(0);
    // Every persisted finding carries the resolved, non-null ruleset version id.
    for (const f of inserted) {
      expect(f.rulesetVersionId).toBe(RULESET_VERSION_ID);
      expect(f.rulesetVersionId).not.toBeNull();
    }
  });

  it('FIX-01: persists partial evaluation coverage when a rule is UNKNOWN', async () => {
    const { RulesEngine } = await import('@dns-ops/rules');
    vi.mocked(RulesEngine).mockImplementationOnce(function () {
      this.evaluate = vi.fn().mockReturnValue({
        findings: [],
        suggestions: [],
        complete: false,
        errors: [
          {
            code: 'RULE_EXECUTION_FAILED',
            ruleId: 'test.throwing-rule',
            message: 'Rule test.throwing-rule could not be evaluated',
            status: 'UNKNOWN',
            unknown: {
              reason: 'CHECK_EVALUATION_FAILED',
              explanation: 'The check failed before it produced a trustworthy result.',
              action: 'RUN_FRESH_SCAN',
              actionLabel: 'Run a fresh scan',
              blocking: true,
            },
          },
        ],
      });
    } as unknown as typeof RulesEngine);

    const collector = new DNSCollector(baseConfig, mockDb);
    vi.spyOn(
      collector as unknown as { discoverAuthoritativeServers: () => Promise<string[]> },
      'discoverAuthoritativeServers'
    ).mockResolvedValue([]);
    vi.spyOn(
      collector as unknown as {
        collectFromVantage: (
          queries: unknown[],
          vantage: { type: string; identifier: string }
        ) => Promise<unknown[]>;
      },
      'collectFromVantage'
    ).mockResolvedValue([
      {
        query: { name: 'example.com', type: 'A' },
        vantage: { type: 'public-recursive', identifier: '8.8.8.8' },
        success: true,
        answers: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
        authority: [],
        additional: [],
        responseTime: 50,
        responseCode: 0,
      },
    ]);

    const collectionResult = await collector.collect();

    expect(collectionResult.resultState).toBe('partial');

    const { SnapshotRepository, FindingRepository } = await import('@dns-ops/db');
    const snapshotInstances = vi.mocked(SnapshotRepository).mock.instances;
    const snapshotRepo = snapshotInstances[snapshotInstances.length - 1] as {
      updateEvaluationCoverage: ReturnType<typeof vi.fn>;
    };
    expect(snapshotRepo.updateEvaluationCoverage).toHaveBeenCalledWith(
      'snapshot-1',
      expect.objectContaining({
        state: 'PARTIAL',
        errors: [expect.objectContaining({ ruleId: 'test.throwing-rule', status: 'UNKNOWN' })],
      })
    );

    const findingInstances = vi.mocked(FindingRepository).mock.instances;
    const findingRepo = findingInstances[findingInstances.length - 1] as {
      createMany: ReturnType<typeof vi.fn>;
    };
    expect(findingRepo.createMany).not.toHaveBeenCalled();
  });
});
