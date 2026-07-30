/**
 * DNS Change Simulation Engine
 *
 * Generic findings are intentionally downgraded to non-executable guidance.
 * Concrete local simulation is allowed only after a future caller supplies
 * complete, provider-confirmed values; this module currently exposes no such
 * generic-to-mutation path.
 */

import type { GuidanceOnlySuggestion } from '@dns-ops/contracts';
import type { NewFinding, Observation } from '@dns-ops/db';

export {
  getActionableFindingTypes,
  getGuidanceSupportedFindingTypes,
  hasGuidanceForFindingType,
  isActionableFindingType,
  isSimulationError,
  SimulationError,
  type SimulationErrorCode,
  simulationResult,
  validateSimulationContext,
} from './result.js';

import type { RuleContext, Ruleset } from '../engine/index.js';
import { RulesEngine } from '../engine/index.js';
import type { KnownProvider } from '../mail/templates.js';

export interface ProposedChange {
  action: 'add' | 'modify' | 'remove';
  name: string;
  type: string;
  currentValues: string[];
  proposedValues: string[];
  rationale: string;
  findingType: string;
  risk: 'low' | 'medium' | 'high';
}

export interface SimulationResult {
  mode: 'GUIDANCE_ONLY';
  domain: string;
  detectedProvider: KnownProvider;
  proposedChanges: [];
  guidanceOnlySuggestions: GuidanceOnlySuggestion[];
  currentFindings: SimulationFinding[];
  summary: {
    changesProposed: 0;
    guidanceProvided: number;
    currentFindings: number;
  };
}

export interface SimulationFinding {
  type: string;
  title: string;
  severity: string;
  ruleId: string;
}

const GUIDANCE_BY_FINDING: Record<
  string,
  Omit<GuidanceOnlySuggestion, 'kind' | 'executableMutation'>
> = {
  'mail.no-spf-record': {
    title: 'Confirm authorized senders with the mail provider',
    explanation:
      'Inventory every authorized sender, obtain the provider-specific SPF instructions, and review the directly published SPF terms before planning a change.',
    playbookId: 'mail.spf.provider-confirmation',
    requiresProviderConfirmation: true,
  },
  'mail.spf-malformed': {
    title: 'Review SPF syntax and sender dependencies',
    explanation:
      'Correct only after the current sender inventory and provider instructions are confirmed. Phase 0–1 does not recursively validate include or redirect dependencies.',
    playbookId: 'mail.spf.syntax-review',
    requiresProviderConfirmation: true,
  },
  'mail.no-dmarc-record': {
    title: 'Plan DMARC monitoring with a verified report destination',
    explanation:
      'Confirm the domain mail purpose, aligned senders, and a monitored aggregate-report destination before choosing any DMARC policy.',
    playbookId: 'mail.dmarc.monitoring-readiness',
    requiresProviderConfirmation: true,
  },
  'mail.no-mx-record': {
    title: 'Declare the domain mail-receiving purpose',
    explanation:
      'Decide whether the domain receives mail, then obtain exact MX targets from the confirmed provider or follow the non-mail-domain playbook.',
    playbookId: 'mail.mx.purpose-and-provider',
    requiresProviderConfirmation: true,
  },
  'mail.no-dkim-queried': {
    title: 'Supply provider-issued DKIM selector evidence',
    explanation:
      'Retrieve selectors and public-key records from the confirmed provider. DNS Ops does not invent selectors or key material.',
    playbookId: 'mail.dkim.selector-evidence',
    requiresProviderConfirmation: true,
  },
  'mail.no-mta-sts': {
    title: 'Assess MTA-STS deployment prerequisites',
    explanation:
      'Confirm inbound-mail ownership, policy-host availability, certificate operations, and rollback monitoring before planning deployment.',
    playbookId: 'mail.mta-sts.readiness',
    requiresProviderConfirmation: true,
  },
  'mail.no-tls-rpt': {
    title: 'Confirm TLS reporting ownership',
    explanation:
      'Choose and verify an operated reporting destination before planning a TLS-RPT record.',
    playbookId: 'mail.tls-rpt.reporting-readiness',
    requiresProviderConfirmation: true,
  },
  'dns.cname-coexistence-conflict': {
    title: 'Choose the intended owner of the DNS name',
    explanation:
      'Review service ownership and dependencies before deciding whether the CNAME or other data should remain. No record is selected for removal automatically.',
    playbookId: 'dns.cname.conflict-review',
    requiresProviderConfirmation: false,
  },
};

export function guidanceForFindingType(findingType: string): GuidanceOnlySuggestion | undefined {
  const guidance = GUIDANCE_BY_FINDING[findingType];
  return guidance ? { kind: 'GUIDANCE_ONLY', ...guidance, executableMutation: null } : undefined;
}

export class SimulationEngine {
  constructor(private ruleset: Ruleset) {}

  simulate(
    context: RuleContext,
    findings: Array<{ type: string; title: string; severity: string; ruleId: string }>,
    findingTypes?: string[]
  ): SimulationResult {
    const targetFindings = findingTypes
      ? findings.filter((finding) => findingTypes.includes(finding.type))
      : findings.filter((finding) => finding.type in GUIDANCE_BY_FINDING);
    const guidanceOnlySuggestions = targetFindings
      .map((finding) => guidanceForFindingType(finding.type))
      .filter((guidance): guidance is GuidanceOnlySuggestion => guidance !== undefined);

    const currentResult = new RulesEngine(this.ruleset).evaluate(context);
    const currentFindings = this.toSimFindings(currentResult.findings);

    return {
      mode: 'GUIDANCE_ONLY',
      domain: context.domainName,
      detectedProvider: 'unknown',
      proposedChanges: [],
      guidanceOnlySuggestions,
      currentFindings,
      summary: {
        changesProposed: 0,
        guidanceProvided: guidanceOnlySuggestions.length,
        currentFindings: currentFindings.length,
      },
    };
  }

  private toSimFindings(findings: NewFinding[]): SimulationFinding[] {
    return findings.map((finding) => ({
      type: finding.type,
      title: finding.title,
      severity: finding.severity,
      ruleId: finding.ruleId,
    }));
  }
}

/**
 * Apply already-complete, explicitly supplied local changes to observation
 * fixtures. This helper does not generate values and performs no external I/O.
 */
export function synthesizeObservations(
  current: Observation[],
  changes: ProposedChange[],
  _domainName: string,
  snapshotId: string
): Observation[] {
  const result = [...current];

  for (const change of changes) {
    if (change.action === 'remove') continue;

    const existingIdx = result.findIndex(
      (observation) =>
        observation.queryName.toLowerCase() === change.name.toLowerCase() &&
        observation.queryType === change.type &&
        observation.status === 'success'
    );
    if (
      change.action === 'add' &&
      existingIdx >= 0 &&
      result[existingIdx].answerSection &&
      (result[existingIdx].answerSection?.length ?? 0) > 0
    ) {
      continue;
    }
    if (existingIdx >= 0) result.splice(existingIdx, 1);

    result.push({
      id: crypto.randomUUID(),
      snapshotId,
      queryName: change.name,
      queryType: change.type,
      vantageType: 'public-recursive',
      vantageIdentifier: 'simulation',
      status: 'success',
      queriedAt: new Date(),
      responseTimeMs: 0,
      responseCode: 0,
      flags: null,
      answerSection: change.proposedValues.map((value) => ({
        name: change.name,
        type: change.type,
        ttl: 300,
        data: value,
      })),
      authoritySection: null,
      additionalSection: null,
      errorMessage: null,
      errorDetails: null,
      rawResponse: null,
    });
  }

  return result;
}
