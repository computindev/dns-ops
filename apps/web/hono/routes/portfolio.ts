/**
 * Portfolio Routes - Bead 14
 *
 * API endpoints for portfolio search, domain notes/tags,
 * saved filters, and template management.
 */

import { evaluationCoverageOrUnknown, isEvaluationComplete } from '@dns-ops/contracts';
import {
  AuditEventRepository,
  DomainNoteRepository,
  DomainRepository,
  DomainTagRepository,
  SavedFilterRepository,
  TemplateOverrideRepository,
} from '@dns-ops/db';
import { domains, findings, probeObservations, snapshots } from '@dns-ops/db/schema';
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
// EXPIRATION READ MODEL (Issue #60)
//
// Derives a portfolio expiry projection from persisted RDAP probe observations
// only. No RDAP client and no network lookups happen here: the latest snapshot's
// newest RDAP row is the sole evidence source. Anything missing, failed,
// UNKNOWN, mismatched, or unparseable is UNKNOWN — never a healthy date.
//
// Freshness follow-up (Issue #60): this read model is deliberately
// threshold-free — the latest snapshot's newest successful RDAP row stays
// OBSERVED no matter how old it is, while docs/playbooks/domain-expiry.md
// ultimately requires stale evidence to render UNKNOWN. Add a probe-age
// threshold here when that freshness policy is decided.
// =============================================================================

const EXPIRATION_WITHIN_DAYS = [7, 30, 90] as const;
type ExpirationWithinDays = (typeof EXPIRATION_WITHIN_DAYS)[number];

type ExpirationBucket = 'EXPIRED' | 'WITHIN_7' | 'WITHIN_30' | 'WITHIN_90' | 'LATER';

type Expiration =
  | {
      status: 'OBSERVED';
      expirationDate: string;
      observedAt: string;
      bucket: ExpirationBucket;
    }
  | { status: 'UNKNOWN' };

const DAY_MS = 24 * 60 * 60 * 1000;

// RFC3339 date-time only, mirroring the collector's evidence contract
// (apps/collector/src/probes/rdap.ts). A date-only value such as
// "2026-12-15" parses via Date.parse but is not valid collector evidence and
// must not be promoted to OBSERVED here.
const RFC3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isValidRfc3339DateTime(value: string): boolean {
  const match = RFC3339_DATE_TIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHour > 23 || offsetMinute > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth && !Number.isNaN(Date.parse(value));
}

function expirationWindowOfBucket(bucket: ExpirationBucket): ExpirationWithinDays | null {
  switch (bucket) {
    case 'WITHIN_7':
      return 7;
    case 'WITHIN_30':
      return 30;
    case 'WITHIN_90':
      return 90;
    default:
      return null; // EXPIRED is excluded from within filters; LATER is beyond 90 days
  }
}

