/** Deterministic MTA-STS pinned HTTPS probe tests. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMTASTSPolicy } from './mta-sts.js';
import { getProbeSemaphore, resetProbeSemaphore } from './semaphore.js';

const POLICY = 'version: STSv1\nmode: enforce\nmax_age: 300\nmx: *.example.com\n';

type ResponsePlan =
  | 'success'
  | 'redirect'
  | 'declared-too-large'
  | 'stream-too-large'
  | 'stall-dns'
  | 'stall-before-response'
  | 'stall-body';

interface RequestView {
  options: Record<string, unknown>;
  destroyed: boolean;
  ended: boolean;
  timeoutCallback?: () => void;
}

interface ResponseView {
  destroyed: boolean;
}

const fixtureState = vi.hoisted(() => ({
  lookup: vi.fn(),
  requests: [] as RequestView[],
  responses: [] as ResponseView[],
  plan: 'success' as ResponsePlan,
  plans: [] as ResponsePlan[],
}));

vi.mock('node:dns', () => ({
  promises: {
    lookup: fixtureState.lookup,
  },
}));

vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  const { EventEmitter } = await import('node:events');

  class FixtureResponse extends EventEmitter {
    readonly statusCode: number;
    readonly statusMessage: string;
    readonly headers: Record<string, string>;
    destroyed = false;

    constructor(statusCode: number, headers: Record<string, string> = {}) {
      super();
      this.statusCode = statusCode;
      this.statusMessage = statusCode === 200 ? 'OK' : 'Moved Permanently';
      this.headers = headers;
      fixtureState.responses.push(this);
    }

    destroy(): this {
      this.destroyed = true;
      return this;
    }
  }

  class FixtureRequest extends EventEmitter {
    readonly options: Record<string, unknown>;
    readonly callback: (response: FixtureResponse) => void;
    readonly plan: ResponsePlan;
    destroyed = false;
    ended = false;
    timeoutCallback: (() => void) | undefined;

    constructor(options: Record<string, unknown>, callback: (response: FixtureResponse) => void) {
      super();
      this.options = options;
      this.callback = callback;
      this.plan = fixtureState.plans[fixtureState.requests.length] ?? fixtureState.plan;
      fixtureState.requests.push(this);
    }

    setTimeout(_timeoutMs: number, callback: () => void): this {
      this.timeoutCallback = callback;
      return this;
    }

    end(): this {
      this.ended = true;
      queueMicrotask(() => {
        const plan = this.plan;
        if (plan === 'stall-before-response') return;
        if (plan === 'redirect') {
          this.callback(new FixtureResponse(301, { location: 'http://127.0.0.1/' }));
          return;
        }
        if (plan === 'declared-too-large') {
          this.callback(new FixtureResponse(200, { 'content-length': '65537' }));
          return;
        }
        if (plan === 'stream-too-large') {
          const response = new FixtureResponse(200);
          this.callback(response);
          queueMicrotask(() => {
            response.emit('data', Buffer.alloc(65536));
            response.emit('data', Buffer.from('x'));
          });
          return;
        }
        const response = new FixtureResponse(200, { 'content-length': String(POLICY.length) });
        this.callback(response);
        queueMicrotask(() => {
          response.emit('data', Buffer.from(POLICY.slice(0, 12)));
          if (plan === 'stall-body') return;
          response.emit('data', Buffer.from(POLICY.slice(12)));
          response.emit('end');
          response.emit('close');
        });
      });
      return this;
    }

    destroy(): this {
      this.destroyed = true;
      return this;
    }
  }

  const request = vi.fn(
    (options: Record<string, unknown>, callback: (response: FixtureResponse) => void) =>
      new FixtureRequest(options, callback)
  );
  return { ...actual, request };
});

beforeEach(() => {
  fixtureState.lookup.mockReset().mockImplementation(() => {
    if (fixtureState.plan === 'stall-dns') return new Promise(() => undefined);
    return Promise.resolve([{ address: '93.184.216.34', family: 4 }]);
  });
  fixtureState.requests.length = 0;
  fixtureState.responses.length = 0;
  fixtureState.plan = 'success';
  fixtureState.plans.length = 0;
  resetProbeSemaphore(5);
});

afterEach(() => {
  vi.useRealTimers();
  resetProbeSemaphore(5);
});

describe('fetchMTASTSPolicy pinned HTTPS transport', () => {
  it('pins the checked address while preserving Host, SNI, and certificate validation', async () => {
    const result = await fetchMTASTSPolicy('example.com', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({ success: true, rawPolicy: POLICY });
    expect(fixtureState.lookup).toHaveBeenCalledWith('mta-sts.example.com', { all: true });

    const request = fixtureState.requests[0];
    expect(request?.options).toMatchObject({
      hostname: 'mta-sts.example.com',
      path: '/.well-known/mta-sts.txt',
      agent: false,
      servername: 'mta-sts.example.com',
      rejectUnauthorized: true,
      headers: {
        Host: 'mta-sts.example.com',
        'User-Agent': 'DNS-Ops-Probe/1.0',
      },
    });

    const lookup = request?.options.lookup as
      | ((
          hostname: string,
          options: { all?: boolean },
          callback: (...args: unknown[]) => void
        ) => void)
      | undefined;
    expect(lookup).toBeDefined();
    const callback = vi.fn();
    lookup?.('mta-sts.example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });

  it('rejects every unsafe address returned by DNS', async () => {
    fixtureState.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);

    const result = await fetchMTASTSPolicy('example.com', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('127.0.0.1');
    expect(fixtureState.requests).toHaveLength(0);
  });

  it.each([
    ['100.64.0.0', '100.64.0.0/10'],
    ['100.127.255.255', '100.64.0.0/10'],
    ['198.18.0.0', '198.18.0.0/15'],
    ['198.19.255.255', '198.18.0.0/15'],
  ])('rejects an IANA special-purpose resolved address at the %s boundary (%s)', async (address) => {
    fixtureState.lookup.mockResolvedValue([{ address, family: 4 }]);

    const result = await fetchMTASTSPolicy('example.com', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain(`resolved to ${address}`);
    expect(fixtureState.requests).toHaveLength(0);
  });

  it('fails closed on DNS errors and empty/non-IP results', async () => {
    fixtureState.lookup.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const failed = await fetchMTASTSPolicy('missing.example', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });
    expect(failed.success).toBe(false);
    expect(failed.error).toContain('ENOTFOUND');

    fixtureState.lookup.mockResolvedValueOnce([]);
    const empty = await fetchMTASTSPolicy('empty.example', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });
    expect(empty.success).toBe(false);
    expect(empty.error).toContain('no addresses');
  });

  it('rejects redirects without following the Location target', async () => {
    fixtureState.plan = 'redirect';
    const result = await fetchMTASTSPolicy('example.com', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('redirect');
    expect(fixtureState.requests[0]?.destroyed).toBe(true);
    expect(fixtureState.requests).toHaveLength(1);
  });

  it('enforces declared and streamed 64 KiB body limits', async () => {
    fixtureState.plan = 'declared-too-large';
    const declared = await fetchMTASTSPolicy('example.com', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });
    expect(declared.success).toBe(false);
    expect(declared.error).toContain('Content-Length');
    expect(fixtureState.responses[0]?.destroyed).toBe(true);

    fixtureState.plan = 'stream-too-large';
    const streamed = await fetchMTASTSPolicy('example.com', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });
    expect(streamed.success).toBe(false);
    expect(streamed.error).toContain('body exceeds');
    expect(fixtureState.requests[1]?.destroyed).toBe(true);
  });
});

describe('fetchMTASTSPolicy cumulative deadline', () => {
  it.each([
    ['DNS', 'stall-dns'],
    ['connect/header', 'stall-before-response'],
    ['body', 'stall-body'],
  ] as const)('times out a stalled %s phase', async (_phase, plan) => {
    vi.useFakeTimers();
    fixtureState.plan = plan;
    const promise = fetchMTASTSPolicy('example.com', 'tenant-fixture', {
      checkAllowlist: false,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    const result = await promise;
    expect(result).toMatchObject({ success: false, error: 'Timeout after 25ms' });
    if (fixtureState.requests[0]) expect(fixtureState.requests[0].destroyed).toBe(true);
    if (fixtureState.responses[0]) expect(fixtureState.responses[0].destroyed).toBe(true);
  });

  it('releases a semaphore permit after a stalled body', async () => {
    vi.useFakeTimers();
    resetProbeSemaphore(1);
    fixtureState.plan = 'success';
    fixtureState.plans.push('stall-body', 'success');
    const first = getProbeSemaphore().run(() =>
      fetchMTASTSPolicy('example.com', 'tenant-fixture', {
        checkAllowlist: false,
        timeoutMs: 25,
      })
    );
    const second = getProbeSemaphore().run(() =>
      fetchMTASTSPolicy('example.com', 'tenant-fixture', {
        checkAllowlist: false,
        timeoutMs: 25,
      })
    );

    await vi.advanceTimersByTimeAsync(25);
    const firstResult = await first;
    expect(firstResult.success).toBe(false);
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(1);
    const secondResult = await second;
    expect(secondResult.success).toBe(true);
    expect(fixtureState.requests).toHaveLength(2);
  });
});
