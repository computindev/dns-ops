/**
 * Authoritative Collection Tests - PR-07.6
 *
 * Mock discoverAuthoritativeServers and collectFromVantage.
 * Verify observations have vantageType:authoritative with correct vantageIdentifier.
 * Verify one server timeout → partial (not failed).
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DNSCollector } from './collector.js';
import type { CollectionConfig, DNSQueryResult, VantageInfo } from './types.js';

// Mock dependencies
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
    this.update = vi
      .fn()
      .mockResolvedValue({ id: 'domain-1', name: 'example.com', tenantId: 'tenant-1' });
  }),
  SnapshotRepository: vi.fn().mockImplementation(function () {
    this.create = vi.fn().mockResolvedValue({ id: 'snapshot-1' });
    this.updateRulesetVersion = vi.fn().mockResolvedValue(undefined);
  }),
  ObservationRepository: vi.fn().mockImplementation(function () {
    this.createMany = vi.fn().mockResolvedValue([]);
  }),
  RecordSetRepository: vi.fn().mockImplementation(function () {
    this.createMany = vi.fn().mockResolvedValue([]);
  }),
  FindingRepository: vi.fn().mockImplementation(function () {
    this.createMany = vi.fn().mockResolvedValue([]);
  }),
  SuggestionRepository: vi.fn().mockImplementation(function () {
    this.createMany = vi.fn().mockResolvedValue(undefined);
  }),
  RulesetVersionRepository: vi.fn().mockImplementation(function () {
    this.findByVersion = vi.fn().mockResolvedValue(null);
    this.create = vi.fn().mockResolvedValue({ id: 'ruleset-1' });
  }),
}));

vi.mock('@dns-ops/rules', () => ({
  RulesEngine: vi.fn().mockImplementation(function () {
    this.evaluate = vi.fn().mockReturnValue({ findings: [], suggestions: [] });
  }),
  authoritativeFailureRule: {
    id: 'auth-failure',
    name: 'Authoritative Failure',
    version: '1.0',
    enabled: true,
  },
  authoritativeMismatchRule: {
    id: 'auth-mismatch',
    name: 'Authoritative Mismatch',
    version: '1.0',
    enabled: true,
  },
  bimiRule: { id: 'bimi', name: 'BIMI', version: '1.0', enabled: true },
  cnameCoexistenceRule: { id: 'cname', name: 'CNAME Coexistence', version: '1.0', enabled: true },
  dkimRule: { id: 'dkim', name: 'DKIM', version: '1.0', enabled: true },
  dmarcRule: { id: 'dmarc', name: 'DMARC', version: '1.0', enabled: true },
  mtaStsRule: { id: 'mta-sts', name: 'MTA-STS', version: '1.0', enabled: true },
  mxPresenceRule: { id: 'mx', name: 'MX Presence', version: '1.0', enabled: true },
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
    name: 'Unmanaged Zone',
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
  observationsToRecordSets: vi.fn().mockReturnValue([]),
}));

describe('PR-07.6: Authoritative Collection', () => {
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

  it('should collect from discovered authoritative servers with correct vantage info', async () => {
    const collector = new DNSCollector(baseConfig, mockDb);

    // Mock discoverAuthoritativeServers to return 2 fake NS IPs
    const mockNsServers = ['ns1.example.com', 'ns2.example.com'];
    vi.spyOn(
      collector as unknown as { discoverAuthoritativeServers: () => Promise<string[]> },
      'discoverAuthoritativeServers'
    ).mockResolvedValue(mockNsServers);

    // Track the vantages used in collectFromVantage
    const collectedVantages: VantageInfo[] = [];
    vi.spyOn(
      collector as unknown as {
        collectFromVantage: (queries: unknown[], vantage: VantageInfo) => Promise<DNSQueryResult[]>;
      },
      'collectFromVantage'
    ).mockImplementation(async (_queries, vantage) => {
      collectedVantages.push(vantage);
      return [
        {
          query: { name: 'example.com', type: 'A' },
          vantage: { type: vantage.type, identifier: vantage.identifier },
          success: true,
          answers: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
          authority: [],
          additional: [],
          responseTime: 50,
          responseCode: 0,
        },
      ];
    });

    await collector.collect();

    // Verify authoritative servers were queried
    const authoritativeVantages = collectedVantages.filter((v) => v.type === 'authoritative');
    expect(authoritativeVantages).toHaveLength(2);
    expect(authoritativeVantages[0]).toMatchObject({
      type: 'authoritative',
      identifier: 'ns1.example.com',
    });
    expect(authoritativeVantages[1]).toMatchObject({
      type: 'authoritative',
      identifier: 'ns2.example.com',
    });
  });

  it('should return partial result when one authoritative server times out', async () => {
    const collector = new DNSCollector(baseConfig, mockDb);

    vi.spyOn(
      collector as unknown as { discoverAuthoritativeServers: () => Promise<string[]> },
      'discoverAuthoritativeServers'
    ).mockResolvedValue(['ns1.example.com', 'ns2.example.com']);

    // Track errors that would be added
    const errors: Array<{ vantage: string; error: string }> = [];

    vi.spyOn(
      collector as unknown as {
        collectFromVantage: (
          queries: unknown[],
          vantage: VantageInfo,
          errs: typeof errors
        ) => Promise<DNSQueryResult[]>;
      },
      'collectFromVantage'
    ).mockImplementation(async (_queries, vantage, errs) => {
      if (vantage.identifier === 'ns1.example.com') {
        return [
          {
            query: { name: 'example.com', type: 'A' },
            vantage: { type: 'authoritative', identifier: vantage.identifier },
            success: true,
            answers: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
            authority: [],
            additional: [],
            responseTime: 50,
            responseCode: 0,
          },
        ];
      } else {
        // Simulate timeout error being tracked
        errs.push({
          queryName: 'example.com',
          queryType: 'A',
          vantage: vantage.identifier,
          error: 'Timeout after 5000ms',
        });
        return [
          {
            query: { name: 'example.com', type: 'A' },
            vantage: { type: 'authoritative', identifier: vantage.identifier },
            success: false,
            answers: [],
            authority: [],
            additional: [],
            responseTime: 5000,
            responseCode: null,
            error: 'Timeout after 5000ms',
          },
        ];
      }
    });

    const result = await collector.collect();

    // Should be partial, not failed
    expect(result.resultState).toBe('partial');
  });

  it('should not query authoritative servers for unmanaged zones', async () => {
    const unmanagedConfig: CollectionConfig = {
      ...baseConfig,
      zoneManagement: 'unmanaged',
    };
    const collector = new DNSCollector(unmanagedConfig, mockDb);

    const discoverSpy = vi
      .spyOn(
        collector as unknown as { discoverAuthoritativeServers: () => Promise<string[]> },
        'discoverAuthoritativeServers'
      )
      .mockResolvedValue(['ns1.example.com']);

    vi.spyOn(
      collector as unknown as { collectFromVantage: () => Promise<DNSQueryResult[]> },
      'collectFromVantage'
    ).mockImplementation(async () => [
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

    await collector.collect();

    expect(discoverSpy).not.toHaveBeenCalled();
  });
});
