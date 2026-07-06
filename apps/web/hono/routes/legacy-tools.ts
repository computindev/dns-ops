/**
 * Legacy Tools API Routes
 *
 * Provides safe deep-linking to legacy DMARC/DKIM tools.
 *
 * IMPORTANT: These deep-links are provided for backward compatibility only.
 * No parity claims are made between legacy tool outputs and new workbench findings.
 * Users should treat legacy tool results as informational, not authoritative.
 *
 * PR-03.1: Startup validation for legacy tool URLs
 * - Logs warning on first access if URLs not configured
 * - Returns HTTP 503 with INFRA_CONFIG_MISSING code for unconfigured tools
 */

import {
  DomainRepository,
  LegacyAccessLogRepository,
  ShadowComparisonRepository,
} from '@dns-ops/db';
import { findings as findingsTable, snapshots as snapshotsTable } from '@dns-ops/db/schema';
import { isValidDomain as isValidDomainCanonical } from '@dns-ops/parsing';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/authorization.js';
import {
  type ApiErrorEnvelope,
  ErrorCode,
  getWebLogger,
  trackLegacyOpen,
} from '../middleware/error-tracking.js';
import type { Env } from '../types.js';

// =============================================================================
// PR-03.1: Startup Validation for Legacy Tool URLs
// =============================================================================

/**
 * Tracks whether we've logged the startup warning for unconfigured tools.
 * We log once per process lifetime, not on every request.
 */
let hasLoggedConfigWarning = false;

/**
 * Check if legacy tool URLs are configured and log warning on first access.
 * Returns an object indicating which tools are available.
 */
function checkLegacyToolsConfig(): {
  dmarcAvailable: boolean;
  dkimAvailable: boolean;
} {
  const dmarcUrl = process.env.VITE_DMARC_TOOL_URL;
  const dkimUrl = process.env.VITE_DKIM_TOOL_URL;

  const dmarcAvailable = !!dmarcUrl && dmarcUrl.length > 0;
  const dkimAvailable = !!dkimUrl && dkimUrl.length > 0;

  // Log warning on first access if any tool is unconfigured
  if (!hasLoggedConfigWarning && (!dmarcAvailable || !dkimAvailable)) {
    hasLoggedConfigWarning = true;
    const logger = getWebLogger();
    const missing: string[] = [];
    if (!dmarcAvailable) missing.push('VITE_DMARC_TOOL_URL');
    if (!dkimAvailable) missing.push('VITE_DKIM_TOOL_URL');

    logger.warn('Legacy tools configuration incomplete', {
      missingConfig: missing,
      message: `Legacy tool URLs not configured: ${missing.join(', ')}. Deep-links will return 503.`,
    });
  }

  return { dmarcAvailable, dkimAvailable };
}

/**
 * Build a 503 response for unconfigured legacy tool.
 * Uses standardized error envelope with INFRA_CONFIG_MISSING code.
 */
function configMissingResponse(c: import('hono').Context<Env>, toolName: string): Response {
  const requestId = c.req.header('X-Request-ID') || `req_${Date.now().toString(36)}`;

  // Map tool name to environment variable name
  const envVarMap: Record<string, string> = {
    DMARC: 'VITE_DMARC_TOOL_URL',
    DKIM: 'VITE_DKIM_TOOL_URL',
  };

  const envVar = envVarMap[toolName] ?? `${toolName.toUpperCase()}_TOOL_URL`;

  const envelope: ApiErrorEnvelope = {
    ok: false,
    code: ErrorCode.INFRA_CONFIG_MISSING,
    error: `${toolName} tool not configured`,
    requestId,
    details: {
      tool: toolName.toLowerCase(),
      hint: `Set the ${envVar} environment variable to enable this feature.`,
    },
  };

  return c.json(envelope, 503);
}

// IP address pattern (IPv4)
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

// Blocklist for dangerous/special domains
const BLOCKED_DOMAINS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'localhost.localdomain',
]);

