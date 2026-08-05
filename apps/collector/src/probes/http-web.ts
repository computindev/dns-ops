import { request as httpRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import type {
  EvidenceCheckResult,
  HomepageIndexabilityEvidence,
  HttpReachabilityEvidence,
  HttpRedirectEvidence,
  HttpRedirectHopEvidence,
} from '@dns-ops/contracts';
import { checkResolvedIP, validateUrl } from './ssrf-guard.js';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BODY_BYTES = 128 * 1024;

type PinnedRequestInit = RequestInit & { lookup?: RequestOptions['lookup'] };
type Fetcher = (input: string, init: PinnedRequestInit) => Promise<Response>;
type Resolver = (hostname: string) => Promise<string[]>;

export interface HttpWebCollectionOptions {
  fetcher?: Fetcher;
  resolveHostname?: Resolver;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBodyBytes?: number;
  now?: () => Date;
}

export interface HttpWebStartEvidence {
  startUrl: string;
  reachability: EvidenceCheckResult<HttpReachabilityEvidence>;
  redirect: EvidenceCheckResult<HttpRedirectEvidence>;
}

export interface HttpWebCollectionResult {
  starts: HttpWebStartEvidence[];
  indexability: EvidenceCheckResult<HomepageIndexabilityEvidence>;
}

interface FetchedHop {
  hop: HttpRedirectHopEvidence;
  response: Response;
  responseTimeMs: number;
}

function deadlineError(): Error {
  return new Error('HTTP evidence collection deadline exceeded');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(deadlineError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(deadlineError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function validateRegisteredHostname(value: string): string {
  const hostname = value.trim().toLowerCase().replace(/\.$/, '');
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname.includes('/') ||
    hostname.includes(':') ||
    hostname.includes('[') ||
    hostname.includes(']') ||
    isIP(hostname) !== 0
  ) {
    throw new Error('HTTP evidence requires a registered hostname, not an IP literal');
  }
  const parsed = new URL(`https://${hostname}/`);
  if (parsed.hostname !== hostname || !hostname.includes('.')) {
    throw new Error('Invalid registered hostname');
  }
  return hostname;
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const { promises: dns } = await import('node:dns');
  return [
    ...new Set((await dns.lookup(hostname, { all: true })).map(({ address }) => address)),
  ].sort();
}

async function safeAddresses(
  hostname: string,
  resolver: Resolver,
  signal: AbortSignal
): Promise<string[]> {
  const resolved = await abortable(resolver(hostname), signal);
  if (resolved.length === 0) throw new Error(`HTTP hostname ${hostname} did not resolve`);
  const addresses = [...new Set(resolved)].sort();
  for (const address of addresses) {
    if (isIP(address) === 0 || address.includes('%')) {
      throw new Error(`HTTP resolver returned a non-IP address: ${address}`);
    }
    const result = checkResolvedIP(address);
    if (!result.allowed) throw new Error(`Unsafe HTTP address ${address}: ${result.reason}`);
  }
  return addresses;
}

function staticLookup(address: string): NonNullable<RequestOptions['lookup']> {
  const family = isIP(address);
  return ((_hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
    const all = typeof options === 'object' && options !== null && 'all' in options && options.all;
    if (all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  }) as NonNullable<RequestOptions['lookup']>;
}

function defaultFetcher(input: string, init: PinnedRequestInit): Promise<Response> {
  const url = new URL(input);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers)),
        lookup: init.lookup,
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        const status = incoming.statusCode ?? 500;
        const body = [101, 204, 205, 304].includes(status)
          ? null
          : (Readable.toWeb(incoming) as BodyInit);
        resolve(
          new Response(body, {
            status,
            statusText: incoming.statusMessage,
            headers: incoming.headers as HeadersInit,
          })
        );
      }
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function redirectContainsSensitiveQuery(url: URL): boolean {
  return [...url.searchParams.keys()].some((key) =>
    /(?:access[_-]?token|auth(?:entication)?|code|key|password|secret|session|signature|sig|token)/i.test(
      key
    )
  );
}

function safeUrl(value: string, allowRedirectPath = false): URL {
  const checked = validateUrl(value);
  if (!checked.allowed || !checked.url) {
    throw new Error(`Unsafe HTTP URL: ${checked.reason ?? 'invalid URL'}`);
  }
  const url = checked.url;
  if (url.username || url.password || url.hash) {
    throw new Error('Unsafe HTTP URL credentials or fragment');
  }
  if (allowRedirectPath && redirectContainsSensitiveQuery(url)) {
    throw new Error('Redirect target contains sensitive query parameters');
  }
  if (!allowRedirectPath && (url.pathname !== '/' || url.search)) {
    throw new Error('HTTP evidence only permits the registered homepage URL');
  }
  if (url.toString().length > 2_048) throw new Error('HTTP evidence URL exceeds 2048 characters');
  return url;
}

async function fetchHop(
  url: URL,
  fetcher: Fetcher,
  resolver: Resolver,
  signal: AbortSignal,
  now: () => Date
): Promise<FetchedHop> {
  const addresses = await safeAddresses(url.hostname, resolver, signal);
  const startedAt = Date.now();
  const response = await abortable(
    fetcher(url.toString(), {
      signal,
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'User-Agent': 'DNS-Ops-HTTP-Evidence/1.0',
      },
      lookup: staticLookup(addresses[0]),
    }),
    signal
  );
  const location = response.headers.get('location') ?? undefined;
  return {
    hop: {
      url: url.toString(),
      status: response.status,
      location,
      resolvedAddresses: addresses,
      observedAt: now().toISOString(),
    },
    response,
    responseTimeMs: Date.now() - startedAt,
  };
}

function isRedirect(status: number): boolean {
  return status >= 300 && status <= 399;
}

async function boundedText(
  response: Response,
  maxBodyBytes: number,
  signal: AbortSignal
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!response.body) return { text: '', bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      const remaining = maxBodyBytes - bytes;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.slice(0, remaining));
        bytes += Math.max(0, remaining);
        truncated = true;
        void reader.cancel('HTTP body size limit reached').catch(() => undefined);
        break;
      }
      bytes += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { text: Buffer.concat(chunks, bytes).toString('utf8'), bytes, truncated };
}

