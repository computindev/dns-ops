/**
 * Guidance-only suggestion routes.
 *
 * Persisted rows may predate the guidance-only contract, so every response is
 * normalized from the finding type and never returns legacy executable text.
 */

import type { IDatabaseAdapter, Suggestion } from '@dns-ops/db';
import {
  DomainRepository,
  FindingRepository,
  SnapshotRepository,
  SuggestionRepository,
} from '@dns-ops/db';
import { Hono } from 'hono';
import { guidanceForPersistedFinding, sanitizePersistedSuggestion } from '../lib/guidance.js';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import type { Env } from '../types.js';

export const suggestionsRoutes = new Hono<Env>();
suggestionsRoutes.use('*', requireAuth);

async function findTenantSuggestion(
  db: IDatabaseAdapter,
  tenantId: string,
  suggestionId: string
): Promise<{ suggestion: Suggestion; findingType: string } | null> {
  const suggestion = await new SuggestionRepository(db).findById(suggestionId);
  if (!suggestion) return null;
  const finding = await new FindingRepository(db).findById(suggestion.findingId);
  if (!finding) return null;
  const snapshot = await new SnapshotRepository(db).findById(finding.snapshotId);
  if (!snapshot) return null;
  const domain = await new DomainRepository(db).findById(snapshot.domainId);
  if (!domain || domain.tenantId !== tenantId) return null;
  return { suggestion, findingType: finding.type };
}

suggestionsRoutes.patch('/:suggestionId/apply', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  if (!db) return c.json({ error: 'Database not available' }, 503);
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401);

  const suggestionId = c.req.param('suggestionId');
  const loaded = await findTenantSuggestion(db, tenantId, suggestionId);
  if (!loaded) {
    return c.json({ error: 'Suggestion not found', code: 'NOT_FOUND', suggestionId }, 404);
  }

  const { findingType, suggestion } = loaded;
  if (suggestion.appliedAt) {
    return c.json(
      {
        error: 'This guidance was historically acknowledged; no provider mutation was executed',
        code: 'GUIDANCE_ONLY',
        suggestionId,
        historicalAcknowledgement: {
          acknowledgedAt: suggestion.appliedAt,
          acknowledgedBy: suggestion.appliedBy,
        },
        guidance: guidanceForPersistedFinding(findingType),
      },
      409
    );
  }
  if (suggestion.dismissedAt) {
    return c.json(
      {
        error: 'Suggestion was dismissed',
        code: 'DISMISSED',
        suggestionId,
        dismissedAt: suggestion.dismissedAt,
      },
      409
    );
  }

  return c.json(
    {
      error: 'Generic suggestions are guidance-only and cannot be applied by DNS Ops',
      code: 'GUIDANCE_ONLY',
      suggestionId,
      guidance: guidanceForPersistedFinding(findingType),
    },
    409
  );
});

suggestionsRoutes.patch('/:suggestionId/dismiss', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  if (!db) return c.json({ error: 'Database not available' }, 503);
  if (!tenantId || !actorId) return c.json({ error: 'Unauthorized' }, 401);

  const suggestionId = c.req.param('suggestionId');
  const loaded = await findTenantSuggestion(db, tenantId, suggestionId);
  if (!loaded) {
    return c.json({ error: 'Suggestion not found', code: 'NOT_FOUND', suggestionId }, 404);
  }

  const { findingType, suggestion } = loaded;
  if (suggestion.dismissedAt) {
    return c.json(
      { error: 'Suggestion already dismissed', code: 'ALREADY_DISMISSED', suggestionId },
      409
    );
  }
  if (suggestion.appliedAt) {
    return c.json(
      {
        error: 'This guidance was historically acknowledged; no provider mutation was executed',
        code: 'GUIDANCE_ONLY',
        suggestionId,
        historicalAcknowledgement: {
          acknowledgedAt: suggestion.appliedAt,
          acknowledgedBy: suggestion.appliedBy,
        },
        guidance: guidanceForPersistedFinding(findingType),
      },
      409
    );
  }

  let reason: string | undefined;
  try {
    const body = await c.req.json<{ reason?: string }>();
    reason = body.reason;
  } catch {
    // An omitted body is valid for dismissal.
  }

  const dismissed = await new SuggestionRepository(db).markDismissed(suggestionId, actorId, reason);
  if (!dismissed) return c.json({ error: 'Failed to dismiss suggestion', suggestionId }, 500);

  return c.json({
    success: true,
    suggestion: sanitizePersistedSuggestion(dismissed, findingType),
  });
});

suggestionsRoutes.get('/:suggestionId', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  if (!db) return c.json({ error: 'Database not available' }, 503);
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401);

  const suggestionId = c.req.param('suggestionId');
  const loaded = await findTenantSuggestion(db, tenantId, suggestionId);
  if (!loaded) {
    return c.json({ error: 'Suggestion not found', code: 'NOT_FOUND', suggestionId }, 404);
  }

  return c.json({
    suggestion: sanitizePersistedSuggestion(loaded.suggestion, loaded.findingType),
  });
});
