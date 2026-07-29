import { afterEach, describe, expect, it } from 'vitest';
import { consumeMcpScanQuota, resetMcpScanQuotaForTest } from './mcp-scan-rate-limit.js';

afterEach(resetMcpScanQuotaForTest);

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

  it('isolates quota buckets by tenant', () => {
    for (let index = 0; index < 10; index += 1) consumeMcpScanQuota('tenant-a');
    expect(consumeMcpScanQuota('tenant-a')).toMatchObject({ allowed: false });
    expect(consumeMcpScanQuota('tenant-b')).toMatchObject({ allowed: true, remaining: 9 });
  });
});
