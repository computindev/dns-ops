import { DomainRepository, OperationalConditionService } from '@dns-ops/db';
import { Hono } from 'hono';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import type { Env } from '../types.js';

export const caseRoutes = new Hono<Env>();
caseRoutes.use('*', requireAuth);

caseRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) return c.json({ error: 'Tenant context required' }, 401);
  const domainId = c.req.query('domainId');
  const db = c.get('db');
  const cases = await new OperationalConditionService(db).listCases(tenantId, domainId);
  const tenantDomains = await new DomainRepository(db).findAll({ tenantId });
  const domainsById = new Map(tenantDomains.map((domain) => [domain.id, domain]));
  return c.json({
    cases: cases.flatMap((item) => {
      const domain = domainsById.get(item.signal.domainId);
      return domain
        ? [{ case: item.case, signal: item.signal, domain: { id: domain.id, name: domain.name } }]
        : [];
    }),
  });
});

caseRoutes.get('/:caseId', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) return c.json({ error: 'Tenant context required' }, 401);
  const result = await new OperationalConditionService(c.get('db')).getCase(
    tenantId,
    c.req.param('caseId')
  );
  if (!result) return c.json({ error: 'Case not found' }, 404);
  const domain = await new DomainRepository(c.get('db')).findById(result.signal.domainId);
  if (!domain || domain.tenantId !== tenantId) return c.json({ error: 'Case not found' }, 404);
  return c.json({
    case: result.case,
    signal: result.signal,
    events: result.events,
    domain: { id: domain.id, name: domain.name },
  });
});

caseRoutes.patch('/:caseId/disposition', requireWritePermission, async (c) => {
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) return c.json({ error: 'Tenant context required' }, 401);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.disposition !== 'string' || !Number.isInteger(body.expectedVersion)) {
    return c.json({ error: 'Invalid case disposition request' }, 400);
  }
  try {
    const updated = await new OperationalConditionService(c.get('db')).setCaseDisposition({
      tenantId,
      actorId,
      caseId: c.req.param('caseId'),
      disposition: body.disposition,
      expectedVersion: body.expectedVersion as number,
    });
    if (!updated) return c.json({ error: 'Case not found' }, 404);
    return c.json({ case: updated });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      error.code === 'OPERATION_CONFLICT'
    ) {
      return c.json({ error: 'Case version is stale', code: 'CASE_VERSION_STALE' }, 409);
    }
    return c.json(
      { error: error instanceof Error ? error.message : 'Case disposition update failed' },
      400
    );
  }
});
