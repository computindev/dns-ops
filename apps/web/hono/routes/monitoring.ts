/**
 * Monitoring Routes - dns-ops-1j4.12.4
 *
 * API routes for managing monitored domains.
 * Provides CRUD operations for tenant-scoped monitoring configuration.
 */

import {
  AuditEventRepository,
  DomainRepository,
  type MonitoredDomain,
  MonitoredDomainRepository,
} from '@dns-ops/db';
import { Hono } from 'hono';
import { getRequestClientIp } from '../lib/request-context.js';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import type { Env } from '../types.js';

export const monitoringRoutes = new Hono<Env>();

monitoringRoutes.use('*', requireAuth);

async function findTenantMonitoredDomain(
  repo: MonitoredDomainRepository,
  tenantId: string,
  idOrDomainId: string
) {
  const monitoredDomains = await repo.findByTenant(tenantId);
  return monitoredDomains.find(
    (item) => item.id === idOrDomainId || item.domainId === idOrDomainId
  );
}

function isUniqueConstraintError(error: unknown, constraintName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    message.includes(constraintName.toLowerCase())
  );
}

monitoringRoutes.get('/domains', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  if (!db || !tenantId) {
    return c.json({ error: 'Database or tenant context unavailable' }, 503);
  }

  const repo = new MonitoredDomainRepository(db);
  const domainRepo = new DomainRepository(db);
  const monitoredDomains = await repo.findByTenant(tenantId);

  const domainsWithNames = await Promise.all(
    monitoredDomains.map(async (md) => {
      const domain = await domainRepo.findById(md.domainId);
      return {
        ...md,
        domainName: domain?.name || 'Unknown',
      };
    })
  );

  return c.json({ monitoredDomains: domainsWithNames });
});

monitoringRoutes.get('/domains/:id', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  if (!db || !tenantId) {
    return c.json({ error: 'Database or tenant context unavailable' }, 503);
  }

  const repo = new MonitoredDomainRepository(db);
  const domainRepo = new DomainRepository(db);
  const monitoredDomain = await findTenantMonitoredDomain(repo, tenantId, id);

  if (!monitoredDomain) {
    return c.json({ error: 'Monitored domain not found' }, 404);
  }

  const domain = await domainRepo.findById(monitoredDomain.domainId);
  return c.json({
    monitoredDomain: {
      ...monitoredDomain,
      domainName: domain?.name || 'Unknown',
    },
  });
});

monitoringRoutes.post('/domains', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    domainId?: string;
    domainName?: string;
    schedule?: 'hourly' | 'daily' | 'weekly';
    alertChannels?: {
      email?: string[];
      webhook?: string;
      slack?: string;
    };
    maxAlertsPerDay?: number;
    suppressionWindowMinutes?: number;
  };

  if (!body.domainId && !body.domainName) {
    return c.json({ error: 'Either domainId or domainName is required' }, 400);
  }

  const domainRepo = new DomainRepository(db);
  const repo = new MonitoredDomainRepository(db);

  let domainId = body.domainId;
  let domainName = body.domainName;
  let domain = domainId ? await domainRepo.findById(domainId) : undefined;

  if (domain?.tenantId && domain.tenantId !== tenantId) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  if (!domainId && body.domainName) {
    domain = await domainRepo.findByNameForTenant(body.domainName, tenantId);
    if (!domain) {
      domain = await domainRepo.create({
        name: body.domainName,
        normalizedName: body.domainName.toLowerCase(),
        tenantId,
        zoneManagement: 'unknown',
      });
    }
    domainId = domain.id;
    domainName = domain.name;
  }

  if (!domainId) {
    return c.json({ error: 'Could not resolve domain' }, 400);
  }

  const existing = await findTenantMonitoredDomain(repo, tenantId, domainId);
  if (existing) {
    return c.json(
      {
        error: 'Domain is already being monitored',
        existingId: existing.id,
      },
      409
    );
  }

  const globalExisting = await repo.findByDomainId(domainId, tenantId);
  if (globalExisting) {
    return c.json({ error: 'Domain is already being monitored' }, 409);
  }

  let monitoredDomain: MonitoredDomain;
  try {
    monitoredDomain = await repo.create({
      domainId,
      schedule: body.schedule || 'daily',
      alertChannels: body.alertChannels || {},
      maxAlertsPerDay: body.maxAlertsPerDay ?? 5,
      suppressionWindowMinutes: body.suppressionWindowMinutes ?? 60,
      isActive: true,
      createdBy: actorId,
      tenantId,
    });
  } catch (error) {
    if (isUniqueConstraintError(error, 'monitored_domain_unique_idx')) {
      return c.json({ error: 'Domain is already being monitored' }, 409);
    }
    throw error;
  }

  const auditRepo = new AuditEventRepository(db);
  await auditRepo.create({
    action: 'monitored_domain_created',
    entityType: 'monitored_domain',
    entityId: monitoredDomain.id,
    actorId,
    tenantId,
    newValue: {
      domainId: monitoredDomain.domainId,
      domainName,
      schedule: monitoredDomain.schedule,
      isActive: monitoredDomain.isActive,
    },
    ipAddress: getRequestClientIp(c),
    userAgent: c.req.header('user-agent'),
  });

  return c.json({ monitoredDomain }, 201);
});

