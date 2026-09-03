// collector.mts — route-boundary proof for collector request-body limits.
// Run: VERIFY_RUN_DIR=verification/runs/<run> bun .agents/skills/verify-dns-ops/harness/collector.mts
// The imported app is the production collector app; no test/debug route is added.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const MAX_BYTES = 1_048_576;
const RUN_DIR =
  process.env.VERIFY_RUN_DIR ?? fail('VERIFY_RUN_DIR is not set — run verify.mjs run-new first');
const COLLECTOR_DB_URL = 'postgresql://127.0.0.1:1/collector-body-limit-verification';
const encoder = new TextEncoder();

// Keep this route-boundary drive local and side-effect free. The app only reaches
// early validation for the exact-boundary and malformed cases below, while all
// over-limit cases abort before JSON/CSV parsing or database work.
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = COLLECTOR_DB_URL;
process.env.ENABLE_ACTIVE_PROBES = 'true';
process.env.COLLECTOR_SKIP_LISTEN = 'true';

type ProviderAttempt = {
  kind: 'fetch' | 'socket';
  host: string;
  target: string;
};

const providerAttempts: ProviderAttempt[] = [];

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function rejectExternalAttempt(
  kind: ProviderAttempt['kind'],
  host: string,
  target: string
): never {
  providerAttempts.push({ kind, host, target });
  throw new Error(`Blocked non-loopback ${kind} attempt: ${target}`);
}

const originalFetch = globalThis.fetch;
const guardedFetch: typeof globalThis.fetch = async (input, init) => {
  const target = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  );
  if (!isLoopbackHost(target.hostname)) {
    rejectExternalAttempt('fetch', target.hostname, target.href);
  }
  return originalFetch(input, init);
};
globalThis.fetch = guardedFetch;

function socketTarget(args: unknown[]): { host: string; target: string } {
  const [first, second] = args;
  if (typeof first === 'number') {
    const host = typeof second === 'string' ? second : 'localhost';
    return { host, target: `socket://${host}:${first}` };
  }
  if (typeof first === 'object' && first !== null) {
    const options = first as {
      host?: string;
      hostname?: string;
      path?: string;
      port?: number | string;
    };
    const host = options.host || options.hostname || 'localhost';
    const target =
      options.path !== undefined && options.port === undefined
        ? `socket:${options.path}`
        : `socket://${host}:${options.port ?? ''}`;
    return { host, target };
  }
  return { host: 'localhost', target: `socket:${String(first)}` };
}

const originalSocketConnect = (net.Socket.prototype as any).connect as (...args: any[]) => net.Socket;
(net.Socket.prototype as any).connect = function (this: net.Socket, ...args: any[]): net.Socket {
  const { host, target } = socketTarget(args);
  if (!isLoopbackHost(host)) rejectExternalAttempt('socket', host, target);
  return originalSocketConnect.apply(this, args);
};

const { default: collectorApp } = await import('../../../../apps/collector/src/index.ts');

const FLEET_POST_PATHS = ['/api/fleet-report/run', '/api/fleet-report/import-csv'] as const;
const PROBE_POST_PATHS = [
  '/api/probe/mta-sts',
  '/api/probe/smtp-starttls',
  '/api/probe/allowlist/generate',
] as const;
const COLLECT_POST_PATHS = [
  '/api/collect/domain',
  '/api/collect/mail',
  '/api/collect/mail/check',
] as const;
const MONITORING_POST_PATHS = [
  '/api/monitoring/check',
  '/api/monitoring/alerts/alert-1/resolve',
  '/api/monitoring/domains/domain-1/monitor',
] as const;
const NOTIFY_POST_PATHS = ['/api/notify/webhook'] as const;

// Every body-reading collector POST boundary is exercised for overflow. The
// exact-boundary and malformed-under-limit validation assertions stay on the
// fleet/probe routes whose under-limit behavior is deterministic without a
// live database.
const OVERFLOW_PATHS = [
  ...FLEET_POST_PATHS,
  ...PROBE_POST_PATHS,
  ...COLLECT_POST_PATHS,
  ...MONITORING_POST_PATHS,
  ...NOTIFY_POST_PATHS,
] as const;
const VALIDATION_PATHS = [...FLEET_POST_PATHS, ...PROBE_POST_PATHS] as const;

