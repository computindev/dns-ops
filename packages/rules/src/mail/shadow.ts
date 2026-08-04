/**
 * Shadow Comparison Module - Bead 09
 *
 * Compares new mail rule findings against legacy DMARC/DKIM tool outputs.
 * Enables safe cutover by identifying mismatches before switching authority.
 */

import type { NewFinding } from '@dns-ops/db';

// =============================================================================
// Shadow Comparison Types
// =============================================================================

export interface ShadowComparisonResult {
  snapshotId: string;
  domain: string;
  comparedAt: Date;

  // Overall status
  status: 'match' | 'mismatch' | 'partial-match' | 'error';

  // Individual field comparisons
  comparisons: FieldComparison[];

  // Aggregate metrics
  metrics: {
    totalFields: number;
    matchingFields: number;
    mismatchingFields: number;
    missingInNew: number;
    missingInLegacy: number;
  };

  // Human-readable summary
  summary: string;
}

export interface FieldComparison {
  field:
    | 'dmarc-present'
    | 'dmarc-valid'
    | 'dmarc-policy'
    | 'spf-present'
    | 'spf-valid'
    | 'dkim-present'
    | 'dkim-valid'
    | 'dkim-selector';
  legacyValue: string | boolean | null;
  newValue: string | boolean | null;
  status: 'match' | 'mismatch' | 'missing-in-legacy' | 'missing-in-new' | 'not-comparable';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  explanation: string;
}

export interface LegacyToolOutput {
  domain: string;
  checkedAt: Date;
  dmarc: {
    present: boolean;
    valid: boolean;
    policy?: string;
    record?: string;
    errors?: string[];
  };
  spf: {
    present: boolean;
    valid: boolean;
    record?: string;
    errors?: string[];
  };
  dkim: {
    present: boolean;
    valid: boolean;
    selector?: string;
    record?: string;
    errors?: string[];
  };
  rawOutput?: string; // Original tool output for debugging
}

// =============================================================================
// Shadow Comparison Engine
// =============================================================================

export class ShadowComparator {
  /**
   * Compare new findings against legacy tool output
   */
  compare(
    snapshotId: string,
    domain: string,
    newFindings: NewFinding[],
    legacyOutput: LegacyToolOutput
  ): ShadowComparisonResult {
    const comparisons: FieldComparison[] = [];

    // Extract new finding data
    const newDmarcFinding = newFindings.find((f) => f.type.startsWith('mail.dmarc'));
    const newSpfFinding = newFindings.find((f) => f.type.startsWith('mail.spf'));
    const newDkimFinding = newFindings.find((f) => f.type.startsWith('mail.dkim'));

    // Compare DMARC presence
    comparisons.push(this.compareDmarcPresence(newDmarcFinding, legacyOutput.dmarc));

    // Compare DMARC validity
    comparisons.push(this.compareDmarcValidity(newDmarcFinding, legacyOutput.dmarc));

    // Compare DMARC policy
    comparisons.push(this.compareDmarcPolicy(newDmarcFinding, legacyOutput.dmarc));

    // Compare SPF presence
    comparisons.push(this.compareSpfPresence(newSpfFinding, legacyOutput.spf));

    // Compare directly published SPF syntax only; recursive validity is unavailable.
    comparisons.push(this.compareSpfValidity(newSpfFinding, legacyOutput.spf));

    // Compare DKIM presence
    comparisons.push(this.compareDkimPresence(newDkimFinding, legacyOutput.dkim));

    // Compare DKIM validity
    comparisons.push(this.compareDkimValidity(newDkimFinding, legacyOutput.dkim));

    // Calculate metrics
    const metrics = this.calculateMetrics(comparisons);

    // Determine overall status
    const status = this.determineOverallStatus(comparisons);

    // Generate summary
    const summary = this.generateSummary(domain, comparisons, metrics);

    return {
      snapshotId,
      domain,
      comparedAt: new Date(),
      status,
      comparisons,
      metrics,
      summary,
    };
  }

  private compareDmarcPresence(
    newFinding: NewFinding | undefined,
    legacyDmarc: LegacyToolOutput['dmarc']
  ): FieldComparison {
    const newPresent = newFinding?.type === 'mail.dmarc-present';
    const legacyPresent = legacyDmarc.present;

    if (newPresent === legacyPresent) {
      return {
        field: 'dmarc-present',
        legacyValue: legacyPresent,
        newValue: newPresent,
        status: 'match',
        severity: 'info',
        explanation: `Both agree: DMARC is ${newPresent ? 'present' : 'absent'}`,
      };
    }

    return {
      field: 'dmarc-present',
      legacyValue: legacyPresent,
      newValue: newPresent,
      status: 'mismatch',
      severity: 'critical',
      explanation: `MISMATCH: Legacy says ${legacyPresent ? 'present' : 'absent'}, new says ${newPresent ? 'present' : 'absent'}`,
    };
  }

