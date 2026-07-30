import type { IDatabaseAdapter } from '@dns-ops/db';
import { domainProfiles, domains, probeObservations, snapshots } from '@dns-ops/db/schema';
import { describe, expect, it } from 'vitest';
import { collectAndPersistDomainEvidence } from './domain-evidence.js';

function createDb(purpose: 'WEB' | 'MAIL' | 'REDIRECT' | 'UNKNOWN') {
  const persisted: unknown[] = [];
  const db = {
    async selectOne(table: unknown) {
      if (table === snapshots) return { id: 'snapshot-1', domainId: 'domain-1' };
      if (table === domains)
        return { id: 'domain-1', tenantId: 'tenant-1', normalizedName: 'example.com' };
      if (table === domainProfiles) {
        return { domainId: 'domain-1', tenantId: 'tenant-1', purpose, criticality: 'NORMAL' };
      }
      return undefined;
    },
    async insertMany(table: unknown, values: unknown[]) {
      if (table !== probeObservations) throw new Error('Unexpected table');
      persisted.push(...values);
      return values;
    },
  };
  return { db: db as unknown as IDatabaseAdapter, persisted };
}

describe('collectAndPersistDomainEvidence', () => {
  it('rejects a snapshot/domain pair outside the supplied tenant before persistence', async () => {
    const { db, persisted } = createDb('WEB');
    await expect(
      collectAndPersistDomainEvidence(
        db,
        {
          snapshotId: 'snapshot-1',
          tenantId: 'other-tenant',
          domainId: 'domain-1',
          domain: 'example.com',
        },
        { activeProbesEnabled: false }
      )
    ).rejects.toThrow('outside the tenant');
    expect(persisted).toEqual([]);
  });

  it('persists disabled web checks as actionable UNKNOWN evidence, not operational objects', async () => {
    const { db, persisted } = createDb('WEB');
    const count = await collectAndPersistDomainEvidence(
      db,
      {
        snapshotId: 'snapshot-1',
        tenantId: 'tenant-1',
        domainId: 'domain-1',
        domain: 'example.com',
      },
      { activeProbesEnabled: false }
    );
    expect(count).toBe(5);
    expect(persisted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ probeType: 'rdap', status: 'error', success: false }),
        expect.objectContaining({ probeType: 'tls_cert', status: 'error', success: false }),
        expect.objectContaining({ probeType: 'http', status: 'error', success: false }),
      ])
    );
    expect(JSON.stringify(persisted)).toContain('NOT_CURRENTLY_OBSERVABLE');
  });

  it('collects enabled profile-applicable evidence through injected bounded probes', async () => {
    const { db, persisted } = createDb('WEB');
    const count = await collectAndPersistDomainEvidence(
      db,
      {
        snapshotId: 'snapshot-1',
        tenantId: 'tenant-1',
        domainId: 'domain-1',
        domain: 'example.com',
      },
      {
        activeProbesEnabled: true,
        rdap: {
          resolveHostname: async () => ['1.1.1.1'],
          fetcher: async (url) =>
            new Response(
              url.includes('dns.json')
                ? JSON.stringify({ services: [[['com'], ['https://rdap.example/']]] })
                : JSON.stringify({
                    objectClassName: 'domain',
                    ldhName: 'example.com',
                    events: [{ eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' }],
                  }),
              { headers: { 'content-type': 'application/json' } }
            ),
        },
        tls: {
          resolveHostname: async () => ['1.1.1.1'],
          connector: async () => ({
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
            validTo: '2030-01-01T00:00:00.000Z',
            fingerprintSha256: 'AA:BB',
          }),
        },
        http: {
          resolveHostname: async () => ['1.1.1.1'],
          fetcher: async () =>
            new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
        },
      }
    );
    expect(count).toBe(11);
    expect(
      persisted.filter((row) => (row as { status?: string }).status === 'success')
    ).toHaveLength(11);
  });

  it('does not create homepage indexability evidence for redirect-only domains', async () => {
    const { db, persisted } = createDb('REDIRECT');
    const count = await collectAndPersistDomainEvidence(
      db,
      {
        snapshotId: 'snapshot-1',
        tenantId: 'tenant-1',
        domainId: 'domain-1',
        domain: 'example.com',
      },
      { activeProbesEnabled: false }
    );
    expect(count).toBe(4);
    expect(JSON.stringify(persisted)).not.toContain('HOMEPAGE_INDEXABILITY');
  });

  it('persists purpose-undeclared web setup evidence without probing', async () => {
    const { db, persisted } = createDb('UNKNOWN');
    const count = await collectAndPersistDomainEvidence(
      db,
      {
        snapshotId: 'snapshot-1',
        tenantId: 'tenant-1',
        domainId: 'domain-1',
        domain: 'example.com',
      },
      { activeProbesEnabled: false }
    );
    expect(count).toBe(4);
    expect(persisted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ probeType: 'rdap' }),
        expect.objectContaining({
          probeData: expect.objectContaining({
            unknown: expect.objectContaining({ reason: 'PURPOSE_UNDECLARED' }),
          }),
        }),
      ])
    );
  });
});
