/**
 * DNS Rules Tests - TDD/BDD
 *
 * Tests for the initial DNS rules pack:
 * 1. Authoritative lookup failures/timeouts
 * 2. Mismatch across authoritative servers
 * 3. Recursive vs authoritative mismatch
 * 4. CNAME coexistence conflict
 * 5. Partial coverage finding for unmanaged zones
 */

import type { Observation, RecordSet } from '@dns-ops/db/schema';
import { describe, expect, it } from 'vitest';
import { type RuleContext, RulesEngine, type Ruleset } from '../engine/index.js';
import {
  authoritativeFailureRule,
  authoritativeMismatchRule,
  cnameCoexistenceRule,
  recursiveAuthoritativeMismatchRule,
  unmanagedZonePartialCoverageRule,
} from './rules.js';

// Test helpers
function createMockObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    snapshotId: 'snap-1',
    queryName: 'example.com',
    queryType: 'A',
    vantageType: 'authoritative',
    vantageIdentifier: 'ns1.example.com',
    status: 'success',
    queriedAt: new Date(),
    responseTimeMs: 100,
    responseCode: 0,
    flags: null,
    answerSection: [],
    authoritySection: [],
    additionalSection: [],
    errorMessage: null,
    errorDetails: null,
    rawResponse: null,
    vantageId: null,
    ...overrides,
  };
}

function createMockRecordSet(overrides: Partial<RecordSet> = {}): RecordSet {
  return {
    id: 'rs-1',
    snapshotId: 'snap-1',
    name: 'example.com',
    type: 'A',
    ttl: 300,
    values: ['192.0.2.1'],
    sourceObservationIds: ['obs-1'],
    sourceVantages: ['ns1.example.com'],
    isConsistent: true,
    consolidationNotes: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    snapshotId: 'snap-1',
    domainId: 'domain-1',
    domainName: 'example.com',
    zoneManagement: 'managed',
    observations: [],
    recordSets: [],
    rulesetVersion: '1.0.0',
    ...overrides,
  };
}

describe('Authoritative Failure Rule', () => {
  it('should detect timeout from authoritative server', () => {
    const obs = createMockObservation({
      status: 'timeout',
      vantageType: 'authoritative',
      errorMessage: 'Query timed out',
    });
    const context = createMockContext({ observations: [obs] });

    const result = authoritativeFailureRule.evaluate(context)[0] ?? null;

    expect(result).not.toBeNull();
    expect(result?.finding).toBeDefined();
    expect(result?.finding?.severity).toBe('high');
    expect(result?.finding?.type).toBe('dns.authoritative-timeout');
  });

  it('should detect refusal from authoritative server', () => {
    const obs = createMockObservation({
      status: 'refused',
      vantageType: 'authoritative',
      errorMessage: 'Query refused',
    });
    const context = createMockContext({ observations: [obs] });

    const result = authoritativeFailureRule.evaluate(context)[0] ?? null;

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('dns.authoritative-refused');
  });

  it('should not flag successful queries', () => {
    const obs = createMockObservation({
      status: 'success',
      vantageType: 'authoritative',
    });
    const context = createMockContext({ observations: [obs] });

    const result = authoritativeFailureRule.evaluate(context)[0] ?? null;

    expect(result).toBeNull();
  });

  it('should not flag recursive vantage failures', () => {
    const obs = createMockObservation({
      status: 'timeout',
      vantageType: 'public-recursive',
    });
    const context = createMockContext({ observations: [obs] });

    const result = authoritativeFailureRule.evaluate(context)[0] ?? null;

    expect(result).toBeNull();
  });
});

describe('Authoritative Mismatch Rule', () => {
  it('should detect inconsistent values across authoritative servers', () => {
    const obs = createMockObservation({
      status: 'success',
      vantageType: 'authoritative',
      vantageIdentifier: 'ns1.example.com',
      answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
    });
    const obs2 = createMockObservation({
      id: 'obs-2',
      status: 'success',
      vantageType: 'authoritative',
      vantageIdentifier: 'ns2.example.com',
      answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.2' }],
    });

    const rs = createMockRecordSet({
      isConsistent: false,
      consolidationNotes: 'Values differ across vantages',
      sourceVantages: ['ns1.example.com', 'ns2.example.com'],
    });

    const context = createMockContext({
      observations: [obs, obs2],
      recordSets: [rs],
    });

    const result = authoritativeMismatchRule.evaluate(context)[0] ?? null;

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('dns.authoritative-mismatch');
    expect(result?.finding?.severity).toBe('critical');
  });

  it('should not flag consistent record sets', () => {
    const rs = createMockRecordSet({
      isConsistent: true,
    });

    const context = createMockContext({ recordSets: [rs] });

    const result = authoritativeMismatchRule.evaluate(context)[0] ?? null;

    expect(result).toBeNull();
  });
});

