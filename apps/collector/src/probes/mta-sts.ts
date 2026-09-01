/**
 * MTA-STS Policy Fetch Probe - Bead 10 / AUTH-003
 *
 * Fetches MTA-STS policy from https://mta-sts.{domain}/.well-known/mta-sts.txt
 * Validates policy format and extracts mode/max_age/mx directives.
 */

import * as dns from 'node:dns';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';
import { isExpiryFresh, probeAllowlistManager } from './allowlist.js';
import { checkSSRF, validateUrl } from './ssrf-guard.js';

export interface MTASTSProbeResult {
  success: boolean;
  domain: string;
  policyUrl: string;
  policy?: MTASTSPolicy;
  rawPolicy?: string;
  error?: string;
  responseTimeMs: number;
  tlsVersion?: string;
  certificateValid?: boolean;
}

export interface MTASTSPolicy {
  version: string;
  mode: 'enforce' | 'testing' | 'none';
  maxAge: number;
  mx: string[];
  raw: string;
}

const MAX_POLICY_BYTES = 64 * 1024;

class MTASTSProbeTimeoutError extends Error {
  constructor() {
    super('MTA-STS probe deadline exceeded');
    this.name = 'MTASTSProbeTimeoutError';
  }
}

interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

interface PolicyResponse {
  statusCode: number;
  statusMessage?: string;
  headers: IncomingHttpHeaders;
  body: string;
}

function remainingMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

/** Race a DNS operation against the probe's cumulative deadline. */
function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new MTASTSProbeTimeoutError());

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      reject(new MTASTSProbeTimeoutError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

async function resolvePinnedAddress(hostname: string, signal: AbortSignal): Promise<PinnedAddress> {
  const records = await withAbort(dns.promises.lookup(hostname, { all: true }), signal);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`DNS resolution returned no addresses for ${hostname}`);
  }

  const addresses: PinnedAddress[] = [];
  for (const record of records) {
    if (!record || typeof record.address !== 'string') {
      throw new Error(`DNS resolution returned a non-IP address for ${hostname}`);
    }
    const family = isIP(record.address);
    if (family !== 4 && family !== 6) {
      throw new Error(`DNS resolution returned a non-IP address for ${hostname}`);
    }
    if (record.family !== 4 && record.family !== 6) {
      throw new Error(`DNS resolution returned an invalid address family for ${hostname}`);
    }
    if (record.family !== family) {
      throw new Error(`DNS resolution returned a mismatched address family for ${hostname}`);
    }

    const check = checkSSRF(record.address);
    if (!check.allowed) {
      throw new Error(
        `SSRF DNS rebinding blocked: ${hostname} resolved to ${record.address} (${check.reason})`
      );
    }
    addresses.push({ address: record.address, family });
  }

  return addresses[0];
}

function declaredBodySize(headers: IncomingHttpHeaders): number | null {
  const value = headers['content-length'];
  if (value === undefined) return null;
  const text = Array.isArray(value) ? value.join(',') : value;
  if (!/^\d+$/.test(text)) throw new Error('MTA-STS response has an invalid Content-Length');
  const length = Number(text);
  if (!Number.isSafeInteger(length)) throw new Error('MTA-STS response Content-Length is invalid');
  return length;
}

/**
 * Issue one pinned HTTPS request and consume its body under the same signal.
 * Native https does not follow redirects, so every 3xx is rejected here.
 */
