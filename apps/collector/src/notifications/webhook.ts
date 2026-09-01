/**
 * Webhook Notification Service
 *
 * Sends alert notifications via webhooks with SSRF protection.
 * 5s timeout, best-effort delivery.
 *
 * All webhook URLs go through the shared SSRF guard (ssrf-guard.ts) for
 * consistent protection against private/internal target blocking.
 */

import type { IncomingMessage } from 'node:http';
import * as https from 'node:https';
import * as tls from 'node:tls';
import { resolveAndCheck, validateUrl } from '../probes/ssrf-guard.js';

export interface WebhookPayload {
  alertId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  domain: string;
  tenantId: string;
  timestamp: string;
  domain360Link: string;
}

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  /** The resolved hostname after SSRF check (for logging, not full URL) */
  resolvedHostname?: string;
}

/**
 * Check if a URL points to a private/internal network.
 *
 * This is a thin wrapper around the shared SSRF guard's validateUrl()
 * for backward compatibility with existing code.
 *
 * @deprecated Use validateUrl() from ssrf-guard.ts directly for more context
 */
export function isPrivateUrl(url: string): boolean {
  const result = validateUrl(url);
  return !result.allowed;
}

const WEBHOOK_TIMEOUT_MS = 5_000;
const MAX_WEBHOOK_RESPONSE_BYTES = 64 * 1024;

class WebhookTimeoutError extends Error {
  constructor() {
    super('Webhook delivery deadline exceeded');
    this.name = 'WebhookTimeoutError';
  }
}

interface WebhookResponse {
  statusCode: number;
}

function remainingMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

function declaredResponseSize(headers: IncomingMessage['headers']): number | null {
  const value = headers['content-length'];
  if (value === undefined) return null;
  const text = Array.isArray(value) ? value.join(',') : value;
  if (!/^\d+$/.test(text)) throw new Error('Webhook response has an invalid Content-Length');
  const length = Number(text);
  if (!Number.isSafeInteger(length)) throw new Error('Webhook response Content-Length is invalid');
  return length;
}

/** Send one pinned HTTPS request without redirect following. */
function requestPinnedWebhook(
  url: URL,
  resolvedIp: string,
  body: string,
  signal: AbortSignal,
  deadline: number
): Promise<WebhookResponse> {
  if (signal.aborted) return Promise.reject(new WebhookTimeoutError());

  return new Promise((resolve, reject) => {
    let request: ReturnType<typeof https.request> | undefined;
    let response: IncomingMessage | undefined;
    let settled = false;
    let bodyComplete = false;
    let bodyBytes = 0;

    const cleanupResponse = () => {
      response?.off('data', onData);
      response?.off('end', onEnd);
      response?.off('error', onResponseError);
      response?.off('aborted', onResponseAborted);
      response?.off('close', onResponseClose);
    };
    const cleanup = () => {
      cleanupResponse();
      request?.off('error', onRequestError);
      request?.off('timeout', onRequestTimeout);
      signal.removeEventListener('abort', onAbort);
    };
    const destroy = () => {
      request?.destroy();
      response?.destroy();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      destroy();
      reject(error);
    };
    const finish = () => {
      if (settled || !response) return;
      settled = true;
      bodyComplete = true;
      cleanup();
      resolve({ statusCode: response.statusCode ?? 0 });
    };
    const onAbort = () => fail(new WebhookTimeoutError());
    const onRequestError = (error: Error) => fail(error);
    const onRequestTimeout = () => fail(new WebhookTimeoutError());
    const onResponseError = (error: Error) => fail(error);
    const onResponseAborted = () => fail(new Error('Webhook response was aborted'));
    const onResponseClose = () => {
      if (!bodyComplete) fail(new Error('Webhook response closed before body completion'));
    };
    const onData = (chunk: Buffer | string) => {
      bodyBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
      if (bodyBytes > MAX_WEBHOOK_RESPONSE_BYTES) {
        fail(new Error('Webhook response body exceeds 65536 bytes'));
      }
    };
    const onEnd = () => {
      bodyComplete = true;
      finish();
    };

    try {
      signal.addEventListener('abort', onAbort, { once: true });
      request = https.request(
        {
          protocol: 'https:',
          hostname: resolvedIp,
          port: url.port ? Number(url.port) : 443,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          agent: false,
          servername: url.hostname,
          rejectUnauthorized: true,
          checkServerIdentity: (_hostname, certificate) =>
            tls.checkServerIdentity(url.hostname, certificate),
          headers: {
            Host: url.host,
            'Content-Type': 'application/json',
            'User-Agent': 'dns-ops-collector/1.0 webhook-notifier',
          },
          // The address was checked before this request; never resolve the
          // original hostname again and reopen the DNS rebinding window.
          lookup: (_hostname, _options, callback) => callback(null, resolvedIp, 4),
        },
        (incoming) => {
          response = incoming;
          if (settled) {
            incoming.destroy();
            return;
          }

          const statusCode = incoming.statusCode ?? 0;
          if (statusCode >= 300 && statusCode < 400) {
            fail(new Error(`HTTP redirect ${statusCode} is not allowed`));
            return;
          }

          try {
            const length = declaredResponseSize(incoming.headers);
            if (length !== null && length > MAX_WEBHOOK_RESPONSE_BYTES) {
              fail(new Error('Webhook response Content-Length exceeds 65536 bytes'));
              return;
            }
          } catch (error) {
            fail(error);
            return;
          }

          incoming.on('data', onData);
          incoming.on('end', onEnd);
          incoming.on('error', onResponseError);
          incoming.on('aborted', onResponseAborted);
          incoming.on('close', onResponseClose);
        }
      );
      request.on('error', onRequestError);
      request.setTimeout(remainingMs(deadline), onRequestTimeout);
      if (signal.aborted) {
        onAbort();
        return;
      }
      request.end(body);
    } catch (error) {
      fail(error);
    }
  });
}

