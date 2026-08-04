export type UnknownReason =
  | 'PURPOSE_UNDECLARED'
  | 'EVIDENCE_STALE'
  | 'PROBE_FAILED'
  | 'AUTHORITATIVE_EVIDENCE_UNAVAILABLE'
  | 'PROVIDER_NOT_CONNECTED'
  | 'SELECTOR_NOT_DISCOVERED'
  | 'UNSUPPORTED_CHECK'
  | 'EXTERNAL_DECISION_REQUIRED'
  | 'CHECK_EVALUATION_FAILED';

export type UnknownResolutionAction =
  | 'DECLARE_PURPOSE'
  | 'RUN_FRESH_SCAN'
  | 'RETRY_PROBE'
  | 'SUPPLY_SELECTOR'
  | 'CONNECT_PROVIDER'
  | 'REVIEW_MANUALLY'
  | 'NOT_CURRENTLY_OBSERVABLE';

export interface UnknownResolution {
  reason: UnknownReason;
  explanation: string;
  action: UnknownResolutionAction;
  actionLabel: string;
  blocking: boolean;
}

export interface RuleEvaluationFailure {
  code: 'RULE_EXECUTION_FAILED' | 'INVALID_CONTEXT' | 'EVALUATION_TIMEOUT';
  ruleId: string;
  message: string;
  status: 'UNKNOWN';
  unknown: UnknownResolution;
}

export interface EvaluationCoverage {
  state: 'COMPLETE' | 'PARTIAL';
  errors: RuleEvaluationFailure[];
}

export interface AuthoritativeEvidenceCoverage {
  state: 'VERIFIED' | 'UNKNOWN' | 'NOT_REQUESTED';
  nameservers: string[];
  unknown?: UnknownResolution;
}

/**
 * Historical snapshots did not persist evaluation coverage. Absence must remain
 * actionable UNKNOWN rather than inheriting a green state from a ruleset ID.
 */
export function evaluationCoverageOrUnknown(
  coverage: EvaluationCoverage | null | undefined
): EvaluationCoverage {
  if (coverage) return coverage;

  return {
    state: 'PARTIAL',
    errors: [
      {
        code: 'INVALID_CONTEXT',
        ruleId: 'ruleset',
        message: 'Rule evaluation coverage was not recorded',
        status: 'UNKNOWN',
        unknown: {
          reason: 'EVIDENCE_STALE',
          explanation: 'This snapshot predates explicit rule-evaluation coverage evidence.',
          action: 'RUN_FRESH_SCAN',
          actionLabel: 'Run a fresh scan',
          blocking: true,
        },
      },
    ],
  };
}

export function isEvaluationComplete(coverage: EvaluationCoverage | null | undefined): boolean {
  return evaluationCoverageOrUnknown(coverage).state === 'COMPLETE';
}
