/**
 * Portfolio Routes - Bead 14
 *
 * API endpoints for portfolio search, domain notes/tags,
 * saved filters, and template management.
 */

import {
  AuditEventRepository,
  DomainNoteRepository,
  DomainRepository,
  DomainTagRepository,
  SavedFilterRepository,
  TemplateOverrideRepository,
} from '@dns-ops/db';
import { domains, findings, snapshots } from '@dns-ops/db/schema';
import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  requireAdminAccess,
  requireAuth,
  requireWritePermission,
} from '../middleware/authorization.js';
import { trackSearch } from '../middleware/error-tracking.js';
import {
  boolean,
  integer,
  optionalArray,
  optionalString,
  requiredString,
  validateBody,
  validationErrorResponse,
} from '../middleware/validation.js';
import type { Env } from '../types.js';

export const portfolioRoutes = new Hono<Env>();

// Apply authentication to all portfolio routes
portfolioRoutes.use('*', requireAuth);

// =============================================================================
// PORTFOLIO SEARCH
// =============================================================================

portfolioRoutes.post('/search', async (c) => {
  const startTime = Date.now();
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const validation = await validateBody(c, {
    query: optionalString('query', { maxLength: 253 }),
    tags: optionalArray<string>('tags'),
    severities: optionalArray<string>('severities'),
    zoneManagement: optionalArray<string>('zoneManagement'),
    limit: integer('limit', { min: 1, max: 100, required: false }),
    offset: integer('offset', { min: 0, required: false }),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const { query, tags, severities, zoneManagement, limit = 20, offset = 0 } = validation.data;

  try {
    const tagRepo = new DomainTagRepository(db);

    // Build conditions
    const conditions = [eq(domains.tenantId, tenantId)];

    if (query) {
      const queryCondition = or(
        like(domains.name, `%${query}%`),
        like(domains.normalizedName, `%${query}%`)
      );
      if (queryCondition) {
        conditions.push(queryCondition);
      }
    }

    if (zoneManagement && zoneManagement.length > 0) {
      conditions.push(
        inArray(domains.zoneManagement, zoneManagement as ('managed' | 'unmanaged' | 'unknown')[])
      );
    }

    // Get domains
    let domainIds: string[] = [];

    if (tags && tags.length > 0) {
      // Filter by tags first
      domainIds = await tagRepo.findDomainsByTags(tags, tenantId);
      if (domainIds.length === 0) {
        return c.json({ domains: [], total: 0 });
      }
      conditions.push(inArray(domains.id, domainIds));
    }

    const whereClause =
      (conditions.length > 1 ? and(...conditions) : conditions[0]) ??
      eq(domains.tenantId, tenantId);

    // Fetch matching domains
    const results = await db.getDrizzle().query.domains.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: desc(domains.updatedAt),
    });

    // PERF-001: Batch query optimization
    // Instead of N queries for snapshots (one per domain), we do 1 query with IN clause
    // Same for findings - batch by snapshot IDs

    const portfolioResults = results.filter(
      (domain) => (domain.metadata as { portfolio?: boolean } | null)?.portfolio !== false
    );
    const resultDomainIds = portfolioResults.map((d) => d.id);

    // Batch fetch all snapshots for these domains
    const allSnapshots =
      resultDomainIds.length > 0
        ? await db.getDrizzle().query.snapshots.findMany({
            where: inArray(snapshots.domainId, resultDomainIds),
            orderBy: desc(snapshots.createdAt),
          })
        : [];

    // Build a map of domainId -> latest snapshot
    const latestSnapshotByDomain = new Map<string, (typeof allSnapshots)[0]>();
    for (const snapshot of allSnapshots) {
      if (!latestSnapshotByDomain.has(snapshot.domainId)) {
        latestSnapshotByDomain.set(snapshot.domainId, snapshot);
      }
    }

    // Get all snapshot IDs for findings query
    const snapshotIds = Array.from(latestSnapshotByDomain.values()).map((s) => s.id);

    // Batch fetch all findings for these snapshots
    const hasSeverityFilter = severities && severities.length > 0;
    const allFindings =
      snapshotIds.length > 0
        ? await db.getDrizzle().query.findings.findMany({
            where: hasSeverityFilter
              ? and(
                  inArray(findings.snapshotId, snapshotIds),
                  inArray(
                    findings.severity,
                    severities as ('critical' | 'high' | 'medium' | 'low' | 'info')[]
                  )
                )
              : inArray(findings.snapshotId, snapshotIds),
          })
        : [];

    // Build a map of snapshotId -> findings
    const findingsBySnapshot = new Map<string, typeof allFindings>();
    for (const finding of allFindings) {
      if (!findingsBySnapshot.has(finding.snapshotId)) {
        findingsBySnapshot.set(finding.snapshotId, []);
      }
      findingsBySnapshot.get(finding.snapshotId)?.push(finding);
    }

    // Process results using the batched data
    const filteredDomains = portfolioResults.map((domain) => {
      const latestSnapshot = latestSnapshotByDomain.get(domain.id);

      if (!latestSnapshot) {
        return {
          ...domain,
          findings: [],
          findingsEvaluated: false,
          latestSnapshot: null,
        };
      }

      // Check if findings were evaluated (rulesetVersionId set on snapshot)
      const findingsEvaluated = latestSnapshot.rulesetVersionId !== null;
      const domainFindings = findingsBySnapshot.get(latestSnapshot.id) || [];

      // Filter out if severity filter doesn't match AND findings were evaluated
      // Don't filter out if findings weren't evaluated (might have matching findings once evaluated)
      if (hasSeverityFilter && domainFindings.length === 0 && findingsEvaluated) {
        return null;
      }

      return {
        ...domain,
        findings: domainFindings,
        findingsEvaluated,
        latestSnapshot: {
          id: latestSnapshot.id,
          createdAt: latestSnapshot.createdAt,
          resultState: latestSnapshot.resultState,
          rulesetVersionId: latestSnapshot.rulesetVersionId,
        },
      };
    });

    const domainResults = filteredDomains.filter(Boolean);

    // Track search event (Bead 14.4)
    trackSearch({
      tenantId,
      query,
      filters: { tags, severities, zoneManagement },
      resultCount: domainResults.length,
      durationMs: Date.now() - startTime,
    });

    return c.json({
      domains: domainResults,
      total: domainResults.length,
      limit,
      offset,
    });
  } catch (_error) {
    return c.json({ error: 'Search failed' }, 500);
  }
});

