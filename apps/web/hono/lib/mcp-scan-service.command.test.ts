import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  proxyToCollector: vi.fn(),
}));

vi.mock('@dns-ops/db', () => ({
  DomainRepository: class {
    findById = mocks.findById;
  },
  McpCommandRepository: class {
    claim = mocks.claim;
    complete = mocks.complete;
  },
}));

vi.mock('./collector-proxy.js', () => ({ proxyToCollector: mocks.proxyToCollector }));

import { consumeMcpScanQuota, resetMcpScanQuotaForTest } from './mcp-scan-rate-limit.js';
import { McpScanService } from './mcp-scan-service.js';

function service() {
  return new McpScanService({} as never, {} as never, {
    tenantId: 'tenant-1',
    principalId: 'principal-1',
    actorId: 'actor-1',
    scopes: new Set(['SCAN_REQUEST']),
  });
}

describe('McpScanService command controls', () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetMcpScanQuotaForTest();
  });

  it('denies a cross-tenant registered-domain ID before claiming or proxying a scan', async () => {
    mocks.findById.mockResolvedValue({
      id: 'domain-other',
      tenantId: 'tenant-other',
      normalizedName: 'other.example',
    });

    await expect(
      service().request({ domainId: 'domain-other', idempotencyKey: 'key-1' })
    ).resolves.toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Registered domain not found' },
      replayed: false,
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.proxyToCollector).not.toHaveBeenCalled();
  });

  it('replays a completed scan command without making another collector request', async () => {
    mocks.findById.mockResolvedValue({
      id: 'domain-1',
      tenantId: 'tenant-1',
      normalizedName: 'example.com',
    });
    mocks.claim.mockResolvedValue({
      state: 'REPLAY',
      command: {
        id: 'command-1',
        response: { ok: true, value: { snapshotId: 'snapshot-1' }, replayed: false },
      },
    });

    await expect(
      service().request({ domainId: 'domain-1', idempotencyKey: 'key-1' })
    ).resolves.toEqual({
      ok: true,
      value: { snapshotId: 'snapshot-1' },
      replayed: true,
    });
    expect(mocks.proxyToCollector).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('persists a rate-limited command without proxying a collector scan', async () => {
    mocks.findById.mockResolvedValue({
      id: 'domain-1',
      tenantId: 'tenant-1',
      normalizedName: 'example.com',
    });
    mocks.claim.mockResolvedValue({ state: 'CLAIMED', command: { id: 'command-1' } });
    mocks.complete.mockResolvedValue(undefined);
    for (let index = 0; index < 10; index += 1) consumeMcpScanQuota('tenant-1');

    await expect(
      service().request({ domainId: 'domain-1', idempotencyKey: 'key-rate-limited' })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
      replayed: false,
    });
    expect(mocks.proxyToCollector).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith(
      'tenant-1',
      'command-1',
      expect.objectContaining({ error: { code: 'RATE_LIMITED', message: expect.any(String) } }),
      undefined,
      'FAILED'
    );
  });
});
