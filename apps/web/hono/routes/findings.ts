/**
 * Findings API Routes - Bead 06 Enhanced
 *
 * Endpoints for evaluating rules and retrieving persisted findings.
 * Includes DNS rules and Mail rules with database persistence.
 */

import { evaluationCoverageOrUnknown } from '@dns-ops/contracts';
import type { NewFinding, NewSuggestion } from '@dns-ops/db';
import {
  DkimSelectorRepository,
  DomainRepository,
  FindingRepository,
  MailEvidenceRepository,
  ObservationRepository,
  RecordSetRepository,
  RulesetVersionRepository,
  SnapshotRepository,
  SuggestionRepository,
} from '@dns-ops/db';
// Import rules from packages/rules
import {
  authoritativeFailureRule,
  authoritativeMismatchRule,
  bimiRule,
  cnameCoexistenceRule,
  dkimRule,
  dmarcRule,
  mtaStsRule,
  mxPresenceRule,
  type RuleContext,
  RulesEngine,
  type Ruleset,
  recursiveAuthoritativeMismatchRule,
  spfRule,
  tlsRptRule,
  unmanagedZonePartialCoverageRule,
} from '@dns-ops/rules';
import { Hono } from 'hono';
import { sanitizePersistedSuggestion } from '../lib/guidance.js';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import { getWebLogger } from '../middleware/error-tracking.js';
import type { Env } from '../types.js';

export const findingsRoutes = new Hono<Env>();

// Current ruleset version - bump when rules change
const CURRENT_RULESET_VERSION = '1.2.0';
const CURRENT_RULESET_NAME = 'DNS and Mail Rules';

/**
 * Create the combined ruleset with DNS and Mail rules
 */
export function createCombinedRuleset(): Ruleset {
  return {
    id: 'dns-mail-v1',
    version: CURRENT_RULESET_VERSION,
    name: CURRENT_RULESET_NAME,
    description: 'Combined DNS and mail analysis rules (Bead 06)',
    rules: [
      // DNS rules
      authoritativeFailureRule,
      authoritativeMismatchRule,
      recursiveAuthoritativeMismatchRule,
      cnameCoexistenceRule,
      unmanagedZonePartialCoverageRule,
      // Mail rules
      mxPresenceRule,
      spfRule,
      dmarcRule,
      dkimRule,
      mtaStsRule,
      tlsRptRule,
      bimiRule,
    ],
    createdAt: new Date(),
  };
}

/**
 * Ensure a ruleset version exists in the database
 */
async function ensureRulesetVersion(
  rulesetVersionRepo: RulesetVersionRepository,
  ruleset: Ruleset,
  createdBy: string
): Promise<string> {
  const existing = await rulesetVersionRepo.findByVersion(ruleset.version);
  if (existing) {
    return existing.id;
  }

  // Create new ruleset version
  const newVersion = await rulesetVersionRepo.create({
    version: ruleset.version,
    name: ruleset.name,
    description: ruleset.description || '',
    rules: ruleset.rules.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      enabled: r.enabled !== false,
    })),
    active: true, // Mark as active
    createdBy,
  });

  return newVersion.id;
}

/**
 * GET /api/snapshot/:snapshotId/findings
 * Get persisted findings for a snapshot, or evaluate and persist if not found.
 *
 * Implements idempotent re-evaluation:
 * - If findings exist for the current ruleset version, return them
 * - If findings exist for a different ruleset version, evaluate with current version
 * - If no findings exist, evaluate and persist
 * - If refresh=true, delete existing findings for current ruleset version and re-evaluate
 */
