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

const redirectBaseline = {
  tenantId: 'tenant-1',
  domainId: 'domain-1',
  kind: 'REDIRECT_TOPOLOGY_REGRESSION' as const,
  discriminator: 'https://www.example.com/',
  maxEvidenceAgeSeconds: 300,
  policy: {
    kind: 'REDIRECT_TOPOLOGY' as const,
    startUrl: 'https://www.example.com/',
    expectedFinalUrl: 'https://example.com/',
  },
};

const indexabilityBaseline = {
  tenantId: 'tenant-1',
  domainId: 'domain-1',
  kind: 'HOMEPAGE_INDEXABILITY_REGRESSION' as const,
  discriminator: 'https://example.com/',
  maxEvidenceAgeSeconds: 300,
  policy: {
    kind: 'HOMEPAGE_INDEXABILITY' as const,
    requestedUrl: 'https://example.com/',
    requireIndexable: true,
  },
};

const redirectProbe = (
  probedAt = now,
  overrides: Record<string, unknown> = {},
  dataOverrides: Record<string, unknown> = {}
) => ({
  success: true,
  probedAt,
  probeData: {
    check: 'REDIRECT_TOPOLOGY' as const,
    status: 'OBSERVED' as const,
    evidence: {
      kind: 'HTTP_REDIRECT' as const,
      startUrl: 'https://www.example.com/',
      hops: [
        {
          url: 'https://www.example.com/',
          status: 301,
          location: 'https://example.com/',
          resolvedAddresses: ['1.1.1.1'],
          observedAt: probedAt.toISOString(),
        },
        {
          url: 'https://example.com/',
          status: 200,
          resolvedAddresses: ['1.1.1.1'],
          observedAt: probedAt.toISOString(),
        },
      ],
      finalUrl: 'https://example.com/',
      truncated: false,
      ...overrides,
    },
    ...dataOverrides,
  },
});

