/**
 * DNS Change Simulation Engine
 *
 * Inverts findings into proposed DNS record mutations, then dry-runs them
 * through the rules engine to predict which findings resolve, remain, or appear.
 *
 * Deterministic only — no AI/LLM, no guessing.
 */

import type { NewFinding, Observation, RecordSet } from '@dns-ops/db';

// Result-based error handling
export {
  getActionableFindingTypes,
  isActionableFindingType,
  isSimulationError,
  SimulationError,
  type SimulationErrorCode,
  simulationResult,
  validateSimulationContext,
} from './result.js';

import type { RuleContext, Ruleset } from '../engine/index.js';
import { RulesEngine } from '../engine/index.js';
import {
  detectProviderFromDns,
  type KnownProvider,
  PROVIDER_TEMPLATES,
} from '../mail/templates.js';

// =============================================================================
// Types
// =============================================================================

export interface ProposedChange {
  /** What kind of mutation */
  action: 'add' | 'modify' | 'remove';
  /** DNS record name (e.g. "example.com", "_dmarc.example.com") */
  name: string;
  /** DNS record type (e.g. "TXT", "MX") */
  type: string;
  /** Current value(s) — empty for 'add' */
  currentValues: string[];
  /** Proposed value(s) — empty for 'remove' */
  proposedValues: string[];
  /** Human-readable rationale */
  rationale: string;
  /** Which finding this change addresses */
  findingType: string;
  /** Risk level of making this change */
  risk: 'low' | 'medium' | 'high';
}

export interface SimulationResult {
  /** Domain being simulated */
  domain: string;
  /** Detected provider (if any) */
  detectedProvider: KnownProvider;
  /** Proposed DNS changes */
  proposedChanges: ProposedChange[];
  /** Findings BEFORE the proposed changes */
  currentFindings: SimulationFinding[];
  /** Findings AFTER the proposed changes (dry-run) */
  projectedFindings: SimulationFinding[];
  /** Findings that would be resolved */
  resolvedFindings: SimulationFinding[];
  /** Findings that would remain */
  remainingFindings: SimulationFinding[];
  /** New findings introduced by the changes */
  newFindings: SimulationFinding[];
  /** Summary stats */
  summary: {
    changesProposed: number;
    findingsBefore: number;
    findingsAfter: number;
    findingsResolved: number;
    findingsNew: number;
  };
}

export interface SimulationFinding {
  type: string;
  title: string;
  severity: string;
  ruleId: string;
}

// =============================================================================
// Simulation Engine
// =============================================================================

export class SimulationEngine {
  private ruleset: Ruleset;

  constructor(ruleset: Ruleset) {
    this.ruleset = ruleset;
  }

  /**
   * Given current findings and DNS state, generate proposed fixes and dry-run them.
   */
  simulate(
    context: RuleContext,
    findings: Array<{ type: string; title: string; severity: string; ruleId: string }>,
    findingTypes?: string[]
  ): SimulationResult {
    // Detect provider from current records
    const mxRecordSet = context.recordSets.find(
      (rs) => rs.type === 'MX' && rs.name.toLowerCase() === context.domainName.toLowerCase()
    );
    const spfRecordSet = context.recordSets.find(
      (rs) =>
        rs.type === 'TXT' &&
        rs.name.toLowerCase() === context.domainName.toLowerCase() &&
        rs.values.some((v) => v.includes('v=spf1'))
    );
    const detection = detectProviderFromDns(
      mxRecordSet?.values || [],
      spfRecordSet?.values.find((v) => v.includes('v=spf1'))
    );

    // Filter findings to simulate
    const targetFindings = findingTypes
      ? findings.filter((f) => findingTypes.includes(f.type))
      : findings.filter((f) => this.isActionable(f.type));

    // Generate proposed changes for each target finding
    const proposedChanges: ProposedChange[] = [];
    for (const finding of targetFindings) {
      const changes = this.invertFinding(
        finding.type,
        context.domainName,
        context.recordSets,
        detection.provider
      );
      proposedChanges.push(...changes);
    }

    // Deduplicate changes (same name+type)
    const deduped = this.deduplicateChanges(proposedChanges);

    // Build projected record sets by applying changes
    const projectedRecordSets = this.applyChanges(context.recordSets, deduped, context.snapshotId);

    // Build projected observations by synthesizing for new records
    const projectedObservations = synthesizeObservations(
      context.observations,
      deduped,
      context.domainName,
      context.snapshotId
    );

    // Dry-run rules engine with projected state
    const projectedContext: RuleContext = {
      ...context,
      recordSets: projectedRecordSets,
      observations: projectedObservations,
    };

    const engine = new RulesEngine(this.ruleset);
    const currentResult = engine.evaluate(context);
    const projectedResult = engine.evaluate(projectedContext);

    const currentSimFindings = this.toSimFindings(currentResult.findings);
    const projectedSimFindings = this.toSimFindings(projectedResult.findings);

    // Diff findings
    const currentTypes = new Set(currentSimFindings.map((f) => f.type));
    const projectedTypes = new Set(projectedSimFindings.map((f) => f.type));

    const resolved = currentSimFindings.filter((f) => !projectedTypes.has(f.type));
    const remaining = currentSimFindings.filter((f) => projectedTypes.has(f.type));
    const newFindings = projectedSimFindings.filter((f) => !currentTypes.has(f.type));

    return {
      domain: context.domainName,
      detectedProvider: detection.provider,
      proposedChanges: deduped,
      currentFindings: currentSimFindings,
      projectedFindings: projectedSimFindings,
      resolvedFindings: resolved,
      remainingFindings: remaining,
      newFindings,
      summary: {
        changesProposed: deduped.length,
        findingsBefore: currentSimFindings.length,
        findingsAfter: projectedSimFindings.length,
        findingsResolved: resolved.length,
        findingsNew: newFindings.length,
      },
    };
  }

