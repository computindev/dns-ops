/**
 * Pasted Evidence Routes (Issue #56)
 *
 * POST /api/paste/findings — evaluate operator-pasted dig output or an
 * RFC5322 bounce/report header block through the SAME ruleset a snapshot
 * uses and return the findings immediately, marked as pasted evidence that
 * was not collected. Nothing is persisted: no snapshot, observations,
 * record sets, or findings rows are written.
 */

import type { NewFinding, NewSuggestion } from '@dns-ops/db/schema';
import {
  authResultsToFindings,
  detectPasteKind,
  parseBounceHeaders,
  parseDigOutput,
} from '@dns-ops/parsing';
import { type RuleContext, RulesEngine } from '@dns-ops/rules';
import { type Context, Hono } from 'hono';
import { requireAuth } from '../middleware/authorization.js';
import { requiredString, validateBody, validationErrorResponse } from '../middleware/validation.js';
import type { Env } from '../types.js';
import { createCombinedRuleset } from './findings.js';

export const pasteRoutes = new Hono<Env>();

const MAX_PASTE_LENGTH = 100_000;

pasteRoutes.post('/findings', requireAuth, async (c) => {
  const validation = await validateBody(c, {
    domain: requiredString('domain', { minLength: 1, maxLength: 253 }),
    content: requiredString('content', { minLength: 1, maxLength: MAX_PASTE_LENGTH }),
    vantageType: (value: unknown) => {
      if (value === undefined || value === null) return undefined;
      if (
        value !== 'public-recursive' &&
        value !== 'authoritative' &&
        value !== 'parent-zone' &&
        value !== 'probe'
      ) {
        throw new Error(
          'vantageType must be one of: public-recursive, authoritative, parent-zone, probe'
        );
      }
      return value;
    },
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const domain = validation.data.domain.trim().toLowerCase();
  const content = validation.data.content;
  const kind = detectPasteKind(content);

  if (kind === 'unknown') {
    return c.json({ error: 'Paste did not look like dig output or an RFC5322 header block' }, 422);
  }

  const ruleset = createCombinedRuleset();
  const engine = new RulesEngine(ruleset);

  if (kind === 'bounce-header') {
    const parsed = parseBounceHeaders(content);
    const findings = authResultsToFindings(parsed.authResults);
    return respondPasted(c, {
      kind,
      domain,
      findings,
      suggestions: [],
      rulesEvaluated: 0,
      evaluationCoverage: null,
      parse: {
        headerCount: Object.keys(parsed.headers).length,
        authenticationResults: parsed.authResults.map(
          (ar) => `${ar.method}=${ar.result}${ar.domain ? ` (${ar.domain})` : ''}`
        ),
        receivedHosts: parsed.receivedHosts,
      },
    });
  }

  // dig paste: run the real ruleset over the parsed records.
  const parsed = parseDigOutput(content, { vantageType: validation.data.vantageType });

  const context: RuleContext = {
    snapshotId: parsed.observations[0]?.snapshotId ?? '00000000-0000-4000-8000-000000000000',
    domainId: '00000000-0000-4000-8000-000000000001',
    domainName: domain,
    zoneManagement: 'unknown',
    observations: parsed.observations,
    recordSets: parsed.recordSets,
    rulesetVersion: ruleset.version,
  };

  const { findings, suggestions, errors, complete } = engine.evaluate(context);
  const evaluationCoverage = {
    state: complete ? ('COMPLETE' as const) : ('PARTIAL' as const),
    errors,
  };

  return respondPasted(c, {
    kind,
    domain,
    findings,
    suggestions,
    rulesEvaluated: engine.getEnabledRulesCount(),
    evaluationCoverage,
    parse: parsed.parse,
  });
});

function respondPasted(
  c: Context<Env>,
  payload: {
    kind: string;
    domain: string;
    findings: NewFinding[];
    suggestions: NewSuggestion[];
    rulesEvaluated: number;
    evaluationCoverage: unknown;
    parse: unknown;
  }
) {
  return c.json({
    evidenceSource: 'pasted',
    collected: false,
    kind: payload.kind,
    domain: payload.domain,
    rulesetVersion: null,
    rulesEvaluated: payload.rulesEvaluated,
    evaluationCoverage: payload.evaluationCoverage,
    parse: payload.parse,
    summary: {
      totalFindings: payload.findings.length,
      suggestions: payload.suggestions.length,
    },
    findings: payload.findings,
    suggestions: payload.suggestions,
  });
}