  private compareDmarcValidity(
    newFinding: NewFinding | undefined,
    legacyDmarc: LegacyToolOutput['dmarc']
  ): FieldComparison {
    const newMalformed = newFinding?.type === 'mail.dmarc-malformed';
    const newPresent = newFinding?.type === 'mail.dmarc-present';
    const newValid = newPresent && !newMalformed;
    const legacyValid = legacyDmarc.valid;

    if (newValid === legacyValid) {
      return {
        field: 'dmarc-valid',
        legacyValue: legacyValid,
        newValue: newValid,
        status: 'match',
        severity: 'info',
        explanation: `Both agree: DMARC is ${newValid ? 'valid' : 'invalid'}`,
      };
    }

    return {
      field: 'dmarc-valid',
      legacyValue: legacyValid,
      newValue: newValid,
      status: 'mismatch',
      severity: 'high',
      explanation: `MISMATCH: Legacy says ${legacyValid ? 'valid' : 'invalid'}, new says ${newValid ? 'valid' : 'invalid'}`,
    };
  }

  private compareDmarcPolicy(
    newFinding: NewFinding | undefined,
    legacyDmarc: LegacyToolOutput['dmarc']
  ): FieldComparison {
    // Extract policy from new finding description
    const newPolicyMatch = newFinding?.description.match(/policy "(\w+)"/);
    const newPolicy = newPolicyMatch ? newPolicyMatch[1] : null;
    const legacyPolicy = legacyDmarc.policy || null;

    if (!newPolicy && !legacyPolicy) {
      return {
        field: 'dmarc-policy',
        legacyValue: legacyPolicy,
        newValue: newPolicy,
        status: 'match',
        severity: 'info',
        explanation: 'Both agree: no policy found',
      };
    }

    if (newPolicy?.toLowerCase() === legacyPolicy?.toLowerCase()) {
      return {
        field: 'dmarc-policy',
        legacyValue: legacyPolicy,
        newValue: newPolicy,
        status: 'match',
        severity: 'info',
        explanation: `Both agree: policy is "${newPolicy}"`,
      };
    }

    return {
      field: 'dmarc-policy',
      legacyValue: legacyPolicy,
      newValue: newPolicy,
      status: 'mismatch',
      severity: 'high',
      explanation: `MISMATCH: Legacy says "${legacyPolicy}", new says "${newPolicy}"`,
    };
  }

  private compareSpfPresence(
    newFinding: NewFinding | undefined,
    legacySpf: LegacyToolOutput['spf']
  ): FieldComparison {
    const newPresent = newFinding?.type === 'mail.spf-present';
    const legacyPresent = legacySpf.present;

    if (newPresent === legacyPresent) {
      return {
        field: 'spf-present',
        legacyValue: legacyPresent,
        newValue: newPresent,
        status: 'match',
        severity: 'info',
        explanation: `Both agree: SPF is ${newPresent ? 'present' : 'absent'}`,
      };
    }

    return {
      field: 'spf-present',
      legacyValue: legacyPresent,
      newValue: newPresent,
      status: 'mismatch',
      severity: 'critical',
      explanation: `MISMATCH: Legacy says ${legacyPresent ? 'present' : 'absent'}, new says ${newPresent ? 'present' : 'absent'}`,
    };
  }

  private compareSpfValidity(
    newFinding: NewFinding | undefined,
    legacySpf: LegacyToolOutput['spf']
  ): FieldComparison {
    const newMalformed = newFinding?.type === 'mail.spf-malformed';
    const newPresent = newFinding?.type === 'mail.spf-present';
    const newValid = newPresent && !newMalformed;
    const legacyValid = legacySpf.valid;

    if (newValid === legacyValid) {
      return {
        field: 'spf-valid',
        legacyValue: legacyValid,
        newValue: newValid,
        status: 'match',
        severity: 'info',
        explanation: `Both agree on directly published SPF syntax: ${newValid ? 'valid' : 'invalid'}. Nested dependencies were not evaluated.`,
      };
    }

    return {
      field: 'spf-valid',
      legacyValue: legacyValid,
      newValue: newValid,
      status: 'mismatch',
      severity: 'high',
      explanation: `MISMATCH: Legacy reports ${legacyValid ? 'valid' : 'invalid'}, while the new first-level-only syntax check reports ${newValid ? 'valid' : 'invalid'}. Nested dependencies were not evaluated.`,
    };
  }

