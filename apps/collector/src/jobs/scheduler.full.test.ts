/**
 * Job Scheduler Tests - Bead 19 (Full Coverage)
 *
 * Tests for schedule management:
 * - Idempotent schedule creation
 * - Schedule removal
 * - Pause/resume functionality
 * - Schedule state tracking
 * - Cron pattern validation
 * - Error handling
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('@dns-ops/logging', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock queue module - define mockQueue inside factory to avoid hoisting issues
vi.mock('./queue.js', () => {
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    removeRepeatable: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getMonitoringQueue: vi.fn().mockReturnValue(mockQueue),
    scheduleMonitoringJob: vi.fn().mockResolvedValue('job-123'),
    QUEUE_NAMES: {
      COLLECTION: 'dns-ops-collection',
      MONITORING: 'dns-ops-monitoring',
      REPORTS: 'dns-ops-reports',
    },
  };
});

import { getMonitoringQueue, scheduleMonitoringJob } from './queue.js';
import {
  _clearScheduleStateForTesting,
  _getActiveScheduleCount,
  cleanupSchedules,
  getActiveSchedules,
  getScheduleConfig,
  getScheduleKey,
  initializeSchedules,
  isScheduleActive,
  pauseSchedule,
  removeSchedule,
  resumeSchedule,
  SCHEDULE_DESCRIPTIONS,
  SCHEDULE_PATTERNS,
  type ScheduleType,
  scheduleMonitoredDomainRefreshes,
  setupSchedule,
} from './scheduler.js';

describe('Job Scheduler - Bead 19', () => {
  // Get reference to mock queue for assertions
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    removeRepeatable: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearScheduleStateForTesting();
    (getMonitoringQueue as ReturnType<typeof vi.fn>).mockReturnValue(mockQueue);
  });

  describe('SCHEDULE_PATTERNS', () => {
    it('should have patterns for all schedule types', () => {
      expect(SCHEDULE_PATTERNS.hourly).toBe('0 * * * *');
      expect(SCHEDULE_PATTERNS.daily).toBe('0 6 * * *');
      expect(SCHEDULE_PATTERNS.weekly).toBe('0 6 * * 1');
    });

    it('patterns should be valid cron expressions', () => {
      // Basic validation: 5 fields (minute, hour, day, month, weekday)
      Object.values(SCHEDULE_PATTERNS).forEach((pattern) => {
        const parts = pattern.split(' ');
        expect(parts).toHaveLength(5);
      });
    });
  });

  describe('SCHEDULE_DESCRIPTIONS', () => {
    it('should have descriptions for all schedule types', () => {
      expect(SCHEDULE_DESCRIPTIONS.hourly).toContain('hour');
      expect(SCHEDULE_DESCRIPTIONS.daily).toContain('Daily');
      expect(SCHEDULE_DESCRIPTIONS.weekly).toContain('Monday');
    });
  });

  describe('getScheduleKey', () => {
    it('should generate consistent keys', () => {
      expect(getScheduleKey('hourly')).toBe('scheduled-refresh:hourly');
      expect(getScheduleKey('daily')).toBe('scheduled-refresh:daily');
      expect(getScheduleKey('weekly')).toBe('scheduled-refresh:weekly');
    });
  });

  describe('setupSchedule', () => {
    it('should create a new schedule', async () => {
      const result = await setupSchedule('hourly');

      expect(result.created).toBe(true);
      expect(result.key).toBe('scheduled-refresh:hourly');
      expect(result.config.type).toBe('hourly');
      expect(result.config.enabled).toBe(true);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'scheduled-refresh:hourly',
        expect.objectContaining({
          monitoredDomainId: 'scheduled',
          schedule: 'hourly',
          tenantId: 'system',
        }),
        expect.objectContaining({
          repeat: {
            pattern: '0 * * * *',
            tz: 'UTC',
          },
          jobId: 'scheduled-refresh:hourly',
        })
      );
    });

    it('should support custom timezone', async () => {
      const result = await setupSchedule('daily', { timezone: 'America/New_York' });

      expect(result.config.timezone).toBe('America/New_York');
      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          repeat: expect.objectContaining({
            tz: 'America/New_York',
          }),
        })
      );
    });

    it('should be idempotent - return existing if already created', async () => {
      await setupSchedule('hourly');
      const result = await setupSchedule('hourly');

      expect(result.created).toBe(false);
      expect(mockQueue.add).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should overwrite existing when overwrite option is true', async () => {
      await setupSchedule('hourly');

      mockQueue.add.mockClear();
      const result = await setupSchedule('hourly', { overwrite: true });

      expect(result.created).toBe(true);
      expect(mockQueue.removeRepeatable).toHaveBeenCalledWith('scheduled-refresh:hourly', {
        pattern: '0 * * * *',
      });
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should throw if queue not available', async () => {
      (getMonitoringQueue as ReturnType<typeof vi.fn>).mockReturnValue(null);

      await expect(setupSchedule('hourly')).rejects.toThrow('Monitoring queue not available');
    });

    it('should create all schedule types', async () => {
      const schedules: ScheduleType[] = ['hourly', 'daily', 'weekly'];

      for (const schedule of schedules) {
        const result = await setupSchedule(schedule);
        expect(result.config.type).toBe(schedule);
        expect(result.config.cronPattern).toBe(SCHEDULE_PATTERNS[schedule]);
      }

      expect(mockQueue.add).toHaveBeenCalledTimes(3);
    });
  });

  describe('removeSchedule', () => {
    it('should remove existing schedule', async () => {
      await setupSchedule('hourly');

      const result = await removeSchedule('hourly');

      expect(result).toBe(true);
      expect(mockQueue.removeRepeatable).toHaveBeenCalledWith('scheduled-refresh:hourly', {
        pattern: '0 * * * *',
      });
      expect(_getActiveScheduleCount()).toBe(0);
    });

    it('should return false if queue not available', async () => {
      (getMonitoringQueue as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await removeSchedule('hourly');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      await setupSchedule('hourly');
      mockQueue.removeRepeatable.mockRejectedValueOnce(new Error('Redis error'));

      const result = await removeSchedule('hourly');

      expect(result).toBe(false);
    });

    it('should handle removing non-existent schedule', async () => {
      const result = await removeSchedule('hourly');

      expect(result).toBe(true); // removeRepeatable still called
    });
  });

  describe('pauseSchedule', () => {
    it('should pause active schedule', async () => {
      await setupSchedule('hourly');

      const result = await pauseSchedule('hourly');

      expect(result).toBe(true);
      expect(mockQueue.removeRepeatable).toHaveBeenCalled();

      const config = getScheduleConfig('hourly');
      expect(config?.enabled).toBe(false);
    });

    it('should return false if schedule not found', async () => {
      const result = await pauseSchedule('hourly');

      expect(result).toBe(false);
    });

    it('should keep config when pausing', async () => {
      await setupSchedule('daily', { timezone: 'Europe/London' });
      await pauseSchedule('daily');

      const config = getScheduleConfig('daily');
      expect(config).toBeDefined();
      expect(config?.type).toBe('daily');
      expect(config?.timezone).toBe('Europe/London');
      expect(config?.enabled).toBe(false);
    });
  });

  describe('resumeSchedule', () => {
    it('should resume paused schedule', async () => {
      await setupSchedule('hourly');
      await pauseSchedule('hourly');

      mockQueue.add.mockClear();
      const result = await resumeSchedule('hourly');

      expect(result).toBe(true);
      expect(mockQueue.add).toHaveBeenCalled();

      const config = getScheduleConfig('hourly');
      expect(config?.enabled).toBe(true);
    });

    it('should return false if schedule not found', async () => {
      const result = await resumeSchedule('hourly');

      expect(result).toBe(false);
    });

    it('should return false if schedule already active', async () => {
      await setupSchedule('hourly');

      const result = await resumeSchedule('hourly');

      expect(result).toBe(false);
    });

    it('should preserve timezone when resuming', async () => {
      await setupSchedule('daily', { timezone: 'Asia/Tokyo' });
      await pauseSchedule('daily');

      mockQueue.add.mockClear();
      await resumeSchedule('daily');

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          repeat: expect.objectContaining({
            tz: 'Asia/Tokyo',
          }),
        })
      );
    });
  });

  describe('getActiveSchedules', () => {
    it('should return empty array when no schedules', () => {
      const schedules = getActiveSchedules();

      expect(schedules).toEqual([]);
    });

    it('should return all active schedules', async () => {
      await setupSchedule('hourly');
      await setupSchedule('daily');

      const schedules = getActiveSchedules();

      expect(schedules).toHaveLength(2);
      expect(schedules.map((s) => s.schedule)).toContain('hourly');
      expect(schedules.map((s) => s.schedule)).toContain('daily');
    });

    it('should include paused schedules', async () => {
      await setupSchedule('hourly');
      await pauseSchedule('hourly');

      const schedules = getActiveSchedules();

      expect(schedules).toHaveLength(1);
      expect(schedules[0]?.status).toBe('paused');
    });

    it('should include schedule metadata', async () => {
      await setupSchedule('daily');

      const schedules = getActiveSchedules();

      expect(schedules[0]).toMatchObject({
        key: 'scheduled-refresh:daily',
        name: 'Monitoring refresh (daily)',
        schedule: 'daily',
        status: 'active',
      });
    });
  });

  describe('getScheduleConfig', () => {
    it('should return undefined for non-existent schedule', () => {
      const config = getScheduleConfig('hourly');

      expect(config).toBeUndefined();
    });

    it('should return config for existing schedule', async () => {
      await setupSchedule('weekly', { timezone: 'Pacific/Auckland' });

      const config = getScheduleConfig('weekly');

      expect(config).toMatchObject({
        type: 'weekly',
        enabled: true,
        cronPattern: '0 6 * * 1',
        timezone: 'Pacific/Auckland',
      });
    });
  });

  describe('isScheduleActive', () => {
    it('should return false for non-existent schedule', () => {
      expect(isScheduleActive('hourly')).toBe(false);
    });

    it('should return true for active schedule', async () => {
      await setupSchedule('hourly');

      expect(isScheduleActive('hourly')).toBe(true);
    });

    it('should return false for paused schedule', async () => {
      await setupSchedule('hourly');
      await pauseSchedule('hourly');

      expect(isScheduleActive('hourly')).toBe(false);
    });
  });

  describe('scheduleMonitoredDomainRefreshes', () => {
    it('should queue refresh jobs for all domains', async () => {
      const domains = [
        { monitoredDomainId: 'm1', domainId: 'd1', domainName: 'example1.com', tenantId: 't1' },
        { monitoredDomainId: 'm2', domainId: 'd2', domainName: 'example2.com', tenantId: 't2' },
      ];

      const result = await scheduleMonitoredDomainRefreshes('hourly', domains);

      expect(result.queued).toBe(2);
      expect(result.failed).toBe(0);
      expect(scheduleMonitoringJob).toHaveBeenCalledTimes(2);
    });

    it('should track failures when queue unavailable', async () => {
      (scheduleMonitoringJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const domains = [
        { monitoredDomainId: 'm1', domainId: 'd1', domainName: 'example1.com', tenantId: 't1' },
      ];

      const result = await scheduleMonitoredDomainRefreshes('hourly', domains);

      expect(result.queued).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should track failures on error', async () => {
      (scheduleMonitoringJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Queue error')
      );

      const domains = [
        { monitoredDomainId: 'm1', domainId: 'd1', domainName: 'example1.com', tenantId: 't1' },
      ];

      const result = await scheduleMonitoredDomainRefreshes('hourly', domains);

      expect(result.queued).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should handle empty domain list', async () => {
      const result = await scheduleMonitoredDomainRefreshes('hourly', []);

      expect(result.queued).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('initializeSchedules', () => {
    it('should create all default schedules', async () => {
      await initializeSchedules();

      expect(mockQueue.add).toHaveBeenCalledTimes(3);
      expect(_getActiveScheduleCount()).toBe(3);
    });

    it('should skip if queue not available', async () => {
      (getMonitoringQueue as ReturnType<typeof vi.fn>).mockReturnValue(null);

      await initializeSchedules();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should handle partial failures gracefully', async () => {
      mockQueue.add
        .mockResolvedValueOnce({ id: 'job-1' })
        .mockRejectedValueOnce(new Error('Redis error'))
        .mockResolvedValueOnce({ id: 'job-3' });

      // Should not throw despite error
      await expect(initializeSchedules()).resolves.not.toThrow();

      expect(mockQueue.add).toHaveBeenCalledTimes(3);
    });
  });

  describe('cleanupSchedules', () => {
    it('should clear in-memory state without removing BullMQ repeatables', async () => {
      await setupSchedule('hourly');
      await setupSchedule('daily');
      await setupSchedule('weekly');

      expect(_getActiveScheduleCount()).toBe(3);

      // Reset mock call count from setup
      mockQueue.removeRepeatable.mockClear();

      await cleanupSchedules();

      // Should NOT call removeRepeatable — repeatables survive restart
      expect(mockQueue.removeRepeatable).not.toHaveBeenCalled();
      // In-memory state should be cleared
      expect(_getActiveScheduleCount()).toBe(0);
    });

    it('should handle cleanup when no schedules', async () => {
      await expect(cleanupSchedules()).resolves.not.toThrow();
    });
  });

  describe('Test Helpers', () => {
    describe('_clearScheduleStateForTesting', () => {
      it('should clear all schedule state', async () => {
        await setupSchedule('hourly');
        await setupSchedule('daily');

        expect(_getActiveScheduleCount()).toBe(2);

        _clearScheduleStateForTesting();

        expect(_getActiveScheduleCount()).toBe(0);
        expect(getActiveSchedules()).toEqual([]);
      });
    });

    describe('_getActiveScheduleCount', () => {
      it('should return 0 initially', () => {
        expect(_getActiveScheduleCount()).toBe(0);
      });

      it('should return correct count', async () => {
        await setupSchedule('hourly');
        expect(_getActiveScheduleCount()).toBe(1);

        await setupSchedule('daily');
        expect(_getActiveScheduleCount()).toBe(2);

        await pauseSchedule('hourly');
        expect(_getActiveScheduleCount()).toBe(2); // Still tracked, just paused
      });
    });
  });

  describe('State Isolation', () => {
    it('should isolate schedules between tests', async () => {
      // First test creates a schedule
      await setupSchedule('hourly');
      expect(_getActiveScheduleCount()).toBe(1);

      // Clear state (simulating beforeEach)
      _clearScheduleStateForTesting();

      // State should be clean
      expect(_getActiveScheduleCount()).toBe(0);
      expect(getScheduleConfig('hourly')).toBeUndefined();
    });
  });
});
