import { describe, expect, it, vi } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import type { Snapshot } from '../schema/index.js';
import { SnapshotRepository } from './snapshot.js';

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: 'snapshot-1',
    domainId: 'domain-1',
    domainName: 'example.com',
    resultState: 'complete',
    queriedNames: ['example.com'],
    queriedTypes: ['TXT'],
    vantages: ['public-recursive'],
    zoneManagement: 'managed',
    rulesetVersionId: null,
    triggeredBy: 'test',
    collectionDurationMs: null,
    errorMessage: null,
    metadata: { vantageIdentifiers: ['8.8.8.8'] },
    createdAt: new Date('2026-07-28T00:00:00Z'),
    ...overrides,
  };
}

describe('SnapshotRepository evaluation coverage', () => {
  it('degrades complete to partial and preserves existing metadata', async () => {
    const existing = snapshot();
    const updateOne = vi.fn().mockImplementation(async (_table, values) => ({
      ...existing,
      ...values,
    }));
    const db = {
      selectOne: vi.fn().mockResolvedValue(existing),
      updateOne,
    } as unknown as IDatabaseAdapter;
    const repo = new SnapshotRepository(db);
    const evaluation = {
      state: 'PARTIAL' as const,
      errors: [
        {
          code: 'RULE_EXECUTION_FAILED' as const,
          ruleId: 'test.throwing-rule',
          message: 'Rule test.throwing-rule could not be evaluated',
          status: 'UNKNOWN' as const,
          unknown: {
            reason: 'CHECK_EVALUATION_FAILED' as const,
            explanation: 'The check failed before it produced a trustworthy result.',
            action: 'RUN_FRESH_SCAN' as const,
            actionLabel: 'Run a fresh scan',
            blocking: true,
          },
        },
      ],
    };

    const updated = await repo.updateEvaluationCoverage(existing.id, evaluation);

    expect(updated?.resultState).toBe('partial');
    expect(updated?.metadata).toEqual({
      vantageIdentifiers: ['8.8.8.8'],
      evaluation,
    });
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it('does not upgrade an already failed snapshot', async () => {
    const existing = snapshot({ resultState: 'failed' });
    const updateOne = vi.fn().mockImplementation(async (_table, values) => ({
      ...existing,
      ...values,
    }));
    const db = {
      selectOne: vi.fn().mockResolvedValue(existing),
      updateOne,
    } as unknown as IDatabaseAdapter;
    const repo = new SnapshotRepository(db);

    const updated = await repo.updateEvaluationCoverage(existing.id, {
      state: 'PARTIAL',
      errors: [],
    });

    expect(updated?.resultState).toBe('failed');
  });

  it('unpublishes coverage without changing collection resultState', async () => {
    const existing = snapshot({
      rulesetVersionId: 'ruleset-1',
      metadata: { evaluation: { state: 'COMPLETE', errors: [] } },
    });
    const updateOne = vi.fn().mockImplementation(async (_table, values) => ({
      ...existing,
      ...values,
    }));
    const db = {
      selectOne: vi.fn().mockResolvedValue(existing),
      updateOne,
    } as unknown as IDatabaseAdapter;
    const repo = new SnapshotRepository(db);

    const updated = await repo.unpublishEvaluation(existing.id);

    expect(updated?.resultState).toBe('complete');
    expect(updated?.rulesetVersionId).toBeNull();
    expect(updated?.metadata?.evaluation?.state).toBe('PARTIAL');
  });

  it('does not unpublish a snapshot outside the owned domain', async () => {
    const existing = snapshot({ domainId: 'domain-1', rulesetVersionId: 'ruleset-1' });
    const updateOne = vi.fn();
    const db = {
      selectOne: vi.fn().mockResolvedValue(existing),
      updateOne,
    } as unknown as IDatabaseAdapter;
    const repo = new SnapshotRepository(db);

    const updated = await repo.unpublishEvaluation(existing.id, { domainId: 'domain-other' });

    expect(updated).toBeUndefined();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('counts and lists only tenant-owned snapshots for backfill', async () => {
    const own = snapshot({ id: 'snap-own', domainId: 'domain-1' });
    const foreign = snapshot({ id: 'snap-other', domainId: 'domain-other' });
    const db = {
      selectWhere: vi.fn().mockResolvedValue([{ id: 'domain-1', tenantId: 'tenant-1' }]),
      select: vi.fn().mockResolvedValue([own, foreign]),
    } as unknown as IDatabaseAdapter;
    const repo = new SnapshotRepository(db);

    const listed = await repo.findNeedingBackfill('ruleset-new', { tenantId: 'tenant-1' });
    const counted = await repo.countNeedingBackfill('ruleset-new', { tenantId: 'tenant-1' });

    expect(listed.map((row) => row.id)).toEqual(['snap-own']);
    expect(counted).toEqual({ total: 1, needsBackfill: 1 });
  });
});
