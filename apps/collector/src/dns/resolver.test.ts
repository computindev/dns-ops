/**
 * DNS Resolver Tests
 *
 * A/AAAA are resolved via node:dns/promises with {ttl:true} (real TTL); the
 * other supported types are resolved via the dns-packet raw path
 * (queryWithDnsPacket, mocked here). Every record type must carry the REAL
 * answer TTL supplied by the mocked layer — never the fabricated 300.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted guarantees the mock fns exist when the hoisted vi.mock factories
// run (factories cannot reference plain top-level consts due to TDZ).
const mocks = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  setServers: vi.fn(),
  queryWithDnsPacket: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  Resolver: class {
    resolve4 = mocks.resolve4;
    resolve6 = mocks.resolve6;
    setServers = mocks.setServers;
  },
}));

vi.mock('./dnssec-resolver.js', () => ({
  queryWithDnsPacket: mocks.queryWithDnsPacket,
}));

// Local aliases for readability in the test body.
const mockResolve4 = mocks.resolve4;
const mockResolve6 = mocks.resolve6;
const mockSetServers = mocks.setServers;
const mockQueryWithDnsPacket = mocks.queryWithDnsPacket;

import { DNSResolver } from './resolver.js';
import type { DNSAnswer, VantageInfo } from './types.js';

/** Build a dns-packet-shaped response with real TTLs per answer. */
function packetResponse(answers: DNSAnswer[], responseCode = 0) {
  return {
    answers,
    authority: [] as DNSAnswer[],
    additional: [] as DNSAnswer[],
    flags: { aa: false, tc: false, rd: true, ra: true, ad: false, cd: false },
    responseCode,
  };
}

