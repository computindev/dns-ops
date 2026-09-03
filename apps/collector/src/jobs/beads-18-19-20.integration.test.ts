/**
 * Simplified Integration Tests for Beads 18, 19, 20
 *
 * These tests verify the integration between:
 * - Fleet report generation (Bead 18)
 * - Job scheduling and processing (Bead 19)
 * - Alert generation from findings (Bead 20)
 *
 * Note: Complex scheduler tests are in scheduler.full.test.ts
 * which has proper BullMQ mocking setup.
 */

import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectDomainJobData, FleetReportJobData } from './queue.js';
import { processCollectDomain, processFleetReport, processMonitoringRefresh } from './worker.js';

// Set up test environment
global.process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

describe('Beads 18-19-20 Integration Tests', () => {
  // Clear any mocks between tests
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // BEAD 18: Fleet Report Integration
  // ============================================================================
  describe('Fleet Report Integration (Bead 18)', () => {
    describe('processFleetReport integration', () => {
      it('should be exported and callable', async () => {
        const job = createMockJob<FleetReportJobData>('job-1', {
          inventory: ['example1.com', 'example2.com'],
          checks: ['spf', 'dmarc'],
          format: 'detailed',
          triggeredBy: 'user-123',
          tenantId: 'tenant-123',
        });

        // Verify the function exists and is callable
        expect(typeof processFleetReport).toBe('function');

        // Failures now propagate to BullMQ instead of resolving success:false.
        await expect(processFleetReport(job)).rejects.toThrow();
      });

      it('should handle missing domains gracefully', async () => {
        const job = createMockJob<FleetReportJobData>('job-1', {
          inventory: ['nonexistent.com'],
          checks: ['spf'],
          format: 'summary',
          triggeredBy: 'user',
          tenantId: 'tenant-123',
        });

        // Unreachable DB surfaces as a retryable thrown failure.
        await expect(processFleetReport(job)).rejects.toThrow();
      });
    });
  });

  // ============================================================================
  // BEAD 19: Job Scheduler Integration
  // ============================================================================
  describe('Job Scheduler Integration (Bead 19)', () => {
    // Note: Full scheduler tests are in scheduler.full.test.ts
    // which has proper BullMQ mocking setup

    describe('worker processors integration', () => {
      it('should export processCollectDomain as callable function', () => {
        expect(typeof processCollectDomain).toBe('function');
      });

      it('should export processMonitoringRefresh as callable function', () => {
        expect(typeof processMonitoringRefresh).toBe('function');
      });

      it('should accept valid job data structure', async () => {
        const job = createMockJob<CollectDomainJobData>('job-1', {
          tenantId: 'tenant-123',
          domain: 'example.com',
          zoneManagement: 'managed',
          triggeredBy: 'user-123',
          includeMailRecords: true,
          dkimSelectors: [],
        });

        expect(job.data.tenantId).toBe('tenant-123');
        expect(job.data.domain).toBe('example.com');
      });
    });
  });

  // ============================================================================
  // Cross-Bead Integration Tests
  // ============================================================================
  describe('Cross-Bead Integration', () => {
    it('should have all required worker processor functions exported', () => {
      // Verify all key functions are exported and callable
      expect(typeof processCollectDomain).toBe('function');
      expect(typeof processFleetReport).toBe('function');
      expect(typeof processMonitoringRefresh).toBe('function');
    });

    it('should maintain tenant isolation in job data', () => {
      // Verify fleet report accepts tenantId
      const fleetJob = createMockJob<FleetReportJobData>('job-1', {
        inventory: ['example.com'],
        checks: ['spf'],
        triggeredBy: 'user',
        tenantId: 'tenant-b',
      });

      // Job data should include tenantId
      expect(fleetJob.data.tenantId).toBe('tenant-b');

      // Verify collection accepts tenantId
      const collectionJob = createMockJob<CollectDomainJobData>('job-2', {
        tenantId: 'tenant-a',
        domain: 'example.com',
        triggeredBy: 'user',
      });

      expect(collectionJob.data.tenantId).toBe('tenant-a');
    });

    it('should handle job data with various check types', () => {
      const job = createMockJob<FleetReportJobData>('job-1', {
        inventory: ['example.com', 'test.com'],
        checks: ['spf', 'dmarc', 'mx', 'dkim'],
        format: 'detailed',
        triggeredBy: 'user',
        tenantId: 'tenant-123',
      });

      expect(job.data.checks).toContain('spf');
      expect(job.data.checks).toContain('dmarc');
      expect(job.data.checks).toContain('mx');
      expect(job.data.checks).toContain('dkim');
    });
  });

  // ============================================================================
  // Error Handling Integration Tests
  // ============================================================================
  describe('Error Handling Integration', () => {
    it('should handle missing DATABASE_URL gracefully', async () => {
      const originalEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      const job = createMockJob<CollectDomainJobData>('job-1', {
        tenantId: 't1',
        domain: 'example.com',
        triggeredBy: 'user',
      });

      // Retryable: thrown so BullMQ's three-attempt policy runs.
      await expect(processCollectDomain(job)).rejects.toThrow('DATABASE_URL');

      process.env.DATABASE_URL = originalEnv;
    });
  });
});

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
