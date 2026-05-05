/**
 * Job Queue Infrastructure - Bead 19
 *
 * BullMQ-based job queue for async processing of:
 * - Domain collection jobs
 * - Scheduled monitoring refreshes
 * - Fleet report generation
 *
 * Requires Redis connection via REDIS_URL environment variable.
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { getCollectorLogger } from '../middleware/error-tracking.js';
const logger = getCollectorLogger();
// =============================================================================
// Queue Names
// =============================================================================
export const QUEUE_NAMES = {
    COLLECTION: 'dns-ops:collection',
    MONITORING: 'dns-ops:monitoring',
    REPORTS: 'dns-ops:reports',
};
// =============================================================================
// Queue Factory
// =============================================================================
let redisConnection = null;
/**
 * Create Redis connection from environment
 */
export function getRedisConnection() {
    if (redisConnection) {
        return redisConnection;
    }
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        logger.warn('[Queue] REDIS_URL not set - job queue disabled');
        return null;
    }
    redisConnection = new Redis(redisUrl, {
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
    });
    redisConnection?.on('error', (err) => {
        logger.error('[Queue] Redis connection error', err);
    });
    return redisConnection;
}
/**
 * Create a queue with standard options
 */
export function createQueue(name, options) {
    const connection = getRedisConnection();
    if (!connection) {
        return null;
    }
    // Cast to any for BullMQ compatibility - ioredis instance works as ConnectionOptions
    return new Queue(name, {
        connection: connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
            removeOnComplete: {
                age: 24 * 3600, // Keep completed jobs for 24 hours
                count: 1000, // Keep at most 1000 completed jobs
            },
            removeOnFail: {
                age: 7 * 24 * 3600, // Keep failed jobs for 7 days
            },
        },
        ...options,
    });
}
// =============================================================================
// Queue Instances (lazy initialization)
// =============================================================================
let collectionQueue = null;
let monitoringQueue = null;
let reportsQueue = null;
export function getCollectionQueue() {
    if (!collectionQueue) {
        collectionQueue = createQueue(QUEUE_NAMES.COLLECTION);
    }
    return collectionQueue;
}
export function getMonitoringQueue() {
    if (!monitoringQueue) {
        monitoringQueue = createQueue(QUEUE_NAMES.MONITORING);
    }
    return monitoringQueue;
}
export function getReportsQueue() {
    if (!reportsQueue) {
        reportsQueue = createQueue(QUEUE_NAMES.REPORTS);
    }
    return reportsQueue;
}
// =============================================================================
// Job Scheduling Helpers
// =============================================================================
/**
 * Schedule a domain collection job
 */
export async function scheduleCollectionJob(data, options) {
    const queue = getCollectionQueue();
    if (!queue) {
        logger.warn('[Queue] Collection queue not available - running synchronously', {
            domain: data.domain,
            tenantId: data.tenantId,
        });
        return null;
    }
    const job = await queue.add(`collect:${data.domain}`, data, {
        priority: options?.priority,
        delay: options?.delay,
    });
    return job.id || null;
}
/**
 * Schedule a monitoring refresh job
 */
export async function scheduleMonitoringJob(data, options) {
    const queue = getMonitoringQueue();
    if (!queue) {
        logger.warn('[Queue] Monitoring queue not available', {
            domainName: data.domainName,
            tenantId: data.tenantId,
        });
        return null;
    }
    const job = await queue.add(`monitor:${data.domainName}`, data, {
        priority: options?.priority,
        delay: options?.delay,
    });
    return job.id || null;
}
/**
 * Schedule repeating monitoring jobs based on schedule
 */
export async function setupMonitoringSchedule(schedule) {
    const queue = getMonitoringQueue();
    if (!queue) {
        return;
    }
    const repeatPatterns = {
        hourly: '0 * * * *', // Every hour at :00
        daily: '0 6 * * *', // Daily at 6:00 AM
        weekly: '0 6 * * 1', // Monday at 6:00 AM
    };
    await queue.add(`scheduled-refresh:${schedule}`, {
        monitoredDomainId: 'scheduled',
        domainId: 'scheduled',
        domainName: 'scheduled',
        schedule,
        tenantId: 'system',
    }, {
        repeat: {
            pattern: repeatPatterns[schedule],
        },
    });
}
/**
 * Get queue health status
 */
export async function getQueueHealth() {
    const connection = getRedisConnection();
    if (!connection) {
        return { available: false, queues: {} };
    }
    const queues = {};
    // Use existing singleton queues to avoid connection leaks
    // getJobCounts() doesn't use the queue's generic type parameter, so we only need the base Queue type
    const singletonQueues = [
        { name: 'COLLECTION', queue: getCollectionQueue() },
        { name: 'MONITORING', queue: getMonitoringQueue() },
        { name: 'REPORTS', queue: getReportsQueue() },
    ];
    for (const { name, queue } of singletonQueues) {
        if (queue) {
            const counts = await queue.getJobCounts();
            queues[name] = {
                waiting: counts.waiting || 0,
                active: counts.active || 0,
                completed: counts.completed || 0,
                failed: counts.failed || 0,
            };
        }
    }
    return { available: true, queues };
}
/**
 * Gracefully close all queues
 */
export async function closeQueues() {
    const queues = [collectionQueue, monitoringQueue, reportsQueue];
    for (const queue of queues) {
        if (queue) {
            await queue.close();
        }
    }
    if (redisConnection) {
        redisConnection.disconnect();
        redisConnection = null;
    }
    collectionQueue = null;
    monitoringQueue = null;
    reportsQueue = null;
}
//# sourceMappingURL=queue.js.map