function requestPolicy(
  options: https.RequestOptions,
  signal: AbortSignal,
  deadline: number
): Promise<PolicyResponse> {
  return new Promise((resolve, reject) => {
    let request: ReturnType<typeof https.request> | undefined;
    let response: IncomingMessage | undefined;
    let settled = false;
    let bodyComplete = false;
    let chunks: Buffer[] = [];
    let bodyBytes = 0;

    const cleanupResponse = () => {
      if (!response) return;
      response.off('data', onData);
      response.off('end', onEnd);
      response.off('error', onResponseError);
      response.off('aborted', onAborted);
      response.off('close', onResponseClose);
    };
    const cleanup = () => {
      cleanupResponse();
      request?.off('error', onRequestError);
      request?.off('timeout', onRequestTimeout);
      signal.removeEventListener('abort', onAbort);
    };
    const destroy = () => {
      // Destroy without an error after cleanup so Node cannot emit an
      // unhandled error event for a listener we just removed.
      request?.destroy();
      response?.destroy();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      destroy();
      reject(error);
    };
    const finish = () => {
      if (settled || !response) return;
      settled = true;
      bodyComplete = true;
      const body = Buffer.concat(chunks).toString('utf8');
      chunks = [];
      cleanup();
      resolve({
        statusCode: response.statusCode ?? 0,
        statusMessage: response.statusMessage,
        headers: response.headers,
        body,
      });
    };
    const onAbort = () => fail(new MTASTSProbeTimeoutError());
    const onRequestError = (error: Error) => fail(error);
    const onRequestTimeout = () => fail(new MTASTSProbeTimeoutError());
    const onResponseError = (error: Error) => fail(error);
    const onAborted = () => fail(new Error('MTA-STS response was aborted'));
    const onResponseClose = () => {
      if (!bodyComplete) fail(new Error('MTA-STS response closed before body completion'));
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bodyBytes += buffer.byteLength;
      if (bodyBytes > MAX_POLICY_BYTES) {
        fail(new Error('MTA-STS response body exceeds 65536 bytes'));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      bodyComplete = true;
      finish();
    };

    try {
      signal.addEventListener('abort', onAbort, { once: true });
      request = https.request(options, (incoming) => {
        response = incoming;
        if (settled) {
          incoming.destroy();
          return;
        }
        const statusCode = incoming.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400) {
          fail(new Error(`HTTP redirect ${statusCode} is not allowed`));
          return;
        }
        if (statusCode < 200 || statusCode >= 300) {
          fail(new Error(`HTTP ${statusCode}: ${incoming.statusMessage ?? ''}`.trim()));
          return;
        }

        try {
          const length = declaredBodySize(incoming.headers);
          if (length !== null && length > MAX_POLICY_BYTES) {
            fail(new Error('MTA-STS response Content-Length exceeds 65536 bytes'));
            return;
          }
        } catch (error) {
          fail(error);
          return;
        }

        incoming.on('data', onData);
        incoming.on('end', onEnd);
        incoming.on('error', onResponseError);
        incoming.on('aborted', onAborted);
        incoming.on('close', onResponseClose);
      });
      request.on('error', onRequestError);
      request.setTimeout(remainingMs(deadline), onRequestTimeout);
      if (settled) {
        request.destroy();
        return;
      }
      if (signal.aborted) {
        onAbort();
        return;
      }
      request.end();
    } catch (error) {
      fail(error);
    }
  });
}

/**
 * Parse MTA-STS policy text
 */
function parsePolicy(raw: string): MTASTSPolicy | null {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const policy: Partial<MTASTSPolicy> = {
    mx: [],
    raw,
  };

  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();

    switch (key.toLowerCase()) {
      case 'version':
        policy.version = value;
        break;
      case 'mode':
        if (['enforce', 'testing', 'none'].includes(value.toLowerCase())) {
          policy.mode = value.toLowerCase() as 'enforce' | 'testing' | 'none';
        }
        break;
      case 'max_age': {
        const parsedMaxAge = parseInt(value, 10);
        if (!Number.isNaN(parsedMaxAge) && parsedMaxAge >= 0) {
          policy.maxAge = parsedMaxAge;
        }
        break;
      }
      case 'mx':
        policy.mx?.push(value);
        break;
    }
  }

  // Validate required fields
  if (!policy.version || !policy.mode || policy.maxAge === undefined) {
    return null;
  }

  return policy as MTASTSPolicy;
}

