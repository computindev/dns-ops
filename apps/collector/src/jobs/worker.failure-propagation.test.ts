/**
 * Issue #68 — Propagate BullMQ processor failures into retries and failed jobs.
 *
 * Proves:
 * - Unexpected (retryable) processor failures throw, so BullMQ's retry policy runs.
 * - A later successful attempt completes normally.
 * - Explicit terminal validation outcomes throw UnrecoverableError (no retry).
 * - Worker failure classification/metrics distinguish retrying vs failed.
 */

import { UnrecoverableError } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

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
  getCollectionQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: 'queued-job-123' }),
  }),
  QUEUE_NAMES: {
    COLLECTION: 'dns-ops-collection',
    MONITORING: 'dns-ops-monitoring',
    REPORTS: 'dns-ops-reports',
  },
}));

import { DomainRepository } from '@dns-ops/db';
import type { Job } from 'bullmq';
import { DNSCollector } from '../dns/collector.js';
import type { CollectDomainJobData, MonitoringRefreshJobData } from './queue.js';
import {
  classifyWorkerFailure,
  processCollectDomain,
  processMonitoringRefresh,
  recordWorkerFailure,
} from './worker.js';

const mockedCollector = vi.mocked(DNSCollector);
const mockedDomainRepo = vi.mocked(DomainRepository);

function createMockJob<T>(id: string, data: T, attempts = 3): Job<T> {
  return {
    id,
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
    attemptsMade: 0,
    opts: { attempts },
    processedOn: Date.now(),
    finishedOn: null,
  } as unknown as Job<T>;
}

function validCollectData(): CollectDomainJobData {
  return { tenantId: 't1', domain: 'example.com', triggeredBy: 'user' };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Issue #68: retryable failures reach BullMQ retries', () => {
  it('throws unexpected processor failures instead of returning success:false', async () => {
    // DomainRepository instances return no domain so only collector.collect runs.
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible for `new DomainRepository()`
    mockedDomainRepo.mockImplementation(function () {
      return { findByNameForTenant: async () => undefined };
    } as never);
    const collect = vi.fn().mockRejectedValue(new Error('resolver ECONNREFUSED'));
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible for `new DNSCollector()`
    mockedCollector.mockImplementation(function () {
      return { collect };
    } as never);

    const job = createMockJob<CollectDomainJobData>('job-retry-1', validCollectData());

    // Before the fix this resolved to { success: false } and BullMQ marked it completed.
    await expect(processCollectDomain(job)).rejects.toThrow('resolver ECONNREFUSED');
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('completes normally when a later attempt succeeds', async () => {
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible for `new DomainRepository()`
    mockedDomainRepo.mockImplementation(function () {
      return { findByNameForTenant: async () => undefined };
    } as never);
    // First attempt fails, second attempt (BullMQ retry) succeeds.
    const collect = vi
      .fn<() => Promise<{ snapshotId: string }>>()
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValue({ snapshotId: 'snap-42' });
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible for `new DNSCollector()`
    mockedCollector.mockImplementation(function () {
      return { collect };
    } as never);

    const job = createMockJob<CollectDomainJobData>('job-retry-2', validCollectData());

    await expect(processCollectDomain(job)).rejects.toThrow('transient failure');

    const retryJob = createMockJob<CollectDomainJobData>('job-retry-2', validCollectData());
    const result = await processCollectDomain(retryJob);

    expect(result.success).toBe(true);
    expect(result.snapshotId).toBe('snap-42');
    expect(collect).toHaveBeenCalledTimes(2);
  });
});

describe('Issue #68: terminal validation outcomes do not retry', () => {
  it('throws UnrecoverableError for invalid collect-domain job data', async () => {
    const job = createMockJob<CollectDomainJobData>('job-terminal-1', {
      tenantId: 't1',
      domain: 'not a domain',
      triggeredBy: 'user',
    });

    const error = await processCollectDomain(job).then(
      () => undefined,
      (e: unknown) => e as Error
    );

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error?.name).toBe('UnrecoverableError');
  });

  it('classifies UnrecoverableError as failed even before attempts are exhausted', () => {
    const job = createMockJob<CollectDomainJobData>('job-terminal-2', validCollectData());
    (job as { attemptsMade: number }).attemptsMade = 1;

    expect(classifyWorkerFailure(job, new UnrecoverableError('nope'))).toBe('failed');
  });

  it('keeps the scheduled monitoring placeholder valid (batch fan-out path)', async () => {
    const { MonitoredDomainRepository } = await import('@dns-ops/db');
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible for `new MonitoredDomainRepository()`
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return { findActiveBySchedule: async () => [] };
    } as never);

    const job = createMockJob<MonitoringRefreshJobData>('job-scheduled', {
      monitoredDomainId: 'scheduled',
      domainId: 'scheduled',
      domainName: 'scheduled',
      schedule: 'daily',
      tenantId: 'system',
    });

    const result = await processMonitoringRefresh(job);
    expect(result.success).toBe(true);
    expect(result.queued).toBe(0);
  });
});

describe('Issue #68: worker metrics distinguish retrying, failed, completed', () => {
  it('classifies a retryable failure with attempts left as retrying', () => {
    const job = createMockJob<CollectDomainJobData>('job-metrics-1', validCollectData());
    (job as { attemptsMade: number }).attemptsMade = 1; // first failure of attempts=3

    expect(classifyWorkerFailure(job, new Error('transient'))).toBe('retrying');
  });

  it('classifies an exhausted retryable failure as failed', () => {
    const job = createMockJob<CollectDomainJobData>('job-metrics-2', validCollectData());
    (job as { attemptsMade: number }).attemptsMade = 3; // final failed attempt

    expect(classifyWorkerFailure(job, new Error('still failing'))).toBe('failed');
  });

  it('emits retried metric (not failed) while attempts remain', () => {
    const job = createMockJob<CollectDomainJobData>('job-metrics-3', validCollectData());
    (job as { attemptsMade: number }).attemptsMade = 1;
    const jobMetrics = { failed: vi.fn(), retried: vi.fn() };

    const outcome = recordWorkerFailure({
      label: 'Collection',
      jobType: 'collect-domain',
      queue: 'dns-ops-collection',
      job,
      error: new Error('transient'),
      jobMetrics,
    });

    expect(outcome).toBe('retrying');
    expect(jobMetrics.retried).toHaveBeenCalledTimes(1);
    expect(jobMetrics.retried).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: 'collect-domain', attempt: 1 })
    );
    expect(jobMetrics.failed).not.toHaveBeenCalled();
  });

  it('emits failed metric (not retried) when retries are exhausted or terminal', () => {
    const job = createMockJob<CollectDomainJobData>('job-metrics-4', validCollectData());
    (job as { attemptsMade: number }).attemptsMade = 3;
    const jobMetrics = { failed: vi.fn(), retried: vi.fn() };

    const outcome = recordWorkerFailure({
      label: 'Collection',
      jobType: 'collect-domain',
      queue: 'dns-ops-collection',
      job,
      error: new Error('exhausted'),
      jobMetrics,
    });

    expect(outcome).toBe('failed');
    expect(jobMetrics.failed).toHaveBeenCalledTimes(1);
    expect(jobMetrics.failed).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: 'collect-domain', attempt: 3, error: 'exhausted' })
    );
    expect(jobMetrics.retried).not.toHaveBeenCalled();
  });
});
