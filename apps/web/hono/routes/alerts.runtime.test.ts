/**
 * Alert shared report route tests
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { alertRoutes } from './alerts.js';

interface MockState {
  alerts: Array<Record<string, unknown>>;
  monitoredDomains: Array<Record<string, unknown>>;
  sharedReports: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') {
    return record[symbolName] as string;
  }
  const symbols = Object.getOwnPropertySymbols(record);
  const drizzleName = symbols.find((symbol) => String(symbol) === 'Symbol(drizzle:Name)');
  if (drizzleName && typeof record[drizzleName] === 'string') {
    return record[drizzleName] as string;
  }
  return '';
}

function getConditionParam(condition: unknown): unknown {
  return getConditionParams(condition)[0];
}

function getConditionParams(condition: unknown): unknown[] {
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

function createMockDb(state: MockState): IDatabaseAdapter {
  return {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => {
      const tableName = getTableName(table);
      if (tableName === 'alerts') return [...state.alerts];
      if (tableName === 'monitored_domains') return [...state.monitoredDomains];
      if (tableName === 'shared_reports') return [...state.sharedReports];
      if (tableName === 'audit_events') return [...state.auditEvents];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'alerts')
        return state.alerts.filter((row) => row.status === param || row.tenantId === param);
      if (tableName === 'monitored_domains')
        return state.monitoredDomains.filter((row) => row.tenantId === param);
      if (tableName === 'shared_reports')
        return state.sharedReports.filter((row) => row.tenantId === param);
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'shared_reports')
        return state.sharedReports.find((row) => row.id === param);
      if (tableName === 'alerts') return state.alerts.find((row) => row.id === param);
      return undefined;
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      const tableName = getTableName(table);
      if (tableName === 'shared_reports') {
        const row = {
          id: `report-${state.sharedReports.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...values,
        };
        state.sharedReports.push(row);
        return row;
      }
      if (tableName === 'audit_events') {
        const row = {
          id: `audit-${state.auditEvents.length + 1}`,
          createdAt: new Date(),
          ...values,
        };
        state.auditEvents.push(row);
        return row;
      }
      return values;
    }),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(
      async (table: unknown, values: Record<string, unknown>, condition: unknown) => {
        const tableName = getTableName(table);
        const param = getConditionParam(condition);
        if (tableName === 'shared_reports') {
          const index = state.sharedReports.findIndex((row) => row.id === param);
          if (index === -1) return undefined;
          state.sharedReports[index] = {
            ...state.sharedReports[index],
            ...values,
          };
          return state.sharedReports[index];
        }
        if (tableName === 'alerts') {
          const params = getConditionParams(condition);
          const index = state.alerts.findIndex((row) => params.includes(row.id));
          if (index === -1) return undefined;
          state.alerts[index] = {
            ...state.alerts[index],
            ...values,
          };
          return state.alerts[index];
        }
        return undefined;
      }
    ),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(async (callback: (db: IDatabaseAdapter) => Promise<unknown>) =>
      callback(createMockDb(state))
    ),
  } as unknown as IDatabaseAdapter;
}

function createApp(state: MockState, auth = true) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    if (auth) {
      c.set('tenantId', 'tenant-1');
      c.set('actorId', 'actor-1');
    }
    await next();
  });
  app.route('/api/alerts', alertRoutes);
  return app;
}

describe('alertRoutes shared reports', () => {
  it('creates a persisted shared report with redacted alert summary', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-1',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'SPF issue',
          description: 'internal-only detail',
          severity: 'high',
          status: 'pending',
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [{ id: 'mon-1', tenantId: 'tenant-1' }],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/alerts/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Weekly external report', visibility: 'shared' }),
    });

    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      report: { alertSummary: Array<Record<string, unknown>>; shareToken?: string };
      shareUrl?: string;
    };

    expect(json.shareUrl).toContain('/api/alerts/reports/shared/');
    expect(json.report.alertSummary).toHaveLength(1);
    expect(json.report.alertSummary[0]?.description).toBeUndefined();
    expect(json.report.alertSummary[0]?.id).toBeUndefined();
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('shared_report_created');
    expect(state.auditEvents[0]?.entityType).toBe('shared_report');
    expect(state.auditEvents[0]?.entityId).toBeDefined();
  });

  it('serves a shared report by token without auth', async () => {
    const state: MockState = {
      alerts: [],
      monitoredDomains: [],
      sharedReports: [
        {
          id: 'report-1',
          tenantId: 'tenant-1',
          createdBy: 'actor-1',
          title: 'Public report',
          visibility: 'shared',
          status: 'ready',
          shareToken: 'share-token',
          summary: {
            totalMonitored: 1,
            activeAlerts: 1,
            bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
          },
          alertSummary: [
            {
              title: 'SPF issue',
              severity: 'high',
              status: 'pending',
              createdAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state, false);

    const response = await app.request('/api/alerts/reports/shared/share-token');

    expect(response.status).toBe(200);
    const json = (await response.json()) as { report: Record<string, unknown> };
    expect(json.report.title).toBe('Public report');
    expect(json.report.summary).toBeDefined();
  });

  it('returns 410 for shared report with expiresAt in the past', async () => {
    const pastDate = new Date('2020-01-01'); // Expired in the past
    const state: MockState = {
      alerts: [],
      monitoredDomains: [],
      sharedReports: [
        {
          id: 'report-expired',
          tenantId: 'tenant-1',
          createdBy: 'actor-1',
          title: 'Expired report',
          visibility: 'shared',
          status: 'ready',
          shareToken: 'expired-token',
          expiresAt: pastDate,
          summary: { totalMonitored: 0, activeAlerts: 0, bySeverity: {} },
          alertSummary: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state, false);

    const response = await app.request('/api/alerts/reports/shared/expired-token');

    expect(response.status).toBe(410);
    const json = (await response.json()) as { error: string };
    expect(json.error).toContain('expired');
  });

  it('returns 410 for report past expiresAt timestamp', async () => {
    // Create a report that expired yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const state: MockState = {
      alerts: [],
      monitoredDomains: [],
      sharedReports: [
        {
          id: 'report-yesterday',
          tenantId: 'tenant-1',
          createdBy: 'actor-1',
          title: 'Yesterday report',
          visibility: 'shared',
          status: 'ready',
          shareToken: 'yesterday-token',
          expiresAt: yesterday,
          summary: { totalMonitored: 1, activeAlerts: 1, bySeverity: { high: 1 } },
          alertSummary: [
            { title: 'Test alert', severity: 'high', status: 'pending', createdAt: new Date() },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state, false);

    const response = await app.request('/api/alerts/reports/shared/yesterday-token');

    expect(response.status).toBe(410);
    const json = (await response.json()) as { error: string };
    expect(json.error).toContain('expired');
  });

  it('allows access to shared report within valid expiresAt window', async () => {
    // Create a report that expires tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const state: MockState = {
      alerts: [],
      monitoredDomains: [],
      sharedReports: [
        {
          id: 'report-valid',
          tenantId: 'tenant-1',
          createdBy: 'actor-1',
          title: 'Valid report',
          visibility: 'shared',
          status: 'ready',
          shareToken: 'valid-token',
          expiresAt: tomorrow,
          summary: { totalMonitored: 2, activeAlerts: 2, bySeverity: { critical: 1, high: 1 } },
          alertSummary: [
            {
              title: 'Critical alert',
              severity: 'critical',
              status: 'pending',
              createdAt: new Date(),
            },
            { title: 'High alert', severity: 'high', status: 'pending', createdAt: new Date() },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state, false);

    const response = await app.request('/api/alerts/reports/shared/valid-token');

    expect(response.status).toBe(200);
    const json = (await response.json()) as { report: Record<string, unknown> };
    expect(json.report.title).toBe('Valid report');
    expect(json.report.expiresAt).toBeDefined();
  });

  it('returns 404 for non-existent token', async () => {
    const state: MockState = {
      alerts: [],
      monitoredDomains: [],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state, false);

    const response = await app.request('/api/alerts/reports/shared/nonexistent-token');

    expect(response.status).toBe(404);
  });

  it('expires shared report and verifies subsequent access fails', async () => {
    const state: MockState = {
      alerts: [],
      monitoredDomains: [],
      sharedReports: [
        {
          id: 'report-to-expire',
          tenantId: 'tenant-1',
          createdBy: 'actor-1',
          title: 'Report to expire',
          visibility: 'shared',
          status: 'ready',
          shareToken: 'expire-token',
          summary: { totalMonitored: 1, activeAlerts: 0, bySeverity: {} },
          alertSummary: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state);

    // Verify report is accessible before expiring
    const beforeResponse = await app.request('/api/alerts/reports/shared/expire-token');
    expect(beforeResponse.status).toBe(200);

    // Expire the report
    const expireResponse = await app.request('/api/alerts/reports/report-to-expire/expire', {
      method: 'POST',
    });
    expect(expireResponse.status).toBe(200);

    // Verify report is no longer accessible (returns 410 Gone)
    const afterResponse = await app.request('/api/alerts/reports/shared/expire-token');
    expect(afterResponse.status).toBe(410);
    const afterJson = (await afterResponse.json()) as { error: string };
    expect(afterJson.error).toContain('expired');

    // Verify audit event was created
    expect(state.auditEvents.some((e) => e.action === 'shared_report_expired')).toBe(true);
  });
});

// ===========================================================================
// ALERT DEDUP AND NOISE BUDGET TESTS - PR-04.5
// ===========================================================================

describe('Alert Dedup and Noise Budget (PR-04.5)', () => {
  it('should show suppressed alerts with suppression metadata', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-suppressed',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'Suppressed alert',
          severity: 'medium',
          status: 'suppressed',
          suppressionReason: 'noise_budget_exceeded',
          suppressionCount: 1,
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [
        {
          id: 'mon-1',
          tenantId: 'tenant-1',
          maxAlertsPerDay: 5,
        },
      ],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/alerts');

    expect(response.status).toBe(200);
    const json = (await response.json()) as { alerts: Array<Record<string, unknown>> };
    const suppressedAlert = json.alerts.find((a) => a.id === 'alert-suppressed');
    expect(suppressedAlert).toBeDefined();
    expect(suppressedAlert?.status).toBe('suppressed');
  });

  it('should support suppress endpoint for alert deduplication', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-to-suppress',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'Alert to suppress',
          severity: 'low',
          status: 'pending',
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [
        {
          id: 'mon-1',
          tenantId: 'tenant-1',
        },
      ],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);

    // Suppress the alert
    const response = await app.request('/api/alerts/alert-to-suppress/suppress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'noise_budget_exceeded' }),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as { alert?: Record<string, unknown> };
    expect(json.alert?.status).toBe('suppressed');
    expect(state.auditEvents.some((e) => e.action === 'alert_suppressed')).toBe(true);
  });

  it('should audit alert suppression with reason', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-reason',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'Alert with reason',
          severity: 'medium',
          status: 'pending',
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [
        {
          id: 'mon-1',
          tenantId: 'tenant-1',
        },
      ],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);

    await app.request('/api/alerts/alert-reason/suppress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'test_suppression' }),
    });

    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('alert_suppressed');
  });

  it('should filter alerts by status including suppressed', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-pending',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'Pending alert',
          severity: 'high',
          status: 'pending',
          createdAt: new Date(),
        },
        {
          id: 'alert-suppressed',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'Suppressed alert',
          severity: 'low',
          status: 'suppressed',
          suppressionReason: 'dedup',
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [
        {
          id: 'mon-1',
          tenantId: 'tenant-1',
        },
      ],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);

    // Filter for suppressed alerts
    const response = await app.request('/api/alerts?status=suppressed');
    expect(response.status).toBe(200);
    const json = (await response.json()) as { alerts: Array<Record<string, unknown>> };
    expect(json.alerts).toHaveLength(1);
    expect(json.alerts[0]?.id).toBe('alert-suppressed');
    expect(json.alerts[0]?.status).toBe('suppressed');
  });
});

describe('alertRoutes mutations', () => {
  it('audits alert acknowledgement', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-1',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'SPF issue',
          description: 'Needs acknowledgement',
          severity: 'high',
          status: 'pending',
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [{ id: 'mon-1', tenantId: 'tenant-1' }],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/alerts/alert-1/acknowledge', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
    });

    expect(response.status).toBe(200);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('alert_acknowledged');
    expect(state.auditEvents[0]?.previousValue).toMatchObject({ status: 'pending' });
    expect(state.auditEvents[0]?.newValue).toMatchObject({
      status: 'acknowledged',
      acknowledgedBy: 'actor-1',
    });
    expect(state.auditEvents[0]?.ipAddress).toBe('198.51.100.7');
  });

  it('audits alert resolution', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-1',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'SPF issue',
          description: 'Needs resolution',
          severity: 'high',
          status: 'acknowledged',
          createdAt: new Date(),
        },
        {
          id: 'alert-2',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'Other alert',
          description: 'Should remain pending',
          severity: 'medium',
          status: 'pending',
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [{ id: 'mon-1', tenantId: 'tenant-1' }],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/alerts/alert-1/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNote: 'Patched SPF record' }),
    });

    expect(response.status).toBe(200);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('alert_resolved');
    expect(state.auditEvents[0]?.previousValue).toMatchObject({ status: 'acknowledged' });
    expect(state.auditEvents[0]?.newValue).toMatchObject({
      status: 'resolved',
      resolutionNote: 'Patched SPF record',
    });
    expect(state.alerts[0]?.status).toBe('resolved');
    expect(state.alerts[1]?.status).toBe('pending');
  });

  it('rejects generic resolve of a signal-linked canonical alert', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-canonical',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'Redirect regression',
          description: 'Needs evidence',
          severity: 'high',
          status: 'pending',
          signalId: 'signal-1',
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [{ id: 'mon-1', tenantId: 'tenant-1' }],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);
    const response = await app.request('/api/alerts/alert-canonical/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNote: 'Looks fixed' }),
    });
    expect(response.status).toBe(409);
    const json = (await response.json()) as { error?: string };
    expect(json.error).toContain('fresh conclusive evidence');
    expect(state.alerts[0]?.status).toBe('pending');
  });

  it('audits alert suppression', async () => {
    const state: MockState = {
      alerts: [
        {
          id: 'alert-1',
          monitoredDomainId: 'mon-1',
          tenantId: 'tenant-1',
          title: 'SPF issue',
          description: 'Needs suppression',
          severity: 'high',
          status: 'pending',
          createdAt: new Date(),
        },
      ],
      monitoredDomains: [{ id: 'mon-1', tenantId: 'tenant-1' }],
      sharedReports: [],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/alerts/alert-1/suppress', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('alert_suppressed');
    expect(state.auditEvents[0]?.previousValue).toMatchObject({ status: 'pending' });
    expect(state.auditEvents[0]?.newValue).toMatchObject({ status: 'suppressed' });
  });

  it('audits shared report expiration', async () => {
    const state: MockState = {
      alerts: [],
      monitoredDomains: [],
      sharedReports: [
        {
          id: 'report-1',
          tenantId: 'tenant-1',
          createdBy: 'actor-1',
          title: 'Public report',
          visibility: 'shared',
          status: 'ready',
          shareToken: 'share-token',
          summary: {
            totalMonitored: 1,
            activeAlerts: 1,
            bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
          },
          alertSummary: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/alerts/reports/report-1/expire', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('shared_report_expired');
    expect(state.auditEvents[0]?.previousValue).toMatchObject({ status: 'ready' });
    expect(state.auditEvents[0]?.newValue).toMatchObject({ status: 'expired' });
    expect(state.sharedReports[0]?.status).toBe('expired');
  });
});

describe('alertRoutes omit notification claim fields', () => {
  const claimedAlert = {
    id: 'alert-claimed',
    monitoredDomainId: 'mon-1',
    tenantId: 'tenant-1',
    title: 'Claimed alert',
    description: 'secret-adjacent',
    severity: 'high' as const,
    status: 'pending' as const,
    createdAt: new Date(),
    notificationClaimToken: 'claim-token-should-not-leak',
    notificationClaimedUntil: new Date('2099-01-01T00:00:00.000Z'),
  };

  function claimedState(): MockState {
    return {
      alerts: [{ ...claimedAlert }],
      monitoredDomains: [{ id: 'mon-1', tenantId: 'tenant-1' }],
      sharedReports: [],
      auditEvents: [],
    };
  }

  function expectNoClaimFields(alert: Record<string, unknown> | undefined) {
    expect(alert).toBeDefined();
    expect(alert).not.toHaveProperty('notificationClaimToken');
    expect(alert).not.toHaveProperty('notificationClaimedUntil');
    expect(JSON.stringify(alert)).not.toContain('claim-token-should-not-leak');
  }

  it('omits claim fields from list and get', async () => {
    const app = createApp(claimedState());
    const list = await app.request('/api/alerts');
    expect(list.status).toBe(200);
    const listJson = (await list.json()) as { alerts: Array<Record<string, unknown>> };
    expectNoClaimFields(listJson.alerts[0]);

    const get = await app.request('/api/alerts/alert-claimed');
    expect(get.status).toBe(200);
    const getJson = (await get.json()) as { alert: Record<string, unknown> };
    expectNoClaimFields(getJson.alert);
  });

  it('omits claim fields from acknowledge, resolve, and suppress', async () => {
    for (const path of [
      '/api/alerts/alert-claimed/acknowledge',
      '/api/alerts/alert-claimed/resolve',
      '/api/alerts/alert-claimed/suppress',
    ]) {
      const app = createApp(claimedState());
      const response = await app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(200);
      const json = (await response.json()) as { alert: Record<string, unknown> };
      expectNoClaimFields(json.alert);
    }
  });
});
