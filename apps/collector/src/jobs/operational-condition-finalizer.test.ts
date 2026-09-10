import { describe, expect, it, vi } from 'vitest';
import { finalizeCanonicalConditions } from './operational-condition-finalizer.js';

const now = new Date('2026-07-28T12:00:00.000Z');
const baseline = {
  tenantId: 'tenant-1',
  domainId: 'domain-1',
  kind: 'MAIL_DNS_CONFIGURATION_REGRESSION' as const,
  discriminator: 'spf',
  maxEvidenceAgeSeconds: 3600,
  policy: { kind: 'SPF_PRESENT' as const },
};

function input() {
  return {
    tenantId: 'tenant-1',
    domainId: 'domain-1',
    domainName: 'example.com',
    snapshotId: 'snapshot-1',
    snapshotComplete: true,
    monitoredDomainId: 'monitor-1',
    webhookUrl: 'https://hooks.example.test/alerts',
    baselines: [baseline],
    probes: [],
    findings: [{ id: 'finding-1', type: 'mail.no-spf-record', reviewOnly: false }],
    now,
  };
}

describe('finalizeCanonicalConditions', () => {
  it('sends only newly-created or reopened canonical alerts', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const alert = {
      id: 'alert-1',
      title: 'Mail DNS configuration regression',
      description: 'x',
      severity: 'high' as const,
    };
    const observer = {
      observe: vi
        .fn()
        .mockResolvedValueOnce({ created: { alert: true }, reopened: { alert: false }, alert })
        .mockResolvedValueOnce({ created: { alert: false }, reopened: { alert: false }, alert })
        .mockResolvedValueOnce({
          created: { alert: false },
          reopened: { alert: true },
          alert: { ...alert, id: 'alert-2' },
        }),
    };
    await finalizeCanonicalConditions(input(), { observer, send });
    await finalizeCanonicalConditions(input(), { observer, send });
    await finalizeCanonicalConditions(input(), { observer, send });
    expect(observer.observe).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, 'alert-1', 'https://hooks.example.test/alerts', alert);
    expect(send).toHaveBeenNthCalledWith(2, 'alert-2', 'https://hooks.example.test/alerts', {
      ...alert,
      id: 'alert-2',
    });
  });

  it('does not send stale TLS evidence', async () => {
    const send = vi.fn();
    const observer = { observe: vi.fn() };
    const stale = {
      ...input(),
      baselines: [
        {
          tenantId: 'tenant-1',
          domainId: 'domain-1',
          kind: 'TLS_CERTIFICATE_REGRESSION' as const,
          discriminator: 'www.example.com:443',
          maxEvidenceAgeSeconds: 1,
          policy: {
            kind: 'TLS_CERTIFICATE' as const,
            requireHostnameAuthorized: true,
            requireChainAuthorized: true,
            minimumRemainingValiditySeconds: 0,
          },
        },
      ],
      findings: [],
      probes: [
        {
          success: true,
          probedAt: new Date(now.getTime() - 2000),
          probeData: {
            check: 'TLS_CERTIFICATE' as const,
            status: 'OBSERVED' as const,
            evidence: {
              kind: 'TLS_CERTIFICATE' as const,
              hostname: 'www.example.com',
              port: 443,
              hostnameAuthorized: false,
              chainAuthorized: true,
              validTo: '2027-01-01T00:00:00.000Z',
            },
          },
        },
      ],
    };
    const result = await finalizeCanonicalConditions(stale, { observer, send });
    expect(result.evaluation.setupEvidence).toMatchObject([{ status: 'EVIDENCE_STALE' }]);
    expect(observer.observe).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('creates and notifies stable redirect and indexability regressions', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const observer = {
      observe: vi
        .fn()
        .mockResolvedValueOnce({
          created: { alert: true },
          reopened: { alert: false },
          alert: {
            id: 'alert-redirect',
            title: 'Redirect topology regression',
            description: 'x',
            severity: 'high' as const,
          },
        })
        .mockResolvedValueOnce({
          created: { alert: true },
          reopened: { alert: false },
          alert: {
            id: 'alert-index',
            title: 'Homepage indexability regression',
            description: 'x',
            severity: 'high' as const,
          },
        }),
    };
    const redirectResult = await finalizeCanonicalConditions(redirectFaultInput(), {
      observer,
      send,
    });
    const indexResult = await finalizeCanonicalConditions(indexabilityFaultInput(), {
      observer,
      send,
    });
    expect(redirectResult.evaluation.observations).toMatchObject([
      { kind: 'REDIRECT_TOPOLOGY_REGRESSION' },
    ]);
    expect(indexResult.evaluation.observations).toMatchObject([
      { kind: 'HOMEPAGE_INDEXABILITY_REGRESSION' },
    ]);
    expect(observer.observe).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: 'REDIRECT_TOPOLOGY_REGRESSION',
        title: 'Redirect topology regression',
        severity: 'high',
      })
    );
    expect(observer.observe).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'HOMEPAGE_INDEXABILITY_REGRESSION',
        title: 'Homepage indexability regression',
        severity: 'high',
      })
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('notifies only a reopened redirect regression, not a duplicate open', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const alert = {
      id: 'alert-redirect',
      title: 'Redirect topology regression',
      description: 'x',
      severity: 'high' as const,
    };
    const observer = {
      observe: vi
        .fn()
        .mockResolvedValueOnce({ created: { alert: false }, reopened: { alert: false }, alert })
        .mockResolvedValueOnce({
          created: { alert: false },
          reopened: { alert: true },
          alert: { ...alert, id: 'alert-reopened' },
        }),
    };
    await finalizeCanonicalConditions(redirectFaultInput(), { observer, send });
    await finalizeCanonicalConditions(redirectFaultInput(), { observer, send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'alert-reopened',
      'https://hooks.example.test/alerts',
      expect.objectContaining({ id: 'alert-reopened' })
    );
  });

  it('resolves only conclusive healthy evidence and never unknown or setup-only', async () => {
    const conditionKey = 'tenant-1:domain-1:REDIRECT_TOPOLOGY_REGRESSION:https://www.example.com/';
    const resolver = {
      listCases: vi.fn().mockResolvedValue([
        {
          case: { id: 'case-1', status: 'OPEN' },
          signal: { conditionKey },
        },
      ]),
      resolveCase: vi.fn(),
    };
    const observer = { observe: vi.fn() };
    const send = vi.fn();

    await finalizeCanonicalConditions(redirectHealthyInput(), {
      observer,
      resolver,
      send,
    });
    expect(observer.observe).not.toHaveBeenCalled();
    expect(resolver.resolveCase).toHaveBeenCalledWith(
      'case-1',
      'tenant-1',
      'snapshot-1',
      expect.objectContaining({
        activeConditionKeys: [],
        evaluatedConditionKeys: [expect.objectContaining({ conditionKey, outcome: 'HEALTHY' })],
      })
    );

    resolver.resolveCase.mockClear();
    await finalizeCanonicalConditions(redirectUnknownInput(), {
      observer,
      resolver,
      send,
    });
    expect(resolver.resolveCase).not.toHaveBeenCalled();
    expect(observer.observe).not.toHaveBeenCalled();

    await finalizeCanonicalConditions(
      {
        ...redirectFaultInput(),
        probes: [
          redirectProbe(new Date(now.getTime() - 4000), {
            finalUrl: 'https://phishing.example.net/',
          }),
        ],
        baselines: [{ ...redirectBaseline, maxEvidenceAgeSeconds: 1 }],
      },
      { observer, resolver, send }
    );
    expect(resolver.resolveCase).not.toHaveBeenCalled();
  });

  it('does not resolve an active TLS case from malformed or future evidence', async () => {
    const conditionKey = 'tenant-1:domain-1:TLS_CERTIFICATE_REGRESSION:www.example.com:443';
    const resolver = {
      listCases: vi.fn().mockResolvedValue([
        {
          case: { id: 'case-tls', status: 'OPEN' },
          signal: { conditionKey },
        },
      ]),
      resolveCase: vi.fn(),
    };
    const observer = { observe: vi.fn() };
    const send = vi.fn();
    await finalizeCanonicalConditions(tlsMalformedInput(), { observer, resolver, send });
    await finalizeCanonicalConditions(tlsFutureInput(), { observer, resolver, send });
    expect(observer.observe).not.toHaveBeenCalled();
    expect(resolver.resolveCase).not.toHaveBeenCalled();
  });

  it('retries a pending canonical webhook and fails finalization when send fails', async () => {
    const pendingAlert = {
      id: 'alert-1',
      title: 'Mail DNS configuration regression',
      description: 'x',
      severity: 'high' as const,
      status: 'pending' as const,
    };
    const send = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'webhook 500' })
      .mockResolvedValueOnce({ success: true });
    const observer = {
      observe: vi
        .fn()
        .mockResolvedValueOnce({
          created: { alert: true },
          reopened: { alert: false },
          alert: pendingAlert,
        })
        .mockResolvedValueOnce({
          created: { alert: false },
          reopened: { alert: false },
          alert: pendingAlert,
        }),
    };
    await expect(finalizeCanonicalConditions(input(), { observer, send })).rejects.toThrow(
      'webhook 500'
    );
    await finalizeCanonicalConditions(input(), { observer, send });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      2,
      'alert-1',
      'https://hooks.example.test/alerts',
      pendingAlert
    );
  });

  it('claims pending delivery so concurrent finalizers send once', async () => {
    const pendingAlert = {
      id: 'alert-1',
      title: 'Mail DNS configuration regression',
      description: 'x',
      severity: 'high' as const,
      status: 'pending' as const,
    };
    let claimed = false;
    const claimPendingNotification = vi.fn(async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    });
    const send = vi.fn().mockResolvedValue({ success: true, statusUpdated: true });
    const observer = {
      observe: vi.fn().mockResolvedValue({
        created: { alert: true },
        reopened: { alert: false },
        alert: pendingAlert,
      }),
    };
    await Promise.all([
      finalizeCanonicalConditions(input(), { observer, send, claimPendingNotification }),
      finalizeCanonicalConditions(input(), { observer, send, claimPendingNotification }),
    ]);
    expect(claimPendingNotification).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('releases the claim after a failed send and keeps it after status persistence failure', async () => {
    const pendingAlert = {
      id: 'alert-1',
      title: 'Mail DNS configuration regression',
      description: 'x',
      severity: 'high' as const,
      status: 'pending' as const,
    };
    const claimPendingNotification = vi.fn().mockResolvedValue(true);
    const releaseNotificationClaim = vi.fn();
    const observer = {
      observe: vi.fn().mockResolvedValue({
        created: { alert: true },
        reopened: { alert: false },
        alert: pendingAlert,
      }),
    };
    await expect(
      finalizeCanonicalConditions(input(), {
        observer,
        send: vi.fn().mockResolvedValue({ success: false, error: 'webhook 500' }),
        claimPendingNotification,
        releaseNotificationClaim,
      })
    ).rejects.toThrow('webhook 500');
    expect(releaseNotificationClaim).toHaveBeenCalledWith('alert-1', 'tenant-1');

    releaseNotificationClaim.mockClear();
    await expect(
      finalizeCanonicalConditions(input(), {
        observer,
        send: vi.fn().mockResolvedValue({ success: true, statusUpdated: false }),
        claimPendingNotification,
        releaseNotificationClaim,
      })
    ).rejects.toThrow('Alert sent status was not persisted');
    expect(releaseNotificationClaim).not.toHaveBeenCalled();
  });

  it('does not resend a canonical alert after it is marked sent', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const observer = {
      observe: vi.fn().mockResolvedValue({
        created: { alert: false },
        reopened: { alert: false },
        alert: {
          id: 'alert-1',
          title: 'Mail DNS configuration regression',
          description: 'x',
          severity: 'high' as const,
          status: 'sent' as const,
        },
      }),
    };
    await finalizeCanonicalConditions(input(), { observer, send });
    expect(send).not.toHaveBeenCalled();
  });
});

