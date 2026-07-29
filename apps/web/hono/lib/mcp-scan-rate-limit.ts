const SCAN_LIMIT = 10;
const SCAN_WINDOW_MS = 60_000;

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

/**
 * Limits new MCP scan requests per tenant with the same ten-token, one-minute
 * incremental-refill algorithm used by the collector. Replayed idempotent
 * commands bypass this guard in McpScanService and return their saved result.
 */
export function consumeMcpScanQuota(
  tenantId: string
): { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(tenantId) ?? { tokens: SCAN_LIMIT, lastRefill: now };
  const tokensToAdd = Math.floor(((now - bucket.lastRefill) / SCAN_WINDOW_MS) * SCAN_LIMIT);
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(SCAN_LIMIT, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    buckets.set(tenantId, bucket);
    return { allowed: false, retryAfterSeconds: Math.ceil(SCAN_WINDOW_MS / 1000) };
  }

  bucket.tokens -= 1;
  buckets.set(tenantId, bucket);
  return { allowed: true, remaining: bucket.tokens };
}

/** Test-only reset; production uses process-local fixed-window buckets. */
export function resetMcpScanQuotaForTest(): void {
  buckets.clear();
}
