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
 * - IPv4-mapped IPv6 addresses that embed private/loopback IPv4
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
 * Extract the embedded IPv4 address from an IPv4-mapped IPv6 address.
 *
 * IPv4-mapped IPv6 format: ::ffff:a.b.c.d  (RFC 4291 §2.5.5.2)
 *
 * These addresses represent IPv4 nodes in an IPv6 address space. An SSRF
 * bypass would occur if we checked the outer IPv6 form and missed that the
 * embedded IPv4 is private/loopback. We extract and check through checkIPv4.
 *
 * @returns The dotted-decimal IPv4 string, or null if not IPv4-mapped.
 */
function extractIPv4FromMapped(normalized: string): string | null {
  let address = normalized;
  const dottedTail = address.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dottedTail) {
    const octets = dottedTail.slice(1).map(Number);
    if (octets.some((octet) => octet < 0 || octet > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${address.slice(0, dottedTail.index)}${high}:${low}`;
  }

  const compressedParts = address.split('::');
  if (compressedParts.length > 2) return null;
  const left = compressedParts[0] ? compressedParts[0].split(':') : [];
  const right =
    compressedParts.length === 2 && compressedParts[1] ? compressedParts[1].split(':') : [];
  const missing = compressedParts.length === 2 ? 8 - left.length - right.length : 0;
  const parts =
    compressedParts.length === 2
      ? [...left, ...Array(Math.max(0, missing)).fill('0'), ...right]
      : left;
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const hextets = parts.map((part) => Number.parseInt(part, 16));
  const mappedPrefix = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
  const compatiblePrefix = hextets.slice(0, 6).every((part) => part === 0);
  if (!mappedPrefix && !compatiblePrefix) return null;

  const high = hextets[6];
  const low = hextets[7];
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

/**
 * Normalize and check IPv6 address.
 *
 * SECURITY: IPv4-mapped IPv6 (::ffff:x.x.x.x) is handled first by extracting
 * the embedded IPv4 and running it through checkIPv4. This ensures correct
 * classification (loopback/private/public) rather than a blanket "unspecified"
 * block.
 */
function checkIPv6(ip: string): SSRFCheckResult {
  // Normalize IPv6 (lowercase, strip brackets)
  const normalized = ip
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, '');

  // Zone identifiers are meaningful only in a local interface context and are
  // never valid outbound probe targets. Reject rather than normalize them.
  if (normalized.includes('%')) {
    return {
      allowed: false,
      reason: 'IPv6 zone identifier is not allowed',
      blockedCategory: 'invalid',
    };
  }

  if (normalized === '::1') {
    return { allowed: false, reason: 'Blocked: ::1/128 (loopback)', blockedCategory: 'loopback' };
  }
  if (normalized === '::') {
    return { allowed: false, reason: 'Blocked: ::/128 (unspecified)', blockedCategory: 'reserved' };
  }

  // --- IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) ---
  // Must be checked BEFORE the generic prefix list because ::ffff: starts
  // with :: and would otherwise be caught as "unspecified" with wrong category.
  const embeddedIPv4 = extractIPv4FromMapped(normalized);
  if (embeddedIPv4 !== null) {
    const ipv4Result = checkIPv4(embeddedIPv4);
    if (!ipv4Result.allowed) {
      // Preserve exact category from the IPv4 check (loopback, private, etc.)
      return {
        allowed: false,
        reason: `Blocked: IPv4-mapped IPv6 embeds blocked IPv4 – ${ipv4Result.reason}`,
        blockedCategory: ipv4Result.blockedCategory,
      };
    }
    // Embedded IPv4 is public — allow the mapped address
    return { allowed: true };
  }

  if (isIP(normalized) !== 6) {
    return { allowed: false, reason: 'Invalid IPv6 address', blockedCategory: 'invalid' };
  }

  // Classify the complete CIDR range from the first 16-bit hextet rather than
  // matching one textual spelling. This covers compressed and expanded forms.
  const firstHextetText = normalized.split(':').find((part) => part.length > 0);
  const firstHextet = firstHextetText ? Number.parseInt(firstHextetText, 16) : Number.NaN;
  if (!Number.isFinite(firstHextet) || firstHextet < 0 || firstHextet > 0xffff) {
    return { allowed: false, reason: 'Invalid IPv6 address', blockedCategory: 'invalid' };
  }
  if ((firstHextet & 0xffc0) === 0xfe80) {
    return {
      allowed: false,
      reason: 'Blocked: fe80::/10 (link-local)',
      blockedCategory: 'link-local',
    };
  }
  if ((firstHextet & 0xfe00) === 0xfc00) {
    return {
      allowed: false,
      reason: 'Blocked: fc00::/7 (unique local)',
      blockedCategory: 'private',
    };
  }
  if ((firstHextet & 0xff00) === 0xff00) {
    return {
      allowed: false,
      reason: 'Blocked: ff00::/8 (multicast)',
      blockedCategory: 'multicast',
    };
  }

  return { allowed: true };
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

/**
 * Resolve a hostname and verify the resolved IP is safe.
 *
 * Pre-checks the DNS result against the DNS rebinding case: validateUrl()
 * checks the hostname string, while a downstream client may resolve DNS
 * independently. This function resolves first, checks the result, and returns
 * the address so strict callers can pin their connection to it. It retains
 * fail-open behavior on DNS errors for compatibility-sensitive webhook callers.
 *
 * NOTE: This helper intentionally retains its fail-open DNS-error behavior
 * for compatibility-sensitive webhook callers. Callers that need strict
 * pinning must resolve with a fail-closed policy and pass a static `lookup`
 * callback to their native Node request, as the MTA-STS probe does.
 *
 * @returns The resolved IP address if safe, or an SSRFCheckResult if blocked.
 */
export async function resolveAndCheck(
  hostname: string
): Promise<{ allowed: true; ip: string } | (SSRFCheckResult & { allowed: false })> {
  // Check hostname/IP against SSRF blocklists first (covers empty, localhost, IP literals)
  const ssrfResult = checkSSRF(hostname);
  if (!ssrfResult.allowed) {
    return { ...ssrfResult, allowed: false as const };
  }

  // Skip resolution for IP literals — we already checked them above
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(':')) {
    return { allowed: true, ip: hostname };
  }

  try {
    const { promises: dnsPromises } = await import('node:dns');
    const { address } = await dnsPromises.lookup(hostname);
    const ipCheck = checkSSRF(address);

    if (!ipCheck.allowed) {
      return {
        allowed: false,
        reason: `DNS rebinding blocked: ${hostname} resolved to ${address} (${ipCheck.reason})`,
        blockedCategory: ipCheck.blockedCategory,
      };
    }

    return { allowed: true, ip: address };
  } catch {
    // DNS resolution failure (ENOTFOUND, ESERVFAIL, etc.) is NOT treated as a
    // rebinding block for compatibility-sensitive webhook callers. Strict
    // probe callers use their own fail-closed resolution path instead.
    return { allowed: true, ip: hostname };
  }
}
