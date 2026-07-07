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
  // Discriminator for WHAT this finding is about within its (rule, type) —
  // a lowercased DNS query name|type, a CNAME owner name, a DKIM selector, a
  // bounded hash for CAA (never the raw value), or '' for domain-level
  // singletons. Lets one rule emit multiple DISTINCT findings per snapshot and
  // dedupe correctly via finding_unique_idx (migration 0012). The engine stamps
  // this onto the persisted finding's subject_key.
  subjectKey: string;
  // `rulesetVersionId` is omitted alongside id/snapshotId/createdAt/subjectKey
  // because they are resolved by the CALLER: rulesetVersionId comes from the
  // active ruleset version at persistence time, subjectKey is carried by the
  // RuleResult itself, and the ids/timestamps are generated at persist time.
  // This keeps Rule.evaluate's return shape stable while allowing
  // findings.ruleset_version_id to be NOT NULL (migration 0011) and
  // findings.subject_key to be NOT NULL (migration 0012).
  finding?: Omit<NewFinding, 'id' | 'snapshotId' | 'createdAt' | 'rulesetVersionId' | 'subjectKey'>;
  suggestions?: Omit<NewSuggestion, 'id' | 'findingId' | 'createdAt'>[];
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  // Returns EVERY finding the rule surfaces for this context (TB-3). An empty
  // array means no findings. Previously this returned a single RuleResult | null,
  // which discarded all but the first problem a rule detected.
  evaluate: (context: RuleContext) => RuleResult[];
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
        // TB-3: a rule returns EVERY finding it surfaces (one per problem
        // instance), disambiguated by subjectKey. Flatten them all into the
        // snapshot's findings.
        const results = rule.evaluate(context);
        for (const result of results) {
          if (!result.finding) continue;

          const finding: NewFinding = {
            ...result.finding,
            // Carried from the RuleResult so it lands in findings.subject_key.
            subjectKey: result.subjectKey,
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
