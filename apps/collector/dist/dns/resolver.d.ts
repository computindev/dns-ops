/**
 * DNS Resolver
 *
 * Performs wire-format DNS queries for every supported record type so answer
 * TTLs, response codes, and flags are preserved exactly. Authoritative targets
 * are queried with recursion disabled; recursive vantages request recursion.
 */
import type { DNSQuery, DNSQueryResult, VantageInfo } from './types.js';
export declare class DNSResolver {
    /** Perform a DNS query and preserve real wire evidence. */
    query(query: DNSQuery, vantage: VantageInfo): Promise<DNSQueryResult>;
    /** Build a failure result while preserving the query's recursion policy. */
    private errorResult;
}
//# sourceMappingURL=resolver.d.ts.map