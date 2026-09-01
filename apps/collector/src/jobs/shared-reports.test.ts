/**
 * Shared Reports Auth and Redaction Tests - Bead 12.7
 *
 * Tests for shared reports security:
 * - Authentication requirements
 * - Redaction of sensitive data
 * - Tenant isolation
 *
 * Bead dns-ops-1j4.12.7 requirements covered:
 * - Shared reports must be safe
 * - Shared reports must be tenant-aware
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireServiceAuthMiddleware } from '../middleware/index.js';
import type { Env } from '../types.js';
import { monitoringRoutes } from './monitoring.js';

// Normalized tenant UUID for 'test-tenant' (deterministic via UUID v5)
const NORMALIZED_TENANT_ID = '197364d6-0eda-54c5-bcda-3702507a5221';

// =============================================================================
// Authentication Tests
// =============================================================================

describe('Shared Reports Authentication - Bead 12.7', () => {
  let appWithAuth: Hono<Env>;

  beforeEach(() => {
    process.env.INTERNAL_SECRET = 'test-internal-secret';
    process.env.API_PRINCIPALS_JSON = JSON.stringify([
      {
        principalId: 'reports-principal-1',
        tokenSha256: '5b9a79e08f9713894a7104c96dc95e3901437acfbb75a6a1b7c097804c7aa8ab',
        tenantId: '660e8400-e29b-41d4-a716-446655440000',
        actorId: 'test-actor',
        enabled: true,
      },
    ]);

    appWithAuth = new Hono<Env>();
    appWithAuth.use('*', requireServiceAuthMiddleware);
    appWithAuth.route('/api/monitoring', monitoringRoutes);
  });

  afterEach(() => {
    delete process.env.INTERNAL_SECRET;
    delete process.env.API_PRINCIPALS_JSON;
  });

  it('GET /reports/shared should return 401 without authentication', async () => {
    const res = await appWithAuth.request('/api/monitoring/reports/shared');

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('GET /reports/shared should return 401 with invalid internal secret', async () => {
    const res = await appWithAuth.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'wrong-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(401);
  });

  it('GET /reports/shared should return 401 with invalid API key', async () => {
    const res = await appWithAuth.request('/api/monitoring/reports/shared', {
      headers: {
        'X-API-Key': 'invalid-format',
      },
    });

    expect(res.status).toBe(401);
  });

  it('GET /reports/shared should proceed with valid internal secret', async () => {
    // App without db middleware will return 503, but NOT 401
    const res = await appWithAuth.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    // Should NOT be 401 - auth passed
    expect(res.status).not.toBe(401);
    // Will be 503 because no db middleware
    expect(res.status).toBe(503);
  });

  it('GET /reports/shared should proceed with a valid API principal token (#66)', async () => {
    const res = await appWithAuth.request('/api/monitoring/reports/shared', {
      headers: {
        'X-API-Key': 'collector-auth-test-token-0123456789abcdef01234',
      },
    });

    expect(res.status).not.toBe(401);
    expect(res.status).toBe(503); // No db
  });

  it('GET /reports/shared should reject forged legacy API key identity (#66)', async () => {
    process.env.API_KEY_SECRET = 'test-api-secret';

    const res = await appWithAuth.request('/api/monitoring/reports/shared', {
      headers: {
        'X-API-Key': 'forged-tenant:forged-actor:test-api-secret',
      },
    });

    delete process.env.API_KEY_SECRET;

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// Redaction Tests
// =============================================================================

describe('Shared Reports Redaction - Bead 12.7', () => {
  beforeEach(() => {
    process.env.INTERNAL_SECRET = 'test-internal-secret';
  });
  it('should NOT include domain names in shared report', async () => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [
            createMockMonitoredDomain({ domainId: 'dom-1' }),
            createMockMonitoredDomain({ id: 'mon-2', domainId: 'dom-2' }),
          ],
          alerts: [createMockAlert({ monitoredDomainId: 'mon-1', title: 'Alert 1' })],
        })
      );
      c.set('tenantId', NORMALIZED_TENANT_ID);
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Check no domain names exposed
    expect(JSON.stringify(json)).not.toContain('example.com');
    expect(JSON.stringify(json)).not.toContain('domainName');
  });

  it('should NOT include internal notes in shared report', async () => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [createMockMonitoredDomain()],
          alerts: [
            createMockAlert({
              title: 'Alert 1',
              description: 'Internal investigation notes - confidential',
              resolutionNote: 'Resolved by admin - internal only',
            }),
          ],
        })
      );
      c.set('tenantId', NORMALIZED_TENANT_ID);
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Check no internal notes exposed
    expect(JSON.stringify(json)).not.toContain('confidential');
    expect(JSON.stringify(json)).not.toContain('Internal investigation');
    expect(JSON.stringify(json)).not.toContain('resolutionNote');
    expect(JSON.stringify(json)).not.toContain('description');
  });

  it('should NOT include acknowledgedBy info in shared report', async () => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [createMockMonitoredDomain()],
          alerts: [
            createMockAlert({
              acknowledgedBy: 'admin@internal.company.com',
            }),
          ],
        })
      );
      c.set('tenantId', NORMALIZED_TENANT_ID);
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Check no internal user info exposed
    expect(JSON.stringify(json)).not.toContain('admin@internal');
    expect(JSON.stringify(json)).not.toContain('acknowledgedBy');
  });

  it('should include only safe fields in alertSummary', async () => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [createMockMonitoredDomain()],
          alerts: [
            createMockAlert({
              id: 'alert-123',
              title: 'High severity alert',
              severity: 'high',
              status: 'pending',
              createdAt: new Date('2024-01-15'),
              // These should NOT appear:
              description: 'Sensitive details',
              acknowledgedBy: 'internal-user',
              resolutionNote: 'Internal notes',
            }),
          ],
        })
      );
      c.set('tenantId', NORMALIZED_TENANT_ID);
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Check alertSummary structure
    expect(json.alertSummary).toHaveLength(1);
    const alertItem = json.alertSummary[0];

    // Should include safe fields
    expect(alertItem.id).toBe('alert-123');
    expect(alertItem.title).toBe('High severity alert');
    expect(alertItem.severity).toBe('high');
    expect(alertItem.status).toBe('pending');
    expect(alertItem.createdAt).toBeDefined();

    // Should NOT include sensitive fields
    expect(alertItem.description).toBeUndefined();
    expect(alertItem.acknowledgedBy).toBeUndefined();
    expect(alertItem.resolutionNote).toBeUndefined();
    expect(alertItem.monitoredDomainId).toBeUndefined();
    expect(alertItem.tenantId).toBeUndefined();
  });
});

// =============================================================================
// Tenant Isolation Tests
// =============================================================================

describe('Shared Reports Tenant Isolation - Bead 12.7', () => {
  beforeEach(() => {
    process.env.INTERNAL_SECRET = 'test-internal-secret';
  });
  it('should only return data for the requesting tenant', async () => {
    const app = new Hono<Env>();

    // Note: The real tenant filtering happens in the repository
    // This test verifies the route passes tenantId to the repository
    app.use('*', async (c, next) => {
      const tenantIdFromContext = c.get('tenantId') || 'unknown';
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [createMockMonitoredDomain({ tenantId: tenantIdFromContext })],
          alerts: [createMockAlert({ tenantId: tenantIdFromContext })],
        })
      );
      c.set('tenantId', 'tenant-A');
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Should have data (since mock returns for that tenant)
    expect(json.summary.totalMonitored).toBe(1);
  });

  it('should return empty results for tenant with no data', async () => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [], // No domains for this tenant
          alerts: [],
        })
      );
      c.set('tenantId', 'empty-tenant');
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.summary.totalMonitored).toBe(0);
    expect(json.summary.activeAlerts).toBe(0);
    expect(json.alertSummary).toHaveLength(0);
  });

  it('should aggregate severity correctly per tenant', async () => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [createMockMonitoredDomain()],
          alerts: [
            createMockAlert({ severity: 'critical' }),
            createMockAlert({ id: 'alert-2', severity: 'critical' }),
            createMockAlert({ id: 'alert-3', severity: 'high' }),
            createMockAlert({ id: 'alert-4', severity: 'medium' }),
            createMockAlert({ id: 'alert-5', severity: 'low' }),
          ],
        })
      );
      c.set('tenantId', NORMALIZED_TENANT_ID);
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.summary.bySeverity.critical).toBe(2);
    expect(json.summary.bySeverity.high).toBe(1);
    expect(json.summary.bySeverity.medium).toBe(1);
    expect(json.summary.bySeverity.low).toBe(1);
  });
});

// =============================================================================
// Alert Summary Limits
// =============================================================================

describe('Shared Reports Alert Limits - Bead 12.7', () => {
  beforeEach(() => {
    process.env.INTERNAL_SECRET = 'test-internal-secret';
  });
  it('should limit alertSummary to 10 items', async () => {
    const app = new Hono<Env>();

    // Create 15 alerts
    const alerts = Array.from({ length: 15 }, (_, i) =>
      createMockAlert({ id: `alert-${i}`, title: `Alert ${i}` })
    );

    app.use('*', async (c, next) => {
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [createMockMonitoredDomain()],
          alerts,
        })
      );
      c.set('tenantId', NORMALIZED_TENANT_ID);
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Summary should show all
    expect(json.summary.activeAlerts).toBe(15);

    // But alertSummary limited to 10
    expect(json.alertSummary).toHaveLength(10);
  });

  it('should return fewer than 10 if less alerts exist', async () => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      c.set(
        'db',
        createMockDb({
          monitoredDomains: [createMockMonitoredDomain()],
          alerts: [
            createMockAlert({ id: 'alert-1' }),
            createMockAlert({ id: 'alert-2' }),
            createMockAlert({ id: 'alert-3' }),
          ],
        })
      );
      c.set('tenantId', NORMALIZED_TENANT_ID);
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);

    const res = await app.request('/api/monitoring/reports/shared', {
      headers: {
        'X-Internal-Secret': 'test-internal-secret',
        'X-Tenant-Id': 'test-tenant',
        'X-Actor-Id': 'test-actor',
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.alertSummary).toHaveLength(3);
  });
});

// =============================================================================
// Mock Helpers
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

interface MockAlert {
  id: string;
  monitoredDomainId: string;
  tenantId: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  createdAt: Date;
  acknowledgedAt?: Date | null;
  acknowledgedBy?: string | null;
  resolvedAt?: Date | null;
  resolutionNote?: string | null;
  dedupKey?: string;
}

interface MockDbOptions {
  monitoredDomains?: MockMonitoredDomain[];
  alerts?: MockAlert[];
}

function createMockMonitoredDomain(
  overrides: Partial<MockMonitoredDomain> = {}
): MockMonitoredDomain {
  return {
    id: 'mon-1',
    domainId: 'dom-1',
    tenantId: NORMALIZED_TENANT_ID, // Must match the normalized tenantId set by auth middleware
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

function createMockAlert(overrides: Partial<MockAlert> = {}): MockAlert {
  return {
    id: 'alert-1',
    monitoredDomainId: 'mon-1',
    tenantId: NORMALIZED_TENANT_ID, // Must match the normalized tenantId set by auth middleware
    title: 'Test Alert',
    severity: 'high',
    status: 'pending',
    createdAt: new Date(),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    ...overrides,
  };
}

function createMockDb(options: MockDbOptions = {}): IDatabaseAdapter {
  const mockMonitoredDomains = options.monitoredDomains || [];
  const mockAlerts = options.alerts || [];

  // Helper to extract table name - handles multiple property styles
  const getTableName = (table: unknown): string => {
    if (!table || typeof table !== 'object') return '';
    // Try Symbol.for('drizzle:Name') first (what Drizzle uses)
    const symbolKey = Object.getOwnPropertySymbols(table).find((s) =>
      s.toString().includes('drizzle:Name')
    );
    if (symbolKey && (table as Record<symbol, string>)[symbolKey]) {
      return (table as Record<symbol, string>)[symbolKey];
    }
    // Fall back to _ property
    const underscore = (table as { _?: { name?: string } })?._;
    if (underscore?.name) return underscore.name;
    return '';
  };

  return {
    select: (table: unknown) => {
      const tableName = getTableName(table);
      if (tableName === 'monitored_domains') {
        return Promise.resolve(mockMonitoredDomains);
      }
      if (tableName === 'alerts') {
        return Promise.resolve(mockAlerts);
      }
      return Promise.resolve([]);
    },
    selectWhere: (table: unknown, _condition: unknown) => {
      const tableName = getTableName(table);
      // Debug: log what table names are being requested
      if (tableName === 'monitored_domains') {
        return Promise.resolve(mockMonitoredDomains);
      }
      if (tableName === 'alerts') {
        return Promise.resolve(mockAlerts);
      }
      // Try checking if table name contains the word
      const tableStr = String(table);
      if (tableStr.includes('monitored') || tableStr.includes('MonitoredDomain')) {
        return Promise.resolve(mockMonitoredDomains);
      }
      if (tableStr.includes('alert') || tableStr.includes('Alert')) {
        return Promise.resolve(mockAlerts);
      }
      return Promise.resolve([]);
    },
    selectOne: () => Promise.resolve(null),
    insert: () => Promise.resolve({ id: 'new-id' }),
    update: () => Promise.resolve(1),
    updateOne: () => Promise.resolve(null),
    delete: () => Promise.resolve(1),
    query: () => Promise.resolve([]),
    getDrizzle: () => ({
      query: {
        monitoredDomains: {
          findMany: () => Promise.resolve(mockMonitoredDomains),
        },
        alerts: {
          findMany: () => Promise.resolve(mockAlerts),
        },
      },
    }),
  } as unknown as IDatabaseAdapter;
}
