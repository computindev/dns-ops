import {
  DomainRepository,
  type IDatabaseAdapter,
  ObservationRepository,
  RecordSetRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { domains } from '@dns-ops/db/schema';
import { Hono } from 'hono';
import { collectorCircuit, proxyToCollector } from '../lib/collector-proxy.js';
import {
  requireAdminAccess,
  requireAuth,
  requireWritePermission,
} from '../middleware/authorization.js';
import { getWebLogger } from '../middleware/error-tracking.js';
import {
  domainName,
  enumValue,
  validateBody,
  validationErrorResponse,
} from '../middleware/validation.js';
import type { Env } from '../types.js';
import { alertRoutes } from './alerts.js';
import { delegationRoutes } from './delegation.js';
import { findingsRoutes } from './findings.js';
import { fleetReportRoutes } from './fleet-report.js';
import { legacyToolsRoutes } from './legacy-tools.js';
import { mailRoutes } from './mail.js';
import migrateRoutes from './migrate.js';
import { monitoringRoutes } from './monitoring.js';
import { portfolioRoutes } from './portfolio.js';
import { providerTemplateRoutes } from './provider-templates.js';
import { rulesetVersionRoutes } from './ruleset-versions.js';
import { selectorRoutes } from './selectors.js';
import { shadowComparisonRoutes } from './shadow-comparison.js';
import { simulationRoutes } from './simulation.js';
import { snapshotRoutes } from './snapshots.js';
import { suggestionsRoutes } from './suggestions.js';

// Track process start time for uptime calculation
const processStartTime = Date.now();

export const apiRoutes = new Hono<Env>();

async function resolveAccessibleSnapshot(
  db: IDatabaseAdapter,
  snapshotId: string,
  tenantId?: string
) {
  const snapshotRepo = new SnapshotRepository(db);
  const domainRepo = new DomainRepository(db);

  const snapshot = await snapshotRepo.findById(snapshotId);
  if (!snapshot) {
    return null;
  }

  const domain = await domainRepo.findById(snapshot.domainId);
  if (!domain) {
    return null;
  }

  if (domain.tenantId && domain.tenantId !== tenantId) {
    return null;
  }

  if (!tenantId && domain.tenantId) {
    return null;
  }

  return { snapshot, domain };
}

apiRoutes.get('/health', (c) => {
  const db = c.get('db');
  const hasDbConnection = !!db;

  return c.json(
    {
      status: hasDbConnection ? 'healthy' : 'degraded',
      service: 'dns-ops-web',
      timestamp: new Date().toISOString(),
      ...(hasDbConnection
        ? {}
        : {
            warning: 'Database connection not available - API functionality limited',
          }),
    },
    hasDbConnection ? 200 : 503
  );
});

// Detailed health check with admin access (PR-10.3)
apiRoutes.get('/health/detailed', requireAdminAccess, async (c) => {
  const db = c.get('db');

  // Check DB connectivity
  let dbStatus: 'connected' | 'error' = 'error';
  let dbLatencyMs: number | null = null;
  if (db) {
    try {
      const dbStart = Date.now();
      // Use select with no results - just verify connection works
      await db.select(domains);
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = 'connected';
    } catch (error) {
      const logger = getWebLogger();
      logger.error(
        'DB health check failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          path: '/api/health/detailed',
          method: 'GET',
        }
      );
      dbStatus = 'error';
    }
  }

  // Get circuit breaker state
  const circuitInfo = collectorCircuit.getInfo();

  // Calculate uptime
  const uptimeMs = Date.now() - processStartTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const uptimeFormatted =
    uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`
      : uptimeMinutes > 0
        ? `${uptimeMinutes}m ${uptimeSeconds % 60}s`
        : `${uptimeSeconds}s`;

  return c.json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    service: 'dns-ops-web',
    version: process.env.npm_package_version || '1.0.0',
    uptime: {
      startedAt: new Date(processStartTime).toISOString(),
      seconds: uptimeSeconds,
      formatted: uptimeFormatted,
    },
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      circuitBreaker: {
        state: circuitInfo.state,
        consecutiveFailures: circuitInfo.consecutiveFailures,
        lastFailureAt: circuitInfo.lastFailureAt
          ? new Date(circuitInfo.lastFailureAt).toISOString()
          : null,
      },
    },
  });
});

apiRoutes.route('/', findingsRoutes);
apiRoutes.route('/', legacyToolsRoutes);
apiRoutes.route('/', selectorRoutes);
apiRoutes.route('/', delegationRoutes);
apiRoutes.route('/', mailRoutes);
apiRoutes.route('/shadow-comparison', shadowComparisonRoutes);
apiRoutes.route('/mail', providerTemplateRoutes);
apiRoutes.route('/snapshots', snapshotRoutes);
apiRoutes.use('/migrate/*', requireAdminAccess);
apiRoutes.route('/migrate', migrateRoutes);
apiRoutes.route('/portfolio', portfolioRoutes);
apiRoutes.route('/ruleset-versions', rulesetVersionRoutes);
apiRoutes.route('/monitoring', monitoringRoutes);
apiRoutes.route('/alerts', alertRoutes);
apiRoutes.route('/fleet-report', fleetReportRoutes);
apiRoutes.route('/simulate', simulationRoutes);
apiRoutes.route('/suggestions', suggestionsRoutes);

// Domain read — tenant-scoped via resolveAccessibleSnapshot
apiRoutes.get('/domain/:domain/latest', async (c) => {
  const tenantId = c.get('tenantId');
  const db = c.get('db');

  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  const domainName = c.req.param('domain').toLowerCase();
  const domainRepo = new DomainRepository(db);
  const snapshotRepo = new SnapshotRepository(db);

  try {
    const domain = await domainRepo.findByName(domainName);
    if (!domain) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    if (domain.tenantId && domain.tenantId !== tenantId) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    if (!tenantId && domain.tenantId) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    const snapshot = await snapshotRepo.findLatestByDomain(domain.id);
    if (!snapshot) {
      return c.json({ error: 'No snapshots found' }, 404);
    }

    return c.json(snapshot);
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching latest snapshot',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshot/:domain/latest',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json({ error: 'Internal server error' }, 500);
  }
});

apiRoutes.get('/snapshot/:snapshotId/observations', async (c) => {
  const tenantId = c.get('tenantId');
  const db = c.get('db');
  const snapshotId = c.req.param('snapshotId');

  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  try {
    const accessibleSnapshot = await resolveAccessibleSnapshot(db, snapshotId, tenantId);
    if (!accessibleSnapshot) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    const observationRepo = new ObservationRepository(db);
    const observations = await observationRepo.findBySnapshotId(accessibleSnapshot.snapshot.id);
    return c.json(observations);
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching observations',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshot/:snapshotId/observations',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json({ error: 'Internal server error' }, 500);
  }
});

apiRoutes.get('/snapshot/:snapshotId/recordsets', async (c) => {
  const tenantId = c.get('tenantId');
  const db = c.get('db');
  const snapshotId = c.req.param('snapshotId');

  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  try {
    const accessibleSnapshot = await resolveAccessibleSnapshot(db, snapshotId, tenantId);
    if (!accessibleSnapshot) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    const recordSetRepo = new RecordSetRepository(db);
    const recordSets = await recordSetRepo.findBySnapshotId(accessibleSnapshot.snapshot.id);
    return c.json(recordSets);
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching record sets',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshot/:snapshotId/recordsets',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json({ error: 'Internal server error' }, 500);
  }
});

apiRoutes.post('/collect/domain', requireAuth, requireWritePermission, async (c) => {
  const validation = await validateBody(c, {
    domain: domainName('domain'),
    zoneManagement: enumValue(
      'zoneManagement',
      ['managed', 'unmanaged', 'unknown'] as const,
      false
    ),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const { domain, zoneManagement = 'unmanaged' } = validation.data;
  const actorId = c.get('actorId');

  const result = await proxyToCollector(c, {
    path: '/api/collect/domain',
    method: 'POST',
    body: JSON.stringify({
      domain,
      zoneManagement,
      triggeredBy: actorId,
    }),
  });

  if (result instanceof Response) return result;
  return c.json(result.json);
});