/**
 * Fetch MTA-STS policy for a domain
 *
 * @param domain - Target domain for MTA-STS policy
 * @param tenantId - Tenant ID for allowlist scoping (AUTH-003)
 * @param options - Probe options including timeout and allowlist settings
 */
export async function fetchMTASTSPolicy(
  domain: string,
  tenantId: string,
  options?: {
    timeoutMs?: number;
    checkAllowlist?: boolean;
    expiresAt?: Date;
  }
): Promise<MTASTSProbeResult> {
  const { timeoutMs = 10000, checkAllowlist = true, expiresAt } = options || {};
  const policyUrl = `https://mta-sts.${domain}/.well-known/mta-sts.txt`;
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const { signal } = controller;

  try {
    if (!isExpiryFresh(expiresAt)) {
      return {
        success: false,
        domain,
        policyUrl,
        error: 'Persisted DNS evidence expired before probe start',
        responseTimeMs: Date.now() - startTime,
      };
    }
    if (deadline <= Date.now() || signal.aborted) {
      throw new MTASTSProbeTimeoutError();
    }

    const urlCheck = validateUrl(policyUrl);
    if (!urlCheck.allowed || !urlCheck.url) {
      return {
        success: false,
        domain,
        policyUrl,
        error: `SSRF blocked: ${urlCheck.reason}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    const targetHostname = urlCheck.url.hostname;
    if (checkAllowlist && !probeAllowlistManager.isAllowed(tenantId, targetHostname, 443)) {
      return {
        success: false,
        domain,
        policyUrl,
        error: 'Destination not in allowlist. Generate allowlist from DNS results first.',
        responseTimeMs: Date.now() - startTime,
      };
    }

    const pinned = await resolvePinnedAddress(targetHostname, signal);
    if (deadline <= Date.now() || signal.aborted) {
      throw new MTASTSProbeTimeoutError();
    }
    if (!isExpiryFresh(expiresAt)) {
      throw new Error('Persisted DNS evidence expired before fetch start');
    }

    const response = await requestPolicy(
      {
        protocol: 'https:',
        hostname: targetHostname,
        port: 443,
        path: `${urlCheck.url.pathname}${urlCheck.url.search}`,
        method: 'GET',
        agent: false,
        servername: targetHostname,
        rejectUnauthorized: true,
        headers: {
          Host: targetHostname,
          'User-Agent': 'DNS-Ops-Probe/1.0',
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, pinned.address, pinned.family);
        },
        signal,
      },
      signal,
      deadline
    );

    const rawPolicy = response.body;
    const policy = parsePolicy(rawPolicy);
    if (!policy) {
      return {
        success: false,
        domain,
        policyUrl,
        rawPolicy,
        error: 'Failed to parse MTA-STS policy: missing required fields',
        responseTimeMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      domain,
      policyUrl,
      policy,
      rawPolicy,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = signal.aborted || error instanceof MTASTSProbeTimeoutError;

    return {
      success: false,
      domain,
      policyUrl,
      error: isTimeout ? `Timeout after ${timeoutMs}ms` : errorMessage,
      responseTimeMs: Date.now() - startTime,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate that a domain has valid MTA-STS TXT record before fetching policy
 */
export async function validateMTASTSTxtRecord(
  _domain: string,
  txtRecords: string[]
): Promise<{ valid: boolean; id?: string; error?: string }> {
  // Look for _mta-sts TXT record
  const mtaStsRecord = txtRecords.find((r) => r.includes('v=STSv1'));

  if (!mtaStsRecord) {
    return { valid: false, error: 'No MTA-STS TXT record found' };
  }

  // Extract ID from record (v=STSv1; id=YYYYMMDD)
  const idMatch = mtaStsRecord.match(/id=(\d+)/);
  if (!idMatch) {
    return { valid: false, error: 'MTA-STS TXT record missing id parameter' };
  }

  return { valid: true, id: idMatch[1] };
}
