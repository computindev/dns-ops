/**
 * Simulation Routes
 *
 * POST /api/simulate — Generate proposed DNS changes and dry-run them
 *   through the rules engine to predict which findings resolve.
 */

import {
  DomainRepository,
  FindingRepository,
  ObservationRepository,
  RecordSetRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import {
  getGuidanceSupportedFindingTypes,
  type RuleContext,
  SimulationEngine,
} from '@dns-ops/rules';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/authorization.js';
import { getWebLogger } from '../middleware/error-tracking.js';
import type { Env } from '../types.js';
import { createCombinedRuleset } from './findings.js';

export const simulationRoutes = new Hono<Env>();

/**
 * POST /api/simulate
 *
 * Body: { snapshotId: string, findingTypes?: string[] }
 *   or: { findingId: string }
 *
 * Returns: SimulationResult with proposed changes + dry-run findings diff
 */
simulationRoutes.post('/', requireAuth, async (c) => {
  const db = c.get('db');
  const body = await c.req.json<{
    snapshotId?: string;
    findingId?: string;
    findingTypes?: string[];
  }>();

  try {
    const snapshotRepo = new SnapshotRepository(db);
    const domainRepo = new DomainRepository(db);
    const observationRepo = new ObservationRepository(db);
    const recordSetRepo = new RecordSetRepository(db);
    const findingRepo = new FindingRepository(db);

    // Resolve snapshot ID
    let snapshotId: string;
    let findingTypes: string[] | undefined = body.findingTypes;

    if (body.findingId) {
      // Single finding mode
      const finding = await findingRepo.findById(body.findingId);
      if (!finding) {
        return c.json({ error: 'Finding not found' }, 404);
      }
      snapshotId = finding.snapshotId;
      findingTypes = [finding.type];
    } else if (body.snapshotId) {
      snapshotId = body.snapshotId;
    } else {
      return c.json({ error: 'Either snapshotId or findingId is required' }, 400);
    }

    // Load snapshot + domain with tenant isolation
    const snapshot = await snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

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

    // Load DNS state
    const observations = await observationRepo.findBySnapshotId(snapshotId);
    const recordSets = await recordSetRepo.findBySnapshotId(snapshotId);

    // Load existing findings
    const existingFindings = await findingRepo.findBySnapshotId(snapshotId);

    // Build rule context
    const ruleset = createCombinedRuleset();
    const context: RuleContext = {
      snapshotId,
      domainId: domain.id,
      domainName: domain.name,
      zoneManagement: snapshot.zoneManagement,
      observations,
      recordSets,
      rulesetVersion: ruleset.version,
    };

    // Run simulation
    const engine = new SimulationEngine(ruleset);
    const result = engine.simulate(
      context,
      existingFindings.map((f) => ({
        type: f.type,
        title: f.title,
        severity: f.severity,
        ruleId: f.ruleId,
      })),
      findingTypes
    );

    return c.json(result);
  } catch (error) {
    const logger = getWebLogger();
    logger.error('Simulation error', error instanceof Error ? error : new Error(String(error)), {
      requestId: c.req.header('X-Request-ID'),
      path: '/api/simulate',
      method: 'POST',
      tenantId: c.get('tenantId'),
    });
    return c.json(
      {
        error: 'Simulation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/simulate/actionable-types
 *
 * Legacy alias returning finding types with non-executable guidance playbooks.
 */
simulationRoutes.get('/actionable-types', requireAuth, (c) => {
  const guidanceSupportedTypes = [
    {
      type: 'mail.no-spf-record',
      description: 'Missing SPF record',
      risk: 'low',
    },
    {
      type: 'mail.no-dmarc-record',
      description: 'Missing DMARC record',
      risk: 'low',
    },
    {
      type: 'mail.no-mx-record',
      description: 'Missing MX record',
      risk: 'medium',
    },
    {
      type: 'mail.no-mta-sts',
      description: 'Missing MTA-STS record',
      risk: 'low',
    },
    {
      type: 'mail.no-tls-rpt',
      description: 'Missing TLS-RPT record',
      risk: 'low',
    },
    {
      type: 'mail.no-dkim-queried',
      description: 'No DKIM selectors discovered',
      risk: 'low',
    },
    {
      type: 'mail.spf-malformed',
      description: 'Malformed SPF record',
      risk: 'medium',
    },
    {
      type: 'dns.cname-coexistence-conflict',
      description: 'CNAME coexistence violation',
      risk: 'high',
    },
  ];
  return c.json({
    mode: 'GUIDANCE_ONLY',
    guidanceSupportedTypes,
    actionableTypes: guidanceSupportedTypes,
    supportedTypeIds: getGuidanceSupportedFindingTypes(),
  });
});
