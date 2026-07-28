import { describe, expect, it, vi } from 'vitest';
import { DMARC_TREE_WALK_QUERY_LIMIT, discoverDmarcPolicy } from './dmarc-discovery.js';

function fixture(records: Record<string, string[] | Error>) {
  return vi.fn(async (name: string): Promise<string[]> => {
    const answer = records[name] ?? [];
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

describe('RFC 9989 DMARC policy discovery', () => {
  it('prefers the Author Domain and stops after one query', async () => {
    const resolveTxt = fixture({
      '_dmarc.mail.example.com': ['v=DMARC1; p=reject'],
    });

    const result = await discoverDmarcPolicy('Mail.Example.COM.', resolveTxt);

    expect(result).toMatchObject({
      status: 'FOUND',
      authorDomain: 'mail.example.com',
      policyDomain: 'mail.example.com',
      source: 'AUTHOR_DOMAIN',
      effectivePolicy: 'reject',
      effectivePolicyTag: 'p',
      policyApplication: 'DETERMINED',
    });
    expect(result.queries.map((query) => query.name)).toEqual(['_dmarc.mail.example.com']);
  });

  it('accepts RFC whitespace around the version equals sign but rejects version prefixes', async () => {
    const valid = await discoverDmarcPolicy(
      'example.com',
      fixture({ '_dmarc.example.com': ['v = DMARC1 ; p=none'] })
    );
    const invalid = await discoverDmarcPolicy(
      'example.com',
      fixture({ '_dmarc.example.com': ['v=DMARC10; p=reject'] })
    );

    expect(valid.status).toBe('FOUND');
    expect(invalid.status).toBe('NOT_FOUND');
  });

  it('uses at most eight queries and skips to seven labels for a deep name', async () => {
    const domain = 'a.b.c.d.e.f.g.h.i.j.mail.example.com';

    const result = await discoverDmarcPolicy(domain, fixture({}));

    expect(result.status).toBe('NOT_FOUND');
    expect(result.queryLimit).toBe(DMARC_TREE_WALK_QUERY_LIMIT);
    expect(result.queries.map((query) => query.name)).toEqual([
      `_dmarc.${domain}`,
      '_dmarc.g.h.i.j.mail.example.com',
      '_dmarc.h.i.j.mail.example.com',
      '_dmarc.i.j.mail.example.com',
      '_dmarc.j.mail.example.com',
      '_dmarc.mail.example.com',
      '_dmarc.example.com',
      '_dmarc.com',
    ]);
  });

  it('selects the organizational-domain record when a higher PSD record stops the walk', async () => {
    const resolveTxt = fixture({
      '_dmarc.example.com': ['v=DMARC1; p=quarantine'],
      '_dmarc.com': ['v=DMARC1; p=reject; psd=y'],
    });

    const result = await discoverDmarcPolicy('a.mail.example.com', resolveTxt);

    expect(result).toMatchObject({
      status: 'FOUND',
      policyDomain: 'example.com',
      organizationalDomain: 'example.com',
      source: 'ORGANIZATIONAL_DOMAIN',
      record: 'v=DMARC1; p=quarantine',
    });
  });

  it('uses a PSD record when no organizational-domain record exists', async () => {
    const resolveTxt = fixture({
      '_dmarc.com': ['v=DMARC1; p=reject; psd=y'],
    });

    const result = await discoverDmarcPolicy('a.mail.example.com', resolveTxt);

    expect(result).toMatchObject({
      status: 'FOUND',
      policyDomain: 'com',
      organizationalDomain: 'example.com',
      source: 'PUBLIC_SUFFIX_DOMAIN',
    });
  });

  it('discards multiple current-version records at one target', async () => {
    const resolveTxt = fixture({
      '_dmarc.mail.example.com': ['v=DMARC1; p=reject', 'v=DMARC1; p=none'],
      '_dmarc.example.com': ['v=DMARC1; p=quarantine; psd=n'],
    });

    const result = await discoverDmarcPolicy('mail.example.com', resolveTxt);

    expect(result).toMatchObject({
      status: 'FOUND',
      policyDomain: 'example.com',
      source: 'ORGANIZATIONAL_DOMAIN',
    });
    expect(result.queries[0]?.outcome).toBe('MULTIPLE_RECORDS');
  });

  it('ignores a malformed psd value and continues the walk', async () => {
    const result = await discoverDmarcPolicy(
      'a.mail.example.com',
      fixture({
        '_dmarc.mail.example.com': ['v=DMARC1; p=none; psd=y=bad'],
        '_dmarc.example.com': ['v=DMARC1; p=reject; psd=n'],
      }),
      { authorDomainExists: true }
    );

    expect(result).toMatchObject({
      policyDomain: 'example.com',
      effectivePolicy: 'reject',
      effectivePolicyTag: 'p',
    });
  });

  it('uses sp and np for existing and non-existent inherited Author Domains', async () => {
    const records = {
      '_dmarc.example.com': ['v=DMARC1; p=reject; sp=none; np=quarantine; psd=n'],
    };
    const existing = await discoverDmarcPolicy('mail.example.com', fixture(records), {
      authorDomainExists: true,
    });
    const nonExistent = await discoverDmarcPolicy('absent.example.com', fixture(records), {
      authorDomainExists: false,
    });

    expect(existing).toMatchObject({ effectivePolicy: 'none', effectivePolicyTag: 'sp' });
    expect(nonExistent).toMatchObject({
      effectivePolicy: 'quarantine',
      effectivePolicyTag: 'np',
    });
  });

  it('falls back from missing np to sp before p', async () => {
    const result = await discoverDmarcPolicy(
      'absent.example.com',
      fixture({ '_dmarc.example.com': ['v=DMARC1; p=reject; sp=quarantine; psd=n'] }),
      { authorDomainExists: false }
    );

    expect(result).toMatchObject({
      effectivePolicy: 'quarantine',
      effectivePolicyTag: 'sp',
    });
  });

  it('uses RFC 9989 p=none fallback for invalid policy tags only with valid rua', async () => {
    const withRua = await discoverDmarcPolicy(
      'example.com',
      fixture({
        '_dmarc.example.com': ['v=DMARC1; p=reject; sp=bogus; rua=mailto:dmarc@example.com'],
      })
    );
    const withoutRua = await discoverDmarcPolicy(
      'example.com',
      fixture({ '_dmarc.example.com': ['v=DMARC1; p=reject; sp=bogus'] })
    );

    expect(withRua).toMatchObject({
      effectivePolicy: 'none',
      effectivePolicyTag: 'p',
      policyApplication: 'DETERMINED',
    });
    expect(withoutRua.policyApplication).toBe('INVALID_POLICY');
  });

  it('does not score a duplicate malformed policy tag as reject', async () => {
    const result = await discoverDmarcPolicy(
      'example.com',
      fixture({
        '_dmarc.example.com': ['v=DMARC1; p=reject; p=bogus; rua=mailto:dmarc@example.com'],
      })
    );

    expect(result).toMatchObject({
      effectivePolicy: 'none',
      policyApplication: 'DETERMINED',
    });
  });

  it('applies t=y one policy level below the published effective policy', async () => {
    const reject = await discoverDmarcPolicy(
      'example.com',
      fixture({ '_dmarc.example.com': ['v=DMARC1; p=reject; t=y'] })
    );
    const quarantine = await discoverDmarcPolicy(
      'example.com',
      fixture({ '_dmarc.example.com': ['v=DMARC1; p=quarantine; t=y'] })
    );

    expect(reject.effectivePolicy).toBe('quarantine');
    expect(quarantine.effectivePolicy).toBe('none');
  });

  it('rejects malformed percent escapes in reporting URIs', async () => {
    const result = await discoverDmarcPolicy(
      'example.com',
      fixture({ '_dmarc.example.com': ['v=DMARC1; p=bogus; rua=mailto:%ZZ'] })
    );

    expect(result.policyApplication).toBe('INVALID_POLICY');
    expect(result.effectivePolicy).toBeUndefined();
  });

  it('treats psd=y at the walk starting domain as the organizational record', async () => {
    const result = await discoverDmarcPolicy(
      'mail.example.com',
      fixture({ '_dmarc.example.com': ['v=DMARC1; p=none; psd=y'] }),
      { authorDomainExists: true }
    );

    expect(result).toMatchObject({
      organizationalDomain: 'example.com',
      policyDomain: 'example.com',
      source: 'ORGANIZATIONAL_DOMAIN',
    });
  });

  it('returns actionable UNKNOWN rather than absence after a DNS error', async () => {
    const resolveTxt = fixture({
      '_dmarc.example.com': new Error('SERVFAIL'),
    });

    const result = await discoverDmarcPolicy('mail.example.com', resolveTxt);

    expect(result).toMatchObject({
      status: 'UNKNOWN',
      error: 'DMARC policy discovery stopped because a DNS query failed',
    });
    expect(result.queries).toHaveLength(2);
    expect(result.queries[1]).toMatchObject({ outcome: 'DNS_ERROR', error: 'SERVFAIL' });
  });
});
