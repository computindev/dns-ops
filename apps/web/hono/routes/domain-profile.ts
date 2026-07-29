import {
  DOMAIN_CRITICALITIES,
  DOMAIN_PURPOSES,
  purposeUndeclaredUnknown,
} from '@dns-ops/contracts';
import {
  DomainProfileRepository,
  DomainRepository,
  ProbeObservationRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { type Context, Hono } from 'hono';
import { getRequestClientIp } from '../lib/request-context.js';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import {
  enumValue,
  optionalString,
  validateBody,
  validationErrorResponse,
} from '../middleware/validation.js';
import type { Env } from '../types.js';

export const domainProfileRoutes = new Hono<Env>();
domainProfileRoutes.use('*', requireAuth);

async function ownedDomain(c: Context<Env>) {
  const tenantId = c.get('tenantId');
  if (!tenantId) return null;
  return new DomainRepository(c.get('db')).findByNameForTenant(c.req.param('domain'), tenantId);
}

domainProfileRoutes.get('/:domain/profile', async (c) => {
  const tenantId = c.get('tenantId');
  const domain = await ownedDomain(c);
  if (!tenantId || !domain) return c.json({ error: 'Domain not found' }, 404);
  const profile = await new DomainProfileRepository(c.get('db')).findByDomainId(
    domain.id,
    tenantId
  );
  return c.json({
    domain: domain.normalizedName,
    profile,
    setup: profile ? null : purposeUndeclaredUnknown('Domain evidence'),
  });
});

domainProfileRoutes.get('/:domain/evidence', async (c) => {
  const tenantId = c.get('tenantId');
  const domain = await ownedDomain(c);
  if (!tenantId || !domain) return c.json({ error: 'Domain not found' }, 404);
  const snapshots = await new SnapshotRepository(c.get('db')).findByDomain(domain.id, 1);
  if (!snapshots[0])
    return c.json({ domain: domain.normalizedName, snapshotId: null, evidence: [] });
  const probes = await new ProbeObservationRepository(c.get('db')).findBySnapshotId(
    snapshots[0].id
  );
  return c.json({
    domain: domain.normalizedName,
    snapshotId: snapshots[0].id,
    evidence: probes.filter((probe) => ['rdap', 'tls_cert', 'http'].includes(probe.probeType)),
  });
});

domainProfileRoutes.put('/:domain/profile', requireWritePermission, async (c) => {
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const domain = await ownedDomain(c);
  if (!tenantId || !actorId || !domain) return c.json({ error: 'Domain not found' }, 404);
  const validation = await validateBody(c, {
    purpose: enumValue('purpose', DOMAIN_PURPOSES),
    criticality: enumValue('criticality', DOMAIN_CRITICALITIES),
    responsibleActorId: optionalString('responsibleActorId', { maxLength: 100 }),
  });
  if (!validation.success) return validationErrorResponse(c, validation.error);
  if (!validation.data.purpose || !validation.data.criticality) {
    return c.json({ error: 'Invalid profile values' }, 400);
  }
  const repo = new DomainProfileRepository(c.get('db'));
  const { purpose, criticality, responsibleActorId } = validation.data;
  const profile = await repo.setWithAudit(
    {
      domainId: domain.id,
      tenantId,
      purpose: purpose as (typeof DOMAIN_PURPOSES)[number],
      criticality: criticality as (typeof DOMAIN_CRITICALITIES)[number],
      responsibleActorId,
    },
    {
      actorId,
      actorEmail: c.get('actorEmail') ?? null,
      tenantId,
      ipAddress: getRequestClientIp(c) ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    }
  );
  return c.json({ profile });
});
