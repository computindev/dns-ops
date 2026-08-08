/**
 * Job Worker Processor Tests - Bead 19
 *
 * Tests for the exported processor functions:
 * - processCollectDomain
 * - processMonitoringRefresh
 * - processFleetReport
 *
 * NOTE: These tests are intentionally minimal because the processor functions
 * depend on many external services (DB, DNS, BullMQ) that require complex mocking.
 * The main integration tests are in monitoring.integration.test.ts and other e2e tests.
 */

import { describe, expect, it, vi } from 'vitest';

// Set up environment
global.process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// Mock all dependencies
vi.mock('@dns-ops/db', () => ({
  createPostgresAdapter: vi.fn().mockReturnValue({}),
  DomainRepository: vi.fn(),
  FindingRepository: vi.fn(),
  FleetReportRepository: vi.fn(),
  MonitoredDomainRepository: vi.fn(),
  SnapshotRepository: vi.fn(),
}));

vi.mock('../dns/collector.js', () => ({
  DNSCollector: vi.fn(),
}));

vi.mock('../middleware/error-tracking.js', () => ({
  getCollectorLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
  trackJobStart: vi.fn(),
  trackJobComplete: vi.fn(),
  trackJobError: vi.fn(),
}));

vi.mock('./alert-from-findings.js', () => ({
  generateAndSendFindingAlerts: vi.fn().mockResolvedValue({ alerts: [], webhookSent: false }),
}));

vi.mock('./operational-condition-finalizer.js', () => ({
  finalizePersistedCanonicalConditions: vi.fn().mockResolvedValue({ outcomes: [] }),
}));

vi.mock('./queue.js', () => ({
  getRedisConnection: vi.fn().mockReturnValue({}),
  scheduleMonitoringJob: vi.fn().mockResolvedValue('job-123'),
  getCollectionQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: 'queued-job-123' }),
  }),
  QUEUE_NAMES: {
    COLLECTION: 'dns-ops-collection',
    MONITORING: 'dns-ops-monitoring',
    REPORTS: 'dns-ops-reports',
  },
}));

// Import after mocks
import type { Job } from 'bullmq';
import type {
  CollectDomainJobData,
  FleetReportJobData,
  MonitoringRefreshJobData,
} from './queue.js';
import { processCollectDomain, processFleetReport, processMonitoringRefresh } from './worker.js';

// Helper to create mock jobs with proper typing
function createMockJob<T>(id: string, data: T): Job<T> {
  return {
    id,
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
    attemptsMade: 0,
    processedOn: Date.now(),
    finishedOn: null,
  } as unknown as Job<T>;
}

describe('Job Worker Processors - Bead 19', () => {
  describe('processCollectDomain', () => {
    it('should be exported as a function', () => {
      expect(typeof processCollectDomain).toBe('function');
    });

    it('should return error when DATABASE_URL not set', async () => {
      const originalEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      const job = createMockJob<CollectDomainJobData>('job-1', {
        tenantId: 't1',
        domain: 'example.com',
        triggeredBy: 'user',
      });

      const result = await processCollectDomain(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('DATABASE_URL');

      process.env.DATABASE_URL = originalEnv;
    });
  });

  describe('processMonitoringRefresh', () => {
    it('should be exported as a function', () => {
      expect(typeof processMonitoringRefresh).toBe('function');
    });

    it('should return error when DATABASE_URL not set', async () => {
      const originalEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      const job = createMockJob<MonitoringRefreshJobData>('job-2', {
        monitoredDomainId: 'm1',
        domainId: 'd1',
        domainName: 'example.com',
        schedule: 'daily',
        tenantId: 't1',
      });

      const result = await processMonitoringRefresh(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('DATABASE_URL');

      process.env.DATABASE_URL = originalEnv;
    });
  });

  describe('processFleetReport', () => {
    it('should be exported as a function', () => {
      expect(typeof processFleetReport).toBe('function');
    });

    it('should return error when DATABASE_URL not set', async () => {
      const originalEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      const job = createMockJob<FleetReportJobData>('job-3', {
        inventory: ['example.com'],
        checks: ['spf'],
        format: 'detailed',
        triggeredBy: 'user',
        tenantId: 't1',
      });

      const result = await processFleetReport(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('DATABASE_URL');

      process.env.DATABASE_URL = originalEnv;
    });
  });
});
