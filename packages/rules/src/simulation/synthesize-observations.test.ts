import type { Observation } from '@dns-ops/db';
import { describe, expect, it } from 'vitest';

import type { ProposedChange } from './index.js';
import { synthesizeObservations } from './index.js';

/**
 * Regression coverage for the canonical `observations` row shape.
 *
 * `synthesizeObservations` previously built the projected observation with
 * field names that do not exist on the schema (`vantage`, `vantageId`,
 * `timestamp`, `createdAt`, `queryDurationMs`, `answers`) and silenced the
 * mismatch with `as unknown as Observation`. These tests pin the REAL field
 * names so the cast cannot come back.
 */

const SNAPSHOT_ID = 'snap-00000000-0000-4000-8000-000000000000';

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-existing',
    snapshotId: SNAPSHOT_ID,
    queryName: 'example.com',
    queryType: 'TXT',
    vantageType: 'public-recursive',
    vantageIdentifier: '8.8.8.8',
    status: 'success',
    queriedAt: new Date('2026-01-01T00:00:00.000Z'),
    responseTimeMs: 12,
    responseCode: 0,
    flags: null,
    answerSection: null,
    authoritySection: null,
    additionalSection: null,
    errorMessage: null,
    errorDetails: null,
    rawResponse: null,
    ...overrides,
  };
}

const addChange = (name: string, type: string, proposedValues: string[]): ProposedChange => ({
  action: 'add',
  name,
  type,
  currentValues: [],
  proposedValues,
  rationale: 'simulated record',
  findingType: 'test-finding',
  risk: 'low',
});

describe('synthesizeObservations', () => {
  it('synthesizes an observation using the canonical schema field names', () => {
    const change = addChange('example.com', 'TXT', ['"v=spf1 -all"']);

    const [obs] = synthesizeObservations([], [change], 'example.com', SNAPSHOT_ID);

    // Success precondition (must hold before any absence assertions).
    expect(obs).toBeDefined();
    expect(obs.status).toBe('success');

    // Canonical field names from the `observations` table.
    expect(obs.snapshotId).toBe(SNAPSHOT_ID);
    expect(obs.queryName).toBe('example.com');
    expect(obs.queryType).toBe('TXT');
    expect(obs.vantageType).toBe('public-recursive');
    expect(obs.vantageIdentifier).toBe('simulation');
    expect(obs.responseTimeMs).toBe(0);
    expect(obs.responseCode).toBe(0);
    expect(obs.queriedAt).toBeInstanceOf(Date);
    expect(obs.answerSection).toEqual([
      { name: 'example.com', type: 'TXT', ttl: 300, data: '"v=spf1 -all"' },
    ]);
    expect(obs.authoritySection).toBeNull();
    expect(obs.additionalSection).toBeNull();
    expect(obs.errorMessage).toBeNull();

    // Drifted field names must NOT be present (the cast used to hide these).
    expect('vantage' in obs).toBe(false);
    expect('vantageId' in obs).toBe(false);
    expect('timestamp' in obs).toBe(false);
    expect('createdAt' in obs).toBe(false);
    expect('queryDurationMs' in obs).toBe(false);
    expect('answers' in obs).toBe(false);
  });

  it('skips adding when a successful observation with answers already exists', () => {
    const existing = makeObservation({
      queryName: 'example.com',
      queryType: 'TXT',
      answerSection: [{ name: 'example.com', type: 'TXT', ttl: 300, data: '"v=spf1 -all"' }],
    });
    const change = addChange('example.com', 'TXT', ['"v=spf1 include:mail.example.com -all"']);

    const result = synthesizeObservations([existing], [change], 'example.com', SNAPSHOT_ID);

    expect(result).toHaveLength(1);
    // Untouched: the existing answer is retained.
    expect(result[0]?.id).toBe('obs-existing');
    expect(result[0]?.answerSection?.[0]?.data).toBe('"v=spf1 -all"');
  });

  it('replaces the existing observation on a modify action', () => {
    const existing = makeObservation({
      queryName: 'example.com',
      queryType: 'TXT',
      answerSection: [{ name: 'example.com', type: 'TXT', ttl: 300, data: '"v=spf1 -all"' }],
    });
    const change: ProposedChange = {
      ...addChange('example.com', 'TXT', ['"v=spf1 include:mail.example.com -all"']),
      action: 'modify',
    };

    const result = synthesizeObservations([existing], [change], 'example.com', SNAPSHOT_ID);

    // Existing removed, synthesized one takes over.
    expect(result).toHaveLength(1);
    expect(result[0]?.id).not.toBe('obs-existing');
    expect(result[0]?.vantageIdentifier).toBe('simulation');
    expect(result[0]?.answerSection?.[0]?.data).toBe('"v=spf1 include:mail.example.com -all"');
  });
});