findingsRoutes.get('/snapshot/:snapshotId/findings', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const forceRefresh = c.req.query('refresh') === 'true';
  const db = c.get('db');

  try {
    // Initialize repositories
    const snapshotRepo = new SnapshotRepository(db);
    const domainRepo = new DomainRepository(db);
    const observationRepo = new ObservationRepository(db);
    const recordSetRepo = new RecordSetRepository(db);
    const findingRepo = new FindingRepository(db);
    const suggestionRepo = new SuggestionRepository(db);
    const rulesetVersionRepo = new RulesetVersionRepository(db);

    // Fetch snapshot
    const snapshot = await snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    // Fetch domain
    const domain = await domainRepo.findById(snapshot.domainId);
    if (!domain) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    // Tenant isolation: reject if domain belongs to a different tenant
    const tenantId = c.get('tenantId');
    if (domain.tenantId && domain.tenantId !== tenantId) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }
    if (!tenantId && domain.tenantId) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    // Get current ruleset and ensure version exists
    const ruleset = createCombinedRuleset();
    const actorId = c.get('actorId') || 'system';
    const rulesetVersionId = await ensureRulesetVersion(rulesetVersionRepo, ruleset, actorId);

    // Check for existing findings for the current ruleset version (idempotent)
    const existingFindingsForVersion = await findingRepo.findBySnapshotIdAndRulesetVersionId(
      snapshotId,
      rulesetVersionId
    );

    if (existingFindingsForVersion.length > 0 && !forceRefresh) {
      // Idempotent return: findings already exist for this (snapshotId, rulesetVersionId)
      const findingIds = existingFindingsForVersion.map((f) => f.id);
      const suggestionsMap = await suggestionRepo.findByFindingIds(findingIds);

      const findingTypeById = new Map(
        existingFindingsForVersion.map((finding) => [finding.id, finding.type])
      );
      const allSuggestions = [...suggestionsMap.values()]
        .flat()
        .map((suggestion) =>
          sanitizePersistedSuggestion(
            suggestion,
            findingTypeById.get(suggestion.findingId) ?? 'unknown'
          )
        );

      // Categorize findings
      const dnsFindings = existingFindingsForVersion.filter((f) => f.type.startsWith('dns.'));
      const mailFindings = existingFindingsForVersion.filter((f) => f.type.startsWith('mail.'));

      return c.json({
        snapshotId,
        domain: domain.name,
        rulesetVersion: ruleset.version,
        rulesetVersionId,
        persisted: true,
        idempotent: true, // Indicates findings were already present for this ruleset version
        evaluationCoverage: evaluationCoverageOrUnknown(snapshot.metadata?.evaluation),
        summary: {
          totalFindings: existingFindingsForVersion.length,
          dnsFindings: dnsFindings.length,
          mailFindings: mailFindings.length,
          suggestions: allSuggestions.length,
        },
        findings: existingFindingsForVersion,
        suggestions: allSuggestions,
        categorized: {
          dns: dnsFindings,
          mail: mailFindings,
        },
      });
    }

    // Need to evaluate: either no findings for current version, or force refresh
    const observations = await observationRepo.findBySnapshotId(snapshotId);
    const recordSets = await recordSetRepo.findBySnapshotId(snapshotId);

    // Create rule context
    const context: RuleContext = {
      snapshotId,
      domainId: domain.id,
      domainName: domain.name,
      zoneManagement: snapshot.zoneManagement,
      observations,
      recordSets,
      rulesetVersion: ruleset.version,
    };

    // Evaluate rules. Persist explicit coverage so zero findings cannot imply
    // healthy when an enabled rule failed.
    const engine = new RulesEngine(ruleset);
    const { findings, suggestions, errors, complete } = engine.evaluate(context);
    const evaluationCoverage = {
      state: complete ? ('COMPLETE' as const) : ('PARTIAL' as const),
      errors,
    };
    await snapshotRepo.updateEvaluationCoverage(snapshotId, evaluationCoverage);

    // Delete existing findings for this ruleset version only (not other versions)
    // This preserves historical findings from previous ruleset versions
    if (forceRefresh && existingFindingsForVersion.length > 0) {
      await findingRepo.deleteBySnapshotIdAndRulesetVersionId(snapshotId, rulesetVersionId);
    }

    // Persist findings with rulesetVersionId for idempotent re-evaluation
    const findingsToInsert: NewFinding[] = findings.map((f) => ({
      snapshotId,
      type: f.type,
      title: f.title,
      description: f.description,
      severity: f.severity,
      confidence: f.confidence,
      riskPosture: f.riskPosture,
      blastRadius: f.blastRadius,
      reviewOnly: f.reviewOnly,
      evidence: f.evidence,
      ruleId: f.ruleId,
      ruleVersion: f.ruleVersion,
      rulesetVersionId, // Link to ruleset version for idempotent re-evaluation
    }));

    const persistedFindings = await findingRepo.createMany(findingsToInsert);

    // Build finding ID map for suggestion linking
    const findingIdMap = new Map<string, string>();
    for (let i = 0; i < findings.length; i++) {
      const originalId = findings[i].id;
      const persistedId = persistedFindings[i]?.id;
      if (originalId && persistedId) {
        findingIdMap.set(originalId, persistedId);
      }
    }

    // Persist suggestions with corrected finding IDs
    const suggestionsToInsert: NewSuggestion[] = [];
    for (const s of suggestions) {
      const persistedFindingId = findingIdMap.get(s.findingId);
      if (persistedFindingId) {
        suggestionsToInsert.push({
          findingId: persistedFindingId,
          title: s.title,
          description: s.description,
          action: s.action,
          riskPosture: s.riskPosture,
          blastRadius: s.blastRadius,
          reviewOnly: s.reviewOnly ?? false,
        });
      }
    }

    const persistedSuggestions = await suggestionRepo.createMany(suggestionsToInsert);

    // Categorize findings
    const dnsFindings = persistedFindings.filter((f) => f.type.startsWith('dns.'));
    const mailFindings = persistedFindings.filter((f) => f.type.startsWith('mail.'));

    return c.json({
      snapshotId,
      domain: domain.name,
      rulesetVersion: ruleset.version,
      rulesetVersionId,
      persisted: true,
      evaluated: true,
      idempotent: false, // Indicates findings were freshly evaluated (not cached)
      rulesEvaluated: engine.getEnabledRulesCount(),
      evaluationCoverage,
      summary: {
        totalFindings: persistedFindings.length,
        dnsFindings: dnsFindings.length,
        mailFindings: mailFindings.length,
        suggestions: persistedSuggestions.length,
      },
      findings: persistedFindings,
      suggestions: persistedSuggestions,
      categorized: {
        dns: dnsFindings,
        mail: mailFindings,
      },
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error evaluating findings:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshots/:snapshotId/findings',
        method: 'POST',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to evaluate findings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/snapshot/:snapshotId/findings/mail
 * Get mail-specific findings with mail evidence and DKIM selectors
 */
findingsRoutes.get('/snapshot/:snapshotId/findings/mail', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const db = c.get('db');

  try {
    // Initialize repositories
    const snapshotRepo = new SnapshotRepository(db);
    const domainRepo = new DomainRepository(db);
    const findingRepo = new FindingRepository(db);
    const suggestionRepo = new SuggestionRepository(db);
    const mailEvidenceRepo = new MailEvidenceRepository(db);
    const dkimSelectorRepo = new DkimSelectorRepository(db);

    // Fetch snapshot
    const snapshot = await snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    // Fetch domain
    const domain = await domainRepo.findById(snapshot.domainId);
    if (!domain) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    // Tenant isolation: reject if domain belongs to a different tenant
    const tenantId = c.get('tenantId');
    if (domain.tenantId && domain.tenantId !== tenantId) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }
    if (!tenantId && domain.tenantId) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    // Fetch mail evidence and DKIM selectors in parallel
    const [mailEvidence, dkimSelectors] = await Promise.all([
      mailEvidenceRepo.findBySnapshotId(snapshotId),
      dkimSelectorRepo.findBySnapshotId(snapshotId),
    ]);

    // Check for existing persisted findings
    const allFindings = await findingRepo.findBySnapshotId(snapshotId);
    const mailFindings = allFindings.filter((f) => f.type.startsWith('mail.'));

    // If no findings, trigger evaluation by calling the main endpoint
    if (allFindings.length === 0) {
      // Redirect to main findings endpoint to trigger evaluation
      const mainResponse = await fetch(`${c.req.url.replace('/findings/mail', '/findings')}`, {
        headers: c.req.raw.headers,
      });
      const mainData = (await mainResponse.json()) as {
        findings?: Array<{ type: string }>;
        categorized?: { mail?: Array<{ type: string }> };
        evaluationCoverage?: { state: 'COMPLETE' | 'PARTIAL'; errors: unknown[] };
      };
      const evaluatedMailFindings = mainData.categorized?.mail || [];

      // Calculate mail security score from findings (basic analysis)
      const mailConfig = analyzeMailConfiguration(evaluatedMailFindings);

      // Enhance mail config with persisted evidence if available
      const enhancedMailConfig = enhanceMailConfigWithEvidence(mailConfig, mailEvidence);

      return c.json({
        snapshotId,
        domain: domain.name,
        rulesetVersion: CURRENT_RULESET_VERSION,
        evaluationCoverage:
          mainData.evaluationCoverage ?? evaluationCoverageOrUnknown(snapshot.metadata?.evaluation),
        summary: {
          totalFindings: evaluatedMailFindings.length,
          dkimSelectorsFound: dkimSelectors.filter((s) => s.found).length,
          dkimSelectorsTried: dkimSelectors.length,
        },
        mailConfig: enhancedMailConfig,
        mailEvidence: mailEvidence || null,
        dkimSelectors: formatDkimSelectors(dkimSelectors),
        findings: evaluatedMailFindings,
      });
    }

    // Get suggestions for mail findings
    const mailFindingIds = mailFindings.map((f) => f.id);
    const suggestionsMap = await suggestionRepo.findByFindingIds(mailFindingIds);
    const findingTypeById = new Map(mailFindings.map((finding) => [finding.id, finding.type]));
    const allSuggestions = [...suggestionsMap.values()]
      .flat()
      .map((suggestion) =>
        sanitizePersistedSuggestion(
          suggestion,
          findingTypeById.get(suggestion.findingId) ?? 'unknown'
        )
      );

    // Calculate mail security score from findings (basic analysis)
    const mailConfig = analyzeMailConfiguration(mailFindings);

    // Enhance mail config with persisted evidence if available
    const enhancedMailConfig = enhanceMailConfigWithEvidence(mailConfig, mailEvidence);

    return c.json({
      snapshotId,
      domain: domain.name,
      rulesetVersion: mailFindings[0]?.ruleVersion || CURRENT_RULESET_VERSION,
      persisted: true,
      evaluationCoverage: evaluationCoverageOrUnknown(snapshot.metadata?.evaluation),
      summary: {
        totalFindings: mailFindings.length,
        suggestions: allSuggestions.length,
        dkimSelectorsFound: dkimSelectors.filter((s) => s.found).length,
        dkimSelectorsTried: dkimSelectors.length,
      },
      mailConfig: enhancedMailConfig,
      mailEvidence: mailEvidence || null,
      dkimSelectors: formatDkimSelectors(dkimSelectors),
      findings: mailFindings,
      suggestions: allSuggestions,
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error evaluating mail findings:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/mail/findings',
        method: 'POST',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to evaluate mail findings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/snapshot/:snapshotId/evaluate
 * Re-evaluate a snapshot with the current ruleset.
 *
 * Idempotent behavior:
 * - Deletes findings for the current ruleset version only (preserves historical versions)
 * - Re-evaluates with the current ruleset and persists new findings
 * - Returns the newly evaluated findings
 */
findingsRoutes.post('/snapshot/:snapshotId/evaluate', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const db = c.get('db');

  try {
    const snapshotRepo = new SnapshotRepository(db);
    const findingRepo = new FindingRepository(db);
    const rulesetVersionRepo = new RulesetVersionRepository(db);

    // Verify snapshot exists
    const snapshot = await snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    // Get current ruleset version
    const ruleset = createCombinedRuleset();
    const actorId = c.get('actorId') || 'system';
    const rulesetVersionId = await ensureRulesetVersion(rulesetVersionRepo, ruleset, actorId);

    // Delete findings for the current ruleset version only (preserves historical versions)
    const deletedCount = await findingRepo.deleteBySnapshotIdAndRulesetVersionId(
      snapshotId,
      rulesetVersionId
    );

    // Redirect to GET endpoint with refresh flag to re-evaluate
    const response = await fetch(`${c.req.url.replace('/evaluate', '/findings')}?refresh=true`, {
      headers: c.req.raw.headers,
    });

    const result = (await response.json()) as Record<string, unknown>;

    return c.json({
      snapshotId,
      previousFindingsDeleted: deletedCount,
      rulesetVersion: ruleset.version,
      rulesetVersionId,
      ...(typeof result === 'object' && result !== null ? result : {}),
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error re-evaluating findings:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshots/:snapshotId/findings/re-evaluate',
        method: 'POST',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to re-evaluate findings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/snapshot/:snapshotId/findings/summary
 * Get a quick summary of findings by severity
 */
findingsRoutes.get('/snapshot/:snapshotId/findings/summary', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  try {
    // Resolve snapshot→domain→tenant for isolation
    const snapshotRepo = new SnapshotRepository(db);
    const domainRepo = new DomainRepository(db);

    const snapshot = await snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    const domain = await domainRepo.findById(snapshot.domainId);
    if (!domain) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    // Tenant isolation: reject if domain belongs to a different tenant
    if (domain.tenantId && domain.tenantId !== tenantId) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }
    if (!tenantId && domain.tenantId) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    const findingRepo = new FindingRepository(db);
    const severityCounts = await findingRepo.countBySeverity(snapshotId);
    const hasFindings = await findingRepo.hasFindings(snapshotId);

    return c.json({
      snapshotId,
      hasFindings,
      severityCounts,
      total: Object.values(severityCounts).reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error getting findings summary:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/unknown',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to get findings summary',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * PATCH /api/findings/:findingId/acknowledge
 * Acknowledge a finding
 */
findingsRoutes.patch(
  '/findings/:findingId/acknowledge',
  requireAuth,
  requireWritePermission,
  async (c) => {
    const findingId = c.req.param('findingId');
    const db = c.get('db');
    const actorId = c.get('actorId');

    if (!actorId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const findingRepo = new FindingRepository(db);
      const updated = await findingRepo.markAcknowledged(findingId, actorId);

      if (!updated) {
        return c.json({ error: 'Finding not found' }, 404);
      }

      return c.json({ success: true, finding: updated });
    } catch (error) {
      const logger = getWebLogger();
      logger.error(
        'Error acknowledging finding:',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId: c.req.header('X-Request-ID'),
          path: '/api/unknown',
          method: 'GET',
          tenantId: c.get('tenantId'),
        }
      );
      return c.json(
        {
          error: 'Failed to acknowledge finding',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  }
);

/**
 * GET /api/findings/:findingId
 * Get a single finding by ID with tenant isolation
 */
findingsRoutes.get('/findings/:findingId', requireAuth, async (c) => {
  const findingId = c.req.param('findingId');
  const db = c.get('db');

  try {
    const findingRepo = new FindingRepository(db);
    const snapshotRepo = new SnapshotRepository(db);
    const domainRepo = new DomainRepository(db);

    // Fetch finding
    const finding = await findingRepo.findById(findingId);
    if (!finding) {
      return c.json({ error: 'Finding not found' }, 404);
    }

    // Fetch snapshot for tenant isolation
    const snapshot = await snapshotRepo.findById(finding.snapshotId);
    if (!snapshot) {
      return c.json({ error: 'Finding not found' }, 404);
    }

    // Fetch domain for tenant check
    const domain = await domainRepo.findById(snapshot.domainId);
    if (!domain) {
      return c.json({ error: 'Finding not found' }, 404);
    }

    // Tenant isolation: reject if domain belongs to a different tenant
    const tenantId = c.get('tenantId');
    if (domain.tenantId && domain.tenantId !== tenantId) {
      return c.json({ error: 'Finding not found' }, 404);
    }
    if (!tenantId && domain.tenantId) {
      return c.json({ error: 'Finding not found' }, 404);
    }

    return c.json({ finding });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching finding:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/unknown',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to fetch finding',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * PATCH /api/findings/:findingId/false-positive
 * Mark a finding as false positive
 */
findingsRoutes.patch(
  '/findings/:findingId/false-positive',
  requireAuth,
  requireWritePermission,
  async (c) => {
    const findingId = c.req.param('findingId');
    const db = c.get('db');
    const actorId = c.get('actorId');

    if (!actorId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const findingRepo = new FindingRepository(db);
      const updated = await findingRepo.markFalsePositive(findingId, actorId);

      if (!updated) {
        return c.json({ error: 'Finding not found' }, 404);
      }

      return c.json({ success: true, finding: updated });
    } catch (error) {
      const logger = getWebLogger();
      logger.error(
        'Error marking finding as false positive:',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId: c.req.header('X-Request-ID'),
          path: '/api/unknown',
          method: 'GET',
          tenantId: c.get('tenantId'),
        }
      );
      return c.json(
        {
          error: 'Failed to mark finding as false positive',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  }
);

/**
 * POST /api/findings/backfill
 * Backfill findings for existing snapshots that haven't been evaluated
 * or need re-evaluation with the current ruleset version.
 *
 * This is an administrative endpoint used to:
 * - Generate findings for snapshots collected before rules were implemented
 * - Re-evaluate snapshots when the ruleset version changes
 * - Support portfolio/history views with consistent findings data
 *
 * Body:
 *   - domainId?: string - Filter to a specific domain
 *   - limit?: number - Max snapshots to process (default: 50, max: 200)
 *   - dryRun?: boolean - If true, only return stats without processing
 */
findingsRoutes.post('/findings/backfill', requireAuth, async (c) => {
  const db = c.get('db');
  const actorId = c.get('actorId');

  if (!actorId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const {
    domainId,
    limit = 50,
    dryRun = false,
  } = body as {
    domainId?: string;
    limit?: number;
    dryRun?: boolean;
  };

  const effectiveLimit = Math.min(limit || 50, 200);

  try {
    const snapshotRepo = new SnapshotRepository(db);
    const findingRepo = new FindingRepository(db);
    const rulesetVersionRepo = new RulesetVersionRepository(db);
    const domainRepo = new DomainRepository(db);
    const observationRepo = new ObservationRepository(db);
    const recordSetRepo = new RecordSetRepository(db);
    const suggestionRepo = new SuggestionRepository(db);

    // Get current ruleset and ensure version exists
    const ruleset = createCombinedRuleset();
    const rulesetVersionId = await ensureRulesetVersion(rulesetVersionRepo, ruleset, actorId);

    // Get backfill statistics
    const stats = await snapshotRepo.countNeedingBackfill(rulesetVersionId, {
      domainId,
      completedOnly: true,
    });

    if (dryRun) {
      return c.json({
        dryRun: true,
        rulesetVersion: ruleset.version,
        rulesetVersionId,
        stats,
        message: `${stats.needsBackfill} of ${stats.total} snapshots need backfill`,
      });
    }

    // Find snapshots needing backfill
    const snapshotsToProcess = await snapshotRepo.findNeedingBackfill(rulesetVersionId, {
      domainId,
      limit: effectiveLimit,
      completedOnly: true,
    });

    if (snapshotsToProcess.length === 0) {
      return c.json({
        processed: 0,
        rulesetVersion: ruleset.version,
        rulesetVersionId,
        stats,
        message: 'No snapshots require backfill',
      });
    }

    // Process each snapshot
    const results: Array<{
      snapshotId: string;
      domainName: string;
      findingsCount: number;
      suggestionsCount: number;
      status: 'success' | 'partial' | 'error';
      error?: string;
    }> = [];

    for (const snapshot of snapshotsToProcess) {
      try {
        // Fetch domain
        const domain = await domainRepo.findById(snapshot.domainId);
        if (!domain) {
          results.push({
            snapshotId: snapshot.id,
            domainName: snapshot.domainName,
            findingsCount: 0,
            suggestionsCount: 0,
            status: 'error',
            error: 'Domain not found',
          });
          continue;
        }

        // Tenant isolation: skip domains that don't belong to this tenant
        const tenantId = c.get('tenantId');
        if (domain.tenantId && domain.tenantId !== tenantId) {
          results.push({
            snapshotId: snapshot.id,
            domainName: snapshot.domainName,
            findingsCount: 0,
            suggestionsCount: 0,
            status: 'error',
            error: 'Cross-tenant access denied',
          });
          continue;
        }
        if (!tenantId && domain.tenantId) {
          results.push({
            snapshotId: snapshot.id,
            domainName: snapshot.domainName,
            findingsCount: 0,
            suggestionsCount: 0,
            status: 'error',
            error: 'Cross-tenant access denied',
          });
          continue;
        }

        // Fetch observations and record sets
        const observations = await observationRepo.findBySnapshotId(snapshot.id);
        const recordSets = await recordSetRepo.findBySnapshotId(snapshot.id);

        // Create rule context
        const context: RuleContext = {
          snapshotId: snapshot.id,
          domainId: domain.id,
          domainName: domain.name,
          zoneManagement: snapshot.zoneManagement,
          observations,
          recordSets,
          rulesetVersion: ruleset.version,
        };

        // Evaluate rules and preserve incomplete coverage during backfill.
        const engine = new RulesEngine(ruleset);
        const { findings, suggestions, errors, complete } = engine.evaluate(context);
        await snapshotRepo.updateEvaluationCoverage(snapshot.id, {
          state: complete ? 'COMPLETE' : 'PARTIAL',
          errors,
        });

        // Delete any existing findings for this ruleset version (idempotent)
        await findingRepo.deleteBySnapshotIdAndRulesetVersionId(snapshot.id, rulesetVersionId);

        // Persist findings
        const findingsToInsert: NewFinding[] = findings.map((f) => ({
          snapshotId: snapshot.id,
          type: f.type,
          title: f.title,
          description: f.description,
          severity: f.severity,
          confidence: f.confidence,
          riskPosture: f.riskPosture,
          blastRadius: f.blastRadius,
          reviewOnly: f.reviewOnly,
          evidence: f.evidence,
          ruleId: f.ruleId,
          ruleVersion: f.ruleVersion,
          rulesetVersionId,
        }));

        const persistedFindings = await findingRepo.createMany(findingsToInsert);

        // Build finding ID map for suggestion linking
        const findingIdMap = new Map<string, string>();
        for (let i = 0; i < findings.length; i++) {
          const originalId = findings[i].id;
          const persistedId = persistedFindings[i]?.id;
          if (originalId && persistedId) {
            findingIdMap.set(originalId, persistedId);
          }
        }

        // Persist suggestions
        const suggestionsToInsert: NewSuggestion[] = [];
        for (const s of suggestions) {
          const persistedFindingId = findingIdMap.get(s.findingId);
          if (persistedFindingId) {
            suggestionsToInsert.push({
              findingId: persistedFindingId,
              title: s.title,
              description: s.description,
              action: s.action,
              riskPosture: s.riskPosture,
              blastRadius: s.blastRadius,
              reviewOnly: s.reviewOnly ?? false,
            });
          }
        }

        const persistedSuggestions = await suggestionRepo.createMany(suggestionsToInsert);

        // Update snapshot's ruleset version
        await snapshotRepo.updateRulesetVersion(snapshot.id, rulesetVersionId);

        results.push({
          snapshotId: snapshot.id,
          domainName: snapshot.domainName,
          findingsCount: persistedFindings.length,
          suggestionsCount: persistedSuggestions.length,
          status: complete ? 'success' : 'partial',
        });
      } catch (error) {
        results.push({
          snapshotId: snapshot.id,
          domainName: snapshot.domainName,
          findingsCount: 0,
          suggestionsCount: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;
    const totalFindings = results.reduce((sum, r) => sum + r.findingsCount, 0);
    const totalSuggestions = results.reduce((sum, r) => sum + r.suggestionsCount, 0);

    return c.json({
      processed: results.length,
      success: successCount,
      errors: errorCount,
      totalFindings,
      totalSuggestions,
      rulesetVersion: ruleset.version,
      rulesetVersionId,
      remainingToBackfill: stats.needsBackfill - successCount,
      results,
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error in findings backfill:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/unknown',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to backfill findings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/findings/backfill/status
 * Get backfill status - how many snapshots need evaluation
 */
findingsRoutes.get('/findings/backfill/status', requireAuth, async (c) => {
  const db = c.get('db');
  const domainId = c.req.query('domainId');

  try {
    const snapshotRepo = new SnapshotRepository(db);
    const rulesetVersionRepo = new RulesetVersionRepository(db);

    // Get current ruleset and ensure version exists
    const ruleset = createCombinedRuleset();
    const actorId = c.get('actorId') || 'system';
    const rulesetVersionId = await ensureRulesetVersion(rulesetVersionRepo, ruleset, actorId);

    // Get backfill statistics
    const stats = await snapshotRepo.countNeedingBackfill(rulesetVersionId, {
      domainId,
      completedOnly: true,
    });

    return c.json({
      rulesetVersion: ruleset.version,
      rulesetVersionId,
      total: stats.total,
      needsBackfill: stats.needsBackfill,
      evaluated: stats.total - stats.needsBackfill,
      completionPercent:
        stats.total > 0
          ? Math.round(((stats.total - stats.needsBackfill) / stats.total) * 100)
          : 100,
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error getting backfill status:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/unknown',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to get backfill status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

interface MailConfiguration {
  hasMx: boolean;
  hasSpf: boolean;
  hasDmarc: boolean;
  hasDkim: boolean;
  hasMtaSts: boolean;
  hasTlsRpt: boolean;
  securityScore: number; // 0-100
  issues: string[];
  recommendations: string[];
}

function analyzeMailConfiguration(
  findings: Array<{ type: string; severity?: string; description?: string }>
): MailConfiguration {
  const config: MailConfiguration = {
    hasMx: false,
    hasSpf: false,
    hasDmarc: false,
    hasDkim: false,
    hasMtaSts: false,
    hasTlsRpt: false,
    securityScore: 0,
    issues: [],
    recommendations: [],
  };

  let score = 0;

  for (const finding of findings) {
    switch (finding.type) {
      case 'mail.mx-present':
        config.hasMx = true;
        score += 20;
        break;
      case 'mail.null-mx-configured':
        config.hasMx = true;
        score += 20;
        break;
      case 'mail.no-mx-record':
        config.issues.push('No MX record');
        config.recommendations.push('Review playbook mail.mx.purpose-and-provider');
        break;
      case 'mail.spf-present':
        config.hasSpf = true;
        // Phase 0–1 SPF is FIRST_LEVEL_ONLY and cannot receive full-validity credit.
        score += 10;
        if (finding.severity && finding.severity !== 'info') {
          config.issues.push(`SPF issue: ${finding.severity}`);
        }
        break;
      case 'mail.no-spf-record':
        config.issues.push('No SPF record');
        config.recommendations.push('Review playbook mail.spf.provider-confirmation');
        break;
      case 'mail.dmarc-present':
        config.hasDmarc = true;
        score += 20;
        if (finding.severity && finding.severity !== 'info') {
          config.issues.push(`DMARC issue: ${finding.severity}`);
        }
        break;
      case 'mail.no-dmarc-record':
        config.issues.push('No DMARC record');
        config.recommendations.push('Review playbook mail.dmarc.monitoring-readiness');
        break;
      case 'mail.dkim-keys-present':
        config.hasDkim = true;
        score += 20;
        break;
      case 'mail.dkim-no-valid-keys':
      case 'mail.no-dkim-queried':
        config.issues.push('DKIM not configured');
        config.recommendations.push('Review playbook mail.dkim.selector-evidence');
        break;
      case 'mail.mta-sts-present':
        config.hasMtaSts = true;
        score += 10;
        break;
      case 'mail.tls-rpt-present':
        config.hasTlsRpt = true;
        score += 10;
        break;
    }
  }

  config.securityScore = Math.min(100, score);
  return config;
}

/**
 * Enhance mail configuration with persisted mail evidence data
 */
interface EnhancedMailConfiguration extends MailConfiguration {
  dmarcPolicy?: string;
  dmarcSubdomainPolicy?: string;
  dmarcPercent?: string;
  dmarcRua?: string[];
  dmarcRuf?: string[];
  spfRecord?: string;
  dmarcRecord?: string;
  detectedProvider?: string;
  providerConfidence?: string;
  hasBimi?: boolean;
}

function enhanceMailConfigWithEvidence(
  config: MailConfiguration,
  evidence:
    | {
        hasMx?: boolean;
        hasSpf?: boolean;
        hasDmarc?: boolean;
        hasDkim?: boolean;
        hasMtaSts?: boolean;
        hasTlsRpt?: boolean;
        hasBimi?: boolean;
        dmarcPolicy?: string | null;
        dmarcSubdomainPolicy?: string | null;
        dmarcPercent?: string | null;
        dmarcRua?: string[] | null;
        dmarcRuf?: string[] | null;
        spfRecord?: string | null;
        dmarcRecord?: string | null;
        detectedProvider?: string | null;
        providerConfidence?: string | null;
        securityScore?: string | null;
        scoreBreakdown?: {
          mx: number;
          spf: number;
          dmarc: number;
          dkim: number;
          mtaSts: number;
          tlsRpt: number;
          bimi: number;
        } | null;
      }
    | null
    | undefined
): EnhancedMailConfiguration {
  if (!evidence) {
    return config;
  }

  const enhanced: EnhancedMailConfiguration = {
    // Start with existing config
    ...config,
    // Override with persisted evidence where available
    hasMx: evidence.hasMx ?? config.hasMx,
    hasSpf: evidence.hasSpf ?? config.hasSpf,
    hasDmarc: evidence.hasDmarc ?? config.hasDmarc,
    hasDkim: evidence.hasDkim ?? config.hasDkim,
    hasMtaSts: evidence.hasMtaSts ?? config.hasMtaSts,
    hasTlsRpt: evidence.hasTlsRpt ?? config.hasTlsRpt,
    hasBimi: evidence.hasBimi ?? false,
    // Use persisted score if available
    securityScore: evidence.securityScore
      ? Number.parseInt(evidence.securityScore, 10)
      : config.securityScore,
  };

  // Add DMARC details
  if (evidence.dmarcPolicy) {
    enhanced.dmarcPolicy = evidence.dmarcPolicy;
  }
  if (evidence.dmarcSubdomainPolicy) {
    enhanced.dmarcSubdomainPolicy = evidence.dmarcSubdomainPolicy;
  }
  if (evidence.dmarcPercent) {
    enhanced.dmarcPercent = evidence.dmarcPercent;
  }
  if (evidence.dmarcRua) {
    enhanced.dmarcRua = evidence.dmarcRua;
  }
  if (evidence.dmarcRuf) {
    enhanced.dmarcRuf = evidence.dmarcRuf;
  }

  // Add raw records
  if (evidence.spfRecord) {
    enhanced.spfRecord = evidence.spfRecord;
  }
  if (evidence.dmarcRecord) {
    enhanced.dmarcRecord = evidence.dmarcRecord;
  }

  // Add provider detection
  if (evidence.detectedProvider) {
    enhanced.detectedProvider = evidence.detectedProvider;
  }
  if (evidence.providerConfidence) {
    enhanced.providerConfidence = evidence.providerConfidence;
  }

  return enhanced;
}

/**
 * Format DKIM selectors for API response
 */
interface FormattedDkimSelector {
  selector: string;
  domain: string;
  provenance: string;
  confidence: string;
  provider?: string;
  found: boolean;
  keyType?: string;
  keySize?: string;
  isValid?: boolean;
  validationError?: string;
}

function formatDkimSelectors(
  selectors: Array<{
    selector: string;
    domain: string;
    provenance: string;
    confidence: string;
    provider?: string | null;
    found: boolean;
    keyType?: string | null;
    keySize?: string | null;
    isValid?: boolean | null;
    validationError?: string | null;
  }>
): FormattedDkimSelector[] {
  return selectors.map((s) => ({
    selector: s.selector,
    domain: s.domain,
    provenance: s.provenance,
    confidence: s.confidence,
    provider: s.provider || undefined,
    found: s.found,
    keyType: s.keyType || undefined,
    keySize: s.keySize || undefined,
    isValid: s.isValid ?? undefined,
    validationError: s.validationError || undefined,
  }));
}
