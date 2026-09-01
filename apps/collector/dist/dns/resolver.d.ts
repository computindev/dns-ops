/**
 * DNS Resolver
 *
 * Performs actual DNS queries using Node.js dns module.
 * Supports both recursive and authoritative resolution.
 *
 * Error mapping uses standardized DNS_RCODE constants from @dns-ops/contracts
 * for consistent status classification across the codebase.
 */
import type { DNSQuery, DNSQueryResult, VantageInfo } from './types.js';
export declare class DNSResolver {
    /**
     * Perform a DNS query
     */
    query(query: DNSQuery, vantage: VantageInfo): Promise<DNSQueryResult>;
    /**
     * Perform the actual DNS query based on record type
     */
    private performQuery;
    private queryA;
    private queryAAAA;
    private queryMX;
    private queryTXT;
    private queryNS;
    private queryCNAME;
    private querySOA;
    private queryCAA;
}
//# sourceMappingURL=resolver.d.ts.map