portfolioRoutes.get('/domains/by-name/:domain', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  if (!tenantId) {
    return c.json({ error: 'Authenticated tenant context required' }, 401);
  }

  const domainName = c.req.param('domain').toLowerCase();

  try {
    const domainRepo = new DomainRepository(db);
    const domain = await domainRepo.findByNameForTenant(domainName, tenantId);

    if (!domain || (domain.metadata as { portfolio?: boolean } | null)?.portfolio === false) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    return c.json({
      domain: {
        id: domain.id,
        name: domain.name,
        normalizedName: domain.normalizedName,
        zoneManagement: domain.zoneManagement,
      },
    });
  } catch (_error) {
    return c.json({ error: 'Failed to resolve domain context' }, 500);
  }
});

// =============================================================================
// DOMAIN NOTES
// =============================================================================

portfolioRoutes.get('/domains/:domainId/notes', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const domainId = c.req.param('domainId');

  if (!tenantId) {
    return c.json({ error: 'Authenticated tenant context required' }, 401);
  }

  try {
    const domainRepo = new DomainRepository(db);
    const domain = await domainRepo.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    const noteRepo = new DomainNoteRepository(db);
    const notes = await noteRepo.findByDomainId(domainId);
    return c.json({ notes });
  } catch (_error) {
    return c.json({ error: 'Failed to fetch notes' }, 500);
  }
});

