import { createStartAPIHandler } from '@tanstack/react-start/api';
import { getEvent } from '@tanstack/react-start/server';
import { Hono } from 'hono';
import { assertEnvValid } from '../hono/config/env.js';
import {
  authMiddleware,
  createErrorHandler,
  createNotFoundHandler,
  dbMiddleware,
  requireAuthMiddleware,
} from '../hono/middleware/index.js';
import { apiRoutes } from '../hono/routes/api.js';
import authRoutes from '../hono/routes/signup.js';
import type { Env } from '../hono/types.js';

if (typeof process !== 'undefined' && process.env) {
  // A misconfigured environment must crash the runtime on boot in every
  // environment, so production never serves traffic with invalid config
  // (previously this soft-skipped in production — exactly backwards).
  //
  // This guard runs only at server runtime: the bundler does not execute
  // module-level side effects during `bun run build`, and no test imports
  // this module, so there is no build-time or test-mode soft-skip to preserve.
  assertEnvValid();
}

const app = new Hono<Env>();

app.onError(createErrorHandler());
app.notFound(createNotFoundHandler());

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
