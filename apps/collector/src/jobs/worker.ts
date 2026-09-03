/**
 * Job Worker - Bead 19
 *
 * BullMQ worker that processes queued jobs:
 * - collect-domain: DNS collection for a single domain
 * - monitoring-refresh: Scheduled re-collection for monitored domains
 * - fleet-report: Batch reporting across domain inventory
 *
 * Start with WORKER_ENABLED=true environment variable.
 */

import {
  createPostgresAdapter,
  DomainRepository,
  FindingRepository,
  FleetReportRepository,
  MonitoredDomainRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import type { JobMetrics } from '@dns-ops/logging';
import { isValidDomain } from '@dns-ops/parsing';
import { type ConnectionOptions, type Job, UnrecoverableError, Worker } from 'bullmq';
import { DNSCollector } from '../dns/collector.js';
import type { CollectionConfig } from '../dns/types.js';
import {
  getCollectorLogger,
  trackJobComplete,
  trackJobError,
  trackJobStart,
} from '../middleware/error-tracking.js';
import { getJobMetrics } from '../middleware/job-metrics.js';
import { collectAndPersistDomainEvidence } from '../probes/domain-evidence.js';
import { generateAndSendFindingAlerts } from './alert-from-findings.js';
import { finalizePersistedCanonicalConditions } from './operational-condition-finalizer.js';
import {
  type CollectDomainJobData,
  type FleetReportJobData,
  getRedisConnection,
  type MonitoringRefreshJobData,
  QUEUE_NAMES,
} from './queue.js';

const logger = getCollectorLogger();

type WorkerFailureOutcome = 'retrying' | 'failed';

type JobMetricsRecorder = Pick<JobMetrics, 'failed' | 'retried'>;

function validationError(message: string): never {
  throw new UnrecoverableError(`Job validation failed: ${message}`);
}

function validateCollectDomainJobData(data: CollectDomainJobData): void {
  if (!data.tenantId || !isValidDomain(data.domain) || !data.triggeredBy) {
    validationError('tenantId, domain, and triggeredBy are required');
  }
}

function validateMonitoringRefreshJobData(data: MonitoringRefreshJobData): void {
  if (!data.tenantId || !['hourly', 'daily', 'weekly'].includes(data.schedule)) {
    validationError('monitoring refresh job data is invalid');
  }
  // The scheduled placeholder (domainName 'scheduled', tenantId 'system') only
  // fans out batch refreshes; it has no per-domain fields to validate.
  if (data.monitoredDomainId === 'scheduled') return;
  if (!data.monitoredDomainId || !data.domainId || !isValidDomain(data.domainName)) {
    validationError('monitoring refresh job data is invalid');
  }
}

function validateFleetReportJobData(data: FleetReportJobData): void {
  if (
    !Array.isArray(data.inventory) ||
    !data.inventory.every((domain) => typeof domain === 'string') ||
    !Array.isArray(data.checks) ||
    !data.checks.every((check) => typeof check === 'string') ||
    !['summary', 'detailed'].includes(data.format) ||
    !data.triggeredBy ||
    !data.tenantId
  ) {
    validationError('fleet report job data is invalid');
  }
}

function isUnrecoverableError(error: Error): boolean {
  return error instanceof UnrecoverableError || error.name === 'UnrecoverableError';
}

export function classifyWorkerFailure(job: Job | undefined, error: Error): WorkerFailureOutcome {
  const attempt = job?.attemptsMade ?? 0;
  const maxAttempts = Math.max(job?.opts.attempts ?? 1, 1);
  return !isUnrecoverableError(error) && attempt < maxAttempts ? 'retrying' : 'failed';
}

export function recordWorkerFailure({
  label,
  jobType,
  queue,
  job,
  error,
  jobMetrics,
}: {
  label: string;
  jobType: string;
  queue: string;
  job: Job | undefined;
  error: Error;
  jobMetrics: JobMetricsRecorder;
}): WorkerFailureOutcome {
  const outcome = classifyWorkerFailure(job, error);
  const attempt = job?.attemptsMade ?? 0;
  const maxAttempts = Math.max(job?.opts.attempts ?? 1, 1);

  if (outcome === 'retrying') {
    logger.warn(`${label} job retrying`, {
      jobId: job?.id,
      eventType: 'job_retry',
      attempt,
      maxAttempts,
      error: error.message,
    });
    jobMetrics.retried({
      jobType,
      queue,
      jobId: job?.id || 'unknown',
      attempt,
    });
  } else {
    logger.error(`${label} job failed`, error, {
      jobId: job?.id,
      eventType: 'job_failed',
      outcome: isUnrecoverableError(error) ? 'terminal_validation' : 'exhausted_retries',
      attempt,
      maxAttempts,
    });
    jobMetrics.failed({
      jobType,
      queue,
      jobId: job?.id || 'unknown',
      durationMs: job?.processedOn ? Date.now() - job.processedOn : 0,
      error: error.message,
      attempt,
    });
  }

  return outcome;
}

// =============================================================================
// Database Helper
// =============================================================================

export function getDbAdapter() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not configured');
  }
  return createPostgresAdapter(dbUrl);
}

