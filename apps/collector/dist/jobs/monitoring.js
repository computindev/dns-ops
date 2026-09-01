/**
 * Monitoring Routes - Bead 15
 *
 * Scheduled refresh jobs and alerting for monitored domains.
 */
import { AlertRepository, DomainRepository, MonitoredDomainRepository } from '@dns-ops/db';
import { createLogger } from '@dns-ops/logging';
import { Hono } from 'hono';
import { internalOnlyMiddleware, requireServiceAuthMiddleware } from '../middleware/auth.js';
import { sendAlertNotification } from '../notifications/webhook.js';
const monitoringLogger = createLogger({
    service: 'dns-ops-collector',
    version: '1.0.0',
    minLevel: 'info',
});
export const monitoringRoutes = new Hono();
/**
 * POST /api/monitoring/check
 * Run checks for monitored domains
 */
monitoringRoutes.post('/check', internalOnlyMiddleware, async (c) => {
    const db = c.get('db');
    if (!db) {
        return c.json({ error: 'Database not available' }, 503);
    }
    const body = await c.req.json().catch(() => ({}));
    const { schedule = 'daily' } = body;
    try {
        const monitoredRepo = new MonitoredDomainRepository(db);
        const domainRepo = new DomainRepository(db);
        const tenantId = c.get('tenantId');
        // Get domains scheduled for this check, scoped to this tenant
        const monitoredDomains = await monitoredRepo.findActiveBySchedule(schedule, tenantId);
        const results = [];
        for (const monitored of monitoredDomains) {
            // Check if within suppression window
            if (monitored.lastAlertAt) {
                const suppressionEnd = new Date(monitored.lastAlertAt.getTime() + monitored.suppressionWindowMinutes * 60 * 1000);
                if (suppressionEnd > new Date()) {
                    continue; // Still in suppression window
                }
            }
            // Check daily alert limit
            const alertRepo = new AlertRepository(db);
            const allAlerts = await alertRepo.findByMonitoredDomain(monitored.id);
            const todayCount = allAlerts.filter((a) => {
                const alertDate = new Date(a.createdAt);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return alertDate >= today;
            }).length;
            if (todayCount >= monitored.maxAlertsPerDay) {
                continue; // Hit daily limit
            }
            // Look up domain name
            const domain = await domainRepo.findById(monitored.domainId);
            if (!domain) {
                monitoringLogger.error(`Domain not found for monitored domain: ${monitored.domainId}`);
                continue;
            }
            // Trigger collection via collector service
            const collectorUrl = process.env.COLLECTOR_URL || 'http://localhost:3001';
            const response = await fetch(`${collectorUrl}/api/collect/domain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: domain.name,
                    triggeredBy: 'monitoring-scheduler',
                }),
            });
            if (!response.ok) {
                if (!monitored.tenantId) {
                    monitoringLogger.error(`Monitored domain missing tenant ownership: ${monitored.id}`);
                    continue; // Skip domain without tenant - cannot create alerts without tenant ownership
                }
                // Create alert for collection failure
                const alert = await alertRepo.create({
                    monitoredDomainId: monitored.id,
                    title: 'Collection Failed',
                    description: `Failed to collect DNS data: ${await response.text()}`,
                    severity: 'high',
                    status: 'pending',
                    dedupKey: `collection-fail-${monitored.domainId}`,
                    tenantId: monitored.tenantId,
                });
                // ONE notification path: Use unified sendAlertNotification
                // This ensures: SSRF guard, status tracking, proper logging
                const webhookUrl = monitored.alertChannels?.webhook;
                if (webhookUrl && alert) {
                    // Fire and forget - but with proper status tracking
                    sendAlertNotification(alert.id, webhookUrl, {
                        id: alert.id,
                        title: alert.title,
                        description: alert.description,
                        severity: alert.severity,
                        domain: domain.name,
                        tenantId: alert.tenantId,
                    }, db, process.env.WEB_APP_URL).catch((err) => {
                        monitoringLogger.error('Alert notification error', err instanceof Error ? err : new Error(String(err)), { alertId: alert.id });
                    });
                }
            }
            await monitoredRepo.updateLastCheck(monitored.id);
            results.push({ domainId: monitored.domainId, checked: true });
        }
        return c.json({
            schedule,
            domainsChecked: results.length,
            results,
        });
    }
    catch (error) {
        monitoringLogger.error('Monitoring check error', error instanceof Error ? error : new Error(String(error)));
        return c.json({ error: 'Monitoring check failed' }, 500);
    }
});
/**
 * GET /api/monitoring/alerts/pending
 * Get pending alerts for processing
 */
monitoringRoutes.get('/alerts/pending', internalOnlyMiddleware, async (c) => {
    const db = c.get('db');
    if (!db) {
        return c.json({ error: 'Database not available' }, 503);
    }
    const tenantId = c.get('tenantId');
    try {
        const alertRepo = new AlertRepository(db);
        const alerts = await alertRepo.findPending(tenantId);
        return c.json({ alerts, count: alerts.length });
    }
    catch (_error) {
        return c.json({ error: 'Failed to fetch alerts' }, 500);
    }
});
/**
 * POST /api/monitoring/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
monitoringRoutes.post('/alerts/:alertId/acknowledge', internalOnlyMiddleware, async (c) => {
    const db = c.get('db');
    if (!db) {
        return c.json({ error: 'Database not available' }, 503);
    }
    const alertId = c.req.param('alertId');
    const actorId = c.get('actorId');
    const tenantId = c.get('tenantId');
    if (!actorId || !tenantId) {
        return c.json({ error: 'Tenant and actor context required' }, 401);
    }
    try {
        const alertRepo = new AlertRepository(db);
        const alert = await alertRepo.acknowledge(alertId, tenantId, actorId);
        return c.json({ alert });
    }
    catch (_error) {
        return c.json({ error: 'Failed to acknowledge alert' }, 500);
    }
});
/**
 * POST /api/monitoring/alerts/:alertId/resolve
 * Resolve an alert
 */
monitoringRoutes.post('/alerts/:alertId/resolve', internalOnlyMiddleware, async (c) => {
    const db = c.get('db');
    if (!db) {
        return c.json({ error: 'Database not available' }, 503);
    }
    const alertId = c.req.param('alertId');
    const tenantId = c.get('tenantId');
    const body = await c.req.json().catch(() => ({}));
    const { resolutionNote } = body;
    if (!tenantId) {
        return c.json({ error: 'Tenant context required' }, 401);
    }
    try {
        const alertRepo = new AlertRepository(db);
        const alert = await alertRepo.resolve(alertId, tenantId, resolutionNote);
        return c.json({ alert });
    }
    catch (_error) {
        return c.json({ error: 'Failed to resolve alert' }, 500);
    }
});
/**
 * GET /api/monitoring/reports/shared
 * Get shared read-only reports
 */
monitoringRoutes.get('/reports/shared', requireServiceAuthMiddleware, async (c) => {
    const db = c.get('db');
    if (!db) {
        return c.json({ error: 'Database not available' }, 503);
    }
    const tenantId = c.get('tenantId');
    try {
        const monitoredRepo = new MonitoredDomainRepository(db);
        const alertRepo = new AlertRepository(db);
        // Get summary stats
        const monitored = await monitoredRepo.findByTenant(tenantId);
        const activeAlerts = await alertRepo.findPending(tenantId);
        // Aggregate by severity
        const bySeverity = {
            critical: activeAlerts.filter((a) => a.severity === 'critical').length,
            high: activeAlerts.filter((a) => a.severity === 'high').length,
            medium: activeAlerts.filter((a) => a.severity === 'medium').length,
            low: activeAlerts.filter((a) => a.severity === 'low').length,
        };
        return c.json({
            summary: {
                totalMonitored: monitored.length,
                activeAlerts: activeAlerts.length,
                bySeverity,
            },
            // Note: Domain names and internal notes redacted for shared view
            alertSummary: activeAlerts.slice(0, 10).map((a) => ({
                id: a.id,
                title: a.title,
                severity: a.severity,
                status: a.status,
                createdAt: a.createdAt,
            })),
        });
    }
    catch (_error) {
        return c.json({ error: 'Failed to generate report' }, 500);
    }
});
/**
 * POST /api/monitoring/domains/:domainId/monitor
 * Start monitoring a domain
 */
monitoringRoutes.post('/domains/:domainId/monitor', internalOnlyMiddleware, async (c) => {
    const db = c.get('db');
    if (!db) {
        return c.json({ error: 'Database not available' }, 503);
    }
    const domainId = c.req.param('domainId');
    const tenantId = c.get('tenantId');
    const actorId = c.get('actorId');
    const body = await c.req.json().catch(() => ({}));
    const { schedule = 'daily', alertChannels, maxAlertsPerDay = 5, suppressionWindowMinutes = 60, } = body;
    if (!tenantId || !actorId) {
        return c.json({ error: 'Tenant and actor context required' }, 401);
    }
    try {
        const monitoredRepo = new MonitoredDomainRepository(db);
        // Check if already monitored
        const existing = await monitoredRepo.findByDomainId(domainId);
        if (existing) {
            return c.json({ error: 'Domain is already monitored', monitored: existing }, 409);
        }
        const monitored = await monitoredRepo.create({
            domainId,
            schedule,
            alertChannels: alertChannels || {},
            maxAlertsPerDay,
            suppressionWindowMinutes,
            isActive: true,
            createdBy: actorId,
            tenantId,
        });
        return c.json({ monitored }, 201);
    }
    catch (error) {
        monitoringLogger.error('Failed to start monitoring', error instanceof Error ? error : new Error(String(error)));
        return c.json({ error: 'Failed to start monitoring' }, 500);
    }
});
/**
 * DELETE /api/monitoring/domains/:domainId/monitor
 * Stop monitoring a domain
 */
monitoringRoutes.delete('/domains/:domainId/monitor', internalOnlyMiddleware, async (c) => {
    const db = c.get('db');
    if (!db) {
        return c.json({ error: 'Database not available' }, 503);
    }
    const domainId = c.req.param('domainId');
    const tenantId = c.get('tenantId');
    if (!tenantId) {
        return c.json({ error: 'Tenant context required' }, 401);
    }
    try {
        const monitoredRepo = new MonitoredDomainRepository(db);
        const existing = await monitoredRepo.findByDomainId(domainId);
        if (!existing) {
            return c.json({ error: 'Domain is not monitored' }, 404);
        }
        // Tenant isolation: only the owning tenant can delete their monitored domain
        if (existing.tenantId !== tenantId) {
            return c.json({ error: 'Domain is not monitored' }, 404);
        }
        await monitoredRepo.delete(existing.id);
        return c.json({ success: true });
    }
    catch (_error) {
        return c.json({ error: 'Failed to stop monitoring' }, 500);
    }
});
/**
 * GET /api/monitoring/health
 * Monitoring service health check
 */
monitoringRoutes.get('/health', (c) => {
    return c.json({
        status: 'healthy',
        service: 'monitoring',
        timestamp: new Date().toISOString(),
    });
});
//# sourceMappingURL=monitoring.js.map