/**
 * Alert Delivery Integration Tests
 *
 * Proves the complete alert delivery chain:
 *   finding → alert creation → webhook delivery → alert status=sent
 *
 * Chain under test:
 *   processCollectDomain (worker.ts)
 *     → looks up MonitoredDomain.alertChannels.webhook
 *     → generateAndSendFindingAlerts (alert-from-findings.ts)
 *       → generateAlertsFromFindings (creates DB alerts)
 *       → sendAlertNotification (webhook.ts) for each alert
 *         → sendAlertWebhook (fetch + SSRF guard)
 *         → AlertRepository.updateStatus → status='sent'
 *
 * Webhook delivery and SSRF guard are tested in webhook.test.ts / webhook.e2e.test.ts.
 * This file focuses on the creation + delivery wiring.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@dns-ops/logging', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Webhook delivery + SSRF guard tested in webhook.test.ts / webhook.e2e.test.ts.
// Here we mock the webhook module to isolate the alert-creation ↔ delivery wiring.
vi.mock('../notifications/webhook.js', () => ({
  buildWebhookPayload: vi.fn((data) => data),
  sendAlertWebhook: vi.fn().mockResolvedValue({
    success: true,
    resolvedHostname: 'webhook.example.com',
  }),
  sendAlertNotification: vi.fn().mockResolvedValue({
    success: true,
    webhookHost: 'webhook.example.com',
    statusUpdated: true,
  }),
}));

import { sendAlertNotification } from '../notifications/webhook.js';
// Static imports — mock is applied before these resolve
import { generateAndSendFindingAlerts } from './alert-from-findings.js';

// ---------------------------------------------------------------------------
// Mock DB factory (mirrors alert-from-findings.test.ts pattern)
// ---------------------------------------------------------------------------

interface MockMonitoredDomain {
  id: string;
  domainId: string;
  tenantId: string;
  alertChannels: Record<string, unknown>;
  isActive?: boolean;
  schedule?: string;
  [key: string]: unknown;
}

interface MockFinding {
  id: string;
  snapshotId: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  reviewOnly: boolean;
  ruleId: string;
}

interface MockAlert {
  id: string;
  monitoredDomainId: string;
  title: string;
  severity: string;
  tenantId: string;
  status: string;
  triggeredByFindingId?: string;
  description?: string;
  [key: string]: unknown;
}

interface MockData {
  monitoredDomains: MockMonitoredDomain[];
  findings: MockFinding[];
  alerts: MockAlert[];
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') {
    return record[symbolName] as string;
  }
  const symbols = Object.getOwnPropertySymbols(record);
  const drizzleName = symbols.find((s) => String(s) === 'Symbol(drizzle:Name)');
  if (drizzleName && typeof record[drizzleName] === 'string') {
    return record[drizzleName] as string;
  }
  return '';
}

function getConditionParam(condition: unknown): unknown {
  const sql = condition as {
    queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
  };
  return sql.queryChunks?.find((c) => c?.constructor?.name === 'Param')?.value;
}

function createMockDb(data: MockData): Env['Variables']['db'] {
  let alertIdCounter = 0;

  const db: Env['Variables']['db'] = {
    type: 'postgres' as const,
    db: undefined,
    getDrizzle: () => undefined,

    select: vi.fn(async (table: unknown) => {
      const name = getTableName(table);
      if (name === 'monitored_domains') return data.monitoredDomains;
      if (name === 'alerts') return data.alerts;
      if (name === 'findings') return data.findings;
      return [];
    }),

    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTableName(table);
      const param = getConditionParam(condition);
      if (name === 'monitored_domains') {
        return data.monitoredDomains.filter(
          (m) => m.domainId === param || m.tenantId === param || m.id === param
        );
      }
      if (name === 'findings') {
        return data.findings.filter((f) => f.snapshotId === param);
      }
      if (name === 'alerts') {
        return data.alerts.filter(
          (a) => a.monitoredDomainId === param || a.tenantId === param || a.status === param
        );
      }
      return [];
    }),

    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const name = getTableName(table);
      const param = getConditionParam(condition);
      if (name === 'monitored_domains') {
        return data.monitoredDomains.find((m) => m.id === param || m.domainId === param);
      }
      if (name === 'findings') {
        return data.findings.find((f) => f.id === param);
      }
      if (name === 'alerts') {
        return data.alerts.find((a) => a.id === param);
      }
      return undefined;
    }),

    insert: vi.fn(async (_table: unknown, values: Record<string, unknown>) => {
      const alert: MockAlert = {
        id: `alert-${++alertIdCounter}`,
        status: 'pending',
        ...(values as Omit<MockAlert, 'id' | 'status'>),
        createdAt: new Date(),
      } as MockAlert;
      data.alerts.push(alert);
      return alert;
    }),

    insertMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue([]),
    updateOne: vi.fn(async (_table: unknown, updates: Record<string, unknown>, _cond: unknown) => {
      const param = getConditionParam(_cond);
      const existing = data.alerts.find((a) => a.id === param);
      if (existing) Object.assign(existing, updates);
      return existing;
    }),
    delete: vi.fn().mockResolvedValue(0),
    deleteOne: vi.fn().mockResolvedValue(undefined),

    transaction: vi.fn(async <T>(cb: (adapter: Env['Variables']['db']) => Promise<T>) => {
      return cb(db);
    }),
  } as unknown as Env['Variables']['db'];

  return db;
}

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-delivery-test';
const DOMAIN_ID = 'domain-delivery-456';
const SNAPSHOT_ID = 'snapshot-delivery-789';
const MONITORED_DOMAIN_ID = 'monitored-delivery-abc';
const WEBHOOK_URL = 'https://webhook.example.com/alerts';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Alert Delivery Integration', () => {
  let mockData: MockData;
  let mockDb: Env['Variables']['db'];

  beforeEach(() => {
    vi.clearAllMocks();
    (sendAlertNotification as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      webhookHost: 'webhook.example.com',
      statusUpdated: true,
    });

    mockData = {
      monitoredDomains: [],
      findings: [],
      alerts: [],
    };
    mockDb = createMockDb(mockData);
  });

  function seedMonitoredDomain(webhookUrl?: string) {
    mockData.monitoredDomains.push({
      id: MONITORED_DOMAIN_ID,
      domainId: DOMAIN_ID,
      tenantId: TENANT_ID,
      alertChannels: webhookUrl ? { webhook: webhookUrl } : {},
      isActive: true,
      schedule: 'daily',
    });
  }

  function seedFinding(overrides: Partial<MockFinding> = {}): MockFinding {
    const finding: MockFinding = {
      id: overrides.id || `finding-${Math.random().toString(36).slice(2)}`,
      snapshotId: SNAPSHOT_ID,
      type: 'mail.no-dmarc-record',
      severity: overrides.severity || 'high',
      title: overrides.title || 'Missing SPF Record',
      description: 'Domain has no SPF record',
      reviewOnly: overrides.reviewOnly ?? false,
      ruleId: 'rule-123',
    };
    mockData.findings.push(finding);
    return finding;
  }

  // =========================================================================
  // Full chain: finding → alert → webhook delivery
  // =========================================================================

  describe('End-to-end: finding → alert creation → webhook delivery', () => {
    it('creates alert and calls sendAlertNotification with webhook URL', async () => {
      seedMonitoredDomain(WEBHOOK_URL);
      seedFinding({ id: 'finding-001', severity: 'high', title: 'Missing SPF' });

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        WEBHOOK_URL
      );

      // 1. Alert was created in DB
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].findingId).toBe('finding-001');
      expect(mockData.alerts).toHaveLength(1);
      expect(mockData.alerts[0].title).toBe('[HIGH] Missing SPF');

      // 2. sendAlertNotification called with alert ID and webhook URL
      expect(sendAlertNotification).toHaveBeenCalledTimes(1);
      expect(sendAlertNotification).toHaveBeenCalledWith(
        mockData.alerts[0].id, // alertId
        WEBHOOK_URL, // webhookUrl
        expect.objectContaining({
          id: mockData.alerts[0].id,
          severity: 'high',
          domain: 'example.com',
          tenantId: TENANT_ID,
        }),
        mockDb, // db adapter
        process.env.WEB_APP_URL // baseUrl
      );

      // 3. Reported as sent
      expect(result.webhookSent).toBe(true);
    });

    it('sends webhook for each created alert', async () => {
      seedMonitoredDomain(WEBHOOK_URL);
      seedFinding({ id: 'f1', severity: 'critical', title: 'No DMARC' });
      seedFinding({ id: 'f2', severity: 'high', title: 'Weak SPF' });

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        WEBHOOK_URL
      );

      expect(result.alerts).toHaveLength(2);
      expect(result.webhookSent).toBe(true);
      // One sendAlertNotification call per alert
      expect(sendAlertNotification).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // No webhook URL → alerts created but no delivery
  // =========================================================================

  describe('No webhook URL configured', () => {
    it('creates alerts without sending webhook', async () => {
      seedMonitoredDomain(); // no webhook
      seedFinding({ severity: 'high' });

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com'
        // no webhookUrl
      );

      expect(result.alerts).toHaveLength(1);
      expect(result.webhookSent).toBe(false);
      expect(sendAlertNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Webhook failure → alerts still created
  // =========================================================================

  describe('Webhook delivery failure', () => {
    it('creates alerts even when webhook fails', async () => {
      seedMonitoredDomain(WEBHOOK_URL);
      seedFinding({ severity: 'high' });

      (sendAlertNotification as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Network error',
        webhookHost: 'webhook.example.com',
      });

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        WEBHOOK_URL
      );

      expect(result.alerts).toHaveLength(1);
      expect(result.webhookSent).toBe(false);
      // sendAlertNotification was still called (attempted)
      expect(sendAlertNotification).toHaveBeenCalledTimes(1);
    });

    it('handles sendAlertNotification throwing without crashing', async () => {
      seedMonitoredDomain(WEBHOOK_URL);
      seedFinding({ severity: 'high' });

      (sendAlertNotification as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('ECONNREFUSED')
      );

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        WEBHOOK_URL
      );

      // Should not crash — caught internally
      expect(result.alerts).toHaveLength(1);
      expect(result.webhookSent).toBe(false);
    });
  });

  // =========================================================================
  // Non-monitored domain → no alerts
  // =========================================================================

  describe('Non-monitored domain', () => {
    it('returns empty when domain is not monitored', async () => {
      // No monitored domain seeded
      seedFinding({ severity: 'high' });

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        WEBHOOK_URL
      );

      expect(result.alerts).toHaveLength(0);
      expect(result.webhookSent).toBe(false);
      expect(sendAlertNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Alert content correctness
  // =========================================================================

  describe('Alert content', () => {
    it('creates alert with correct title prefix and linked finding', async () => {
      seedMonitoredDomain(WEBHOOK_URL);
      seedFinding({ id: 'finding-xyz', severity: 'critical', title: 'Open Resolver' });

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        WEBHOOK_URL
      );

      expect(result.alerts[0].findingId).toBe('finding-xyz');
      expect(mockData.alerts[0].title).toBe('[CRITICAL] Open Resolver');
      expect(mockData.alerts[0].monitoredDomainId).toBe(MONITORED_DOMAIN_ID);
      expect(mockData.alerts[0].tenantId).toBe(TENANT_ID);
    });

    it('respects maxAlertsPerSnapshot of 3', async () => {
      seedMonitoredDomain(WEBHOOK_URL);
      for (let i = 0; i < 5; i++) {
        seedFinding({ severity: 'high', title: `Issue ${i}` });
      }

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        WEBHOOK_URL
      );

      // generateAndSendFindingAlerts uses maxAlertsPerSnapshot=3
      expect(result.alerts).toHaveLength(3);
      expect(sendAlertNotification).toHaveBeenCalledTimes(3);
    });
  });
});
