/** DNS owner normalization tests. */

import { describe, expect, it } from 'vitest';
import { MAX_DNS_CNAME_HOPS, tryNormalizeDNSOwner } from './index.js';

describe('tryNormalizeDNSOwner', () => {
  it('normalizes mixed-case underscore service owners and one root dot', () => {
    expect(tryNormalizeDNSOwner('_Policy._MTA-STS.Example.NET.')).toEqual({
      original: '_Policy._MTA-STS.Example.NET.',
      normalized: '_policy._mta-sts.example.net',
    });
  });

  it('accepts valid hyphens and underscores in labels', () => {
    expect(tryNormalizeDNSOwner('_smtp._tls.mail-example.example')).toMatchObject({
      normalized: '_smtp._tls.mail-example.example',
    });
  });

  it.each([
    ['', 'empty'],
    ['.', 'root only'],
    ['example..net', 'empty label'],
    ['example.net..', 'repeated root dots'],
    ['*.example.net', 'wildcard'],
    ['example .net', 'space'],
    ['-example.net', 'leading hyphen'],
    ['example-.net', 'trailing hyphen'],
    [`${'a'.repeat(64)}.example`, 'label too long'],
    [`${'a'.repeat(250)}.example`, 'total name too long'],
    ['münchen.example', 'unsupported non-ASCII observation'],
  ])('rejects %s (%s)', (owner) => {
    expect(tryNormalizeDNSOwner(owner)).toBeNull();
  });

  it('shares the five-hop authorization bound', () => {
    expect(MAX_DNS_CNAME_HOPS).toBe(5);
  });
});
