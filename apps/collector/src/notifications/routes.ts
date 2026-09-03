/**
 * Notification Routes
 *
 * API endpoints for webhook notifications.
 * All webhooks go through the unified sendAlertNotification path.
 */

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
  let webhookUrl: string | undefined;
  try {
    const body = await c.req.json();
    const { webhookUrl: url, alert, baseUrl } = body;
    webhookUrl = url;

    // Validate required fields
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return c.json(
        {
          error: 'Bad Request',
          message: 'webhookUrl is required and must be a string',
        },
        400
      );
    }

    if (!alert || typeof alert !== 'object') {
      return c.json(
        {
          error: 'Bad Request',
          message: 'alert is required and must be an object',
        },
        400
      );
    }

    // Validate alert required fields
    const requiredAlertFields = ['id', 'title', 'severity', 'domain', 'tenantId'];
    for (const field of requiredAlertFields) {
      if (!(field in alert)) {
        return c.json(
          {
            error: 'Bad Request',
            message: `alert.${field} is required`,
          },
          400
        );
      }
    }

    const db = c.get('db');

    // Use the unified notification path
    const result = await sendAlertNotification(alert.id, webhookUrl, alert, db, baseUrl);

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
