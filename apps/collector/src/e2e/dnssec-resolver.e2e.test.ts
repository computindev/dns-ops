/**
 * E2E Integration Tests: DNSSEC DNS Resolver - DNS-002
 *
 * Default path is offline-only (input validation). Public recursive DNS checks
 * are opt-in via RUN_LIVE_DNS_TESTS so the collector default suite stays
 * deterministic and does not pass vacuously when the network is absent.
 *
 * Run live checks with:
 * - `RUN_LIVE_DNS_TESTS=1 bun run --filter @dns-ops/collector test`
 * - or the package `test:live-dns` script (integration suite)
 */

import { describe, expect, it } from 'vitest';
import { queryDNSKEY, queryDS } from '../dns/dnssec-resolver.js';

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

const LIVE_DNS_ENABLED = isTruthy(process.env.RUN_LIVE_DNS_TESTS);
const liveDescribe = LIVE_DNS_ENABLED ? describe : describe.skip;
const LIVE_DOMAIN = process.env.LIVE_DNS_DOMAIN?.trim() || 'cloudflare.com';
const LIVE_TEST_TIMEOUT_MS = 30_000;

describe('DNSSEC DNS Resolver E2E', () => {
  describe('offline input validation (no network)', () => {
    it('rejects empty domain for DNSKEY', async () => {
      const result = await queryDNSKEY('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Domain is required');
      expect(result.answers).toEqual([]);
    });

    it('rejects empty domain for DS', async () => {
      const result = await queryDS('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Domain is required');
      expect(result.answers).toEqual([]);
    });
  });

  liveDescribe('live public DNS (RUN_LIVE_DNS_TESTS)', () => {
    it(
      'DNSKEY query returns presentation data with base64 key material',
      async () => {
        const result = await queryDNSKEY(LIVE_DOMAIN);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.answers.length).toBeGreaterThan(0);

        const answer = result.answers[0];
        expect(answer.type).toBe('DNSKEY');
        expect(typeof answer.ttl).toBe('number');
        expect(answer.ttl).toBeGreaterThan(0);
        expect(typeof answer.data).toBe('string');
        // flags protocol algorithm base64(key)
        expect(answer.data).toMatch(/^\d+ \d+ \d+ [A-Za-z0-9+/=]+$/);
        // Must not leak the raw dns-packet object dump
        expect(answer.data).not.toContain('"type":"Buffer"');

        const keyB64 = answer.data.split(' ')[3] ?? '';
        expect(keyB64.length).toBeGreaterThan(0);
        expect(() => Buffer.from(keyB64, 'base64')).not.toThrow();
      },
      LIVE_TEST_TIMEOUT_MS
    );

    it(
      'DS query returns presentation data with hex digest material',
      async () => {
        const result = await queryDS(LIVE_DOMAIN);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.answers.length).toBeGreaterThan(0);

        const answer = result.answers[0];
        expect(answer.type).toBe('DS');
        expect(typeof answer.ttl).toBe('number');
        expect(typeof answer.data).toBe('string');
        // keyTag algorithm digestType hex(digest)
        expect(answer.data).toMatch(/^\d+ \d+ \d+ [0-9a-fA-F]+$/);
        expect(answer.data).not.toContain('"type":"Buffer"');

        const digestHex = answer.data.split(' ')[3] ?? '';
        expect(digestHex.length).toBeGreaterThan(0);
        expect(digestHex.length % 2).toBe(0);
      },
      LIVE_TEST_TIMEOUT_MS
    );

    it(
      'handles NXDOMAIN / non-existent names without throwing',
      async () => {
        const result = await queryDNSKEY('this-domain-definitely-does-not-exist-12345xyz.invalid');

        expect(result).toEqual(
          expect.objectContaining({
            success: expect.any(Boolean),
            answers: expect.any(Array),
          })
        );
        // Non-existent names must not surface fabricated DNSKEY answers.
        expect(result.answers).toHaveLength(0);
      },
      LIVE_TEST_TIMEOUT_MS
    );

    it(
      'concurrent DNSKEY queries complete independently',
      async () => {
        const results = await Promise.all([
          queryDNSKEY(LIVE_DOMAIN),
          queryDNSKEY('google.com'),
          queryDNSKEY('github.com'),
        ]);

        expect(results).toHaveLength(3);
        for (const result of results) {
          expect(typeof result.success).toBe('boolean');
          expect(Array.isArray(result.answers)).toBe(true);
        }
        // At least the known DNSSEC-enabled target must succeed with data.
        expect(results[0].success).toBe(true);
        expect(results[0].answers.length).toBeGreaterThan(0);
      },
      LIVE_TEST_TIMEOUT_MS
    );
  });
});
