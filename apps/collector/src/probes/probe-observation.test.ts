/**
 * Probe Observation Persistence Tests - DATA-003
 *
 * Tests that probe results are persisted to the database.
 */

import type { IDatabaseAdapter, ProbeData, ProbeObservation } from '@dns-ops/db';
import { ProbeObservationRepository, probeObservations } from '@dns-ops/db';
import { describe, expect, it, vi } from 'vitest';

describe('Probe Observation Persistence', () => {
  describe('Repository', () => {
    it('should create probe observation', async () => {
      const mockDb: IDatabaseAdapter = {
        select: vi.fn(),
        selectOne: vi.fn(),
        selectWhere: vi.fn(),
        insert: vi.fn(async () => ({
          id: 'probe-obs-1',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls' as const,
          status: 'success' as const,
          hostname: 'mail.example.com',
          port: 25,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 150,
          probeData: { supportsStarttls: true },
        })),
        insertMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        getDrizzle: vi.fn(),
      };

      const repo = new ProbeObservationRepository(mockDb);

      const observation = await repo.create({
        snapshotId: 'snapshot-1',
        probeType: 'smtp_starttls',
        status: 'success',
        hostname: 'mail.example.com',
        port: 25,
        success: true,
        responseTimeMs: 150,
        probeData: { supportsStarttls: true },
      });

      expect(observation.id).toBe('probe-obs-1');
      expect(observation.hostname).toBe('mail.example.com');
      expect(observation.success).toBe(true);
    });

    it('should find observations by snapshot', async () => {
      const mockObservations = [
        {
          id: 'probe-1',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'success' as const,
          hostname: 'mx1.example.com',
          port: 25,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 100,
          probeData: null,
        },
        {
          id: 'probe-2',
          snapshotId: 'snapshot-1',
          probeType: 'mta_sts',
          status: 'success' as const,
          hostname: 'mta-sts.example.com',
          port: 443,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 200,
          probeData: null,
        },
      ];

      const mockDb: IDatabaseAdapter = {
        select: vi.fn(),
        selectOne: vi.fn(),
        selectWhere: vi.fn(async () => mockObservations),
        insert: vi.fn(),
        insertMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        getDrizzle: vi.fn(),
      };

      const repo = new ProbeObservationRepository(mockDb);
      const results = await repo.findBySnapshotId('snapshot-1');

      expect(results).toHaveLength(2);
      // Sorted alphabetically by hostname
      expect(results[0].hostname).toBe('mta-sts.example.com');
      expect(results[1].hostname).toBe('mx1.example.com');
    });

    it('should filter by probe type', async () => {
      const mockObservations = [
        {
          id: 'probe-1',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'success' as const,
          hostname: 'mx1.example.com',
          port: 25,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 100,
          probeData: null,
        },
        {
          id: 'probe-2',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'timeout' as const,
          hostname: 'mx2.example.com',
          port: 25,
          success: false,
          errorMessage: 'Timeout',
          probedAt: new Date(),
          responseTimeMs: 30000,
          probeData: null,
        },
      ];

      const mockDb: IDatabaseAdapter = {
        select: vi.fn(),
        selectOne: vi.fn(),
        selectWhere: vi.fn(async () => mockObservations),
        insert: vi.fn(),
        insertMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        getDrizzle: vi.fn(),
      };

      const repo = new ProbeObservationRepository(mockDb);
      const smtpProbes = await repo.findBySnapshotAndType('snapshot-1', 'smtp_starttls');

      expect(smtpProbes).toHaveLength(2);
    });

    it('should return only explicitly trusted SMTP probes from findSuccessfulSmtpProbes (issue #74)', async () => {
      const mockObservations = [
        {
          id: 'probe-trusted',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'success' as const,
          hostname: 'mx-trusted.example.com',
          port: 25,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 100,
          probeData: {
            supportsStarttls: true,
            tlsNegotiated: true,
            tlsTrusted: true,
            certificate: {
              subject: 'mx-trusted.example.com',
              issuer: 'Test CA',
              validFrom: '2026-01-01',
              validTo: '2027-01-01',
              fingerprint: 'AA:BB',
              chainAuthorized: true,
              hostnameAuthorized: true,
            },
          },
        },
        {
          // Diagnostic-only row: negotiated TLS with an untrusted certificate.
          id: 'probe-untrusted',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'error' as const,
          hostname: 'mx-untrusted.example.com',
          port: 25,
          success: false,
          errorMessage: 'TLS certificate not trusted: certificate has expired',
          probedAt: new Date(),
          responseTimeMs: 100,
          probeData: {
            supportsStarttls: true,
            tlsNegotiated: true,
            tlsTrusted: false,
            certificate: {
              subject: 'mx-untrusted.example.com',
              issuer: 'Test CA',
              validFrom: '2024-01-01',
              validTo: '2025-01-01',
              fingerprint: 'CC:DD',
              chainAuthorized: false,
              hostnameAuthorized: true,
              authorizationError: 'certificate has expired',
            },
          },
        },
        {
          // Legacy row predating the trust contract: success bit set but no
          // explicit tlsTrusted proof — must fail closed.
          id: 'probe-legacy',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'success' as const,
          hostname: 'mx-legacy.example.com',
          port: 25,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 100,
          probeData: { supportsStarttls: true },
        },
        {
          // Legacy row with no probe data at all — also fails closed.
          id: 'probe-legacy-null',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'success' as const,
          hostname: 'mx-legacy-null.example.com',
          port: 25,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 100,
          probeData: null,
        },
        {
          // Trusted-looking MTA-STS row is not an SMTP probe.
          id: 'probe-mtasts',
          snapshotId: 'snapshot-1',
          probeType: 'mta_sts',
          status: 'success' as const,
          hostname: 'mta-sts.example.com',
          port: 443,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 200,
          probeData: null,
        },
      ];

      const mockDb: IDatabaseAdapter = {
        select: vi.fn(),
        selectOne: vi.fn(),
        selectWhere: vi.fn(async () => mockObservations),
        insert: vi.fn(),
        insertMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        getDrizzle: vi.fn(),
      };

      const repo = new ProbeObservationRepository(mockDb);
      const results = await repo.findSuccessfulSmtpProbes('snapshot-1');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('probe-trusted');
      expect((results[0].probeData as { tlsTrusted?: boolean })?.tlsTrusted).toBe(true);
    });

    it('should get summary statistics', async () => {
      const mockObservations = [
        {
          id: 'probe-1',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'success' as const,
          hostname: 'mx1.example.com',
          port: 25,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 100,
          probeData: {
            supportsStarttls: true,
            tlsNegotiated: true,
            tlsTrusted: true,
            certificate: {
              subject: 'mx1.example.com',
              issuer: 'Test CA',
              validFrom: '2026-01-01',
              validTo: '2027-01-01',
              fingerprint: 'AA:BB',
              chainAuthorized: true,
              hostnameAuthorized: true,
            },
          },
        },
        {
          id: 'probe-2',
          snapshotId: 'snapshot-1',
          probeType: 'mta_sts',
          status: 'success' as const,
          hostname: 'mta-sts.example.com',
          port: 443,
          success: true,
          errorMessage: null,
          probedAt: new Date(),
          responseTimeMs: 200,
          probeData: null,
        },
        {
          id: 'probe-3',
          snapshotId: 'snapshot-1',
          probeType: 'smtp_starttls',
          status: 'error' as const,
          hostname: 'mx2.example.com',
          port: 25,
          success: false,
          errorMessage: 'Connection refused',
          probedAt: new Date(),
          responseTimeMs: 50,
          probeData: null,
        },
      ];

      const mockDb: IDatabaseAdapter = {
        select: vi.fn(),
        selectOne: vi.fn(),
        selectWhere: vi.fn(async () => mockObservations),
        insert: vi.fn(),
        insertMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        getDrizzle: vi.fn(),
      };

      const repo = new ProbeObservationRepository(mockDb);
      const summary = await repo.getSummary('snapshot-1');

      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.avgResponseTimeMs).toBe(117); // (100 + 200 + 50) / 3 = 116.67 rounds to 117
      expect(summary.byType.smtp_starttls).toBe(2);
      expect(summary.byType.mta_sts).toBe(1);
    });
  });

  describe('SMTP trust contract fail-closed reads (issue #74)', () => {
    const probedAt = new Date('2026-09-01T00:00:00Z');
    const trustedCertificate = {
      subject: 'mx.example.com',
      issuer: 'Test CA',
      validFrom: '2026-01-01',
      validTo: '2027-01-01',
      fingerprint: 'AA:BB:CC:DD',
      chainAuthorized: true,
      hostnameAuthorized: true,
    };

    /** Minimal failed/untrusted SMTP row with per-fixture trust overrides. */
    const smtpRow = (
      id: string,
      probeData: ProbeData | null,
      extra: Partial<ProbeObservation> = {}
    ): ProbeObservation => ({
      id,
      snapshotId: 'snapshot-1',
      probeType: 'smtp_starttls',
      status: 'success',
      hostname: `mx-${id.slice(5)}.example.com`,
      port: 25,
      success: true,
      errorMessage: null,
      probedAt,
      responseTimeMs: 100,
      probeData,
      ...extra,
    });

    const makeFixtures = (): ProbeObservation[] => [
      smtpRow('smtp-trusted', {
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        certificate: trustedCertificate,
      }),
      // Legacy row with no probe data at all.
      smtpRow('smtp-legacy-null', null),
      // Legacy row predating the trust contract: tlsTrusted missing.
      smtpRow('smtp-legacy-no-trust', {
        supportsStarttls: true,
        tlsNegotiated: true,
        certificate: trustedCertificate,
      }),
      // Forged row: tlsTrusted asserted without any certificate evidence.
      smtpRow('smtp-forged-no-cert', {
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
      }),
      // Forged row: chain authorization explicitly false.
      smtpRow('smtp-forged-chain-false', {
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        certificate: {
          ...trustedCertificate,
          chainAuthorized: false,
          authorizationError: 'unable to get local issuer certificate',
        },
      }),
      // Forged row: chain authorization missing.
      smtpRow('smtp-forged-chain-missing', {
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        certificate: { ...trustedCertificate, chainAuthorized: undefined },
      }),
      // Forged row: hostname authorization explicitly false.
      smtpRow('smtp-forged-hostname-false', {
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        certificate: {
          ...trustedCertificate,
          hostnameAuthorized: false,
          authorizationError: "Hostname/IP doesn't match certificate's altnames",
        },
      }),
      // Forged row: hostname authorization missing.
      smtpRow('smtp-forged-hostname-missing', {
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: true,
        certificate: { ...trustedCertificate, hostnameAuthorized: undefined },
      }),
      // Raw success asserted without a negotiated session.
      smtpRow('smtp-tls-not-negotiated', {
        supportsStarttls: true,
        tlsNegotiated: false,
        tlsTrusted: true,
        certificate: trustedCertificate,
      }),
      // Raw success asserted without STARTTLS advertised.
      smtpRow('smtp-no-starttls', {
        supportsStarttls: false,
        tlsNegotiated: true,
        tlsTrusted: true,
        certificate: trustedCertificate,
      }),
      // Genuine SMTP failures keep their raw failure status.
      smtpRow(
        'smtp-timeout',
        { supportsStarttls: false, tlsNegotiated: false, tlsTrusted: false },
        { success: false, status: 'timeout', errorMessage: 'Connection timed out' }
      ),
      smtpRow(
        'smtp-refused',
        { supportsStarttls: false, tlsNegotiated: false, tlsTrusted: false },
        { success: false, status: 'refused', errorMessage: 'Connection refused' }
      ),
      // Non-SMTP rows are never remapped.
      {
        id: 'mtasts-success',
        snapshotId: 'snapshot-1',
        probeType: 'mta_sts',
        status: 'success',
        hostname: 'mta-sts-a.example.com',
        port: 443,
        success: true,
        errorMessage: null,
        probedAt,
        responseTimeMs: 100,
        probeData: null,
      },
      {
        id: 'mtasts-failed',
        snapshotId: 'snapshot-1',
        probeType: 'mta_sts',
        status: 'error',
        hostname: 'mta-sts-b.example.com',
        port: 443,
        success: false,
        errorMessage: 'TLS handshake failed',
        probedAt,
        responseTimeMs: 100,
        probeData: null,
      },
    ];

    const makeRepo = (fixtures: ProbeObservation[]) => {
      const selectWhere = vi.fn(async () => fixtures);
      const mockDb = {
        select: vi.fn(),
        selectOne: vi.fn(),
        selectWhere,
        insert: vi.fn(),
        insertMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        getDrizzle: vi.fn(),
      } as unknown as IDatabaseAdapter;
      return { repo: new ProbeObservationRepository(mockDb), selectWhere };
    };

    it('findBySnapshotId reads untrusted SMTP success as error without mutating rows', async () => {
      const fixtures = makeFixtures();
      const before = structuredClone(fixtures);
      const { repo, selectWhere } = makeRepo(fixtures);

      const results = await repo.findBySnapshotId('snapshot-1');

      expect(selectWhere).toHaveBeenCalledTimes(1);
      expect(selectWhere).toHaveBeenCalledWith(probeObservations, expect.anything());
      expect(results).toHaveLength(fixtures.length);
      // Sorted by hostname: mta-sts rows first, then mx rows.
      expect(results.map((r) => r.id)).toEqual([
        'mtasts-success',
        'mtasts-failed',
        'smtp-forged-chain-false',
        'smtp-forged-chain-missing',
        'smtp-forged-hostname-false',
        'smtp-forged-hostname-missing',
        'smtp-forged-no-cert',
        'smtp-legacy-no-trust',
        'smtp-legacy-null',
        'smtp-no-starttls',
        'smtp-refused',
        'smtp-timeout',
        'smtp-tls-not-negotiated',
        'smtp-trusted',
      ]);

      const byId = new Map(results.map((r) => [r.id, r]));

      // Trusted SMTP row is returned unchanged.
      expect(byId.get('smtp-trusted')).toEqual(fixtures[0]);

      // Every untrusted SMTP success row reads as success:false / status:error.
      for (const id of [
        'smtp-legacy-null',
        'smtp-legacy-no-trust',
        'smtp-forged-no-cert',
        'smtp-forged-chain-false',
        'smtp-forged-chain-missing',
        'smtp-forged-hostname-false',
        'smtp-forged-hostname-missing',
        'smtp-tls-not-negotiated',
        'smtp-no-starttls',
      ]) {
        expect(byId.get(id)?.success).toBe(false);
        expect(byId.get(id)?.status).toBe('error');
      }

      // Genuine SMTP failures keep their raw failure status.
      expect(byId.get('smtp-timeout')).toMatchObject({
        success: false,
        status: 'timeout',
        errorMessage: 'Connection timed out',
      });
      expect(byId.get('smtp-refused')).toMatchObject({
        success: false,
        status: 'refused',
      });

      // Non-SMTP rows are completely unchanged.
      expect(byId.get('mtasts-success')).toEqual(fixtures[12]);
      expect(byId.get('mtasts-failed')).toEqual(fixtures[13]);

      // Nested diagnostics are preserved byte-for-byte on normalized rows.
      expect(byId.get('smtp-forged-chain-false')?.probeData).toEqual(fixtures[4].probeData);
      expect(byId.get('smtp-forged-hostname-false')?.probeData).toEqual(fixtures[6].probeData);
      expect(byId.get('smtp-legacy-null')?.errorMessage).toBeNull();
      expect(byId.get('smtp-legacy-null')?.responseTimeMs).toBe(100);

      // Adapter-returned fixture objects were not mutated.
      expect(fixtures).toEqual(before);
    });

    it('findSuccessfulSmtpProbes requires the full trust contract', async () => {
      const { repo } = makeRepo(makeFixtures());

      const results = await repo.findSuccessfulSmtpProbes('snapshot-1');

      expect(results.map((r) => r.id)).toEqual(['smtp-trusted']);
      expect(results[0].success).toBe(true);
      expect(results[0].status).toBe('success');
    });

    it('countByStatus buckets untrusted SMTP success as error, preserving raw failures', async () => {
      const { repo } = makeRepo(makeFixtures());

      const counts = await repo.countByStatus('snapshot-1');

      expect(counts).toEqual({
        success: 2, // trusted SMTP + successful MTA-STS
        timeout: 1, // genuine SMTP timeout keeps its raw bucket
        refused: 1, // genuine SMTP refusal keeps its raw bucket
        error: 10, // 9 untrusted/forged SMTP rows + failed MTA-STS
        other: 0,
      });
    });

    it('getSummary counts untrusted SMTP success as failed and leaves totals untouched', async () => {
      const { repo } = makeRepo(makeFixtures());

      const summary = await repo.getSummary('snapshot-1');

      expect(summary.total).toBe(14);
      expect(summary.successful).toBe(2); // trusted SMTP + successful MTA-STS
      expect(summary.failed).toBe(12);
      expect(summary.byType).toEqual({ smtp_starttls: 12, mta_sts: 2 });
      expect(summary.avgResponseTimeMs).toBe(100);
    });
  });
});
