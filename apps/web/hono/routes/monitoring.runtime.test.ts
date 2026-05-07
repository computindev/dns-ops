/**
 * Monitoring route runtime tests
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { monitoringRoutes } from './monitoring.js';

interface MockState {
  domains: Array<Record<string, unknown>>;
  monitoredDomains: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
  insertError?: Error;
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
  const sql = condition as {
    queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
  };
  return sql.queryChunks?.find((chunk) => chunk?.constructor?.name === 'Param')?.value;
}

function createMockDb(state: MockState): IDatabaseAdapter {
  return {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => {
      const tableName = getTableName(table);
      if (tableName === 'domains') return [...state.domains];
      if (tableName === 'monitored_domains') return [...state.monitoredDomains];
      if (tableName === 'audit_events') return [...state.auditEvents];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'domains') {
        return state.domains.filter(
          (row) => row.id === param || row.normalizedName === param || row.name === param
        );
      }
      if (tableName === 'monitored_domains') {
        return state.monitoredDomains.filter(
          (row) => row.tenantId === param || row.domainId === param
        );
      }
      return [];
    }),
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'domains') {
        return state.domains.find(
          (row) => row.id === param || row.normalizedName === param || row.name === param
        );
      }
      return undefined;
    }),
    insert: vi.fn(async (table: unknown, values: Record<string, unknown>) => {
      const tableName = getTableName(table);
      if (tableName === 'monitored_domains') {
        if (state.insertError) {
          throw state.insertError;
        }
        const row = {
          id: `mon-${state.monitoredDomains.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastCheckAt: null,
          lastAlertAt: null,
          ...values,
        };
        state.monitoredDomains.push(row);
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
        if (tableName !== 'monitored_domains') {
          return undefined;
        }
        const index = state.monitoredDomains.findIndex((row) => row.id === param);
        if (index === -1) {
          return undefined;
        }
        state.monitoredDomains[index] = {
          ...state.monitoredDomains[index],
          ...values,
        };
        return state.monitoredDomains[index];
      }
    ),
    delete: vi.fn(),
    deleteOne: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'monitored_domains') {
        const index = state.monitoredDomains.findIndex((row) => row.id === param);
        if (index >= 0) {
          state.monitoredDomains.splice(index, 1);
        }
      }
    }),
    transaction: vi.fn(async (callback: (db: IDatabaseAdapter) => Promise<unknown>) =>
      callback(createMockDb(state))
    ),
  } as unknown as IDatabaseAdapter;
}

function createApp(state: MockState) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    c.set('tenantId', 'tenant-1');
    c.set('actorId', 'actor-1');
    await next();
  });
  app.route('/api/monitoring', monitoringRoutes);
  return app;
}

describe('monitoringRoutes runtime', () => {
  it('audits monitored-domain creation', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      monitoredDomains: [],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/monitoring/domains', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
      },
      body: JSON.stringify({ domainId: 'domain-1', schedule: 'daily' }),
    });

    expect(response.status).toBe(201);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('monitored_domain_created');
    expect(state.auditEvents[0]?.entityType).toBe('monitored_domain');
    expect(state.auditEvents[0]?.newValue).toMatchObject({
      domainId: 'domain-1',
      schedule: 'daily',
      isActive: true,
    });
    expect(state.auditEvents[0]?.ipAddress).toBe('203.0.113.5');
  });

  it('rejects monitoring a foreign-tenant domain by explicit domainId', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-foreign',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-2',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      monitoredDomains: [],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/monitoring/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domainId: 'domain-foreign', schedule: 'daily' }),
    });

    expect(response.status).toBe(404);
    expect(state.monitoredDomains).toHaveLength(0);
    expect(state.auditEvents).toHaveLength(0);
  });

  it('rejects monitoring an unscoped domain by explicit domainId', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-global',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: null,
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      monitoredDomains: [],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/monitoring/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domainId: 'domain-global', schedule: 'daily' }),
    });

    expect(response.status).toBe(404);
    expect(state.monitoredDomains).toHaveLength(0);
    expect(state.auditEvents).toHaveLength(0);
  });

  it('audits monitored-domain update', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      monitoredDomains: [
        {
          id: 'mon-1',
          domainId: 'domain-1',
          tenantId: 'tenant-1',
          schedule: 'daily',
          alertChannels: {},
          maxAlertsPerDay: 5,
          suppressionWindowMinutes: 60,
          isActive: true,
          createdBy: 'actor-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mon-2',
          domainId: 'domain-2',
          tenantId: 'tenant-1',
          schedule: 'hourly',
          alertChannels: {},
          maxAlertsPerDay: 2,
          suppressionWindowMinutes: 30,
          isActive: false,
          createdBy: 'actor-2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/monitoring/domains/mon-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule: 'weekly' }),
    });

    expect(response.status).toBe(200);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('monitored_domain_updated');
    expect(state.auditEvents[0]?.previousValue).toMatchObject({
      schedule: 'daily',
      isActive: true,
    });
    expect(state.auditEvents[0]?.newValue).toMatchObject({ schedule: 'weekly', isActive: true });
    expect(state.monitoredDomains[0]?.schedule).toBe('weekly');
    expect(state.monitoredDomains[1]?.schedule).toBe('hourly');
  });

  it('audits monitored-domain toggle', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      monitoredDomains: [
        {
          id: 'mon-1',
          domainId: 'domain-1',
          tenantId: 'tenant-1',
          schedule: 'daily',
          alertChannels: {},
          maxAlertsPerDay: 5,
          suppressionWindowMinutes: 60,
          isActive: true,
          createdBy: 'actor-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mon-2',
          domainId: 'domain-2',
          tenantId: 'tenant-1',
          schedule: 'hourly',
          alertChannels: {},
          maxAlertsPerDay: 2,
          suppressionWindowMinutes: 30,
          isActive: false,
          createdBy: 'actor-2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/monitoring/domains/mon-1/toggle', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('monitored_domain_toggled');
    expect(state.auditEvents[0]?.previousValue).toMatchObject({ isActive: true });
    expect(state.auditEvents[0]?.newValue).toMatchObject({ isActive: false });
    expect(state.monitoredDomains[0]?.isActive).toBe(false);
    expect(state.monitoredDomains[1]?.isActive).toBe(false);
  });

  it('audits monitored-domain deletion', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      monitoredDomains: [
        {
          id: 'mon-1',
          domainId: 'domain-1',
          tenantId: 'tenant-1',
          schedule: 'daily',
          alertChannels: {},
          maxAlertsPerDay: 5,
          suppressionWindowMinutes: 60,
          isActive: true,
          createdBy: 'actor-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mon-2',
          domainId: 'domain-2',
          tenantId: 'tenant-1',
          schedule: 'hourly',
          alertChannels: {},
          maxAlertsPerDay: 2,
          suppressionWindowMinutes: 30,
          isActive: false,
          createdBy: 'actor-2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      auditEvents: [],
    };
    const app = createApp(state);

    const response = await app.request('/api/monitoring/domains/mon-1', {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]?.action).toBe('monitored_domain_deleted');
    expect(state.auditEvents[0]?.previousValue).toMatchObject({
      domainId: 'domain-1',
      isActive: true,
    });
    expect(state.monitoredDomains).toHaveLength(1);
    expect(state.monitoredDomains[0]?.id).toBe('mon-2');
  });

  it('returns 409 when monitoring insert hits unique domain constraint', async () => {
    const state: MockState = {
      domains: [
        {
          id: 'domain-1',
          name: 'example.com',
          normalizedName: 'example.com',
          tenantId: 'tenant-1',
          zoneManagement: 'managed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      monitoredDomains: [],
      auditEvents: [],
      insertError: new Error(
        'duplicate key value violates unique constraint "monitored_domain_unique_idx"'
      ),
    };
    const app = createApp(state);

    const response = await app.request('/api/monitoring/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domainId: 'domain-1', schedule: 'daily' }),
    });

    expect(response.status).toBe(409);
  });
});
