/**
 * Unit tests for remaining-TTL estimation from persisted observations.
 *
 * Fake clock: every assertion passes `now` explicitly, so boundary behavior
 * (1 ms before / exact / 1 ms after the deadline) is deterministic.
 */
import type { DNSRecord, Observation } from '@dns-ops/db/schema';
import { describe, expect, it } from 'vitest';
import {
  estimateLiveAt,
  formatLiveAt,
  indexObservationsById,
  toDateTimeAttribute,
} from './dns-ttl.js';

const T0 = Date.parse('2024-06-01T12:00:00Z');

function answer(overrides: Partial<DNSRecord> = {}): DNSRecord {
  return { name: 'example.com', type: 'A', ttl: 300, data: '93.184.216.34', ...overrides };
}

function observation(
  overrides: Partial<Omit<Observation, 'queriedAt'>> & { queriedAt?: Date | string } = {}
): Observation {
  return {
    id: 'obs-1',
    snapshotId: 'snap-1',
    queryName: 'example.com',
    queryType: 'A',
    vantageType: 'public-recursive',
    vantageIdentifier: '8.8.8.8',
    status: 'success',
    queriedAt: new Date(T0).toISOString(),
    answerSection: [answer()],
    ...overrides,
  } as Observation;
}

function record(
  overrides: Partial<{ name: string; type: string; sourceObservationIds: string[] }> = {}
) {
  return { name: 'example.com', type: 'A', sourceObservationIds: ['obs-1'], ...overrides };
}

function estimate(rec: ReturnType<typeof record>, observations: Observation[], now: number) {
  return estimateLiveAt(rec, indexObservationsById(observations), now);
}

describe('estimateLiveAt — fresh evidence', () => {
  it('derives the deadline from queriedAt + ttl and reports remaining seconds', () => {
    const result = estimate(record(), [observation()], T0);
    expect(result).toEqual({
      state: 'live',
      deadline: T0 + 300_000,
      remainingSeconds: 300,
    });
  });

  it('matches owner names case-insensitively and ignores the trailing dot', () => {
    const obs = observation({ answerSection: [answer({ name: 'Example.COM.' })] });
    const result = estimate(record({ name: 'example.com' }), [obs], T0);
    expect(result.state).toBe('live');
  });
});

describe('estimateLiveAt — boundaries', () => {
  it('reports 1 one millisecond before the deadline', () => {
    const result = estimate(record(), [observation()], T0 + 300_000 - 1);
    expect(result).toMatchObject({ state: 'live', remainingSeconds: 1 });
  });

  it('reports a valid 0 exactly at the deadline', () => {
    const result = estimate(record(), [observation()], T0 + 300_000);
    expect(result).toMatchObject({ state: 'live', remainingSeconds: 0 });
  });

  it('is stale (UNKNOWN) one millisecond after the deadline', () => {
    const result = estimate(record(), [observation()], T0 + 300_000 + 1);
    expect(result).toEqual({ state: 'stale', deadline: T0 + 300_000 });
  });
});

describe('estimateLiveAt — zero TTL is evidence, not missing data', () => {
  it('is a valid zero exactly at queriedAt', () => {
    const obs = observation({ answerSection: [answer({ ttl: 0 })] });
    const result = estimate(record(), [obs], T0);
    expect(result).toMatchObject({ state: 'live', remainingSeconds: 0, deadline: T0 });
  });

  it('becomes stale immediately after queriedAt', () => {
    const obs = observation({ answerSection: [answer({ ttl: 0 })] });
    const result = estimate(record(), [obs], T0 + 1);
    expect(result.state).toBe('stale');
  });
});

