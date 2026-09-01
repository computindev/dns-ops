/**
 * Probe Observation Repository - Bead 13.2
 *
 * Persistence layer for probe results (SMTP STARTTLS, MTA-STS, etc.)
 * Probe observations participate in the same evidence model as DNS observations.
 */

import { eq } from 'drizzle-orm';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import {
  type NewProbeObservation,
  type ProbeObservation,
  probeObservations,
  type SMTPProbeData,
} from '../schema/index.js';

/**
 * Effective success under the SMTP trust contract (issue #74).
 *
 * Non-SMTP probes keep their persisted success bit. An SMTP STARTTLS probe
 * is successful only when the row itself succeeded and the persisted probe
 * data proves every trust condition: STARTTLS advertised, TLS negotiated,
 * `tlsTrusted === true`, and both certificate chain and hostname
 * authorization explicitly `true`. Absent or contradictory trust fields fail
 * closed (legacy and forged rows read as unsuccessful).
 */
function isEffectivelySuccessful(probe: ProbeObservation): boolean {
  if (probe.probeType !== 'smtp_starttls') return probe.success === true;
  const probeData = probe.probeData as SMTPProbeData | null;
  return (
    probe.success === true &&
    probeData?.supportsStarttls === true &&
    probeData.tlsNegotiated === true &&
    probeData.tlsTrusted === true &&
    probeData.certificate?.chainAuthorized === true &&
    probeData.certificate.hostnameAuthorized === true
  );
}

/**
 * Read-time normalizer for probe rows (issue #74).
 *
 * Returns an SMTP row that lacks effective success as a read-only copy with
 * `success: false` and a raw `success` status exposed as `error`, matching
 * how untrusted TLS is persisted today. Diagnostics (probeData, certificate,
 * error text, timing, hostname, IDs) are preserved and the adapter-returned
 * row is never mutated. Non-SMTP rows are returned unchanged.
 */
function asReadRow(probe: ProbeObservation): ProbeObservation {
  if (isEffectivelySuccessful(probe)) return probe;
  if (probe.probeType !== 'smtp_starttls') return probe;
  return {
    ...probe,
    success: false,
    status: probe.status === 'success' ? 'error' : probe.status,
  };
}

export class ProbeObservationRepository {
  constructor(private db: IDatabaseAdapter) {}

  /**
   * Find a probe observation by ID
   */
  async findById(id: string): Promise<ProbeObservation | null> {
    const result = await this.db.selectOne(probeObservations, eq(probeObservations.id, id));
    return result ? asReadRow(result) : null;
  }

  /**
   * Find all probe observations for a snapshot
   */
  async findBySnapshotId(snapshotId: string): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    // Sort by hostname and probe type, then fail closed untrusted SMTP reads.
    // map() copies first so the adapter-returned array is left untouched.
    return results.map(asReadRow).sort((a, b) => {
      const hostnameCompare = a.hostname.localeCompare(b.hostname);
      if (hostnameCompare !== 0) return hostnameCompare;
      return a.probeType.localeCompare(b.probeType);
    });
  }

  /**
   * Find probe observations by type for a snapshot
   */
  async findBySnapshotAndType(
    snapshotId: string,
    probeType: 'smtp_starttls' | 'mta_sts' | 'tls_cert' | 'http' | 'rdap'
  ): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    return results
      .filter((p) => p.probeType === probeType)
      .map(asReadRow)
      .sort((a, b) => a.hostname.localeCompare(b.hostname));
  }

  /**
   * Find probe observations for a specific hostname
   */
  async findByHostname(snapshotId: string, hostname: string): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    return results.filter((p) => p.hostname === hostname).map(asReadRow);
  }

  /**
   * Find successful SMTP STARTTLS probes for a snapshot
   *
   * Fail closed under the SMTP trust contract (issue #74): legacy or forged
   * rows without explicit TLS trust proof — `tlsTrusted === true` plus both
   * certificate chain and hostname authorization — are excluded.
   */
  async findSuccessfulSmtpProbes(snapshotId: string): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    return results.filter((p) => p.probeType === 'smtp_starttls' && isEffectivelySuccessful(p));
  }

  /**
   * Find failed probes for a snapshot (for alerting/reporting)
   *
   * Normalizes before filtering (issue #74): forged or legacy SMTP rows with
   * a raw `success:true` but no trust proof read as failures here.
   */
  async findFailedProbes(snapshotId: string): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    return results.map(asReadRow).filter((p) => !p.success);
  }

  /**
   * Find probes with response time above threshold (performance issues)
   */
  async findSlowProbes(snapshotId: string, thresholdMs: number): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    return results
      .filter((p) => p.responseTimeMs !== null && p.responseTimeMs >= thresholdMs)
      .map(asReadRow);
  }

  /**
   * Find probes within a time range
   */
  async findByTimeRange(start: Date, end: Date): Promise<ProbeObservation[]> {
    const all = await this.db.select(probeObservations);
    return all.filter((p) => p.probedAt >= start && p.probedAt <= end).map(asReadRow);
  }

  /**
   * Create a single probe observation
   */
  async create(data: NewProbeObservation): Promise<ProbeObservation> {
    return this.db.insert(probeObservations, data);
  }

  /**
   * Create multiple probe observations (batch insert)
   */
  async createMany(data: NewProbeObservation[]): Promise<ProbeObservation[]> {
    if (data.length === 0) return [];
    return this.db.insertMany(probeObservations, data);
  }

  /**
   * Count probes by status for a snapshot
   */
  async countByStatus(
    snapshotId: string
  ): Promise<Record<'success' | 'timeout' | 'refused' | 'error' | 'other', number>> {
    const all = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );

    const counts = { success: 0, timeout: 0, refused: 0, error: 0, other: 0 };

    for (const probe of all) {
      // Count effective status: untrusted SMTP success reads as error (issue #74)
      switch (asReadRow(probe).status) {
        case 'success':
          counts.success++;
          break;
        case 'timeout':
          counts.timeout++;
          break;
        case 'refused':
          counts.refused++;
          break;
        case 'error':
          counts.error++;
          break;
        default:
          counts.other++;
      }
    }

    return counts;
  }

  /**
   * Get summary statistics for a snapshot's probes
   */
  async getSummary(snapshotId: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    byType: Record<string, number>;
    avgResponseTimeMs: number | null;
  }> {
    const all = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );

    const byType: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let successful = 0;
    let failed = 0;

    for (const probe of all) {
      byType[probe.probeType] = (byType[probe.probeType] || 0) + 1;

      // Effective success: untrusted SMTP success counts as failed (issue #74)
      if (isEffectivelySuccessful(probe)) {
        successful++;
      } else {
        failed++;
      }

      if (probe.responseTimeMs !== null) {
        totalResponseTime += probe.responseTimeMs;
        responseTimeCount++;
      }
    }

    return {
      total: all.length,
      successful,
      failed,
      byType,
      avgResponseTimeMs:
        responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : null,
    };
  }
}
