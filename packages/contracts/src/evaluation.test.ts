import { describe, expect, it } from 'vitest';
import { evaluationCoverageOrUnknown, isEvaluationComplete } from './evaluation.js';

describe('evaluation coverage compatibility', () => {
  it('treats missing historical coverage as actionable UNKNOWN', () => {
    const coverage = evaluationCoverageOrUnknown(undefined);

    expect(coverage.state).toBe('PARTIAL');
    expect(coverage.errors[0]).toMatchObject({
      status: 'UNKNOWN',
      unknown: {
        reason: 'EVIDENCE_STALE',
        action: 'RUN_FRESH_SCAN',
        blocking: true,
      },
    });
    expect(isEvaluationComplete(undefined)).toBe(false);
  });

  it('recognizes only explicit complete coverage as complete', () => {
    expect(isEvaluationComplete({ state: 'COMPLETE', errors: [] })).toBe(true);
    expect(isEvaluationComplete({ state: 'PARTIAL', errors: [] })).toBe(false);
  });
});
