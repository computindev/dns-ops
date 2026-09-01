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
import { dbMiddleware, getSharedDbAdapter } from './middleware/db.js';
import { requireServiceAuthMiddleware } from './middleware/index.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { notificationRoutes } from './notifications/routes.js';
assertEnvValid();
// Create logger before middleware that uses it
const collectorLogger = createLogger({
    service: 'dns-ops-collector',
    version: '1.0.0',
    minLevel: 'info',
});
const app = new Hono();
app.use('*', cors());
app.use('*', createLoggingMiddleware({
    logger: collectorLogger,
    skipPaths: ['/health', '/healthz', '/readyz', '/api/health'],
}));
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
// Shared health endpoint for unified railway.toml healthcheckPath
app.get('/api/health', (c) => {
    return c.json({
        status: 'ok',
        service: 'dns-ops-collector',
        timestamp: new Date().toISOString(),
    });
});
app.get('/readyz', async (c) => {
    const checks = {};
    let allHealthy = true;
    try {
        getSharedDbAdapter();
        checks.database = { status: 'ok' };
    }
    catch (error) {
        checks.database = {
            status: 'error',
            message: error instanceof Error ? error.message : 'DB not initialized',
        };
        allHealthy = false;
    }
    if (process.env.WORKER_ENABLED === 'true') {
        const queueHealth = await getQueueHealth();
        checks.queues = queueHealth.available
            ? { status: 'ok' }
            : { status: 'error', message: 'Queue connection unavailable' };
        if (!queueHealth.available) {
            allHealthy = false;
        }
        checks.workers = workersRunning()
            ? { status: 'ok' }
            : { status: 'error', message: 'Workers not running' };
        if (!workersRunning()) {
            allHealthy = false;
        }
    }
    return c.json({
        status: allHealthy ? 'ready' : 'not_ready',
        service: 'dns-ops-collector',
        timestamp: new Date().toISOString(),
        checks,
    }, allHealthy ? 200 : 503);
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
    return c.json({
        error: 'Internal Server Error',
        message: err.message,
        requestId,
    }, 500);
});
const { port } = getEnvConfig();
const server = serve({
    fetch: app.fetch,
    port,
}, async (info) => {
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
});
async function shutdown(signal) {
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
export default app;
//# sourceMappingURL=index.js.map