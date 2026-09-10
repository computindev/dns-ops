import { describe, expect, it } from 'vitest';
import {
  internalConditionKey,
  normalizeOperationalHttpUrl,
  operationalHttpDiscriminator,
  parseSupportedOperationalBaseline,
} from './operations.js';

describe('internalConditionKey', () => {
  it('normalizes bounded discriminators', () => {
    expect(
      internalConditionKey('tenant', 'domain', 'HTTP_ENDPOINT_UNAVAILABLE', ' Homepage ')
    ).toBe('tenant:domain:HTTP_ENDPOINT_UNAVAILABLE:homepage');
  });

  it('rejects empty and oversized discriminators', () => {
    expect(() =>
      internalConditionKey('tenant', 'domain', 'HTTP_ENDPOINT_UNAVAILABLE', ' ')
    ).toThrow('1-64');
    expect(() =>
      internalConditionKey('tenant', 'domain', 'HTTP_ENDPOINT_UNAVAILABLE', 'x'.repeat(65))
    ).toThrow('1-64');
  });
});

describe('parseSupportedOperationalBaseline', () => {
  it('accepts explicit TLS and SPF policies without inferring fields', () => {
    expect(
      parseSupportedOperationalBaseline({
        signalKind: 'TLS_CERTIFICATE_REGRESSION',
        discriminator: 'WWW.Example.COM:443',
        policy: {
          kind: 'TLS_CERTIFICATE',
          requireHostnameAuthorized: true,
          requireChainAuthorized: false,
          minimumRemainingValiditySeconds: 0,
        },
      })
    ).toEqual({
      signalKind: 'TLS_CERTIFICATE_REGRESSION',
      discriminator: 'www.example.com:443',
      policy: {
        kind: 'TLS_CERTIFICATE',
        requireHostnameAuthorized: true,
        requireChainAuthorized: false,
        minimumRemainingValiditySeconds: 0,
      },
    });
    expect(
      parseSupportedOperationalBaseline({
        signalKind: 'MAIL_DNS_CONFIGURATION_REGRESSION',
        discriminator: 'SPF',
        policy: { kind: 'SPF_PRESENT' },
      })
    ).toEqual({
      signalKind: 'MAIL_DNS_CONFIGURATION_REGRESSION',
      discriminator: 'spf',
      policy: { kind: 'SPF_PRESENT' },
    });
  });

  it('normalizes operator-declared redirect and indexability policies', () => {
    expect(
      parseSupportedOperationalBaseline({
        signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
        discriminator: 'HTTPS://WWW.Example.COM/',
        policy: {
          kind: 'REDIRECT_TOPOLOGY',
          startUrl: 'HTTPS://WWW.Example.COM',
          expectedFinalUrl: 'https://example.com',
        },
      })
    ).toEqual({
      signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
      discriminator: 'https://www.example.com/',
      policy: {
        kind: 'REDIRECT_TOPOLOGY',
        startUrl: 'https://www.example.com/',
        expectedFinalUrl: 'https://example.com/',
      },
    });
    expect(
      parseSupportedOperationalBaseline({
        signalKind: 'HOMEPAGE_INDEXABILITY_REGRESSION',
        discriminator: 'https://example.com/',
        policy: {
          kind: 'HOMEPAGE_INDEXABILITY',
          requestedUrl: 'https://example.com/',
          requireIndexable: true,
        },
      })
    ).toMatchObject({
      signalKind: 'HOMEPAGE_INDEXABILITY_REGRESSION',
      discriminator: 'https://example.com/',
      policy: { kind: 'HOMEPAGE_INDEXABILITY', requireIndexable: true },
    });
  });

  it('accepts redirect expected finals longer than the discriminator bound', () => {
    const expectedFinalUrl = `https://example.com/${'path'.repeat(20)}`;
    expect(expectedFinalUrl.length).toBeGreaterThan(64);
    expect(
      parseSupportedOperationalBaseline({
        signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
        discriminator: 'https://www.example.com/',
        policy: {
          kind: 'REDIRECT_TOPOLOGY',
          startUrl: 'https://www.example.com/',
          expectedFinalUrl,
        },
      }).policy
    ).toMatchObject({ kind: 'REDIRECT_TOPOLOGY', expectedFinalUrl });
  });

  it('rejects inferred, mismatched, or unsupported policy shapes', () => {
    expect(() =>
      parseSupportedOperationalBaseline({
        signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
        discriminator: 'https://www.example.com/',
        policy: { kind: 'TLS_CERTIFICATE' },
      })
    ).toThrow('Invalid redirect topology baseline policy');
    expect(() =>
      parseSupportedOperationalBaseline({
        signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
        discriminator: 'https://apex.example.com/',
        policy: {
          kind: 'REDIRECT_TOPOLOGY',
          startUrl: 'https://www.example.com/',
          expectedFinalUrl: 'https://example.com/',
        },
      })
    ).toThrow('discriminator must match the declared URL');
    expect(() =>
      parseSupportedOperationalBaseline({
        signalKind: 'HOMEPAGE_INDEXABILITY_REGRESSION',
        discriminator: 'https://example.com/',
        policy: { kind: 'HOMEPAGE_INDEXABILITY', requestedUrl: 'https://example.com/' },
      })
    ).toThrow('Invalid homepage indexability baseline policy');
    expect(() =>
      parseSupportedOperationalBaseline({
        signalKind: 'HTTP_ENDPOINT_UNAVAILABLE',
        discriminator: 'homepage',
        policy: { kind: 'SPF_PRESENT' },
      })
    ).toThrow('Unsupported baseline policy');
    expect(() =>
      parseSupportedOperationalBaseline({
        signalKind: 'MAIL_DNS_CONFIGURATION_REGRESSION',
        discriminator: 'dmarc',
        policy: { kind: 'SPF_PRESENT' },
      })
    ).toThrow('Invalid SPF baseline policy');
    expect(() =>
      parseSupportedOperationalBaseline({
        signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
        discriminator: 'https://www.example.com/path',
        policy: {
          kind: 'REDIRECT_TOPOLOGY',
          startUrl: 'https://www.example.com/path',
          expectedFinalUrl: 'https://example.com/',
        },
      })
    ).toThrow('collected http(s) origin root');
    expect(() =>
      parseSupportedOperationalBaseline({
        signalKind: 'HOMEPAGE_INDEXABILITY_REGRESSION',
        discriminator: 'https://www.example.com/',
        policy: {
          kind: 'HOMEPAGE_INDEXABILITY',
          requestedUrl: 'https://www.example.com/',
          requireIndexable: true,
        },
      })
    ).toThrow('HTTPS apex root');
    const longHost = `abcdefghijklmnopqrstuvwxyz0123456789abcd.example.com`;
    const longStart = `https://www.${longHost}/`;
    expect(longStart.length).toBeGreaterThan(64);
    expect(
      parseSupportedOperationalBaseline({
        signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
        discriminator: longStart,
        policy: {
          kind: 'REDIRECT_TOPOLOGY',
          startUrl: longStart,
          expectedFinalUrl: `https://${longHost}/`,
        },
      }).discriminator
    ).toBe(longStart);
  });

  it('rejects credentialed, non-http, and IP literal policy URLs', () => {
    expect(() => normalizeOperationalHttpUrl('ftp://example.com/')).toThrow('http or https');
    expect(() => normalizeOperationalHttpUrl('https://user:pass@example.com/')).toThrow(
      'credentials'
    );
    expect(() => normalizeOperationalHttpUrl('https://127.0.0.1/')).toThrow('registered hostname');
    expect(() => normalizeOperationalHttpUrl('https://localhost/')).toThrow('registered hostname');
    expect(() => normalizeOperationalHttpUrl('https://intranet/')).toThrow('registered hostname');
    expect(operationalHttpDiscriminator(`https://example.com/${'x'.repeat(80)}`)).toBe(
      `https://example.com/${'x'.repeat(80)}`
    );
    expect(() =>
      parseSupportedOperationalBaseline({
        signalKind: 'REDIRECT_TOPOLOGY_REGRESSION',
        discriminator: `https://example.com/${'x'.repeat(80)}`,
        policy: {
          kind: 'REDIRECT_TOPOLOGY',
          startUrl: `https://example.com/${'x'.repeat(80)}`,
          expectedFinalUrl: 'https://example.com/',
        },
      })
    ).toThrow('collected http(s) origin root');
  });
});
