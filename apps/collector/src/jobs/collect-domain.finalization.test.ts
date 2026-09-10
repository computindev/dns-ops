import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

vi.mock('@dns-ops/db', () => ({
  DomainRepository: vi.fn(),
  SnapshotRepository: vi.fn(),
}));

vi.mock('../dns/collector.js', () => ({
  DNSCollector: vi.fn(),
}));

vi.mock('../middleware/error-tracking.js', () => ({
  getCollectorLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
  trackCollectionError: vi.fn(),
  trackCollectionResult: vi.fn(),
}));

vi.mock('../probes/domain-evidence.js', () => ({
  collectAndPersistDomainEvidence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./operational-condition-finalizer.js', () => ({
  finalizePersistedCanonicalConditions: vi.fn().mockResolvedValue({ outcomes: [] }),
}));

import { DomainRepository, SnapshotRepository } from '@dns-ops/db';
import { DNSCollector } from '../dns/collector.js';
import { collectDomainRoutes } from './collect-domain.js';
import { finalizePersistedCanonicalConditions } from './operational-condition-finalizer.js';

function app() {
  const server = new Hono<Env>();
  server.use('*', async (c, next) => {
    c.set('db', {} as Env['Variables']['db']);
    c.set('tenantId', 'tenant-1');
    c.set('actorId', 'actor-1');
    await next();
  });
  server.route('/api/collect', collectDomainRoutes);
  return server;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('collect-domain canonical finalization', () => {
  it('does not return success when canonical finalization fails', async () => {
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(DomainRepository).mockImplementation(function () {
      return {
        findByNameForTenant: async () => ({
          id: 'domain-1',
          normalizedName: 'example.com',
        }),
      };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(SnapshotRepository).mockImplementation(function () {
      return { findRecentByDomain: async () => null };
    } as never);
    // biome-ignore lint/complexity/useArrowFunction: must stay constructible
    vi.mocked(DNSCollector).mockImplementation(function () {
      return {
        collect: vi.fn().mockResolvedValue({
          snapshotId: 'snap-1',
          observationCount: 1,
          duration: 12,
          resultState: 'complete',
        }),
      };
    } as never);
    vi.mocked(finalizePersistedCanonicalConditions).mockRejectedValueOnce(
      new Error('canonical finalization failed')
    );

    const response = await app().request('/api/collect/domain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'example.com' }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Collection failed',
      code: 'COLLECTION_ERROR',
    });
  });
});
