import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { vi } from 'vitest';

export interface WebhookResponsePlan {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  stall?: boolean;
  error?: unknown;
}

export interface WebhookRequestView {
  options: Record<string, unknown>;
  body?: string;
  destroyed: boolean;
  ended: boolean;
  timeoutCallback?: () => void;
}

export interface WebhookResponseView {
  statusCode: number;
  headers: Record<string, string>;
  destroyed: boolean;
}

export interface WebhookTransportState {
  plan: WebhookResponsePlan;
  requests: WebhookRequestView[];
  responses: WebhookResponseView[];
  fetchMock?: ReturnType<typeof vi.fn>;
}

const fetchStates = new WeakMap<object, WebhookTransportState>();
const patchedFetchMocks = new WeakSet<object>();

/** Install a deterministic native-HTTPS fixture for webhook tests. */
export function installWebhookTransportMock(
  requestMock: ReturnType<typeof vi.fn>,
  fetchMock?: ReturnType<typeof vi.fn>
): WebhookTransportState {
  const state: WebhookTransportState = {
    plan: { statusCode: 200 },
    requests: [],
    responses: [],
    fetchMock,
  };

  if (fetchMock) {
    fetchStates.set(fetchMock, state);
    if (!patchedFetchMocks.has(fetchMock)) {
      const originalResolvedValueOnce = fetchMock.mockResolvedValueOnce.bind(fetchMock);
      const originalRejectedValueOnce = fetchMock.mockRejectedValueOnce.bind(fetchMock);
      fetchMock.mockResolvedValueOnce = ((value: unknown) => {
        const current = fetchStates.get(fetchMock);
        const response = value as { status?: number } | null | undefined;
        if (current) current.plan = { statusCode: response?.status ?? 200 };
        return originalResolvedValueOnce(value);
      }) as typeof fetchMock.mockResolvedValueOnce;
      fetchMock.mockRejectedValueOnce = ((error: unknown) => {
        const current = fetchStates.get(fetchMock);
        if (current) {
          current.plan = { error };
        }
        return originalRejectedValueOnce(error);
      }) as typeof fetchMock.mockRejectedValueOnce;
      patchedFetchMocks.add(fetchMock);
    }
  }

  class FixtureResponse extends EventEmitter {
    readonly statusCode: number;
    readonly statusMessage: string;
    readonly headers: Record<string, string>;
    destroyed = false;

    constructor(plan: WebhookResponsePlan) {
      super();
      this.statusCode = plan.statusCode ?? 200;
      this.statusMessage = this.statusCode >= 200 && this.statusCode < 300 ? 'OK' : 'Error';
      this.headers = plan.headers ?? {};
      state.responses.push(this);
    }

    destroy(): this {
      this.destroyed = true;
      return this;
    }
  }

  class FixtureRequest extends EventEmitter {
    readonly options: Record<string, unknown>;
    destroyed = false;
    ended = false;
    body?: string;
    timeoutCallback: (() => void) | undefined;

    constructor(options: Record<string, unknown>, callback: (response: IncomingMessage) => void) {
      super();
      this.options = options;
      state.requests.push(this);
      this.once('fixture-end', (body: string) => {
        const plan = state.plan;
        this.body = body;
        if (state.fetchMock) {
          const headers = this.options.headers as Record<string, string> | undefined;
          const hostHeader = headers?.Host ?? headers?.host;
          const host = hostHeader ?? String(this.options.hostname);
          const path = String(this.options.path ?? '/');
          const fetchSpy = state.fetchMock as unknown as (
            url: string,
            init: { method: unknown; headers?: Record<string, string>; body: string }
          ) => unknown;
          void Promise.resolve(
            fetchSpy(`https://${host}${path}`, {
              method: this.options.method,
              headers,
              body,
            })
          ).catch(() => undefined);
        }
        if (plan.error) {
          this.emit('error', plan.error);
          return;
        }
        if (plan.stall) return;

        const response = new FixtureResponse(plan);
        callback(response as unknown as IncomingMessage);
        queueMicrotask(() => {
          if (plan.body) response.emit('data', Buffer.from(plan.body));
          response.emit('end');
          response.emit('close');
        });
      });
    }

    setTimeout(_timeoutMs: number, callback: () => void): this {
      this.timeoutCallback = callback;
      return this;
    }

    end(body?: string): this {
      this.ended = true;
      this.emit('fixture-end', body ?? '');
      return this;
    }

    destroy(): this {
      this.destroyed = true;
      return this;
    }
  }

  requestMock.mockImplementation(
    (options: Record<string, unknown>, callback: (response: IncomingMessage) => void) =>
      new FixtureRequest(options, callback)
  );

  return state;
}
