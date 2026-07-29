import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeMcpScanQuota, resetMcpScanQuotaForTest } from './mcp-scan-rate-limit.js';

afterEach(() => {
  resetMcpScanQuotaForTest();
  vi.useRealTimers();
});

describe('MCP scan quota', () => {
  it('enforces the collector-aligned per-tenant ten-request window', () => {
    for (let index = 0; index < 10; index += 1) {
      expect(consumeMcpScanQuota('tenant-a')).toMatchObject({ allowed: true });
    }
    expect(consumeMcpScanQuota('tenant-a')).toMatchObject({
      allowed: false,
      retryAfterSeconds: expect.any(Number),
    });
  });

  it('refills one token after six seconds, like the collector token bucket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T18:20:00.000Z'));
    for (let index = 0; index < 10; index += 1) consumeMcpScanQuota('tenant-a');
    expect(consumeMcpScanQuota('tenant-a')).toMatchObject({ allowed: false });

    vi.advanceTimersByTime(6_000);
    expect(consumeMcpScanQuota('tenant-a')).toEqual({ allowed: true, remaining: 0 });
  });

  it('isolates quota buckets by tenant', () => {
    for (let index = 0; index < 10; index += 1) consumeMcpScanQuota('tenant-a');
    expect(consumeMcpScanQuota('tenant-a')).toMatchObject({ allowed: false });
    expect(consumeMcpScanQuota('tenant-b')).toMatchObject({ allowed: true, remaining: 9 });
  });
});
