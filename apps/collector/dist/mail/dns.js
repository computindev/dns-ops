/**
 * DNS Resolution utilities for mail checking
 */
import { resolveAny, resolveMx, resolveTxt } from 'node:dns/promises';
/**
 * Resolve TXT records for a hostname
 */
export async function resolveTXT(hostname) {
    const records = await resolveTxt(hostname);
    // Join multi-part TXT records
    return records.map((parts) => parts.join(''));
}
/**
 * Determine whether a domain exists without treating a NOERROR/NODATA answer as
 * non-existence. Only NXDOMAIN (ENOTFOUND) proves absence.
 */
export async function resolveDomainExists(domain) {
    try {
        await resolveAny(domain);
        return true;
    }
    catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : undefined;
        if (code === 'ENOTFOUND')
            return false;
        if (code === 'ENODATA')
            return true;
        throw error;
    }
}
/**
 * Resolve MX records for a domain
 */
export async function resolveMX(domain) {
    const records = await resolveMx(domain);
    return records.map((r) => ({
        exchange: r.exchange,
        priority: r.priority,
    }));
}
//# sourceMappingURL=dns.js.map