  // ===========================================================================
  // Finding inversion — maps finding type → proposed DNS changes
  // ===========================================================================

  invertFinding(
    findingType: string,
    domainName: string,
    currentRecordSets: RecordSet[],
    provider: KnownProvider
  ): ProposedChange[] {
    const template = PROVIDER_TEMPLATES[provider] || PROVIDER_TEMPLATES.other;

    switch (findingType) {
      case 'mail.no-spf-record':
        return this.proposeSPF(domainName, template, provider);

      case 'mail.no-dmarc-record':
        return this.proposeDMARC(domainName);

      case 'mail.no-mx-record':
        return this.proposeMX(domainName, template, provider);

      case 'mail.no-mta-sts':
        return this.proposeMtaSts(domainName);

      case 'mail.no-tls-rpt':
        return this.proposeTlsRpt(domainName);

      case 'mail.no-dkim-queried':
        return this.proposeDKIM(domainName, template, provider);

      case 'mail.spf-malformed':
        return this.proposeFixSPF(domainName, currentRecordSets, template, provider);

      case 'dns.cname-coexistence-conflict':
        return this.proposeCnameResolution(domainName, currentRecordSets);

      default:
        return [];
    }
  }

  // ===========================================================================
  // Individual fix generators
  // ===========================================================================

  private proposeSPF(
    domain: string,
    template: (typeof PROVIDER_TEMPLATES)[KnownProvider],
    provider: KnownProvider
  ): ProposedChange[] {
    const include = template.expected.spf?.include;
    const spfValue = include ? `"v=spf1 include:${include} ~all"` : '"v=spf1 ~all"';

    return [
      {
        action: 'add',
        name: domain,
        type: 'TXT',
        currentValues: [],
        proposedValues: [spfValue],
        rationale: include
          ? `Add SPF record with ${provider} include directive`
          : 'Add baseline SPF record (customize includes for your mail provider)',
        findingType: 'mail.no-spf-record',
        risk: 'low',
      },
    ];
  }

  private proposeDMARC(domain: string): ProposedChange[] {
    return [
      {
        action: 'add',
        name: `_dmarc.${domain}`,
        type: 'TXT',
        currentValues: [],
        proposedValues: [`"v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain}"`],
        rationale:
          'Add DMARC record in monitoring mode (p=none). Upgrade to quarantine/reject after reviewing reports.',
        findingType: 'mail.no-dmarc-record',
        risk: 'low',
      },
    ];
  }

  private proposeMX(
    domain: string,
    template: (typeof PROVIDER_TEMPLATES)[KnownProvider],
    provider: KnownProvider
  ): ProposedChange[] {
    if (template.expected.mx && template.expected.mx.length > 0) {
      return [
        {
          action: 'add',
          name: domain,
          type: 'MX',
          currentValues: [],
          proposedValues: template.expected.mx.map((mx) => `${mx.priority} ${mx.description}`),
          rationale: `Add MX records for ${provider}`,
          findingType: 'mail.no-mx-record',
          risk: 'medium',
        },
      ];
    }

    // No provider-specific MX — suggest null MX if domain shouldn't receive mail
    return [
      {
        action: 'add',
        name: domain,
        type: 'MX',
        currentValues: [],
        proposedValues: ['0 .'],
        rationale:
          'Add Null MX to explicitly declare this domain does not receive email, OR add your mail server MX records',
        findingType: 'mail.no-mx-record',
        risk: 'medium',
      },
    ];
  }

