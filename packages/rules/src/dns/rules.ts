/**
 * DNS Rules Pack - Initial Rules
 *
 * First benchmark-backed DNS rules:
 * 1. Authoritative lookup failures/timeouts
 * 2. Mismatch across authoritative servers
 * 3. Recursive vs authoritative mismatch
 * 4. CNAME coexistence conflict
 * 5. Partial coverage for unmanaged zones
 */

import type { Observation, RecordSet } from '@dns-ops/db/schema';
import type { Rule, RuleContext, RuleResult } from '../engine/index.js';
import { inferBlastRadius, isReviewOnly } from '../engine/index.js';

// =============================================================================
// Rule 1: Authoritative Failure Detection
// =============================================================================

export const authoritativeFailureRule: Rule = {
  id: 'dns.auth-failure.v1',
  name: 'Authoritative Lookup Failure',
  description: 'Detects timeouts and failures from authoritative nameservers',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult[] {
    const failures = context.observations.filter(
      (obs) =>
        obs.vantageType === 'authoritative' &&
        (obs.status === 'timeout' || obs.status === 'refused' || obs.status === 'error')
    );

    if (failures.length === 0) return [];

    // Group by query name/type to report each unique query
    const failuresByQuery = groupByQuery(failures);
    const findings: RuleResult[] = [];

    for (const [queryKey, queryFailures] of failuresByQuery) {
      const [name, type] = queryKey.split('|');
      const failureTypes = [...new Set(queryFailures.map((f) => f.status))];

      const severity = failureTypes.includes('timeout') ? 'high' : 'medium';
      const blastRadius = inferBlastRadius(context.zoneManagement, type);
      const confidence = failureTypes.length === queryFailures.length ? 'certain' : 'high';

      findings.push({
        subjectKey: queryKey,
        finding: {
          type: `dns.authoritative-${failureTypes[0]}`,
          title: `Authoritative ${failureTypes[0]} for ${name} ${type}`,
          description: `Query for ${name} (${type}) failed from ${queryFailures.length} authoritative server(s) with: ${failureTypes.join(', ')}. This may indicate nameserver issues or network problems.`,
          severity,
          confidence,
          riskPosture: severity === 'high' ? 'high' : 'medium',
          blastRadius,
          reviewOnly: isReviewOnly(severity, blastRadius, confidence),
          evidence: queryFailures.map((f) => ({
            observationId: f.id,
            description: `${f.vantageIdentifier}: ${f.status}${f.errorMessage ? ` - ${f.errorMessage}` : ''}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Check authoritative server health',
            description: `Verify that authoritative nameservers for ${context.domainName} are responding correctly.`,
            action: `Run connectivity checks to: ${[...new Set(queryFailures.map((f) => f.vantageIdentifier))].join(', ')}`,
            riskPosture: 'low',
            blastRadius,
            reviewOnly: true,
          },
        ],
      });
    }

    // TB-3: surface EVERY failing query, not just the first.
    return findings;
  },
};

// =============================================================================
// Rule 2: Authoritative Server Mismatch
// =============================================================================

export const authoritativeMismatchRule: Rule = {
  id: 'dns.auth-mismatch.v1',
  name: 'Authoritative Server Answer Mismatch',
  description: 'Detects when different authoritative servers return different answers',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult[] {
    // Look for inconsistent record sets that came from authoritative vantages
    const inconsistentRecordSets = context.recordSets.filter((rs) => !rs.isConsistent);

    if (inconsistentRecordSets.length === 0) return [];

    const results: RuleResult[] = [];

    for (const rs of inconsistentRecordSets) {
      // Only consider if authoritative vantages are involved
      const authObservations = context.observations.filter(
        (obs) =>
          obs.queryName.toLowerCase() === rs.name.toLowerCase() &&
          obs.queryType === rs.type &&
          obs.vantageType === 'authoritative' &&
          obs.status === 'success'
      );

      if (authObservations.length < 2) continue;

      const blastRadius = inferBlastRadius(context.zoneManagement, rs.type);

      results.push({
        subjectKey: `${rs.name.toLowerCase()}|${rs.type}`,
        finding: {
          type: 'dns.authoritative-mismatch',
          title: `Authoritative mismatch for ${rs.name} ${rs.type}`,
          description: `Different authoritative servers return different answers for ${rs.name} (${rs.type}). Values: ${rs.values.join(', ')}. Source vantages: ${rs.sourceVantages.join(', ')}. This indicates zone inconsistency or ongoing propagation.`,
          severity: 'critical',
          confidence: 'certain',
          riskPosture: 'critical',
          blastRadius,
          reviewOnly: true,
          evidence: authObservations.map((obs) => ({
            observationId: obs.id,
            recordSetId: rs.id,
            description: `${obs.vantageIdentifier}: ${obs.answerSection?.map((a) => a.data).join(', ') || 'no answer'}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Investigate zone inconsistency',
            description: `Check for zone transfer issues or configuration differences between authoritative servers.`,
            action: `Compare zone files on: ${rs.sourceVantages.filter((v) => !v.includes('(')).join(', ')}`,
            riskPosture: 'high',
            blastRadius,
            reviewOnly: true,
          },
        ],
      });
    }

    // TB-3: surface EVERY inconsistent record set, not just the first.
    return results;
  },
};

// =============================================================================
// Rule 3: Recursive vs Authoritative Mismatch
// =============================================================================

export const recursiveAuthoritativeMismatchRule: Rule = {
  id: 'dns.recursive-auth-mismatch.v1',
  name: 'Recursive vs Authoritative Mismatch',
  description: 'Detects when public recursive resolvers disagree with authoritative servers',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult[] {
    // Group record sets by name and type
    const recordSetsByQuery = new Map<string, RecordSet>();
    for (const rs of context.recordSets) {
      const key = `${rs.name.toLowerCase()}|${rs.type}`;
      recordSetsByQuery.set(key, rs);
    }

    // For each query, compare recursive and authoritative results
    const mismatches: Array<{
      name: string;
      type: string;
      recursiveValues: string[];
      authoritativeValues: string[];
      recursiveObs: Observation[];
      authObs: Observation[];
    }> = [];

    for (const [key] of recordSetsByQuery) {
      const [name, type] = key.split('|');

      const recursiveObs = context.observations.filter(
        (obs) =>
          obs.queryName.toLowerCase() === name.toLowerCase() &&
          obs.queryType === type &&
          obs.vantageType === 'public-recursive' &&
          obs.status === 'success'
      );

      const authObs = context.observations.filter(
        (obs) =>
          obs.queryName.toLowerCase() === name.toLowerCase() &&
          obs.queryType === type &&
          obs.vantageType === 'authoritative' &&
          obs.status === 'success'
      );

      if (recursiveObs.length === 0 || authObs.length === 0) continue;

      const recursiveValues = extractUniqueValues(recursiveObs);
      const authValues = extractUniqueValues(authObs);

      // Check for mismatch (values differ)
      if (!arraysEqual(sorted(recursiveValues), sorted(authValues))) {
        mismatches.push({
          name,
          type,
          recursiveValues,
          authoritativeValues: authValues,
          recursiveObs,
          authObs,
        });
      }
    }

    if (mismatches.length === 0) return [];

    // TB-3: surface EVERY recursive/authoritative mismatch, not just the first.
    const results: RuleResult[] = [];
    for (const mismatch of mismatches) {
      const blastRadius = inferBlastRadius(context.zoneManagement, mismatch.type);
      results.push({
        subjectKey: `${mismatch.name}|${mismatch.type}`,
        finding: {
          type: 'dns.recursive-authoritative-mismatch',
          title: `Recursive/authoritative mismatch for ${mismatch.name} ${mismatch.type}`,
          description: `Public recursive resolver(s) return different values than authoritative servers for ${mismatch.name} (${mismatch.type}). Recursive: ${mismatch.recursiveValues.join(', ') || 'none'}. Authoritative: ${mismatch.authoritativeValues.join(', ') || 'none'}. This may indicate stale cache or propagation in progress.`,
          severity: 'high',
          confidence: 'certain',
          riskPosture: 'high',
          blastRadius,
          reviewOnly: true,
          evidence: [
            ...mismatch.recursiveObs.map((obs) => ({
              observationId: obs.id,
              description: `Recursive (${obs.vantageIdentifier}): ${obs.answerSection?.map((a) => a.data).join(', ') || 'no answer'}`,
            })),
            ...mismatch.authObs.map((obs) => ({
              observationId: obs.id,
              description: `Authoritative (${obs.vantageIdentifier}): ${obs.answerSection?.map((a) => a.data).join(', ') || 'no answer'}`,
            })),
          ],
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Check for stale cache',
            description: `Verify if this is a cache propagation issue or configuration problem.`,
            action: `Compare TTL on recursive vs authoritative. Consider cache flush if values are stale.`,
            riskPosture: 'low',
            blastRadius,
            reviewOnly: true,
          },
        ],
      });
    }
    return results;
  },
};

// =============================================================================
// Rule 4: CNAME Coexistence Conflict
// =============================================================================

export const cnameCoexistenceRule: Rule = {
  id: 'dns.cname-coexistence.v1',
  name: 'CNAME Coexistence Conflict',
  description: 'Detects CNAME records coexisting with other record types (RFC violation)',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult[] {
    // Find all CNAME record sets
    const cnameRecords = context.recordSets.filter((rs) => rs.type === 'CNAME');

    if (cnameRecords.length === 0) return [];

    const violations: Array<{
      cname: RecordSet;
      conflicting: RecordSet[];
    }> = [];

    for (const cname of cnameRecords) {
      // Find other record sets at the same name
      const conflicting = context.recordSets.filter(
        (rs) =>
          rs.name.toLowerCase() === cname.name.toLowerCase() &&
          rs.type !== 'CNAME' &&
          // Allow DNSSEC records (RRSIG, NSEC, NSEC3) to coexist with CNAME
          !['RRSIG', 'NSEC', 'NSEC3', 'DNSKEY'].includes(rs.type)
      );

      if (conflicting.length > 0) {
        violations.push({ cname, conflicting });
      }
    }

    if (violations.length === 0) return [];

    // TB-3: surface EVERY CNAME coexistence violation, not just the first.
    const blastRadius = inferBlastRadius(context.zoneManagement, 'CNAME');
    const results: RuleResult[] = [];
    for (const violation of violations) {
      results.push({
        subjectKey: violation.cname.name.toLowerCase(),
        finding: {
          type: 'dns.cname-coexistence-conflict',
          title: `CNAME coexistence violation at ${violation.cname.name}`,
          description: `${violation.cname.name} has a CNAME record coexisting with ${violation.conflicting.map((r) => r.type).join(', ')} records. Per RFC 1034/2181, CNAME cannot coexist with other data (except DNSSEC records). This causes undefined behavior.`,
          severity: 'critical',
          confidence: 'certain',
          riskPosture: 'critical',
          blastRadius,
          reviewOnly: true,
          evidence: [
            ...context.observations
              .filter((obs) => obs.queryName.toLowerCase() === violation.cname.name.toLowerCase())
              .map((obs) => ({
                observationId: obs.id,
                description: `${obs.queryType} from ${obs.vantageIdentifier}`,
              })),
          ],
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Remove conflicting records',
            description: `Either remove the CNAME or the conflicting record(s). CNAME cannot coexist with other data.`,
            action: `Choose one: keep CNAME (${violation.cname.values.join(', ')}) OR keep ${violation.conflicting.map((r) => `${r.type} (${r.values.join(', ')})`).join(', ')}`,
            riskPosture: 'high',
            blastRadius,
            reviewOnly: true,
          },
        ],
      });
    }
    return results;
  },
};

