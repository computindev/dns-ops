/**
 * Alert Generation from Findings Tests - Bead 20
 *
 * Tests for the alert generation flow:
 * - Severity filtering and prioritization
 * - Max alerts per snapshot limit
 * - reviewOnly filtering
 * - Webhook integration
 * - Error handling
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

// Mock the logger
vi.mock('@dns-ops/logging', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock webhook module
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

describe('generateAlertsFromFindings', () => {
  const TENANT_ID = 'tenant-123';
  const DOMAIN_ID = 'domain-456';
  const SNAPSHOT_ID = 'snapshot-789';
  const MONITORED_DOMAIN_ID = 'monitored-abc';

  let mockDb: Env['Variables']['db'];
  let mockData: {
    monitoredDomains: Array<{
      id: string;
      domainId: string;
      tenantId: string;
      domainName?: string;
      isActive?: boolean;
      schedule?: string;
    }>;
    alerts: Array<{
      id: string;
      monitoredDomainId: string;
      title: string;
      severity: string;
      tenantId: string;
      triggeredByFindingId?: string;
    }>;
    findings: Array<{
      id: string;
      snapshotId: string;
      type: string;
      severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
      title: string;
      description: string;
      reviewOnly: boolean;
      ruleId: string;
    }>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockData = {
      monitoredDomains: [],
      alerts: [],
      findings: [],
    };

    mockDb = createMockDb(mockData);
  });

  // =============================================================================
  // Mock DB Factory - Properly handles repository queries
  // =============================================================================

  function createMockDb(data: typeof mockData): Env['Variables']['db'] {
    const getTableName = (table: unknown): string => {
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
    };

    const getConditionParam = (condition: unknown): unknown => {
      const sql = condition as {
        queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
      };
      return sql.queryChunks?.find((c) => c?.constructor?.name === 'Param')?.value;
    };

    let alertIdCounter = 0;

    return {
      type: 'postgres' as const,
      db: undefined,
      getDrizzle: () => undefined,

      // select all rows for a table
      select: vi.fn(async (table: unknown) => {
        const tableName = getTableName(table);
        if (tableName === 'monitored_domains') return data.monitoredDomains;
        if (tableName === 'alerts') return data.alerts;
        if (tableName === 'findings') return data.findings;
        return [];
      }),

      // select with where condition
      selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
        const tableName = getTableName(table);
        const param = getConditionParam(condition);

        if (tableName === 'monitored_domains') {
          return data.monitoredDomains.filter(
            (m) => m.domainId === param || m.tenantId === param || m.id === param
          );
        }
        if (tableName === 'findings') {
          return data.findings.filter((f) => f.snapshotId === param);
        }
        if (tableName === 'alerts') {
          return data.alerts.filter((a) => a.monitoredDomainId === param);
        }
        return [];
      }),

      // select single row
      selectOne: vi.fn(async (table: unknown, condition: unknown) => {
        const tableName = getTableName(table);
        const param = getConditionParam(condition);

        if (tableName === 'monitored_domains') {
          return data.monitoredDomains.find((m) => m.id === param || m.domainId === param);
        }
        if (tableName === 'findings') {
          return data.findings.find((f) => f.id === param);
        }
        if (tableName === 'alerts') {
          return data.alerts.find((a) => a.id === param);
        }
        return undefined;
      }),

      // insert a row
      insert: vi.fn(async (_table: unknown, values: Record<string, unknown>) => {
        const alert = {
          id: `alert-${++alertIdCounter}`,
          ...values,
          createdAt: new Date(),
        };
        data.alerts.push(alert as (typeof data.alerts)[0]);
        return alert;
      }),

      insertMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue([]),
      updateOne: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(0),
      deleteOne: vi.fn().mockResolvedValue(undefined),

      transaction: vi.fn(async <T>(callback: (adapter: typeof mockDb) => Promise<T>) => {
        return callback(mockDb);
      }),
    } as unknown as Env['Variables']['db'];
  }

  function createMockFinding(
    overrides: {
      id?: string;
      severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
      reviewOnly?: boolean;
      title?: string;
      type?: string;
    } = {}
  ) {
    return {
      id: overrides.id || `finding-${Math.random().toString(36).slice(2)}`,
      snapshotId: SNAPSHOT_ID,
      type: overrides.type || 'monitoring.collection-failed',
      severity: overrides.severity || 'high',
      title: overrides.title || 'Missing SPF Record',
      description: 'Domain has no SPF record',
      reviewOnly: overrides.reviewOnly ?? false,
      ruleId: 'rule-123',
    };
  }

  // =============================================================================
  // Tests
  // =============================================================================

  describe('Basic functionality', () => {
    it('does not create direct alerts for unclassified conditions', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');
      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });
      mockData.findings.push(createMockFinding({ type: 'unclassified.condition' }));

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results).toEqual([]);
      expect(mockData.alerts).toEqual([]);
    });

    it('retains explicitly legacy mail alerts until canonical regression evaluation is wired', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');
      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });
      mockData.findings.push(createMockFinding({ type: 'mail.no-spf-record' }));

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results).toHaveLength(1);
    });

    it('should generate alerts for high severity findings', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });

      mockData.findings.push(
        createMockFinding({ severity: 'high', title: 'Missing SPF' }),
        createMockFinding({ severity: 'critical', title: 'No DMARC' })
      );

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results).toHaveLength(2);
    });

    it('should not generate alerts for unmonitored domains', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      // No monitored domain in mockData
      mockData.findings.push(createMockFinding({ severity: 'high' }));

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results).toEqual([]);
    });

    it('should return empty array when no findings exist', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });

      // No findings in mockData

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results).toEqual([]);
    });
  });

  describe('Severity filtering', () => {
    beforeEach(() => {
      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });
    });

    it('should filter by minimum severity', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(
        createMockFinding({ severity: 'critical', title: 'Critical Issue' }),
        createMockFinding({ severity: 'high', title: 'High Issue' }),
        createMockFinding({ severity: 'medium', title: 'Medium Issue' }),
        createMockFinding({ severity: 'low', title: 'Low Issue' })
      );

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID, {
        minSeverity: 'high',
      });

      expect(results).toHaveLength(2);
    });

    it('should include only critical when minSeverity is critical', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(
        createMockFinding({ severity: 'critical', title: 'Critical Issue' }),
        createMockFinding({ severity: 'high', title: 'High Issue' })
      );

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID, {
        minSeverity: 'critical',
      });

      expect(results).toHaveLength(1);
    });

    it('should prioritize higher severity findings first', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(
        createMockFinding({ severity: 'medium', title: 'Medium 1' }),
        createMockFinding({ severity: 'critical', title: 'Critical 1' }),
        createMockFinding({ severity: 'high', title: 'High 1' }),
        createMockFinding({ severity: 'critical', title: 'Critical 2' })
      );

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID, {
        maxAlertsPerSnapshot: 2,
      });

      expect(results).toHaveLength(2);
      // Both should be critical (prioritized)
      expect(mockData.alerts.every((a) => a.severity === 'critical')).toBe(true);
    });
  });

  describe('Max alerts per snapshot', () => {
    beforeEach(() => {
      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });
    });

    it('should limit alerts to maxAlertsPerSnapshot', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      for (let i = 0; i < 10; i++) {
        mockData.findings.push(createMockFinding({ severity: 'high', title: `Issue ${i}` }));
      }

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID, {
        maxAlertsPerSnapshot: 3,
      });

      expect(results).toHaveLength(3);
    });

    it('should use default limit of 5 when not specified', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      for (let i = 0; i < 10; i++) {
        mockData.findings.push(createMockFinding({ severity: 'high', title: `Issue ${i}` }));
      }

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results).toHaveLength(5);
    });
  });

  describe('reviewOnly filtering', () => {
    beforeEach(() => {
      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });
    });

    it('should skip reviewOnly findings by default', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(
        createMockFinding({ severity: 'high', reviewOnly: false, title: 'Real Issue' }),
        createMockFinding({ severity: 'critical', reviewOnly: true, title: 'Review Only Issue' })
      );

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results).toHaveLength(1);
      expect(mockData.alerts[0]?.title).toContain('Real Issue');
    });

    it('should include reviewOnly findings when skipReviewOnly is false', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(
        createMockFinding({ severity: 'high', reviewOnly: false }),
        createMockFinding({ severity: 'critical', reviewOnly: true })
      );

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID, {
        skipReviewOnly: false,
      });

      expect(results).toHaveLength(2);
    });
  });

  describe('Alert content', () => {
    beforeEach(() => {
      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });
    });

    it('should include severity prefix in alert title', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(createMockFinding({ severity: 'high', title: 'Missing SPF' }));

      await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(mockData.alerts[0]?.title).toBe('[HIGH] Missing SPF');
    });

    it('should link alert to finding via triggeredByFindingId', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      const finding = createMockFinding({ severity: 'high', id: 'finding-xyz' });
      mockData.findings.push(finding);

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results[0].findingId).toBe('finding-xyz');
      expect(mockData.alerts[0]?.triggeredByFindingId).toBe('finding-xyz');
    });

    it('should set correct tenantId on alerts', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(createMockFinding({ severity: 'high' }));

      await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(mockData.alerts[0]?.tenantId).toBe(TENANT_ID);
      expect(mockData.alerts[0]?.monitoredDomainId).toBe(MONITORED_DOMAIN_ID);
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });
    });

    it('should continue processing if one alert creation fails', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(
        createMockFinding({ severity: 'high', id: 'finding-1' }),
        createMockFinding({ severity: 'high', id: 'finding-2' }),
        createMockFinding({ severity: 'high', id: 'finding-3' })
      );

      // Make second insert fail
      let insertCount = 0;
      (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
        insertCount++;
        if (insertCount === 2) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({
          id: `alert-${insertCount}`,
          createdAt: new Date(),
        });
      });

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      // Should still get 2 successful alerts
      expect(results).toHaveLength(2);
    });

    it('should return partial results when some alerts fail', async () => {
      const { generateAlertsFromFindings } = await import('./alert-from-findings.js');

      mockData.findings.push(
        createMockFinding({ severity: 'high', id: 'finding-1' }),
        createMockFinding({ severity: 'high', id: 'finding-2' })
      );

      let insertCount = 0;
      (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
        insertCount++;
        if (insertCount === 2) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({
          id: `alert-${insertCount}`,
          findingId: `finding-${insertCount}`,
          createdAt: new Date(),
        });
      });

      const results = await generateAlertsFromFindings(mockDb, SNAPSHOT_ID, TENANT_ID, DOMAIN_ID);

      expect(results).toEqual([{ alertId: 'alert-1', findingId: 'finding-1' }]);
    });
  });

  describe('generateAndSendFindingAlerts', () => {
    beforeEach(() => {
      mockData.monitoredDomains.push({
        id: MONITORED_DOMAIN_ID,
        domainId: DOMAIN_ID,
        tenantId: TENANT_ID,
      });
    });

    it('should send webhook when alerts are generated', async () => {
      const { generateAndSendFindingAlerts } = await import('./alert-from-findings.js');
      const { sendAlertNotification } = await import('../notifications/webhook.js');

      mockData.findings.push(createMockFinding({ severity: 'high', id: 'finding-1' }));

      const webhookUrl = 'https://hooks.example.com/alerts';

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        webhookUrl
      );

      expect(result.alerts).toHaveLength(1);
      expect(result.webhookSent).toBe(true);
      // Verify sendAlertNotification was called
      expect(sendAlertNotification).toHaveBeenCalled();
    });

    it('should not send webhook when no alerts generated', async () => {
      const { generateAndSendFindingAlerts } = await import('./alert-from-findings.js');
      const { sendAlertNotification } = await import('../notifications/webhook.js');

      // No findings

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com',
        'https://hooks.example.com/alerts'
      );

      expect(result.alerts).toHaveLength(0);
      expect(result.webhookSent).toBe(false);
      expect(sendAlertNotification).not.toHaveBeenCalled();
    });

    it('should handle webhook send failure gracefully', async () => {
      const { generateAndSendFindingAlerts } = await import('./alert-from-findings.js');
      const { sendAlertNotification } = await import('../notifications/webhook.js');

      mockData.findings.push(createMockFinding({ severity: 'high' }));

      (sendAlertNotification as ReturnType<typeof vi.fn>).mockResolvedValue({
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
        'https://hooks.example.com/alerts'
      );

      // Should still have alerts even if webhook failed
      expect(result.alerts).toHaveLength(1);
      expect(result.webhookSent).toBe(false);
    });

    it('should not send webhook when no webhookUrl provided', async () => {
      const { generateAndSendFindingAlerts } = await import('./alert-from-findings.js');
      const { sendAlertNotification } = await import('../notifications/webhook.js');

      mockData.findings.push(createMockFinding({ severity: 'high' }));

      const result = await generateAndSendFindingAlerts(
        mockDb,
        SNAPSHOT_ID,
        TENANT_ID,
        DOMAIN_ID,
        'example.com'
      );

      expect(result.alerts).toHaveLength(1);
      expect(result.webhookSent).toBe(false);
      expect(sendAlertNotification).not.toHaveBeenCalled();
    });
  });
});
