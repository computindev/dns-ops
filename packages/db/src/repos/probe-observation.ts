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

export class ProbeObservationRepository {
  constructor(private db: IDatabaseAdapter) {}

  /**
   * Find a probe observation by ID
   */
  async findById(id: string): Promise<ProbeObservation | null> {
    const result = await this.db.selectOne(probeObservations, eq(probeObservations.id, id));
    return result || null;
  }

  /**
   * Find all probe observations for a snapshot
   */
  async findBySnapshotId(snapshotId: string): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    // Sort by hostname and probe type
    return results.sort((a, b) => {
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
    return results.filter((p) => p.hostname === hostname);
  }

  /**
   * Find successful SMTP STARTTLS probes for a snapshot
   *
   * Requires explicit TLS trust in the persisted probe data (issue #74):
   * legacy rows without `tlsTrusted === true` fail closed and are excluded.
   */
  async findSuccessfulSmtpProbes(snapshotId: string): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    return results.filter((p) => {
      if (p.probeType !== 'smtp_starttls' || !p.success) return false;
      const probeData = p.probeData as SMTPProbeData | null;
      return probeData?.tlsTrusted === true;
    });
  }

  /**
   * Find failed probes for a snapshot (for alerting/reporting)
   */
  async findFailedProbes(snapshotId: string): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    return results.filter((p) => !p.success);
  }

  /**
   * Find probes with response time above threshold (performance issues)
   */
  async findSlowProbes(snapshotId: string, thresholdMs: number): Promise<ProbeObservation[]> {
    const results = await this.db.selectWhere(
      probeObservations,
      eq(probeObservations.snapshotId, snapshotId)
    );
    return results.filter((p) => p.responseTimeMs !== null && p.responseTimeMs >= thresholdMs);
  }

  /**
   * Find probes within a time range
   */
  async findByTimeRange(start: Date, end: Date): Promise<ProbeObservation[]> {
    const all = await this.db.select(probeObservations);
    return all.filter((p) => p.probedAt >= start && p.probedAt <= end);
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
      switch (probe.status) {
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

      if (probe.success) {
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
