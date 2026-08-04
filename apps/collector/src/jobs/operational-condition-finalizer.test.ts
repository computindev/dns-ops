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
});
