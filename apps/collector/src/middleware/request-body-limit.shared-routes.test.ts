/**
 * Shared request-body-limit middleware tests for issue #75.
 *
 * Covers the collect, monitoring, and notification routes that read bodies via
 * `c.req.json()`. The shared middleware must reject oversized bodies with a
 * stable 413 before any handler (or its auth/db checks) runs.
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { collectDomainRoutes } from '../jobs/collect-domain.js';
import { collectMailRoutes } from '../jobs/collect-mail.js';
import { monitoringRoutes } from '../jobs/monitoring.js';
import { notificationRoutes } from '../notifications/routes.js';
import type { Env } from '../types.js';
import { MAX_COLLECTOR_REQUEST_BODY_BYTES } from './request-body-limit.js';

const BODY_POST_PATHS = [
  '/api/collect/domain',
  '/api/collect/mail',
  '/api/collect/mail/check',
  '/api/monitoring/check',
  '/api/monitoring/alerts/alert-1/resolve',
  '/api/monitoring/domains/domain-1/monitor',
  '/api/notify/webhook',
] as const;

interface StreamState {
  cancelled: boolean;
}

function streamRequest(
  path: string,
  chunks: Uint8Array[],
  headers: Record<string, string> = {}
): { request: Request; state: StreamState } {
  const state: StreamState = { cancelled: false };
  let nextChunk = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[nextChunk++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  const request = new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  return { request, state };
}

function exactTooLargeBody() {
  return { error: 'Request body too large', maxBytes: MAX_COLLECTOR_REQUEST_BODY_BYTES };
}

function createBodyApp(): Hono<Env> {
  const app = new Hono<Env>();
  app.route('/api/collect', collectDomainRoutes);
  app.route('/api/collect', collectMailRoutes);
  app.route('/api/monitoring', monitoringRoutes);
  app.route('/api/notify', notificationRoutes);
  return app;
}

describe('Shared request body limits (issue #75)', () => {
  const app = createBodyApp();

  it.each(BODY_POST_PATHS)('returns exact 413 for declared overflow on %s', async (path) => {
    const { request, state } = streamRequest(path, [new Uint8Array([1])], {
      'Content-Type': 'application/json',
      'Content-Length': String(MAX_COLLECTOR_REQUEST_BODY_BYTES + 1),
    });

    const res = await app.fetch(request);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual(exactTooLargeBody());
    expect(state.cancelled).toBe(true);
  });

  it.each(
    BODY_POST_PATHS
  )('returns exact 413 for no-length streamed overflow on %s', async (path) => {
    const { request, state } = streamRequest(
      path,
      [new Uint8Array(MAX_COLLECTOR_REQUEST_BODY_BYTES), new Uint8Array([1])],
      { 'Content-Type': 'application/json' }
    );

    const res = await app.fetch(request);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual(exactTooLargeBody());
    expect(state.cancelled).toBe(true);
  });
});
