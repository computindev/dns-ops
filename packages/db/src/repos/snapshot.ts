/**
 * DNS Ops Workbench - Snapshot Repository
 *
 * Repository pattern for snapshot operations.
 * Snapshots represent point-in-time collections of DNS data.
 */

import type { EvaluationCoverage } from '@dns-ops/contracts';
import { eq } from 'drizzle-orm';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { type NewSnapshot, type Snapshot, snapshots } from '../schema/index.js';

export class SnapshotRepository {
  constructor(private db: IDatabaseAdapter) {}

  /**
   * Find a snapshot by ID
   */
  async findById(id: string): Promise<Snapshot | undefined> {
    return this.db.selectOne(snapshots, eq(snapshots.id, id));
  }

  /**
   * Get all snapshots for a domain
   */
  async findByDomain(domainId: string, limit: number = 50): Promise<Snapshot[]> {
    const results = await this.db.selectWhere(snapshots, eq(snapshots.domainId, domainId));
    // Sort by createdAt desc and limit
    return results
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get the most recent snapshot for a domain
   */
  async findLatestByDomain(domainId: string): Promise<Snapshot | undefined> {
    const results = await this.db.selectWhere(snapshots, eq(snapshots.domainId, domainId));
    // Sort by createdAt desc and return first
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }

  /**
   * Check if the latest snapshot for a domain was created within the dedup window
   * @param domainId The domain ID
   * @param windowMs Minimum time since last snapshot in milliseconds (default: 60 seconds)
   * @returns The latest snapshot if within window, undefined if no recent snapshot
   */
  async findRecentByDomain(
    domainId: string,
    windowMs: number = 60_000
  ): Promise<Snapshot | undefined> {
    const latest = await this.findLatestByDomain(domainId);
    if (!latest) {
      return undefined;
    }

    const now = Date.now();
    const snapshotAge = now - new Date(latest.createdAt).getTime();

    if (snapshotAge < windowMs) {
      return latest;
    }

    return undefined;
  }

  /**
   * Get snapshots by result state
   */
  async findByState(
    state: 'complete' | 'partial' | 'failed',
    limit: number = 100
  ): Promise<Snapshot[]> {
    const results = await this.db.selectWhere(snapshots, eq(snapshots.resultState, state));
    return results
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Create a new snapshot
   */
  async create(data: NewSnapshot): Promise<Snapshot> {
    return this.db.insert(snapshots, data);
  }

  /**
   * Update snapshot with error information
   */
  async updateError(id: string, errorMessage: string): Promise<Snapshot | undefined> {
    return this.db.updateOne(snapshots, { errorMessage }, eq(snapshots.id, id));
  }

  /**
   * Update snapshot with collection duration
   */
  async updateDuration(id: string, durationMs: number): Promise<Snapshot | undefined> {
    return this.db.updateOne(snapshots, { collectionDurationMs: durationMs }, eq(snapshots.id, id));
  }

  /**
   * List snapshots with pagination
   */
  async list(options: { limit?: number; offset?: number } = {}): Promise<Snapshot[]> {
    const { limit = 100, offset = 0 } = options;
    const results = await this.db.select(snapshots);
    return results
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);
  }

  /**
   * Count snapshots by domain
   */
  async countByDomain(domainId: string): Promise<number> {
    const results = await this.db.selectWhere(snapshots, eq(snapshots.domainId, domainId));
    return results.length;
  }

  /**
   * Update snapshot's ruleset version ID
   *
   * Called after findings evaluation to mark the snapshot as having been
   * analyzed with a specific ruleset version. This allows downstream consumers
   * to distinguish between "no findings" (empty but evaluated) and
   * "findings not yet evaluated" (rulesetVersionId is null).
   */
  async updateRulesetVersion(id: string, rulesetVersionId: string): Promise<Snapshot | undefined> {
    return this.db.updateOne(snapshots, { rulesetVersionId }, eq(snapshots.id, id));
  }

  /**
   * Persist whether every enabled rule completed. Evaluation failures degrade a
   * complete snapshot to partial so downstream API, UI, and MCP consumers cannot
   * interpret zero findings as healthy.
   */
  async updateEvaluationCoverage(
    id: string,
    evaluation: EvaluationCoverage
  ): Promise<Snapshot | undefined> {
    const existing = await this.findById(id);
    if (!existing) return undefined;

    return this.db.updateOne(
      snapshots,
      {
        resultState:
          evaluation.state === 'PARTIAL' && existing.resultState === 'complete'
            ? 'partial'
            : existing.resultState,
        metadata: { ...(existing.metadata ?? {}), evaluation },
      },
      eq(snapshots.id, id)
    );
  }

  /**
   * Find snapshots that need findings backfill.
   *
   * Returns snapshots that either:
   * - Have no rulesetVersionId set (never evaluated)
   * - Have a different rulesetVersionId than the target (need re-evaluation)
   *
   * Used by the backfill endpoint to generate findings for existing snapshots.
   */
  async findNeedingBackfill(
    targetRulesetVersionId: string,
    options: {
      domainId?: string;
      limit?: number;
      completedOnly?: boolean;
    } = {}
  ): Promise<Snapshot[]> {
    const { domainId, limit = 100, completedOnly = true } = options;

    let results = await this.db.select(snapshots);

    // Filter by domain if specified
    if (domainId) {
      results = results.filter((s) => s.domainId === domainId);
    }

    // Filter by result state if completedOnly
    if (completedOnly) {
      results = results.filter((s) => s.resultState === 'complete');
    }

    // Filter to snapshots needing backfill (no ruleset or different ruleset)
    results = results.filter(
      (s) => !s.rulesetVersionId || s.rulesetVersionId !== targetRulesetVersionId
    );

    // Sort by createdAt desc (most recent first)
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return results.slice(0, limit);
  }

  /**
   * Count snapshots needing backfill
   */
  async countNeedingBackfill(
    targetRulesetVersionId: string,
    options: { domainId?: string; completedOnly?: boolean } = {}
  ): Promise<{ total: number; needsBackfill: number }> {
    const { domainId, completedOnly = true } = options;

    let results = await this.db.select(snapshots);

    // Filter by domain if specified
    if (domainId) {
      results = results.filter((s) => s.domainId === domainId);
    }

    // Filter by result state if completedOnly
    if (completedOnly) {
      results = results.filter((s) => s.resultState === 'complete');
    }

    const total = results.length;
    const needsBackfill = results.filter(
      (s) => !s.rulesetVersionId || s.rulesetVersionId !== targetRulesetVersionId
    ).length;

    return { total, needsBackfill };
  }
}