describe('DNSResolver', () => {
  let resolver: DNSResolver;
  const recursiveVantage: VantageInfo = { type: 'public-recursive', identifier: '8.8.8.8' };
  const authoritativeVantage: VantageInfo = {
    type: 'authoritative',
    identifier: 'ns1.example.com',
  };

  beforeEach(() => {
    resolver = new DNSResolver();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Vantage Configuration', () => {
    it('sets servers for public-recursive vantage (A query)', async () => {
      mockResolve4.mockResolvedValue([{ address: '192.0.2.1', ttl: 300 }]);
      await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(mockSetServers).toHaveBeenCalledWith(['8.8.8.8']);
    });

    it('sets servers for authoritative vantage (A query)', async () => {
      mockResolve4.mockResolvedValue([{ address: '192.0.2.1', ttl: 300 }]);
      await resolver.query({ name: 'example.com', type: 'A' }, authoritativeVantage);
      expect(mockSetServers).toHaveBeenCalledWith(['ns1.example.com']);
    });
  });

  describe('Real TTLs (no fabrication)', () => {
    it('A: carries the answer TTL from {ttl:true}, not 300', async () => {
      mockResolve4.mockResolvedValue([
        { address: '192.0.2.1', ttl: 86400 },
        { address: '192.0.2.2', ttl: 86400 },
      ]);
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.success).toBe(true);
      expect(result.answers).toHaveLength(2);
      expect(result.answers[0]).toMatchObject({ type: 'A', ttl: 86400, data: '192.0.2.1' });
      expect(result.answers[1].ttl).toBe(86400);
    });

    it('AAAA: carries the answer TTL, not 300', async () => {
      mockResolve6.mockResolvedValue([{ address: '2001:db8::1', ttl: 3600 }]);
      const result = await resolver.query({ name: 'example.com', type: 'AAAA' }, recursiveVantage);
      expect(result.answers[0]).toMatchObject({ type: 'AAAA', ttl: 3600, data: '2001:db8::1' });
    });

    it('MX: real TTL via dns-packet, formatted "pref exchange"', async () => {
      mockQueryWithDnsPacket.mockResolvedValue(
        packetResponse([
          { name: 'example.com', type: 'MX', ttl: 1800, data: '10 mail.example.com' },
          { name: 'example.com', type: 'MX', ttl: 1800, data: '20 backup.example.com' },
        ])
      );
      const result = await resolver.query({ name: 'example.com', type: 'MX' }, recursiveVantage);
      expect(mockQueryWithDnsPacket).toHaveBeenCalledWith(
        { name: 'example.com', type: 'MX' },
        '8.8.8.8'
      );
      expect(result.success).toBe(true);
      expect(result.answers[0]).toMatchObject({
        type: 'MX',
        ttl: 1800,
        data: '10 mail.example.com',
      });
      expect(result.answers[1].data).toBe('20 backup.example.com');
      expect(result.answers.every((a) => a.ttl !== 300)).toBe(true);
    });

    it('TXT: real TTL via dns-packet, joined value for SPF matching', async () => {
      mockQueryWithDnsPacket.mockResolvedValue(
        packetResponse([
          {
            name: 'example.com',
            type: 'TXT',
            ttl: 600,
            data: 'v=spf1 include:_spf.google.com ~all',
          },
        ])
      );
      const result = await resolver.query({ name: 'example.com', type: 'TXT' }, recursiveVantage);
      expect(result.answers[0]).toMatchObject({ type: 'TXT', ttl: 600 });
      expect(result.answers[0].data).toBe('v=spf1 include:_spf.google.com ~all');
    });

    it('NS: real TTL via dns-packet', async () => {
      mockQueryWithDnsPacket.mockResolvedValue(
        packetResponse([
          { name: 'example.com', type: 'NS', ttl: 7200, data: 'ns1.example.com' },
          { name: 'example.com', type: 'NS', ttl: 7200, data: 'ns2.example.com' },
        ])
      );
      const result = await resolver.query({ name: 'example.com', type: 'NS' }, recursiveVantage);
      expect(result.answers[0]).toMatchObject({ type: 'NS', ttl: 7200, data: 'ns1.example.com' });
      expect(result.answers[1].data).toBe('ns2.example.com');
    });

    it('CNAME: real TTL via dns-packet', async () => {
      mockQueryWithDnsPacket.mockResolvedValue(
        packetResponse([
          { name: 'alias.example.com', type: 'CNAME', ttl: 120, data: 'target.example.com' },
        ])
      );
      const result = await resolver.query(
        { name: 'alias.example.com', type: 'CNAME' },
        recursiveVantage
      );
      expect(result.answers[0]).toMatchObject({
        name: 'alias.example.com',
        type: 'CNAME',
        ttl: 120,
        data: 'target.example.com',
      });
    });

    it('SOA: real RECORD TTL (not the SOA minimum field)', async () => {
      // Record TTL 3600; the SOA minimum (86400) appears only inside data.
      mockQueryWithDnsPacket.mockResolvedValue(
        packetResponse([
          {
            name: 'example.com',
            type: 'SOA',
            ttl: 3600,
            data: 'ns1.example.com admin.example.com 2024010101 3600 900 604800 86400',
          },
        ])
      );
      const result = await resolver.query({ name: 'example.com', type: 'SOA' }, recursiveVantage);
      expect(result.answers[0].ttl).toBe(3600);
      expect(result.answers[0].data).toBe(
        'ns1.example.com admin.example.com 2024010101 3600 900 604800 86400'
      );
    });

    it('CAA: real TTL via dns-packet', async () => {
      mockQueryWithDnsPacket.mockResolvedValue(
        packetResponse([
          { name: 'example.com', type: 'CAA', ttl: 3600, data: '0 issue "letsencrypt.org"' },
        ])
      );
      const result = await resolver.query({ name: 'example.com', type: 'CAA' }, recursiveVantage);
      expect(result.success).toBe(true);
      expect(result.answers[0]).toMatchObject({ type: 'CAA', ttl: 3600 });
      expect(result.answers[0].data).toBe('0 issue "letsencrypt.org"');
    });

    it('dns-packet types do not call the Node resolver', async () => {
      mockQueryWithDnsPacket.mockResolvedValue(packetResponse([]));
      await resolver.query({ name: 'example.com', type: 'TXT' }, recursiveVantage);
      expect(mockResolve4).not.toHaveBeenCalled();
      expect(mockResolve6).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('maps dns-packet NXDOMAIN rcode to failure', async () => {
      mockQueryWithDnsPacket.mockResolvedValue(packetResponse([], 3));
      const result = await resolver.query(
        { name: 'nope.example.com', type: 'TXT' },
        recursiveVantage
      );
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe(3); // NXDOMAIN
      expect(result.error).toBeDefined();
    });

    it('handles ENOTFOUND as NXDOMAIN (A record)', async () => {
      mockResolve4.mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.com'));
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe(3);
      expect(result.error).toContain('ENOTFOUND');
    });

    it('handles ECONNREFUSED as REFUSED', async () => {
      mockResolve4.mockRejectedValue(new Error('connect ECONNREFUSED 8.8.8.8'));
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe(5); // REFUSED
    });

    it('handles timeout errors as SERVFAIL', async () => {
      mockResolve4.mockRejectedValue(new Error('DNS query timeout'));
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe(2); // SERVFAIL
    });

    it('handles unknown errors as SERVFAIL', async () => {
      mockResolve4.mockRejectedValue(new Error('Unknown error'));
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe(2);
      expect(result.error).toBe('Unknown error');
    });

    it('returns SERVFAIL for unsupported record types', async () => {
      const result = await resolver.query(
        { name: 'example.com', type: 'UNSUPPORTED' },
        recursiveVantage
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported record type: UNSUPPORTED');
      expect(result.responseCode).toBe(2);
    });
  });

  describe('Response Structure', () => {
    it('includes query and vantage info in response', async () => {
      mockResolve4.mockResolvedValue([{ address: '192.0.2.1', ttl: 300 }]);
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.query).toEqual({ name: 'example.com', type: 'A' });
      expect(result.vantage).toEqual(recursiveVantage);
    });

    it('includes DNS flags in successful response', async () => {
      mockResolve4.mockResolvedValue([{ address: '192.0.2.1', ttl: 300 }]);
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.flags).toMatchObject({
        aa: false,
        tc: false,
        rd: true,
        ra: true,
        ad: false,
        cd: false,
      });
    });

    it('includes empty authority and additional sections for A', async () => {
      mockResolve4.mockResolvedValue([{ address: '192.0.2.1', ttl: 300 }]);
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.authority).toEqual([]);
      expect(result.additional).toEqual([]);
    });

    it('includes response time', async () => {
      mockResolve4.mockResolvedValue([{ address: '192.0.2.1', ttl: 300 }]);
      const result = await resolver.query({ name: 'example.com', type: 'A' }, recursiveVantage);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });
  });
});