portfolioRoutes.post('/domains/:domainId/notes', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const domainId = c.req.param('domainId');

  const validation = await validateBody(c, {
    content: requiredString('content', { minLength: 1, maxLength: 10000 }),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const { content } = validation.data;

  try {
    const domainRepo = new DomainRepository(db);
    const domain = await domainRepo.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    const noteRepo = new DomainNoteRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const note = await noteRepo.create({
      domainId,
      content: content.trim(),
      createdBy: actorId,
      tenantId,
    });

    await auditRepo.create({
      action: 'domain_note_created',
      entityType: 'domain_note',
      entityId: note.id,
      newValue: { content: note.content },
      actorId,
      tenantId,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ note }, 201);
  } catch (_error) {
    return c.json({ error: 'Failed to create note' }, 500);
  }
});

portfolioRoutes.put('/notes/:noteId', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const noteId = c.req.param('noteId');

  const validation = await validateBody(c, {
    content: requiredString('content', { minLength: 1, maxLength: 10000 }),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const { content } = validation.data;

  try {
    const noteRepo = new DomainNoteRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const existing = await noteRepo.findById(noteId);
    if (!existing || existing.tenantId !== tenantId) {
      return c.json({ error: 'Note not found' }, 404);
    }

    const updated = await noteRepo.update(noteId, { content });
    if (!updated) {
      return c.json({ error: 'Note not found' }, 404);
    }

    await auditRepo.create({
      action: 'domain_note_updated',
      entityType: 'domain_note',
      entityId: noteId,
      previousValue: { content: existing.content },
      newValue: { content: updated.content },
      actorId,
      tenantId,
    });

    return c.json({ note: updated });
  } catch (_error) {
    return c.json({ error: 'Failed to update note' }, 500);
  }
});

portfolioRoutes.delete('/notes/:noteId', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const noteId = c.req.param('noteId');

  try {
    const noteRepo = new DomainNoteRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const existing = await noteRepo.findById(noteId);
    if (!existing || existing.tenantId !== tenantId) {
      return c.json({ error: 'Note not found' }, 404);
    }

    await noteRepo.delete(noteId);

    await auditRepo.create({
      action: 'domain_note_deleted',
      entityType: 'domain_note',
      entityId: noteId,
      previousValue: { content: existing.content },
      actorId,
      tenantId,
    });

    return c.json({ success: true });
  } catch (_error) {
    return c.json({ error: 'Failed to delete note' }, 500);
  }
});

// =============================================================================
// DOMAIN TAGS
// =============================================================================

portfolioRoutes.get('/tags', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  if (!tenantId) {
    return c.json({ error: 'Authenticated tenant context required' }, 401);
  }

  try {
    const tagRepo = new DomainTagRepository(db);
    const tags = await tagRepo.listByTenant(tenantId);
    return c.json({ tags });
  } catch (_error) {
    return c.json({ error: 'Failed to fetch tags' }, 500);
  }
});

portfolioRoutes.get('/domains/:domainId/tags', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const domainId = c.req.param('domainId');

  if (!tenantId) {
    return c.json({ error: 'Authenticated tenant context required' }, 401);
  }

  try {
    const domainRepo = new DomainRepository(db);
    const domain = await domainRepo.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    const tagRepo = new DomainTagRepository(db);
    const tags = await tagRepo.findByDomainId(domainId);
    return c.json({ tags });
  } catch (_error) {
    return c.json({ error: 'Failed to fetch tags' }, 500);
  }
});

portfolioRoutes.post('/domains/:domainId/tags', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const domainId = c.req.param('domainId');

  const domainRepo = new DomainRepository(db);
  const domain = await domainRepo.findById(domainId);
  if (!domain || domain.tenantId !== tenantId) {
    return c.json({ error: 'Domain not found' }, 404);
  }

  const validation = await validateBody(c, {
    tag: requiredString('tag', {
      minLength: 1,
      maxLength: 50,
      pattern: /^[a-zA-Z0-9_-]+$/,
      patternMessage: 'tag must contain only letters, numbers, underscores, and hyphens',
    }),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const normalizedTag = validation.data.tag.trim().toLowerCase();

  try {
    const tagRepo = new DomainTagRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const created = await tagRepo.create({
      domainId,
      tag: normalizedTag,
      createdBy: actorId,
      tenantId,
    });

    await auditRepo.create({
      action: 'domain_tag_added',
      entityType: 'domain_tag',
      entityId: created.id,
      newValue: { tag: normalizedTag },
      actorId,
      tenantId,
    });

    return c.json({ tag: created }, 201);
  } catch (_error) {
    return c.json({ error: 'Failed to add tag' }, 500);
  }
});

portfolioRoutes.delete('/domains/:domainId/tags/:tag', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const domainId = c.req.param('domainId');
  const tag = decodeURIComponent(c.req.param('tag'));

  try {
    const domainRepo = new DomainRepository(db);
    const domain = await domainRepo.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    const tagRepo = new DomainTagRepository(db);
    const auditRepo = new AuditEventRepository(db);

    await tagRepo.deleteByDomainAndTag(domainId, tag.toLowerCase());

    await auditRepo.create({
      action: 'domain_tag_removed',
      entityType: 'domain_tag',
      entityId: domainId,
      previousValue: { tag },
      actorId,
      tenantId,
    });

    return c.json({ success: true });
  } catch (_error) {
    return c.json({ error: 'Failed to remove tag' }, 500);
  }
});

// =============================================================================
// SAVED FILTERS
// =============================================================================

portfolioRoutes.get('/filters', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }

  try {
    const filterRepo = new SavedFilterRepository(db);
    const filters = await filterRepo.findByTenant(tenantId, actorId);
    return c.json({
      filters: filters.map((filter) => ({
        ...filter,
        canManage: filter.createdBy === actorId,
      })),
    });
  } catch (_error) {
    return c.json({ error: 'Failed to fetch filters' }, 500);
  }
});