/**
 * Send an alert webhook notification.
 *
 * Best-effort delivery - errors are logged but don't throw. Hostname DNS is
 * resolved once to a checked public IPv4 and the native HTTPS request is
 * pinned to that address while retaining the original Host/SNI identity.
 */
export async function sendAlertWebhook(
  webhookUrl: string,
  payload: WebhookPayload,
  signal?: AbortSignal
): Promise<WebhookResult> {
  const ssrfCheck = validateUrl(webhookUrl);
  if (!ssrfCheck.allowed || !ssrfCheck.url) {
    return {
      success: false,
      error: 'SSRF_BLOCKED',
      resolvedHostname: ssrfCheck.url?.hostname,
    };
  }

  const url = ssrfCheck.url;
  const hostname = url.hostname;
  if (url.protocol !== 'https:') {
    return { success: false, error: 'HTTPS_REQUIRED', resolvedHostname: hostname };
  }

  const controller = new AbortController();
  const deadline = Date.now() + WEBHOOK_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    if (signal?.aborted) controller.abort();
    const dnsCheck = await resolveAndCheck(hostname, controller.signal);
    if (!dnsCheck.allowed) {
      return {
        success: false,
        error: controller.signal.aborted ? 'TIMEOUT' : (dnsCheck.reason ?? 'DNS resolution failed'),
        resolvedHostname: hostname,
      };
    }

    const response = await requestPinnedWebhook(
      url,
      dnsCheck.ip,
      JSON.stringify(payload),
      controller.signal,
      deadline
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return { success: true, statusCode: response.statusCode, resolvedHostname: hostname };
    }

    return {
      success: false,
      statusCode: response.statusCode,
      error: `HTTP ${response.statusCode}`,
      resolvedHostname: hostname,
    };
  } catch (error) {
    const isTimeout =
      controller.signal.aborted ||
      error instanceof WebhookTimeoutError ||
      (error instanceof Error && error.name === 'AbortError');
    return {
      success: false,
      error: isTimeout ? 'TIMEOUT' : error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      resolvedHostname: hostname,
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Build a webhook payload from alert data
 */
export function buildWebhookPayload(
  alert: {
    id: string;
    title: string;
    description?: string;
    severity: string;
    domain: string;
    tenantId: string;
  },
  baseUrl?: string
): WebhookPayload {
  const timestamp = new Date().toISOString();
  const domain360Link = baseUrl
    ? `${baseUrl}/domain/${alert.domain}`
    : `https://app.dns-ops.example.com/domain/${alert.domain}`;

  return {
    alertId: alert.id,
    title: alert.title,
    description: alert.description ?? '',
    severity: alert.severity as WebhookPayload['severity'],
    domain: alert.domain,
    tenantId: alert.tenantId,
    timestamp,
    domain360Link,
  };
}

/**
 * Alert with webhook notification service.
 *
 * Provides a unified notification path that:
 * 1. Validates webhook URL via SSRF guard
 * 2. Sends the webhook
 * 3. Updates alert status to 'sent' on success
 *
 * This ensures alert status reflects actual delivery truth.
 */

import { createLogger } from '@dns-ops/logging';
import type { Env } from '../types.js';

const notificationLogger = createLogger({
  service: 'dns-ops-collector',
  version: '1.0.0',
  minLevel: 'info',
});

/**
 * Send alert notification and update status.
 *
 * This is the ONE notification path for all alert webhooks.
 *
 * @param alertId - Alert ID for status tracking
 * @param webhookUrl - Target webhook URL
 * @param alertData - Alert data for payload
 * @param db - Database adapter for status updates
 * @param baseUrl - Optional base URL for Domain360 links
 * @returns Result with success status and hostname (for logging)
 */
export async function sendAlertNotification(
  alertId: string,
  webhookUrl: string,
  alertData: {
    id: string;
    title: string;
    description?: string;
    severity: string;
    domain: string;
    tenantId: string;
  },
  db: Env['Variables']['db'],
  baseUrl?: string
): Promise<{
  success: boolean;
  error?: string;
  webhookHost?: string;
  statusUpdated?: boolean;
}> {
  // Build the payload
  const payload = buildWebhookPayload(alertData, baseUrl);

  // Send the webhook
  const result = await sendAlertWebhook(webhookUrl, payload);

  // Log the attempt (without full URL)
  if (result.success) {
    notificationLogger.info('Alert webhook delivered', {
      alertId,
      webhookHost: result.resolvedHostname,
      statusCode: result.statusCode,
    });
  } else {
    notificationLogger.warn('Alert webhook delivery failed', {
      alertId,
      webhookHost: result.resolvedHostname,
      error: result.error,
    });
  }

  // Update alert status on successful delivery
  if (result.success && db) {
    try {
      const { AlertRepository } = await import('@dns-ops/db');
      const alertRepo = new AlertRepository(db);
      await alertRepo.updateStatus(alertId, alertData.tenantId, 'sent');
      return {
        success: true,
        webhookHost: result.resolvedHostname,
        statusUpdated: true,
      };
    } catch (error) {
      // Status update failure should not fail the webhook notification
      notificationLogger.error('Failed to update alert status to sent', {
        alertId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: true, // Webhook succeeded, status update failed
        webhookHost: result.resolvedHostname,
        statusUpdated: false,
      };
    }
  }

  return {
    success: result.success,
    error: result.error,
    webhookHost: result.resolvedHostname,
  };
}
