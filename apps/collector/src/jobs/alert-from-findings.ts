/**
 * Alert Generation from Findings - JOB-002
 *
 * Generates alerts when high-severity findings are detected.
 * Runs after collection completes and findings are generated.
 */

import { AlertRepository, FindingRepository, MonitoredDomainRepository } from '@dns-ops/db';
import { createLogger } from '@dns-ops/logging';
import { sendAlertNotification } from '../notifications/webhook.js';
import type { Env } from '../types.js';
import { legacyConditionDisposition } from './condition-registry.js';

const logger = createLogger({
  service: 'dns-ops-collector',
  version: '1.0.0',
  minLevel: 'info',
});

/**
 * Configuration for alert generation from findings
 */
export interface AlertFromFindingsConfig {
  /** Minimum severity to generate alerts (default: high) */
  minSeverity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Maximum alerts to generate per snapshot (default: 5) */
  maxAlertsPerSnapshot?: number;
  /** Skip findings marked as reviewOnly */
  skipReviewOnly?: boolean;
}

/**
 * Generate alerts from findings for a snapshot
 *
 * After DNS collection and finding generation, this function checks
 * for high-severity findings and creates alerts for monitored domains.
 *
 * Only generates alerts for domains that are actively monitored (have a
 * MonitoredDomain record). Non-monitored domains are skipped — the alert
 * system is for ongoing monitoring, not ad-hoc checks.
 *
 * @param db - Database adapter
 * @param snapshotId - The snapshot to check for findings
 * @param tenantId - Tenant ID for alert ownership
 * @param domainId - Domain ID to look up monitored domain record
 * @param config - Configuration options
 * @returns Array of created alerts
 */
export async function generateAlertsFromFindings(
  db: Env['Variables']['db'],
  snapshotId: string,
  tenantId: string,
  domainId: string,
  config: AlertFromFindingsConfig = {}
): Promise<Array<{ alertId: string; findingId: string }>> {
  const { minSeverity = 'high', maxAlertsPerSnapshot = 5, skipReviewOnly = true } = config;

  if (!db) {
    logger.warn('Database not available, skipping alert generation');
    return [];
  }

  // Look up monitored domain — alerts only apply to monitored domains
  const monitoredRepo = new MonitoredDomainRepository(db);
  const monitored = await monitoredRepo.findByDomainId(domainId, tenantId);

  if (!monitored) {
    // Domain is not monitored — skip alert generation (not an error)
    return [];
  }

  const alertRepo = new AlertRepository(db);
  const findingRepo = new FindingRepository(db);

  // Get severity priority (lower number = higher priority)
  const severityPriority: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
    info: 5,
  };

  const minPriority = severityPriority[minSeverity];

  // Get all findings for this snapshot
  const findings = await findingRepo.findBySnapshotId(snapshotId);

  if (findings.length === 0) {
    logger.debug(`No findings for snapshot ${snapshotId}`);
    return [];
  }

  // Filter findings by severity and reviewOnly
  const alertableFindings = findings
    .filter((f) => {
      if (skipReviewOnly && f.reviewOnly) return false;
      // Migrated conditions can notify only through the canonical signal path.
      if (legacyConditionDisposition(f.type).notificationPath !== 'LEGACY_ALERT') return false;
      return severityPriority[f.severity] <= minPriority;
    })
    .sort((a, b) => severityPriority[a.severity] - severityPriority[b.severity])
    .slice(0, maxAlertsPerSnapshot);

  if (alertableFindings.length === 0) {
    logger.debug(`No alertable findings for snapshot ${snapshotId}`);
    return [];
  }

  const results: Array<{ alertId: string; findingId: string }> = [];

  for (const finding of alertableFindings) {
    try {
      const alert = await alertRepo.create({
        monitoredDomainId: monitored.id,
        title: `[${finding.severity.toUpperCase()}] ${finding.title}`,
        description: finding.description,
        severity: finding.severity,
        triggeredByFindingId: finding.id,
        tenantId,
      });

      results.push({ alertId: alert.id, findingId: finding.id });

      logger.info(`Generated alert from finding`, {
        alertId: alert.id,
        findingId: finding.id,
        severity: finding.severity,
        monitoredDomainId: monitored.id,
      });
    } catch (error) {
      logger.error(`Failed to create alert from finding ${finding.id}`, { error });
    }
  }

  return results;
}

/**
 * Generate alerts for critical/high severity findings and send webhook
 *
 * @param db - Database adapter
 * @param snapshotId - The snapshot to check
 * @param tenantId - Tenant ID for alert ownership
 * @param domainId - Domain ID to look up monitored domain
 * @param domainName - Domain name for webhook payload
 * @param webhookUrl - Optional webhook URL to send alerts
 */
export async function generateAndSendFindingAlerts(
  db: Env['Variables']['db'],
  snapshotId: string,
  tenantId: string,
  domainId: string,
  domainName: string,
  webhookUrl?: string
): Promise<{ alerts: Array<{ alertId: string; findingId: string }>; webhookSent: boolean }> {
  const alerts = await generateAlertsFromFindings(db, snapshotId, tenantId, domainId, {
    minSeverity: 'high',
    maxAlertsPerSnapshot: 3,
  });

  let webhookSent = false;

  if (webhookUrl && alerts.length > 0) {
    try {
      // ONE notification path: Use unified sendAlertNotification
      // This ensures: SSRF guard, status tracking (pending → sent), proper logging
      for (const { alertId, findingId } of alerts) {
        const result = await sendAlertNotification(
          alertId,
          webhookUrl,
          {
            id: alertId,
            title: 'High Severity Finding Alert',
            description: `Finding ${findingId} requires attention`,
            severity: 'high',
            domain: domainName,
            tenantId,
          },
          db,
          process.env.WEB_APP_URL
        );

        if (result.success) {
          webhookSent = true;
        } else {
          logger.warn('Finding alert webhook delivery failed', {
            alertId,
            webhookHost: result.webhookHost,
            error: result.error,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to send finding alerts webhook', { error });
    }
  }

  return { alerts, webhookSent };
}
