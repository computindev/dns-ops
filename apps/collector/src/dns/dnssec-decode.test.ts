/**
 * decodeDnsResponse — wire decode + formatting parity tests.
 *
 * Uses real dns-packet to ENCODE response fixtures (ground truth) and asserts
 * decodeDnsResponse extracts the real answer TTL and formats data to match the
 * string shapes downstream consumers expect (e.g. TXT joined for SPF/DMARC).
 * No network I/O.
 */

import * as dnsPacket from 'dns-packet';
import { describe, expect, it } from 'vitest';
import { decodeDnsResponse } from './dnssec-resolver.js';

function encodeResponse(
  answers: dnsPacket.Answer[] = [],
  opts: { rcodeNumber?: number; authority?: dnsPacket.Answer[] } = {}
): Buffer {
  const buf = dnsPacket.encode({
    type: 'response',
    id: 1,
    flags: (dnsPacket.RECURSION_DESIRED as number) | (dnsPacket.RECURSION_AVAILABLE as number),
    answers,
    authorities: opts.authority,
  } as dnsPacket.Packet);

  // Bake the rcode into the low 4 bits of byte 3 (the DNS header's rcode
  // field). dns-packet's encode does not reliably serialize the rcode field
  // across versions; setting it directly simulates a real wire response.
  if (opts.rcodeNumber !== undefined) {
    buf[3] = (buf[3] & 0xf0) | (opts.rcodeNumber & 0x0f);
  }
  return buf;
}

describe('decodeDnsResponse', () => {
  describe('real TTL + data formatting per record type', () => {
    it('MX: real ttl + "preference exchange"', () => {
      const buf = encodeResponse([
        {
          name: 'example.com',
          type: 'MX',
          class: 'IN',
          ttl: 86400,
          data: { preference: 10, exchange: 'mail.example.com' },
        },
        {
          name: 'example.com',
          type: 'MX',
          class: 'IN',
          ttl: 86400,
          data: { preference: 20, exchange: 'backup.example.com' },
        },
      ]);

      const r = decodeDnsResponse(buf, 'MX');

      expect(r.answers).toHaveLength(2);
      expect(r.answers[0]).toMatchObject({
        name: 'example.com',
        type: 'MX',
        ttl: 86400,
        data: '10 mail.example.com',
      });
      expect(r.answers[1].data).toBe('20 backup.example.com');
      // Fabricated TTL must never appear
      expect(r.answers.every((a) => a.ttl !== 300)).toBe(true);
    });

    it('TXT: joins chunks into one string + real ttl (SPF must match)', () => {
      const buf = encodeResponse([
        {
          name: 'example.com',
          type: 'TXT',
          class: 'IN',
          ttl: 3600,
          data: ['v=spf1 include:_spf.google.com ~all'],
        },
      ]);

      const r = decodeDnsResponse(buf, 'TXT');

      expect(r.answers[0]).toMatchObject({
        type: 'TXT',
        ttl: 3600,
        data: 'v=spf1 include:_spf.google.com ~all',
      });
    });

    it('TXT: joins multi-chunk records', () => {
      const buf = encodeResponse([
        {
          name: 'example.com',
          type: 'TXT',
          class: 'IN',
          ttl: 3600,
          data: ['chunk1', 'chunk2', 'chunk3'],
        },
      ]);

      const r = decodeDnsResponse(buf, 'TXT');

      expect(r.answers[0].data).toBe('chunk1chunk2chunk3');
    });

    it('NS: real ttl + nameserver', () => {
      const buf = encodeResponse([
        { name: 'example.com', type: 'NS', class: 'IN', ttl: 7200, data: 'ns1.example.com' },
        { name: 'example.com', type: 'NS', class: 'IN', ttl: 7200, data: 'ns2.example.com' },
      ]);

      const r = decodeDnsResponse(buf, 'NS');

      expect(r.answers[0]).toMatchObject({ type: 'NS', ttl: 7200, data: 'ns1.example.com' });
      expect(r.answers[1].data).toBe('ns2.example.com');
    });

    it('CNAME: real ttl + target', () => {
      const buf = encodeResponse([
        {
          name: 'alias.example.com',
          type: 'CNAME',
          class: 'IN',
          ttl: 1800,
          data: 'target.example.com',
        },
      ]);

      const r = decodeDnsResponse(buf, 'CNAME');

      expect(r.answers[0]).toMatchObject({
        name: 'alias.example.com',
        type: 'CNAME',
        ttl: 1800,
        data: 'target.example.com',
      });
    });

    it('SOA: real RECORD ttl (not the minimum field) + formatted rdata', () => {
      const buf = encodeResponse([
        {
          name: 'example.com',
          type: 'SOA',
          class: 'IN',
          ttl: 3600,
          data: {
            mname: 'ns1.example.com',
            rname: 'admin.example.com',
            serial: 2024010101,
            refresh: 3600,
            retry: 900,
            expire: 604800,
            minimum: 86400,
          },
        },
      ]);

      const r = decodeDnsResponse(buf, 'SOA');

      // Record TTL from the wire (3600), NOT the SOA minimum field (86400).
      expect(r.answers[0].ttl).toBe(3600);
      expect(r.answers[0].data).toBe(
        'ns1.example.com admin.example.com 2024010101 3600 900 604800 86400'
      );
    });

    it('CAA: real ttl + formatted critical/tag/value', () => {
      const buf = encodeResponse([
        {
          name: 'example.com',
          type: 'CAA',
          class: 'IN',
          ttl: 3600,
          data: { critical: 0, tag: 'issue', value: 'letsencrypt.org' },
        },
      ]);

      const r = decodeDnsResponse(buf, 'CAA');

      expect(r.answers[0]).toMatchObject({ type: 'CAA', ttl: 3600 });
      expect(r.answers[0].data).toContain('letsencrypt.org');
      expect(r.answers[0].data).toBe('0 issue "letsencrypt.org"');
    });
  });

  describe('response codes', () => {
    it('NOERROR → responseCode 0 with ra flag', () => {
      const buf = encodeResponse([
        { name: 'example.com', type: 'NS', class: 'IN', ttl: 7200, data: 'ns1.example.com' },
      ]);

      const r = decodeDnsResponse(buf, 'NS');

      expect(r.responseCode).toBe(0);
      expect(r.flags.ra).toBe(true);
      expect(r.flags.rd).toBe(true);
      expect(r.answers).toHaveLength(1);
    });

    it('NXDOMAIN → responseCode 3, empty answers, authority SOA TTL preserved', () => {
      const buf = encodeResponse([], {
        rcodeNumber: 3, // NXDOMAIN
        authority: [
          {
            name: 'example.com',
            type: 'SOA',
            class: 'IN',
            ttl: 900,
            data: {
              mname: 'ns1.example.com',
              rname: 'admin.example.com',
              serial: 1,
              refresh: 3600,
              retry: 900,
              expire: 604800,
              minimum: 900,
            },
          },
        ],
      });

      const r = decodeDnsResponse(buf, 'TXT');

      expect(r.responseCode).toBe(3);
      expect(r.answers).toEqual([]);
      expect(r.authority).toHaveLength(1);
      expect(r.authority[0].ttl).toBe(900);
    });
  });
});
