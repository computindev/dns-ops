import { isIP } from 'node:net';

/**
 * SSRF Guard - Bead 10
 *
 * Prevents Server-Side Request Forgery by blocking:
 * - Private/internal address space (RFC 1918, RFC 4193)
 * - Loopback addresses
 * - Link-local addresses
 * - Multicast addresses
 * - Reserved addresses
 * - All IPv6 targets until a complete public-address policy is maintained
 *
 * Security review: docs/security/probe-sandbox-review.md
 */

export interface SSRFCheckResult {
  allowed: boolean;
  reason?: string;
  blockedCategory?: 'private' | 'loopback' | 'link-local' | 'multicast' | 'reserved' | 'invalid';
}

// Conservative denylist for the complete IANA IPv4 Special-Purpose Address
// Registry plus multicast. Entries covering a smaller registered allocation
// deliberately deny their entire enclosing prefix; keep this list in sync with
// NON_GLOBAL_IPV4_CIDRS in tools/controlled-live-harness/runner.mjs.
const BLOCKED_IPV4_RANGES = [
  { start: 0x00000000, end: 0x00ffffff, name: '0.0.0.0/8 (this network)' },
  { start: 0x0a000000, end: 0x0affffff, name: '10.0.0.0/8 (private)' },
  { start: 0x64400000, end: 0x647fffff, name: '100.64.0.0/10 (shared address space)' },
  { start: 0x7f000000, end: 0x7fffffff, name: '127.0.0.0/8 (loopback)' },
  { start: 0xa9fe0000, end: 0xa9feffff, name: '169.254.0.0/16 (link-local)' },
  { start: 0xac100000, end: 0xac1fffff, name: '172.16.0.0/12 (private)' },
  { start: 0xc0000000, end: 0xc00000ff, name: '192.0.0.0/24 (IETF protocol assignments)' },
  { start: 0xc0000200, end: 0xc00002ff, name: '192.0.2.0/24 (documentation)' },
  { start: 0xc01fc400, end: 0xc01fc4ff, name: '192.31.196.0/24 (AS112-v4)' },
  { start: 0xc034c100, end: 0xc034c1ff, name: '192.52.193.0/24 (AMT)' },
  { start: 0xc0586300, end: 0xc05863ff, name: '192.88.99.0/24 (deprecated 6to4 relay anycast)' },
  { start: 0xc0a80000, end: 0xc0a8ffff, name: '192.168.0.0/16 (private)' },
  { start: 0xc0af3000, end: 0xc0af30ff, name: '192.175.48.0/24 (direct delegation AS112 service)' },
  { start: 0xc6120000, end: 0xc613ffff, name: '198.18.0.0/15 (benchmarking)' },
  { start: 0xc6336400, end: 0xc63364ff, name: '198.51.100.0/24 (documentation)' },
  { start: 0xcb007100, end: 0xcb0071ff, name: '203.0.113.0/24 (documentation)' },
  { start: 0xe0000000, end: 0xefffffff, name: '224.0.0.0/4 (multicast)' },
  { start: 0xf0000000, end: 0xffffffff, name: '240.0.0.0/4 (reserved)' },
];

/**
 * Check if an IPv4 address is in a blocked range
 *
 * Note: Uses >>> 0 to convert to unsigned 32-bit integer,
 * avoiding signed integer overflow when the first octet is >= 128.
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return -1;
  }
  // Use >>> 0 to ensure unsigned 32-bit result (avoids negative numbers)
  return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

/**
 * Check if an IPv4 address is blocked
 */
function checkIPv4(ip: string): SSRFCheckResult {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === -1) {
    return { allowed: false, reason: 'Invalid IPv4 address', blockedCategory: 'invalid' };
  }

  for (const range of BLOCKED_IPV4_RANGES) {
    if (ipInt >= range.start && ipInt <= range.end) {
      return {
        allowed: false,
        reason: `Blocked: ${range.name}`,
        blockedCategory: range.name.includes('loopback')
          ? 'loopback'
          : range.name.includes('link-local')
            ? 'link-local'
            : range.name.includes('multicast')
              ? 'multicast'
              : range.name.includes('private')
                ? 'private'
                : 'reserved',
      };
    }
  }

  return { allowed: true };
}

/**
 * Reject IPv6 targets until a complete, maintained IPv6 public-address policy
 * exists. This intentionally includes IPv4-mapped and IPv4-compatible forms:
 * the controlled live harness accepts only validated public IPv4 answers, and
 * active probes must enforce the same boundary.
 */