  private compareDkimPresence(
    newFinding: NewFinding | undefined,
    legacyDkim: LegacyToolOutput['dkim']
  ): FieldComparison {
    const newPresent = newFinding?.type === 'mail.dkim-keys-present';
    const legacyPresent = legacyDkim.present;

    if (newPresent === legacyPresent) {
      return {
        field: 'dkim-present',
        legacyValue: legacyPresent,
        newValue: newPresent,
        status: 'match',
        severity: 'info',
        explanation: `Both agree: DKIM is ${newPresent ? 'present' : 'absent'}`,
      };
    }

    return {
      field: 'dkim-present',
      legacyValue: legacyPresent,
      newValue: newPresent,
      status: 'mismatch',
      severity: 'high',
      explanation: `MISMATCH: Legacy says ${legacyPresent ? 'present' : 'absent'}, new says ${newPresent ? 'present' : 'absent'}`,
    };
  }

  private compareDkimValidity(
    newFinding: NewFinding | undefined,
    legacyDkim: LegacyToolOutput['dkim']
  ): FieldComparison {
    const newNoValidKeys = newFinding?.type === 'mail.dkim-no-valid-keys';
    const newKeysPresent = newFinding?.type === 'mail.dkim-keys-present';
    const newValid = newKeysPresent && !newNoValidKeys;
    const legacyValid = legacyDkim.valid;

    if (newValid === legacyValid) {
      return {
        field: 'dkim-valid',
        legacyValue: legacyValid,
        newValue: newValid,
        status: 'match',
        severity: 'info',
        explanation: `Both agree: DKIM is ${newValid ? 'valid' : 'invalid'}`,
      };
    }

    return {
      field: 'dkim-valid',
      legacyValue: legacyValid,
      newValue: newValid,
      status: 'mismatch',
      severity: 'medium',
      explanation: `MISMATCH: Legacy says ${legacyValid ? 'valid' : 'invalid'}, new says ${newValid ? 'valid' : 'invalid'}`,
    };
  }

  private calculateMetrics(comparisons: FieldComparison[]) {
    return {
      totalFields: comparisons.length,
      matchingFields: comparisons.filter((c) => c.status === 'match').length,
      mismatchingFields: comparisons.filter((c) => c.status === 'mismatch').length,
      missingInNew: comparisons.filter((c) => c.status === 'missing-in-new').length,
      missingInLegacy: comparisons.filter((c) => c.status === 'missing-in-legacy').length,
    };
  }

  private determineOverallStatus(
    comparisons: FieldComparison[]
  ): 'match' | 'mismatch' | 'partial-match' | 'error' {
    const criticalMismatches = comparisons.filter(
      (c) => c.status === 'mismatch' && c.severity === 'critical'
    ).length;

    if (criticalMismatches > 0) {
      return 'mismatch';
    }

    const allMismatches = comparisons.filter((c) => c.status === 'mismatch').length;
    const totalComparable = comparisons.filter((c) => c.status !== 'not-comparable').length;

    if (allMismatches === 0) {
      return 'match';
    }

    if (allMismatches < totalComparable / 2) {
      return 'partial-match';
    }

    return 'mismatch';
  }

  private generateSummary(
    domain: string,
    comparisons: FieldComparison[],
    metrics: ShadowComparisonResult['metrics']
  ): string {
    const parts: string[] = [];
    parts.push(`Shadow comparison for ${domain}:`);
    parts.push(`${metrics.matchingFields}/${metrics.totalFields} fields match`);

    if (metrics.mismatchingFields > 0) {
      parts.push(`${metrics.mismatchingFields} mismatches detected`);

      const criticalMismatches = comparisons.filter(
        (c) => c.status === 'mismatch' && c.severity === 'critical'
      );
      if (criticalMismatches.length > 0) {
        parts.push(`CRITICAL: ${criticalMismatches.map((c) => c.field).join(', ')}`);
      }
    }

    return parts.join('. ');
  }
}

// =============================================================================
// Shadow Comparison Storage
// =============================================================================

// NOTE: In-memory ShadowComparisonStore was removed.
// Shadow comparisons are persisted durably via ShadowComparisonRepository (packages/db).
// See apps/web/hono/routes/shadow-comparison.ts for the DB-backed implementation.

export const shadowComparator = new ShadowComparator();
