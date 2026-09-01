/**
 * Service Auth Middleware
 *
 * Authentication middleware for the collector service.
 * Protects collector routes from arbitrary access.
 *
 * Authentication methods:
 * 1. Internal secret header (for web → collector calls)
 * 2. API key header (for external service access)
 * 3. Dev bypass (development only)
 *
 * Note: tenantId is normalized to UUID format for database compatibility.
 */

import {
  type ApiPrincipal,
  authenticateApiKey,
  getTenantUUID,
  isLegacyApiKeyAuthEnabled,
  parseApiPrincipals,
} from '@dns-ops/contracts';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types.js';
import { getCollectorLogger } from './error-tracking.js';

const logger = getCollectorLogger();

/**
 * Auth context from verified identity
 */
interface AuthContext {
  tenantId: string;
  actorId: string;
  isInternal?: boolean;
}

function getRuntimeSecret(name: 'INTERNAL_SECRET' | 'API_KEY_SECRET'): string | undefined {
  return process.env[name];
}

/**
 * Extract auth from internal secret header
 *
 * For secure web → collector communication.
 * Requires INTERNAL_SECRET env var to be set.
 */
function extractInternalSecret(
  c: Parameters<Parameters<typeof createMiddleware<Env>>[0]>[0]
): AuthContext | null {
  const internalSecret = c.req.header('X-Internal-Secret');
  const expectedSecret = getRuntimeSecret('INTERNAL_SECRET');

  if (!expectedSecret || !internalSecret) {
    return null;
  }

  if (internalSecret !== expectedSecret) {
    logger.warn('Invalid internal secret attempt', { method: c.req.method, path: c.req.path });
    return null;
  }

  const tenantId = c.req.header('X-Tenant-Id');
  const actorId = c.req.header('X-Actor-Id');

  if (!tenantId || !actorId) {
    logger.warn('Missing tenant or actor headers on internal request', {
      method: c.req.method,
      path: c.req.path,
    });
    return null;
  }

  return {
    tenantId,
    actorId,
    isInternal: true,
  };
}

/**
 * Extract auth from API key header
 *
 * Bare opaque tokens authenticate against API_PRINCIPALS_JSON (SHA-256 hash
 * match); tenant/actor come from the stored principal only (#66). The legacy
 * tenantId:actorId:secret format is gated behind ENABLE_LEGACY_API_KEY_AUTH
 * (literal "true", default off everywhere) for one release.
 */
async function extractApiKey(
  c: Parameters<Parameters<typeof createMiddleware<Env>>[0]>[0]
): Promise<AuthContext | null> {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    return null;
  }

  // Invalid principal configuration fails closed — never falls back to legacy.
  let principals: ApiPrincipal[];
  try {
    principals = parseApiPrincipals(process.env.API_PRINCIPALS_JSON);
  } catch {
    logger.warn('Rejected API key auth because API principal configuration is invalid', {
      method: c.req.method,
      path: c.req.path,
    });
    return null;
  }

  const auth = await authenticateApiKey(apiKey, principals, {
    enabled: isLegacyApiKeyAuthEnabled(process.env.ENABLE_LEGACY_API_KEY_AUTH),
    secret: getRuntimeSecret('API_KEY_SECRET'),
  });

  if (!auth) {
    logger.warn('Invalid API key attempt', { method: c.req.method, path: c.req.path });
    return null;
  }

  return {
    tenantId: auth.tenantId,
    actorId: auth.actorId,
  };
}

/**
 * Development bypass - only for local development
 */
function extractDevBypass(
  c: Parameters<Parameters<typeof createMiddleware<Env>>[0]>[0]
): AuthContext | null {
  // Explicit opt-in: only allow dev bypass when NODE_ENV is explicitly set to 'development'.
  // If NODE_ENV is unset, undefined, or any other value, dev bypass is rejected.
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') {
    return null;
  }

  const tenantId = c.req.header('X-Dev-Tenant');
  const actorId = c.req.header('X-Dev-Actor');

  if (!tenantId || !actorId) {
    return null;
  }

  return {
    tenantId,
    actorId,
    isInternal: true,
  };
}

/**
 * Service auth middleware - populates auth context from various sources
 *
 * Priority:
 * 1. Internal secret (web → collector)
 * 2. API key (external services)
 * 3. Dev bypass (development only)
 *
 * Note: tenantId is normalized to UUID format for database compatibility.
 */
export const serviceAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const authContext = extractInternalSecret(c) ?? (await extractApiKey(c)) ?? extractDevBypass(c);

  if (authContext) {
    // Normalize tenantId to UUID format for database compatibility
    const tenantUUID = await getTenantUUID(authContext.tenantId);
    c.set('tenantId', tenantUUID);
    c.set('actorId', authContext.actorId);
  }

  return next();
});

/**
 * Require service auth middleware - rejects requests without valid authentication
 *
 * Note: tenantId is normalized to UUID format for database compatibility.
 */
export const requireServiceAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const authContext = extractInternalSecret(c) ?? (await extractApiKey(c)) ?? extractDevBypass(c);

  if (!authContext) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Authentication required. Provide X-Internal-Secret, X-API-Key, or dev headers.',
      },
      401
    );
  }

  // Normalize tenantId to UUID format for database compatibility
  const tenantUUID = await getTenantUUID(authContext.tenantId);
  c.set('tenantId', tenantUUID);
  c.set('actorId', authContext.actorId);

  return next();
});

/**
 * Internal only middleware - for routes that should only be accessible
 * from internal services (web app)
 *
 * Note: tenantId is normalized to UUID format for database compatibility.
 */
export const internalOnlyMiddleware = createMiddleware<Env>(async (c, next) => {
  // Check for internal secret first
  const internalAuth = extractInternalSecret(c);
  if (internalAuth?.isInternal) {
    // Normalize tenantId to UUID format
    const tenantUUID = await getTenantUUID(internalAuth.tenantId);
    c.set('tenantId', tenantUUID);
    c.set('actorId', internalAuth.actorId);
    return next();
  }

  // Check for dev bypass in development
  const devAuth = extractDevBypass(c);
  if (devAuth?.isInternal) {
    // Normalize tenantId to UUID format
    const tenantUUID = await getTenantUUID(devAuth.tenantId);
    c.set('tenantId', tenantUUID);
    c.set('actorId', devAuth.actorId);
    return next();
  }

  return c.json(
    {
      error: 'Forbidden',
      message: 'This endpoint is only accessible from internal services.',
    },
    403
  );
});
