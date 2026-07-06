/**
 * DNS query concurrency tests.
 *
 * Asserts the NON-NEGOTIABLE boundary pair:
 *   - exactly-at-bound → all run concurrently (allowed)
 *   - above-bound     → never exceeds the bound (queued)
 *   - >1 observed     → queries actually run in parallel (not sequential)
 *
 * Uses a fake resolver that records in-flight count; no real DNS.
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { describe, expect, it } from 'vitest';
import { Semaphore } from '../probes/semaphore.js';
import { collectQueriesConcurrently, DNSCollector, type ResolverLike } from './collector.js';
import type {
  CollectionConfig,
  CollectionError,
  DNSQuery,
  DNSQueryResult,
  VantageInfo,
} from './types.js';

const vantage: VantageInfo = { type: 'public-recursive', identifier: '8.8.8.8' };

const UNIFORM_FLAGS = { aa: false, tc: false, rd: true, ra: true, ad: false, cd: false };

function queries(n: number): DNSQuery[] {
  return Array.from({ length: n }, (_, i) => ({ name: `q${i}.example.com`, type: 'A' }));
}

/** Fake resolver that tracks max concurrent in-flight queries. */
function makeTrackingResolver(delayMs = 30): { resolver: ResolverLike; getMax: () => number } {
  let inFlight = 0;
  let maxInFlight = 0;
  const query = async (q: DNSQuery, v: VantageInfo): Promise<DNSQueryResult> => {
    inFlight += 1;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    inFlight -= 1;
    return {
      query: q,
      vantage: v,
      success: true,
      responseCode: 0,
      flags: { ...UNIFORM_FLAGS },
      answers: [],
      authority: [],
      additional: [],
      responseTime: 1,
    };
  };
  return { resolver: { query }, getMax: () => maxInFlight };
}

describe('DNS query concurrency (collectQueriesConcurrently)', () => {
  it('runs more than one query concurrently (not sequential)', async () => {
    const { resolver, getMax } = makeTrackingResolver();
    const errors: CollectionError[] = [];
    const results = await collectQueriesConcurrently(
      resolver,
      queries(4),
      vantage,
      new Semaphore(5),
      errors
    );

    // Live success precondition before trusting the concurrency assertion.
    expect(results).toHaveLength(4);
    expect(errors).toHaveLength(0);
    expect(getMax(), 'must observe >1 concurrent query').toBeGreaterThan(1);
  });

  it('at-bound: exactly `bound` queries all run concurrently (allowed)', async () => {
    const bound = 5;
    const { resolver, getMax } = makeTrackingResolver();
    const results = await collectQueriesConcurrently(
      resolver,
      queries(bound),
      vantage,
      new Semaphore(bound),
      []
    );

    expect(results).toHaveLength(bound);
    expect(getMax(), 'exactly at the bound, nothing queued').toBe(bound);
  });

  it('above-bound: never exceeds the bound (extras queued)', async () => {
    const bound = 3;
    const { resolver, getMax } = makeTrackingResolver();
    const results = await collectQueriesConcurrently(
      resolver,
      queries(bound + 4),
      vantage,
      new Semaphore(bound),
      []
    );

    expect(results).toHaveLength(bound + 4);
    expect(getMax(), 'must never exceed the bound').toBe(bound);
  });

  it('below-bound: runs all concurrently up to the query count', async () => {
    const { resolver, getMax } = makeTrackingResolver();
    const results = await collectQueriesConcurrently(
      resolver,
      queries(2),
      vantage,
      new Semaphore(8),
      []
    );

    expect(results).toHaveLength(2);
    expect(getMax()).toBe(2);
  });

  it('records resolver-thrown errors and still returns the rest', async () => {
    const ok = (q: DNSQuery, v: VantageInfo): DNSQueryResult => ({
      query: q,
      vantage: v,
      success: true,
      responseCode: 0,
      flags: { ...UNIFORM_FLAGS },
      answers: [],
      authority: [],
      additional: [],
      responseTime: 1,
    });
    const resolver: ResolverLike = {
      async query(q, v) {
        if (q.name === 'fail.example.com') throw new Error('boom');
        return ok(q, v);
      },
    };
    const errors: CollectionError[] = [];
    const results = await collectQueriesConcurrently(
      resolver,
      [
        { name: 'a.example.com', type: 'A' },
        { name: 'fail.example.com', type: 'A' },
        { name: 'b.example.com', type: 'A' },
      ],
      vantage,
      new Semaphore(5),
      errors
    );

    expect(results).toHaveLength(2); // thrown query produces no result entry
    expect(errors).toHaveLength(1);
    expect(errors[0].queryName).toBe('fail.example.com');
    expect(errors[0].error).toBe('boom');
  });
});

describe('DNSCollector wiring', () => {
  const baseConfig: CollectionConfig = {
    tenantId: 'tenant-1',
    domain: 'example.com',
    zoneManagement: 'unmanaged',
    recordTypes: ['A'],
    triggeredBy: 'test',
  };

  it('applies queryConcurrency to collectFromVantage via the injected semaphore', async () => {
    const mockDb = {} as IDatabaseAdapter;
    const { resolver, getMax } = makeTrackingResolver();
    const collector = new DNSCollector(baseConfig, mockDb, {
      resolver,
      queryConcurrency: 3,
    });

    const errors: CollectionError[] = [];
    const results = await (
      collector as unknown as {
        collectFromVantage: (
          q: DNSQuery[],
          v: VantageInfo,
          e: CollectionError[]
        ) => Promise<DNSQueryResult[]>;
      }
    ).collectFromVantage(queries(7), vantage, errors);

    expect(results).toHaveLength(7);
    expect(getMax(), 'collector must respect the configured bound').toBe(3);
  });
});
