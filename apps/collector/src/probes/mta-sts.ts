/**
 * MTA-STS Policy Fetch Probe - Bead 10 / AUTH-003
 *
 * Fetches MTA-STS policy from https://mta-sts.{domain}/.well-known/mta-sts.txt
 * Validates policy format and extracts mode/max_age/mx directives.
 */

import { isExpiryFresh, probeAllowlistManager } from './allowlist.js';
import { resolveAndCheck, validateUrl } from './ssrf-guard.js';

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
    // SSRF check — step 1: reject bad URLs (IP literals, localhost, bad protocol)
    const urlCheck = validateUrl(policyUrl);
    if (!urlCheck.allowed) {
      return {
        success: false,
        domain,
        policyUrl,
        error: `SSRF blocked: ${urlCheck.reason}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // SSRF check — step 2: resolve hostname and check resolved IP
    // Closes DNS rebinding TOCTOU gap (see docs/security/probe-sandbox-review.md)
    const targetHostname = urlCheck.url?.hostname;
    if (targetHostname) {
      const dnsCheck = await resolveAndCheck(targetHostname);
      if (!dnsCheck.allowed) {
        return {
          success: false,
          domain,
          policyUrl,
          error: `SSRF DNS rebinding blocked: ${dnsCheck.reason}`,
          responseTimeMs: Date.now() - startTime,
        };
      }
    }

    // Check allowlist if enabled (tenant-scoped via probeAllowlistManager)
    if (checkAllowlist) {
      const hostname = `mta-sts.${domain}`;
      if (!probeAllowlistManager.isAllowed(tenantId, hostname, 443)) {
        return {
          success: false,
          domain,
          policyUrl,
          error: 'Destination not in allowlist. Generate allowlist from DNS results first.',
          responseTimeMs: Date.now() - startTime,
        };
      }
    }

    // The semaphore or DNS/allowlist checks may have delayed the request.
    // Recheck the persisted evidence immediately before starting the fetch.
    if (!isExpiryFresh(expiresAt)) {
      return {
        success: false,
        domain,
        policyUrl,
        error: 'Persisted DNS evidence expired before fetch start',
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Fetch policy with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(policyUrl, {
      signal: controller.signal,
      // SECURITY: reject all redirects — a redirect to http://127.0.0.1/...
      // would bypass the SSRF guard because the SSRF check runs on the original
      // URL, not on the redirect target. With 'error', the fetch throws on any
      // 3xx response and we never follow it. See: docs/security/probe-sandbox-review.md
      redirect: 'error',
      headers: {
        'User-Agent': 'DNS-Ops-Probe/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        domain,
        policyUrl,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    const rawPolicy = await response.text();
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

    // Handle specific error types
    if (errorMessage.includes('abort')) {
      return {
        success: false,
        domain,
        policyUrl,
        error: `Timeout after ${timeoutMs}ms`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    return {
      success: false,
      domain,
      policyUrl,
      error: errorMessage,
      responseTimeMs: Date.now() - startTime,
    };
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