const indexabilityProbe = (
  probedAt = now,
  overrides: Record<string, unknown> = {},
  dataOverrides: Record<string, unknown> = {}
) => ({
  success: true,
  probedAt,
  probeData: {
    check: 'HOMEPAGE_INDEXABILITY' as const,
    status: 'OBSERVED' as const,
    evidence: {
      kind: 'HOMEPAGE_INDEXABILITY' as const,
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      responseStatus: 200,
      xRobotsTags: [] as string[],
      metaRobots: [] as string[],
      bodyBytesInspected: 2048,
      bodyTruncated: false,
      ...overrides,
    },
    ...dataOverrides,
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
    expect(result.observations).toEqual([]);
    expect(result.setupEvidence).toEqual([
      {
        kind: 'TLS_CERTIFICATE_REGRESSION',
        discriminator: 'www.example.com:443',
        status: 'EVIDENCE_STALE',
        action: 'RUN_FRESH_SCAN',
      },
    ]);
    expect(result.evaluatedConditionKeys).toEqual([
      {
        conditionKey: 'tenant-1:domain-1:TLS_CERTIFICATE_REGRESSION:www.example.com:443',
        kind: 'TLS_CERTIFICATE_REGRESSION',
        discriminator: 'www.example.com:443',
        outcome: 'STALE',
      },
    ]);
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
    expect(result.evaluatedConditionKeys[0]?.outcome).toBe('FAULTY');
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
    expect(result.evaluatedConditionKeys[0]?.outcome).toBe('FAULTY');
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
    expect(noBaseline.evaluatedConditionKeys).toEqual([]);
    expect(incomplete).toEqual({
      observations: [],
      setupEvidence: [],
      evaluatedConditionKeys: [],
    });
    expect(unknown.observations).toEqual([]);
    expect(unknown.setupEvidence[0]?.status).toBe('EVIDENCE_UNAVAILABLE');
    expect(unknown.evaluatedConditionKeys[0]?.outcome).toBe('UNKNOWN');
  });

  it('classifies a matching redirect topology as healthy without emitting a signal', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [redirectProbe()],
      findings: [],
      now,
    });
    expect(result).toMatchObject({
      observations: [],
      setupEvidence: [],
      evaluatedConditionKeys: [{ outcome: 'HEALTHY' }],
    });
  });

  it('emits one stable redirect observation only for a conclusive fresh final-URL fault', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [redirectProbe(now, { finalUrl: 'https://phishing.example.net/' })],
      findings: [],
      now,
    });
    expect(result.setupEvidence).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'FAULTY' }]);
    expect(result.observations).toMatchObject([
      {
        kind: 'REDIRECT_TOPOLOGY_REGRESSION',
        discriminator: 'https://www.example.com/',
        conditionKey: 'tenant-1:domain-1:REDIRECT_TOPOLOGY_REGRESSION:https://www.example.com/',
        evidence: {
          probeKind: 'REDIRECT_TOPOLOGY',
          finalUrl: 'https://phishing.example.net/',
          expectedFinalUrl: 'https://example.com/',
        },
      },
    ]);
  });

  it('classifies stale, unknown, malformed, and truncated redirect evidence as setup/evidence', () => {
    const stale = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(new Date(now.getTime() - 301_000), { finalUrl: 'https://evil.test/' }),
      ],
      findings: [],
      now,
    });
    const unknown = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        {
          success: false,
          probedAt: now,
          probeData: { check: 'REDIRECT_TOPOLOGY', status: 'UNKNOWN' },
        },
      ],
      findings: [],
      now,
    });
    const malformed = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [redirectProbe(now, { kind: 'TLS_CERTIFICATE', hops: 'bad' })],
      findings: [],
      now,
    });
    const truncated = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [redirectProbe(now, { truncated: true, hops: [] })],
      findings: [],
      now,
    });
    expect(stale.observations).toEqual([]);
    expect(stale.evaluatedConditionKeys[0]?.outcome).toBe('STALE');
    expect(unknown.evaluatedConditionKeys[0]?.outcome).toBe('UNKNOWN');
    expect(malformed.evaluatedConditionKeys[0]?.outcome).toBe('MALFORMED');
    expect(truncated.evaluatedConditionKeys[0]?.outcome).toBe('TRUNCATED');
    expect(truncated.setupEvidence[0]?.status).toBe('EVIDENCE_UNAVAILABLE');
  });

  it('does not evaluate a cross-target redirect probe as the accepted condition', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(now, {
          startUrl: 'https://apex.example.com/',
          finalUrl: 'https://phishing.example.net/',
        }),
      ],
      findings: [],
      now,
    });
    expect(result.observations).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'UNKNOWN' }]);
  });

  it('classifies a matching indexable homepage as healthy without emitting a signal', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe()],
      findings: [],
      now,
    });
    expect(result).toMatchObject({
      observations: [],
      setupEvidence: [],
      evaluatedConditionKeys: [{ outcome: 'HEALTHY' }],
    });
  });

  it('emits one stable indexability observation for a conclusive noindex fault', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(now, { xRobotsTags: ['noindex'], metaRobots: ['nofollow'] })],
      findings: [],
      now,
    });
    expect(result.setupEvidence).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'FAULTY' }]);
    expect(result.observations).toMatchObject([
      {
        kind: 'HOMEPAGE_INDEXABILITY_REGRESSION',
        discriminator: 'https://example.com/',
        conditionKey: 'tenant-1:domain-1:HOMEPAGE_INDEXABILITY_REGRESSION:https://example.com/',
        evidence: {
          probeKind: 'HOMEPAGE_INDEXABILITY',
          xRobotsTags: ['noindex'],
          requireIndexable: true,
        },
      },
    ]);
  });

  it('treats truncated indexability without a noindex token as inconclusive, not healthy', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(now, { bodyTruncated: true })],
      findings: [],
      now,
    });
    expect(result.observations).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'TRUNCATED' }]);
  });

  it('still faults truncated indexability when a noindex token is already visible', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(now, { bodyTruncated: true, metaRobots: ['none'] })],
      findings: [],
      now,
    });
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'FAULTY' }]);
    expect(result.observations).toHaveLength(1);
  });

  it('classifies unknown and malformed indexability evidence as setup/evidence', () => {
    const unknown = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [
        {
          success: false,
          probedAt: now,
          probeData: { check: 'HOMEPAGE_INDEXABILITY', status: 'UNKNOWN' },
        },
      ],
      findings: [],
      now,
    });
    const malformed = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(now, { xRobotsTags: 'noindex' })],
      findings: [],
      now,
    });
    expect(unknown.observations).toEqual([]);
    expect(unknown.evaluatedConditionKeys[0]?.outcome).toBe('UNKNOWN');
    expect(malformed.evaluatedConditionKeys[0]?.outcome).toBe('MALFORMED');
  });

  it('does not evaluate a cross-target indexability probe as the accepted condition', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [
        indexabilityProbe(now, {
          requestedUrl: 'https://www.example.com/',
          xRobotsTags: ['noindex'],
        }),
      ],
      findings: [],
      now,
    });
    expect(result.observations).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'UNKNOWN' }]);
  });
});