type StreamState = {
  pulls: number;
  cancelled: boolean;
  sentinelPulled: boolean;
  enqueuedBytes: number;
};

type Exchange = {
  name: string;
  path: string;
  mode: string;
  requestBytes: number;
  requestHeaders: Record<string, string>;
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
  stream: StreamState;
  evidencePath: string;
};

const exchanges: Exchange[] = [];
let exchangeNumber = 0;

function fail(message: string): never {
  throw new Error(message);
}

function endpointContentType(routePath: string): string {
  return routePath.endsWith('/import-csv') ? 'text/csv' : 'application/json';
}

function streamRequest(
  routePath: string,
  chunks: Uint8Array[],
  headers: Record<string, string>,
  sentinelIndex?: number
): { request: Request; state: StreamState } {
  const state: StreamState = {
    pulls: 0,
    cancelled: false,
    sentinelPulled: false,
    enqueuedBytes: 0,
  };
  let nextChunk = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const index = nextChunk++;
        state.pulls += 1;
        if (index === sentinelIndex) state.sentinelPulled = true;
        const chunk = chunks[index];
        if (!chunk) {
          controller.close();
          return;
        }
        state.enqueuedBytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 }
  );
  const request = new Request(`http://collector.local${routePath}`, {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  return { request, state };
}

function exactResponse(): { error: string; maxBytes: number } {
  return { error: 'Request body too large', maxBytes: MAX_BYTES };
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function padToLimit(prefix: string): Uint8Array {
  const prefixBytes = encoder.encode(prefix);
  assert(prefixBytes.byteLength <= MAX_BYTES, 'boundary prefix is already over the limit');
  const body = `${prefix}${' '.repeat(MAX_BYTES - prefixBytes.byteLength)}`;
  const bytes = encoder.encode(body);
  assert(bytes.byteLength === MAX_BYTES, `boundary body is ${bytes.byteLength} bytes`);
  return bytes;
}

function bodyForBoundary(routePath: string): Uint8Array {
  if (routePath.endsWith('/import-csv')) return padToLimit('domain\n');
  if (routePath.endsWith('/run')) return padToLimit('{"inventory":[]}');
  return padToLimit('{}');
}

function bodyForMalformed(routePath: string): Uint8Array {
  if (routePath.endsWith('/import-csv')) return encoder.encode('name\nexample.com\n');
  return encoder.encode('{"domain":');
}

function requestHeaders(routePath: string, contentLength?: number): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': endpointContentType(routePath),
    'X-Dev-Tenant': 'collector-body-limit-verification',
    'X-Dev-Actor': 'verify-harness',
  };
  if (contentLength !== undefined) headers['Content-Length'] = String(contentLength);
  return headers;
}

async function call(
  name: string,
  routePath: string,
  mode: string,
  chunks: Uint8Array[],
  contentLength?: number,
  sentinelIndex?: number
): Promise<{ response: Exchange['response']; stream: StreamState }> {
  const { request, state } = streamRequest(
    routePath,
    chunks,
    requestHeaders(routePath, contentLength),
    sentinelIndex
  );
  const response = await collectorApp.fetch(request);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // CSV and all collector errors used here are expected to be JSON, but retain
    // the raw text so an unexpected response is visible in the exchange.
  }
  const exchangeNumberText = String(++exchangeNumber).padStart(2, '0');
  const evidencePath = path.join(RUN_DIR, 'http', `${exchangeNumberText}-${name}.json`);
  const exchange: Exchange = {
    name,
    path: routePath,
    mode,
    requestBytes: chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
    requestHeaders: {
      'content-type': requestHeaders(routePath, contentLength)['Content-Type'],
      ...(contentLength === undefined ? {} : { 'content-length': String(contentLength) }),
    },
    response: {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body,
    },
    stream: { ...state },
    evidencePath: path.relative(process.cwd(), evidencePath),
  };
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        request: {
          method: 'POST',
          url: routePath,
          headers: exchange.requestHeaders,
          body: { mode, bytes: exchange.requestBytes },
        },
        response: exchange.response,
        verification: {
          name,
          mode,
          stream: exchange.stream,
        },
      },
      null,
      2
    )
  );
  exchanges.push(exchange);
  return { response: exchange.response, stream: state };
}