function deriveExpiration(
  observation: typeof probeObservations.$inferSelect | undefined,
  normalizedDomainName: string,
  now: number
): Expiration {
  const data = observation?.probeData as
    | {
        check?: string;
        status?: string;
        evidence?: {
          kind?: string;
          domain?: string;
          expirationDate?: unknown;
        };
      }
    | null
    | undefined;

  // Gate on the persisted check status, not merely date presence: an UNKNOWN
  // result (malformed/conflicting events) can still carry evidence.expirationDate.
  if (
    !observation ||
    observation.probeType !== 'rdap' ||
    !observation.success ||
    !data ||
    data.check !== 'RDAP_EXPIRATION' ||
    data.status !== 'OBSERVED'
  ) {
    return { status: 'UNKNOWN' };
  }

  const evidence = data.evidence;
  if (!evidence || evidence.kind !== 'RDAP_EXPIRATION') {
    return { status: 'UNKNOWN' };
  }

  const evidenceDomain = evidence.domain?.toLowerCase().replace(/\.$/, '');
  if (!evidenceDomain || evidenceDomain !== normalizedDomainName) {
    return { status: 'UNKNOWN' };
  }

  if (
    typeof evidence.expirationDate !== 'string' ||
    !isValidRfc3339DateTime(evidence.expirationDate)
  ) {
    return { status: 'UNKNOWN' };
  }

  const expiresAt = Date.parse(evidence.expirationDate);
  if (Number.isNaN(expiresAt)) {
    return { status: 'UNKNOWN' };
  }

  // Exact upper boundaries are inclusive: one millisecond beyond enters the next bucket.
  const delta = expiresAt - now;
  const bucket: ExpirationBucket =
    delta <= 0
      ? 'EXPIRED'
      : delta <= 7 * DAY_MS
        ? 'WITHIN_7'
        : delta <= 30 * DAY_MS
          ? 'WITHIN_30'
          : delta <= 90 * DAY_MS
            ? 'WITHIN_90'
            : 'LATER';

  return {
    status: 'OBSERVED',
    expirationDate: evidence.expirationDate,
    observedAt: observation.probedAt.toISOString(),
    bucket,
  };
}

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
    findingTypePrefix: optionalString('findingTypePrefix', { maxLength: 100 }),
    snapshotOlderThanDays: integer('snapshotOlderThanDays', {
      min: 1,
      max: 3650,
      required: false,
    }),
    coverage: optionalString('coverage', { maxLength: 20 }),
    expirationWithinDays: (value: unknown): ExpirationWithinDays | undefined => {
      if (value === undefined || value === null) {
        return undefined;
      }
      if (
        typeof value !== 'number' ||
        !EXPIRATION_WITHIN_DAYS.includes(value as ExpirationWithinDays)
      ) {
        throw new Error('expirationWithinDays must be one of: 7, 30, 90');
      }
      return value as ExpirationWithinDays;
    },
    limit: integer('limit', { min: 1, max: 100, required: false }),
    offset: integer('offset', { min: 0, required: false }),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const {
    query,
    tags,
    severities,
    zoneManagement,
    findingTypePrefix,
    snapshotOlderThanDays,
    coverage,
    expirationWithinDays,
    limit = 20,
    offset = 0,
  } = validation.data;
  // One request-scoped clock keeps bucketing, filtering, and sorting consistent.
  const now = Date.now();

  if (coverage !== undefined && coverage !== 'incomplete') {
    return c.json({ error: 'coverage must be "incomplete"' }, 400);
  }

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

    // Fetch matching domains.
    // ponytail: no DB-level pagination — expiry filtering/sorting needs the whole
    // tenant match set before slicing; move to a DB-native read model only if a
    // portfolio grows large enough for this to measurably hurt.
    const results = await db.getDrizzle().query.domains.findMany({
      where: whereClause,
      orderBy: desc(domains.updatedAt),
    });

    // PERF-001: Batch query optimization
    // Instead of N queries for snapshots (one per domain), we do 1 query with IN clause
    // Same for findings and RDAP observations - batch by snapshot IDs

    // Re-assert tenant ownership in memory before deriving snapshot IDs so a
    // predicate-ignoring data layer cannot leak another tenant's evidence.
    const portfolioResults = results.filter(
      (domain) =>
        domain.tenantId === tenantId &&
        (domain.metadata as { portfolio?: boolean } | null)?.portfolio !== false
    );
    const resultDomainIds = portfolioResults.map((d) => d.id);
    const resultDomainIdSet = new Set(resultDomainIds);

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
      if (
        resultDomainIdSet.has(snapshot.domainId) &&
        !latestSnapshotByDomain.has(snapshot.domainId)
      ) {
        latestSnapshotByDomain.set(snapshot.domainId, snapshot);
      }
    }

    // Get all snapshot IDs for findings query
    const snapshotIds = Array.from(latestSnapshotByDomain.values()).map((s) => s.id);

    // Batch fetch all findings for these snapshots. Severity matching happens in
    // memory so the filter applies to the full result set, not just a page.
    const hasSeverityFilter = severities && severities.length > 0;
    const hasFindingCriteria = hasSeverityFilter || findingTypePrefix !== undefined;
    const severitySet = new Set(severities ?? []);
    const stalenessCutoffMs =
      snapshotOlderThanDays !== undefined
        ? now - snapshotOlderThanDays * DAY_MS
        : null;
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

    // Batch fetch RDAP probe observations for these snapshots (Issue #60).
    // Ordered newest-first so the first row per snapshot is the newest evidence.
    const rdapObservations =
      snapshotIds.length > 0
        ? await db.getDrizzle().query.probeObservations.findMany({
            where: and(
              inArray(probeObservations.snapshotId, snapshotIds),
              eq(probeObservations.probeType, 'rdap')
            ),
            orderBy: desc(probeObservations.probedAt),
          })
        : [];

    const latestRdapBySnapshot = new Map<string, (typeof rdapObservations)[number]>();
    for (const observation of rdapObservations) {
      if (!latestRdapBySnapshot.has(observation.snapshotId)) {
        latestRdapBySnapshot.set(observation.snapshotId, observation);
      }
    }

    // Enrich, filter (severity + expiry), and sort before pagination so `total`
    // reflects the whole filtered tenant portfolio (Issue #60).
    const enriched: Array<{
      domain: Record<string, unknown> & { normalizedName: string };
      sortInstant: number | null;
    }> = [];

    for (const domain of portfolioResults) {
      const latestSnapshot = latestSnapshotByDomain.get(domain.id);
      const evaluationCoverage = evaluationCoverageOrUnknown(latestSnapshot?.metadata?.evaluation);
      const findingsEvaluated = isEvaluationComplete(evaluationCoverage);

      if (coverage === 'incomplete' && findingsEvaluated) continue;
      if (
        stalenessCutoffMs !== null &&
        (!latestSnapshot || new Date(latestSnapshot.createdAt).getTime() > stalenessCutoffMs)
      ) continue;

      if (!latestSnapshot) {
        // Missing evidence is UNKNOWN and cannot match a within window.
        if (expirationWithinDays !== undefined) {
          continue;
        }
        enriched.push({
          domain: {
            ...domain,
            findings: [],
            findingsEvaluated,
            evaluationCoverage,
            latestSnapshot: null,
            expiration: { status: 'UNKNOWN' } as const,
          },
          sortInstant: null,
        });
        continue;
      }

      // Only explicit complete coverage permits a zero-finding result to filter
      // the domain out. A ruleset ID alone does not prove every check completed.
      const domainFindings = (findingsBySnapshot.get(latestSnapshot.id) || []).filter(
        (finding) =>
          (!severitySet.size || severitySet.has(finding.severity)) &&
          (!findingTypePrefix || finding.type.startsWith(findingTypePrefix))
      );

      // Filter out if severity filter doesn't match AND findings were evaluated
      // Don't filter out if findings weren't evaluated (might have matching findings once evaluated)
      if (hasFindingCriteria && domainFindings.length === 0 && findingsEvaluated) {
        continue;
      }

      const expiration = deriveExpiration(
        latestRdapBySnapshot.get(latestSnapshot.id),
        domain.normalizedName,
        now
      );

      if (expirationWithinDays !== undefined) {
        const bucketWindow =
          expiration.status === 'OBSERVED' ? expirationWindowOfBucket(expiration.bucket) : null;
        // EXPIRED/LATER and UNKNOWN never match a within window.
        if (bucketWindow === null || bucketWindow > expirationWithinDays) {
          continue;
        }
      }

      enriched.push({
        domain: {
          ...domain,
          findings: domainFindings,
          findingsEvaluated,
          evaluationCoverage,
          latestSnapshot: {
            id: latestSnapshot.id,
            createdAt: latestSnapshot.createdAt,
            resultState: latestSnapshot.resultState,
            rulesetVersionId: latestSnapshot.rulesetVersionId,
          },
          expiration,
        },
        sortInstant:
          expiration.status === 'OBSERVED' ? Date.parse(expiration.expirationDate) : null,
      });
    }

    // Sort observed expiration instants ascending, UNKNOWN last, then name.
    enriched.sort((a, b) => {
      if (a.sortInstant === null || b.sortInstant === null) {
        if (a.sortInstant === b.sortInstant) {
          return a.domain.normalizedName.localeCompare(b.domain.normalizedName);
        }
        return a.sortInstant === null ? 1 : -1;
      }
      if (a.sortInstant !== b.sortInstant) {
        return a.sortInstant - b.sortInstant;
      }
      return a.domain.normalizedName.localeCompare(b.domain.normalizedName);
    });

    const total = enriched.length;
    const domainResults = enriched.slice(offset, offset + limit).map((entry) => entry.domain);

    // Track search event (Bead 14.4)
    trackSearch({
      tenantId,
      query,
      filters: {
        tags,
        severities,
        zoneManagement,
        findingTypePrefix,
        snapshotOlderThanDays,
        coverage,
        expirationWithinDays,
      },
      resultCount: domainResults.length,
      durationMs: Date.now() - startTime,
    });

    return c.json({
      domains: domainResults,
      total,
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
