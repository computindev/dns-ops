/**
 * DNSSEC DNS Resolver - DNS-002
 *
 * Provides DNSKEY and DS query support using dns-packet library.
 * Node.js native dns module doesn't support these record types.
 */
import type { DNSAnswer, DNSQuery } from './types.js';
/**
 * Perform a DNS query using raw packet exchange
 * This allows querying for record types not supported by Node.js dns module
 */
export declare function queryWithDnsPacket(query: DNSQuery, dnsServer?: string): Promise<{
    answers: DNSAnswer[];
    authority: DNSAnswer[];
    additional: DNSAnswer[];
    flags: {
        aa: boolean;
        tc: boolean;
        rd: boolean;
        ra: boolean;
        ad: boolean;
        cd: boolean;
    };
    responseCode: number;
}>;
/**
 * Query DNSKEY records for a domain
 */
export declare function queryDNSKEY(domain: string): Promise<{
    success: boolean;
    answers: DNSAnswer[];
    error?: string;
}>;
/**
 * Query DS records for a domain (from parent zone)
 */
export declare function queryDS(domain: string): Promise<{
    success: boolean;
    answers: DNSAnswer[];
    error?: string;
}>;
//# sourceMappingURL=dnssec-resolver.d.ts.map