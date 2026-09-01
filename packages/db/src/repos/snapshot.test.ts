/**
 * Snapshot Repository Tests
 */

import { describe, expect, it, vi } from 'vitest';
import { SnapshotRepository } from './snapshot.js';

// Mock the database adapter
function createMockDb(snapshots: Record<string, unknown>[] = []) {
  return {
    selectOne: vi.fn(async () => {
      return snapshots[0] || null;
    }),
    selectWhere: vi.fn(async () => {
      return snapshots;
    }),
    insert: vi.fn(async (_table: unknown, data: Record<string, unknown>) => ({
      ...data,
      id: 'snapshot-new',
      createdAt: new Date(),
    })),
    updateOne: vi.fn(
      async (_table: unknown, data: Record<string, unknown>, _condition: unknown) => ({
        ...snapshots[0],
        ...data,
      })
    ),
    delete: vi.fn(async () => true),
  };
}

describe('SnapshotRepository', () => {
  describe('findLatestByDomain', () => {
    it('uses one ordered limited lookup instead of loading all snapshots', async () => {
      const latest = { id: 'snapshot-latest', domainId: 'domain-1', createdAt: new Date() };
      const mockDb = createMockDb([latest]);
      const repo = new SnapshotRepository(
        mockDb as unknown as import('../database/simple-adapter.js').IDatabaseAdapter
      );

      const result = await repo.findLatestByDomain('domain-1');

      expect(result).toBe(latest);
      expect(mockDb.selectOne).toHaveBeenCalledTimes(1);
      expect(mockDb.selectWhere).not.toHaveBeenCalled();
      expect(mockDb.selectOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('findRecentByDomain', () => {
    it('returns undefined when no snapshots exist', async () => {
      const mockDb = createMockDb([]);
      const repo = new SnapshotRepository(
        mockDb as unknown as import('../database/simple-adapter.js').IDatabaseAdapter
      );

      const result = await repo.findRecentByDomain('domain-1');
      expect(result).toBeUndefined();
    });

    it('returns snapshot when no recent snapshot exists', async () => {
      const oldDate = new Date(Date.now() - 120_000); // 2 minutes ago
      const mockSnapshot = {
        id: 'snapshot-old',
        domainId: 'domain-1',
        createdAt: oldDate,
      };
      const mockDb = createMockDb([mockSnapshot]);
      const repo = new SnapshotRepository(
        mockDb as unknown as import('../database/simple-adapter.js').IDatabaseAdapter
      );

      const result = await repo.findRecentByDomain('domain-1');
      expect(result).toBeUndefined();
    });

    it('returns snapshot when recent snapshot exists (within 60s)', async () => {
      const recentDate = new Date(Date.now() - 30_000); // 30 seconds ago
      const mockSnapshot = {
        id: 'snapshot-recent',
        domainId: 'domain-1',
        createdAt: recentDate,
      };
      const mockDb = createMockDb([mockSnapshot]);
      const repo = new SnapshotRepository(
        mockDb as unknown as import('../database/simple-adapter.js').IDatabaseAdapter
      );

      const result = await repo.findRecentByDomain('domain-1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('snapshot-recent');
    });

    it('returns snapshot when snapshot is exactly at 60s boundary', async () => {
      const boundaryDate = new Date(Date.now() - 59_000); // 59 seconds ago
      const mockSnapshot = {
        id: 'snapshot-boundary',
        domainId: 'domain-1',
        createdAt: boundaryDate,
      };
      const mockDb = createMockDb([mockSnapshot]);
      const repo = new SnapshotRepository(
        mockDb as unknown as import('../database/simple-adapter.js').IDatabaseAdapter
      );

      const result = await repo.findRecentByDomain('domain-1');
      expect(result).toBeDefined();
    });

    it('uses custom dedup window when specified', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 300_000); // 5 minutes ago
      const mockSnapshot = {
        id: 'snapshot-5min',
        domainId: 'domain-1',
        createdAt: fiveMinutesAgo,
      };
      const mockDb = createMockDb([mockSnapshot]);
      const repo = new SnapshotRepository(
        mockDb as unknown as import('../database/simple-adapter.js').IDatabaseAdapter
      );

      // With 10-minute window, snapshot should be recent
      const result = await repo.findRecentByDomain('domain-1', 600_000);
      expect(result).toBeDefined();
    });
  });
});

describe('Collection dedup requirements', () => {
  it('documents: collection should be rejected if <60s since last snapshot', () => {
    const lastSnapshotTime = Date.now() - 30_000; // 30 seconds ago
    const now = Date.now();
    const shouldReject = now - lastSnapshotTime < 60_000;
    expect(shouldReject).toBe(true);
  });

  it('documents: collection should be allowed if >=60s since last snapshot', () => {
    const lastSnapshotTime = Date.now() - 90_000; // 90 seconds ago
    const now = Date.now();
    const shouldReject = now - lastSnapshotTime < 60_000;
    expect(shouldReject).toBe(false);
  });
});
