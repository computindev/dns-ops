/**
 * Service Auth Middleware Tests (#66)
 *
 * API principal authentication for the collector: bare opaque tokens map by
 * SHA-256 hash to stored principals; tenant/actor are derived server-side
 * only. The legacy tenantId:actorId:secret format is gated behind
 * ENABLE_LEGACY_API_KEY_AUTH (literal "true", default off everywhere).
 */

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import { requireServiceAuthMiddleware, serviceAuthMiddleware } from './auth.js';

const ORIGINAL_ENV = process.env;

const PRINCIPAL_TOKEN = 'collector-auth-test-token-0123456789abcdef01234';
const PRINCIPAL_TOKEN_SHA256 = '5b9a79e08f9713894a7104c96dc95e3901437acfbb75a6a1b7c097804c7aa8ab';
const PRINCIPAL_TENANT_UUID = '660e8400-e29b-41d4-a716-446655440000';
const PRINCIPAL_ACTOR = 'stored-collector-actor';

function principalsJson(): string {
  return JSON.stringify([
    {
      principalId: 'collector-principal-1',
      tokenSha256: PRINCIPAL_TOKEN_SHA256,
      tenantId: PRINCIPAL_TENANT_UUID,
      actorId: PRINCIPAL_ACTOR,
      enabled: true,
    },
  ]);
}

describe('Service Auth Middleware — API key principal authentication (#66)', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      API_KEY_SECRET: 'test-api-secret',
      API_PRINCIPALS_JSON: principalsJson(),
    };
    delete process.env.ENABLE_LEGACY_API_KEY_AUTH;
    delete process.env.NODE_ENV;

    app = new Hono<Env>();
    app.use('*', requireServiceAuthMiddleware);
    app.get('/test', (c) => c.json({ tenantId: c.get('tenantId'), actorId: c.get('actorId') }));
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('rejects forged legacy API key identity when legacy auth is not enabled', async () => {
    const res = await app.request('/test', {
      headers: {
        'X-API-Key': 'forged-tenant:forged-actor:test-api-secret',
      },
    });

    expect(res.status).toBe(401);
  });

  it('maps a bare token to the stored principal identity', async () => {
    const res = await app.request('/test', {
      headers: {
        'X-API-Key': PRINCIPAL_TOKEN,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Stored canonical UUID passes through normalization unchanged.
    expect(body.tenantId).toBe(PRINCIPAL_TENANT_UUID);
    expect(body.actorId).toBe(PRINCIPAL_ACTOR);
  });

  it('ignores X-Tenant-Id/X-Actor-Id headers on the API key path', async () => {
    const res = await app.request('/test', {
      headers: {
        'X-API-Key': PRINCIPAL_TOKEN,
        'X-Tenant-Id': 'forged-tenant',
        'X-Actor-Id': 'forged-actor',
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Identity comes from the stored principal, never from request headers.
    expect(body.tenantId).toBe(PRINCIPAL_TENANT_UUID);
    expect(body.actorId).toBe(PRINCIPAL_ACTOR);
  });

  it('rejects unknown bare tokens', async () => {
    const res = await app.request('/test', {
      headers: {
        'X-API-Key': 'unknown-token-0123456789abcdef0123456789abcdef',
      },
    });

    expect(res.status).toBe(401);
  });

  it('rejects disabled principal tokens', async () => {
    process.env.API_PRINCIPALS_JSON = JSON.stringify([
      {
        principalId: 'collector-principal-1',
        tokenSha256: PRINCIPAL_TOKEN_SHA256,
        tenantId: PRINCIPAL_TENANT_UUID,
        actorId: PRINCIPAL_ACTOR,
        enabled: false,
      },
    ]);

    const res = await app.request('/test', {
      headers: {
        'X-API-Key': PRINCIPAL_TOKEN,
      },
    });

    expect(res.status).toBe(401);
  });

  it('rejects malformed bare tokens', async () => {
    for (const token of ['short', 'has spaces and symbols!@#']) {
      const res = await app.request('/test', {
        headers: {
          'X-API-Key': token,
        },
      });

      expect(res.status).toBe(401);
    }
  });

  it('rejects all bare tokens when API_PRINCIPALS_JSON is unset', async () => {
    delete process.env.API_PRINCIPALS_JSON;

    const res = await app.request('/test', {
      headers: {
        'X-API-Key': PRINCIPAL_TOKEN,
      },
    });

    expect(res.status).toBe(401);
  });

  it('fails closed on malformed principal configuration without legacy fallback', async () => {
    process.env.API_PRINCIPALS_JSON = 'not-json';
    // Even with the legacy flag on and a matching secret, malformed config must reject.
    process.env.ENABLE_LEGACY_API_KEY_AUTH = 'true';

    const res = await app.request('/test', {
      headers: {
        'X-API-Key': 'forged-tenant:forged-actor:test-api-secret',
      },
    });

    expect(res.status).toBe(401);
  });

  it('rejects the legacy format when the flag is anything but literal true', async () => {
    for (const flagValue of ['false', 'True', '1', 'yes']) {
      process.env.ENABLE_LEGACY_API_KEY_AUTH = flagValue;

      const res = await app.request('/test', {
        headers: {
          'X-API-Key': 'legacy-tenant:legacy-actor:test-api-secret',
        },
      });

      expect(res.status).toBe(401);
    }
  });

  it('accepts the legacy format only under the explicit one-release flag', async () => {
    process.env.ENABLE_LEGACY_API_KEY_AUTH = 'true';

    const res = await app.request('/test', {
      headers: {
        'X-API-Key': 'legacy-tenant:legacy-actor:test-api-secret',
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.actorId).toBe('legacy-actor');
  });

  it('rejects the legacy format with a wrong secret even when enabled', async () => {
    process.env.ENABLE_LEGACY_API_KEY_AUTH = 'true';

    const res = await app.request('/test', {
      headers: {
        'X-API-Key': 'legacy-tenant:legacy-actor:wrong-secret',
      },
    });

    expect(res.status).toBe(401);
  });

  it('populates context without rejecting on the non-require middleware', async () => {
    const soft = new Hono<Env>();
    soft.use('*', serviceAuthMiddleware);
    soft.get('/test', (c) => c.json({ tenantId: c.get('tenantId') }));

    const res = await soft.request('/test', {
      headers: {
        'X-API-Key': PRINCIPAL_TOKEN,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.tenantId).toBe(PRINCIPAL_TENANT_UUID);
  });
});