function normalizedRobotsDirectives(value: string): string[] {
  return value
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
}

function parseRobotsMeta(html: string): string[] {
  const result: string[] = [];
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const metaName = (name?.[1] ?? name?.[2] ?? name?.[3] ?? '').toLowerCase();
    const metaContent = content?.[1] ?? content?.[2] ?? content?.[3] ?? '';
    if (metaName === 'robots' || metaName.endsWith('bot')) {
      result.push(...normalizedRobotsDirectives(metaContent));
    }
  }
  return result;
}

function parseCanonical(html: string, finalUrl: string): string | undefined {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const relValue = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? '').toLowerCase().split(/\s+/);
    const hrefValue = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!relValue.includes('canonical') || !hrefValue) continue;
    try {
      return new URL(hrefValue, finalUrl).toString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function unknown(label: string, detail: string) {
  const unsafeRedirect =
    detail.startsWith('Unsafe HTTP') || detail.startsWith('Redirect target contains sensitive');
  return unsafeRedirect
    ? {
        reason: 'EXTERNAL_DECISION_REQUIRED' as const,
        explanation: `${label} probing stopped: ${detail}`,
        action: 'REVIEW_MANUALLY' as const,
        actionLabel: 'Stop probing and review redirect target',
        blocking: true,
      }
    : {
        reason: 'PROBE_FAILED' as const,
        explanation: `${label} evidence could not be collected: ${detail}`,
        action: 'RETRY_PROBE' as const,
        actionLabel: `Retry ${label.toLowerCase()} probe`,
        blocking: true,
      };
}

function releaseResponse(response: Response | undefined): void {
  void response?.body?.cancel().catch(() => undefined);
}

async function collectOne(
  startUrl: string,
  fetcher: Fetcher,
  resolver: Resolver,
  signal: AbortSignal,
  maxRedirects: number,
  now: () => Date
): Promise<HttpWebStartEvidence & { final?: FetchedHop; hops?: HttpRedirectHopEvidence[] }> {
  try {
    let current = safeUrl(startUrl);
    const hops: HttpRedirectHopEvidence[] = [];
    let final: FetchedHop | undefined;

    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      const fetched = await fetchHop(current, fetcher, resolver, signal, now);
      hops.push(fetched.hop);
      if (!isRedirect(fetched.response.status)) {
        final = fetched;
        break;
      }
      if (!fetched.hop.location) {
        releaseResponse(fetched.response);
        throw new Error(`Redirect ${fetched.response.status} lacks Location`);
      }
      if (redirects === maxRedirects) {
        releaseResponse(fetched.response);
        throw new Error(`Redirect limit of ${maxRedirects} exceeded`);
      }
      try {
        current = safeUrl(new URL(fetched.hop.location, current).toString(), true);
      } catch (error) {
        releaseResponse(fetched.response);
        throw error;
      }
      releaseResponse(fetched.response);
    }
    if (!final) throw new Error('HTTP response did not reach a final endpoint');

    const redirectEvidence: HttpRedirectEvidence = {
      kind: 'HTTP_REDIRECT',
      startUrl,
      hops,
      finalUrl: final.hop.url,
      truncated: false,
    };
    const reachability: HttpReachabilityEvidence = {
      kind: 'HTTP_REACHABILITY',
      url: final.hop.url,
      responseStatus: final.hop.status,
      resolvedAddresses: final.hop.resolvedAddresses,
      responseTimeMs: final.responseTimeMs,
    };
    const observedAt = now().toISOString();
    return {
      startUrl,
      reachability: { status: 'OBSERVED', observedAt, evidence: reachability },
      redirect: { status: 'OBSERVED', observedAt, evidence: redirectEvidence },
      final,
      hops,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      startUrl,
      reachability: { status: 'UNKNOWN', unknown: unknown('HTTP reachability', detail) },
      redirect: { status: 'UNKNOWN', unknown: unknown('HTTP redirect topology', detail) },
    };
  }
}

