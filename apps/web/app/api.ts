import { createStartAPIHandler } from '@tanstack/react-start/api';
import { getEvent } from '@tanstack/react-start/server';
import { Hono } from 'hono';
import { assertEnvValid } from '../hono/config/env.js';
import {
  authMiddleware,
  createErrorHandler,
  createNotFoundHandler,
  dbMiddleware,
  enforceTenantIsolation,
  requireAuthMiddleware,
} from '../hono/middleware/index.js';
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

app.onError(createErrorHandler());
app.notFound(createNotFoundHandler());

app.use('*', dbMiddleware);
app.use('*', authMiddleware);

// Public API routes (no auth required)
app.route('/api/auth', authRoutes);

// All other API routes require authentication. enforceTenantIsolation runs as
// a structural chokepoint right after auth populates the tenant context, so
// tenant scoping is guaranteed for every authenticated /api route and is not
// left to per-handler memory (the gap that let the /shadow-stats leak slip in).
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health' || c.req.path.startsWith('/api/auth/')) {
    return next();
  }
  return requireAuthMiddleware(c, async () => {
    await enforceTenantIsolation(c, next);
  });
});

app.route('/api', apiRoutes);

export default createStartAPIHandler(({ request }) => {
  const event = getEvent();
  const runtimeEnv = (event?.context as Record<string, unknown>) ?? {};
  return app.fetch(request, runtimeEnv);
});
