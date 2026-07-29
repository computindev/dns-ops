import type { EvidenceCheckResult, RdapExpirationEvidence } from '@dns-ops/contracts';
import { checkResolvedIP, validateUrl } from './ssrf-guard.js';

const IANA_DNS_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type Resolver = (hostname: string) => Promise<string[]>;

function abortError(): Error {
  return new Error('RDAP collection deadline exceeded');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
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

interface RdapBootstrap {
  services?: unknown;
}

interface RdapDomainResponse {
  objectClassName?: unknown;
  ldhName?: unknown;
  events?: unknown;
  notices?: unknown;
}

export interface RdapCollectionOptions {
  fetcher?: Fetcher;
  resolveHostname?: Resolver;
  timeoutMs?: number;
  maxResponseBytes?: number;
  now?: () => Date;
}

function probeUnknown(detail: string) {
  return {
    reason: 'PROBE_FAILED' as const,
    explanation: `RDAP expiration evidence could not be collected: ${detail}`,
    action: 'RETRY_PROBE' as const,
    actionLabel: 'Retry RDAP probe',
    blocking: true,
  };
}

function validateDomain(domain: string): string {
  const normalized = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized.length > 253 || normalized.includes('/')) {
    throw new Error('Invalid registered domain name');
  }
  const parsed = new URL(`https://${normalized}/`);
  if (parsed.hostname !== normalized || !normalized.includes('.')) {
    throw new Error('Invalid registered domain name');
  }
  return normalized;
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const { promises: dns } = await import('node:dns');
  return (await dns.lookup(hostname, { all: true })).map(({ address }) => address);
}

async function assertSafeHttps(
  url: string,
  resolveHostname: Resolver,
  signal: AbortSignal
): Promise<URL> {
  const checked = validateUrl(url);
  if (!checked.allowed || !checked.url || checked.url.protocol !== 'https:') {
    throw new Error(`Unsafe RDAP URL: ${checked.reason ?? 'HTTPS is required'}`);
  }
  if (checked.url.username || checked.url.password || checked.url.hash) {
    throw new Error('Unsafe RDAP URL credentials or fragment');
  }

  const addresses = await abortable(resolveHostname(checked.url.hostname), signal);
  if (addresses.length === 0) throw new Error('RDAP hostname did not resolve');
  for (const address of addresses) {
    const addressCheck = checkResolvedIP(address);
    if (!addressCheck.allowed) {
      throw new Error(`Unsafe RDAP address ${address}: ${addressCheck.reason}`);
    }
  }
  return checked.url;
}

