import { describe, expect, it } from 'vitest';
import { assessFirstLevelSpf, countDirectSpfLookupTerms, parseDMARC, parseSPF } from './index.js';

describe('RFC 9989 DMARC tags', () => {
  it('accepts RFC whitespace around the exact version tag', () => {
    expect(parseDMARC('v = DMARC1 ; p=none')).toMatchObject({ policy: 'none' });
    expect(parseDMARC('v=DMARC10; p=reject')).toBeNull();
  });

  it('accepts psd=u and ignores malformed psd values', () => {
    expect(parseDMARC('v=DMARC1; p=reject; psd=u')).toMatchObject({
      policy: 'reject',
      publicSuffix: 'u',
    });
    const malformed = parseDMARC('v=DMARC1; p=reject; psd=bogus');
    expect(malformed).toMatchObject({ policy: 'reject' });
    expect(malformed?.publicSuffix).toBeUndefined();
  });

  it('applies the safe fallback consistently for duplicate policy tags', () => {
    expect(parseDMARC('v=DMARC1; p=reject; p=bogus; rua=mailto:dmarc@example.com')).toMatchObject({
      policy: 'none',
    });
  });

  it('parses t=y and rejects malformed rua fallback URIs', () => {
    expect(parseDMARC('v=DMARC1; p=reject; t=y')).toMatchObject({ testing: 'y' });
    expect(parseDMARC('v=DMARC1; p=bogus; rua=mailto:%ZZ')).toBeNull();
  });

  it('parses non-existent-domain and public-suffix policy tags', () => {
    expect(parseDMARC('v=DMARC1; p=reject; np=quarantine; psd=n')).toMatchObject({
      policy: 'reject',
      nonExistentSubdomainPolicy: 'quarantine',
      publicSuffix: 'n',
    });
  });
});

describe('first-level SPF assessment', () => {
  it('FIX-03: exposes nested include and redirect as unresolved dependencies', () => {
    const parsed = parseSPF(
      'v=spf1 include:_spf.example.net a mx ip4:192.0.2.0/24 redirect=_spf2.example.net'
    );
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('Expected SPF parser fixture to succeed');

    const assessment = assessFirstLevelSpf(parsed);

    expect(assessment).toEqual({
      scope: 'FIRST_LEVEL_ONLY',
      directDnsLookupTerms: 4,
      includeDomains: ['_spf.example.net'],
      redirectDomain: '_spf2.example.net',
      status: 'DIRECT_SYNTAX_VALID',
      completeEvaluation: false,
      limitation: expect.stringContaining('recursive lookup-budget'),
    });
    expect(countDirectSpfLookupTerms(parsed)).toBe(4);
  });

  it('marks directly visible invalid mechanisms without resolving dependencies', () => {
    const parsed = parseSPF('v=spf1 include ~all');
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('Expected SPF parser fixture to succeed');

    expect(assessFirstLevelSpf(parsed).status).toBe('DIRECT_SYNTAX_INVALID');
  });

  it('requires the SPF version to be the first term', () => {
    expect(parseSPF('unrelated v=spf1 -all')).toBeNull();
  });
});
