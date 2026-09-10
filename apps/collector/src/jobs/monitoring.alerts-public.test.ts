import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

const alertRepo = vi.hoisted(() => ({
  findPending: vi.fn(),
  acknowledge: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('@dns-ops/db', () => ({
  AlertRepository: class {
    findPending = alertRepo.findPending;
    acknowledge = alertRepo.acknowledge;
    resolve = alertRepo.resolve;
  },
  DomainRepository: class {},
  MonitoredDomainRepository: class {},
}));

import { monitoringRoutes } from './monitoring.js';

const claimedAlert = {
  id: 'alert-1',
  monitoredDomainId: 'mon-1',
  title: 'Claimed alert',
  description: 'desc',
  severity: 'high',
  triggeredByFindingId: null,
  signalId: 'signal-1',
  status: 'pending',
  dedupKey: 'key',
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  resolutionNote: null,
  tenantId: 'tenant-1',
  createdAt: new Date('2026-07-28T12:00:00.000Z'),
  notificationClaimToken: 'claim-token-should-not-leak',
  notificationClaimedUntil: new Date('2099-01-01T00:00:00.000Z'),
};

function expectNoClaimFields(alert: Record<string, unknown> | undefined) {
  expect(alert).toBeDefined();
  expect(alert).not.toHaveProperty('notificationClaimToken');
  expect(alert).not.toHaveProperty('notificationClaimedUntil');
  expect(JSON.stringify(alert)).not.toContain('claim-token-should-not-leak');
}

describe('monitoring alert responses omit claim fields', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    process.env.INTERNAL_SECRET = 'test-internal-secret';
    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', {} as Env['Variables']['db']);
      c.set('tenantId', 'tenant-1');
      c.set('actorId', 'actor-1');
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);
    vi.clearAllMocks();
    alertRepo.findPending.mockResolvedValue([{ ...claimedAlert }]);
    alertRepo.acknowledge.mockResolvedValue({ ...claimedAlert, status: 'acknowledged' });
    alertRepo.resolve.mockResolvedValue({ ...claimedAlert, status: 'resolved' });
  });

  const headers = {
    'X-Internal-Secret': 'test-internal-secret',
    'X-Tenant-Id': 'tenant-1',
    'X-Actor-Id': 'actor-1',
    'Content-Type': 'application/json',
  };

  it('omits claim fields from GET pending', async () => {
    const response = await app.request('/api/monitoring/alerts/pending', { headers });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { alerts: Array<Record<string, unknown>> };
    expectNoClaimFields(json.alerts[0]);
    expect(json.alerts[0]?.signalId).toBe('signal-1');
  });

  it('omits claim fields from POST acknowledge', async () => {
    const response = await app.request('/api/monitoring/alerts/alert-1/acknowledge', {
      method: 'POST',
      headers,
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { alert: Record<string, unknown> };
    expectNoClaimFields(json.alert);
  });

  it('omits claim fields from POST resolve', async () => {
    const response = await app.request('/api/monitoring/alerts/alert-1/resolve', {
      method: 'POST',
      headers,
      body: JSON.stringify({ resolutionNote: 'done' }),
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { alert: Record<string, unknown> };
    expectNoClaimFields(json.alert);
  });
});
