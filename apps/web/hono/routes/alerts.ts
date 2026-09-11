/**
 * Alert Routes - Bead 20: Alerts and shared reports
 */

import {
  type Alert,
  AlertRepository,
  AuditEventRepository,
  MonitoredDomainRepository,
  SharedReportRepository,
} from '@dns-ops/db';
import { Hono } from 'hono';
import { getFeedbackMetrics } from '../lib/metrics.js';
import { getRequestClientIp } from '../lib/request-context.js';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import { trackAlert, trackReport } from '../middleware/error-tracking.js';
import {
  enumValue,
  integer,
  optionalString,
  validateBody,
  validationErrorResponse,
} from '../middleware/validation.js';
import type { Env } from '../types.js';

const VALID_STATUSES: Alert['status'][] = [
  'pending',
  'sent',
  'suppressed',
  'acknowledged',
  'resolved',
];
const VALID_SEVERITIES: Alert['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
const REPORT_VISIBILITIES = ['private', 'tenant', 'shared'] as const;

function toPublicAlert(alert: Alert) {
  return {
    id: alert.id,
    monitoredDomainId: alert.monitoredDomainId,
    title: alert.title,
    description: alert.description,
    severity: alert.severity,
    triggeredByFindingId: alert.triggeredByFindingId,
    signalId: alert.signalId,
    status: alert.status,
    dedupKey: alert.dedupKey,
    acknowledgedAt: alert.acknowledgedAt,
    acknowledgedBy: alert.acknowledgedBy,
    resolvedAt: alert.resolvedAt,
    resolutionNote: alert.resolutionNote,
    tenantId: alert.tenantId,
    createdAt: alert.createdAt,
  };
}

export const alertRoutes = new Hono<Env>();

function requiresAuth(path: string): boolean {
  return !path.includes('/reports/shared/');
}

alertRoutes.use('*', async (c, next) => {
  const path = c.req.path;
  const needsAuth = requiresAuth(path);
  if (!needsAuth) {
    return next();
  }
  return requireAuth(c, next);
});

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function buildSharedReportPayload(db: Env['Variables']['db'], tenantId: string) {
  const monitoredRepo = new MonitoredDomainRepository(db);
  const alertRepo = new AlertRepository(db);

  const monitored = await monitoredRepo.findByTenant(tenantId);
  const activeAlerts = await alertRepo.findPending(tenantId);

  const bySeverity = {
    critical: activeAlerts.filter((alert) => alert.severity === 'critical').length,
    high: activeAlerts.filter((alert) => alert.severity === 'high').length,
    medium: activeAlerts.filter((alert) => alert.severity === 'medium').length,
    low: activeAlerts.filter((alert) => alert.severity === 'low').length,
  };

  return {
    summary: {
      totalMonitored: monitored.length,
      activeAlerts: activeAlerts.length,
      bySeverity,
    },
    alertSummary: activeAlerts.slice(0, 10).map((alert) => ({
      title: alert.title,
      severity: alert.severity,
      status: alert.status,
      createdAt: alert.createdAt,
    })),
    generatedAlertCount: activeAlerts.length,
  };
}

alertRoutes.get('/reports/shared/:token', async (c) => {
  const db = c.get('db');

  if (!db) {
    return c.json({ error: 'Database unavailable' }, 503);
  }

  const token = c.req.param('token');
  const reportRepo = new SharedReportRepository(db);

  // Fetch raw report by token to distinguish between not-found vs expired/revoked
  const report = await reportRepo.findByTokenRaw(token);

  if (!report) {
    return c.json({ error: 'Shared report not found' }, 404);
  }

  // Check status - expired or revoked reports return 410 Gone
  if (report.status === 'expired') {
    return c.json({ error: 'Shared report has expired' }, 410);
  }

  // Check if report has passed its expiry date
  if (report.expiresAt && new Date(report.expiresAt) <= new Date()) {
    return c.json({ error: 'Shared report has expired' }, 410);
  }

  // Only ready reports can be accessed
  if (report.status !== 'ready') {
    return c.json({ error: 'Shared report is not available' }, 410);
  }

  return c.json({
    report: {
      id: report.id,
      title: report.title,
      visibility: report.visibility,
      status: report.status,
      expiresAt: report.expiresAt,
      createdAt: report.createdAt,
      summary: report.summary,
      alertSummary: report.alertSummary,
    },
  });
});

alertRoutes.get('/reports', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  if (!db || !tenantId) {
    return c.json({ error: 'Database or tenant context unavailable' }, 503);
  }

  const reportRepo = new SharedReportRepository(db);
  const reports = await reportRepo.listByTenant(tenantId);
  return c.json({ reports });
});