describe('estimateLiveAt — trust rules', () => {
  it('is unknown when the matching answer carries no TTL', () => {
    const obs = observation({ answerSection: [answer({ ttl: undefined as unknown as number })] });
    expect(estimate(record(), [obs], T0).state).toBe('unknown');
  });

  it('is unknown for negative or non-integer TTLs', () => {
    const negative = observation({ answerSection: [answer({ ttl: -1 })] });
    expect(estimate(record(), [negative], T0).state).toBe('unknown');

    const fractional = observation({ answerSection: [answer({ ttl: 1.5 })] });
    expect(estimate(record(), [fractional], T0).state).toBe('unknown');
  });

  it('is unknown for an invalid or future-dated queriedAt', () => {
    const invalid = observation({ queriedAt: 'not-a-date' });
    expect(estimate(record(), [invalid], T0).state).toBe('unknown');

    const future = observation({ queriedAt: new Date(T0 + 60_000).toISOString() });
    expect(estimate(record(), [future], T0).state).toBe('unknown');
  });

  it('is unknown for failed observations and authoritative-only evidence', () => {
    const failed = observation({ status: 'timeout' });
    expect(estimate(record(), [failed], T0).state).toBe('unknown');

    const authoritative = observation({ vantageType: 'authoritative' });
    expect(estimate(record(), [authoritative], T0).state).toBe('unknown');
  });

  it('is unknown when answers do not match the row owner name or RR type', () => {
    const otherOwner = observation({ answerSection: [answer({ name: 'www.example.com' })] });
    expect(estimate(record(), [otherOwner], T0).state).toBe('unknown');

    const otherType = observation({ answerSection: [answer({ type: 'AAAA' })] });
    expect(estimate(record(), [otherType], T0).state).toBe('unknown');
  });

  it('is unknown when source observation ids reference nothing', () => {
    expect(estimate(record({ sourceObservationIds: ['missing'] }), [], T0).state).toBe('unknown');
  });
});

describe('estimateLiveAt — aggregation', () => {
  it('selects the latest valid deadline across recursive sources', () => {
    const early = observation({ id: 'obs-early', queriedAt: new Date(T0 - 60_000).toISOString() });
    const late = observation({
      id: 'obs-late',
      vantageIdentifier: '1.1.1.1',
      queriedAt: new Date(T0 - 10_000).toISOString(),
    });
    const result = estimate(
      record({ sourceObservationIds: ['obs-early', 'obs-late'] }),
      [early, late],
      T0
    );
    expect(result).toMatchObject({ state: 'live', deadline: T0 - 10_000 + 300_000 });
  });

  it('never falls back to the synthesized record TTL', () => {
    // record.ttl is averaged across vantages and fabricates 0 for missing
    // data; the estimate must come from evidence only. Pass a NormalizedRecord
    // with a misleading ttl and assert the evidence deadline wins.
    const rec = { ...record(), ttl: 9_999, values: ['93.184.216.34'] };
    const result = estimate(rec, [observation()], T0);
    expect(result).toMatchObject({ deadline: T0 + 300_000 });
  });
});

describe('estimateLiveAt — deadline overflow', () => {
  it('is unknown for a finite TTL whose deadline exceeds the Date range', () => {
    const obs = observation({ answerSection: [answer({ ttl: Number.MAX_SAFE_INTEGER })] });
    expect(estimate(record(), [obs], T0).state).toBe('unknown');
  });

  it('is unknown when ttl × 1000 overflows to Infinity', () => {
    const obs = observation({ answerSection: [answer({ ttl: 1e306 })] });
    expect(estimate(record(), [obs], T0).state).toBe('unknown');
  });

  it('still accepts the largest in-range deadline', () => {
    // T0 + ttl × 1000 lands exactly on 8.64e15 ms, the maximum Date value.
    const maxTtl = (8.64e15 - T0) / 1000;
    const obs = observation({ answerSection: [answer({ ttl: maxTtl })] });
    const result = estimate(record(), [obs], T0);
    expect(result.state).toBe('live');
    if (result.state !== 'live') throw new Error(`expected live, got ${result.state}`);
    expect(result.deadline).toBe(8.64e15);
    expect(() => toDateTimeAttribute(result.deadline)).not.toThrow();
  });

  it('is unknown one second beyond the largest in-range deadline', () => {
    const obs = observation({ answerSection: [answer({ ttl: (8.64e15 - T0) / 1000 + 1 })] });
    expect(estimate(record(), [obs], T0).state).toBe('unknown');
  });
});

describe('formatting helpers', () => {
  it('renders a machine-readable ISO datetime attribute', () => {
    expect(toDateTimeAttribute(T0)).toBe('2024-06-01T12:00:00.000Z');
  });

  it('formats the deadline with Intl.DateTimeFormat', () => {
    // Locale varies; assert a date-only stable shape via en-CA-like output is
    // not possible portably, so assert it contains the formatted pieces.
    const formatted = formatLiveAt(T0);
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toContain('Invalid');
  });
});
