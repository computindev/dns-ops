/**
 * DNS Ops Workbench - Rules Engine
 *
 * Deterministic rules engine that evaluates observations and produces findings.
 * All findings are evidence-backed and versioned by ruleset.
 */

import type { BlastRadius, Confidence, Severity } from '@dns-ops/contracts';
import type { NewFinding, NewSuggestion, Observation, RecordSet } from '@dns-ops/db';

// Result-based error handling
export {
  isRuleError,
  partitionRuleResults,
  RuleError,
  type RuleErrorCode,
  ruleResult,
  ruleResultAsync,
  validateRuleContext,
} from './result.js';

export interface RuleContext {
  snapshotId: string;
  domainId: string;
  domainName: string;
  zoneManagement: 'managed' | 'unmanaged' | 'unknown';
  observations: Observation[];
  recordSets: RecordSet[];
  rulesetVersion: string;
}

export interface RuleResult {
  // `rulesetVersionId` is omitted alongside id/snapshotId/createdAt because it
  // is resolved by the CALLER (collector/web) from the active ruleset version at
  // persistence time — rules do not know it. This keeps Rule.evaluate's return
  // shape unchanged while allowing findings.ruleset_version_id to be NOT NULL
  // (migration 0011).
  finding?: Omit<NewFinding, 'id' | 'snapshotId' | 'createdAt' | 'rulesetVersionId'>;
  suggestions?: Omit<NewSuggestion, 'id' | 'findingId' | 'createdAt'>[];
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  evaluate: (context: RuleContext) => RuleResult | null;
}

export interface Ruleset {
  id: string;
  version: string;
  name: string;
  description: string;
  rules: Rule[];
  createdAt: Date;
}

/**
 * Rules Engine - evaluates observations against rules and produces findings
 */
export class RulesEngine {
  private ruleset: Ruleset;

  constructor(ruleset: Ruleset) {
    this.ruleset = ruleset;
  }

  /**
   * Evaluate all rules in the ruleset against the context
   */
  evaluate(context: RuleContext): { findings: NewFinding[]; suggestions: NewSuggestion[] } {
    const findings: NewFinding[] = [];
    const suggestions: NewSuggestion[] = [];

    for (const rule of this.ruleset.rules) {
      if (!rule.enabled) continue;

      try {
        const result = rule.evaluate(context);
        if (result?.finding) {
          const finding: NewFinding = {
            ...result.finding,
            id: crypto.randomUUID(),
            snapshotId: context.snapshotId,
            createdAt: new Date(),
          } as NewFinding;
          findings.push(finding);

          // Add suggestions linked to this finding
          if (result.suggestions) {
            for (const suggestion of result.suggestions) {
              suggestions.push({
                ...suggestion,
                id: crypto.randomUUID(),
                findingId: finding.id,
                createdAt: new Date(),
              } as NewSuggestion);
            }
          }
        }
      } catch (error) {
        console.error(`Rule ${rule.id} failed:`, error);
        // Continue with other rules - don't let one failing rule break the engine
      }
    }

    return { findings, suggestions };
  }

  /**
   * Get the current ruleset version
   */
  getRulesetVersion(): string {
    return this.ruleset.version;
  }

  /**
   * Get enabled rules count
   */
  getEnabledRulesCount(): number {
    return this.ruleset.rules.filter((r) => r.enabled).length;
  }
}

/**
 * Helper to create evidence links for findings
 */
export function createEvidence(observationId: string, description: string, recordSetId?: string) {
  return [
    {
      observationId,
      recordSetId,
      description,
    },
  ];
}

/**
 * Helper to determine blast radius based on zone management and record type
 */
export function inferBlastRadius(
  zoneManagement: 'managed' | 'unmanaged' | 'unknown',
  recordType: string
): BlastRadius {
  if (zoneManagement !== 'managed') {
    return 'single-domain';
  }

  // NS records at apex affect the entire zone
  if (recordType === 'NS') {
    return 'subdomain-tree';
  }

  // SOA affects the entire zone
  if (recordType === 'SOA') {
    return 'subdomain-tree';
  }

  // MX affects mail for the domain
  if (recordType === 'MX') {
    return 'single-domain';
  }

  return 'single-domain';
}

/**
 * Helper to determine review-only flag
 */
export function isReviewOnly(
  severity: Severity,
  blastRadius: BlastRadius,
  confidence: Confidence
): boolean {
  // High/critical severity always requires review
  if (severity === 'critical' || severity === 'high') {
    return true;
  }

  // Anything affecting multiple domains requires review
  if (
    blastRadius === 'related-domains' ||
    blastRadius === 'infrastructure' ||
    blastRadius === 'organization-wide'
  ) {
    return true;
  }

  // Low confidence findings require review
  if (confidence === 'low' || confidence === 'heuristic') {
    return true;
  }

  return false;
}