async function declaredOverflow(routePath: string): Promise<void> {
  const result = await call(
    `declared-overflow-${routePath.slice(1).replaceAll('/', '-')}`,
    routePath,
    'content-length-overflow',
    [new Uint8Array([1])],
    MAX_BYTES + 1
  );
  assertEqual(result.response.status, 413, `${routePath} declared status`);
  assertEqual(result.response.body, exactResponse(), `${routePath} declared body`);
  assert(result.stream.cancelled, `${routePath} declared body was not cancelled`);
  assert(!result.stream.sentinelPulled, `${routePath} declared body pulled the sentinel`);
  // The full collector auth path is asynchronous, so the runtime may hand one
  // queued chunk to the Request before route middleware can cancel it. The
  // route itself must never pull beyond that one queued chunk.
  assert(
    result.stream.pulls <= 1,
    `${routePath} declared body pulled ${result.stream.pulls} times`
  );
}

async function streamedOverflow(routePath: string): Promise<void> {
  const result = await call(
    `chunked-overflow-${routePath.slice(1).replaceAll('/', '-')}`,
    routePath,
    'chunked-overflow',
    [new Uint8Array(MAX_BYTES), new Uint8Array([1]), new Uint8Array([2])],
    undefined,
    2
  );
  assertEqual(result.response.status, 413, `${routePath} chunked status`);
  assertEqual(result.response.body, exactResponse(), `${routePath} chunked body`);
  assert(result.stream.cancelled, `${routePath} chunked body was not cancelled`);
  assert(!result.stream.sentinelPulled, `${routePath} pulled the post-overflow sentinel`);
  assert(
    result.stream.pulls <= 2,
    `${routePath} pulled ${result.stream.pulls} chunks before cancellation`
  );
}

async function utf8Overflow(routePath: string): Promise<void> {
  const text = 'é'.repeat(Math.floor(MAX_BYTES / 2) + 1);
  const bytes = encoder.encode(text);
  assert(text.length < MAX_BYTES, `${routePath} UTF-8 sample is not character-short`);
  assert(bytes.byteLength > MAX_BYTES, `${routePath} UTF-8 sample is not byte-large`);
  const result = await call(
    `utf8-overflow-${routePath.slice(1).replaceAll('/', '-')}`,
    routePath,
    'utf8-byte-overflow',
    [bytes]
  );
  assertEqual(result.response.status, 413, `${routePath} UTF-8 status`);
  assertEqual(result.response.body, exactResponse(), `${routePath} UTF-8 body`);
  assert(result.stream.cancelled, `${routePath} UTF-8 body was not cancelled`);
}

async function exactBoundary(routePath: string): Promise<void> {
  const bytes = bodyForBoundary(routePath);
  const result = await call(
    `exact-boundary-${routePath.slice(1).replaceAll('/', '-')}`,
    routePath,
    'exact-limit',
    [bytes],
    MAX_BYTES
  );
  const expectedStatus = routePath.endsWith('/import-csv') ? 200 : 400;
  assertEqual(result.response.status, expectedStatus, `${routePath} exact status`);
  assert(result.response.status !== 413, `${routePath} exact boundary was rejected`);
  assert(!result.stream.cancelled, `${routePath} exact body was cancelled`);
  assert(result.stream.enqueuedBytes === MAX_BYTES, `${routePath} exact body was not fully read`);
}

async function malformedUnderLimit(routePath: string): Promise<void> {
  const bytes = bodyForMalformed(routePath);
  assert(bytes.byteLength < MAX_BYTES, `${routePath} malformed sample is over the limit`);
  const result = await call(
    `malformed-under-limit-${routePath.slice(1).replaceAll('/', '-')}`,
    routePath,
    'malformed-under-limit',
    [bytes]
  );
  assertEqual(result.response.status, 400, `${routePath} malformed status`);
  assert(result.response.status !== 413, `${routePath} malformed body took the size-error path`);
}

