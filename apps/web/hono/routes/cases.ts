import { OperationalConditionService } from '@dns-ops/db';
import { Hono } from 'hono';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import type { Env } from '../types.js';

export const caseRoutes = new Hono<Env>();
caseRoutes.use('*', requireAuth);

caseRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) return c.json({ error: 'Tenant context required' }, 401);
  const domainId = c.req.query('domainId');
  const cases = await new OperationalConditionService(c.get('db')).listCases(tenantId, domainId);
  return c.json({ cases });
});

caseRoutes.get('/:caseId', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) return c.json({ error: 'Tenant context required' }, 401);
  const result = await new OperationalConditionService(c.get('db')).getCase(
    tenantId,
    c.req.param('caseId')
  );
  if (!result) return c.json({ error: 'Case not found' }, 404);
  return c.json(result);
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