export async function collectHttpWebEvidence(
  registeredHostname: string,
  options: HttpWebCollectionOptions = {}
): Promise<HttpWebCollectionResult> {
  const hostname = validateRegisteredHostname(registeredHostname);
  const fetcher = options.fetcher ?? defaultFetcher;
  const resolver = options.resolveHostname ?? defaultResolver;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 8) {
    throw new Error('HTTP redirect limit must be an integer from 0 through 8');
  }
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1024 * 1024) {
    throw new Error('HTTP body limit must be 1 through 1048576 bytes');
  }
  const now = options.now ?? (() => new Date());
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  const starts = [
    `http://${hostname}/`,
    `https://${hostname}/`,
    `http://www.${hostname}/`,
    `https://www.${hostname}/`,
  ];

  const collected: Array<HttpWebStartEvidence & { final?: FetchedHop }> = [];
  try {
    for (const startUrl of starts) {
      collected.push(
        await collectOne(startUrl, fetcher, resolver, controller.signal, maxRedirects, now)
      );
    }
    const startEvidence = collected.map(({ final: _final, ...entry }) => entry);
    const selected = collected[1];
    if (!selected.final || selected.redirect.status !== 'OBSERVED') {
      return {
        starts: startEvidence,
        indexability: {
          status: 'UNKNOWN',
          unknown: unknown('Homepage indexability', 'HTTPS apex redirect evidence was unavailable'),
        },
      };
    }

    const contentType = selected.final.response.headers
      .get('content-type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType !== 'text/html' && contentType !== 'application/xhtml+xml') {
      return {
        starts: startEvidence,
        indexability: {
          status: 'UNKNOWN',
          unknown: {
            reason: 'UNSUPPORTED_CHECK',
            explanation: `Homepage indexability cannot be parsed from ${contentType ?? 'an unspecified'} content type.`,
            action: 'REVIEW_MANUALLY',
            actionLabel: 'Review homepage response manually',
            blocking: true,
          },
        },
      };
    }

    try {
      const body = await boundedText(selected.final.response, maxBodyBytes, controller.signal);
      const robotsHeader = selected.final.response.headers.get('x-robots-tag');
      const evidence: HomepageIndexabilityEvidence = {
        kind: 'HOMEPAGE_INDEXABILITY',
        requestedUrl: selected.startUrl,
        finalUrl: selected.final.hop.url,
        responseStatus: selected.final.hop.status,
        xRobotsTags: robotsHeader ? normalizedRobotsDirectives(robotsHeader) : [],
        metaRobots: parseRobotsMeta(body.text),
        canonicalUrl: parseCanonical(body.text, selected.final.hop.url),
        bodyBytesInspected: body.bytes,
        bodyTruncated: body.truncated,
      };
      return {
        starts: startEvidence,
        indexability: { status: 'OBSERVED', observedAt: now().toISOString(), evidence },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        starts: startEvidence,
        indexability: { status: 'UNKNOWN', unknown: unknown('Homepage indexability', detail) },
      };
    }
  } finally {
    for (const entry of collected) releaseResponse(entry.final?.response);
    clearTimeout(deadline);
  }
}
