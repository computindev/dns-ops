/**
 * Probe Observation Persistence Tests - DATA-003
 *
 * Tests that probe results are persisted to the database.
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { ProbeObservationRepository } from '@dns-ops/db';
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
});
