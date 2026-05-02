import { Hono } from 'hono';
import type { Env } from '../types.js';

const authRoutes = new Hono<Env>();

/**
 * POST /api/auth/login
 * Sets session cookie for internal authentication
 */
authRoutes.post('/login', async (c) => {
  const { email } = await c.req.json<{ email: string }>();

  if (!email) {
    return c.json({ error: 'Email is required' }, 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return c.json({ error: 'Invalid email format' }, 400);
  }

  // Extract domain as tenant identifier
  const domain = email.split('@')[1];
  if (!domain) {
    return c.json({ error: 'Invalid email' }, 400);
  }

  // Create session cookie value
  // Format: email:tenantDomain
  const sessionValue = `${email}:${domain}`;

  // Set cookie (7 day expiry)
  c.header(
    'Set-Cookie',
    `dns_ops_session=${encodeURIComponent(sessionValue)}; Path=/; Max-Age=${7 * 24 * 60 * 60}; HttpOnly; SameSite=Lax`
  );

  return c.json({
    success: true,
    email,
    tenant: domain,
  });
});

/**
 * POST /api/auth/logout
 * Clears session cookie
 */
authRoutes.post('/logout', async (c) => {
  c.header('Set-Cookie', 'dns_ops_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  return c.json({ success: true });
});

/**
 * GET /api/auth/me
 * Returns current session info
 */
authRoutes.get('/me', async (c) => {
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const actorEmail = c.get('actorEmail');

  if (!tenantId || !actorId) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({
    authenticated: true,
    email: actorEmail,
    tenant: actorId.split('@')[1] || actorId,
  });
});

export default authRoutes;
