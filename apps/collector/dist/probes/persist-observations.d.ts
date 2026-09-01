/**
 * Probe Observation Persistence - DATA-003
 *
 * Helper module for persisting probe results to database.
 * Used by probe routes after collecting probe results.
 */
import { ProbeObservationRepository } from '@dns-ops/db';
import type { Env } from '../types.js';
import type { MTASTSProbeResult } from './mta-sts.js';
import type { SMTPProbeResult } from './smtp-starttls.js';
/**
 * Probe observation status types
 */
export type ProbeStatus = 'success' | 'timeout' | 'refused' | 'ssrf_blocked' | 'allowlist_denied' | 'error';
/**
 * Map SMTP probe result to probe observation format
 */
export declare function smtpResultToObservation(snapshotId: string, result: SMTPProbeResult): {
    snapshotId: string;
    probeType: 'smtp_starttls';
    status: ProbeStatus;
    hostname: string;
    port: number;
    success: boolean;
    errorMessage: string | null;
    responseTimeMs: number;
    probeData: Record<string, unknown> | null;
};
/**
 * Map MTA-STS probe result to probe observation format
 */
export declare function mtastsResultToObservation(snapshotId: string, hostname: string, result: MTASTSProbeResult): {
    snapshotId: string;
    probeType: 'mta_sts';
    status: ProbeStatus;
    hostname: string;
    port: number;
    success: boolean;
    errorMessage: string | null;
    responseTimeMs: number;
    probeData: Record<string, unknown> | null;
};
/**
 * Persist probe observations for a snapshot
 *
 * @param db - Database adapter from request context
 * @param snapshotId - The snapshot these observations belong to
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @param observations - Array of observation data
 */
export declare function persistProbeObservations(db: Env['Variables']['db'], snapshotId: string, _tenantId: string, observations: Array<{
    snapshotId: string;
    probeType: 'smtp_starttls' | 'mta_sts';
    status: string;
    hostname: string;
    port: number;
    success: boolean;
    errorMessage: string | null;
    responseTimeMs: number;
    probeData: Record<string, unknown> | null;
}>): Promise<number>;
/**
 * Get probe observations for a snapshot
 */
export declare function getProbeObservations(db: Env['Variables']['db'], snapshotId: string): Promise<ReturnType<ProbeObservationRepository['findBySnapshotId']>>;
//# sourceMappingURL=persist-observations.d.ts.map