function checkIPv6(ip: string): SSRFCheckResult {
  const normalized = ip
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, '');

  if (normalized.includes('%')) {
    return {
      allowed: false,
      reason: 'IPv6 zone identifier is not allowed',
      blockedCategory: 'invalid',
    };
  }

  if (isIP(normalized) !== 6) {
    return { allowed: false, reason: 'Invalid IPv6 address', blockedCategory: 'invalid' };
  }

  return {
    allowed: false,
    reason: 'Blocked: IPv6 targets are not permitted until a complete maintained policy exists',
    blockedCategory: 'reserved',
  };
}

/**
 * Check if a hostname is blocked (localhost, etc.)
 */
function checkHostname(hostname: string): SSRFCheckResult {
  const lower = hostname.toLowerCase().trim();

  // Block localhost variants
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    return { allowed: false, reason: 'Blocked: localhost', blockedCategory: 'loopback' };
  }

  // Block empty hostname
  if (!lower) {
    return { allowed: false, reason: 'Blocked: empty hostname', blockedCategory: 'invalid' };
  }

  return { allowed: true };
}

/**
 * Main SSRF check function
 * Validates IP addresses and hostnames
 */
export function checkSSRF(target: string): SSRFCheckResult {
  // Try parsing as IP address first
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) {
    return checkIPv4(target);
  }

  // Check for IPv6 format (contains colons)
  if (target.includes(':')) {
    return checkIPv6(target);
  }

  // Otherwise treat as hostname
  return checkHostname(target);
}

/**
 * Validate that a URL is safe to fetch
 * Checks hostname/IP against SSRF blocklists
 */
export function validateUrl(url: string): SSRFCheckResult & { url?: URL } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'Invalid URL', blockedCategory: 'invalid' };
  }

  // Only allow http/https protocols
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      allowed: false,
      reason: `Blocked protocol: ${parsed.protocol}`,
      blockedCategory: 'invalid',
    };
  }

  // Check the hostname
  const result = checkSSRF(parsed.hostname);
  if (!result.allowed) {
    return result;
  }

  return { allowed: true, url: parsed };
}

/**
 * Check if an IP address is in the allowed range
 * Used after DNS resolution to prevent DNS rebinding attacks
 * @deprecated Use checkSSRF directly - this is now an alias
 */
export function checkResolvedIP(ip: string): SSRFCheckResult {
  return checkSSRF(ip);
}

/** Race DNS resolution against a caller-owned cumulative deadline. */
function withAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(new Error('DNS resolution aborted'));

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('DNS resolution aborted'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    );
  });
}

/**
 * Resolve a hostname and verify a public IPv4 address before a caller pins it.
 * DNS failures are rejected rather than falling back to hostname resolution.
 */
export async function resolveAndCheck(
  hostname: string,
  signal?: AbortSignal
): Promise<{ allowed: true; ip: string } | (SSRFCheckResult & { allowed: false })> {
  // Check hostname/IP against SSRF blocklists first (covers empty, localhost, IP literals).
  const ssrfResult = checkSSRF(hostname);
  if (!ssrfResult.allowed) {
    return { ...ssrfResult, allowed: false as const };
  }

  // Public IPv4 literals are already resolved and checked.
  if (isIP(hostname) === 4) {
    return { allowed: true, ip: hostname };
  }

  try {
    const { promises: dnsPromises } = await import('node:dns');
    const resolved = await withAbort(dnsPromises.lookup(hostname, { family: 4 }), signal);
    const address = typeof resolved === 'string' ? resolved : resolved.address;
    const family = typeof resolved === 'string' ? isIP(address) : resolved.family;
    const ipCheck = checkSSRF(address);
    if (!ipCheck.allowed) {
      return {
        allowed: false,
        reason: `DNS rebinding blocked: ${hostname} resolved to ${address} (${ipCheck.reason})`,
        blockedCategory: ipCheck.blockedCategory,
      };
    }
    if (family !== 4 || isIP(address) !== 4) {
      return {
        allowed: false,
        reason: `DNS resolution did not return a public IPv4 address for ${hostname}`,
        blockedCategory: 'invalid',
      };
    }

    return { allowed: true, ip: address };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      allowed: false,
      reason: `DNS resolution failed for ${hostname}: ${message}`,
      blockedCategory: 'invalid',
    };
  }
}
