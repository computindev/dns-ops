/**
 * Auth Routes - Signup & Login with passwords
 */

import { getTenantUUID } from '@dns-ops/contracts';
import { sessions, users } from '@dns-ops/db/schema';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env } from '../types.js';

const authRoutes = new Hono<Env>();

// Session expiry: 7 days
const SESSION_EXPIRY_DAYS = 7;
const SESSION_EXPIRY_MS = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

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
 * Create a new user account
 */
authRoutes.post('/signup', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return c.json({ error: 'Invalid email format' }, 400);
  }

  // Validate password strength
  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }

  // Check if user already exists
  const existingUser = await (db.getDrizzle() as any).query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (existingUser) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  // Hash password
  const passwordHash = await hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    outputLen: 32,
    parallelism: 4,
  });

  // Create user
  const tenantId = email.split('@')[1];
  const tenantUUID = await getTenantUUID(tenantId);

  await (db.getDrizzle() as any).insert(users).values({
    email: email.toLowerCase(),
    passwordHash,
    tenantId: tenantUUID,
    name: email.split('@')[0],
  });

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  await (db.getDrizzle() as any).insert(sessions).values({
    token,
    userEmail: email.toLowerCase(),
    tenantId: tenantUUID,
    expiresAt,
  });

  // Set session cookie
  c.header(
    'Set-Cookie',
    `dns_ops_session=${token}; Path=/; Max-Age=${SESSION_EXPIRY_DAYS * 24 * 60 * 60}; HttpOnly; SameSite=Lax`
  );

  return c.json({ success: true, email, tenant: tenantId });
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
  const user = await (db.getDrizzle() as any).query.users.findFirst({
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

  await (db.getDrizzle() as any).insert(sessions).values({
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
  const token = cookies['dns_ops_session'];

  if (token && db) {
    // Delete session from database
    await (db.getDrizzle() as any).delete(sessions).where(eq(sessions.token, token));
  }

  c.header('Set-Cookie', 'dns_ops_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  return c.json({ success: true });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
authRoutes.get('/me', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ authenticated: false }, 401);
  }

  const cookies = parseCookies(c.req.header('Cookie'));
  const token = cookies['dns_ops_session'];

  if (!token) {
    return c.json({ authenticated: false }, 401);
  }

  // Find valid session in database
  const session = await (db.getDrizzle() as any).query.sessions.findFirst({
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
