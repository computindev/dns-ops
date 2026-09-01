/**
 * Probe Routes - Bead 10 / Issue #67
 *
 * API endpoints for triggering non-DNS probes.
 * All probes require allowlist validation and SSRF protection.
 *
 * Authorization (Issue #67): every route derives probe targets exclusively
 * from fresh persisted DNS evidence — the tenant-owned domain → latest
 * complete snapshot → consistent record set → source observation chain —
 * and revalidates that evidence on every request. Caller-supplied DNS
 * arrays (txtRecords / mxRecords / dnsResults) are rejected, never mixed
 * with trusted evidence.
 *
 * ## Usage Model (dns-ops-1j4.13.5)
 *
 * Probes are designed for **programmatic use only**:
 * - Called by mail collection during snapshot creation
 * - Called by monitoring jobs for MTA-STS/TLS health
 * - NOT exposed in the web UI
 *
 * Rationale for no operator UI:
 * - Probes make external connections (SSRF risk if exposed)
 * - Allowlist enforcement is complex to explain in UI
 * - Results are integrated into findings/evidence automatically
 * - Direct API use is better suited for automation
 *
 * If an operator UI is needed in the future:
 * - Create a "probe preview" mode that shows what would be probed
 * - Show probe results from existing snapshots (no live probing)
 * - Consider a separate "advanced diagnostics" permission
 */

import { normalizeDNSDomain } from '@dns-ops/parsing';
import { Hono } from 'hono';
import { getEnvConfig } from '../config/env.js';
import type { AllowlistEntry } from '../probes/allowlist.js';
import {
  fetchMTASTSPolicy,
  probeAllowlistManager,
  probeMXHosts,
  probeSMTPStarttls,
} from '../probes/index.js';
import {
  type EvidenceFailure,
  loadPersistedMtaStsEvidence,
  loadPersistedMxEvidence,
} from '../probes/persisted-dns-authorization.js';
import { getProbeSemaphore, initProbeSemaphore } from '../probes/semaphore.js';
import type { SMTPProbeResult } from '../probes/smtp-starttls.js';
import type { Env } from '../types.js';

// Initialise the global probe semaphore from env config at module load time.
// This ensures the configured PROBE_CONCURRENCY is used, not the default.
initProbeSemaphore(getEnvConfig().probes.concurrency);

export const probeRoutes = new Hono<Env>();

/**
 * Middleware: Check if active probes are enabled
 *
 * Active probing is an OPTIONAL feature that must be explicitly enabled
 * via ENABLE_ACTIVE_PROBES=true environment variable.
 *
 * Rationale:
 * - Active probes make outbound TCP/TLS connections to external servers
 * - This requires careful SSRF protections and operator awareness
 * - Not all deployments need or want active probing
 */
probeRoutes.use('/mta-sts', async (c, next) => {
  const config = getEnvConfig();
  if (!config.probes.enabled) {
    return c.json(
      {
        error: 'Active probing is not enabled',
        message: 'Set ENABLE_ACTIVE_PROBES=true to enable MTA-STS probes',
        feature: 'active-probes',
      },
      503
    );
  }
  return next();
});

probeRoutes.use('/smtp-starttls', async (c, next) => {
  const config = getEnvConfig();
  if (!config.probes.enabled) {
    return c.json(
      {
        error: 'Active probing is not enabled',
        message: 'Set ENABLE_ACTIVE_PROBES=true to enable SMTP STARTTLS probes',
        feature: 'active-probes',
      },
      503
    );
  }
  return next();
});

/** Fail closed when the request context has no database adapter bound. */
function requireDb(c: { get: (key: 'db') => Env['Variables']['db'] }) {
  const db = c.get('db');
  if (!db) {
    return {
      response: {
        status: 503 as const,
        body: {
          error: 'Database unavailable',
          reason: 'database-unavailable',
        },
      },
      db: undefined,
    };
  }
  return { response: undefined, db };
}

function failureResponse(failure: EvidenceFailure) {
  return { error: failure.error, reason: failure.reason };
}

/**
 * Caller-supplied DNS-shaped arrays are rejected outright (Issue #67):
 * they are not proven registered-domain evidence.
 */
