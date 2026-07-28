import { describe, expect, it } from 'vitest';
import { assessFirstLevelSpf, countDirectSpfLookupTerms, parseSPF } from './index.js';

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
