import { describe, expect, it } from 'vitest';
import { externalEvidenceToObservation } from './external-evidence-persistence.js';

describe('externalEvidenceToObservation', () => {
  it('persists determined TLS evidence with its typed check and target', () => {
    const observation = externalEvidenceToObservation(
      'snapshot-1',
      {
        status: 'OBSERVED',
        observedAt: '2026-01-01T00:00:00.000Z',
        evidence: {
          kind: 'TLS_CERTIFICATE',
          hostname: 'example.com',
          resolvedAddress: '1.1.1.1',
          port: 443,
          protocol: 'TLSv1.3',
          cipher: 'TLS_AES_256_GCM_SHA384',
          hostnameAuthorized: true,
          chainAuthorized: true,
          subject: 'CN=example.com',
          issuer: 'CN=CA',
          subjectAlternativeNames: ['example.com'],
          validFrom: '2026-01-01T00:00:00.000Z',
          validTo: '2027-01-01T00:00:00.000Z',
          fingerprintSha256: 'AA:BB',
        },
      },
      { check: 'TLS_CERTIFICATE', hostname: 'unused' }
    );

    expect(observation).toMatchObject({
      probeType: 'tls_cert',
      status: 'success',
      success: true,
      hostname: 'example.com',
      probeData: { check: 'TLS_CERTIFICATE', status: 'OBSERVED' },
    });
  });

  it('persists UNKNOWN as an evidence row without promoting it to a signal', () => {
    const observation = externalEvidenceToObservation(
      'snapshot-1',
      {
        status: 'UNKNOWN',
        unknown: {
          reason: 'PROBE_FAILED',
          explanation: 'TLS timed out',
          action: 'RETRY_PROBE',
          actionLabel: 'Retry TLS probe',
          blocking: true,
        },
      },
      { check: 'TLS_CERTIFICATE', hostname: 'example.com', port: 443 }
    );

    expect(observation).toMatchObject({
      probeType: 'tls_cert',
      status: 'error',
      success: false,
      errorMessage: 'TLS timed out',
      probeData: {
        check: 'TLS_CERTIFICATE',
        status: 'UNKNOWN',
        unknown: { action: 'RETRY_PROBE' },
      },
    });
  });

  it('does not persist an explicitly not-applicable check', () => {
    expect(
      externalEvidenceToObservation(
        'snapshot-1',
        { status: 'NOT_APPLICABLE', explanation: 'Mail-only domain' },
        { check: 'HTTP_REACHABILITY', hostname: 'example.com' }
      )
    ).toBeNull();
  });
});
