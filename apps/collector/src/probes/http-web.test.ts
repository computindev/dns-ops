import { describe, expect, it, vi } from 'vitest';
import { collectHttpWebEvidence } from './http-web.js';

const publicResolver = async () => ['93.184.216.34'];

function response(body = '', init: ResponseInit = {}): Response {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return new Response(body, { ...init, status: init.status ?? 200, headers });
}

function fixtureFetcher(overrides: Record<string, Response> = {}) {
  return vi.fn((url: string) => {
    const fixed = overrides[url];
    if (fixed) return Promise.resolve(fixed.clone());
    if (url === 'http://example.com/') {
      return Promise.resolve(
        response('', { status: 301, headers: { location: 'https://example.com/' } })
      );
    }
    if (url === 'http://www.example.com/') {
      return Promise.resolve(
        response('', { status: 308, headers: { location: 'https://example.com/' } })
      );
    }
    if (url === 'https://www.example.com/') {
      return Promise.resolve(
        response('', { status: 301, headers: { location: 'https://example.com/' } })
      );
    }
    return Promise.resolve(
      response(
        '<html><head><meta name="robots" content="noindex, nofollow"><link rel="canonical" href="/canonical"></head></html>',
        { headers: { 'x-robots-tag': 'noindex' } }
      )
    );
  });
}

