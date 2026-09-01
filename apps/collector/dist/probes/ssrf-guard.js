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
// IPv4 private ranges (RFC 1918 + others)
const BLOCKED_IPV4_RANGES = [
    { start: 0x00000000, end: 0x00ffffff, name: '0.0.0.0/8 (this network)' },
    { start: 0x7f000000, end: 0x7fffffff, name: '127.0.0.0/8 (loopback)' },
    { start: 0x0a000000, end: 0x0affffff, name: '10.0.0.0/8 (private)' },
    { start: 0xac100000, end: 0xac1fffff, name: '172.16.0.0/12 (private)' },
    { start: 0xc0a80000, end: 0xc0a8ffff, name: '192.168.0.0/16 (private)' },
    { start: 0xa9fe0000, end: 0xa9feffff, name: '169.254.0.0/16 (link-local)' },
    { start: 0xe0000000, end: 0xefffffff, name: '224.0.0.0/4 (multicast)' },
    { start: 0xf0000000, end: 0xffffffff, name: '240.0.0.0/4 (reserved)' },
    { start: 0xc0000200, end: 0xc00002ff, name: '192.0.2.0/24 (TEST-NET-1)' },
    { start: 0xc6336400, end: 0xc63364ff, name: '198.51.100.0/24 (TEST-NET-2)' },
    { start: 0xcb007100, end: 0xcb0071ff, name: '203.0.113.0/24 (TEST-NET-3)' },
];
// IPv6 blocked ranges (prefix-based).
//
// fc00::/7 (unique local, RFC 4193) spans fc00:: through fdff::.
// In hex, the first byte is 0xfc or 0xfd — so we need BOTH 'fc' and 'fd'
// as prefixes. The original 'fc00:' prefix only covered the first /12 and
// missed fc01::, fc10::, fd00::, etc. Fixed in PR-06.
const BLOCKED_IPV6_PREFIXES = [
    { prefix: '::1', name: '::1/128 (loopback)' },
    { prefix: 'fe80:', name: 'fe80::/10 (link-local)' },
    { prefix: 'fc', name: 'fc00::/7 part fc (unique local)' },
    { prefix: 'fd', name: 'fc00::/7 part fd (unique local)' },
    { prefix: 'ff00:', name: 'ff00::/8 (multicast)' },
    { prefix: '::', name: '::/128 (unspecified)' },
];
/**
 * Check if an IPv4 address is in a blocked range
 *
 * Note: Uses >>> 0 to convert to unsigned 32-bit integer,
 * avoiding signed integer overflow when the first octet is >= 128.
 */
function ipv4ToInt(ip) {
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
function checkIPv4(ip) {
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
function extractIPv4FromMapped(normalized) {
    // ::ffff:a.b.c.d  (most common notation)
    const dotDecimalMatch = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (dotDecimalMatch) {
        return dotDecimalMatch[1];
    }
    // ::ffff:hhhh:hhhh  (hex notation, e.g. ::ffff:7f00:0001 = ::ffff:127.0.0.1)
    const hexMatch = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
        const high = parseInt(hexMatch[1], 16);
        const low = parseInt(hexMatch[2], 16);
        const a = (high >> 8) & 0xff;
        const b = high & 0xff;
        const c = (low >> 8) & 0xff;
        const d = low & 0xff;
        return `${a}.${b}.${c}.${d}`;
    }
    return null;
}
/**
 * Normalize and check IPv6 address.
 *
 * SECURITY: IPv4-mapped IPv6 (::ffff:x.x.x.x) is handled first by extracting
 * the embedded IPv4 and running it through checkIPv4. This ensures correct
 * classification (loopback/private/public) rather than a blanket "unspecified"
 * block.
 */
function checkIPv6(ip) {
    // Normalize IPv6 (lowercase, strip brackets)
    const normalized = ip
        .toLowerCase()
        .trim()
        .replace(/^\[|\]$/g, '');
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
    // --- Standard IPv6 prefix checks ---
    for (const blocked of BLOCKED_IPV6_PREFIXES) {
        if (normalized.startsWith(blocked.prefix)) {
            return {
                allowed: false,
                reason: `Blocked: ${blocked.name}`,
                blockedCategory: blocked.name.includes('loopback')
                    ? 'loopback'
                    : blocked.name.includes('link-local')
                        ? 'link-local'
                        : blocked.name.includes('multicast')
                            ? 'multicast'
                            : blocked.name.includes('local')
                                ? 'private'
                                : 'reserved',
            };
        }
    }
    return { allowed: true };
}
/**
 * Check if a hostname is blocked (localhost, etc.)
 */
function checkHostname(hostname) {
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
export function checkSSRF(target) {
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
export function validateUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
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
export function checkResolvedIP(ip) {
    return checkSSRF(ip);
}
/**
 * Resolve a hostname and verify the resolved IP is safe.
 *
 * Closes the DNS rebinding TOCTOU gap: validateUrl() checks the hostname
 * string, but fetch() resolves DNS independently. An attacker can register
 * a domain that resolves to a public IP on first query and a private IP
 * on the second. This function resolves first, checks the result, then
 * returns the resolved IP for the caller to connect to directly.
 *
 * NOTE: This narrows but does not fully close the TOCTOU window. Node's
 * `fetch()` re-resolves DNS independently — a sub-millisecond TTL switch
 * between our check and fetch's resolution is theoretically possible.
 * Full closure requires `net.connect({ lookup })` which only applies to
 * raw TCP/TLS (probe system), not HTTP fetch. The two-step check is the
 * industry-standard mitigation for HTTP-based SSRF.
 *
 * @returns The resolved IP address if safe, or an SSRFCheckResult if blocked.
 */
export async function resolveAndCheck(hostname) {
    // Check hostname/IP against SSRF blocklists first (covers empty, localhost, IP literals)
    const ssrfResult = checkSSRF(hostname);
    if (!ssrfResult.allowed) {
        return { ...ssrfResult, allowed: false };
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
    }
    catch {
        // DNS resolution failure (ENOTFOUND, ESERVFAIL, etc.) is NOT a rebinding
        // attack — it means the hostname doesn't exist. Let fetch() handle the
        // connection error naturally. Only block when resolution succeeds to a
        // private IP.
        return { allowed: true, ip: hostname };
    }
}
//# sourceMappingURL=ssrf-guard.js.map