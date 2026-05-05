/**
 * Auth Routes - Signup & Login with passwords
 */

import { sessions, users } from '@dns-ops/db/schema';
import { verify } from '@node-rs/argon2';
import { and, eq, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env } from '../types.js';

const authRoutes = new Hono<Env>();

// Session expiry: 7 days
const SESSION_EXPIRY_DAYS = 7;
const SESSION_EXPIRY_MS = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

type AuthUser = {
  email: string;
  passwordHash: string;
  tenantId: string;
};

type AuthSession = {
  userEmail: string;
};

type AuthDrizzle = {
  query: {
    users: { findFirst(args: unknown): Promise<AuthUser | null> };
    sessions: { findFirst(args: unknown): Promise<AuthSession | null> };
  };
  insert(table: unknown): { values(data: unknown): Promise<unknown> };
  delete(table: unknown): { where(condition: unknown): Promise<unknown> };
};

function getAuthDrizzle(db: NonNullable<Env['Variables']['db']>): AuthDrizzle {
  return db.getDrizzle() as unknown as AuthDrizzle;
}

/**
 * Generate a secure session token
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parse cookies from header
 */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [key, ...vals] = part.trim().split('=');
    if (key) result[key] = vals.join('=');
  }
  return result;
}

/**
 * POST /api/auth/signup
 * Registration is disabled for this internal deployment.
 */
authRoutes.post('/signup', (c) => {
  return c.json({ error: 'Registration is disabled.' }, 403);
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
authRoutes.post('/login', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  // Find user
  const drizzle = getAuthDrizzle(db);
  const user = await drizzle.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Verify password
  const validPassword = await verify(user.passwordHash, password);
  if (!validPassword) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Create session in database
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  await drizzle.insert(sessions).values({
    token,
    userEmail: user.email,
    tenantId: user.tenantId,
    expiresAt,
  });

  // Set session cookie
  c.header(
    'Set-Cookie',
    `dns_ops_session=${token}; Path=/; Max-Age=${SESSION_EXPIRY_DAYS * 24 * 60 * 60}; HttpOnly; SameSite=Lax`
  );

  return c.json({ success: true, email: user.email, tenant: email.split('@')[1] });
});

/**
 * POST /api/auth/logout
 */
authRoutes.post('/logout', async (c) => {
  const db = c.get('db');
  const cookies = parseCookies(c.req.header('Cookie'));
  const token = cookies.dns_ops_session;

  if (token && db) {
    // Delete session from database
    await getAuthDrizzle(db).delete(sessions).where(eq(sessions.token, token));
  }

  c.header('Set-Cookie', 'dns_ops_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  return c.json({ success: true });
});

/**
 * GET /api/auth/me
 * Get current user info. Checks auth context (CF Access, API key, dev bypass)
 * then falls back to database session cookie.
 */
authRoutes.get('/me', async (c) => {
  // Check auth context set by authMiddleware (CF Access, API key, dev bypass)
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const actorEmail = c.get('actorEmail');

  if (tenantId && actorId) {
    return c.json({
      authenticated: true,
      email: actorEmail || `${actorId}@dns-ops.local`,
      tenant: tenantId,
    });
  }

  const db = c.get('db');
  if (!db) {
    return c.json({ authenticated: false }, 401);
  }

  const cookies = parseCookies(c.req.header('Cookie'));
  const token = cookies.dns_ops_session;

  if (!token) {
    return c.json({ authenticated: false }, 401);
  }

  // Find valid session in database
  const session = await getAuthDrizzle(db).query.sessions.findFirst({
    where: and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())),
  });

  if (!session) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({
    authenticated: true,
    email: session.userEmail,
    tenant: session.userEmail.split('@')[1],
  });
});

export default authRoutes;