function hasCallerSuppliedDnsEvidence(body: {
  txtRecords?: unknown;
  mxRecords?: unknown;
  dnsResults?: unknown;
}): boolean {
  return (
    body.txtRecords !== undefined || body.mxRecords !== undefined || body.dnsResults !== undefined
  );
}

/**
 * POST /api/probe/mta-sts
 * Fetch MTA-STS policy for a domain (persisted evidence only)
 */
probeRoutes.post('/mta-sts', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { domain } = body;
  const tenantId = c.get('tenantId');

  if (!domain || typeof domain !== 'string') {
    return c.json({ error: 'Domain is required', reason: 'missing-domain' }, 400);
  }
  // The whole body is checked: any DNS-shaped field is rejected, not only
  // the one this route consumes.
  if (hasCallerSuppliedDnsEvidence(body)) {
    return c.json(
      {
        error: 'Caller-supplied DNS records are not accepted',
        reason: 'caller-supplied-dns-evidence',
      },
      403
    );
  }

  const { response, db } = requireDb(c);
  if (response) return c.json(response.body, response.status);

  // Revalidate persisted evidence on every request, even if an in-memory
  // allowlist entry already exists.
  const evidence = await loadPersistedMtaStsEvidence(db, { domain, tenantId });
  if (!evidence.ok) {
    return c.json(failureResponse(evidence), evidence.status);
  }

  // Allowlist entries are derived only from the persisted evidence.
  probeAllowlistManager
    .getTenantAllowlist(tenantId)
    .generateFromDnsResults(evidence.domain, evidence.dnsResults);

  // Fetch policy — run under global semaphore to enforce PROBE_CONCURRENCY
  const config = getEnvConfig();
  const result = await getProbeSemaphore().run(() =>
    fetchMTASTSPolicy(evidence.domain, tenantId, {
      timeoutMs: config.probes.timeoutMs,
      checkAllowlist: true,
    })
  );

  return c.json({
    ...result,
    domain: evidence.domain,
    txtRecordId: evidence.txtRecordId,
  });
});

/**
 * POST /api/probe/smtp-starttls
 * Probe SMTP server for STARTTLS support (persisted MX evidence only)
 *
 * Body: { domain, hostname?, port? }
 * - `domain` must be a tenant-owned registered domain with fresh persisted MX evidence.
 * - Optional `hostname` must exactly match a persisted MX target (normalized).
 * - Only port 25 is permitted.
 * - Without `hostname`, every persisted MX target is probed.
 */
probeRoutes.post('/smtp-starttls', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { domain, hostname, port } = body;
  const tenantId = c.get('tenantId');

  // The whole body is checked: any DNS-shaped field is rejected, not only
  // the one this route consumes.
  if (hasCallerSuppliedDnsEvidence(body)) {
    return c.json(
      {
        error: 'Caller-supplied DNS records are not accepted',
        reason: 'caller-supplied-dns-evidence',
      },
      403
    );
  }
  if (!domain || typeof domain !== 'string') {
    return c.json({ error: 'Domain is required', reason: 'missing-domain' }, 400);
  }
  if (port !== undefined && port !== 25) {
    return c.json(
      { error: 'Only port 25 is permitted for SMTP probes', reason: 'port-not-permitted' },
      403
    );
  }

  const { response, db } = requireDb(c);
  if (response) return c.json(response.body, response.status);

  // Revalidate persisted evidence on every request, even if an in-memory
  // allowlist entry already exists.
  const evidence = await loadPersistedMxEvidence(db, { domain, tenantId });
  if (!evidence.ok) {
    return c.json(failureResponse(evidence), evidence.status);
  }

  const config = getEnvConfig();

  // Single-host probe: the requested hostname must exactly match a
  // persisted (normalized) MX target.
  if (hostname !== undefined) {
    if (typeof hostname !== 'string') {
      return c.json({ error: 'Hostname is required', reason: 'missing-hostname' }, 400);
    }
    const normalized = normalizeDNSDomain(hostname);
    const target = evidence.hosts.find((h) => h.hostname === normalized);
    if (!target) {
      return c.json(
        {
          error: 'Hostname does not match persisted MX evidence',
          reason: 'hostname-not-in-evidence',
        },
        403
      );
    }

    // Allowlist entries are derived only from the persisted evidence, and
    // only once the request is fully authorized.
    probeAllowlistManager
      .getTenantAllowlist(tenantId)
      .generateFromDnsResults(evidence.domain, evidence.dnsResults);

    // Run under global semaphore to enforce PROBE_CONCURRENCY
    const result = await getProbeSemaphore().run(() =>
      probeSMTPStarttls(target.hostname, tenantId, {
        port: 25,
        timeoutMs: config.probes.timeoutMs,
        checkAllowlist: true,
      })
    );

    return c.json(result);
  }

  // Batch probe of every persisted MX target
  probeAllowlistManager
    .getTenantAllowlist(tenantId)
    .generateFromDnsResults(evidence.domain, evidence.dnsResults);

  const results = await probeMXHosts(evidence.hosts, tenantId, {
    timeoutMs: config.probes.timeoutMs,
    concurrency: config.probes.concurrency,
  });

  return c.json({
    hosts: results,
    summary: {
      total: results.length,
      successful: results.filter((r: SMTPProbeResult) => r.success).length,
      supportsStarttls: results.filter((r: SMTPProbeResult) => r.supportsStarttls).length,
    },
  });
});

