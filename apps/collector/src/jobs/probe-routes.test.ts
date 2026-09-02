/**
 * Probe Routes Tests - Bead 13.1
 *
 * Tests for probe API endpoint authentication.
 * Verifies that probe endpoints require explicit authorization.
 *
 * Bead dns-ops-1j4.13.1 requirements covered:
 * - Probe execution requires authentication
 * - Anonymous access is rejected with 401
 * - Authenticated requests proceed normally
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { requireServiceAuthMiddleware } from '../middleware/index.js';
import { MAX_COLLECTOR_REQUEST_BODY_BYTES } from '../middleware/request-body-limit.js';
import type { Env } from '../types.js';
import { probeRoutes } from './probe-routes.js';

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
// Authentication Tests
// =============================================================================

describe('Probe Routes Authentication - Bead 13.1', () => {
  describe('Unauthenticated requests', () => {
    it('POST /mta-sts should return 401 without authentication', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/mta-sts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'example.com' }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('POST /smtp-starttls should return 401 without authentication', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/smtp-starttls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: 'mail.example.com' }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('POST /allowlist/generate should return 401 without authentication', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/allowlist/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'example.com', dnsResults: [] }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('GET /allowlist should return 401 without authentication', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/allowlist');

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('GET /ssrf-check/:target should return 401 without authentication', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/ssrf-check/example.com');

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('GET /health should return 401 without authentication', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/health');

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });
  });

  describe('Authenticated requests', () => {
    it('POST /mta-sts should proceed with valid internal secret', async () => {
      const app = createAppWithAuth();

      // This will fail validation but NOT return 401 - proving auth passed
      const res = await app.request('/api/probe/mta-sts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
        body: JSON.stringify({}), // Missing domain - will fail validation
      });

      // Should NOT be 401 - auth passed.
      // Feature gating may reject before payload validation when active probes are disabled.
      expect(res.status).not.toBe(401);
      expect([400, 503]).toContain(res.status);
    });

    it('GET /health should return 200 with valid internal secret', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/health', {
        headers: {
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('healthy');
      expect(json.service).toBe('probe-sandbox');
    });

    it('GET /allowlist should return 200 with valid internal secret', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/allowlist', {
        headers: {
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.count).toBeDefined();
      expect(json.entries).toBeDefined();
    });

    it('GET /ssrf-check/:target should return 200 with valid internal secret', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/ssrf-check/example.com', {
        headers: {
          'X-Internal-Secret': 'test-internal-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.target).toBe('example.com');
    });

    it('should accept API principal token authentication (#66)', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/health', {
        headers: {
          'X-API-Key': 'collector-auth-test-token-0123456789abcdef01234',
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('Invalid authentication', () => {
    it('should reject invalid internal secret', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/health', {
        headers: {
          'X-Internal-Secret': 'wrong-secret',
          'X-Tenant-Id': 'test-tenant',
          'X-Actor-Id': 'test-actor',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should reject invalid API key format', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/health', {
        headers: {
          'X-API-Key': 'invalid-format',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should reject API key with wrong secret', async () => {
      const app = createAppWithAuth();

      const res = await app.request('/api/probe/health', {
        headers: {
          'X-API-Key': 'test-tenant:test-actor:wrong-secret',
        },
      });

      expect(res.status).toBe(401);
    });
  });
});

// =============================================================================
// Without Auth Middleware (baseline tests)
// =============================================================================

describe('Probe Routes Without Auth (baseline)', () => {
  it('GET /health should work without middleware', async () => {
    // Create app WITHOUT auth middleware to verify routes work in isolation
    const app = new Hono<Env>();
    app.route('/api/probe', probeRoutes);

    const res = await app.request('/api/probe/health');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
  });

  it('GET /allowlist should work without middleware', async () => {
    const app = new Hono<Env>();
    app.route('/api/probe', probeRoutes);

    const res = await app.request('/api/probe/allowlist');

    expect(res.status).toBe(200);
  });
});

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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create app with auth middleware matching production setup.
 * Sets up environment variables needed for auth validation.
 */
function createAppWithAuth(): Hono<Env> {
  // Set up test environment variables
  const _originalInternalSecret = process.env.INTERNAL_SECRET;
  const _originalApiPrincipals = process.env.API_PRINCIPALS_JSON;
  const _originalApiKeySecret = process.env.API_KEY_SECRET;

  process.env.INTERNAL_SECRET = 'test-internal-secret';
  // API principal configuration: bare opaque token mapped by hash (#66).
  process.env.API_PRINCIPALS_JSON = JSON.stringify([
    {
      principalId: 'probe-principal-1',
      tokenSha256: '5b9a79e08f9713894a7104c96dc95e3901437acfbb75a6a1b7c097804c7aa8ab',
      tenantId: '660e8400-e29b-41d4-a716-446655440000',
      actorId: 'probe-actor',
      enabled: true,
    },
  ]);

  const app = new Hono<Env>();

  // Apply auth middleware BEFORE routes (matching index.ts)
  app.use('*', requireServiceAuthMiddleware);

  // Mount probe routes
  app.route('/api/probe', probeRoutes);

  // Cleanup function (runs after each request in these tests)
  // Note: In a real test, you'd use beforeEach/afterEach for cleanup
  // For simplicity, we're setting them once per test function

  return app;
}
