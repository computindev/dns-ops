import type { Context } from 'hono';

export const MAX_COLLECTOR_REQUEST_BODY_BYTES = 1_048_576;

export class RequestBodyTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes = MAX_COLLECTOR_REQUEST_BODY_BYTES) {
    super('Request body too large');
    this.name = 'RequestBodyTooLargeError';
    this.maxBytes = maxBytes;
  }
}

export function isRequestBodyTooLargeError(error: unknown): error is RequestBodyTooLargeError {
  return error instanceof RequestBodyTooLargeError;
}

/**
 * Return true only for a syntactically valid decimal Content-Length that is
 * over the limit. Smaller declarations are advisory: the stream is always
 * counted as it is consumed.
 */
function declaredLengthExceedsLimit(request: Request, maxBytes: number): boolean {
  const declaredLength = request.headers.get('content-length')?.trim();
  if (!declaredLength || !/^\d+$/.test(declaredLength)) return false;

  const normalized = declaredLength.replace(/^0+(?=\d)/, '');
  const limit = String(maxBytes);
  return (
    normalized.length > limit.length || (normalized.length === limit.length && normalized > limit)
  );
}

function cancelStreamWithoutAwait(stream: ReadableStream<Uint8Array>): void {
  try {
    void stream.cancel().catch(() => undefined);
  } catch {
    // A body may already be locked or disturbed; the size error remains the
    // deterministic response even when cancellation cannot be started.
  }
}

function cancelReaderWithoutAwait(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // Keep the size error deterministic when a custom reader rejects
    // cancellation synchronously.
  }
}

export async function readRequestBodyBytes(
  request: Request,
  maxBytes = MAX_COLLECTOR_REQUEST_BODY_BYTES
): Promise<Uint8Array> {
  const body = request.body;

  if (declaredLengthExceedsLimit(request, maxBytes)) {
    if (body) cancelStreamWithoutAwait(body);
    throw new RequestBodyTooLargeError(maxBytes);
  }

  if (!body) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) throw new TypeError('Request body stream yielded no chunk');

      if (value.byteLength > maxBytes - totalBytes) {
        cancelReaderWithoutAwait(reader);
        throw new RequestBodyTooLargeError(maxBytes);
      }

      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readRequestBodyText(
  request: Request,
  maxBytes = MAX_COLLECTOR_REQUEST_BODY_BYTES
): Promise<string> {
  return new TextDecoder().decode(await readRequestBodyBytes(request, maxBytes));
}

/**
 * Match the existing route behavior: malformed or unreadable bodies become
 * an empty object for downstream validation, while size errors are preserved.
 */
export async function readRequestBodyJson<T = unknown>(
  request: Request,
  maxBytes = MAX_COLLECTOR_REQUEST_BODY_BYTES
): Promise<T> {
  try {
    return JSON.parse(await readRequestBodyText(request, maxBytes)) as T;
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) throw error;
    return {} as T;
  }
}

export function requestBodyTooLargeResponse(c: Context): Response {
  return c.json(
    {
      error: 'Request body too large',
      maxBytes: MAX_COLLECTOR_REQUEST_BODY_BYTES,
    },
    413
  );
}
