import { describe, expect, it } from 'vitest';
import { type RuleContext, RulesEngine, type Ruleset } from './index.js';

const context: RuleContext = {
  snapshotId: 'snapshot-1',
  domainId: 'domain-1',
  domainName: 'example.com',
  zoneManagement: 'managed',
  observations: [],
  recordSets: [],
  rulesetVersion: 'test-1',
};

function rulesetWith(evaluate: Ruleset['rules'][number]['evaluate']): Ruleset {
  return {
    id: 'test-ruleset',
    version: 'test-1',
    name: 'Test ruleset',
    description: 'Deterministic engine test',
    createdAt: new Date('2026-07-28T00:00:00Z'),
    rules: [
      {
        id: 'test.throwing-rule',
        name: 'Throwing rule',
        description: 'Throws intentionally',
        version: '1.0.0',
        enabled: true,
        evaluate,
      },
    ],
  };
}

describe('RulesEngine evaluation completeness', () => {
  it('FIX-01: reports a throwing rule as explicit UNKNOWN instead of a clean result', () => {
    const engine = new RulesEngine(
      rulesetWith(() => {
        throw new Error('intentional fixture failure');
      })
    );

    const result = engine.evaluate(context);

    expect(result.findings).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'RULE_EXECUTION_FAILED',
        ruleId: 'test.throwing-rule',
        status: 'UNKNOWN',
        unknown: expect.objectContaining({
          reason: 'CHECK_EVALUATION_FAILED',
          action: 'RUN_FRESH_SCAN',
          blocking: true,
        }),
      }),
    ]);
  });

  it('reports a successful no-finding evaluation as complete', () => {
    const engine = new RulesEngine(rulesetWith(() => null));

    const result = engine.evaluate(context);

    expect(result.findings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.complete).toBe(true);
  });
});
