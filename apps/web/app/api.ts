import { createStartAPIHandler } from '@tanstack/react-start/api';
import { getEvent } from '@tanstack/react-start/server';
import { Hono } from 'hono';
import { assertEnvValid } from '../hono/config/env.js';
import { authMiddleware, dbMiddleware, requireAuthMiddleware } from '../hono/middleware/index.js';
import { apiRoutes } from '../hono/routes/api.js';
import authRoutes from '../hono/routes/signup.js';
import type { Env } from '../hono/types.js';

if (typeof process !== 'undefined' && process.env) {
  try {
    assertEnvValid();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      throw error;
    }
    console.warn('[ENV] Skipping env validation in production runtime');
  }
}

const app = new Hono<Env>();

app.use('*', dbMiddleware);
app.use('*', authMiddleware);

// Public API routes (no auth required)
app.route('/api/auth', authRoutes);

// All other API routes require authentication
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health' || c.req.path.startsWith('/api/auth/')) {
    return next();
  }
  return requireAuthMiddleware(c, next);
});

app.route('/api', apiRoutes);

export default createStartAPIHandler(({ request }) => {
  const event = getEvent();
  const runtimeEnv = (event?.context as Record<string, unknown>) ?? {};
  return app.fetch(request, runtimeEnv);
});
