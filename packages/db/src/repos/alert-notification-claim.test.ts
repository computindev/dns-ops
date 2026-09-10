import { describe, expect, it, vi } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { AlertRepository } from './portfolio.js';

function conditionValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as {
      constructor?: { name?: string };
      value?: unknown;
      queryChunks?: unknown[];
    };
    if (candidate.constructor?.name === 'Param' && candidate.value !== undefined) {
      values.push(candidate.value);
    }
    for (const chunk of candidate.queryChunks ?? []) walk(chunk);
  };
  walk(condition);
  return values;
}

function createRepo(row: {
  id: string;
  tenantId: string;
  status: string;
  notificationClaimedUntil: Date | null;
  notificationClaimToken: string | null;
}) {
  const db = {
    updateOne: vi.fn(
      async (_table: unknown, values: Record<string, unknown>, condition: unknown) => {
        const params = conditionValues(condition);
        if (!params.includes(row.id) || !params.includes(row.tenantId)) return undefined;
        if (values.status === 'sent') {
          if (
            row.status !== 'pending' ||
            !row.notificationClaimToken ||
            !params.includes(row.notificationClaimToken)
          ) {
            return undefined;
          }
          Object.assign(row, values);
          return { ...row };
        }
        if (values.notificationClaimToken === null && values.status === undefined) {
          if (
            row.status !== 'pending' ||
            !row.notificationClaimToken ||
            !params.includes(row.notificationClaimToken)
          ) {
            return undefined;
          }
          Object.assign(row, values);
          return { ...row };
        }
        if (values.notificationClaimedUntil instanceof Date) {
          const nowParam = params.find((value) => value instanceof Date) as Date | undefined;
          const now = nowParam ?? new Date();
          if (row.status !== 'pending') return undefined;
          if (row.notificationClaimedUntil && row.notificationClaimedUntil > now) return undefined;
          Object.assign(row, values);
          return { ...row };
        }
        return undefined;
      }
    ),
    selectOne: vi.fn(async () => ({ ...row })),
  } as unknown as IDatabaseAdapter;
  return { db, repo: new AlertRepository(db), row };
}

describe('AlertRepository notification claim', () => {
  it('claims a pending alert once, rejects a stale release, and reclaims after expiry', async () => {
    const { repo, row } = createRepo({
      id: 'alert-1',
      tenantId: 'tenant-1',
      status: 'pending',
      notificationClaimedUntil: null,
      notificationClaimToken: null,
    });
    const lease = new Date('2026-07-28T12:00:30.000Z');
    const first = await repo.claimPendingNotification(
      'alert-1',
      'tenant-1',
      lease,
      new Date('2026-07-28T12:00:00.000Z')
    );
    expect(first?.token).toEqual(row.notificationClaimToken);
    expect(first?.alert.notificationClaimedUntil).toEqual(lease);

    const second = await repo.claimPendingNotification(
      'alert-1',
      'tenant-1',
      lease,
      new Date('2026-07-28T12:00:00.000Z')
    );
    expect(second).toBeUndefined();

    const expired = await repo.claimPendingNotification(
      'alert-1',
      'tenant-1',
      lease,
      new Date('2026-07-28T12:01:00.000Z')
    );
    expect(expired?.token).toBeTruthy();

    const stale = await repo.releaseNotificationClaim('alert-1', 'tenant-1', 'other-token');
    expect(stale).toBeUndefined();
    expect(row.notificationClaimToken).toBe(expired?.token);

    await repo.releaseNotificationClaim('alert-1', 'tenant-1', expired?.token ?? '');
    expect(row.notificationClaimToken).toBeNull();
  });

  it('does not mark a concurrently resolved alert sent', async () => {
    const { repo, row } = createRepo({
      id: 'alert-1',
      tenantId: 'tenant-1',
      status: 'resolved',
      notificationClaimedUntil: new Date('2026-07-28T12:00:30.000Z'),
      notificationClaimToken: 'token-1',
    });
    const completed = await repo.completeNotificationClaim('alert-1', 'tenant-1', 'token-1');
    expect(completed).toBeUndefined();
    expect(row.status).toBe('resolved');
  });

  it('marks sent only for the owning pending claim token', async () => {
    const { repo, row } = createRepo({
      id: 'alert-1',
      tenantId: 'tenant-1',
      status: 'pending',
      notificationClaimedUntil: new Date('2026-07-28T12:00:30.000Z'),
      notificationClaimToken: 'token-1',
    });
    expect(
      await repo.completeNotificationClaim('alert-1', 'tenant-1', 'other-token')
    ).toBeUndefined();
    const completed = await repo.completeNotificationClaim('alert-1', 'tenant-1', 'token-1');
    expect(completed?.status).toBe('sent');
    expect(row.notificationClaimToken).toBeNull();
  });
});
