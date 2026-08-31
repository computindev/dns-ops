/**
 * Fleet Report Routes - Bead 11 / Bead 18
 *
 * Batch checking and reporting for domain inventories.
 * Produces internal reports backed by persisted findings.
 *
 * ## Bead 18 Update
 * Replaced low-truth parallel fleet logic with reports/export backed
 * by stored findings. Now uses FindingRepository to query persisted
 * findings rather than re-analyzing observations.
 */

import { evaluationCoverageOrUnknown, isEvaluationComplete } from '@dns-ops/contracts';
import type { Finding } from '@dns-ops/db';
import {
  DomainRepository,
  FindingRepository,
  ObservationRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { isValidDomain } from '@dns-ops/parsing';
import { Hono } from 'hono';
import { getCollectorLogger } from '../middleware/error-tracking.js';
import type { Env } from '../types.js';

const logger = getCollectorLogger();

export const fleetReportRoutes = new Hono<Env>();

/**
 * POST /api/fleet-report/run
 * Run fleet report against inventory
 */
fleetReportRoutes.post('/run', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const {
    inventory = [],
    checks = ['spf', 'dmarc', 'mx', 'infrastructure'],
    format = 'detailed',
  } = body;

  if (!Array.isArray(inventory) || inventory.length === 0) {
    return c.json(
      {
        error: 'Inventory required: array of domain names or domain objects',
        example: { inventory: ['example.com', 'example.org'] },
      },
      400
    );
  }

  // Limit inventory size for safety
  const maxDomains = 1000;
  if (inventory.length > maxDomains) {
    return c.json(
      {
        error: `Inventory too large: ${inventory.length} domains. Max: ${maxDomains}`,
      },
      400
    );
  }

  // Tenant-scoped domain lookups
  const tenantId = c.get('tenantId');
  if (!tenantId) {
    return c.json({ error: 'Authenticated tenant context required' }, 401);
  }

  try {
    const domainRepo = new DomainRepository(db);
    const snapshotRepo = new SnapshotRepository(db);
    const findingRepo = new FindingRepository(db);
    const observationRepo = new ObservationRepository(db);

    // Process each domain
    const results: FleetReportResult[] = [];
    const errors: Array<{ domain: string; error: string }> = [];

    for (const item of inventory) {
      const domainName = typeof item === 'string' ? item : item.domain;

      try {
        // Find domain scoped to tenant
        const domain = await domainRepo.findByNameForTenant(domainName, tenantId);

        if (!domain) {
          errors.push({
            domain: domainName,
            error: 'Domain not in database. Run collection first.',
          });
          continue;
        }

        // Get latest snapshot
        const snapshots = await snapshotRepo.findByDomain(domain.id, 1);
        const snapshot = snapshots[0];

        if (!snapshot) {
          errors.push({
            domain: domainName,
            error: 'No snapshots available. Run collection first.',
          });
          continue;
        }

        // Check if findings were evaluated
        const findingsEvaluated = snapshot.rulesetVersionId !== null;

        if (!findingsEvaluated) {
          errors.push({
            domain: domainName,
            error: 'Findings not evaluated. Re-collect to generate findings.',
          });
          continue;
        }

        // Get persisted findings for this snapshot
        const snapshotFindings = await findingRepo.findBySnapshotId(snapshot.id);

        // Truth model: only explicit complete evaluation coverage on a complete
        // snapshot may produce a PASS. Stale (missing/partial coverage) snapshots
        // degrade every requested check to UNKNOWN even when findings exist.
        // There is deliberately no elapsed-time freshness policy here — staleness
        // means missing explicit evaluation coverage, not age.
        const evaluationCoverage = evaluationCoverageOrUnknown(snapshot.metadata?.evaluation);
        const evaluationComplete =
          snapshot.resultState === 'complete' && isEvaluationComplete(evaluationCoverage);

        // Correlation: findings must come from the same snapshot+ruleset and cite
        // evidence observations that belong to this snapshot.
        const findings = evaluationComplete
          ? await correlatedFindings(snapshotFindings, snapshot, observationRepo)
          : [];

        // Convert findings to check results based on requested check types
        const checkResults = findingsToCheckResults(findings, checks);

        results.push({
          domain: domainName,
          snapshotId: snapshot.id,
          collectedAt: snapshot.createdAt,
          rulesetVersion: snapshot.rulesetVersionId,
          findingsCount: findings.length,
          checks: checkResults,
          issues: checkResults.filter((r) => r.severity !== 'ok'),
        });
      } catch (err) {
        errors.push({
          domain: domainName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Generate summary
    const summary = generateSummary(results, checks);

    return c.json({
      reportGeneratedAt: new Date().toISOString(),
      domainsChecked: results.length,
      domainsWithErrors: errors.length,
      backedByPersistedFindings: true,
      summary,
      results: format === 'summary' ? undefined : results,
      highPriorityIssues: results
        .flatMap((r) => r.issues)
        .filter((i) => i.severity === 'critical' || i.severity === 'high')
        .slice(0, 50),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Fleet report error', err);
    return c.json(
      {
        error: 'Failed to generate fleet report',
        message: err.message,
      },
      500
    );
  }
});

/**
 * POST /api/fleet-report/import-csv
 * Import inventory from CSV
 */
fleetReportRoutes.post('/import-csv', async (c) => {
  const body = await c.req.text();

  if (!body.trim()) {
    return c.json({ error: 'CSV data required' }, 400);
  }

  // Limit CSV size to prevent DoS
  const maxCsvSize = 1024 * 1024; // 1MB
  if (body.length > maxCsvSize) {
    return c.json({ error: 'CSV file too large. Max size: 1MB' }, 400);
  }

  try {
    // Simple CSV parsing (handles basic comma-separated values, not quoted fields)
    const lines = body.trim().split('\n');

    // Limit number of rows
    const maxRows = 10000;
    if (lines.length > maxRows) {
      return c.json({ error: `Too many rows. Max: ${maxRows}` }, 400);
    }

    const headers = lines[0].split(',').map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/^["']|["']$/g, '')
    );

    const domainIndex = headers.indexOf('domain');
    if (domainIndex === -1) {
      return c.json(
        {
          error: 'CSV must have a "domain" column',
          headers,
        },
        400
      );
    }

    const inventory: string[] = [];
    const seenDomains = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      // Basic parsing - split by comma, handle simple quoted values
      const columns = line.split(',').map((col) => col.trim().replace(/^["']|["']$/g, ''));
      const domain = columns[domainIndex]?.toLowerCase();

      // Validate and deduplicate
      if (domain && isValidDomain(domain) && !seenDomains.has(domain)) {
        seenDomains.add(domain);
        inventory.push(domain);
      }
    }

    return c.json({
      imported: inventory.length,
      inventory,
      preview: inventory.slice(0, 10),
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to parse CSV',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      400
    );
  }
});

/**
 * GET /api/fleet-report/templates
 * Get available report templates
 */
fleetReportRoutes.get('/templates', (c) => {
  return c.json({
    templates: [
      {
        id: 'mail-security-baseline',
        name: 'Mail Security Baseline',
        description: 'Check SPF, DMARC, DKIM across inventory',
        checks: ['spf', 'dmarc', 'dkim', 'mx'],
      },
      {
        id: 'infrastructure-audit',
        name: 'Infrastructure Audit',
        description: 'Identify stale IPs and infrastructure issues',
        checks: ['infrastructure', 'delegation'],
      },
      {
        id: 'pre-migration-check',
        name: 'Pre-Migration Check',
        description: 'Full check before infrastructure migration',
        checks: ['spf', 'dmarc', 'dkim', 'mx', 'infrastructure', 'delegation'],
      },
    ],
  });
});

// =============================================================================
// Helper Types & Functions
// =============================================================================

interface FleetReportResult {
  domain: string;
  snapshotId: string;
  collectedAt: Date;
  rulesetVersion: string | null;
  findingsCount: number;
  checks: CheckResult[];
  issues: CheckResult[];
}

interface CheckResult {
  check: string;
  status: 'pass' | 'fail' | 'warning' | 'missing' | 'unknown';
  severity: 'ok' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Keep only findings that are correlated to this snapshot: generated by the
 * snapshot's own ruleset version, with at least one evidence link whose
 * observation belongs to this snapshot. Anything else must not drive a PASS.
 */
// Export for testing
export function isCorrelatedFinding(
  finding: Finding,
  snapshotRulesetVersionId: string | null,
  snapshotObservationIds: Set<string>
): boolean {
  return (
    finding.rulesetVersionId === snapshotRulesetVersionId &&
    (finding.evidence?.length ?? 0) > 0 &&
    finding.evidence.some((link) => snapshotObservationIds.has(link.observationId))
  );
}

async function correlatedFindings(
  snapshotFindings: Finding[],
  snapshot: { id: string; rulesetVersionId: string | null },
  observationRepo: ObservationRepository
): Promise<Finding[]> {
  const observations = await observationRepo.findBySnapshotId(snapshot.id);
  const observationIds = new Set(observations.map((o) => o.id));
  return snapshotFindings.filter((f) =>
    isCorrelatedFinding(f, snapshot.rulesetVersionId, observationIds)
  );
}

/**
 * Map persisted findings to fleet report check results
 *
 * This uses the rules engine's persisted findings instead of
 * re-analyzing observations, ensuring consistency with the
 * main findings API.
 */
// Export for testing - these are module-internal but accessible for unit tests
export function findingsToCheckResults(findings: Finding[], checkTypes: string[]): CheckResult[] {
  const results: CheckResult[] = [];

  // Map finding types to check categories
  // These must match actual rule IDs from packages/rules/src/dns/rules.ts and mail/rules.ts
  const checkCategoryMap: Record<string, string[]> = {
    spf: ['mail.no-spf-record', 'mail.spf-present', 'mail.spf-permissive-all'],
    dmarc: ['mail.no-dmarc-record', 'mail.dmarc-present', 'mail.dmarc-policy-none'],
    mx: ['mail.no-mx-record', 'mail.mx-present', 'mail.null-mx-configured'],
    dkim: ['mail.no-dkim-queried', 'mail.dkim-keys-present', 'mail.dkim-no-valid-keys'],
    // Infrastructure checks: authoritative server health and consistency
    infrastructure: [
      'dns.authoritative-timeout', // From dns.auth-failure.v1
      'dns.authoritative-refused', // From dns.auth-failure.v1
      'dns.authoritative-error', // From dns.auth-failure.v1
      'dns.authoritative-mismatch', // From dns.auth-mismatch.v1
      'dns.recursive-authoritative-mismatch', // From dns.recursive-auth-mismatch.v1
    ],
    // Delegation checks: NS record and glue consistency.
    // The delegation collector detects these issues as evidence objects today.
    // When delegation findings are promoted to rules-engine output, they will
    // match these type prefixes for fleet-report categorization.
    delegation: [
      'dns.lame-delegation', // Nameserver doesn't respond authoritatively
      'dns.divergent-ns', // NS records differ between parent and child
      'dns.missing-glue', // In-zone NS without glue record at parent
      'dns.ns-mismatch', // NS-related inconsistencies (prefix match)
    ],
  };

  for (const checkType of checkTypes) {
    const relevantTypes = checkCategoryMap[checkType] || [];
    const relevantFindings = findings.filter((f) =>
      relevantTypes.some((t) => f.type.startsWith(t.replace('.', '.')))
    );

    // Also match by prefix for flexibility
    const prefixFindings = findings.filter((f) => {
      if (checkType === 'spf') return f.type.includes('spf');
      if (checkType === 'dmarc') return f.type.includes('dmarc');
      if (checkType === 'mx') return f.type.includes('mx') && f.type.startsWith('mail.');
      if (checkType === 'dkim') return f.type.includes('dkim');
      if (checkType === 'infrastructure') return f.type.startsWith('dns.auth');
      if (checkType === 'delegation') return f.type.includes('delegation') || f.type.includes('ns');
      return false;
    });

    const allRelevant = [...new Set([...relevantFindings, ...prefixFindings])];

    if (allRelevant.length === 0) {
      // Zero relevant findings is not proof of health — it means no affirmative
      // evidence for this check type on this snapshot. Report UNKNOWN, never PASS.
      results.push({
        check: checkType,
        status: 'unknown',
        severity: 'ok',
        message: `No ${checkType.toUpperCase()} evidence persisted for this snapshot`,
      });
    } else {
      // Map findings to check results
      for (const finding of allRelevant) {
        results.push({
          check: checkType,
          status: mapSeverityToStatus(finding.severity),
          severity: finding.severity as CheckResult['severity'],
          message: finding.title,
          details: {
            findingId: finding.id,
            type: finding.type,
            description: finding.description,
            ruleId: finding.ruleId,
          },
        });
      }
    }
  }

  return results;
}

/**
 * Map finding severity to check status
 */
// Export for testing
export function mapSeverityToStatus(severity: string): CheckResult['status'] {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'fail';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'pass';
    default:
      // Unrecognized severity has no affirmative outcome — fail closed to unknown
      return 'unknown';
  }
}

// Export for testing
export function generateSummary(
  results: FleetReportResult[],
  checkTypes: string[]
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    totalDomains: results.length,
    domainsWithIssues: results.filter((r) => r.issues.length > 0).length,
  };

  // Per-check breakdown
  for (const checkType of checkTypes) {
    const checkResults = results.flatMap((r) => r.checks.filter((c) => c.check === checkType));

    summary[`${checkType}Stats`] = {
      pass: checkResults.filter((r) => r.status === 'pass').length,
      fail: checkResults.filter((r) => r.status === 'fail').length,
      warning: checkResults.filter((r) => r.status === 'warning').length,
      missing: checkResults.filter((r) => r.status === 'missing').length,
      unknown: checkResults.filter((r) => r.status === 'unknown').length,
    };
  }

  // Issue severity breakdown
  const allIssues = results.flatMap((r) => r.issues);
  summary.issueSeverity = {
    critical: allIssues.filter((i) => i.severity === 'critical').length,
    high: allIssues.filter((i) => i.severity === 'high').length,
    medium: allIssues.filter((i) => i.severity === 'medium').length,
    low: allIssues.filter((i) => i.severity === 'low').length,
  };

  return summary;
}