describe('Recursive vs Authoritative Mismatch Rule', () => {
  it('should detect when recursive and authoritative disagree', () => {
    const recursiveObs = createMockObservation({
      status: 'success',
      vantageType: 'public-recursive',
      vantageIdentifier: '8.8.8.8',
      answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
    });
    const authObs = createMockObservation({
      id: 'obs-2',
      status: 'success',
      vantageType: 'authoritative',
      vantageIdentifier: 'ns1.example.com',
      answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.99' }],
    });

    const rs = createMockRecordSet({
      name: 'example.com',
      type: 'A',
      values: ['192.0.2.1', '192.0.2.99'],
    });

    const context = createMockContext({
      observations: [recursiveObs, authObs],
      recordSets: [rs],
    });

    const result = recursiveAuthoritativeMismatchRule.evaluate(context)[0] ?? null;

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('dns.recursive-authoritative-mismatch');
  });

  it('should not flag when values match', () => {
    const recursiveObs = createMockObservation({
      status: 'success',
      vantageType: 'public-recursive',
      answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
    });
    const authObs = createMockObservation({
      id: 'obs-2',
      status: 'success',
      vantageType: 'authoritative',
      answerSection: [{ name: 'example.com', type: 'A', ttl: 300, data: '192.0.2.1' }],
    });

    const rs = createMockRecordSet({
      name: 'example.com',
      type: 'A',
      values: ['192.0.2.1'],
    });

    const context = createMockContext({
      observations: [recursiveObs, authObs],
      recordSets: [rs],
    });

    const result = recursiveAuthoritativeMismatchRule.evaluate(context)[0] ?? null;

    expect(result).toBeNull();
  });
});

describe('CNAME Coexistence Rule', () => {
  it('should detect CNAME with other records at same name', () => {
    const cnameRs = createMockRecordSet({
      name: 'www.example.com',
      type: 'CNAME',
      values: ['example.com.'],
    });
    const aRs = createMockRecordSet({
      id: 'rs-2',
      name: 'www.example.com',
      type: 'A',
      values: ['192.0.2.1'],
    });

    const context = createMockContext({
      recordSets: [cnameRs, aRs],
    });

    const result = cnameCoexistenceRule.evaluate(context)[0] ?? null;

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('dns.cname-coexistence-conflict');
    expect(result?.finding?.severity).toBe('critical');
  });

  it('should allow CNAME to coexist only with RRSIG and NSEC', () => {
    const cnameRs = createMockRecordSet({
      name: 'www.example.com',
      type: 'CNAME',
      values: ['example.com.'],
    });
    const rrsigRs = createMockRecordSet({
      id: 'rs-2',
      name: 'www.example.com',
      type: 'RRSIG',
      values: ['some-signature'],
    });

    const context = createMockContext({
      recordSets: [cnameRs, rrsigRs],
    });

    const result = cnameCoexistenceRule.evaluate(context)[0] ?? null;

    // RRSIG and NSEC are allowed with CNAME (DNSSEC records)
    expect(result).toBeNull();
  });

  it('should not flag when only CNAME exists', () => {
    const cnameRs = createMockRecordSet({
      name: 'www.example.com',
      type: 'CNAME',
      values: ['example.com.'],
    });

    const context = createMockContext({
      recordSets: [cnameRs],
    });

    const result = cnameCoexistenceRule.evaluate(context)[0] ?? null;

    expect(result).toBeNull();
  });
});

