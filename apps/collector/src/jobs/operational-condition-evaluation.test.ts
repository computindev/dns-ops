import { describe, expect, it } from 'vitest';
import { evaluateOperationalConditions } from './operational-condition-evaluation.js';

const now = new Date('2026-07-28T12:00:00.000Z');
const tlsBaseline = {
  tenantId: 'tenant-1',
  domainId: 'domain-1',
  kind: 'TLS_CERTIFICATE_REGRESSION' as const,
  discriminator: 'www.example.com:443',
  maxEvidenceAgeSeconds: 300,
  policy: {
    kind: 'TLS_CERTIFICATE' as const,
    requireHostnameAuthorized: true,
    requireChainAuthorized: true,
    minimumRemainingValiditySeconds: 86_400,
  },
};
const tlsProbe = (probedAt = now, overrides = {}) => ({
  success: true,
  probedAt,
  probeData: {
    check: 'TLS_CERTIFICATE' as const,
    status: 'OBSERVED' as const,
    evidence: {
      kind: 'TLS_CERTIFICATE' as const,
      hostname: 'www.example.com',
      port: 443,
      hostnameAuthorized: true,
      chainAuthorized: true,
      validTo: '2026-08-01T12:00:00.000Z',
      ...overrides,
    },
  },
});

describe('evaluateOperationalConditions', () => {
  it('classifies stale TLS evidence as setup/evidence and emits no signal', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [tlsBaseline],
      probes: [tlsProbe(new Date(now.getTime() - 301_000))],
      findings: [],
      now,
    });
    expect(result).toEqual({
      observations: [],
      setupEvidence: [
        {
          kind: 'TLS_CERTIFICATE_REGRESSION',
          discriminator: 'www.example.com:443',
          status: 'EVIDENCE_STALE',
          action: 'RUN_FRESH_SCAN',
        },
      ],
    });
  });

  it('emits one stable signal observation for a fresh TLS policy violation', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [tlsBaseline],
      probes: [tlsProbe(now, { hostnameAuthorized: false })],
      findings: [],
      now,
    });
    expect(result.setupEvidence).toEqual([]);
    expect(result.observations).toMatchObject([
      {
        kind: 'TLS_CERTIFICATE_REGRESSION',
        discriminator: 'www.example.com:443',
        conditionKey: 'tenant-1:domain-1:TLS_CERTIFICATE_REGRESSION:www.example.com:443',
        evidence: { hostnameAuthorized: false },
      },
    ]);
  });

  it('only migrates non-review-only no-SPF findings with an explicit SPF baseline', () => {
    const baseline = {
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      kind: 'MAIL_DNS_CONFIGURATION_REGRESSION' as const,
      discriminator: 'spf',
      maxEvidenceAgeSeconds: 3600,
      policy: { kind: 'SPF_PRESENT' as const },
    };
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [baseline],
      probes: [],
      findings: [
        { id: 'finding-1', type: 'mail.no-spf-record', reviewOnly: false },
        { id: 'finding-2', type: 'mail.no-spf-record', reviewOnly: true },
      ],
      now,
    });
    expect(result.observations).toMatchObject([
      {
        kind: 'MAIL_DNS_CONFIGURATION_REGRESSION',
        discriminator: 'spf',
        evidence: { findingId: 'finding-1' },
      },
    ]);
  });

  it('does not infer baselines or make incomplete/unknown evidence operational', () => {
    const noBaseline = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [],
      probes: [tlsProbe(now, { hostnameAuthorized: false })],
      findings: [],
      now,
    });
    const incomplete = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: false,
      baselines: [tlsBaseline],
      probes: [tlsProbe(now, { hostnameAuthorized: false })],
      findings: [],
      now,
    });
    const unknown = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [tlsBaseline],
      probes: [
        {
          success: false,
          probedAt: now,
          probeData: { check: 'TLS_CERTIFICATE', status: 'UNKNOWN' },
        },
      ],
      findings: [],
      now,
    });
    expect(noBaseline.observations).toEqual([]);
    expect(incomplete).toEqual({ observations: [], setupEvidence: [] });
    expect(unknown.observations).toEqual([]);
    expect(unknown.setupEvidence[0]?.status).toBe('EVIDENCE_UNAVAILABLE');
  });
});