portfolioRoutes.post('/filters', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }

  const validation = await validateBody(c, {
    name: requiredString('name', { minLength: 1, maxLength: 100 }),
    description: optionalString('description', { maxLength: 500 }),
    criteria: (value: unknown) =>
      (value && typeof value === 'object' ? value : {}) as Record<string, unknown>,
    isShared: boolean('isShared', false),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const { name, description, criteria, isShared } = validation.data;

  try {
    const filterRepo = new SavedFilterRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const filter = await filterRepo.create({
      name: name.trim(),
      description,
      criteria: criteria || {},
      isShared: isShared || false,
      createdBy: actorId,
      tenantId,
    });

    await auditRepo.create({
      action: 'filter_created',
      entityType: 'saved_filter',
      entityId: filter.id,
      newValue: { name: filter.name, criteria: filter.criteria },
      actorId,
      tenantId,
    });

    return c.json({ filter }, 201);
  } catch (_error) {
    return c.json({ error: 'Failed to create filter' }, 500);
  }
});

portfolioRoutes.put('/filters/:filterId', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const filterId = c.req.param('filterId');
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  const updateData: {
    name?: string;
    description?: string | null;
    isShared?: boolean;
  } = {};

  if ('criteria' in body) {
    return c.json({ error: 'Filter criteria cannot be updated from this route' }, 400);
  }

  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 100) {
      return c.json({ error: 'name must be a non-empty string up to 100 characters' }, 400);
    }
    updateData.name = body.name.trim();
  }

  if ('description' in body) {
    if (body.description !== null && typeof body.description !== 'string') {
      return c.json({ error: 'description must be a string or null' }, 400);
    }
    if (typeof body.description === 'string' && body.description.length > 500) {
      return c.json({ error: 'description must be 500 characters or fewer' }, 400);
    }
    updateData.description =
      typeof body.description === 'string' ? body.description.trim() || null : null;
  }

  if ('isShared' in body) {
    if (typeof body.isShared !== 'boolean') {
      return c.json({ error: 'isShared must be a boolean' }, 400);
    }
    updateData.isShared = body.isShared;
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: 'At least one editable filter field is required' }, 400);
  }

  try {
    const filterRepo = new SavedFilterRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const existing = await filterRepo.findById(filterId);
    if (!existing || existing.tenantId !== tenantId) {
      return c.json({ error: 'Filter not found' }, 404);
    }

    if (existing.createdBy !== actorId) {
      return c.json({ error: 'Cannot edit filter created by another user' }, 403);
    }

    const updated = await filterRepo.update(filterId, updateData);
    if (!updated) {
      return c.json({ error: 'Filter not found' }, 404);
    }

    await auditRepo.create({
      action: 'filter_updated',
      entityType: 'saved_filter',
      entityId: filterId,
      previousValue: { name: existing.name, criteria: existing.criteria },
      newValue: { name: updated.name, criteria: updated.criteria },
      actorId,
      tenantId,
    });

    return c.json({ filter: updated });
  } catch (_error) {
    return c.json({ error: 'Failed to update filter' }, 500);
  }
});

portfolioRoutes.delete('/filters/:filterId', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const filterId = c.req.param('filterId');

  try {
    const filterRepo = new SavedFilterRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const existing = await filterRepo.findById(filterId);
    if (!existing || existing.tenantId !== tenantId) {
      return c.json({ error: 'Filter not found' }, 404);
    }

    if (existing.createdBy !== actorId) {
      return c.json({ error: 'Cannot delete filter created by another user' }, 403);
    }

    await filterRepo.delete(filterId);

    await auditRepo.create({
      action: 'filter_deleted',
      entityType: 'saved_filter',
      entityId: filterId,
      previousValue: { name: existing.name },
      actorId,
      tenantId,
    });

    return c.json({ success: true });
  } catch (_error) {
    return c.json({ error: 'Failed to delete filter' }, 500);
  }
});

// =============================================================================
// TEMPLATE OVERRIDES
// =============================================================================

portfolioRoutes.get('/templates/overrides', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  if (!tenantId) {
    return c.json({ error: 'Authenticated tenant context required' }, 401);
  }
  const providerKey = c.req.query('provider');

  try {
    const overrideRepo = new TemplateOverrideRepository(db);
    const overrides = providerKey ? await overrideRepo.findByProvider(providerKey, tenantId) : [];
    return c.json({ overrides });
  } catch (_error) {
    return c.json({ error: 'Failed to fetch overrides' }, 500);
  }
});

