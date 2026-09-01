/**
 * DNSSEC DNS Resolver - DNS-002
 *
 * Provides DNSKEY and DS query support using dns-packet library.
 * Node.js native dns module doesn't support these record types.
 */
import type { DNSAnswer, DNSQuery } from './types.js';
/**
 * Wire transport used by queryWithDnsPacket. Tests inject a deterministic
 * transport so coverage does not depend on public DNS.
 */
export type DnsTransport = (packet: Buffer, server: string, port: number) => Promise<Buffer>;
/**
 * Decoded DNS response sections shared by queryWithDnsPacket and decodeDnsResponse.
 */
export interface DnsResponseSections {
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
}
/**
 * Perform a DNS query using raw packet exchange.
 *
 * This is the only way to obtain real answer TTLs for record types whose TTLs
 * Node.js's high-level dns API hides (MX/TXT/NS/CNAME/SOA/CAA), and to query
 * types Node does not support at all (DNSKEY/DS). Encodes a query, sends it via
 * sendDnsQuery (UDP with TCP fallback), then decodes the wire response.
 */
export interface DnsQueryOptions {
    recursionDesired?: boolean;
    /** Override UDP/TCP transport (tests). Defaults to sendDnsQuery. */
    transport?: DnsTransport;
}
/** Encode a DNS query without performing I/O so recursion policy is testable. */
export declare function encodeDnsQuery(query: DNSQuery, options?: DnsQueryOptions): Buffer;
export declare function queryWithDnsPacket(query: DNSQuery, dnsServer?: string, options?: DnsQueryOptions): Promise<DnsResponseSections>;
/**
 * Decode a raw DNS wire-format response into typed sections.
 *
 * Pure (no I/O) so it can be unit-tested with dns-packet-encoded fixtures.
 * Answer records carry the real TTL from the wire and are formatted per the
 * requested queryType to match the string shapes downstream consumers expect
 * (e.g. TXT -> joined string for SPF/DMARC matching). Authority/additional
 * records preserve their real TTL and are formatted generically since their
 * record types vary (e.g. SOA in a negative-response authority section).
 */
export declare function decodeDnsResponse(response: Buffer, queryType: string): DnsResponseSections;
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