const redirectBaseline = {
  tenantId: 'tenant-1',
  domainId: 'domain-1',
  kind: 'REDIRECT_TOPOLOGY_REGRESSION' as const,
  discriminator: 'https://www.example.com/',
  maxEvidenceAgeSeconds: 3600,
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
  maxEvidenceAgeSeconds: 3600,
  policy: {
    kind: 'HOMEPAGE_INDEXABILITY' as const,
    requestedUrl: 'https://example.com/',
    requireIndexable: true,
  },
};

function hop(url: string, status: number, location?: string) {
  return {
    url,
    status,
    ...(location === undefined ? {} : { location }),
    resolvedAddresses: ['1.1.1.1'],
    observedAt: now.toISOString(),
  };
}

function redirectProbe(probedAt = now, overrides: Record<string, unknown> = {}) {
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
        hops: [hop(startUrl, 301, finalUrl), hop(finalUrl, 200)],
        finalUrl,
        truncated: false,
        ...overrides,
      },
    },
  };
}

function redirectFaultInput() {
  return {
    ...input(),
    baselines: [redirectBaseline],
    findings: [],
    probes: [redirectProbe(now, { finalUrl: 'https://phishing.example.net/' })],
  };
}

function redirectHealthyInput() {
  return {
    ...input(),
    baselines: [redirectBaseline],
    findings: [],
    probes: [redirectProbe()],
  };
}

