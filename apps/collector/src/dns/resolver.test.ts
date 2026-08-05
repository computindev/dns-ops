/**
 * DNSResolver wire-evidence tests.
 *
 * Every supported type uses the raw dns-packet path so TTLs, rcodes, and flags
 * are never fabricated or discarded.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryWithDnsPacket: vi.fn(),
}));

vi.mock('./dnssec-resolver.js', () => ({
  queryWithDnsPacket: mocks.queryWithDnsPacket,
}));

import { DNSResolver } from './resolver.js';
import type { DNSAnswer, VantageInfo } from './types.js';

function packetResponse(
  answers: DNSAnswer[],
  options: {
    responseCode?: number;
    flags?: { aa: boolean; tc: boolean; rd: boolean; ra: boolean; ad: boolean; cd: boolean };
  } = {}
) {
  return {
    answers,
    authority: [] as DNSAnswer[],
    additional: [] as DNSAnswer[],
    flags: options.flags ?? { aa: false, tc: false, rd: true, ra: true, ad: false, cd: false },
    responseCode: options.responseCode ?? 0,
  };
}

const recursiveVantage: VantageInfo = { type: 'public-recursive', identifier: '8.8.8.8' };
const authoritativeVantage: VantageInfo = {
  type: 'authoritative',
  identifier: 'ns1.example.com',
};

describe('DNSResolver', () => {
  let resolver: DNSResolver;

  beforeEach(() => {
    resolver = new DNSResolver();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('queries recursive vantages with recursion desired and preserves wire flags', async () => {
    mocks.queryWithDnsPacket.mockResolvedValue(
      packetResponse([{ name: 'example.com', type: 'A', ttl: 86400, data: '192.0.2.1' }])
    );

    const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);

    expect(mocks.queryWithDnsPacket).toHaveBeenCalledWith(
      { name: 'example.com', type: 'A' },
      '8.8.8.8',
      { recursionDesired: true }
    );
    expect(result.answers[0]).toMatchObject({ ttl: 86400, data: '192.0.2.1' });
    expect(result.flags).toMatchObject({ aa: false, rd: true, ra: true });
  });

  it('queries authoritative nameserver hostnames with recursion disabled and preserves AA', async () => {
    mocks.queryWithDnsPacket.mockResolvedValue(
      packetResponse([{ name: 'example.com', type: 'A', ttl: 60, data: '192.0.2.1' }], {
        flags: { aa: true, tc: false, rd: false, ra: false, ad: false, cd: false },
      })
    );

    const result = await resolver.query({ name: 'example.com', type: 'A' }, authoritativeVantage);

    expect(mocks.queryWithDnsPacket).toHaveBeenCalledWith(
      { name: 'example.com', type: 'A' },
      'ns1.example.com',
      { recursionDesired: false }
    );
    expect(result.flags).toEqual({
      aa: true,
      tc: false,
      rd: false,
      ra: false,
      ad: false,
      cd: false,
    });
  });

  it.each([
    ['AAAA', '2001:db8::1', 3600],
    ['MX', '10 mail.example.com', 1800],
    ['TXT', 'v=spf1 include:_spf.example ~all', 600],
    ['NS', 'ns1.example.com', 7200],
    ['CNAME', 'target.example.com', 120],
    ['SOA', 'ns1.example.com admin.example.com 1 3600 900 604800 86400', 3600],
    ['CAA', '0 issue "letsencrypt.org"', 3600],
  ])('preserves real %s answer data and TTL', async (type, data, ttl) => {
    mocks.queryWithDnsPacket.mockResolvedValue(
      packetResponse([{ name: 'example.com', type, ttl, data }])
    );

    const result = await resolver.query({ name: 'example.com', type }, recursiveVantage);

    expect(result.success).toBe(true);
    expect(result.answers[0]).toMatchObject({ type, ttl, data });
  });

  it('maps a wire NXDOMAIN to a failed result without converting it to absence', async () => {
    mocks.queryWithDnsPacket.mockResolvedValue(packetResponse([], { responseCode: 3 }));

    const result = await resolver.query(
      { name: 'missing.example.com', type: 'TXT' },
      recursiveVantage
    );

    expect(result.success).toBe(false);
    expect(result.responseCode).toBe(3);
    expect(result.error).toBe('DNS query failed with rcode 3');
  });

  it('maps transport timeout to SERVFAIL and preserves authoritative recursion policy', async () => {
    mocks.queryWithDnsPacket.mockRejectedValue(new Error('DNS query timeout'));

    const result = await resolver.query({ name: 'example.com', type: 'A' }, authoritativeVantage);

    expect(result.success).toBe(false);
    expect(result.responseCode).toBe(2);
    expect(result.flags?.rd).toBe(false);
    expect(result.error).toBe('DNS query timeout');
  });

  it('rejects unsupported record types without network I/O', async () => {
    const result = await resolver.query(
      { name: 'example.com', type: 'UNSUPPORTED' },
      recursiveVantage
    );

    expect(result.success).toBe(false);
    expect(result.responseCode).toBe(2);
    expect(result.error).toBe('Unsupported record type: UNSUPPORTED');
    expect(mocks.queryWithDnsPacket).not.toHaveBeenCalled();
  });
});
