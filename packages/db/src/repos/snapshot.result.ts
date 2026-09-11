/**
 * Snapshot Repository - Result-based methods
 *
 * These methods complement the existing SnapshotRepository methods
 * for gradual migration to Result-based error handling.
 */

import { Result, type ResultOrError } from '@dns-ops/contracts';
import type { NewSnapshot, Snapshot } from '../schema/index.js';
import { DbError, dbResult, dbResultOrNotFound } from './result.js';
import type { SnapshotRepository } from './snapshot.js';

// Re-export for convenience
export { DbError } from './result.js';

/**
 * Result-based wrapper for SnapshotRepository
 */
export class SnapshotRepositoryResults {
  constructor(private repo: SnapshotRepository) {}

  /**
   * Find a snapshot by ID
   */
  async findByIdResult(id: string): Promise<ResultOrError<Snapshot, DbError>> {
    return dbResultOrNotFound(() => this.repo.findById(id), 'Snapshot', id);
  }

  /**
   * Find snapshots for a domain
   */
  async findByDomainResult(
    domainId: string,
    limit?: number
  ): Promise<ResultOrError<Snapshot[], DbError>> {
    return dbResult(
      () => this.repo.findByDomain(domainId, limit),
      (e) =>
        new DbError({
          message: e instanceof Error ? e.message : 'Failed to find snapshots',
          code: 'QUERY_FAILED',
          table: 'Snapshot',
          operation: 'findByDomain',
          identifier: domainId,
        })
    );
  }

  /**
   * Get the latest snapshot for a domain
   * Returns undefined if no snapshots exist (not an error for new domains)
   */
  async findLatestByDomainResult(
    domainId: string
  ): Promise<ResultOrError<Snapshot | undefined, DbError>> {
    const snapshot = await this.repo.findLatestByDomain(domainId);
    return Result.ok(snapshot);
  }

  /**
   * Get the latest snapshot for a domain, error if none exists
   */
  async requireLatestByDomainResult(domainId: string): Promise<ResultOrError<Snapshot, DbError>> {
    const snapshot = await this.repo.findLatestByDomain(domainId);

    if (!snapshot) {
      return Result.err(DbError.notFound('Snapshot', `latest for domain: ${domainId}`));
    }

    return Result.ok(snapshot);
  }

  /**
   * Check for recent snapshot within dedup window
   * Returns the recent snapshot if found, undefined if not (not an error)
   */
  async findRecentByDomainResult(
    domainId: string,
    windowMs?: number
  ): Promise<ResultOrError<Snapshot | undefined, DbError>> {
    return dbResult(
      () => this.repo.findRecentByDomain(domainId, windowMs),
      (e) =>
        new DbError({
          message: e instanceof Error ? e.message : 'Failed to check recent snapshot',
          code: 'QUERY_FAILED',
          table: 'Snapshot',
          operation: 'findRecentByDomain',
          identifier: domainId,
        })
    );
  }

  /**
   * Create a new snapshot
   */
  async createResult(data: NewSnapshot): Promise<ResultOrError<Snapshot, DbError>> {
    // Validate required fields
    if (!data.domainId) {
      return Result.err(
        new DbError({
          message: 'Domain ID is required',
          code: 'CONSTRAINT_VIOLATION',
          table: 'Snapshot',
          operation: 'create',
        })
      );
    }

    return dbResult(
      () => this.repo.create(data),
      (e) =>
        new DbError({
          message: e instanceof Error ? e.message : 'Failed to create snapshot',
          code: 'QUERY_FAILED',
          table: 'Snapshot',
          operation: 'create',
        })
    );
  }

  /**
   * Update snapshot error information
   */
  async updateErrorResult(
    id: string,
    errorMessage: string
  ): Promise<ResultOrError<Snapshot, DbError>> {
    // First verify snapshot exists
    const findResult = await this.findByIdResult(id);
    if (findResult.isErr()) {
      return findResult;
    }

    return dbResultOrNotFound(() => this.repo.updateError(id, errorMessage), 'Snapshot', id);
  }

  /**
   * Update snapshot duration
   */
  async updateDurationResult(
    id: string,
    durationMs: number
  ): Promise<ResultOrError<Snapshot, DbError>> {
    // First verify snapshot exists
    const findResult = await this.findByIdResult(id);
    if (findResult.isErr()) {
      return findResult;
    }

    return dbResultOrNotFound(() => this.repo.updateDuration(id, durationMs), 'Snapshot', id);
  }

  /**
   * Update snapshot ruleset version
   */
  async updateRulesetVersionResult(
    id: string,
    rulesetVersionId: string
  ): Promise<ResultOrError<Snapshot, DbError>> {
    // First verify snapshot exists
    const findResult = await this.findByIdResult(id);
    if (findResult.isErr()) {
      return findResult;
    }

    return dbResultOrNotFound(
      () => this.repo.updateRulesetVersion(id, rulesetVersionId),
      'Snapshot',
      id
    );
  }

  /**
   * List snapshots with pagination
   */
  async listResult(options?: {
    limit?: number;
    offset?: number;
  }): Promise<ResultOrError<Snapshot[], DbError>> {
    return dbResult(
      () => this.repo.list(options),
      (e) =>
        new DbError({
          message: e instanceof Error ? e.message : 'Failed to list snapshots',
          code: 'QUERY_FAILED',
          table: 'Snapshot',
          operation: 'list',
        })
    );
  }

  /**
   * Count snapshots by domain
   */
  async countByDomainResult(domainId: string): Promise<ResultOrError<number, DbError>> {
    return dbResult(
      () => this.repo.countByDomain(domainId),
      (e) =>
        new DbError({
          message: e instanceof Error ? e.message : 'Failed to count snapshots',
          code: 'QUERY_FAILED',
          table: 'Snapshot',
          operation: 'countByDomain',
          identifier: domainId,
        })
    );
  }

  /**
   * Find snapshots needing backfill
   */
  async findNeedingBackfillResult(
    targetRulesetVersionId: string,
    options: {
      tenantId: string;
      domainId?: string;
      limit?: number;
      completedOnly?: boolean;
    }
  ): Promise<ResultOrError<Snapshot[], DbError>> {
    return dbResult(
      () => this.repo.findNeedingBackfill(targetRulesetVersionId, options),
      (e) =>
        new DbError({
          message: e instanceof Error ? e.message : 'Failed to find backfill candidates',
          code: 'QUERY_FAILED',
          table: 'Snapshot',
          operation: 'findNeedingBackfill',
        })
    );
  }
}

/**
 * Extend SnapshotRepository with Result-based methods
 */
export function withSnapshotResults(repo: SnapshotRepository): SnapshotRepositoryResults {
  return new SnapshotRepositoryResults(repo);
}