  private proposeMtaSts(domain: string): ProposedChange[] {
    const dateId = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return [
      {
        action: 'add',
        name: `_mta-sts.${domain}`,
        type: 'TXT',
        currentValues: [],
        proposedValues: [`"v=STSv1; id=${dateId}"`],
        rationale:
          'Add MTA-STS TXT record to enable TLS enforcement for inbound mail. Also requires hosting a policy file at https://mta-sts.{domain}/.well-known/mta-sts.txt',
        findingType: 'mail.no-mta-sts',
        risk: 'low',
      },
    ];
  }

  private proposeTlsRpt(domain: string): ProposedChange[] {
    return [
      {
        action: 'add',
        name: `_smtp._tls.${domain}`,
        type: 'TXT',
        currentValues: [],
        proposedValues: [`"v=TLSRPTv1; rua=mailto:tls-reports@${domain}"`],
        rationale: 'Add TLS-RPT record to receive TLS connectivity reports for inbound mail',
        findingType: 'mail.no-tls-rpt',
        risk: 'low',
      },
    ];
  }

  private proposeDKIM(
    domain: string,
    template: (typeof PROVIDER_TEMPLATES)[KnownProvider],
    provider: KnownProvider
  ): ProposedChange[] {
    const selectors = template.expected.dkim?.selectors || [];
    if (selectors.length === 0) {
      return [
        {
          action: 'add',
          name: `default._domainkey.${domain}`,
          type: 'TXT',
          currentValues: [],
          proposedValues: ['"v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"'],
          rationale:
            'Add DKIM public key record. Replace YOUR_PUBLIC_KEY with the key from your mail provider.',
          findingType: 'mail.no-dkim-queried',
          risk: 'low',
        },
      ];
    }

    return selectors.map((selector) => ({
      action: 'add' as const,
      name: `${selector}._domainkey.${domain}`,
      type: 'TXT',
      currentValues: [],
      proposedValues: ['"v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"'],
      rationale: `Add DKIM public key for ${provider} selector "${selector}". Get the actual key value from your ${provider} admin console.`,
      findingType: 'mail.no-dkim-queried',
      risk: 'low',
    }));
  }

  private proposeFixSPF(
    domain: string,
    currentRecordSets: RecordSet[],
    template: (typeof PROVIDER_TEMPLATES)[KnownProvider],
    provider: KnownProvider
  ): ProposedChange[] {
    const currentSpf = currentRecordSets.find(
      (rs) =>
        rs.type === 'TXT' &&
        rs.name.toLowerCase() === domain.toLowerCase() &&
        rs.values.some((v) => v.includes('v=spf1'))
    );

    const include = template.expected.spf?.include;
    const newSpf = include ? `"v=spf1 include:${include} ~all"` : '"v=spf1 ~all"';

    return [
      {
        action: 'modify',
        name: domain,
        type: 'TXT',
        currentValues: currentSpf?.values.filter((v) => v.includes('v=spf1')) || [],
        proposedValues: [newSpf],
        rationale: `Replace malformed SPF record with valid ${provider} configuration`,
        findingType: 'mail.spf-malformed',
        risk: 'medium',
      },
    ];
  }

