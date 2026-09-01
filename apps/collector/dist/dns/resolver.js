/**
 * DNS Resolver
 *
 * Performs wire-format DNS queries for every supported record type so answer
 * TTLs, response codes, and flags are preserved exactly. Authoritative targets
 * are queried with recursion disabled; recursive vantages request recursion.
 */
import { DNS_RCODE } from '@dns-ops/contracts';
import { queryWithDnsPacket } from './dnssec-resolver.js';
const SUPPORTED_TYPES = new Set(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'CAA']);
export class DNSResolver {
    /** Perform a DNS query and preserve real wire evidence. */
    async query(query, vantage) {
        const startTime = Date.now();
        try {
            if (!SUPPORTED_TYPES.has(query.type)) {
                throw new Error(`Unsupported record type: ${query.type}`);
            }
            const result = await queryWithDnsPacket(query, vantage.identifier, {
                recursionDesired: vantage.type !== 'authoritative',
            });
            const success = result.responseCode === DNS_RCODE.NOERROR;
            const response = {
                query,
                vantage,
                success,
                responseCode: result.responseCode,
                flags: result.flags,
                answers: result.answers.filter((answer) => answer.type === query.type),
                authority: result.authority,
                additional: result.additional,
                responseTime: Date.now() - startTime,
            };
            if (!success) {
                response.error = `DNS query failed with rcode ${result.responseCode}`;
            }
            return response;
        }
        catch (error) {
            return this.errorResult(query, vantage, error, Date.now() - startTime);
        }
    }
    /** Build a failure result while preserving the query's recursion policy. */
    errorResult(query, vantage, error, responseTime) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let responseCode = DNS_RCODE.SERVFAIL;
        if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('NXDOMAIN')) {
            responseCode = DNS_RCODE.NXDOMAIN;
        }
        else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('REFUSED')) {
            responseCode = DNS_RCODE.REFUSED;
        }
        return {
            query,
            vantage,
            success: false,
            responseCode,
            flags: {
                aa: false,
                tc: false,
                rd: vantage.type !== 'authoritative',
                ra: false,
                ad: false,
                cd: false,
            },
            answers: [],
            authority: [],
            additional: [],
            responseTime,
            error: errorMessage,
        };
    }
}
//# sourceMappingURL=resolver.js.map