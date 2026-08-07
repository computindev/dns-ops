/**
 * DNS Ops Collector Worker
 *
 * Node.js service for DNS collection and mail probing.
 * Runs as a separate service from the web app for isolation.
 *
 * ## Job Queue Mode
 * Set WORKER_ENABLED=true to start BullMQ workers for async job processing.
 * Requires REDIS_URL for job queue connectivity.
 */

import { createLogger, createLoggingMiddleware } from '@dns-ops/logging';
import { serve } from '@hono/node-server';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { assertEnvValid, getEnvConfig } from './config/env.js';
import { collectDomainRoutes } from './jobs/collect-domain.js';
import { collectMailRoutes } from './jobs/collect-mail.js';
import { fleetReportRoutes } from './jobs/fleet-report.js';
import { monitoringRoutes } from './jobs/monitoring.js';
import { probeRoutes } from './jobs/probe-routes.js';
import { closeQueues, getQueueHealth } from './jobs/queue.js';
import { cleanupSchedules, initializeSchedules } from './jobs/scheduler.js';
import { startWorkers, stopWorkers, workersRunning } from './jobs/worker.js';
import { checkDatabaseReady, dbMiddleware } from './middleware/db.js';
import { requireServiceAuthMiddleware } from './middleware/index.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { notificationRoutes } from './notifications/routes.js';
import type { Env } from './types.js';

// Create logger before middleware that uses it
const collectorLogger = createLogger({
  service: 'dns-ops-collector',
  version: '1.0.0',
  minLevel: 'info',
});

/** Bound queue/redis readiness so a hung Redis client cannot stall the probe forever. */
const QUEUE_HEALTH_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

const app = new Hono<Env>();

app.use('*', cors() as unknown as MiddlewareHandler);
app.use(
  '*',
  createLoggingMiddleware({
    logger: collectorLogger,
    skipPaths: ['/health', '/healthz', '/readyz', '/api/health'],
  }) as unknown as MiddlewareHandler
);

// Liveness: process-only. Never probe dependencies here.
app.get('/healthz', (c) => {
  return c.json({
    status: 'ok',
    service: 'dns-ops-collector',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'dns-ops-collector',
    timestamp: new Date().toISOString(),
  });
});

// Shared health endpoint for unified railway.toml healthcheckPath (liveness-style).
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'dns-ops-collector',
    timestamp: new Date().toISOString(),
  });
});

app.get('/readyz', async (c) => {
  const checks: Record<string, { status: 'ok' | 'error'; message?: string }> = {};
  let allHealthy = true;

  // Real dependency proof — SELECT 1, not adapter construction.
  const dbCheck = await checkDatabaseReady();
  if (dbCheck.ok) {
    checks.database = { status: 'ok' };
  } else {
    checks.database = { status: 'error', message: dbCheck.message };
    allHealthy = false;
  }

  if (process.env.WORKER_ENABLED === 'true') {
    // Queue/redis failures must surface as 503 (not_ready), never as an uncaught 500.
    try {
      const queueHealth = await withTimeout(
        getQueueHealth(),
        QUEUE_HEALTH_TIMEOUT_MS,
        'Queue health check'
      );

      checks.queues = queueHealth.available
        ? { status: 'ok' }
        : { status: 'error', message: 'Queue connection unavailable' };
      if (!queueHealth.available) {
        allHealthy = false;
      }
    } catch (error) {
      checks.queues = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Queue check failed',
      };
      allHealthy = false;
    }

    checks.workers = workersRunning()
      ? { status: 'ok' }
      : { status: 'error', message: 'Workers not running' };
    if (!workersRunning()) {
      allHealthy = false;
    }
  }

  return c.json(
    {
      status: allHealthy ? 'ready' : 'not_ready',
      service: 'dns-ops-collector',
      timestamp: new Date().toISOString(),
      checks,
    },
    allHealthy ? 200 : 503
  );
});

app.use('/api/*', dbMiddleware);
app.use('/api/*', requireServiceAuthMiddleware);

app.use('/api/collect/*', rateLimitMiddleware('collect'));
app.use('/api/probe/*', rateLimitMiddleware('probes'));
app.use('/api/notify/*', rateLimitMiddleware('collect'));

app.route('/api/collect', collectDomainRoutes);
app.route('/api/collect', collectMailRoutes);
app.route('/api/probe', probeRoutes);
app.route('/api/fleet-report', fleetReportRoutes);
app.route('/api/monitoring', monitoringRoutes);
app.route('/api/notify', notificationRoutes);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

app.onError((err, c) => {
  // Try to get request-scoped logger from context, fall back to collector logger
  const requestLogger = c.get('logger') || collectorLogger;
  const requestId = c.get('requestId') || c.req.header('X-Request-ID');

  requestLogger.error('Collector error', err, {
    requestId,
    path: c.req.path,
    method: c.req.method,
  });
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
      requestId,
    },
    500
  );
});

export default app;

/**
 * Boot the HTTP server and optional workers.
 * Skipped under Vitest so readiness tests can import the app without binding a port.
 */
function bootstrap(): void {
  assertEnvValid();

  const { port } = getEnvConfig();

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    async (info) => {
      collectorLogger.info('DNS Ops Collector started', {
        port: info.port,
        livenessUrl: `http://localhost:${info.port}/healthz`,
        readinessUrl: `http://localhost:${info.port}/readyz`,
      });

      if (process.env.WORKER_ENABLED === 'true') {
        collectorLogger.info('Starting job queue workers...');
        await startWorkers();

        collectorLogger.info('Initializing monitoring schedules...');
        await initializeSchedules();
      }
    }
  );

  async function shutdown(signal: string): Promise<void> {
    collectorLogger.info('Received shutdown signal', { signal });

    if (workersRunning()) {
      collectorLogger.info('Cleaning up schedules...');
      await cleanupSchedules();

      collectorLogger.info('Stopping workers...');
      await stopWorkers();
    }

    collectorLogger.info('Closing queue connections...');
    await closeQueues();

    collectorLogger.info('Closing HTTP server...');
    server.close();

    collectorLogger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

const shouldBootstrap =
  process.env.VITEST !== 'true' && process.env.COLLECTOR_SKIP_LISTEN !== 'true';

if (shouldBootstrap) {
  bootstrap();
}