// =============================================================================
// Rule 5: Unmanaged Zone Partial Coverage
// =============================================================================

export const unmanagedZonePartialCoverageRule: Rule = {
  id: 'dns.unmanaged-partial.v1',
  name: 'Unmanaged Zone Partial Coverage',
  description: 'Explicitly notes that unmanaged zones have limited visibility',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult[] {
    // Only applies to unmanaged zones
    if (context.zoneManagement !== 'unmanaged') return [];

    // Get the scope of what was actually queried
    const queriedNames = [...new Set(context.observations.map((o) => o.queryName))];
    const queriedTypes = [...new Set(context.observations.map((o) => o.queryType))];

    if (context.observations.length === 0) {
      return [
        {
          subjectKey: '',
          finding: {
            type: 'dns.partial-coverage-unmanaged',
            title: `No data collected for ${context.domainName}`,
            description: `No observations were collected for ${context.domainName}. This is an unmanaged zone with no visibility.`,
            severity: 'info',
            confidence: 'certain',
            riskPosture: 'safe',
            blastRadius: 'none',
            reviewOnly: false,
            evidence: [],
            ruleId: this.id,
            ruleVersion: this.version,
          },
        },
      ];
    }

    return [
      {
        subjectKey: '',
        finding: {
          type: 'dns.partial-coverage-unmanaged',
          title: `Partial coverage for unmanaged zone ${context.domainName}`,
          description: `${context.domainName} is an unmanaged zone. Only targeted inspection was performed for: ${queriedNames.join(', ')} (types: ${queriedTypes.join(', ')}). Full zone enumeration was not attempted. This is limited visibility, not authoritative completeness.`,
          severity: 'info',
          confidence: 'certain',
          riskPosture: 'safe',
          blastRadius: 'none',
          reviewOnly: false,
          evidence: context.observations.map((obs) => ({
            observationId: obs.id,
            description: `Queried ${obs.queryName} ${obs.queryType}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
      },
    ];
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

function groupByQuery(observations: Observation[]): Map<string, Observation[]> {
  const groups = new Map<string, Observation[]>();
  for (const obs of observations) {
    const key = `${obs.queryName.toLowerCase()}|${obs.queryType}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(obs);
  }
  return groups;
}

function extractUniqueValues(observations: Observation[]): string[] {
  const values = new Set<string>();
  for (const obs of observations) {
    for (const answer of obs.answerSection || []) {
      values.add(answer.data);
    }
  }
  return [...values];
}

function sorted<T>(arr: T[]): T[] {
  return [...arr].sort();
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}
