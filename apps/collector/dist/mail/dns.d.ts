/**
 * DNS Resolution utilities for mail checking
 */
/**
 * Resolve TXT records for a hostname
 */
export declare function resolveTXT(hostname: string): Promise<string[]>;
/**
 * Determine whether a domain exists without treating a NOERROR/NODATA answer as
 * non-existence. Only NXDOMAIN (ENOTFOUND) proves absence.
 */
export declare function resolveDomainExists(domain: string): Promise<boolean>;
/**
 * MX record structure
 */
export interface MxRecord {
    exchange: string;
    priority: number;
}
/**
 * Resolve MX records for a domain
 */
export declare function resolveMX(domain: string): Promise<MxRecord[]>;
//# sourceMappingURL=dns.d.ts.map