  private proposeCnameResolution(domain: string, currentRecordSets: RecordSet[]): ProposedChange[] {
    // Find the CNAME and conflicting records
    const cnameRecords = currentRecordSets.filter(
      (rs) => rs.type === 'CNAME' && rs.name.toLowerCase() === domain.toLowerCase()
    );

    if (cnameRecords.length === 0) return [];

    const conflicting = currentRecordSets.filter(
      (rs) =>
        rs.name.toLowerCase() === domain.toLowerCase() &&
        rs.type !== 'CNAME' &&
        !['RRSIG', 'NSEC', 'NSEC3', 'DNSKEY'].includes(rs.type)
    );

    // Suggest removing the conflicting non-CNAME records (safer default)
    return conflicting.map((rs) => ({
      action: 'remove' as const,
      name: rs.name,
      type: rs.type,
      currentValues: rs.values,
      proposedValues: [],
      rationale: `Remove ${rs.type} record that conflicts with CNAME at ${rs.name} (RFC 1034/2181 violation)`,
      findingType: 'dns.cname-coexistence-conflict',
      risk: 'high',
    }));
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /** Check if a finding type has a known fix */
  private isActionable(findingType: string): boolean {
    const actionableTypes = [
      'mail.no-spf-record',
      'mail.no-dmarc-record',
      'mail.no-mx-record',
      'mail.no-mta-sts',
      'mail.no-tls-rpt',
      'mail.no-dkim-queried',
      'mail.spf-malformed',
      'dns.cname-coexistence-conflict',
    ];
    return actionableTypes.includes(findingType);
  }

  /** Deduplicate changes targeting the same name+type */
  private deduplicateChanges(changes: ProposedChange[]): ProposedChange[] {
    const seen = new Map<string, ProposedChange>();
    for (const change of changes) {
      const key = `${change.action}:${change.name.toLowerCase()}:${change.type}`;
      if (!seen.has(key)) {
        seen.set(key, change);
      }
    }
    return [...seen.values()];
  }

  /** Apply proposed changes to record sets, returning a new projected set */
  private applyChanges(
    current: RecordSet[],
    changes: ProposedChange[],
    snapshotId: string
  ): RecordSet[] {
    const result = [...current];

    for (const change of changes) {
      if (change.action === 'add') {
        result.push({
          id: crypto.randomUUID(),
          snapshotId,
          name: change.name,
          type: change.type,
          ttl: 300,
          values: change.proposedValues,
          sourceObservationIds: [],
          sourceVantages: ['simulation'],
          isConsistent: true,
          consolidationNotes: 'Simulated record',
          createdAt: new Date(),
        });
      } else if (change.action === 'modify') {
        // For modify, try to match by current values first (more precise),
        // then fall back to name+type match
        let idx = result.findIndex(
          (rs) =>
            rs.name.toLowerCase() === change.name.toLowerCase() &&
            rs.type === change.type &&
            change.currentValues.some((cv) =>
              rs.values.some((v) => v.includes(cv) || cv.includes(v))
            )
        );
        if (idx < 0) {
          idx = result.findIndex(
            (rs) => rs.name.toLowerCase() === change.name.toLowerCase() && rs.type === change.type
          );
        }
        if (idx >= 0) {
          result[idx] = {
            ...result[idx],
            values: change.proposedValues,
            consolidationNotes: 'Simulated modification',
          };
        }
      } else if (change.action === 'remove') {
        const idx = result.findIndex(
          (rs) => rs.name.toLowerCase() === change.name.toLowerCase() && rs.type === change.type
        );
        if (idx >= 0) {
          result.splice(idx, 1);
        }
      }
    }

    return result;
  }

  private toSimFindings(findings: NewFinding[]): SimulationFinding[] {
    return findings.map((f) => ({
      type: f.type,
      title: f.title,
      severity: f.severity,
      ruleId: f.ruleId,
    }));
  }
}

/**
 * Synthesize successful DNS observations for newly added/modified records so the
 * rules engine can evaluate projected DNS state. Pure function — no engine state.
 *
 * The synthesized observation mirrors the canonical `observations` row shape
 * (`@dns-ops/db`) exactly — `vantageType`/`vantageIdentifier` (not a made-up
 * `vantage`/`vantageId`), `queriedAt` (not `timestamp`/`createdAt`),
 * `responseTimeMs` (not `queryDurationMs`), and `answerSection`/
 * `authoritySection`/`additionalSection` (not `answers`/`authority`/`additional`).
 * No cast is required because the field names match the Drizzle-inferred type.
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

    // For 'add': if a successful observation already exists with answers, skip.
    // For 'modify': always replace the existing observation with the simulated one.
    const existingIdx = result.findIndex(
      (obs) =>
        obs.queryName.toLowerCase() === change.name.toLowerCase() &&
        obs.queryType === change.type &&
        obs.status === 'success'
    );
    if (change.action === 'add') {
      if (
        existingIdx >= 0 &&
        result[existingIdx].answerSection &&
        (result[existingIdx].answerSection?.length ?? 0) > 0
      ) {
        continue;
      }
    }
    // Remove existing observation so the simulated one takes over
    if (existingIdx >= 0) {
      result.splice(existingIdx, 1);
    }

    // Synthesize a successful observation using canonical schema field names.
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
      answerSection: change.proposedValues.map((v) => ({
        name: change.name,
        type: change.type,
        ttl: 300,
        data: v,
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
