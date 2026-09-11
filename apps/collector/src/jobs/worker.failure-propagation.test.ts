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

vi.mock('../probes/domain-evidence.js', () => ({
  collectAndPersistDomainEvidence: vi.fn().mockResolvedValue(undefined),
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

import { DomainRepository, MonitoredDomainRepository } from '@dns-ops/db';
import type { Job } from 'bullmq';
import { DNSCollector } from '../dns/collector.js';
import { finalizePersistedCanonicalConditions } from './operational-condition-finalizer.js';
import {
  type CollectDomainJobData,
  getCollectionQueue,
  type MonitoringRefreshJobData,
} from './queue.js';
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

describe('canonical finalization failures are operational failures', () => {
  it('throws collect-domain finalization failures instead of returning success', async () => {
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible for `new DomainRepository()`
    mockedDomainRepo.mockImplementation(function () {
      return {
        findByNameForTenant: async () => ({
          id: 'domain-1',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible for `new DNSCollector()`
    mockedCollector.mockImplementation(function () {
      return { collect: vi.fn().mockResolvedValue({ snapshotId: 'snap-final' }) };
    } as never);
    vi.mocked(finalizePersistedCanonicalConditions).mockRejectedValueOnce(
      new Error('canonical finalization failed')
    );

    const job = createMockJob<CollectDomainJobData>('job-finalization-1', validCollectData());
    await expect(processCollectDomain(job)).rejects.toThrow('canonical finalization failed');
  });

  it('throws monitoring-refresh finalization failures instead of returning success', async () => {
    const { MonitoredDomainRepository, DomainRepository: DomainRepo } = await import('@dns-ops/db');
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return {
        findById: async () => ({
          id: 'm1',
          tenantId: 't1',
          domainId: 'd1',
          isActive: true,
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(DomainRepo).mockImplementation(function () {
      return {
        findById: async () => ({
          id: 'd1',
          tenantId: 't1',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible for `new DNSCollector()`
    mockedCollector.mockImplementation(function () {
      return {
        collect: vi.fn().mockResolvedValue({ snapshotId: 'snap-monitor', resultState: 'complete' }),
      };
    } as never);
    vi.mocked(finalizePersistedCanonicalConditions).mockRejectedValueOnce(
      new Error('canonical finalization failed')
    );

    const job = createMockJob<MonitoringRefreshJobData>('job-finalization-2', {
      monitoredDomainId: 'm1',
      domainId: 'd1',
      domainName: 'example.com',
      schedule: 'daily',
      tenantId: 't1',
    });
    await expect(processMonitoringRefresh(job)).rejects.toThrow('canonical finalization failed');
  });

  it('throws and does not stamp lastCheckAt when monitoring-refresh resultState is partial', async () => {
    const updateLastCheck = vi.fn();
    const { MonitoredDomainRepository, DomainRepository: DomainRepo } = await import('@dns-ops/db');
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return {
        findById: async () => ({ id: 'm1', tenantId: 't1', domainId: 'd1' }),
        updateLastCheck,
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(DomainRepo).mockImplementation(function () {
      return {
        findById: async () => ({
          id: 'd1',
          tenantId: 't1',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedCollector.mockImplementation(function () {
      return {
        collect: vi.fn().mockResolvedValue({ snapshotId: 'snap-partial', resultState: 'partial' }),
      };
    } as never);

    const job = createMockJob<MonitoringRefreshJobData>('job-refresh-partial', {
      monitoredDomainId: 'm1',
      domainId: 'd1',
      domainName: 'example.com',
      schedule: 'daily',
      tenantId: 't1',
    });
    await expect(processMonitoringRefresh(job)).rejects.toThrow('resultState is partial');
    expect(updateLastCheck).not.toHaveBeenCalled();
  });

  it('stamps lastCheckAt after complete monitoring-refresh finalization', async () => {
    const updateLastCheck = vi.fn();
    const { MonitoredDomainRepository, DomainRepository: DomainRepo } = await import('@dns-ops/db');
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return {
        findById: async () => ({ id: 'm1', tenantId: 't1', domainId: 'd1', isActive: true }),
        updateLastCheck,
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(DomainRepo).mockImplementation(function () {
      return {
        findById: async () => ({
          id: 'd1',
          tenantId: 't1',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedCollector.mockImplementation(function () {
      return {
        collect: vi.fn().mockResolvedValue({ snapshotId: 'snap-ok', resultState: 'complete' }),
      };
    } as never);

    const job = createMockJob<MonitoringRefreshJobData>('job-refresh-complete', {
      monitoredDomainId: 'm1',
      domainId: 'd1',
      domainName: 'example.com',
      schedule: 'daily',
      tenantId: 't1',
    });
    await expect(processMonitoringRefresh(job)).resolves.toMatchObject({
      success: true,
      snapshotId: 'snap-ok',
    });
    expect(updateLastCheck).toHaveBeenCalledWith('m1', 't1');
  });

  it('does not stamp lastCheckAt when the monitor is disabled after queueing', async () => {
    const updateLastCheck = vi.fn();
    const { MonitoredDomainRepository, DomainRepository: DomainRepo } = await import('@dns-ops/db');
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return {
        findById: async () => ({ id: 'm1', tenantId: 't1', domainId: 'd1', isActive: false }),
        updateLastCheck,
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(DomainRepo).mockImplementation(function () {
      return {
        findById: async () => ({
          id: 'd1',
          tenantId: 't1',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedCollector.mockImplementation(function () {
      return {
        collect: vi
          .fn()
          .mockResolvedValue({ snapshotId: 'snap-disabled', resultState: 'complete' }),
      };
    } as never);

    const job = createMockJob<MonitoringRefreshJobData>('job-refresh-disabled', {
      monitoredDomainId: 'm1',
      domainId: 'd1',
      domainName: 'example.com',
      schedule: 'daily',
      tenantId: 't1',
    });
    await expect(processMonitoringRefresh(job)).resolves.toMatchObject({
      success: true,
      snapshotId: 'snap-disabled',
    });
    expect(updateLastCheck).not.toHaveBeenCalled();
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

  it('skips scheduled refresh when monitored tenant does not match domain tenant', async () => {
    const add = vi.fn();
    vi.mocked(getCollectionQueue).mockReturnValueOnce({ add } as never);
    const { MonitoredDomainRepository, DomainRepository: DomainRepo } = await import('@dns-ops/db');
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return {
        findActiveBySchedule: async () => [
          {
            id: 'm1',
            tenantId: 'tenant-a',
            domainId: 'd1',
            isActive: true,
            lastCheckAt: null,
          },
        ],
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(DomainRepo).mockImplementation(function () {
      return {
        findById: async () => ({
          id: 'd1',
          tenantId: 'tenant-b',
          name: 'secret.example',
          normalizedName: 'secret.example',
        }),
      };
    } as never);

    const job = createMockJob<MonitoringRefreshJobData>('job-scheduled-mismatch', {
      monitoredDomainId: 'scheduled',
      domainId: 'scheduled',
      domainName: 'scheduled',
      schedule: 'daily',
      tenantId: 'system',
    });
    const queued = await processMonitoringRefresh(job);
    expect(queued.success).toBe(true);
    expect(queued.queued).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it('queues monitoredDomainId and skips due refresh after successful collection+finalization', async () => {
    const updateLastCheck = vi.fn();
    let lastCheckAt: Date | null = null;
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return {
        findActiveBySchedule: async () => [
          {
            id: 'm1',
            tenantId: 'tenant-a',
            domainId: 'd1',
            isActive: true,
            lastCheckAt,
          },
        ],
        findById: async () => ({
          id: 'm1',
          tenantId: 'tenant-a',
          domainId: 'd1',
          isActive: true,
        }),
        findByDomainId: async () => ({ id: 'm1', tenantId: 'tenant-a' }),
        updateLastCheck: async (id: string, tenantId?: string) => {
          updateLastCheck(id, tenantId);
          lastCheckAt = new Date();
        },
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedDomainRepo.mockImplementation(function () {
      return {
        findByNameForTenant: async () => ({
          id: 'd1',
          tenantId: 'tenant-a',
          name: 'example.com',
          normalizedName: 'example.com',
        }),
        findById: async () => ({
          id: 'd1',
          tenantId: 'tenant-a',
          name: 'example.com',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedCollector.mockImplementation(function () {
      return {
        collect: vi.fn().mockResolvedValue({ snapshotId: 'snap-due', resultState: 'complete' }),
      };
    } as never);
    const add = vi.fn();
    vi.mocked(getCollectionQueue).mockReturnValue({ add } as never);

    const scheduled = createMockJob<MonitoringRefreshJobData>('job-due-1', {
      monitoredDomainId: 'scheduled',
      domainId: 'scheduled',
      domainName: 'scheduled',
      schedule: 'daily',
      tenantId: 'system',
    });
    await expect(processMonitoringRefresh(scheduled)).resolves.toMatchObject({
      success: true,
      queued: 1,
    });
    expect(add).toHaveBeenCalledWith(
      'collect-example.com',
      expect.objectContaining({
        tenantId: 'tenant-a',
        domain: 'example.com',
        monitoredDomainId: 'm1',
      }),
      expect.any(Object)
    );

    const collectJob = createMockJob<CollectDomainJobData>(
      'job-due-collect',
      add.mock.calls[0]?.[1]
    );
    await expect(processCollectDomain(collectJob)).resolves.toMatchObject({
      success: true,
      snapshotId: 'snap-due',
    });
    expect(updateLastCheck).toHaveBeenCalledWith('m1', 'tenant-a');

    add.mockClear();
    await expect(processMonitoringRefresh(scheduled)).resolves.toMatchObject({
      success: true,
      queued: 0,
    });
    expect(add).not.toHaveBeenCalled();
  });

  it('does not update lastCheckAt when canonical finalization fails', async () => {
    const updateLastCheck = vi.fn();
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return { updateLastCheck };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedDomainRepo.mockImplementation(function () {
      return {
        findByNameForTenant: async () => ({
          id: 'd1',
          tenantId: 'tenant-a',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedCollector.mockImplementation(function () {
      return {
        collect: vi.fn().mockResolvedValue({ snapshotId: 'snap-fail', resultState: 'complete' }),
      };
    } as never);
    vi.mocked(finalizePersistedCanonicalConditions).mockRejectedValueOnce(
      new Error('canonical finalization failed')
    );

    const job = createMockJob<CollectDomainJobData>('job-due-fail', {
      ...validCollectData(),
      monitoredDomainId: 'm1',
    });
    await expect(processCollectDomain(job)).rejects.toThrow('canonical finalization failed');
    expect(updateLastCheck).not.toHaveBeenCalled();
  });

  it('does not update lastCheckAt when collection resultState is partial', async () => {
    const updateLastCheck = vi.fn();
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return { updateLastCheck };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedDomainRepo.mockImplementation(function () {
      return {
        findByNameForTenant: async () => ({
          id: 'd1',
          tenantId: 'tenant-a',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedCollector.mockImplementation(function () {
      return {
        collect: vi.fn().mockResolvedValue({ snapshotId: 'snap-partial', resultState: 'partial' }),
      };
    } as never);

    const job = createMockJob<CollectDomainJobData>('job-due-partial', {
      ...validCollectData(),
      monitoredDomainId: 'm1',
    });
    await expect(processCollectDomain(job)).rejects.toThrow('resultState is partial');
    expect(updateLastCheck).not.toHaveBeenCalled();
  });

  it('does not stamp lastCheckAt when collect-domain monitor is disabled after queueing', async () => {
    const updateLastCheck = vi.fn();
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(MonitoredDomainRepository).mockImplementation(function () {
      return {
        findById: async () => ({ id: 'm1', tenantId: 't1', domainId: 'd1', isActive: false }),
        findByDomainId: async () => ({ id: 'm1', tenantId: 't1', isActive: false }),
        updateLastCheck,
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedDomainRepo.mockImplementation(function () {
      return {
        findByNameForTenant: async () => ({
          id: 'd1',
          tenantId: 't1',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    mockedCollector.mockImplementation(function () {
      return {
        collect: vi
          .fn()
          .mockResolvedValue({ snapshotId: 'snap-disabled', resultState: 'complete' }),
      };
    } as never);

    const job = createMockJob<CollectDomainJobData>('job-collect-disabled', {
      ...validCollectData(),
      monitoredDomainId: 'm1',
    });
    await expect(processCollectDomain(job)).resolves.toMatchObject({
      success: true,
      snapshotId: 'snap-disabled',
    });
    expect(updateLastCheck).not.toHaveBeenCalled();
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
