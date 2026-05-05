/**
 * Auth Middleware
 *
 * Authentication for internal use with cookie-based sessions.
 */

import { getTenantUUID } from '@dns-ops/contracts';
import { sessions } from '@dns-ops/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types.js';

function getRuntimeSecret(
  c: Context<Env>,
  name: 'INTERNAL_SECRET' | 'API_KEY_SECRET' | 'ADMIN_EMAILS'
): string | undefined {
  const bindingValue = c.env?.[name];
  return typeof bindingValue === 'string' && bindingValue.trim() ? bindingValue : process.env[name];
}

function isAdminEmail(c: Context<Env>, actorEmail: string): boolean {
  const adminEmails = getRuntimeSecret(c, 'ADMIN_EMAILS');
  if (!adminEmails) return false;

  const normalizedActorEmail = actorEmail.trim().toLowerCase();
  return adminEmails
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedActorEmail);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  const result: Record<string, string> = {};
  const parts = cookieHeader.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

function isValidIdentifier(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const simpleRegex = /^[a-zA-Z0-9_.-]{1,64}$/;
  return uuidRegex.test(id) || simpleRegex.test(id);
}

/**
 * Extract auth from database session (session token stored in database)
 */
async function extractDatabaseSession(
  c: Context<Env>
): Promise<{ tenantId: string; actorId: string; actorEmail?: string } | null> {
  const db = c.get('db');
  if (!db) return null;

  const cookies = parseCookies(c.req.header('Cookie'));
  const token = cookies.dns_ops_session;

  if (!token) return null;

  try {
    // Look up session in database
    const session = await db.getDrizzle().query.sessions.findFirst({
      where: and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())),
    });

    if (!session) return null;

    return {
      tenantId: session.tenantId,
      actorId: session.userEmail,
      actorEmail: session.userEmail,
    };
  } catch {
    return null;
  }
}

/**
 * Extract auth from Cloudflare Access headers
 */
function extractCloudflareAccess(
  c: Context<Env>
): { tenantId: string; actorId: string; actorEmail?: string } | null {
  const cfEmail = c.req.header('CF-Access-Authenticated-User-Email');
  const cfUserId = c.req.header('CF-Access-Authenticated-User-Id');

  if (!cfEmail || !cfUserId) return null;

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cfEmail)) return null;

  const domain = cfEmail.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  return {
    tenantId: domain,
    actorId: cfUserId,
    actorEmail: cfEmail,
  };
}

/**
 * Extract auth from API key header
 */
function extractApiKey(c: Context<Env>): { tenantId: string; actorId: string } | null {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) return null;

  const parts = apiKey.split(':');
  if (parts.length < 3) return null;

  const [tenantId, actorId, secret] = parts;
  const expectedSecret = getRuntimeSecret(c, 'API_KEY_SECRET');

  if (!expectedSecret || secret !== expectedSecret) return null;
  if (!tenantId || !actorId) return null;
  if (!isValidIdentifier(tenantId) || !isValidIdentifier(actorId)) return null;

  return { tenantId, actorId };
}

/**
 * Dev bypass for local development
 */
function extractDevBypass(c: Context<Env>): { tenantId: string; actorId: string } | null {
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') return null;

  const tenantId = c.req.header('X-Dev-Tenant');
  const actorId = c.req.header('X-Dev-Actor');

  if (!tenantId || !actorId) return null;
  if (!isValidIdentifier(tenantId) || !isValidIdentifier(actorId)) return null;

  return { tenantId, actorId };
}

/**
 * Auth middleware - populates auth context
 */
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  // Priority: database session > CF Access > API key > dev bypass
  let authContext = await extractDatabaseSession(c);

  if (!authContext) {
    authContext = extractCloudflareAccess(c) || extractApiKey(c) || extractDevBypass(c);
  }

  if (authContext) {
    // For database sessions, tenantId is already a UUID
    // For legacy/API/dev, we need to convert domain to UUID
    let tenantUUID: string;
    try {
      tenantUUID = isValidUUID(authContext.tenantId)
        ? authContext.tenantId
        : await getTenantUUID(authContext.tenantId);
    } catch {
      return c.json({ error: 'Unauthorized', message: 'Invalid tenant context.' }, 401);
    }

    c.set('tenantId', tenantUUID);
    c.set('actorId', authContext.actorId);
    if (authContext.actorEmail) {
      c.set('actorEmail', authContext.actorEmail);
    }
  }

  return next();
});

/**
 * Require auth middleware - rejects requests without authentication
 */
export const requireAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  // Priority: database session > CF Access > API key > dev bypass
  let authContext = await extractDatabaseSession(c);

  if (!authContext) {
    authContext = extractCloudflareAccess(c) || extractApiKey(c) || extractDevBypass(c);
  }

  if (!authContext) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required.' }, 401);
  }

  let tenantUUID: string;
  try {
    tenantUUID = isValidUUID(authContext.tenantId)
      ? authContext.tenantId
      : await getTenantUUID(authContext.tenantId);
  } catch {
    return c.json({ error: 'Unauthorized', message: 'Invalid tenant context.' }, 401);
  }

  c.set('tenantId', tenantUUID);
  c.set('actorId', authContext.actorId);
  if (authContext.actorEmail) {
    c.set('actorEmail', authContext.actorEmail);
  }

  return next();
});

/**
 * Internal only middleware
 */
export const internalOnlyMiddleware = createMiddleware<Env>(async (c, next) => {
  const internalSecret = c.req.header('X-Internal-Secret');
  const expectedSecret = getRuntimeSecret(c, 'INTERNAL_SECRET');

  if (expectedSecret && internalSecret === expectedSecret) {
    const systemTenantUUID = await getTenantUUID('system');
    c.set('tenantId', systemTenantUUID);
    c.set('actorId', 'internal-service');
    await next();
    return;
  }

  // Allow explicitly allowlisted Cloudflare Access users as an alternative for internal routes.
  const cfEmail = c.req.header('CF-Access-Authenticated-User-Email');
  const cfUserId = c.req.header('CF-Access-Authenticated-User-Id');

  if (cfEmail && cfUserId) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(cfEmail) && isAdminEmail(c, cfEmail)) {
      const domain = cfEmail.split('@')[1];
      if (domain) {
        const tenantUUID = await getTenantUUID(domain);
        c.set('tenantId', tenantUUID);
        c.set('actorId', cfUserId);
        c.set('actorEmail', cfEmail);
        await next();
        return;
      }
    }
  }

  return c.json({ error: 'Forbidden', message: 'Internal access only.' }, 403);
});

function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