async function main(): Promise<void> {
  fs.mkdirSync(path.join(RUN_DIR, 'http'), { recursive: true });
  fs.mkdirSync(path.join(RUN_DIR, 'readback'), { recursive: true });

  for (const routePath of OVERFLOW_PATHS) await declaredOverflow(routePath);
  for (const routePath of OVERFLOW_PATHS) await streamedOverflow(routePath);
  for (const routePath of OVERFLOW_PATHS) await utf8Overflow(routePath);
  for (const routePath of VALIDATION_PATHS) await exactBoundary(routePath);
  for (const routePath of VALIDATION_PATHS) await malformedUnderLimit(routePath);

  assert(
    providerAttempts.length === 0,
    `Enforced outbound guard recorded ${providerAttempts.length} external attempts: ${JSON.stringify(providerAttempts)}`
  );

  // Read the written HTTP exchanges back from disk before producing the matrix;
  // this catches truncated evidence rather than trusting only in-memory values.
  const persisted = exchanges.map((exchange) => {
    const data = JSON.parse(fs.readFileSync(path.resolve(exchange.evidencePath), 'utf8')) as {
      request: { url: string };
      response: Exchange['response'];
      verification: { name: string; mode: string; stream: StreamState };
    };
    assert(data.request.url === exchange.path, `read-back path mismatch for ${exchange.name}`);
    assert(
      typeof data.response.status === 'number',
      `read-back status missing for ${exchange.name}`
    );
    assert(
      data.verification.name === exchange.name,
      `read-back name mismatch for ${exchange.name}`
    );
    return {
      ...exchange,
      response: data.response,
      stream: data.verification.stream,
    };
  });
  const matrix = persisted.map((exchange) => ({
    name: exchange.name,
    path: exchange.path,
    mode: exchange.mode,
    requestBytes: exchange.requestBytes,
    responseStatus: exchange.response.status,
    responseBody: exchange.response.body,
    pulls: exchange.stream.pulls,
    cancelled: exchange.stream.cancelled,
    sentinelPulled: exchange.stream.sentinelPulled,
    enqueuedBytes: exchange.stream.enqueuedBytes,
  }));
  fs.writeFileSync(
    path.join(RUN_DIR, 'readback', 'request-body-limit.json'),
    JSON.stringify(
      {
        maxBytes: MAX_BYTES,
        endpoints: OVERFLOW_PATHS,
        validationEndpoints: VALIDATION_PATHS,
        cases: matrix,
        providerAttempts: {
          count: providerAttempts.length,
          details: providerAttempts,
        },
        noUnboundedBuffering: {
          declaredOverflowPulls: matrix
            .filter((x) => x.mode === 'content-length-overflow')
            .map((x) => x.pulls),
          streamedOverflowSentinels: matrix
            .filter((x) => x.mode === 'chunked-overflow')
            .map((x) => x.sentinelPulled),
        },
      },
      null,
      2
    )
  );

  const observations = [
    '## Observations (expected → seen)',
    '',
    `- Exercised ${OVERFLOW_PATHS.length} production collector POST boundaries for overflow: ${OVERFLOW_PATHS.join(', ')}.`,
    `- ${matrix.filter((x) => x.mode === 'content-length-overflow').length} declared overflows returned exact 413 ${JSON.stringify(exactResponse())}.`,
    `- ${matrix.filter((x) => x.mode === 'chunked-overflow').length} chunked overflows returned exact 413; every stream was cancelled and no sentinel was pulled.`,
    `- ${matrix.filter((x) => x.mode === 'utf8-byte-overflow').length} UTF-8 byte-overflows had JavaScript length below ${MAX_BYTES} but encoded bytes above it and returned exact 413.`,
    `- ${matrix.filter((x) => x.mode === 'exact-limit').length} bodies were exactly ${MAX_BYTES} bytes and none returned 413; CSV import returned 200 and the four JSON validation routes kept 400 validation.`,
    `- ${matrix.filter((x) => x.mode === 'malformed-under-limit').length} malformed-under-limit bodies returned 400, preserving route validation.`,
    '',
    '## Forbidden (must not happen → confirmed absent)',
    '',
    `- The enforced outbound guard recorded zero external attempts (providerAttempts count=${providerAttempts.length}; details=${JSON.stringify(providerAttempts)}).`,
    '- No route-specific size error, alternate max value, successful overflow, or post-overflow sentinel read was observed.',
    '- Declared overflow pull counts were at most one runtime-prefetched chunk; chunked overflow pull counts were at most two.',
    '',
    '## Read-back (side effects checked through an independent path)',
    '',
    '- Re-read every HTTP exchange from disk and wrote the route/case matrix to `readback/request-body-limit.json`.',
  ];
  fs.writeFileSync(path.join(RUN_DIR, 'observations.md'), `${observations.join('\n')}\n`);
  console.log(`collector request-body-limits passed; ${exchanges.length} exchanges in ${RUN_DIR}`);
}

await main();
