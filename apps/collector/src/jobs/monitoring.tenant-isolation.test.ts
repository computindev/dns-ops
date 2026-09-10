import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

const repos = vi.hoisted(() => ({
  findById: vi.fn(),
  findByDomainId: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@dns-ops/db', () => ({
  AlertRepository: class {},
  DomainRepository: class {
    findById = repos.findById;
  },
  MonitoredDomainRepository: class {
    findByDomainId = repos.findByDomainId;
    create = repos.create;
  },
}));

import { monitoringRoutes } from './monitoring.js';

const TENANT_ID = '197364d6-0eda-54c5-bcda-3702507a5221';

describe('POST /domains/:domainId/monitor tenant isolation', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    process.env.INTERNAL_SECRET = 'test-internal-secret';
    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', {} as Env['Variables']['db']);
      await next();
    });
    app.route('/api/monitoring', monitoringRoutes);
    vi.clearAllMocks();
    repos.create.mockResolvedValue({ id: 'mon-new', tenantId: TENANT_ID });
  });

  const headers = {
    'X-Internal-Secret': 'test-internal-secret',
    'X-Tenant-Id': 'test-tenant',
    'X-Actor-Id': 'test-actor',
    'Content-Type': 'application/json',
  };

  it('returns 404 for a foreign-owned domain and does not return its monitor', async () => {
    repos.findById.mockResolvedValue({ id: 'dom-foreign', tenantId: 'tenant-other' });
    repos.findByDomainId.mockResolvedValue({
      id: 'mon-foreign',
      tenantId: 'tenant-other',
      alertChannels: { webhook: 'https://hooks.foreign.test/alerts' },
    });

    const response = await app.request('/api/monitoring/domains/dom-foreign/monitor', {
      method: 'POST',
      headers,
      body: JSON.stringify({ schedule: 'daily' }),
    });

    expect(response.status).toBe(404);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.monitored).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('hooks.foreign.test');
    expect(repos.findByDomainId).not.toHaveBeenCalled();
    expect(repos.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an absent domain and does not create a monitor', async () => {
    repos.findById.mockResolvedValue(undefined);

    const response = await app.request('/api/monitoring/domains/missing/monitor', {
      method: 'POST',
      headers,
      body: JSON.stringify({ schedule: 'daily' }),
    });

    expect(response.status).toBe(404);
    expect(repos.findByDomainId).not.toHaveBeenCalled();
    expect(repos.create).not.toHaveBeenCalled();
  });

  it('creates a monitor for a same-tenant unmonitored domain', async () => {
    repos.findById.mockResolvedValue({ id: 'dom-1', tenantId: TENANT_ID });
    repos.findByDomainId.mockResolvedValue(undefined);

    const response = await app.request('/api/monitoring/domains/dom-1/monitor', {
      method: 'POST',
      headers,
      body: JSON.stringify({ schedule: 'daily' }),
    });

    expect(response.status).toBe(201);
    expect(repos.findByDomainId).toHaveBeenCalledWith('dom-1', TENANT_ID);
    expect(repos.create).toHaveBeenCalledWith(
      expect.objectContaining({ domainId: 'dom-1', tenantId: TENANT_ID, createdBy: 'test-actor' })
    );
  });

  it('returns 409 with only the tenant-scoped monitored row', async () => {
    repos.findById.mockResolvedValue({ id: 'dom-1', tenantId: TENANT_ID });
    repos.findByDomainId.mockResolvedValue({
      id: 'mon-1',
      tenantId: TENANT_ID,
      alertChannels: { webhook: 'https://hooks.own.test/alerts' },
    });

    const response = await app.request('/api/monitoring/domains/dom-1/monitor', {
      method: 'POST',
      headers,
      body: JSON.stringify({ schedule: 'daily' }),
    });

    expect(response.status).toBe(409);
    const json = (await response.json()) as { monitored?: { tenantId?: string } };
    expect(json.monitored?.tenantId).toBe(TENANT_ID);
    expect(repos.findByDomainId).toHaveBeenCalledWith('dom-1', TENANT_ID);
    expect(repos.create).not.toHaveBeenCalled();
  });
});
