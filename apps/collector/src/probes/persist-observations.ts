/**
 * Probe Observation Persistence - DATA-003
 *
 * Helper module for persisting probe results to database.
 * Used by probe routes after collecting probe results.
 */

import { type ProbeData, ProbeObservationRepository } from '@dns-ops/db';
import { getCollectorLogger } from '../middleware/error-tracking.js';
import type { Env } from '../types.js';
import type { MTASTSProbeResult } from './mta-sts.js';
import type { SMTPProbeResult } from './smtp-starttls.js';

const logger = getCollectorLogger();

/**
 * Probe observation status types
 */
export type ProbeStatus =
  | 'success'
  | 'timeout'
  | 'refused'
  | 'ssrf_blocked'
  | 'allowlist_denied'
  | 'parse_error'
  | 'error';

/**
 * Map SMTP probe result to probe observation format
 */
export function smtpResultToObservation(
  snapshotId: string,
  result: SMTPProbeResult
): {
  snapshotId: string;
  probeType: 'smtp_starttls';
  status: ProbeStatus;
  hostname: string;
  port: number;
  success: boolean;
  errorMessage: string | null;
  responseTimeMs: number;
  probeData: Record<string, unknown> | null;
} {
  // Determine status from result
  let status: ProbeStatus = 'error';

  if (result.success) {
    if (result.supportsStarttls) {
      status = 'success';
    } else {
      status = 'error'; // Server doesn't support STARTTLS
    }
  } else if (result.error) {
    const errorLower = result.error.toLowerCase();

    // Check for specific error types in order of specificity
    if (errorLower.includes('ssrf')) {
      status = 'ssrf_blocked';
    } else if (errorLower.includes('allowlist') || errorLower.includes('not in allowlist')) {
      status = 'allowlist_denied';
    } else if (errorLower.includes('timeout')) {
      status = 'timeout';
    } else if (errorLower.includes('refused') || errorLower.includes('connect')) {
      status = 'refused';
    } else {
      status = 'error';
    }
  }

  // Extract TLS data if available
  const probeData: Record<string, unknown> | null = result.certificate
    ? {
        supportsStarttls: result.supportsStarttls,
        tlsVersion: result.tlsVersion,
        tlsCipher: result.tlsCipher,
        certificateSubject: result.certificate.subject,
        certificateIssuer: result.certificate.issuer,
        certificateValidFrom: result.certificate.validFrom,
        certificateValidTo: result.certificate.validTo,
        smtpBanner: result.smtpBanner,
      }
    : { supportsStarttls: result.supportsStarttls, smtpBanner: result.smtpBanner };

  // Handle empty string error message - keep as null
  const errorMessage = result.error && result.error.trim().length > 0 ? result.error : null;

  return {
    snapshotId,
    probeType: 'smtp_starttls',
    status,
    hostname: result.hostname,
    port: result.port,
    success: result.success && result.supportsStarttls,
    errorMessage,
    responseTimeMs: result.responseTimeMs,
    probeData,
  };
}

/**
 * Map MTA-STS probe result to probe observation format
 */
export function mtastsResultToObservation(
  snapshotId: string,
  hostname: string,
  result: MTASTSProbeResult
): {
  snapshotId: string;
  probeType: 'mta_sts';
  status: ProbeStatus;
  hostname: string;
  port: number;
  success: boolean;
  errorMessage: string | null;
  responseTimeMs: number;
  probeData: Record<string, unknown> | null;
} {
  // Determine status from result
  let status: ProbeStatus = 'error';
  if (result.success) {
    status = 'success';
  } else if (result.error) {
    const errorLower = result.error.toLowerCase();
    if (errorLower.includes('timeout')) {
      status = 'timeout';
    } else if (errorLower.includes('certificate') || errorLower.includes('tls')) {
      status = 'error';
    } else {
      status = 'error';
    }
  }

  const probeData: Record<string, unknown> | null = result.policy
    ? {
        domain: result.domain,
        policyUrl: result.policyUrl,
        policyVersion: result.policy.version,
        policyMode: result.policy.mode,
        policyMaxAge: result.policy.maxAge,
        policyMx: result.policy.mx,
        tlsVersion: result.tlsVersion,
        certificateValid: result.certificateValid,
      }
    : { domain: result.domain, policyUrl: result.policyUrl };

  // Handle empty string error message - keep as null
  const errorMessage = result.error && result.error.trim().length > 0 ? result.error : null;

  return {
    snapshotId,
    probeType: 'mta_sts',
    status,
    hostname,
    port: 443,
    success: result.success,
    errorMessage,
    responseTimeMs: result.responseTimeMs,
    probeData,
  };
}

/**
 * Persist probe observations for a snapshot
 *
 * @param db - Database adapter from request context
 * @param snapshotId - The snapshot these observations belong to
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @param observations - Array of observation data
 */
export async function persistProbeObservations(
  db: Env['Variables']['db'],
  snapshotId: string,
  _tenantId: string,
  observations: Array<{
    snapshotId: string;
    probeType: 'smtp_starttls' | 'mta_sts' | 'tls_cert' | 'http' | 'rdap';
    status: string;
    hostname: string;
    port: number;
    success: boolean;
    errorMessage: string | null;
    responseTimeMs: number;
    probeData: ProbeData | null;
  }>
): Promise<number> {
  if (!db) {
    logger.warn('[ProbeObservation] Database not available, skipping persistence', {
      snapshotId,
    });
    return 0;
  }

  if (observations.length === 0) {
    return 0;
  }

  const repo = new ProbeObservationRepository(db);

  try {
    const created = await repo.createMany(observations as Parameters<typeof repo.createMany>[0]);
    logger.info(`[ProbeObservation] Persisted ${created.length} probe observations`, {
      snapshotId,
      count: created.length,
    });
    return created.length;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[ProbeObservation] Failed to persist observations', err, {
      snapshotId,
    });
    return 0;
  }
}

/**
 * Get probe observations for a snapshot
 */
export async function getProbeObservations(
  db: Env['Variables']['db'],
  snapshotId: string
): Promise<ReturnType<ProbeObservationRepository['findBySnapshotId']>> {
  if (!db) {
    return [];
  }

  const repo = new ProbeObservationRepository(db);
  return repo.findBySnapshotId(snapshotId);
}
