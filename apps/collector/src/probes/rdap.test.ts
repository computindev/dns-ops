import { describe, expect, it, vi } from 'vitest';
import { collectRdapExpirationEvidence } from './rdap.js';

const bootstrap = {
  services: [[['com'], ['https://rdap.example/']]],
};

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const publicResolver = async () => ['93.184.216.34'];

describe('collectRdapExpirationEvidence', () => {
  it('uses IANA bootstrap and returns traceable expiration evidence', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(
        jsonResponse({
          objectClassName: 'domain',
          ldhName: 'example.com',
          events: [
            { eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' },
            { eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' },
          ],
          notices: [{ title: 'Terms of Use' }],
        })
      );

    const result = await collectRdapExpirationEvidence('Example.COM.', {
      fetcher,
      resolveHostname: publicResolver,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    expect(result).toEqual({
      status: 'OBSERVED',
      observedAt: '2026-01-01T00:00:00.000Z',
      evidence: expect.objectContaining({
        domain: 'example.com',
        sourceUrl: 'https://rdap.example/domain/example.com',
        expirationDate: '2030-01-01T00:00:00Z',
        notices: ['Terms of Use'],
      }),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every((call) => call[1].redirect === 'error')).toBe(true);
  });

  it('keeps a successful response without an expiration event actionable UNKNOWN', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(
        jsonResponse({
          objectClassName: 'domain',
          ldhName: 'example.com',
          events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }],
        })
      );

    const result = await collectRdapExpirationEvidence('example.com', {
      fetcher,
      resolveHostname: publicResolver,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown).toMatchObject({
      reason: 'EXTERNAL_DECISION_REQUIRED',
      action: 'REVIEW_MANUALLY',
    });
    expect(result.evidence?.events).toEqual([
      { action: 'registration', date: '2020-01-01T00:00:00Z' },
    ]);
  });

  it('rejects an RDAP service that resolves to a private address', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        services: [[['com'], ['https://private-rdap.example/']]],
      })
    );
    const resolver = async (hostname: string) =>
      hostname === 'private-rdap.example' ? ['127.0.0.1'] : ['93.184.216.34'];

    const result = await collectRdapExpirationEvidence('example.com', {
      fetcher,
      resolveHostname: resolver,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown.explanation).toContain('Unsafe RDAP address');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('enforces response-size and JSON bounds', async () => {
    const oversized = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-length': '9999' },
      })
    );
    const streamedOversized = vi.fn().mockResolvedValueOnce(new Response('x'.repeat(11)));
    const malformed = vi.fn().mockResolvedValueOnce(new Response('{broken', { status: 200 }));

    const tooLarge = await collectRdapExpirationEvidence('example.com', {
      fetcher: oversized,
      resolveHostname: publicResolver,
      maxResponseBytes: 10,
    });
    const streamedTooLarge = await collectRdapExpirationEvidence('example.com', {
      fetcher: streamedOversized,
      resolveHostname: publicResolver,
      maxResponseBytes: 10,
    });
    const invalidJson = await collectRdapExpirationEvidence('example.com', {
      fetcher: malformed,
      resolveHostname: publicResolver,
    });

    expect(tooLarge.status).toBe('UNKNOWN');
    expect(streamedTooLarge.status).toBe('UNKNOWN');
    expect(invalidJson.status).toBe('UNKNOWN');
    if (
      tooLarge.status !== 'UNKNOWN' ||
      streamedTooLarge.status !== 'UNKNOWN' ||
      invalidJson.status !== 'UNKNOWN'
    ) {
      throw new Error('Expected bounded UNKNOWN fixtures');
    }
    expect(tooLarge.unknown.explanation).toContain('exceeds 10 bytes');
    expect(streamedTooLarge.unknown.explanation).toContain('exceeds 10 bytes');
    expect(invalidJson.unknown.explanation).toContain('not valid JSON');
  });

  it('returns unsupported UNKNOWN when IANA has no HTTPS service', async () => {
    const result = await collectRdapExpirationEvidence('example.invalid', {
      fetcher: vi.fn().mockResolvedValue(jsonResponse({ services: [] })),
      resolveHostname: publicResolver,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown).toMatchObject({
      reason: 'UNSUPPORTED_CHECK',
      action: 'NOT_CURRENTLY_OBSERVABLE',
    });
  });

  it('keeps mismatched and conflicting domain evidence UNKNOWN', async () => {
    const mismatchFetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(
        jsonResponse({
          objectClassName: 'domain',
          ldhName: 'other.example',
          events: [{ eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' }],
        })
      );
    const conflictFetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(
        jsonResponse({
          objectClassName: 'domain',
          ldhName: 'example.com',
          events: [
            { eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' },
            { eventAction: 'expiration', eventDate: '2031-01-01T00:00:00Z' },
          ],
        })
      );

    const mismatch = await collectRdapExpirationEvidence('example.com', {
      fetcher: mismatchFetcher,
      resolveHostname: publicResolver,
    });
    const conflict = await collectRdapExpirationEvidence('example.com', {
      fetcher: conflictFetcher,
      resolveHostname: publicResolver,
    });

    expect(mismatch.status).toBe('UNKNOWN');
    expect(conflict.status).toBe('UNKNOWN');
    if (mismatch.status !== 'UNKNOWN' || conflict.status !== 'UNKNOWN') {
      throw new Error('Expected inconsistent UNKNOWN fixtures');
    }
    expect(mismatch.unknown.explanation).toContain('identity does not match');
    expect(conflict.unknown).toMatchObject({
      reason: 'EXTERNAL_DECISION_REQUIRED',
      action: 'REVIEW_MANUALLY',
    });
  });

  it.each([
    '2021-02-29T00:00:00Z',
    '2023-02-30T00:00:00Z',
    '2020-01-01T24:00:00Z',
  ])('rejects impossible RFC3339 event date %s', async (eventDate) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(
        jsonResponse({
          objectClassName: 'domain',
          ldhName: 'example.com',
          events: [{ eventAction: 'expiration', eventDate }],
        })
      );

    const result = await collectRdapExpirationEvidence('example.com', {
      fetcher,
      resolveHostname: publicResolver,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown).toMatchObject({
      reason: 'EXTERNAL_DECISION_REQUIRED',
      action: 'REVIEW_MANUALLY',
    });
  });

  it('does not await a stalled stream cancellation after enforcing the byte cap', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(11)));
      },
      cancel() {
        return new Promise<void>(() => undefined);
      },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(body));

    const result = await Promise.race([
      collectRdapExpirationEvidence('example.com', {
        fetcher,
        resolveHostname: publicResolver,
        maxResponseBytes: 10,
        timeoutMs: 20,
      }),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('collector remained pending')), 100)
      ),
    ]);

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown.explanation).toContain('exceeds 10 bytes');
  });

  it('aborts a stalled resolver within the collection deadline', async () => {
    const stalledResolver = () => new Promise<string[]>(() => undefined);
    const result = await collectRdapExpirationEvidence('example.com', {
      fetcher: vi.fn(),
      resolveHostname: stalledResolver,
      timeoutMs: 5,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown.explanation).toContain('deadline exceeded');
  });

  it('aborts a stalled bootstrap request', async () => {
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const result = await collectRdapExpirationEvidence('example.com', {
      fetcher,
      resolveHostname: publicResolver,
      timeoutMs: 5,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown).toMatchObject({ reason: 'PROBE_FAILED', action: 'RETRY_PROBE' });
  });
});
