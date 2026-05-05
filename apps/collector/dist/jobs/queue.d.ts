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
import { Queue, type QueueOptions } from 'bullmq';
import { Redis } from 'ioredis';
export type CollectDomainJobData = {
    tenantId: string;
    domain: string;
    zoneManagement?: 'managed' | 'unmanaged' | 'unknown';
    triggeredBy: string;
    includeMailRecords?: boolean;
    dkimSelectors?: string[];
};
export type MonitoringRefreshJobData = {
    monitoredDomainId: string;
    domainId: string;
    domainName: string;
    schedule: 'hourly' | 'daily' | 'weekly';
    tenantId: string;
};
export type FleetReportJobData = {
    inventory: string[];
    checks: string[];
    format: 'summary' | 'detailed';
    triggeredBy: string;
    tenantId: string;
};
export type JobData = {
    type: 'collect-domain';
    data: CollectDomainJobData;
} | {
    type: 'monitoring-refresh';
    data: MonitoringRefreshJobData;
} | {
    type: 'fleet-report';
    data: FleetReportJobData;
};
export declare const QUEUE_NAMES: {
    readonly COLLECTION: "dns-ops:collection";
    readonly MONITORING: "dns-ops:monitoring";
    readonly REPORTS: "dns-ops:reports";
};
/**
 * Create Redis connection from environment
 */
export declare function getRedisConnection(): Redis | null;
/**
 * Create a queue with standard options
 */
export declare function createQueue<T>(name: string, options?: Partial<QueueOptions>): Queue<T> | null;
export declare function getCollectionQueue(): Queue<CollectDomainJobData> | null;
export declare function getMonitoringQueue(): Queue<MonitoringRefreshJobData> | null;
export declare function getReportsQueue(): Queue<FleetReportJobData> | null;
/**
 * Schedule a domain collection job
 */
export declare function scheduleCollectionJob(data: CollectDomainJobData, options?: {
    priority?: number;
    delay?: number;
}): Promise<string | null>;
/**
 * Schedule a monitoring refresh job
 */
export declare function scheduleMonitoringJob(data: MonitoringRefreshJobData, options?: {
    priority?: number;
    delay?: number;
}): Promise<string | null>;
/**
 * Schedule repeating monitoring jobs based on schedule
 */
export declare function setupMonitoringSchedule(schedule: 'hourly' | 'daily' | 'weekly'): Promise<void>;
/**
 * Get queue health status
 */
export declare function getQueueHealth(): Promise<{
    available: boolean;
    queues: Record<string, {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    }>;
}>;
/**
 * Gracefully close all queues
 */
export declare function closeQueues(): Promise<void>;
//# sourceMappingURL=queue.d.ts.map