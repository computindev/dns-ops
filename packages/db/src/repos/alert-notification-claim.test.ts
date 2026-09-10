import { describe, expect, it, vi } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { AlertRepository } from './portfolio.js';

describe('AlertRepository notification claim', () => {
  it('claims a pending alert once and releases it for retry', async () => {
    const row = {
      id: 'alert-1',
      tenantId: 'tenant-1',
      status: 'pending',
      notificationClaimedUntil: null as Date | null,
    };
    const db = {
      updateOne: vi.fn(async (_table: unknown, values: Record<string, unknown>) => {
        if (values.notificationClaimedUntil instanceof Date && row.notificationClaimedUntil) {
          return undefined;
        }
        Object.assign(row, values);
        return { ...row };
      }),
    } as unknown as IDatabaseAdapter;
    const repo = new AlertRepository(db);
    const lease = new Date('2026-07-28T12:00:30.000Z');
    const first = await repo.claimPendingNotification('alert-1', 'tenant-1', lease);
    const second = await repo.claimPendingNotification('alert-1', 'tenant-1', lease);
    expect(first?.notificationClaimedUntil).toEqual(lease);
    expect(second).toBeUndefined();
    await repo.releaseNotificationClaim('alert-1', 'tenant-1');
    expect(row.notificationClaimedUntil).toBeNull();
    const retry = await repo.claimPendingNotification('alert-1', 'tenant-1', lease);
    expect(retry?.notificationClaimedUntil).toEqual(lease);
  });
});