alertRoutes.post('/reports', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  const validation = await validateBody(c, {
    title: optionalString('title', { minLength: 3, maxLength: 200 }),
    visibility: enumValue('visibility', REPORT_VISIBILITIES, false),
    expiresInDays: integer('expiresInDays', { min: 1, max: 365, required: false }),
  });

  if (!validation.success) {
    return validationErrorResponse(c, validation.error);
  }

  const payload = await buildSharedReportPayload(db, tenantId);
  const visibility = validation.data.visibility ?? 'shared';
  const title =
    validation.data.title ?? `Shared alert report ${new Date().toISOString().slice(0, 10)}`;
  const expiresAt = validation.data.expiresInDays
    ? new Date(Date.now() + validation.data.expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;
  const shareToken = visibility === 'shared' ? crypto.randomUUID().replaceAll('-', '') : undefined;

  const reportRepo = new SharedReportRepository(db);
  const auditRepo = new AuditEventRepository(db);
  const report = await reportRepo.create({
    tenantId,
    createdBy: actorId,
    title,
    visibility,
    status: 'ready',
    shareToken,
    expiresAt,
    summary: payload.summary,
    alertSummary: payload.alertSummary,
    metadata: {
      redacted: true,
      generatedAlertCount: payload.generatedAlertCount,
    },
  });

  await auditRepo.create({
    action: 'shared_report_created',
    entityType: 'shared_report',
    entityId: report.id,
    actorId,
    tenantId,
    newValue: {
      title: report.title,
      visibility: report.visibility,
      expiresAt: report.expiresAt,
    },
    ipAddress: getRequestClientIp(c),
    userAgent: c.req.header('user-agent'),
  });

  trackReport({
    tenantId,
    reportType: 'shared',
    reportId: report.id,
    action: visibility === 'shared' ? 'share' : 'generate',
  });

  return c.json(
    {
      report,
      shareUrl: shareToken ? `/api/alerts/reports/shared/${shareToken}` : undefined,
    },
    201
  );
});

alertRoutes.post('/reports/:id/expire', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const id = c.req.param('id');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  const reportRepo = new SharedReportRepository(db);
  const existing = await reportRepo.findById(id, tenantId);
  if (!existing) {
    return c.json({ error: 'Shared report not found' }, 404);
  }

  const report = await reportRepo.expire(id, tenantId);
  if (!report) {
    return c.json({ error: 'Shared report not found' }, 404);
  }

  const auditRepo = new AuditEventRepository(db);
  await auditRepo.create({
    action: 'shared_report_expired',
    entityType: 'shared_report',
    entityId: report.id,
    actorId,
    tenantId,
    previousValue: { status: existing.status },
    newValue: { status: report.status },
    ipAddress: getRequestClientIp(c),
    userAgent: c.req.header('user-agent'),
  });

  return c.json({ report });
});

alertRoutes.get('/', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  if (!db || !tenantId) {
    return c.json({ error: 'Database or tenant context unavailable' }, 503);
  }

  const statusQuery = c.req.query('status');
  const severityQuery = c.req.query('severity');
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 50), 100);
  const offset = parsePositiveInt(c.req.query('offset'), 0);

  if (statusQuery && !VALID_STATUSES.includes(statusQuery as Alert['status'])) {
    return c.json({ error: 'Invalid alert status filter' }, 400);
  }

  if (severityQuery && !VALID_SEVERITIES.includes(severityQuery as Alert['severity'])) {
    return c.json({ error: 'Invalid alert severity filter' }, 400);
  }

  const alertRepo = new AlertRepository(db);
  const { alerts, total } = await alertRepo.findAll(tenantId, {
    status: statusQuery as Alert['status'] | undefined,
    severity: severityQuery as Alert['severity'] | undefined,
    limit,
    offset,
  });

  return c.json({
    alerts: alerts.map(toPublicAlert),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + alerts.length < total,
    },
  });
});

alertRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const alertId = c.req.param('id');

  if (!db || !tenantId) {
    return c.json({ error: 'Database or tenant context unavailable' }, 503);
  }

  const alertRepo = new AlertRepository(db);
  const alert = await alertRepo.findById(alertId, tenantId);

  if (!alert) {
    return c.json({ error: 'Alert not found' }, 404);
  }

  return c.json({ alert: toPublicAlert(alert) });
});

alertRoutes.post('/:id/acknowledge', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const alertId = c.req.param('id');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  try {
    const alertRepo = new AlertRepository(db);
    const existing = await alertRepo.findById(alertId, tenantId);
    const alert = await alertRepo.acknowledge(alertId, tenantId, actorId);

    if (!alert || !existing) {
      return c.json({ error: 'Alert not found' }, 404);
    }

    const auditRepo = new AuditEventRepository(db);
    await auditRepo.create({
      action: 'alert_acknowledged',
      entityType: 'alert',
      entityId: alert.id,
      actorId,
      tenantId,
      previousValue: { status: existing.status },
      newValue: { status: alert.status, acknowledgedBy: alert.acknowledgedBy },
      ipAddress: getRequestClientIp(c),
      userAgent: c.req.header('user-agent'),
    });

    trackAlert({
      tenantId,
      alertId,
      alertType: alert.title,
      action: 'acknowledge',
      severity: alert.severity,
    });

    const timeToAckMs = existing.createdAt
      ? Date.now() - new Date(existing.createdAt).getTime()
      : 0;
    getFeedbackMetrics().alerts.acknowledged({ tenantId, alertId, timeToAckMs });

    return c.json({ alert: toPublicAlert(alert) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid alert transition')) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});

alertRoutes.post('/:id/resolve', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const alertId = c.req.param('id');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const rawNote = body.resolutionNote;
  const resolutionNote =
    typeof rawNote === 'string' ? rawNote.slice(0, 5000).trim() || undefined : undefined;

  try {
    const alertRepo = new AlertRepository(db);
    const existing = await alertRepo.findById(alertId, tenantId);
    const alert = await alertRepo.resolve(alertId, tenantId, resolutionNote);

    if (!alert || !existing) {
      return c.json({ error: 'Alert not found' }, 404);
    }

    const auditRepo = new AuditEventRepository(db);
    await auditRepo.create({
      action: 'alert_resolved',
      entityType: 'alert',
      entityId: alert.id,
      actorId,
      tenantId,
      previousValue: { status: existing.status },
      newValue: { status: alert.status, resolutionNote: alert.resolutionNote },
      ipAddress: getRequestClientIp(c),
      userAgent: c.req.header('user-agent'),
    });

    trackAlert({
      tenantId,
      alertId,
      alertType: alert.title,
      action: 'resolve',
      severity: alert.severity,
    });

    const timeToResolveMs = existing.createdAt
      ? Date.now() - new Date(existing.createdAt).getTime()
      : 0;
    getFeedbackMetrics().alerts.resolved({
      tenantId,
      alertId,
      timeToResolveMs,
      resolution: 'manual',
    });

    return c.json({ alert: toPublicAlert(alert) });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith('Invalid alert transition') ||
        error.message.includes('fresh conclusive evidence'))
    ) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});

alertRoutes.post('/:id/suppress', requireWritePermission, async (c) => {
  const db = c.get('db');
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const alertId = c.req.param('id');

  if (!db || !tenantId || !actorId) {
    return c.json({ error: 'Database, tenant, and actor context required' }, 503);
  }

  try {
    const alertRepo = new AlertRepository(db);
    const existing = await alertRepo.findById(alertId, tenantId);
    const alert = await alertRepo.updateStatus(alertId, tenantId, 'suppressed');

    if (!alert || !existing) {
      return c.json({ error: 'Alert not found' }, 404);
    }

    const auditRepo = new AuditEventRepository(db);
    await auditRepo.create({
      action: 'alert_suppressed',
      entityType: 'alert',
      entityId: alert.id,
      actorId,
      tenantId,
      previousValue: { status: existing.status },
      newValue: { status: alert.status },
      ipAddress: getRequestClientIp(c),
      userAgent: c.req.header('user-agent'),
    });

    trackAlert({
      tenantId,
      alertId,
      alertType: alert.title,
      action: 'dismiss',
      severity: alert.severity,
    });

    getFeedbackMetrics().alerts.suppressed({ tenantId, alertId });

    return c.json({ alert: toPublicAlert(alert) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid alert transition')) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});
