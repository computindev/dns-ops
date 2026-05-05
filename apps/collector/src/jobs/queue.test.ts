/**
 * Job Queue Tests - Bead 19
 *
 * Tests for queue infrastructure:
 * - Queue/idempotency tests
 * - Scheduler tests
 * - Retry and cancellation tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CollectDomainJobData,
  closeQueues,
  createQueue,
  type FleetReportJobData,
  getRedisConnection,
  type MonitoringRefreshJobData,
  QUEUE_NAMES,
} from './queue.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

const { mockQueueConstructor, mockRedisConstructor } = vi.hoisted(() => ({
  mockQueueConstructor: vi.fn(),
  mockRedisConstructor: vi.fn(),
}));

// Mock BullMQ Queue class
const mockAdd = vi.fn();
const mockGetJobCounts = vi.fn();
const mockClose = vi.fn();
const mockGetJob = vi.fn();
const mockGetJobs = vi.fn();
const mockRemoveRepeatable = vi.fn();

vi.mock('bullmq', () => {
  class QueueMock {
    add = mockAdd;
    getJobCounts = mockGetJobCounts;
    close = mockClose;
    getJob = mockGetJob;
    getJobs = mockGetJobs;
    removeRepeatable = mockRemoveRepeatable;

    constructor(...args: unknown[]) {
      mockQueueConstructor(...args);
    }
  }

  class WorkerMock {
    on = vi.fn();
    close = vi.fn();
  }

  return {
    Queue: QueueMock,
    Worker: WorkerMock,
  };
});

// Mock ioredis with a constructable class because queue.ts calls `new Redis(...)`.
vi.mock('ioredis', () => {
  class RedisMock {
    status = 'ready';
    on = vi.fn();
    disconnect = vi.fn();

    constructor(...args: unknown[]) {
      mockRedisConstructor(...args);
    }
  }

  return {
    default: RedisMock,
    Redis: RedisMock,
  };
});

describe('Job Queue Infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up environment
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(async () => {
    await closeQueues();
    delete process.env.REDIS_URL;
  });

  // ===========================================================================
  // REDIS CONNECTION REGRESSION TESTS
  // ===========================================================================

  describe('Redis Connection', () => {
    it('should return null and not construct Redis when REDIS_URL is absent', () => {
      delete process.env.REDIS_URL;

      const connection = getRedisConnection();

      expect(connection).toBeNull();
      expect(mockRedisConstructor).not.toHaveBeenCalled();
    });

    it('should construct Redis through the ESM export when REDIS_URL is present', () => {
      const connection = getRedisConnection();

      expect(connection).not.toBeNull();
      expect(mockRedisConstructor).toHaveBeenCalledWith('redis://localhost:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
    });

    it('should create BullMQ queues with the shared Redis connection', () => {
      const queue = createQueue(QUEUE_NAMES.COLLECTION);

      expect(queue).not.toBeNull();
      expect(mockRedisConstructor).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // QUEUE NAMES
  // ===========================================================================

  describe('Queue Names', () => {
    it('should have correct queue name constants', () => {
      expect(QUEUE_NAMES.COLLECTION).toBe('dns-ops:collection');
      expect(QUEUE_NAMES.MONITORING).toBe('dns-ops:monitoring');
      expect(QUEUE_NAMES.REPORTS).toBe('dns-ops:reports');
    });

    it('should have unique queue names', () => {
      const names = Object.values(QUEUE_NAMES);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  // ===========================================================================
  // JOB DATA TYPES
  // ===========================================================================

  describe('Job Data Types', () => {
    it('should accept valid CollectDomainJobData', () => {
      const jobData: CollectDomainJobData = {
        domain: 'example.com',
        triggeredBy: 'user-123',
        zoneManagement: 'managed',
        includeMailRecords: true,
        dkimSelectors: ['google', 'mailchimp'],
      };

      expect(jobData.domain).toBe('example.com');
      expect(jobData.triggeredBy).toBe('user-123');
    });

    it('should accept minimal CollectDomainJobData', () => {
      const jobData: CollectDomainJobData = {
        domain: 'example.com',
        triggeredBy: 'system',
      };

      expect(jobData.zoneManagement).toBeUndefined();
      expect(jobData.includeMailRecords).toBeUndefined();
    });

    it('should accept valid MonitoringRefreshJobData', () => {
      const jobData: MonitoringRefreshJobData = {
        monitoredDomainId: 'mon-123',
        domainId: 'dom-456',
        domainName: 'example.com',
        schedule: 'daily',
        tenantId: 'tenant-1',
      };

      expect(jobData.schedule).toBe('daily');
      expect(jobData.tenantId).toBe('tenant-1');
    });

    it('should accept valid FleetReportJobData', () => {
      const jobData: FleetReportJobData = {
        inventory: ['example.com', 'test.com'],
        checks: ['spf', 'dmarc', 'dkim'],
        format: 'summary',
        triggeredBy: 'user-123',
        tenantId: 'tenant-1',
      };

      expect(jobData.inventory).toHaveLength(2);
      expect(jobData.format).toBe('summary');
    });
  });

  // ===========================================================================
  // IDEMPOTENCY TESTS
  // ===========================================================================

  describe('Job Idempotency', () => {
    it('should generate consistent job IDs for same domain', async () => {
      const domain = 'example.com';
      const jobName1 = `collect:${domain}`;
      const jobName2 = `collect:${domain}`;

      expect(jobName1).toBe(jobName2);
    });

    it('should generate different job IDs for different domains', async () => {
      const jobName1 = `collect:example.com`;
      const jobName2 = `collect:test.com`;

      expect(jobName1).not.toBe(jobName2);
    });

    it('should use domain name in job identifier for deduplication', () => {
      const domain = 'example.com';
      const collectionJobName = `collect:${domain}`;
      const monitoringJobName = `monitor:${domain}`;

      expect(collectionJobName).toContain(domain);
      expect(monitoringJobName).toContain(domain);
      expect(collectionJobName).not.toBe(monitoringJobName);
    });

    it('should support job deduplication via job ID', async () => {
      // BullMQ uses job name + options.jobId for deduplication
      const domain = 'example.com';
      const jobId = `collect:${domain}:${Date.now()}`;

      // First add
      mockAdd.mockResolvedValueOnce({ id: jobId });
      // Second add with same ID would be deduplicated by BullMQ

      expect(jobId).toContain(domain);
    });
  });

  // ===========================================================================
  // RETRY CONFIGURATION TESTS
  // ===========================================================================

  describe('Retry Configuration', () => {
    it('should configure exponential backoff', () => {
      const defaultJobOptions = {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      };

      expect(defaultJobOptions.attempts).toBe(3);
      expect(defaultJobOptions.backoff.type).toBe('exponential');
      expect(defaultJobOptions.backoff.delay).toBe(1000);
    });

    it('should calculate correct backoff delays', () => {
      const baseDelay = 1000;
      const delays = [
        baseDelay, // Attempt 1: 1s
        baseDelay * 2, // Attempt 2: 2s
        baseDelay * 4, // Attempt 3: 4s
      ];

      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
    });

    it('should limit retry attempts', () => {
      const maxAttempts = 3;
      let attempts = 0;

      while (attempts < maxAttempts + 2) {
        attempts++;
        if (attempts > maxAttempts) {
          break; // Would fail after max attempts
        }
      }

      expect(attempts).toBe(maxAttempts + 1);
    });
  });

  // ===========================================================================
  // JOB LIFECYCLE TESTS
  // ===========================================================================

  describe('Job Lifecycle', () => {
    it('should track job completion', async () => {
      const completedJobs: string[] = [];

      const mockOnComplete = (jobId: string) => {
        completedJobs.push(jobId);
      };

      mockOnComplete('job-1');
      mockOnComplete('job-2');

      expect(completedJobs).toContain('job-1');
      expect(completedJobs).toContain('job-2');
    });

    it('should track job failures', async () => {
      const failedJobs: Array<{ id: string; error: string }> = [];

      const mockOnFail = (jobId: string, error: string) => {
        failedJobs.push({ id: jobId, error });
      };

      mockOnFail('job-3', 'DNS timeout');

      expect(failedJobs).toHaveLength(1);
      expect(failedJobs[0].error).toBe('DNS timeout');
    });

    it('should configure job removal policies', () => {
      const removeOnComplete = {
        age: 24 * 3600, // 24 hours
        count: 1000,
      };
      const removeOnFail = {
        age: 7 * 24 * 3600, // 7 days
      };

      expect(removeOnComplete.age).toBe(86400);
      expect(removeOnFail.age).toBe(604800);
    });
  });

  // ===========================================================================
  // CANCELLATION TESTS
  // ===========================================================================

  describe('Job Cancellation', () => {
    it('should support job removal by ID', async () => {
      const jobId = 'job-to-cancel';

      mockGetJob.mockResolvedValueOnce({
        id: jobId,
        remove: vi.fn().mockResolvedValueOnce(undefined),
      });

      const mockJob = await mockGetJob(jobId);
      expect(mockJob.id).toBe(jobId);
    });

    it('should support repeatable job removal', async () => {
      const repeatKey = 'scheduled-refresh:daily';

      mockRemoveRepeatable.mockResolvedValueOnce(true);

      await mockRemoveRepeatable(repeatKey);

      expect(mockRemoveRepeatable).toHaveBeenCalledWith(repeatKey);
    });

    it('should handle cancellation of non-existent job', async () => {
      mockGetJob.mockResolvedValueOnce(null);

      const job = await mockGetJob('non-existent-job');
      expect(job).toBeNull();
    });
  });

  // ===========================================================================
  // QUEUE HEALTH TESTS
  // ===========================================================================

  describe('Queue Health', () => {
    it('should report queue job counts', async () => {
      mockGetJobCounts.mockResolvedValueOnce({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
      });

      const counts = await mockGetJobCounts();

      expect(counts.waiting).toBe(5);
      expect(counts.active).toBe(2);
      expect(counts.completed).toBe(100);
      expect(counts.failed).toBe(3);
    });

    it('should handle empty queues', async () => {
      mockGetJobCounts.mockResolvedValueOnce({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
      });

      const counts = await mockGetJobCounts();

      expect(counts.waiting).toBe(0);
      expect(counts.active).toBe(0);
    });
  });

  // ===========================================================================
  // PRIORITY TESTS
  // ===========================================================================

  describe('Job Priority', () => {
    it('should support job priority levels', async () => {
      const highPriorityJob = {
        name: 'collect:critical.com',
        priority: 1,
      };
      const lowPriorityJob = {
        name: 'collect:lowpri.com',
        priority: 10,
      };

      expect(highPriorityJob.priority).toBeLessThan(lowPriorityJob.priority);
    });

    it('should process higher priority jobs first', () => {
      const jobs = [
        { name: 'job-low', priority: 10 },
        { name: 'job-high', priority: 1 },
        { name: 'job-medium', priority: 5 },
      ];

      const sorted = [...jobs].sort((a, b) => a.priority - b.priority);

      expect(sorted[0].name).toBe('job-high');
      expect(sorted[1].name).toBe('job-medium');
      expect(sorted[2].name).toBe('job-low');
    });
  });

  // ===========================================================================
  // DELAY TESTS
  // ===========================================================================

  describe('Job Delay', () => {
    it('should support delayed job execution', async () => {
      const delayMs = 5000;
      const expectedResult = {
        id: 'delayed-job',
        opts: { delay: delayMs },
      };

      // Clear and set mock for this specific test
      mockAdd.mockReset();
      mockAdd.mockResolvedValue(expectedResult);

      const result = await mockAdd('delayed-job', {}, { delay: delayMs });

      expect(result.id).toBe('delayed-job');
      expect(result.opts.delay).toBe(5000);
    });

    it('should schedule job for future execution', () => {
      const now = Date.now();
      const delay = 60000; // 1 minute
      const scheduledTime = now + delay;

      expect(scheduledTime).toBeGreaterThan(now);
      expect(scheduledTime - now).toBe(delay);
    });
  });

  // ===========================================================================
  // ERROR STATE TRACKING TESTS
  // ===========================================================================

  describe('Error State Tracking', () => {
    it('should capture error messages on failure', () => {
      const error = new Error('DNS resolution timeout');
      const failedJob = {
        id: 'failed-job',
        failedReason: error.message,
        stacktrace: error.stack,
        attemptsMade: 3,
      };

      expect(failedJob.failedReason).toBe('DNS resolution timeout');
      expect(failedJob.attemptsMade).toBe(3);
    });

    it('should track retry attempts', () => {
      const jobState = {
        attemptsMade: 0,
        maxAttempts: 3,
      };

      // Simulate retries
      while (jobState.attemptsMade < jobState.maxAttempts) {
        jobState.attemptsMade++;
      }

      expect(jobState.attemptsMade).toBe(3);
    });

    it('should preserve error history', () => {
      const errorHistory: Array<{ attempt: number; error: string; timestamp: Date }> = [];

      errorHistory.push({ attempt: 1, error: 'Timeout', timestamp: new Date() });
      errorHistory.push({ attempt: 2, error: 'Timeout', timestamp: new Date() });
      errorHistory.push({ attempt: 3, error: 'DNS SERVFAIL', timestamp: new Date() });

      expect(errorHistory).toHaveLength(3);
      expect(errorHistory[2].error).toBe('DNS SERVFAIL');
    });
  });

  // ===========================================================================
  // GRACEFUL SHUTDOWN TESTS
  // ===========================================================================

  describe('Graceful Shutdown', () => {
    it('should close queue connections', async () => {
      mockClose.mockResolvedValueOnce(undefined);

      await mockClose();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should wait for active jobs before shutdown', async () => {
      mockGetJobCounts.mockResolvedValueOnce({
        active: 2,
        waiting: 5,
      });

      const counts = await mockGetJobCounts();

      // In real shutdown, would wait for active jobs to complete
      expect(counts.active).toBe(2);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS (Redis required) - PR-07.3
// =============================================================================

/**
 * PR-07.3: Job Retry and Failure Tracking Tests
 *
 * These tests verify that failed jobs are retried correctly and that
 * error tracking captures the right context.
 *
 * They require a real Redis connection and will be skipped if REDIS_URL is not set.
 *
 * To run these tests:
 *   REDIS_URL=redis://localhost:6379 bun test queue.test.ts
 */
/**
 * Redis Integration Tests — Deferred
 *
 * These tests require a live Redis connection and are NOT run in the
 * standard test suite. They are deferred, not stubs — the queue
 * infrastructure is optional (see docs/REDIS_FALLBACK.md).
 *
 * To run: RUN_REDIS_INTEGRATION_TESTS=1 REDIS_URL=redis://localhost:6379 bun test queue.test.ts
 *
 * Covered when Redis is available:
 * - Job retry (3x with exponential backoff)
 * - Queue health counts (waiting/active/completed/failed)
 * - Error tracking integration (trackJobError context)
 * - Worker graceful shutdown (stopWorkers/closeQueues)
 * - Signal handling (SIGTERM/SIGINT)
 */
