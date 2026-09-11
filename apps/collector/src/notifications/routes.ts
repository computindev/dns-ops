/**
 * Notification Routes
 *
 * API endpoints for webhook notifications.
 * All webhooks go through the unified sendAlertNotification path.
 */

import { AlertRepository, DomainRepository, MonitoredDomainRepository } from '@dns-ops/db';
import { Hono } from 'hono';
import { getCollectorLogger } from '../middleware/error-tracking.js';
import { requestBodyLimitMiddleware } from '../middleware/request-body-limit.js';
import type { Env } from '../types.js';
import { sendAlertNotification } from './webhook.js';

export const notificationRoutes = new Hono<Env>();
notificationRoutes.use('*', requestBodyLimitMiddleware());

/**
 * POST /api/notify/webhook
 * Send an alert notification via webhook
 *
 * Uses the ONE unified notification path with:
 * - SSRF protection via shared guard
 * - Alert status tracking (pending → sent)
 * - Proper logging
 *
 * Body: {
 *   webhookUrl: string;
 *   alert: {
 *     id: string;
 *     title: string;
 *     description?: string;
 *     severity: string;
 *     domain: string;
 *     tenantId: string;
 *   };
 *   baseUrl?: string;
 * }
 */
notificationRoutes.post('/webhook', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    if (!tenantId) {
      return c.json({ error: 'Authenticated tenant context required' }, 401);
    }
    const db = c.get('db');
    if (!db) {
      return c.json({ error: 'Database unavailable' }, 503);
    }

    const body = await c.req.json();
    const { webhookUrl, alert, baseUrl } = body;

    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return c.json(
        {
          error: 'Bad Request',
          message: 'webhookUrl is required and must be a string',
        },
        400
      );
    }

    if (!alert || typeof alert !== 'object' || typeof alert.id !== 'string' || !alert.id) {
      return c.json(
        {
          error: 'Bad Request',
          message: 'alert.id is required',
        },
        400
      );
    }

    if (typeof alert.tenantId === 'string' && alert.tenantId !== tenantId) {
      return c.json({ error: 'Forbidden', message: 'alert.tenantId does not match tenant' }, 403);
    }

    const stored = await new AlertRepository(db).findById(alert.id, tenantId);
    if (!stored) {
      return c.json({ error: 'Alert not found' }, 404);
    }

    const monitored = await new MonitoredDomainRepository(db).findById(
      stored.monitoredDomainId,
      tenantId
    );
    if (!monitored) {
      return c.json({ error: 'Alert not found' }, 404);
    }
    const domain = await new DomainRepository(db).findById(monitored.domainId);
    if (!domain || domain.tenantId !== tenantId) {
      return c.json({ error: 'Alert not found' }, 404);
    }

    const result = await sendAlertNotification(
      stored.id,
      webhookUrl,
      {
        id: stored.id,
        title: stored.title,
        description: stored.description,
        severity: stored.severity,
        domain: domain.normalizedName || domain.name,
        tenantId: stored.tenantId,
      },
      db,
      baseUrl
    );

    if (result.success) {
      return c.json(
        {
          success: true,
          message: 'Webhook sent successfully',
          webhookHost: result.webhookHost,
          statusUpdated: result.statusUpdated,
        },
        200
      );
    }

    // Return error response
    return c.json(
      {
        success: false,
        error: result.error,
        message: 'Webhook delivery failed',
        webhookHost: result.webhookHost,
      },
      502
    );
  } catch (error) {
    const logger = getCollectorLogger();
    logger.error(
      'Webhook notification error',
      error instanceof Error ? error : new Error(String(error)),
      {
        path: '/api/notify/webhook',
        method: 'POST',
        requestId: c.req.header('X-Request-ID'),
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/notify/health
 * Health check for notification service
 */
notificationRoutes.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'notification',
    timestamp: new Date().toISOString(),
  });
});