// DKIM selector validation (alphanumeric, hyphens, underscores)
const SELECTOR_RE = /^[a-zA-Z0-9_-]{1,63}$/;

/**
 * Validate and sanitize domain input for legacy tools
 *
 * Uses canonical isValidDomain from @dns-ops/parsing for format validation,
 * then adds extra security checks specific to legacy tool usage:
 * - Rejects punycode/IDN domains (legacy tools don't support IDN)
 * - Rejects IP addresses (IPv4 and IPv6)
 * - Rejects special hostnames (localhost, etc.)
 * - Rejects URL schemes in domain field
 * - Rejects injection characters (#, \n, \0)
 */
function isValidDomain(domain: string): boolean {
  // Additional security checks MUST run first (before canonical validation)
  // because canonical converts Unicode to punycode

  // Reject injection characters (URL fragments, newlines, null bytes)
  if (/[#\n\r\0]/.test(domain)) return false;

  // Reject URL schemes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(domain)) return false;

  // Reject punycode/IDN domains (reject both raw punycode and Unicode that would convert to it)
  if (domain.startsWith('xn--')) return false;
  // Also reject if domain contains non-ASCII characters (would convert to punycode)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional ASCII-only check
  if (/[^\x00-\x7F]/.test(domain)) return false;

  // Reject IPv4 addresses
  if (IPV4_RE.test(domain)) return false;

  // Reject IPv6 addresses in bracket notation [::1] or raw ::1
  // DNS domains can't be IPv6, only IP addresses
  if (domain.startsWith('[') && domain.endsWith(']')) return false;
  // Also reject raw IPv6 (contains : and is all hex digits/colons)
  if (domain.includes(':') && /^[0-9a-fA-F:]+$/.test(domain)) return false;

  // Reject blocked hostnames (case-insensitive)
  const lowerDomain = domain.toLowerCase();
  if (BLOCKED_DOMAINS.has(lowerDomain)) return false;

  // Reject localhost patterns
  if (/^localhost/.test(lowerDomain)) return false;

  // Use canonical validation for basic format
  return isValidDomainCanonical(domain);
}

/**
 * Validate DKIM selector
 */
function isValidSelector(selector: string): boolean {
  if (!selector || selector.length > 63) return false;
  return SELECTOR_RE.test(selector);
}

/**
 * Build a deep-link URL safely
 */
function buildDeepLink(baseUrl: string, params: Record<string, string>): string | null {
  try {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export const legacyToolsRoutes = new Hono<Env>();

/**
 * POST /api/legacy-tools/log
 * Log access to legacy tools for shadow comparison analysis
 */
legacyToolsRoutes.post('/log', requireAuth, async (c) => {
  try {
    const body = await c.req.json();
    const { tool, domain, action, metadata } = body;

    // Validate required fields
    if (!tool || !domain || !action) {
      return c.json({ error: 'Missing required fields: tool, domain, action' }, 400);
    }

    // Validate tool type
    if (!['dmarc', 'dkim'].includes(tool)) {
      return c.json({ error: 'Invalid tool type. Must be "dmarc" or "dkim"' }, 400);
    }

    // Validate action type
    if (!['view', 'navigate'].includes(action)) {
      return c.json({ error: 'Invalid action type. Must be "view" or "navigate"' }, 400);
    }

    // Track legacy tool access (Bead 14.4)
    const tenantId = c.get('tenantId') || 'default';
    trackLegacyOpen({
      tenantId,
      toolType: tool,
      domain,
      parameters: { action, ...metadata },
    });

    // Persist to database for shadow comparison analysis (Bead 09/12)
    let persisted = false;
    const db = c.get('db');
    if (db) {
      const legacyLogRepo = new LegacyAccessLogRepository(db);
      const toolTypeMap: Record<string, 'dmarc-check' | 'dkim-check'> = {
        dmarc: 'dmarc-check',
        dkim: 'dkim-check',
      };
      await legacyLogRepo.log({
        toolType: toolTypeMap[tool] ?? 'dmarc-check',
        domain,
        requestSource: 'ui',
        requestedBy: c.get('actorId') ?? undefined,
        responseStatus: 'success',
        tenantId: tenantId === 'default' ? undefined : tenantId,
      });
      persisted = true;
    }

    return c.json({
      success: true,
      logged: true,
      persisted,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error logging legacy tool access:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/unknown',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    // Return 200 to not break the UI, but signal that persistence failed
    return c.json(
      {
        success: false,
        logged: false,
        persisted: false,
        error: 'Failed to log access',
      },
      200
    );
  }
});

/**
 * GET /api/legacy-tools/config
 * Get legacy tools configuration
 *
 * PR-03.1: Logs warning on first access if URLs not configured.
 */
legacyToolsRoutes.get('/config', (c) => {
  // PR-03.1: Check config and log warning if needed
  const { dmarcAvailable, dkimAvailable } = checkLegacyToolsConfig();

  // Return sanitized configuration (no sensitive URLs in production)
  const config = {
    dmarc: {
      name: 'DMARC Analyzer',
      available: dmarcAvailable,
      supportDeepLink: dmarcAvailable,
      supportEmbed: false,
      authRequired: true,
      disclaimer:
        'Legacy tool output is informational only. No parity with workbench findings is guaranteed.',
    },
    dkim: {
      name: 'DKIM Validator',
      available: dkimAvailable,
      supportDeepLink: dkimAvailable,
      supportEmbed: false,
      authRequired: true,
      disclaimer:
        'Legacy tool output is informational only. No parity with workbench findings is guaranteed.',
    },
  };

  return c.json(config);
});

/**
 * GET /api/legacy-tools/dmarc/deeplink
 * Generate a deep-link to the legacy DMARC analyzer for a domain
 *
 * Query params:
 *   - domain: The domain to analyze (required)
 *
 * Returns:
 *   - url: The deep-link URL
 *   - disclaimer: Warning that this is a legacy tool
 *
 * PR-03.1: Returns 503 with INFRA_CONFIG_MISSING if tool not configured.
 */
legacyToolsRoutes.get('/dmarc/deeplink', requireAuth, (c) => {
  const domain = c.req.query('domain');
  const dmarcUrl = process.env.VITE_DMARC_TOOL_URL;

  // PR-03.1: Return 503 with INFRA_CONFIG_MISSING code for unconfigured tool
  if (!dmarcUrl) {
    return configMissingResponse(c, 'DMARC');
  }

  if (!domain) {
    return c.json({ error: 'Domain is required' }, 400);
  }

  if (!isValidDomain(domain)) {
    return c.json({ error: 'Invalid domain format' }, 400);
  }

  const deepLink = buildDeepLink(dmarcUrl, { domain });
  if (!deepLink) {
    return c.json({ error: 'Failed to build deep-link URL' }, 500);
  }

  return c.json({
    tool: 'dmarc',
    domain,
    url: deepLink,
    disclaimer:
      'This links to a legacy tool. Results may differ from workbench findings. No parity is guaranteed.',
    legacyWarning: true,
    openInNewTab: true,
  });
});

/**
 * GET /api/legacy-tools/dkim/deeplink
 * Generate a deep-link to the legacy DKIM validator for a domain and selector
 *
 * Query params:
 *   - domain: The domain to analyze (required)
 *   - selector: The DKIM selector (required)
 *
 * Returns:
 *   - url: The deep-link URL
 *   - disclaimer: Warning that this is a legacy tool
 *
 * PR-03.1: Returns 503 with INFRA_CONFIG_MISSING if tool not configured.
 */
legacyToolsRoutes.get('/dkim/deeplink', requireAuth, (c) => {
  const domain = c.req.query('domain');
  const selector = c.req.query('selector');
  const dkimUrl = process.env.VITE_DKIM_TOOL_URL;

  // PR-03.1: Return 503 with INFRA_CONFIG_MISSING code for unconfigured tool
  if (!dkimUrl) {
    return configMissingResponse(c, 'DKIM');
  }

  if (!domain) {
    return c.json({ error: 'Domain is required' }, 400);
  }

  if (!selector) {
    return c.json({ error: 'Selector is required' }, 400);
  }

  if (!isValidDomain(domain)) {
    return c.json({ error: 'Invalid domain format' }, 400);
  }

  if (!isValidSelector(selector)) {
    return c.json({ error: 'Invalid selector format' }, 400);
  }

  const deepLink = buildDeepLink(dkimUrl, { domain, selector });
  if (!deepLink) {
    return c.json({ error: 'Failed to build deep-link URL' }, 500);
  }

  return c.json({
    tool: 'dkim',
    domain,
    selector,
    url: deepLink,
    disclaimer:
      'This links to a legacy tool. Results may differ from workbench findings. No parity is guaranteed.',
    legacyWarning: true,
    openInNewTab: true,
  });
});

/**
 * POST /api/legacy-tools/bulk-deeplinks
 * Generate multiple deep-links in a single request
 *
 * Body:
 *   - requests: Array of { tool: 'dmarc'|'dkim', domain: string, selector?: string }
 *
 * Returns array of deep-link results
 *
 * PR-03.1: Returns per-item errors with config info for unconfigured tools.
 */
legacyToolsRoutes.post('/bulk-deeplinks', requireAuth, async (c) => {
  const dmarcUrl = process.env.VITE_DMARC_TOOL_URL;
  const dkimUrl = process.env.VITE_DKIM_TOOL_URL;

  let body: { requests?: Array<{ tool: string; domain: string; selector?: string }> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { requests } = body;
  if (!requests || !Array.isArray(requests)) {
    return c.json({ error: 'requests array is required' }, 400);
  }

  if (requests.length > 50) {
    return c.json({ error: 'Maximum 50 requests per batch' }, 400);
  }

  const results = requests.map((req, index) => {
    const { tool, domain, selector } = req;

    if (!tool || !['dmarc', 'dkim'].includes(tool)) {
      return { index, error: 'Invalid tool type' };
    }

    if (!domain || !isValidDomain(domain)) {
      return { index, error: 'Invalid domain' };
    }

    if (tool === 'dmarc') {
      // PR-03.1: Include INFRA_CONFIG_MISSING code in error for unconfigured tool
      if (!dmarcUrl) {
        return {
          index,
          error: 'DMARC tool not configured',
          code: ErrorCode.INFRA_CONFIG_MISSING,
        };
      }
      const url = buildDeepLink(dmarcUrl, { domain });
      return url ? { index, tool, domain, url } : { index, error: 'Failed to build URL' };
    }

    if (tool === 'dkim') {
      // PR-03.1: Include INFRA_CONFIG_MISSING code in error for unconfigured tool
      if (!dkimUrl) {
        return {
          index,
          error: 'DKIM tool not configured',
          code: ErrorCode.INFRA_CONFIG_MISSING,
        };
      }
      if (!selector || !isValidSelector(selector)) {
        return { index, error: 'Invalid selector' };
      }
      const url = buildDeepLink(dkimUrl, { domain, selector });
      return url ? { index, tool, domain, selector, url } : { index, error: 'Failed to build URL' };
    }

    return { index, error: 'Unknown error' };
  });

  return c.json({
    results,
    disclaimer:
      'These links point to legacy tools. Results may differ from workbench findings. No parity is guaranteed.',
    legacyWarning: true,
  });
});

/**
 * GET /api/legacy-tools/shadow-stats
 * Get shadow comparison statistics backed by stored access and comparison results
 */
legacyToolsRoutes.get('/shadow-stats', requireAuth, async (c) => {
  const db = c.get('db');
  const domain = c.req.query('domain');
  const tenantId = c.get('tenantId');

  // Defense in depth: requireAuth + enforceTenantIsolation already guarantee a
  // tenant context, but every downstream query depends on this value, so we
  // fail closed if it is somehow absent.
  if (!tenantId) {
    return c.json({ error: 'Unauthorized', message: 'Tenant context required.' }, 401);
  }

  try {
    const legacyLogRepo = new LegacyAccessLogRepository(db);
    const shadowRepo = new ShadowComparisonRepository(db);

    // Get legacy access statistics (tenant-scoped)
    const legacyStats = await legacyLogRepo.getStats(tenantId);

    // Get shadow comparison statistics (tenant-scoped)
    const shadowStats = await shadowRepo.getStats(tenantId);

    // If domain is specified, get domain-specific stats
    let domainStats = null;
    let newFindingsCount = 0;
    const discrepancies: Array<{
      id: string;
      field: string;
      legacyValue: unknown;
      newValue: unknown;
      comparedAt: Date;
    }> = [];

    if (domain) {
      // Tenant-scoped domain rows: foreign-tenant and NULL-tenant (system)
      // rows are excluded by the repositories.
      const domainLogs = await legacyLogRepo.findByDomain(domain, tenantId);
      const domainComparisons = await shadowRepo.findByDomain(domain, tenantId);

      // Snapshots carry no tenantId, so resolve domain ownership before
      // counting findings. Without this gate a caller who knows another
      // tenant's domain name could read that tenant's findings count.
      const domainRepo = new DomainRepository(db);
      const ownedDomain = await domainRepo.findByNameForTenant(domain.toLowerCase(), tenantId);
      if (ownedDomain) {
        const domainSnapshots = await db.selectWhere(
          snapshotsTable,
          eq(snapshotsTable.domainName, domain)
        );
        // Sort by createdAt desc and get the latest
        domainSnapshots.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        if (domainSnapshots.length > 0) {
          const findings = await db.selectWhere(
            findingsTable,
            eq(findingsTable.snapshotId, domainSnapshots[0].id)
          );
          newFindingsCount = findings.length;
        }
      }

      // Extract discrepancies from mismatched comparisons
      const mismatches = domainComparisons.filter(
        (c) => c.status === 'mismatch' || c.status === 'partial-match'
      );

      for (const mismatch of mismatches.slice(0, 10)) {
        const comparisons = mismatch.comparisons as Array<{
          field: string;
          status: string;
          legacyValue: unknown;
          newValue: unknown;
        }>;

        for (const comp of comparisons) {
          if (comp.status === 'mismatch') {
            discrepancies.push({
              id: mismatch.id,
              field: comp.field,
              legacyValue: comp.legacyValue,
              newValue: comp.newValue,
              comparedAt: mismatch.comparedAt,
            });
          }
        }
      }

      domainStats = {
        legacyAccessCount: domainLogs.length,
        comparisonCount: domainComparisons.length,
        matchCount: domainComparisons.filter((c) => c.status === 'match').length,
        mismatchCount: domainComparisons.filter((c) => c.status === 'mismatch').length,
        partialMatchCount: domainComparisons.filter((c) => c.status === 'partial-match').length,
        pendingAdjudication: domainComparisons.filter(
          (c) => !c.adjudication && c.status !== 'match'
        ).length,
      };
    }

    return c.json({
      domain: domain || 'all',
      legacyAccessCount: domain ? (domainStats?.legacyAccessCount ?? 0) : legacyStats.total,
      newFindingsCount,
      discrepancies,
      stats: {
        legacy: {
          total: legacyStats.total,
          byToolType: legacyStats.byToolType,
          successRate: legacyStats.successRate,
          last24h: legacyStats.last24h,
        },
        shadow: {
          total: shadowStats.total,
          matches: shadowStats.matches,
          mismatches: shadowStats.mismatches,
          partialMatches: shadowStats.partialMatches,
          acknowledged: shadowStats.acknowledged,
          pending: shadowStats.pending,
        },
        domain: domainStats,
      },
      durable: true, // Indicates data is persisted to database
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error('Shadow stats error:', error instanceof Error ? error : new Error(String(error)), {
      requestId: c.req.header('X-Request-ID'),
      path: '/api/unknown',
      method: 'GET',
      tenantId: c.get('tenantId'),
    });
    return c.json(
      {
        error: 'Failed to get shadow comparison statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
