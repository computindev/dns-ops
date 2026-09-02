/**
 * Probe route request-body-limit tests for issue #75.
 *
 * These tests mount the production probe routes in an isolated app so the
 * body-limit behavior is covered without broadening probe authentication tests.
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { MAX_COLLECTOR_REQUEST_BODY_BYTES } from './request-body-limit.js';
import type { Env } from '../types.js';
import { probeRoutes } from '../jobs/probe-routes.js';

const PROBE_POST_PATHS = [
  '/api/probe/mta-sts',
  '/api/probe/smtp-starttls',
  '/api/probe/allowlist/generate',
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

async function withActiveProbes<T>(callback: () => Promise<T>): Promise<T> {
  const original = process.env.ENABLE_ACTIVE_PROBES;
  process.env.ENABLE_ACTIVE_PROBES = 'true';
  try {
    return await callback();
  } finally {
    if (original === undefined) delete process.env.ENABLE_ACTIVE_PROBES;
    else process.env.ENABLE_ACTIVE_PROBES = original;
  }
}

function createProbeBodyApp(): Hono<Env> {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', {
      query: () => Promise.resolve([]),
    } as unknown as import('@dns-ops/db').IDatabaseAdapter);
    c.set('tenantId', 'test-tenant');
    c.set('actorId', 'test-actor');
    await next();
  });
  app.route('/api/probe', probeRoutes);
  return app;
}

// =============================================================================
// Request body limits (issue #75)
// =============================================================================

describe('Probe request body limits (issue #75)', () => {
  const app = createProbeBodyApp();

  it.each(PROBE_POST_PATHS)('returns exact 413 for declared overflow on %s', async (path) => {
    await withActiveProbes(async () => {
      const { request, state } = streamRequest(path, [new Uint8Array([1])], {
        'Content-Type': 'application/json',
        'Content-Length': String(MAX_COLLECTOR_REQUEST_BODY_BYTES + 1),
      });

      const res = await app.fetch(request);
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual(exactTooLargeBody());
      expect(state.cancelled).toBe(true);
    });
  });

  it.each(
    PROBE_POST_PATHS
  )('returns exact 413 for no-length streamed overflow on %s', async (path) => {
    await withActiveProbes(async () => {
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

  it.each(
    PROBE_POST_PATHS
  )('keeps malformed under-limit JSON on missing-domain 400 for %s', async (path) => {
    await withActiveProbes(async () => {
      const res = await app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"domain":',
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Domain is required', reason: 'missing-domain' });
    });
  });
});
