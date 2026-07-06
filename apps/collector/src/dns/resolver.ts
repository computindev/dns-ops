/**
 * DNS Resolver
 *
 * Performs actual DNS queries, capturing REAL answer TTLs (never fabricated).
 *
 * - A/AAAA use Node.js dns with {ttl:true}; this is the only record family for
 *   which Node exposes the real answer TTL.
 * - MX/TXT/NS/CNAME/SOA/CAA use the dns-packet raw path (queryWithDnsPacket),
 *   because Node's high-level dns API hides TTLs for those types and would
 *   otherwise force a fabricated default.
 *
 * Flags are returned uniformly (aa/tc/...). The dns-packet path does observe
 * real flags, but surfacing them (e.g. the AA bit for authoritative queries) is
 * intentionally out of scope here; see docs/architecture/runtime-topology.md.
 *
 * Error mapping uses standardized DNS_RCODE constants from @dns-ops/contracts
 * for consistent status classification across the codebase.
 */

import { Resolver } from 'node:dns/promises';
import { DNS_RCODE } from '@dns-ops/contracts';
import { queryWithDnsPacket } from './dnssec-resolver.js';
import type { DNSAnswer, DNSQuery, DNSQueryResult, VantageInfo } from './types.js';

/**
 * Record types resolved via the dns-packet raw path. Node's high-level dns API
 * hides answer TTLs for these, so the wire response must be decoded directly to
 * obtain a real (non-fabricated) TTL.
 */
const DNS_PACKET_TYPES = new Set(['MX', 'TXT', 'NS', 'CNAME', 'SOA', 'CAA']);

/** Uniform DNS flags returned for both resolution paths. */
const UNIFORM_FLAGS = {
  aa: false,
  tc: false,
  rd: true,
  ra: true,
  ad: false,
  cd: false,
} as const;

export class DNSResolver {
  /**
   * Perform a DNS query, returning the real answer TTL for every record type.
   */
  async query(query: DNSQuery, vantage: VantageInfo): Promise<DNSQueryResult> {
    const startTime = Date.now();

    try {
      if (DNS_PACKET_TYPES.has(query.type)) {
        return await this.queryViaDnsPacket(query, vantage, startTime);
      }

      // A/AAAA (and any future type Node resolves directly) — real TTL via
      // {ttl:true}.
      const nodeResolver = new Resolver();
      nodeResolver.setServers([vantage.identifier]);
      const performed = await this.performNodeQuery(nodeResolver, query);
      return {
        query,
        vantage,
        success: true,
        responseCode: DNS_RCODE.NOERROR,
        flags: { ...UNIFORM_FLAGS },
        answers: performed.answers,
        authority: performed.authority ?? [],
        additional: performed.additional ?? [],
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return this.errorResult(query, vantage, error, Date.now() - startTime);
    }
  }

  /**
   * Resolve MX/TXT/NS/CNAME/SOA/CAA via dns-packet, capturing the real answer
   * TTL and mapping the wire rcode to success/responseCode.
   */
  private async queryViaDnsPacket(
    query: DNSQuery,
    vantage: VantageInfo,
    startTime: number
  ): Promise<DNSQueryResult> {
    const result = await queryWithDnsPacket(query, vantage.identifier);
    const success = result.responseCode === DNS_RCODE.NOERROR;
    const base: DNSQueryResult = {
      query,
      vantage,
      success,
      responseCode: result.responseCode,
      flags: { ...UNIFORM_FLAGS },
      answers: result.answers,
      authority: result.authority,
      additional: result.additional,
      responseTime: Date.now() - startTime,
    };
    if (!success) {
      base.error = `DNS query failed with rcode ${result.responseCode}`;
    }
    return base;
  }

  /**
   * Resolve via Node.js dns (A/AAAA). Throws for unsupported types.
   */
  private async performNodeQuery(
    resolver: Resolver,
    query: DNSQuery
  ): Promise<{ answers: DNSAnswer[]; authority?: DNSAnswer[]; additional?: DNSAnswer[] }> {
    switch (query.type) {
      case 'A':
        return this.queryA(resolver, query.name);
      case 'AAAA':
        return this.queryAAAA(resolver, query.name);
      default:
        throw new Error(`Unsupported record type: ${query.type}`);
    }
  }

  private async queryA(resolver: Resolver, name: string): Promise<{ answers: DNSAnswer[] }> {
    const records = await resolver.resolve4(name, { ttl: true });
    return {
      answers: records.map((rec) => ({ name, type: 'A', ttl: rec.ttl, data: rec.address })),
    };
  }

  private async queryAAAA(resolver: Resolver, name: string): Promise<{ answers: DNSAnswer[] }> {
    const records = await resolver.resolve6(name, { ttl: true });
    return {
      answers: records.map((rec) => ({ name, type: 'AAAA', ttl: rec.ttl, data: rec.address })),
    };
  }

  /**
   * Build a failure result, mapping the Node error message to an RCODE.
   */
  private errorResult(
    query: DNSQuery,
    vantage: VantageInfo,
    error: unknown,
    responseTime: number
  ): DNSQueryResult {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let responseCode: number = DNS_RCODE.SERVFAIL;

    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('NXDOMAIN')) {
      responseCode = DNS_RCODE.NXDOMAIN;
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('REFUSED')) {
      responseCode = DNS_RCODE.REFUSED;
    } else if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('timed out')
    ) {
      responseCode = DNS_RCODE.SERVFAIL; // No specific timeout RCODE; use SERVFAIL
    }

    return {
      query,
      vantage,
      success: false,
      responseCode,
      flags: { aa: false, tc: false, rd: true, ra: false, ad: false, cd: false },
      answers: [],
      authority: [],
      additional: [],
      responseTime,
      error: errorMessage,
    };
  }
}
