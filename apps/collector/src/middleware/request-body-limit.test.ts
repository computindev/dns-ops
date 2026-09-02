import { describe, expect, it } from 'vitest';
import {
  MAX_COLLECTOR_REQUEST_BODY_BYTES,
  RequestBodyTooLargeError,
  readRequestBodyBytes,
  readRequestBodyJson,
  readRequestBodyText,
} from './request-body-limit.js';

interface StreamState {
  pulls: number;
  cancelled: boolean;
}

function requestFromChunks(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
  cancel: (reason?: unknown) => Promise<void> | void = () => undefined
): { request: Request; state: StreamState } {
  const state: StreamState = { pulls: 0, cancelled: false };
  let nextChunk = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.pulls += 1;
      const chunk = chunks[nextChunk++];
      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
    cancel(reason) {
      state.cancelled = true;
      return cancel(reason);
    },
  });

  const request = new Request('http://localhost/request', {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  return { request, state };
}

describe('collector request body limit', () => {
  it('rejects declared overflow without consuming the body and requests cancellation', async () => {
    const { request, state } = requestFromChunks([new Uint8Array([1])], {
      'Content-Length': String(MAX_COLLECTOR_REQUEST_BODY_BYTES + 1),
    });

    await expect(readRequestBodyBytes(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(state.pulls).toBe(0);
    expect(state.cancelled).toBe(true);
  });

  it('rejects the first streamed byte over the limit and cancels without appending it', async () => {
    const { request, state } = requestFromChunks([
      new Uint8Array(MAX_COLLECTOR_REQUEST_BODY_BYTES),
      new Uint8Array([1]),
    ]);

    await expect(readRequestBodyBytes(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(state.cancelled).toBe(true);
  });

  it('does not trust a smaller Content-Length declaration', async () => {
    const { request, state } = requestFromChunks(
      [new Uint8Array(MAX_COLLECTOR_REQUEST_BODY_BYTES), new Uint8Array([1])],
      { 'Content-Length': '1' }
    );

    await expect(readRequestBodyBytes(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(state.cancelled).toBe(true);
  });

  it('accepts exactly the byte limit', async () => {
    const expected = new Uint8Array(MAX_COLLECTOR_REQUEST_BODY_BYTES);
    expected.fill(65);
    const { request } = requestFromChunks([expected]);

    const body = await readRequestBodyBytes(request);
    expect(body.byteLength).toBe(MAX_COLLECTOR_REQUEST_BODY_BYTES);
    expect(body[0]).toBe(65);
    expect(body.at(-1)).toBe(65);
  });

  it('counts UTF-8 bytes rather than JavaScript characters', async () => {
    const text = 'é'.repeat(Math.floor(MAX_COLLECTOR_REQUEST_BODY_BYTES / 2) + 1);
    expect(text.length).toBeLessThan(MAX_COLLECTOR_REQUEST_BODY_BYTES);
    const { request, state } = requestFromChunks([new TextEncoder().encode(text)]);

    await expect(readRequestBodyText(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(state.cancelled).toBe(true);
  });

  it('does not wait for a stalled cancellation', async () => {
    const { request } = requestFromChunks(
      [new Uint8Array(MAX_COLLECTOR_REQUEST_BODY_BYTES), new Uint8Array([1])],
      {},
      () => new Promise<void>(() => undefined)
    );

    const result = await Promise.race([
      readRequestBodyBytes(request).then(
        () => 'resolved',
        (error) => (error instanceof RequestBodyTooLargeError ? 'oversized' : error)
      ),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 100)),
    ]);
    expect(result).toBe('oversized');
  });

  it('does not replace the oversized result when cancellation rejects', async () => {
    const { request } = requestFromChunks(
      [new Uint8Array(MAX_COLLECTOR_REQUEST_BODY_BYTES), new Uint8Array([1])],
      {},
      () => Promise.reject(new Error('cancellation failed'))
    );

    await expect(readRequestBodyBytes(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('preserves valid JSON values instead of normalizing them', async () => {
    const request = new Request('http://localhost/request', {
      method: 'POST',
      body: 'null',
    });

    await expect(readRequestBodyJson(request)).resolves.toBeNull();
  });
});
