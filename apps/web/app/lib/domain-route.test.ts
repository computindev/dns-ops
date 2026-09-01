import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectDomain,
  createCollectionRequest,
  fetchDomainData,
  Route,
} from '../routes/domain/$domain.js';

const SNAPSHOT_DATE = 'Tue, 01 Jan 2030 00:00:00 GMT';

describe('Domain 360 request cancellation', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes TanStack Query’s signal to both domain GET requests', async () => {
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'snapshot-1' }), {
          headers: { Date: SNAPSHOT_DATE },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { Date: SNAPSHOT_DATE },
        })
      );

    await fetchDomainData('example.com', controller.signal);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/domain/example.com/latest', {
      credentials: 'include',
      signal: controller.signal,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/snapshot/snapshot-1/observations', {
      credentials: 'include',
      signal: controller.signal,
    });
  });

  it('does not swallow an AbortError from the observation request', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'snapshot-1' })))
      .mockRejectedValueOnce(abortError);

    await expect(fetchDomainData('example.com', controller.signal)).rejects.toBe(abortError);
  });

  it('sends the collection POST with its component-owned signal', async () => {
    vi.useFakeTimers();
    const request = createCollectionRequest(1000);
    fetchMock.mockResolvedValueOnce(new Response('{}'));

    await collectDomain('example.com', true, request);

    expect(fetchMock).toHaveBeenCalledWith('/api/collect/domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'example.com',
        zoneManagement: 'unmanaged',
        addToPortfolio: true,
      }),
      credentials: 'include',
      signal: request.signal,
    });
    request.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('distinguishes a deadline timeout and clears its timer after abort', async () => {
    vi.useFakeTimers();
    const request = createCollectionRequest(25);
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true }
          );
        })
    );

    const pending = collectDomain('example.com', false, request);
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
      reason: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(request.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    request.dispose();
  });

  it('distinguishes manual aborts and clears their deadline timer', async () => {
    vi.useFakeTimers();
    const request = createCollectionRequest(1000);
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true }
          );
        })
    );

    const pending = collectDomain('example.com', false, request);
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      reason: 'aborted',
    });
    request.abort();

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    request.dispose();
  });

  it('aborts delayed A collection before remounting for B and allows B collection', async () => {
    vi.useFakeTimers();
    const domainA = 'domain-a.example.com';
    const domainB = 'domain-b.example.com';
    let resolveB: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input, init) => {
      let body: { domain?: string };
      try {
        body = JSON.parse(String(init?.body)) as { domain?: string };
      } catch {
        return Promise.reject(new Error(`invalid collection body: ${String(input)}`));
      }
      if (body.domain === domainA) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true }
          );
        });
      }
      if (body.domain === domainB) {
        return new Promise<Response>((resolve) => {
          resolveB = resolve;
        });
      }
      return Promise.reject(new Error(`unexpected collection target: ${String(input)}`));
    });

    const remountDeps = Route.options.remountDeps;
    expect(remountDeps).toBeTypeOf('function');
    const remountKey = (domain: string) =>
      remountDeps?.({
        routeId: '/domain/$domain',
        search: { search: {} },
        params: { domain },
        loaderDeps: {},
      });
    expect(remountKey(domainA)).toBe(domainA);
    expect(remountKey(domainA)).not.toBe(remountKey(domainB));

    const requestA = createCollectionRequest(1000);
    const pendingA = collectDomain(domainA, false, requestA);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    requestA.abort('unmount');
    requestA.dispose();
    await expect(pendingA).rejects.toMatchObject({ name: 'AbortError', reason: 'unmount' });
    expect(requestA.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    const requestB = createCollectionRequest(1000);
    const pendingB = collectDomain(domainB, false, requestB);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (!resolveB) throw new Error('B collection response was not started');
    resolveB(new Response('{}'));
    await pendingB;
    requestB.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({
        domain: domainB,
        zoneManagement: 'unmanaged',
        addToPortfolio: false,
      }),
      signal: requestB.signal,
    });
  });
});