monitoringRoutes.put('/domains/:id', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const id = c.req.param('id');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    schedule?: 'hourly' | 'daily' | 'weekly';
    alertChannels?: {
      email?: string[];
      webhook?: string;
      slack?: string;
    };
    maxAlertsPerDay?: number;
    suppressionWindowMinutes?: number;
    isActive?: boolean;
  };

  const repo = new MonitoredDomainRepository(db);
  const monitoredDomain = await findTenantMonitoredDomain(repo, tenantId, id);

  if (!monitoredDomain) {
    return c.json({ error: 'Monitored domain not found' }, 404);
  }

  const updated = await repo.update(monitoredDomain.id, {
    ...(body.schedule && { schedule: body.schedule }),
    ...(body.alertChannels && { alertChannels: body.alertChannels }),
    ...(body.maxAlertsPerDay !== undefined && { maxAlertsPerDay: body.maxAlertsPerDay }),
    ...(body.suppressionWindowMinutes !== undefined && {
      suppressionWindowMinutes: body.suppressionWindowMinutes,
    }),
    ...(body.isActive !== undefined && { isActive: body.isActive }),
  });

  if (updated) {
    const auditRepo = new AuditEventRepository(db);
    await auditRepo.create({
      action: 'monitored_domain_updated',
      entityType: 'monitored_domain',
      entityId: updated.id,
      actorId,
      tenantId,
      previousValue: {
        schedule: monitoredDomain.schedule,
        isActive: monitoredDomain.isActive,
        alertChannels: monitoredDomain.alertChannels,
        maxAlertsPerDay: monitoredDomain.maxAlertsPerDay,
        suppressionWindowMinutes: monitoredDomain.suppressionWindowMinutes,
      },
      newValue: {
        schedule: updated.schedule,
        isActive: updated.isActive,
        alertChannels: updated.alertChannels,
        maxAlertsPerDay: updated.maxAlertsPerDay,
        suppressionWindowMinutes: updated.suppressionWindowMinutes,
      },
      ipAddress: getRequestClientIp(c),
      userAgent: c.req.header('user-agent'),
    });
  }

  return c.json({ monitoredDomain: updated });
});

monitoringRoutes.delete('/domains/:id', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const id = c.req.param('id');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  const repo = new MonitoredDomainRepository(db);
  const domainRepo = new DomainRepository(db);
  const monitoredDomain = await findTenantMonitoredDomain(repo, tenantId, id);

  if (!monitoredDomain) {
    return c.json({ error: 'Monitored domain not found' }, 404);
  }

  const domain = await domainRepo.findById(monitoredDomain.domainId);
  await repo.delete(monitoredDomain.id);

  const auditRepo = new AuditEventRepository(db);
  await auditRepo.create({
    action: 'monitored_domain_deleted',
    entityType: 'monitored_domain',
    entityId: monitoredDomain.id,
    actorId,
    tenantId,
    previousValue: {
      domainId: monitoredDomain.domainId,
      domainName: domain?.name,
      schedule: monitoredDomain.schedule,
      isActive: monitoredDomain.isActive,
    },
    ipAddress: getRequestClientIp(c),
    userAgent: c.req.header('user-agent'),
  });

  return c.json({ success: true, deletedId: monitoredDomain.id });
});

monitoringRoutes.post('/domains/:id/toggle', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const id = c.req.param('id');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  const repo = new MonitoredDomainRepository(db);
  const monitoredDomain = await findTenantMonitoredDomain(repo, tenantId, id);

  if (!monitoredDomain) {
    return c.json({ error: 'Monitored domain not found' }, 404);
  }

  const updated = await repo.update(monitoredDomain.id, {
    isActive: !monitoredDomain.isActive,
  });

  if (updated) {
    const auditRepo = new AuditEventRepository(db);
    await auditRepo.create({
      action: 'monitored_domain_toggled',
      entityType: 'monitored_domain',
      entityId: updated.id,
      actorId,
      tenantId,
      previousValue: { isActive: monitoredDomain.isActive },
      newValue: { isActive: updated.isActive },
      ipAddress: getRequestClientIp(c),
      userAgent: c.req.header('user-agent'),
    });
  }

  return c.json({ monitoredDomain: updated });
});