describe('Unmanaged Zone Partial Coverage Rule', () => {
  it('should flag unmanaged zones as partial coverage', () => {
    const context = createMockContext({
      zoneManagement: 'unmanaged',
      observations: [createMockObservation({ queryName: 'example.com', queryType: 'A' })],
    });

    const result = unmanagedZonePartialCoverageRule.evaluate(context)[0] ?? null;

    expect(result).not.toBeNull();
    expect(result?.finding?.type).toBe('dns.partial-coverage-unmanaged');
    expect(result?.finding?.severity).toBe('info');
  });

  it('should not flag managed zones', () => {
    const context = createMockContext({
      zoneManagement: 'managed',
    });

    const result = unmanagedZonePartialCoverageRule.evaluate(context)[0] ?? null;

    expect(result).toBeNull();
  });

  it('should include query scope in finding description', () => {
    const context = createMockContext({
      zoneManagement: 'unmanaged',
      observations: [
        createMockObservation({ queryName: 'example.com', queryType: 'A' }),
        createMockObservation({ id: 'obs-2', queryName: 'example.com', queryType: 'MX' }),
      ],
    });

    const result = unmanagedZonePartialCoverageRule.evaluate(context)[0] ?? null;

    expect(result?.finding?.description).toContain('A');
    expect(result?.finding?.description).toContain('MX');
  });
});

// =============================================================================
// TB-3: Multi-finding rules (one rule surfaces EVERY instance of a problem)
// =============================================================================
//
// Today the engine is one-finding-per-rule: each DNS rule computes the full set
// of problems then throws away all but the first (`return findings[0] || null`).
// TB-3 changes Rule.evaluate to return RuleResult[] so every instance is
// surfaced, disambiguated by a rule-defined subjectKey (query name|type for DNS).
//
// These tests are the acceptance criteria. They FAIL on the old contract.

describe('TB-3: authoritativeFailureRule surfaces every failing query', () => {
  // Minimal ruleset wrapping the single rule under test, for engine-level checks.
  function rulesetWith(rule: typeof authoritativeFailureRule): Ruleset {
    return {
      id: 'tb3-test-ruleset',
      version: '1.0.0',
      name: 'TB-3 test',
      description: '',
      rules: [rule],
      createdAt: new Date(),
    };
  }

  it('emits one RuleResult per failing query name, each with a distinct subjectKey', () => {
    const wwwTimeout = createMockObservation({
      id: 'obs-www',
      queryName: 'www.example.com',
      queryType: 'A',
      status: 'timeout',
      vantageType: 'authoritative',
      vantageIdentifier: 'ns1.example.com',
      errorMessage: 'Query timed out',
    });
    const mailTimeout = createMockObservation({
      id: 'obs-mail',
      queryName: 'mail.example.com',
      queryType: 'A',
      status: 'timeout',
      vantageType: 'authoritative',
      vantageIdentifier: 'ns1.example.com',
      errorMessage: 'Query timed out',
    });
    const context = createMockContext({
      domainName: 'example.com',
      observations: [wwwTimeout, mailTimeout],
    });

    const results = authoritativeFailureRule.evaluate(context);

    // OLD contract returned a single RuleResult (or null); the multi-finding
    // contract must surface BOTH queries.
    expect(results).toHaveLength(2);
    // Each finding is about a distinct subject (lowercased query name|type).
    expect(results.map((r) => r.subjectKey).sort()).toEqual([
      'mail.example.com|A',
      'www.example.com|A',
    ]);
    // Every emitted result carries a finding.
    for (const r of results) {
      expect(r.finding).toBeDefined();
      expect(r.finding?.ruleId).toBe(authoritativeFailureRule.id);
    }
  });

  it('returns [] when there are no authoritative failures (no findings)', () => {
    const ok = createMockObservation({
      status: 'success',
      vantageType: 'authoritative',
    });
    const context = createMockContext({ observations: [ok] });

    const results = authoritativeFailureRule.evaluate(context);

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('flattens multiple results through the engine and stamps subjectKey on each finding', () => {
    const wwwTimeout = createMockObservation({
      id: 'obs-www',
      queryName: 'www.example.com',
      queryType: 'A',
      status: 'timeout',
      vantageType: 'authoritative',
    });
    const mailRefused = createMockObservation({
      id: 'obs-mail',
      queryName: 'mail.example.com',
      queryType: 'A',
      status: 'refused',
      vantageType: 'authoritative',
    });
    const context = createMockContext({
      domainName: 'example.com',
      observations: [wwwTimeout, mailRefused],
    });

    const engine = new RulesEngine(rulesetWith(authoritativeFailureRule));
    const { findings } = engine.evaluate(context);

    // Engine flattens BOTH results — one per failing query.
    expect(findings).toHaveLength(2);
    // Each persisted finding carries the subjectKey from its RuleResult, landing
    // in findings.subject_key (migration 0012).
    expect(findings.map((f) => f.subjectKey).sort()).toEqual([
      'mail.example.com|A',
      'www.example.com|A',
    ]);
  });
});