/**
 * POST /api/probe/allowlist/generate
 * Generate tenant-scoped allowlist entries from persisted DNS evidence only
 */
probeRoutes.post('/allowlist/generate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { domain } = body;
  const tenantId = c.get('tenantId');

  if (!domain || typeof domain !== 'string') {
    return c.json({ error: 'Domain is required', reason: 'missing-domain' }, 400);
  }
  // The whole body is checked: any DNS-shaped field is rejected, not only
  // the one this route consumes.
  if (hasCallerSuppliedDnsEvidence(body)) {
    return c.json(
      {
        error: 'Caller-supplied DNS records are not accepted',
        reason: 'caller-supplied-dns-evidence',
      },
      403
    );
  }

  const { response, db } = requireDb(c);
  if (response) return c.json(response.body, response.status);

  const mx = await loadPersistedMxEvidence(db, { domain, tenantId });
  const mtaSts = await loadPersistedMtaStsEvidence(db, { domain, tenantId });
  if (!mx.ok && !mtaSts.ok) {
    const failure = (mx.ok ? mtaSts : mx) as EvidenceFailure;
    return c.json(failureResponse(failure), failure.status);
  }

  const allowlist = probeAllowlistManager.getTenantAllowlist(tenantId);
  const entries: AllowlistEntry[] = [];
  if (mx.ok) {
    entries.push(...allowlist.generateFromDnsResults(mx.domain, mx.dnsResults));
  }
  if (mtaSts.ok) {
    entries.push(...allowlist.generateFromDnsResults(mtaSts.domain, mtaSts.dnsResults));
  }

  return c.json({
    domain,
    tenantId,
    entriesAdded: entries.length,
    entries: entries.map((e: AllowlistEntry) => ({
      type: e.type,
      hostname: e.hostname,
      port: e.port,
      expiresAt: e.expiresAt,
    })),
  });
});

/**
 * GET /api/probe/allowlist
 * List current tenant-scoped allowlist entries
 */
probeRoutes.get('/allowlist', (c) => {
  const tenantId = c.get('tenantId');
  const entries = probeAllowlistManager.getTenantAllowlist(tenantId).getAllEntries();

  return c.json({
    count: entries.length,
    entries: entries.map((e) => ({
      type: e.type,
      hostname: e.hostname,
      port: e.port,
      derivedFrom: e.derivedFrom,
      expiresAt: e.expiresAt,
    })),
  });
});

/**
 * GET /api/probe/ssrf-check/:target
 * Check if a target passes SSRF validation
 */
probeRoutes.get('/ssrf-check/:target', async (c) => {
  const target = c.req.param('target');
  const { checkSSRF } = await import('../probes/index.js');

  const result = checkSSRF(target);

  return c.json({
    target,
    ...result,
  });
});

/**
 * GET /api/probe/health
 * Probe service health check
 */
probeRoutes.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'probe-sandbox',
    activeTenants: probeAllowlistManager.getActiveTenants().length,
    timestamp: new Date().toISOString(),
  });
});