// =============================================================================
// Job Processors
// =============================================================================

/**
 * Process domain collection job
 * Exported for testing
 */
export async function processCollectDomain(job: Job<CollectDomainJobData>): Promise<{
  success: boolean;
  snapshotId?: string;
  error?: string;
}> {
  const { tenantId, domain, zoneManagement, triggeredBy, includeMailRecords, dkimSelectors } =
    job.data;
  const startTime = Date.now();

  trackJobStart({
    jobId: job.id || 'unknown',
    jobType: 'collect-domain',
    domain,
    triggeredBy,
  });

  try {
    validateCollectDomainJobData(job.data);
    const db = getDbAdapter();

    const config: CollectionConfig = {
      tenantId,
      domain,
      zoneManagement: zoneManagement || 'unknown',
      recordTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA'],
      triggeredBy,
      includeMailRecords: includeMailRecords ?? true,
      dkimSelectors: dkimSelectors || [],
    };

    const collector = new DNSCollector(config, db);
    const result = await collector.collect();

    const evidenceDomain = await new DomainRepository(db).findByNameForTenant(domain, tenantId);
    if (evidenceDomain) {
      try {
        await collectAndPersistDomainEvidence(db, {
          snapshotId: result.snapshotId,
          tenantId,
          domainId: evidenceDomain.id,
          domain: evidenceDomain.normalizedName,
        });
      } catch (evidenceError) {
        logger.warn('External evidence collection failed (non-fatal)', {
          snapshotId: result.snapshotId,
          error: evidenceError instanceof Error ? evidenceError.message : String(evidenceError),
        });
      }
    }

    if (evidenceDomain) {
      try {
        await finalizePersistedCanonicalConditions(db, {
          snapshotId: result.snapshotId,
          tenantId,
          domainId: evidenceDomain.id,
          domainName: evidenceDomain.normalizedName,
        });
      } catch (finalizationError) {
        logger.warn('Canonical condition finalization failed (non-fatal)', {
          snapshotId: result.snapshotId,
          error:
            finalizationError instanceof Error
              ? finalizationError.message
              : String(finalizationError),
        });
      }
    }

    // JOB-002: Generate alerts from high-severity findings and deliver via webhook
    // Alerts only apply to monitored domains — the function handles the lookup
    try {
      const domainRecord = await new DomainRepository(db).findByNameForTenant(domain, tenantId);
      if (domainRecord) {
        // Look up monitored domain to get configured webhook URL
        const monitored = await new MonitoredDomainRepository(db).findByDomainId(
          domainRecord.id,
          tenantId
        );
        const webhookUrl = monitored?.alertChannels?.webhook;

        const { alerts, webhookSent } = await generateAndSendFindingAlerts(
          db,
          result.snapshotId,
          tenantId,
          domainRecord.id,
          domain,
          webhookUrl
        );
        if (alerts.length > 0) {
          logger.info('Generated alerts from findings', {
            snapshotId: result.snapshotId,
            alertCount: alerts.length,
            webhookSent,
            domain,
          });
        }
      }
    } catch (alertError) {
      // Alert generation failure should not fail the collection job
      logger.warn('Alert generation failed (non-fatal)', {
        snapshotId: result.snapshotId,
        error: alertError instanceof Error ? alertError.message : String(alertError),
      });
    }

    await job.updateProgress(100);

    trackJobComplete({
      jobId: job.id || 'unknown',
      jobType: 'collect-domain',
      domain,
      durationMs: Date.now() - startTime,
      result: 'success',
      snapshotId: result.snapshotId,
    });

    return {
      success: true,
      snapshotId: result.snapshotId,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    trackJobError(err, {
      jobId: job.id || 'unknown',
      jobType: 'collect-domain',
      domain,
      durationMs: Date.now() - startTime,
    });
    throw err;
  }
}

/**
 * Process monitoring refresh job
 * Exported for testing
 */
export async function processMonitoringRefresh(job: Job<MonitoringRefreshJobData>): Promise<{
  success: boolean;
  snapshotId?: string;
  queued?: number;
  error?: string;
}> {
  const { monitoredDomainId, domainId, domainName, schedule, tenantId } = job.data;
  const startTime = Date.now();

  // Handle scheduled placeholder jobs - these trigger batch refreshes
  // Note: scheduled jobs use tenantId='system' — we query ALL tenants
  if (monitoredDomainId === 'scheduled') {
    logger.info('Processing scheduled monitoring refresh', { schedule, jobId: job.id });

    try {
      validateMonitoringRefreshJobData(job.data);
      const db = getDbAdapter();
      const monitoredRepo = new MonitoredDomainRepository(db);
      const domainRepo = new DomainRepository(db);
      const { getCollectionQueue } = await import('./queue.js');
      const queue = getCollectionQueue();

      if (!queue) {
        throw new Error('Queue not available for scheduling');
      }

      // Find all monitored domains due for refresh across ALL tenants
      // (scheduled jobs are system-wide, not tenant-scoped)
      const monitoredDomains = await monitoredRepo.findActiveBySchedule(schedule);
      let queued = 0;

      for (const monitored of monitoredDomains) {
        // Check if within suppression window
        if (monitored.lastCheckAt) {
          const minutesSinceLastCheck =
            (Date.now() - monitored.lastCheckAt.getTime()) / (60 * 1000);
          const requiredInterval =
            schedule === 'hourly' ? 60 : schedule === 'daily' ? 24 * 60 : 7 * 24 * 60;

          // Skip if checked recently (within 90% of interval to avoid edge cases)
          if (minutesSinceLastCheck < requiredInterval * 0.9) {
            logger.debug('Skipping monitored domain - checked recently', {
              monitoredDomainId: monitored.id,
              minutesSinceLastCheck,
              requiredInterval,
            });
            continue;
          }
        }

        // Look up domain details
        const domain = await domainRepo.findById(monitored.domainId);
        if (!domain) {
          logger.warn('Domain not found for monitored domain', {
            monitoredDomainId: monitored.id,
            domainId: monitored.domainId,
          });
          continue;
        }

        // Enqueue collection job
        await queue.add(
          `collect-${domain.name}`,
          {
            tenantId: monitored.tenantId,
            domain: domain.name,
            zoneManagement: domain.zoneManagement || 'unknown',
            triggeredBy: `monitoring:${schedule}`,
            includeMailRecords: true,
          },
          {
            jobId: `monitoring-${monitored.id}-${Date.now()}`,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          }
        );

        queued++;
        logger.debug('Queued collection job for monitored domain', {
          monitoredDomainId: monitored.id,
          domain: domain.name,
        });
      }

      logger.info('Scheduled monitoring refresh complete', {
        schedule,
        tenantId,
        monitoredCount: monitoredDomains.length,
        queued,
      });

      return {
        success: true,
        queued,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Scheduled monitoring refresh failed', err, {
        schedule,
        tenantId,
        jobId: job.id,
      });
      throw err;
    }
  }

  trackJobStart({
    jobId: job.id || 'unknown',
    jobType: 'monitoring-refresh',
    domain: domainName,
    schedule,
  });

  try {
    validateMonitoringRefreshJobData(job.data);
    const db = getDbAdapter();
    const domainRepo = new DomainRepository(db);

    // Get domain to check zone management
    const domain = await domainRepo.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      throw new UnrecoverableError(`Domain ${domainId} is outside the monitoring tenant`);
    }
    if (domain.normalizedName !== domainName.toLowerCase()) {
      throw new UnrecoverableError(
        'Monitoring job domain name does not match the registered domain'
      );
    }

    const config: CollectionConfig = {
      tenantId: job.data.tenantId,
      domain: domainName,
      zoneManagement: domain.zoneManagement || 'unknown',
      recordTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA'],
      triggeredBy: `monitoring:${schedule}`,
      includeMailRecords: true,
    };

    const collector = new DNSCollector(config, db);
    const result = await collector.collect();

    try {
      await collectAndPersistDomainEvidence(db, {
        snapshotId: result.snapshotId,
        tenantId,
        domainId: domain.id,
        domain: domain.normalizedName,
      });
    } catch (evidenceError) {
      logger.warn('External evidence collection failed (non-fatal)', {
        snapshotId: result.snapshotId,
        error: evidenceError instanceof Error ? evidenceError.message : String(evidenceError),
      });
    }
    try {
      await finalizePersistedCanonicalConditions(db, {
        snapshotId: result.snapshotId,
        tenantId,
        domainId: domain.id,
        domainName: domain.normalizedName,
      });
    } catch (finalizationError) {
      logger.error('Canonical condition finalization failed; monitoring refresh will retry', {
        snapshotId: result.snapshotId,
        error:
          finalizationError instanceof Error
            ? finalizationError.message
            : String(finalizationError),
      });
      throw finalizationError;
    }

    await job.updateProgress(100);

    trackJobComplete({
      jobId: job.id || 'unknown',
      jobType: 'monitoring-refresh',
      domain: domainName,
      durationMs: Date.now() - startTime,
      result: 'success',
      snapshotId: result.snapshotId,
    });

    return {
      success: true,
      snapshotId: result.snapshotId,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    trackJobError(err, {
      jobId: job.id || 'unknown',
      jobType: 'monitoring-refresh',
      domain: domainName,
      durationMs: Date.now() - startTime,
    });
    throw err;
  }
}

