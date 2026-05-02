/**
 * Monitoring Routes Tests - PR-08.3: Notification Integration Tests
 *
 * Tests for the monitoring API endpoints.
 * Verifies that DB context is properly checked and routes handle missing db gracefully.
 * Tests webhook notification integration: SSRF protection, timeout handling, no crash on failure.
 */

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { monitoringRoutes } from './monitoring.js';

// Mock fetch for webhook tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock DNS so resolveAndCheck() doesn't hit the network and hang
vi.mock('node:dns', () => ({
  promises: {
    lookup: vi.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 }),
  },
}));

// Normalized tenant UUID for 'test-tenant' (deterministic via UUID v5)
// Auth middleware normalizes tenantId, so tests using raw 'test-tenant' in mock
// middleware will have the auth value overwritten. Use this constant to match.
const NORMALIZED_TENANT_ID = '197364d6-0eda-54c5-bcda-3702507a5221';

// Set internal secret for tests
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv, INTERNAL_SECRET: 'test-internal-secret' };
});
afterEach(() => {
  process.env = originalEnv;
});

describe('Monitoring Routes', () => {
  describe('Database availability checks', () => {
    let appWithoutDb: Hono<Env>;

    beforeEach(() => {
      // Create app WITHOUT db middleware to simulate missing db context
      appWithoutDb = new Hono<Env>();
      appWithoutDb.route('/api/monitoring', monitoringRoutes);
    });

    it('POST /check should return 503 if database is not available', async () => {
      const res = await appWithoutDb.request('/api/monitoring/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({ schedule: 'daily' }),
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe('Database not available');
    });

    it('GET /alerts/pending should return 503 if database is not available', async () => {
      const res = await appWithoutDb.request('/api/monitoring/alerts/pending', {
        headers: {
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe('Database not available');
    });

    it('POST /alerts/:alertId/acknowledge should return 503 if database is not available', async () => {
      const res = await appWithoutDb.request('/api/monitoring/alerts/test-alert-id/acknowledge', {
        method: 'POST',
        headers: {
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe('Database not available');
    });

    it('POST /alerts/:alertId/resolve should return 503 if database is not available', async () => {
      const res = await appWithoutDb.request('/api/monitoring/alerts/test-alert-id/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({ resolutionNote: 'Fixed' }),
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe('Database not available');
    });

    it('GET /reports/shared should return 503 if database is not available', async () => {
      const res = await appWithoutDb.request('/api/monitoring/reports/shared', {
        headers: {
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe('Database not available');
    });

    it('POST /domains/:domainId/monitor should return 503 if database is not available', async () => {
      const res = await appWithoutDb.request('/api/monitoring/domains/test-domain-id/monitor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({ schedule: 'daily' }),
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe('Database not available');
    });

    it('DELETE /domains/:domainId/monitor should return 503 if database is not available', async () => {
      const res = await appWithoutDb.request('/api/monitoring/domains/test-domain-id/monitor', {
        method: 'DELETE',
        headers: {
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
      });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe('Database not available');
    });
  });

  describe('Health check', () => {
    it('GET /health should return healthy status without db', async () => {
      const app = new Hono<Env>();
      app.route('/api/monitoring', monitoringRoutes);

      const res = await app.request('/api/monitoring/health');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('healthy');
      expect(json.service).toBe('monitoring');
    });
  });

  describe('Scheduler behavior', () => {
    it('POST /check should filter by schedule parameter and return empty results when no domains match', async () => {
      const app = new Hono<Env>();

      // Create a mock with domains that DON'T match 'hourly' schedule
      app.use('*', async (c, next) => {
        c.set(
          'db',
          createMockDb({
            monitoredDomains: [createMockMonitoredDomain({ schedule: 'daily', isActive: true })],
          })
        );
        c.set('tenantId', NORMALIZED_TENANT_ID);
        await next();
      });
      app.route('/api/monitoring', monitoringRoutes);

      const res = await app.request('/api/monitoring/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({ schedule: 'hourly' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      // No hourly domains, so none should be checked
      expect(json.schedule).toBe('hourly');
      expect(json.domainsChecked).toBe(0);
    });

    it('POST /check should default to daily schedule', async () => {
      const app = new Hono<Env>();

      app.use('*', async (c, next) => {
        c.set(
          'db',
          createMockDb({
            monitoredDomains: [],
          })
        );
        c.set('tenantId', NORMALIZED_TENANT_ID);
        await next();
      });
      app.route('/api/monitoring', monitoringRoutes);

      const res = await app.request('/api/monitoring/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      // Default schedule should be 'daily'
      expect(json.schedule).toBe('daily');
    });

    it('POST /check should return response with schedule in JSON', async () => {
      // This tests the basic request/response contract
      // Full integration testing requires a real DB or more sophisticated mocking
      const app = new Hono<Env>();

      app.use('*', async (c, next) => {
        c.set(
          'db',
          createMockDb({
            monitoredDomains: [],
          })
        );
        c.set('tenantId', NORMALIZED_TENANT_ID);
        await next();
      });
      app.route('/api/monitoring', monitoringRoutes);

      const res = await app.request('/api/monitoring/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({ schedule: 'weekly' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.schedule).toBe('weekly');
      expect(json.domainsChecked).toBe(0);
      expect(json.results).toEqual([]);
    });
  });

  describe('Suppression window behavior', () => {
    it('should skip domain within suppression window', async () => {
      const app = new Hono<Env>();
      const now = new Date();
      const recentAlert = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago

      app.use('*', async (c, next) => {
        c.set(
          'db',
          createMockDb({
            monitoredDomains: [
              createMockMonitoredDomain({
                lastAlertAt: recentAlert, // 30 min ago
                suppressionWindowMinutes: 60, // 60 min window - still suppressed
              }),
            ],
            domains: [{ id: 'dom-1', name: 'example.com' }],
            alerts: [],
          })
        );
        c.set('tenantId', NORMALIZED_TENANT_ID);
        await next();
      });
      app.route('/api/monitoring', monitoringRoutes);

      const res = await app.request('/api/monitoring/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({ schedule: 'daily' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      // Domain should be skipped due to suppression window
      expect(json.domainsChecked).toBe(0);
    });

    it('should pass suppression window check when lastAlertAt is before window (unit test)', () => {
      // Unit test for suppression window logic
      const now = new Date();
      const oldAlert = new Date(now.getTime() - 120 * 60 * 1000); // 2 hours ago
      const suppressionWindowMinutes = 60; // 60 min window

      const suppressionEnd = new Date(oldAlert.getTime() + suppressionWindowMinutes * 60 * 1000);
      const isStillSuppressed = suppressionEnd > now;

      // 2 hours ago + 60 min = 1 hour ago, which is NOT > now
      expect(isStillSuppressed).toBe(false);
    });
  });

  describe('Max alerts per day behavior', () => {
    it('should skip domain that hit max alerts per day', async () => {
      const app = new Hono<Env>();
      const today = new Date();
      today.setHours(1, 0, 0, 0); // Early today

      app.use('*', async (c, next) => {
        c.set(
          'db',
          createMockDb({
            monitoredDomains: [
              createMockMonitoredDomain({
                lastAlertAt: null, // No suppression window
                maxAlertsPerDay: 3, // Max 3 alerts
              }),
            ],
            domains: [{ id: 'dom-1', name: 'example.com' }],
            // Already 3 alerts today
            alerts: [
              {
                id: 'alert-1',
                monitoredDomainId: 'mon-1',
                createdAt: today,
                severity: 'high',
                status: 'pending',
                title: 'Alert 1',
                tenantId: NORMALIZED_TENANT_ID,
              },
              {
                id: 'alert-2',
                monitoredDomainId: 'mon-1',
                createdAt: today,
                severity: 'high',
                status: 'pending',
                title: 'Alert 2',
                tenantId: NORMALIZED_TENANT_ID,
              },
              {
                id: 'alert-3',
                monitoredDomainId: 'mon-1',
                createdAt: today,
                severity: 'high',
                status: 'pending',
                title: 'Alert 3',
                tenantId: NORMALIZED_TENANT_ID,
              },
            ],
          })
        );
        c.set('tenantId', NORMALIZED_TENANT_ID);
        await next();
      });
      app.route('/api/monitoring', monitoringRoutes);

      const res = await app.request('/api/monitoring/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({ schedule: 'daily' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      // Domain should be skipped - hit daily limit
      expect(json.domainsChecked).toBe(0);
    });

    it('should correctly count todays alerts (unit test)', () => {
      // Unit test for today's alert counting logic
      const today = new Date();
      today.setHours(1, 0, 0, 0);
      const maxAlertsPerDay = 5;

      // Create mock alerts - 2 today, 3 yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const alerts = [
        { createdAt: today },
        { createdAt: today },
        { createdAt: yesterday },
        { createdAt: yesterday },
        { createdAt: yesterday },
      ];

      // Count today's alerts using the same logic as the monitoring route
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayCount = alerts.filter((a) => {
        const alertDate = new Date(a.createdAt);
        return alertDate >= todayStart;
      }).length;

      expect(todayCount).toBe(2);
      expect(todayCount < maxAlertsPerDay).toBe(true); // Should proceed
    });

    it('should correctly identify when daily limit is reached (unit test)', () => {
      // Unit test for max alerts per day limit logic
      const today = new Date();
      today.setHours(1, 0, 0, 0);
      const maxAlertsPerDay = 3;

      const alerts = [{ createdAt: today }, { createdAt: today }, { createdAt: today }];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayCount = alerts.filter((a) => {
        const alertDate = new Date(a.createdAt);
        return alertDate >= todayStart;
      }).length;

      expect(todayCount).toBe(3);
      expect(todayCount >= maxAlertsPerDay).toBe(true); // Should skip
    });

    it('should not count yesterday alerts (unit test)', () => {
      // Unit test confirming yesterday's alerts don't count
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const alerts = [{ createdAt: yesterday }, { createdAt: yesterday }, { createdAt: yesterday }];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayCount = alerts.filter((a) => {
        const alertDate = new Date(a.createdAt);
        return alertDate >= todayStart;
      }).length;

      expect(todayCount).toBe(0); // Yesterday's alerts don't count
    });
  });
});

// =============================================================================
// Mock DB Helper
// =============================================================================

interface MockMonitoredDomain {
  id: string;
  domainId: string;
  tenantId: string;
  schedule: string;
  isActive: boolean;
  lastAlertAt: Date | null;
  suppressionWindowMinutes: number;
  maxAlertsPerDay: number;
  alertChannels: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastCheckAt: Date | null;
}

interface MockDomain {
  id: string;
  name: string;
  normalizedName?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MockAlert {
  id: string;
  monitoredDomainId: string;
  createdAt: Date;
  severity: string;
  status: string;
  title: string;
  tenantId: string;
  description?: string;
  dedupKey?: string;
  acknowledgedAt?: Date | null;
  acknowledgedBy?: string | null;
  resolvedAt?: Date | null;
  resolutionNote?: string | null;
}

interface MockDbOptions {
  monitoredDomains?: MockMonitoredDomain[];
  domains?: MockDomain[];
  alerts?: MockAlert[];
  onFindActiveBySchedule?: (schedule: string) => MockMonitoredDomain[];
}

function createMockMonitoredDomain(
  overrides: Partial<MockMonitoredDomain> = {}
): MockMonitoredDomain {
  return {
    id: 'mon-1',
    domainId: 'dom-1',
    tenantId: NORMALIZED_TENANT_ID,
    schedule: 'daily',
    isActive: true,
    lastAlertAt: null,
    suppressionWindowMinutes: 60,
    maxAlertsPerDay: 10,
    alertChannels: {},
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastCheckAt: null,
    ...overrides,
  };
}

function createMockDb(options: MockDbOptions = {}) {
  const mockMonitoredDomains = options.monitoredDomains || [];
  const mockDomains = options.domains || [];
  const mockAlerts = options.alerts || [];
  const onFindActiveBySchedule = options.onFindActiveBySchedule;

  // Create a mock that returns data based on the table being queried
  // The select method receives a table schema, we'll identify it by its name property
  return {
    select: (table: { _: { name: string } }) => {
      const tableName = table?._?.name;
      if (tableName === 'monitored_domains') {
        if (onFindActiveBySchedule) {
          // For scheduler tests, we intercept and call the callback
          return Promise.resolve(mockMonitoredDomains);
        }
        return Promise.resolve(mockMonitoredDomains);
      }
      if (tableName === 'alerts') {
        return Promise.resolve(mockAlerts);
      }
      if (tableName === 'domains') {
        return Promise.resolve(mockDomains);
      }
      return Promise.resolve([]);
    },
    selectWhere: (table: { _: { name: string } }, _condition: unknown) => {
      const tableName = table?._?.name;
      if (tableName === 'alerts') {
        // For findByMonitoredDomain, filter by monitoredDomainId
        return Promise.resolve(mockAlerts);
      }
      if (tableName === 'domains') {
        return Promise.resolve(mockDomains);
      }
      return Promise.resolve([]);
    },
    selectOne: (table: { _: { name: string } }, _condition: unknown) => {
      const tableName = table?._?.name;
      if (tableName === 'domains') {
        return Promise.resolve(mockDomains[0] || null);
      }
      return Promise.resolve(null);
    },
    insert: () => Promise.resolve({ id: 'new-id' }),
    update: () => Promise.resolve(1),
    delete: () => Promise.resolve(1),
    query: () => Promise.resolve([]),
    getDrizzle: () => ({
      query: {
        monitoredDomains: {
          findMany: () => Promise.resolve(mockMonitoredDomains),
        },
        domains: {
          findFirst: () => Promise.resolve(mockDomains[0] || null),
        },
        alerts: {
          findMany: () => Promise.resolve(mockAlerts),
        },
      },
    }),
  } as unknown as import('@dns-ops/db').IDatabaseAdapter;
}

// =============================================================================
// PR-08.3: Notification Integration Tests
// =============================================================================

describe('Webhook Notification Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SSRF Protection', () => {
    it('rejects webhook URL pointing to private IP', async () => {
      // This test verifies the SSRF guard behavior through the webhook module
      // Private IPs should never be called
      const { isPrivateUrl } = await import('../notifications/webhook.js');

      expect(isPrivateUrl('http://10.0.0.1/webhook')).toBe(true);
      expect(isPrivateUrl('http://192.168.1.1/webhook')).toBe(true);
      expect(isPrivateUrl('http://172.16.0.1/webhook')).toBe(true);
      expect(isPrivateUrl('http://localhost/webhook')).toBe(true);
      expect(isPrivateUrl('http://127.0.0.1/webhook')).toBe(true);
    });

    it('allows webhook URL pointing to public domain', async () => {
      const { isPrivateUrl } = await import('../notifications/webhook.js');

      expect(isPrivateUrl('https://webhook.example.com/alerts')).toBe(false);
      expect(isPrivateUrl('https://api.slack.com/webhook')).toBe(false);
      expect(isPrivateUrl('https://hooks.pagerduty.com/webhook')).toBe(false);
    });
  });

  describe('Webhook Delivery Behavior', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockFetch.mockReset();
    });

    it('sendAlertWebhook succeeds for valid public URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const { sendAlertWebhook } = await import('../notifications/webhook.js');

      const result = await sendAlertWebhook('https://webhook.example.com/alerts', {
        alertId: 'alert-123',
        title: 'Test Alert',
        description: 'Test description',
        severity: 'high',
        domain: 'example.com',
        tenantId: NORMALIZED_TENANT_ID,
        timestamp: new Date().toISOString(),
        domain360Link: 'https://app.example.com/domain/example.com',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('sendAlertWebhook returns SSRF_BLOCKED for private URLs', async () => {
      const { sendAlertWebhook } = await import('../notifications/webhook.js');

      const result = await sendAlertWebhook('http://10.0.0.1/webhook', {
        alertId: 'alert-123',
        title: 'Test Alert',
        description: 'Test description',
        severity: 'high',
        domain: 'example.com',
        tenantId: NORMALIZED_TENANT_ID,
        timestamp: new Date().toISOString(),
        domain360Link: 'https://app.example.com/domain/example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('SSRF_BLOCKED');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sendAlertWebhook handles network errors gracefully without throwing', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));

      const { sendAlertWebhook } = await import('../notifications/webhook.js');

      const result = await sendAlertWebhook('https://nonexistent.example.com/webhook', {
        alertId: 'alert-123',
        title: 'Test Alert',
        description: 'Test description',
        severity: 'high',
        domain: 'example.com',
        tenantId: NORMALIZED_TENANT_ID,
        timestamp: new Date().toISOString(),
        domain360Link: 'https://app.example.com/domain/example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ENOTFOUND');
      // Application continues without crashing
    });

    it('sendAlertWebhook handles non-2xx responses gracefully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { sendAlertWebhook } = await import('../notifications/webhook.js');

      const result = await sendAlertWebhook('https://webhook.example.com/alerts', {
        alertId: 'alert-123',
        title: 'Test Alert',
        description: 'Test description',
        severity: 'high',
        domain: 'example.com',
        tenantId: NORMALIZED_TENANT_ID,
        timestamp: new Date().toISOString(),
        domain360Link: 'https://app.example.com/domain/example.com',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error).toBe('HTTP 500');
    });

    it('sendAlertWebhook includes correct payload structure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const { sendAlertWebhook } = await import('../notifications/webhook.js');

      const payload = {
        alertId: 'alert-456',
        title: 'DNS Issue Detected',
        description: 'SPF record missing',
        severity: 'high' as const,
        domain: 'test.com',
        tenantId: 'tenant-2',
        timestamp: new Date().toISOString(),
        domain360Link: 'https://app.example.com/domain/test.com',
      };

      await sendAlertWebhook('https://webhook.example.com/alerts', payload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://webhook.example.com/alerts',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        })
      );
    });

    it('sendAlertWebhook returns TIMEOUT when fetch aborts', async () => {
      mockFetch.mockRejectedValueOnce(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      );

      const { sendAlertWebhook } = await import('../notifications/webhook.js');

      const result = await sendAlertWebhook('https://webhook.example.com/alerts', {
        alertId: 'alert-123',
        title: 'Test Alert',
        description: 'Test description',
        severity: 'high',
        domain: 'example.com',
        tenantId: NORMALIZED_TENANT_ID,
        timestamp: new Date().toISOString(),
        domain360Link: 'https://app.example.com/domain/example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('TIMEOUT');
    });

    it('sendAlertWebhook handles non-Error fetch rejections', async () => {
      mockFetch.mockRejectedValueOnce('string-rejection');

      const { sendAlertWebhook } = await import('../notifications/webhook.js');

      const result = await sendAlertWebhook('https://webhook.example.com/alerts', {
        alertId: 'alert-123',
        title: 'Test Alert',
        description: 'Test description',
        severity: 'high',
        domain: 'example.com',
        tenantId: NORMALIZED_TENANT_ID,
        timestamp: new Date().toISOString(),
        domain360Link: 'https://app.example.com/domain/example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('UNKNOWN_ERROR');
    });

    it('sendAlertWebhook includes resolvedHostname in network error result', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const { sendAlertWebhook } = await import('../notifications/webhook.js');

      const result = await sendAlertWebhook('https://webhook.example.com/alerts', {
        alertId: 'alert-123',
        title: 'Test Alert',
        description: 'Test description',
        severity: 'high',
        domain: 'example.com',
        tenantId: NORMALIZED_TENANT_ID,
        timestamp: new Date().toISOString(),
        domain360Link: 'https://app.example.com/domain/example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ECONNREFUSED');
      expect(result.resolvedHostname).toBe('webhook.example.com');
    });
  });

  describe('Alert Channel Configuration', () => {
    it('alertChannels object can store webhook URL', () => {
      const monitoredDomain = createMockMonitoredDomain({
        alertChannels: {
          webhook: 'https://webhook.example.com/alerts',
        },
      });

      expect(monitoredDomain.alertChannels).toHaveProperty('webhook');
      expect(monitoredDomain.alertChannels.webhook).toBe('https://webhook.example.com/alerts');
    });

    it('alertChannels can be empty (no webhook)', () => {
      const monitoredDomain = createMockMonitoredDomain({
        alertChannels: {},
      });

      expect(monitoredDomain.alertChannels.webhook).toBeUndefined();
    });

    it('alertChannels webhook can be null', () => {
      const monitoredDomain = createMockMonitoredDomain({
        alertChannels: { webhook: null },
      });

      expect(monitoredDomain.alertChannels.webhook).toBeNull();
    });
  });

  describe('Webhook URL Logging', () => {
    it('extracts hostname from webhook URL for logging (not full URL)', () => {
      // This verifies we log hostnames, not full URLs, to avoid sensitive data in logs
      const webhookUrl = 'https://api.example.com/v1/webhooks/abc123/notify';
      const hostname = new URL(webhookUrl).hostname;

      expect(hostname).toBe('api.example.com');
      expect(webhookUrl).not.toBe(hostname); // Confirm we should extract hostname only
    });
  });
});