function redirectUnknownInput() {
  return {
    ...input(),
    baselines: [redirectBaseline],
    findings: [],
    probes: [],
  };
}

const tlsBaseline = {
  tenantId: 'tenant-1',
  domainId: 'domain-1',
  kind: 'TLS_CERTIFICATE_REGRESSION' as const,
  discriminator: 'www.example.com:443',
  maxEvidenceAgeSeconds: 3600,
  policy: {
    kind: 'TLS_CERTIFICATE' as const,
    requireHostnameAuthorized: true,
    requireChainAuthorized: true,
    minimumRemainingValiditySeconds: 0,
  },
};

function tlsProbe(probedAt: Date, overrides: Record<string, unknown> = {}) {
  return {
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
        validTo: '2027-01-01T00:00:00.000Z',
        ...overrides,
      },
    },
  };
}

function tlsMalformedInput() {
  return {
    ...input(),
    baselines: [tlsBaseline],
    findings: [],
    probes: [tlsProbe(now, { validTo: 'not-a-date' })],
  };
}

function tlsFutureInput() {
  return {
    ...input(),
    baselines: [tlsBaseline],
    findings: [],
    probes: [tlsProbe(new Date(now.getTime() + 60_000))],
  };
}

function indexabilityFaultInput() {
  return {
    ...input(),
    baselines: [indexabilityBaseline],
    findings: [],
    probes: [
      {
        success: true,
        probedAt: now,
        probeData: {
          check: 'HOMEPAGE_INDEXABILITY' as const,
          status: 'OBSERVED' as const,
          evidence: {
            kind: 'HOMEPAGE_INDEXABILITY' as const,
            requestedUrl: 'https://example.com/',
            finalUrl: 'https://example.com/',
            responseStatus: 200,
            xRobotsTags: ['noindex'],
            metaRobots: ['nofollow'],
            bodyBytesInspected: 2048,
            bodyTruncated: false,
          },
        },
      },
    ],
  };
}
