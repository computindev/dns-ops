const SCAN_LIMIT = 10;
const SCAN_WINDOW_MS = 60_000;

type Bucket = { remaining: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Limits new MCP scan requests per tenant. Replayed idempotent commands bypass
 * this guard in McpScanService and return their saved result. The collector
 * keeps its own equivalent limit as the service-of-record boundary.
 */
export function consumeMcpScanQuota(
  tenantId: string
): { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = buckets.get(tenantId);
  const bucket =
    !existing || existing.resetAt <= now
      ? { remaining: SCAN_LIMIT, resetAt: now + SCAN_WINDOW_MS }
      : existing;

  if (bucket.remaining <= 0) {
    buckets.set(tenantId, bucket);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.remaining -= 1;
  buckets.set(tenantId, bucket);
  return { allowed: true, remaining: bucket.remaining };
}

/** Test-only reset; production uses process-local fixed-window buckets. */
export function resetMcpScanQuotaForTest(): void {
  buckets.clear();
}