describe('collectHttpWebEvidence', () => {
  it('collects exactly the HTTP/HTTPS apex/www matrix with bounded manual redirects', async () => {
    const fetcher = fixtureFetcher();
    const result = await collectHttpWebEvidence('Example.COM.', {
      fetcher,
      resolveHostname: publicResolver,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    expect(result.starts.map((entry) => entry.startUrl)).toEqual([
      'http://example.com/',
      'https://example.com/',
      'http://www.example.com/',
      'https://www.example.com/',
    ]);
    expect(result.starts.every((entry) => entry.redirect.status === 'OBSERVED')).toBe(true);
    const httpApex = result.starts[0].redirect;
    expect(httpApex.status).toBe('OBSERVED');
    if (httpApex.status !== 'OBSERVED') throw new Error('Expected redirect fixture');
    expect(httpApex.evidence).toMatchObject({
      finalUrl: 'https://example.com/',
      hops: [
        expect.objectContaining({ status: 301, location: 'https://example.com/' }),
        expect.objectContaining({ status: 200, resolvedAddresses: ['93.184.216.34'] }),
      ],
    });
    expect(result.starts[1].reachability).toMatchObject({
      status: 'OBSERVED',
      evidence: { url: 'https://example.com/', responseStatus: 200 },
    });
    expect(result.indexability).toEqual({
      status: 'OBSERVED',
      observedAt: '2026-01-01T00:00:00.000Z',
      evidence: expect.objectContaining({
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        xRobotsTags: ['noindex'],
        metaRobots: ['noindex', 'nofollow'],
        canonicalUrl: 'https://example.com/canonical',
      }),
    });
    expect(fetcher.mock.calls.every(([, init]) => init.redirect === 'manual')).toBe(true);
    for (const [url, init] of fetcher.mock.calls) {
      const lookup = (init as RequestInit & { lookup?: (...args: never[]) => unknown }).lookup;
      expect(lookup).toBeTypeOf('function');
      const resolved = await new Promise<{ address: string; family: number }>((resolve, reject) =>
        lookup?.(
          new URL(url).hostname,
          {},
          (error: Error | null, address: string, family: number) =>
            error ? reject(error) : resolve({ address, family })
        )
      );
      expect(resolved).toEqual({ address: '93.184.216.34', family: 4 });
    }
  });

  it('permits a bounded redirect path but still validates each redirect hostname', async () => {
    const fetcher = fixtureFetcher({
      'https://example.com/': response('', {
        status: 302,
        headers: { location: '/welcome?lang=en' },
      }),
      'https://example.com/welcome?lang=en': response('<meta name="robots" content="index">'),
    });
    const result = await collectHttpWebEvidence('example.com', {
      fetcher,
      resolveHostname: publicResolver,
    });

    const redirect = result.starts[1].redirect;
    expect(redirect.status).toBe('OBSERVED');
    if (redirect.status !== 'OBSERVED') throw new Error('Expected redirect fixture');
    expect(redirect.evidence.finalUrl).toBe('https://example.com/welcome?lang=en');
    expect(result.indexability).toMatchObject({
      status: 'OBSERVED',
      evidence: { finalUrl: 'https://example.com/welcome?lang=en' },
    });
  });

  it('keeps a redirect to a private address as actionable UNKNOWN', async () => {
    const fetcher = fixtureFetcher({
      'https://example.com/': response('', {
        status: 302,
        headers: { location: 'http://private.example/' },
      }),
    });
    const resolver = async (hostname: string) =>
      hostname === 'private.example' ? ['127.0.0.1'] : ['93.184.216.34'];
    const result = await collectHttpWebEvidence('example.com', {
      fetcher,
      resolveHostname: resolver,
    });

    expect(result.starts[1].redirect).toMatchObject({
      status: 'UNKNOWN',
      unknown: { reason: 'EXTERNAL_DECISION_REQUIRED', action: 'REVIEW_MANUALLY' },
    });
    expect(result.starts[1].reachability).toMatchObject({ status: 'UNKNOWN' });
    expect(result.indexability).toMatchObject({ status: 'UNKNOWN' });
  });

  it('stops and escalates sensitive redirect locations without persisting the target', async () => {
    const fetcher = fixtureFetcher({
      'https://example.com/': response('', {
        status: 302,
        headers: { location: 'https://outside.example/?access_token=redacted' },
      }),
    });
    const result = await collectHttpWebEvidence('example.com', {
      fetcher,
      resolveHostname: publicResolver,
    });

    expect(result.starts[1].redirect).toMatchObject({
      status: 'UNKNOWN',
      unknown: {
        reason: 'EXTERNAL_DECISION_REQUIRED',
        action: 'REVIEW_MANUALLY',
        actionLabel: 'Stop probing and review redirect target',
      },
    });
    expect(JSON.stringify(result)).not.toContain('access_token=redacted');
  });

  it('caps redirect hops and homepage body inspection deterministically', async () => {
    const loopFetcher = vi.fn((url: string) =>
      Promise.resolve(response('', { status: 302, headers: { location: `${url}?next=1` } }))
    );
    const loopResult = await collectHttpWebEvidence('example.com', {
      fetcher: loopFetcher,
      resolveHostname: publicResolver,
      maxRedirects: 1,
    });
    expect(loopResult.starts.every((entry) => entry.redirect.status === 'UNKNOWN')).toBe(true);

    const largeFetcher = fixtureFetcher({
      'https://example.com/': response(`<meta name="robots" content="noindex">${'x'.repeat(100)}`),
    });
    const largeResult = await collectHttpWebEvidence('example.com', {
      fetcher: largeFetcher,
      resolveHostname: publicResolver,
      maxBodyBytes: 32,
    });
    expect(largeResult.indexability).toMatchObject({
      status: 'OBSERVED',
      evidence: { bodyBytesInspected: 32, bodyTruncated: true },
    });
  });

  it('does not parse non-HTML bodies and preserves observed matrix evidence', async () => {
    const fetcher = fixtureFetcher({
      'https://example.com/': response('<meta name="robots" content="noindex">', {
        headers: { 'content-type': 'application/json', 'x-robots-tag': ' NoIndex, NOFOLLOW ' },
      }),
    });
    const result = await collectHttpWebEvidence('example.com', {
      fetcher,
      resolveHostname: publicResolver,
    });

    expect(result.starts[1].redirect.status).toBe('OBSERVED');
    expect(result.indexability).toMatchObject({
      status: 'UNKNOWN',
      unknown: { reason: 'UNSUPPORTED_CHECK', action: 'REVIEW_MANUALLY' },
    });
  });

  it('cancels response bodies on failed redirect paths', async () => {
    const cancellations: string[] = [];
    const fetcher = vi.fn((url: string) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('unused'));
        },
        cancel() {
          cancellations.push(url);
        },
      });
      return Promise.resolve(new Response(body, { status: 302 }));
    });

    const result = await collectHttpWebEvidence('example.com', {
      fetcher,
      resolveHostname: publicResolver,
    });
    await Promise.resolve();

    expect(result.starts.every((entry) => entry.redirect.status === 'UNKNOWN')).toBe(true);
    expect(cancellations).toHaveLength(4);
  });

  it('returns actionable UNKNOWN when DNS resolution misses the cumulative deadline', async () => {
    const result = await collectHttpWebEvidence('example.com', {
      fetcher: vi.fn(),
      resolveHostname: () => new Promise<string[]>(() => undefined),
      timeoutMs: 5,
    });

    expect(result.starts).toHaveLength(4);
    expect(result.starts.every((entry) => entry.reachability.status === 'UNKNOWN')).toBe(true);
    expect(result.indexability).toMatchObject({
      status: 'UNKNOWN',
      unknown: { reason: 'PROBE_FAILED', action: 'RETRY_PROBE' },
    });
  });

  it('rejects arbitrary paths and resolver aliases without probing them', async () => {
    await expect(
      collectHttpWebEvidence('https://example.com/path', { fetcher: vi.fn() })
    ).rejects.toThrow('registered hostname');

    const fetcher = vi.fn();
    const result = await collectHttpWebEvidence('example.com', {
      fetcher,
      resolveHostname: async () => ['alias.internal.example'],
    });
    expect(result.starts.every((entry) => entry.reachability.status === 'UNKNOWN')).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['resolver-alias.example'],
    ['fe80::1%eth0'],
  ])('rejects invalid resolver answer %s before connecting', async (answer) => {
    const fetcher = vi.fn();
    const result = await collectHttpWebEvidence('example.com', {
      fetcher,
      resolveHostname: async () => [answer],
    });

    expect(result.starts.every((entry) => entry.reachability.status === 'UNKNOWN')).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
