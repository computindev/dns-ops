import { describe, expect, it } from 'vitest';
import { deduplicateSetup, isCurrentEvidence, unknownForEvidence } from './DomainEvidencePanel.js';

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
});
