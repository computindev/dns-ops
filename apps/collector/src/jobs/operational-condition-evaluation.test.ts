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

const hop = (url: string, status: number, probedAt = now, location?: string) => ({
  url,
  status,
  ...(location === undefined ? {} : { location }),
  resolvedAddresses: ['1.1.1.1'],
  observedAt: probedAt.toISOString(),
});

const redirectHops = (startUrl: string, finalUrl: string, probedAt = now) => [
  hop(startUrl, 301, probedAt, finalUrl),
  hop(finalUrl, 200, probedAt),
];

const redirectProbe = (
  probedAt = now,
  overrides: Record<string, unknown> = {},
  dataOverrides: Record<string, unknown> = {}
) => {
  const startUrl =
    typeof overrides.startUrl === 'string' ? overrides.startUrl : 'https://www.example.com/';
  const finalUrl =
    typeof overrides.finalUrl === 'string' ? overrides.finalUrl : 'https://example.com/';
  return {
    success: true,
    probedAt,
    probeData: {
      check: 'REDIRECT_TOPOLOGY' as const,
      status: 'OBSERVED' as const,
      evidence: {
        kind: 'HTTP_REDIRECT' as const,
        startUrl,
        hops: redirectHops(startUrl, finalUrl, probedAt),
        finalUrl,
        truncated: false,
        ...overrides,
      },
      ...dataOverrides,
    },
  };
};

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

  it('compares long expected redirect finals without the 64-character discriminator limit', () => {
    const longFinal = `https://example.com/${'path'.repeat(20)}`;
    expect(longFinal.length).toBeGreaterThan(64);
    const baseline = {
      ...redirectBaseline,
      policy: {
        kind: 'REDIRECT_TOPOLOGY' as const,
        startUrl: 'https://www.example.com/',
        expectedFinalUrl: longFinal,
      },
    };
    const healthy = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [baseline],
      probes: [redirectProbe(now, { finalUrl: longFinal })],
      findings: [],
      now,
    });
    const faulty = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [baseline],
      probes: [redirectProbe(now, { finalUrl: `${longFinal}-other` })],
      findings: [],
      now,
    });
    expect(healthy.evaluatedConditionKeys).toMatchObject([{ outcome: 'HEALTHY' }]);
    expect(healthy.observations).toEqual([]);
    expect(faulty.evaluatedConditionKeys).toMatchObject([{ outcome: 'FAULTY' }]);
    expect(faulty.observations).toHaveLength(1);
  });

  it('treats malformed hops and incoherent source/final linkage as inconclusive', () => {
    const badHopShape = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [redirectProbe(now, { hops: [{ url: 'https://www.example.com/' }] })],
      findings: [],
      now,
    });
    const unlinkedFinal = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(now, {
          hops: redirectHops('https://www.example.com/', 'https://example.com/'),
          finalUrl: 'https://phishing.example.net/',
        }),
      ],
      findings: [],
      now,
    });
    const unlinkedStart = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(now, {
          hops: redirectHops('https://cdn.example.com/', 'https://example.com/'),
        }),
      ],
      findings: [],
      now,
    });
    expect(badHopShape.observations).toEqual([]);
    expect(badHopShape.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
    expect(unlinkedFinal.observations).toEqual([]);
    expect(unlinkedFinal.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
    expect(unlinkedStart.observations).toEqual([]);
    expect(unlinkedStart.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
  });

  it('treats a non-redirect intermediate hop as malformed, not conclusive', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(now, {
          hops: [
            hop('https://www.example.com/', 301, now, 'https://cdn.example.com/'),
            hop('https://cdn.example.com/', 200, now, 'https://example.com/'),
            hop('https://example.com/', 200, now),
          ],
        }),
      ],
      findings: [],
      now,
    });
    expect(result.observations).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
  });

  it('treats a mismatched hop Location as malformed, not conclusive', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(now, {
          hops: [
            hop('https://www.example.com/', 301, now, 'https://other.example.com/'),
            hop('https://example.com/', 200, now),
          ],
        }),
      ],
      findings: [],
      now,
    });
    expect(result.observations).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
  });

  it('treats a missing hop Location as malformed, not conclusive', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(now, {
          hops: [hop('https://www.example.com/', 301, now), hop('https://example.com/', 200, now)],
        }),
      ],
      findings: [],
      now,
    });
    expect(result.observations).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
  });

  it('accepts a valid multi-hop 3xx Location chain as conclusive', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(now, {
          hops: [
            hop('https://www.example.com/', 301, now, 'https://cdn.example.com/'),
            hop('https://cdn.example.com/', 302, now, 'https://example.com/'),
            hop('https://example.com/', 200, now),
          ],
        }),
      ],
      findings: [],
      now,
    });
    expect(result.observations).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'HEALTHY' }]);
  });

  it('rejects a terminal 3xx hop as malformed, not conclusive', () => {
    const result = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [
        redirectProbe(now, {
          hops: [
            hop('https://www.example.com/', 301, now, 'https://example.com/'),
            hop('https://example.com/', 302, now, 'https://www.example.com/'),
          ],
        }),
      ],
      findings: [],
      now,
    });
    expect(result.observations).toEqual([]);
    expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
  });

  it('rejects malformed indexability status, byte count, and final URL', () => {
    const badStatus = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(now, { responseStatus: 200.5, xRobotsTags: ['noindex'] })],
      findings: [],
      now,
    });
    const outOfRange = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(now, { responseStatus: 99, xRobotsTags: ['noindex'] })],
      findings: [],
      now,
    });
    const negativeBytes = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(now, { bodyBytesInspected: -1, xRobotsTags: ['noindex'] })],
      findings: [],
      now,
    });
    const badFinalUrl = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(now, { finalUrl: 'not-a-url', xRobotsTags: ['noindex'] })],
      findings: [],
      now,
    });
    for (const result of [badStatus, outOfRange, negativeBytes, badFinalUrl]) {
      expect(result.observations).toEqual([]);
      expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
    }
  });

  it('rejects future-dated HTTP evidence instead of treating it as current', () => {
    const future = new Date(now.getTime() + 60_000);
    const redirect = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [redirectBaseline],
      probes: [redirectProbe(future)],
      findings: [],
      now,
    });
    const indexability = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [indexabilityBaseline],
      probes: [indexabilityProbe(future, { xRobotsTags: ['noindex'] })],
      findings: [],
      now,
    });
    expect(redirect.observations).toEqual([]);
    expect(redirect.evaluatedConditionKeys).toMatchObject([{ outcome: 'UNKNOWN' }]);
    expect(indexability.observations).toEqual([]);
    expect(indexability.evaluatedConditionKeys).toMatchObject([{ outcome: 'UNKNOWN' }]);
  });

  it('classifies non-2xx homepage indexability as unknown, not healthy', () => {
    for (const responseStatus of [301, 404, 500]) {
      const result = evaluateOperationalConditions({
        tenantId: 'tenant-1',
        domainId: 'domain-1',
        snapshotComplete: true,
        baselines: [indexabilityBaseline],
        probes: [indexabilityProbe(now, { responseStatus })],
        findings: [],
        now,
      });
      expect(result.observations).toEqual([]);
      expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'UNKNOWN' }]);
    }
  });

  it('rejects malformed and future TLS evidence instead of treating it as healthy', () => {
    const future = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [tlsBaseline],
      probes: [tlsProbe(new Date(now.getTime() + 60_000))],
      findings: [],
      now,
    });
    const malformedValidTo = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [tlsBaseline],
      probes: [tlsProbe(now, { validTo: 'not-a-date' })],
      findings: [],
      now,
    });
    const malformedBoolean = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [tlsBaseline],
      probes: [tlsProbe(now, { hostnameAuthorized: 'yes' as unknown as boolean })],
      findings: [],
      now,
    });
    const malformedPort = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [tlsBaseline],
      probes: [tlsProbe(now, { port: '443' as unknown as number })],
      findings: [],
      now,
    });
    const healthy = evaluateOperationalConditions({
      tenantId: 'tenant-1',
      domainId: 'domain-1',
      snapshotComplete: true,
      baselines: [tlsBaseline],
      probes: [tlsProbe()],
      findings: [],
      now,
    });
    expect(future.observations).toEqual([]);
    expect(future.evaluatedConditionKeys).toMatchObject([{ outcome: 'UNKNOWN' }]);
    expect(malformedValidTo.observations).toEqual([]);
    expect(malformedValidTo.evaluatedConditionKeys).toMatchObject([{ outcome: 'UNKNOWN' }]);
    expect(malformedBoolean.observations).toEqual([]);
    expect(malformedBoolean.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
    expect(malformedPort.observations).toEqual([]);
    expect(malformedPort.evaluatedConditionKeys).toMatchObject([{ outcome: 'MALFORMED' }]);
    expect(healthy.evaluatedConditionKeys).toMatchObject([{ outcome: 'HEALTHY' }]);
  });

  it('rejects impossible, date-only, and offset TLS validTo as unknown', () => {
    const cases = ['2027-02-31T00:00:00.000Z', '2027-01-01', '2027-01-01T00:00:00+00:00'];
    for (const validTo of cases) {
      const result = evaluateOperationalConditions({
        tenantId: 'tenant-1',
        domainId: 'domain-1',
        snapshotComplete: true,
        baselines: [tlsBaseline],
        probes: [tlsProbe(now, { validTo })],
        findings: [],
        now,
      });
      expect(result.observations).toEqual([]);
      expect(result.evaluatedConditionKeys).toMatchObject([{ outcome: 'UNKNOWN' }]);
    }
  });
});