async function readBoundedBody(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal
): Promise<string> {
  const declaredLengthHeader = response.headers.get('content-length');
  if (declaredLengthHeader !== null) {
    const declaredLength = Number(declaredLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
      throw new Error(`RDAP response exceeds ${maxResponseBytes} bytes`);
    }
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxResponseBytes) {
        void reader.cancel('RDAP response size limit exceeded').catch(() => undefined);
        throw new Error(`RDAP response exceeds ${maxResponseBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytesRead).toString('utf8');
}

async function fetchBoundedJson(
  url: string,
  fetcher: Fetcher,
  resolveHostname: Resolver,
  signal: AbortSignal,
  maxResponseBytes: number
): Promise<{ status: number; value: unknown }> {
  await assertSafeHttps(url, resolveHostname, signal);
  const response = await abortable(
    fetcher(url, {
      signal,
      redirect: 'error',
      headers: {
        Accept: 'application/rdap+json, application/json',
        'User-Agent': 'DNS-Ops-RDAP/1.0',
      },
    }),
    signal
  );
  const body = await readBoundedBody(response, maxResponseBytes, signal);
  if (!response.ok) throw new Error(`RDAP HTTP ${response.status}`);
  try {
    return { status: response.status, value: JSON.parse(body) };
  } catch {
    throw new Error('RDAP response is not valid JSON');
  }
}

function serviceUrlFromBootstrap(bootstrap: RdapBootstrap, domain: string): string | null {
  if (!Array.isArray(bootstrap.services)) return null;
  const labels = domain.split('.');
  let best: { suffixLength: number; url: string } | null = null;

  for (const service of bootstrap.services) {
    if (!Array.isArray(service) || !Array.isArray(service[0]) || !Array.isArray(service[1]))
      continue;
    const suffixes = service[0].filter((value): value is string => typeof value === 'string');
    const urls = service[1].filter((value): value is string => typeof value === 'string');
    const httpsUrl = urls.find((url) => url.startsWith('https://'));
    if (!httpsUrl) continue;

    for (const suffix of suffixes) {
      const normalizedSuffix = suffix.toLowerCase().replace(/^\./, '');
      const suffixLabels = normalizedSuffix.split('.');
      if (labels.slice(-suffixLabels.length).join('.') !== normalizedSuffix) continue;
      if (!best || suffixLabels.length > best.suffixLength) {
        best = { suffixLength: suffixLabels.length, url: httpsUrl };
      }
    }
  }

  return best?.url ?? null;
}

const RFC3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isValidRfc3339DateTime(value: string): boolean {
  const match = RFC3339_DATE_TIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHour > 23 || offsetMinute > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth && !Number.isNaN(Date.parse(value));
}

function parseEvents(value: unknown): {
  events: Array<{ action: string; date: string }>;
  invalid: boolean;
} {
  if (value === undefined) return { events: [], invalid: false };
  if (!Array.isArray(value)) return { events: [], invalid: true };

  const events: Array<{ action: string; date: string }> = [];
  let invalid = false;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      invalid = true;
      continue;
    }
    const candidate = entry as { eventAction?: unknown; eventDate?: unknown };
    if (
      typeof candidate.eventAction !== 'string' ||
      typeof candidate.eventDate !== 'string' ||
      !isValidRfc3339DateTime(candidate.eventDate)
    ) {
      invalid = true;
      continue;
    }
    events.push({ action: candidate.eventAction, date: candidate.eventDate });
  }
  return { events, invalid };
}

function parseNotices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const title = (entry as { title?: unknown }).title;
    return typeof title === 'string' ? [title] : [];
  });
}

export async function collectRdapExpirationEvidence(
  registeredDomain: string,
  options: RdapCollectionOptions = {}
): Promise<EvidenceCheckResult<RdapExpirationEvidence>> {
  const fetcher = options.fetcher ?? fetch;
  const resolveHostname = options.resolveHostname ?? defaultResolver;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const now = options.now ?? (() => new Date());
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  let domain: string;

  try {
    domain = validateDomain(registeredDomain);
    const bootstrapResult = await fetchBoundedJson(
      IANA_DNS_BOOTSTRAP_URL,
      fetcher,
      resolveHostname,
      controller.signal,
      maxResponseBytes
    );
    const serviceUrl = serviceUrlFromBootstrap(bootstrapResult.value as RdapBootstrap, domain);
    if (!serviceUrl) {
      return {
        status: 'UNKNOWN',
        unknown: {
          reason: 'UNSUPPORTED_CHECK',
          explanation: `IANA RDAP bootstrap has no HTTPS service for ${domain}.`,
          action: 'NOT_CURRENTLY_OBSERVABLE',
          actionLabel: 'RDAP expiration is not currently observable',
          blocking: true,
        },
      };
    }

    const serviceBase = serviceUrl.endsWith('/') ? serviceUrl : `${serviceUrl}/`;
    const sourceUrl = new URL(`domain/${encodeURIComponent(domain)}`, serviceBase).toString();
    const domainResult = await fetchBoundedJson(
      sourceUrl,
      fetcher,
      resolveHostname,
      controller.signal,
      maxResponseBytes
    );
    const response = domainResult.value as RdapDomainResponse;
    if (
      response.objectClassName !== 'domain' ||
      typeof response.ldhName !== 'string' ||
      response.ldhName.toLowerCase().replace(/\.$/, '') !== domain
    ) {
      throw new Error(`RDAP response identity does not match ${domain}`);
    }
    const parsedEvents = parseEvents(response.events);
    const events = parsedEvents.events;
    const expirations = events.filter((event) =>
      ['expiration', 'expiry'].includes(event.action.toLowerCase())
    );
    const expirationInstants = new Set(expirations.map((event) => Date.parse(event.date)));
    const expiration = expirations[0];
    const evidence: RdapExpirationEvidence = {
      kind: 'RDAP_EXPIRATION',
      domain,
      sourceUrl,
      responseStatus: domainResult.status,
      events,
      expirationDate: expiration?.date,
      notices: parseNotices(response.notices),
    };

    if (parsedEvents.invalid || expirationInstants.size > 1) {
      return {
        status: 'UNKNOWN',
        observedAt: now().toISOString(),
        evidence,
        unknown: {
          reason: 'EXTERNAL_DECISION_REQUIRED',
          explanation: `RDAP returned malformed or conflicting event evidence for ${domain}.`,
          action: 'REVIEW_MANUALLY',
          actionLabel: 'Review RDAP events manually',
          blocking: true,
        },
      };
    }

    if (!expiration) {
      return {
        status: 'UNKNOWN',
        observedAt: now().toISOString(),
        evidence,
        unknown: {
          reason: 'EXTERNAL_DECISION_REQUIRED',
          explanation: `RDAP returned no expiration event for ${domain}.`,
          action: 'REVIEW_MANUALLY',
          actionLabel: 'Review registrar expiration manually',
          blocking: true,
        },
      };
    }

    return { status: 'OBSERVED', observedAt: now().toISOString(), evidence };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: 'UNKNOWN', unknown: probeUnknown(detail) };
  } finally {
    clearTimeout(deadline);
  }
}
