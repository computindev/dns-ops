import type { FindingsSummaryResponse } from '@dns-ops/contracts/responses';
import type { Snapshot } from '@dns-ops/db/schema';
import { describe, expect, it } from 'vitest';
import {
  deduplicateSetup,
  isCurrentEvidence,
  isEvidenceComplete,
  unknownForEvidence,
} from './DomainEvidencePanel.js';

const completeSnapshot = {
  resultState: 'complete',
  metadata: {},
} as Snapshot;

const summary = (overrides: Partial<FindingsSummaryResponse> = {}): FindingsSummaryResponse => ({
  snapshotId: 'snapshot-1',
  findingsEvaluated: true,
  evaluationCoverage: { state: 'COMPLETE', errors: [] },
  hasFindings: false,
  severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  total: 0,
  ...overrides,
});

describe('DomainEvidencePanel evidence classification', () => {
  it('deduplicates repeated setup actions', () => {
    const setup = {
      reason: 'PURPOSE_UNDECLARED',
      explanation: 'Declare purpose first.',
      action: 'DECLARE_PURPOSE',
      actionLabel: 'Declare domain purpose',
    };
    expect(deduplicateSetup([setup, { ...setup }])).toEqual([setup]);
  });

  it('places metadata-light UNKNOWN evidence in setup with a fresh-scan action', () => {
    expect(
      unknownForEvidence({
        id: 'probe-unknown',
        probeType: 'http',
        status: 'error',
        success: false,
        errorMessage: null,
        probeData: { status: 'UNKNOWN' },
      })
    ).toMatchObject({ reason: 'EVIDENCE_STALE', action: 'RUN_FRESH_SCAN' });
  });

  it('places stale and unbaselined TLS evidence in setup rather than current evidence', () => {
    const stale = {
      id: 'probe-stale',
      probeType: 'tls_cert',
      status: 'success',
      success: true,
      errorMessage: null,
      freshness: 'STALE' as const,
      probeData: { status: 'OBSERVED' as const },
    };
    const missing = { ...stale, freshness: 'MISSING_BASELINE' as const };
    expect(unknownForEvidence(stale)).toMatchObject({
      reason: 'EVIDENCE_STALE',
      action: 'RUN_FRESH_SCAN',
    });
    expect(unknownForEvidence(missing)).toMatchObject({
      reason: 'MISSING_BASELINE',
      action: 'ACCEPT_BASELINE',
    });
    expect(isCurrentEvidence(stale)).toBe(false);
    expect(isCurrentEvidence(missing)).toBe(false);
  });

  it('never classifies an UNKNOWN payload as current evidence', () => {
    expect(
      isCurrentEvidence({
        id: 'probe-1',
        probeType: 'http',
        status: 'success',
        success: true,
        errorMessage: null,
        probeData: { status: 'UNKNOWN' },
      })
    ).toBe(false);
    expect(
      isCurrentEvidence({
        id: 'probe-2',
        probeType: 'http',
        status: 'success',
        success: true,
        errorMessage: null,
        probeData: { status: 'OBSERVED' },
      })
    ).toBe(true);
  });

  it('keeps partial evaluation plus zero findings UNKNOWN', () => {
    expect(
      isEvidenceComplete({
        snapshot: completeSnapshot,
        findingsSummary: summary({
          findingsEvaluated: false,
          evaluationCoverage: { state: 'PARTIAL', errors: [] },
        }),
        setup: [],
      })
    ).toBe(false);
  });

  it('allows a complete zero-finding result to be healthy', () => {
    expect(
      isEvidenceComplete({ snapshot: completeSnapshot, findingsSummary: summary(), setup: [] })
    ).toBe(true);
  });

  it('keeps complete evaluation UNKNOWN when external setup has a gap', () => {
    expect(
      isEvidenceComplete({
        snapshot: completeSnapshot,
        findingsSummary: summary(),
        setup: [
          {
            reason: 'MISSING_BASELINE',
            explanation: 'Accept a baseline first.',
            action: 'ACCEPT_BASELINE',
            actionLabel: 'Accept baseline',
          },
        ],
      })
    ).toBe(false);
  });

  it('keeps an unavailable findings summary UNKNOWN instead of treating it as zero', () => {
    expect(
      isEvidenceComplete({ snapshot: completeSnapshot, findingsSummary: null, setup: [] })
    ).toBe(false);
    expect(
      isEvidenceComplete({ snapshot: completeSnapshot, findingsSummary: undefined, setup: [] })
    ).toBe(false);
  });
});