/**
 * Process fleet report job
 * Exported for testing
 */
export async function processFleetReport(job: Job<FleetReportJobData>): Promise<{
  success: boolean;
  reportId?: string;
  summary?: Record<string, unknown>;
  error?: string;
}> {
  const { inventory, checks, triggeredBy, tenantId } = job.data;
  const startTime = Date.now();

  trackJobStart({
    jobId: job.id || 'unknown',
    jobType: 'fleet-report',
    triggeredBy,
    domainCount: inventory.length,
  });

  try {
    validateFleetReportJobData(job.data);
    const db = getDbAdapter();
    const domainRepo = new DomainRepository(db);
    const snapshotRepo = new SnapshotRepository(db);
    const findingRepo = new FindingRepository(db);
    const fleetReportRepo = new FleetReportRepository(db);

    // Create the fleet report record with status 'pending'
    const newReport = await fleetReportRepo.create({
      tenantId: tenantId || '00000000-0000-0000-0000-000000000000',
      createdBy: triggeredBy,
      status: 'pending',
      inventory,
      checks,
      format: 'summary',
    });

    // Update to processing
    await fleetReportRepo.markProcessing(newReport.id);

    let processed = 0;
    const results: Array<{
      domain: string;
      findingsCount: number;
      severityCounts: Record<string, number>;
    }> = [];

    for (const domainName of inventory) {
      // Tenant-scoped domain lookup
      const domain = tenantId
        ? await domainRepo.findByNameForTenant(domainName, tenantId)
        : await domainRepo.findByName(domainName);
      if (!domain) continue;

      const snapshots = await snapshotRepo.findByDomain(domain.id, 1);
      if (snapshots.length === 0) continue;

      const findings = await findingRepo.findBySnapshotId(snapshots[0].id);

      const severityCounts: Record<string, number> = {};
      for (const finding of findings) {
        severityCounts[finding.severity] = (severityCounts[finding.severity] || 0) + 1;
      }

      results.push({
        domain: domainName,
        findingsCount: findings.length,
        severityCounts,
      });

      processed++;
      await job.updateProgress(Math.round((processed / inventory.length) * 100));
    }

    const summary = {
      totalDomains: inventory.length,
      processedDomains: results.length,
      totalFindings: results.reduce((sum, r) => sum + r.findingsCount, 0),
      checksApplied: checks,
    };

    // Persist the completed report
    await fleetReportRepo.complete(newReport.id, summary, results);

    trackJobComplete({
      jobId: job.id || 'unknown',
      jobType: 'fleet-report',
      durationMs: Date.now() - startTime,
      result: 'success',
      reportId: newReport.id,
      processedDomains: results.length,
      totalFindings: summary.totalFindings,
    });

    return {
      success: true,
      reportId: newReport.id,
      summary,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    trackJobError(err, {
      jobId: job.id || 'unknown',
      jobType: 'fleet-report',
      durationMs: Date.now() - startTime,
    });
    throw err;
  }
}

// =============================================================================
// Worker Setup
// =============================================================================

let collectionWorker: Worker | null = null;
let monitoringWorker: Worker | null = null;
let reportsWorker: Worker | null = null;

/**
 * Start all workers
 */
export async function startWorkers(): Promise<void> {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn('Redis not available - workers not started');
    return;
  }

  const jobMetrics = getJobMetrics();
  logger.info('Starting job workers...');

  const connectionOptions: ConnectionOptions = connection as ConnectionOptions;

  // Collection worker
  collectionWorker = new Worker(
    QUEUE_NAMES.COLLECTION,
    async (job) => {
      return processCollectDomain(job as Job<CollectDomainJobData>);
    },
    {
      connection: connectionOptions,
      concurrency: 5,
    }
  );

  collectionWorker.on('completed', (job) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    logger.debug('Collection job completed', { jobId: job.id });
    jobMetrics.completed({
      jobType: 'collect-domain',
      queue: QUEUE_NAMES.COLLECTION,
      jobId: job.id || 'unknown',
      durationMs,
    });
  });

  // Processors throw for retryable and terminal outcomes; BullMQ retries here.
  collectionWorker.on('failed', (job, error) => {
    recordWorkerFailure({
      label: 'Collection',
      jobType: 'collect-domain',
      queue: QUEUE_NAMES.COLLECTION,
      job,
      error,
      jobMetrics,
    });
  });

  // Monitoring worker
  monitoringWorker = new Worker(
    QUEUE_NAMES.MONITORING,
    async (job) => {
      return processMonitoringRefresh(job as Job<MonitoringRefreshJobData>);
    },
    {
      connection: connectionOptions,
      concurrency: 3,
    }
  );

  monitoringWorker.on('completed', (job) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    logger.debug('Monitoring job completed', { jobId: job.id });
    jobMetrics.completed({
      jobType: 'monitoring-refresh',
      queue: QUEUE_NAMES.MONITORING,
      jobId: job.id || 'unknown',
      durationMs,
    });
  });

  monitoringWorker.on('failed', (job, error) => {
    recordWorkerFailure({
      label: 'Monitoring',
      jobType: 'monitoring-refresh',
      queue: QUEUE_NAMES.MONITORING,
      job,
      error,
      jobMetrics,
    });
  });

  // Reports worker
  reportsWorker = new Worker(
    QUEUE_NAMES.REPORTS,
    async (job) => {
      return processFleetReport(job as Job<FleetReportJobData>);
    },
    {
      connection: connectionOptions,
      concurrency: 2,
    }
  );

  reportsWorker.on('completed', (job) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    logger.debug('Reports job completed', { jobId: job.id });
    jobMetrics.completed({
      jobType: 'fleet-report',
      queue: QUEUE_NAMES.REPORTS,
      jobId: job.id || 'unknown',
      durationMs,
    });
  });

  reportsWorker.on('failed', (job, error) => {
    recordWorkerFailure({
      label: 'Reports',
      jobType: 'fleet-report',
      queue: QUEUE_NAMES.REPORTS,
      job,
      error,
      jobMetrics,
    });
  });

  logger.info('All workers started');
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers(): Promise<void> {
  logger.info('Stopping workers...');

  const workers = [collectionWorker, monitoringWorker, reportsWorker];

  for (const worker of workers) {
    if (worker) {
      await worker.close();
    }
  }

  collectionWorker = null;
  monitoringWorker = null;
  reportsWorker = null;

  logger.info('All workers stopped');
}

/**
 * Check if workers are running
 */
export function workersRunning(): boolean {
  return collectionWorker !== null || monitoringWorker !== null || reportsWorker !== null;
}