// Template management is admin-only - requires admin/internal access
portfolioRoutes.post('/templates/overrides', requireAdminAccess, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }

  const validation = await validateBody(c, {
    providerKey: requiredString('providerKey', { minLength: 1, maxLength: 64 }),
    templateKey: requiredString('templateKey', { minLength: 1, maxLength: 64 }),
    overrideData: (value: unknown) => {
      if (!value || typeof value !== 'object') {
        throw new Error('overrideData must be an object');
      }
      return value as Record<string, unknown>;
    },
    appliesToDomains: optionalArray<string>('appliesToDomains'),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const { providerKey, templateKey, overrideData, appliesToDomains } = validation.data;

  try {
    const overrideRepo = new TemplateOverrideRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const override = await overrideRepo.create({
      providerKey,
      templateKey,
      overrideData,
      appliesToDomains: appliesToDomains || [],
      createdBy: actorId,
      tenantId,
    });

    await auditRepo.create({
      action: 'template_override_created',
      entityType: 'template_override',
      entityId: override.id,
      newValue: { providerKey, templateKey, overrideData },
      actorId,
      tenantId,
    });

    return c.json({ override }, 201);
  } catch (_error) {
    return c.json({ error: 'Failed to create override' }, 500);
  }
});

// Template management is admin-only - requires admin/internal access
portfolioRoutes.put('/templates/overrides/:overrideId', requireAdminAccess, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const overrideId = c.req.param('overrideId');
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  const allowedKeys = new Set(['overrideData', 'appliesToDomains']);
  const unexpectedKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unexpectedKeys.length > 0) {
    return c.json({ error: `Unsupported override fields: ${unexpectedKeys.join(', ')}` }, 400);
  }

  const updateData: {
    overrideData?: Record<string, unknown>;
    appliesToDomains?: string[];
  } = {};

  if ('overrideData' in body) {
    if (
      !body.overrideData ||
      typeof body.overrideData !== 'object' ||
      Array.isArray(body.overrideData)
    ) {
      return c.json({ error: 'overrideData must be an object' }, 400);
    }
    updateData.overrideData = body.overrideData as Record<string, unknown>;
  }

  if ('appliesToDomains' in body) {
    if (
      !Array.isArray(body.appliesToDomains) ||
      !body.appliesToDomains.every((item) => typeof item === 'string')
    ) {
      return c.json({ error: 'appliesToDomains must be an array of strings' }, 400);
    }
    updateData.appliesToDomains = body.appliesToDomains as string[];
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: 'At least one editable override field is required' }, 400);
  }

  try {
    const overrideRepo = new TemplateOverrideRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const existing = await overrideRepo.findById(overrideId);
    if (!existing || existing.tenantId !== tenantId) {
      return c.json({ error: 'Override not found' }, 404);
    }

    const updated = await overrideRepo.update(overrideId, updateData);
    if (!updated) {
      return c.json({ error: 'Override not found' }, 404);
    }

    await auditRepo.create({
      action: 'template_override_updated',
      entityType: 'template_override',
      entityId: overrideId,
      previousValue: { overrideData: existing.overrideData },
      newValue: { overrideData: updated.overrideData },
      actorId,
      tenantId,
    });

    return c.json({ override: updated });
  } catch (_error) {
    return c.json({ error: 'Failed to update override' }, 500);
  }
});

// Template management is admin-only - requires admin/internal access
portfolioRoutes.delete('/templates/overrides/:overrideId', requireAdminAccess, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!tenantId || !actorId) {
    return c.json({ error: 'Authenticated tenant and actor required' }, 401);
  }
  const overrideId = c.req.param('overrideId');

  try {
    const overrideRepo = new TemplateOverrideRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const existing = await overrideRepo.findById(overrideId);
    if (!existing || existing.tenantId !== tenantId) {
      return c.json({ error: 'Override not found' }, 404);
    }

    await overrideRepo.delete(overrideId);

    await auditRepo.create({
      action: 'template_override_deleted',
      entityType: 'template_override',
      entityId: overrideId,
      previousValue: { providerKey: existing.providerKey, templateKey: existing.templateKey },
      actorId,
      tenantId,
    });

    return c.json({ success: true });
  } catch (_error) {
    return c.json({ error: 'Failed to delete override' }, 500);
  }
});

// =============================================================================
// AUDIT LOG
// =============================================================================

portfolioRoutes.get('/audit', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  if (!tenantId) {
    return c.json({ error: 'Authenticated tenant context required' }, 401);
  }
  const limit = parseInt(c.req.query('limit') || '50', 10);

  try {
    const auditRepo = new AuditEventRepository(db);
    const events = await auditRepo.findByTenant(tenantId, limit);
    return c.json({ events });
  } catch (_error) {
    return c.json({ error: 'Failed to fetch audit log' }, 500);
  }
});
