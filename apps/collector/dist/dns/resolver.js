/**
 * DNS Resolver
 *
 * Performs actual DNS queries using Node.js dns module.
 * Supports both recursive and authoritative resolution.
 *
 * Error mapping uses standardized DNS_RCODE constants from @dns-ops/contracts
 * for consistent status classification across the codebase.
 */
import { Resolver } from 'node:dns/promises';
import { DNS_RCODE } from '@dns-ops/contracts';
export class DNSResolver {
    /**
     * Perform a DNS query
     */
    async query(query, vantage) {
        const startTime = Date.now();
        try {
            // Create resolver with specific server if provided
            const resolver = new Resolver();
            if (vantage.type === 'public-recursive') {
                resolver.setServers([vantage.identifier]);
            }
            else if (vantage.type === 'authoritative') {
                // For authoritative queries, we'd need to implement custom logic
                // For now, use the default resolver
                resolver.setServers([vantage.identifier]);
            }
            // Map query type to Node.js dns method
            const result = await this.performQuery(resolver, query);
            const responseTime = Date.now() - startTime;
            return {
                query,
                vantage,
                success: true,
                responseCode: DNS_RCODE.NOERROR,
                flags: {
                    // NOTE: aa (Authoritative Answer) flag is always false because Node.js
                    // dns module doesn't expose the actual AA bit from the DNS response.
                    // For true authoritative queries, use dns-packet library.
                    // See docs/architecture/runtime-topology.md for details.
                    aa: false,
                    tc: false,
                    rd: true,
                    ra: true,
                    ad: false,
                    cd: false,
                },
                answers: result.answers,
                authority: result.authority || [],
                additional: result.additional || [],
                responseTime,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Determine error type using standardized RCODE constants
            let responseCode = DNS_RCODE.SERVFAIL;
            if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('NXDOMAIN')) {
                responseCode = DNS_RCODE.NXDOMAIN;
            }
            else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('REFUSED')) {
                responseCode = DNS_RCODE.REFUSED;
            }
            else if (errorMessage.includes('timeout') ||
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('timed out')) {
                responseCode = DNS_RCODE.SERVFAIL; // No specific timeout RCODE; use SERVFAIL
            }
            return {
                query,
                vantage,
                success: false,
                responseCode,
                flags: {
                    // NOTE: aa (Authoritative Answer) flag is always false because Node.js
                    // dns module doesn't expose the actual AA bit from the DNS response.
                    // For true authoritative queries, use dns-packet library.
                    // See docs/architecture/runtime-topology.md for details.
                    aa: false,
                    tc: false,
                    rd: true,
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
    /**
     * Perform the actual DNS query based on record type
     */
    async performQuery(resolver, query) {
        const { name, type } = query;
        switch (type) {
            case 'A':
                return this.queryA(resolver, name);
            case 'AAAA':
                return this.queryAAAA(resolver, name);
            case 'MX':
                return this.queryMX(resolver, name);
            case 'TXT':
                return this.queryTXT(resolver, name);
            case 'NS':
                return this.queryNS(resolver, name);
            case 'CNAME':
                return this.queryCNAME(resolver, name);
            case 'SOA':
                return this.querySOA(resolver, name);
            case 'CAA':
                return this.queryCAA(resolver, name);
            default:
                throw new Error(`Unsupported record type: ${type}`);
        }
    }
    async queryA(resolver, name) {
        const addresses = await resolver.resolve4(name);
        return {
            answers: addresses.map((addr) => ({
                name,
                type: 'A',
                ttl: 300, // Default TTL
                data: addr,
            })),
        };
    }
    async queryAAAA(resolver, name) {
        const addresses = await resolver.resolve6(name);
        return {
            answers: addresses.map((addr) => ({
                name,
                type: 'AAAA',
                ttl: 300,
                data: addr,
            })),
        };
    }
    async queryMX(resolver, name) {
        const records = await resolver.resolveMx(name);
        return {
            answers: records.map((mx) => ({
                name,
                type: 'MX',
                ttl: 300,
                data: `${mx.priority} ${mx.exchange}`,
            })),
        };
    }
    async queryTXT(resolver, name) {
        const records = await resolver.resolveTxt(name);
        return {
            answers: records.map((txt) => ({
                name,
                type: 'TXT',
                ttl: 300,
                data: txt.join(''), // Join multiple strings
            })),
        };
    }
    async queryNS(resolver, name) {
        const records = await resolver.resolveNs(name);
        return {
            answers: records.map((ns) => ({
                name,
                type: 'NS',
                ttl: 300,
                data: ns,
            })),
        };
    }
    async queryCNAME(resolver, name) {
        const records = await resolver.resolveCname(name);
        return {
            answers: records.map((cname) => ({
                name,
                type: 'CNAME',
                ttl: 300,
                data: cname,
            })),
        };
    }
    async querySOA(resolver, name) {
        const soa = (await resolver.resolveSoa(name));
        const minTTL = soa.minttl ?? soa.minimumTTL ?? 300;
        return {
            answers: [
                {
                    name,
                    type: 'SOA',
                    ttl: minTTL,
                    data: `${soa.nsname} ${soa.hostmaster} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${minTTL}`,
                },
            ],
        };
    }
    async queryCAA(resolver, name) {
        // Node.js doesn't have native CAA support, use resolveAny and filter
        try {
            const records = await resolver.resolveAny(name);
            const caaRecords = records.filter((r) => r.type === 'CAA');
            return {
                answers: caaRecords.map((caa) => ({
                    name,
                    type: 'CAA',
                    ttl: 300,
                    data: `${caa.critical ?? 0} ${caa.issue ?? ''} "${caa.value ?? ''}"`,
                })),
            };
        }
        catch {
            return { answers: [] };
        }
    }
}
//# sourceMappingURL=resolver.js.map