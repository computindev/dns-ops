import type { IDatabaseAdapter } from '@dns-ops/db';
import {
  auditEvents,
  domainProfiles,
  domains,
  probeObservations,
  snapshots,
} from '@dns-ops/db/schema';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import { domainProfileRoutes } from './domain-profile.js';

function params(condition: unknown): unknown[] {
  if (!condition || typeof condition !== 'object') return [];
  const candidate = condition as {
    constructor?: { name?: string };
    value?: unknown;
    queryChunks?: unknown[];
  };
  if (candidate.constructor?.name === 'Param') return [candidate.value];
  return (candidate.queryChunks ?? []).flatMap(params);
}

function createApp(
  tenantId = 'tenant-1',
  domainTenantId = 'tenant-1',
  actorId = 'actor-1',
  authenticated = true
) {
  const domain = {
    id: 'domain-1',
    name: 'example.com',
    normalizedName: 'example.com',
    tenantId: domainTenantId,
    zoneManagement: 'unknown',
    metadata: null,
    punycodeName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;
  const snapshotsForDomain = [
    {
      id: 'snapshot-old',
      domainId: 'domain-1',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      metadata: null,
    },
    {
      id: 'snapshot-1',
      domainId: 'domain-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      metadata: null,
    },
  ] as never[];
  const profiles: Array<Record<string, unknown>> = [];
  const probes = [
    {
      id: 'probe-1',
      snapshotId: 'snapshot-1',
      probeType: 'tls_cert',
      status: 'error',
      hostname: 'example.com',
      port: 443,
      success: false,
      errorMessage: 'timeout',
      probedAt: new Date(),
      responseTimeMs: null,
      probeData: { check: 'TLS_CERTIFICATE', status: 'UNKNOWN' },
    },
  ];
  const audits: unknown[] = [];
  const db = {
    async selectWhere(table: unknown, condition: unknown) {
      const values = params(condition);
      if (table === domains) return values.includes('example.com') ? [domain] : [];
      if (table === snapshots) return values.includes('domain-1') ? snapshotsForDomain : [];
      if (table === probeObservations) return values.includes('snapshot-1') ? probes : [];
      if (table === domainProfiles)
        return profiles.filter((profile) => values.includes(profile.tenantId));
      return [];
    },
    async selectOne(table: unknown, condition: unknown) {
      const values = params(condition);
      if (table === domains)
        return values.includes('domain-1') && values.includes(tenantId) ? domain : undefined;
      if (table === domainProfiles)
        return profiles.find(
          (profile) => values.includes(profile.domainId) && values.includes(profile.tenantId)
        );
      return undefined;
    },
    async insert(table: unknown, values: Record<string, unknown>) {
      if (table === auditEvents) {
        const row = { id: 'audit-1', createdAt: new Date(), ...values };
        audits.push(row);
        return row;
      }
      if (table === domainProfiles) {
        const row = { createdAt: new Date(), updatedAt: new Date(), ...values };
        profiles.push(row);
        return row;
      }
      throw new Error('Unexpected insert');
    },
    async updateOne(table: unknown, values: Record<string, unknown>) {
      if (table === domainProfiles && profiles[0]) {
        Object.assign(profiles[0] as object, values);
        return profiles[0];
      }
      return undefined;
    },
    async transaction<T>(callback: (tx: IDatabaseAdapter) => Promise<T>) {
      return callback(db as unknown as IDatabaseAdapter);
    },
  };
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', db as unknown as IDatabaseAdapter);
    if (authenticated) {
      c.set('tenantId', tenantId);
      c.set('actorId', actorId);
    }
    await next();
  });
  app.route('/', domainProfileRoutes);
  return { app, audits };
}

describe('domainProfileRoutes', () => {
  it('returns actionable setup state for a tenant-owned undeclared profile', async () => {
    const { app } = createApp();
    const response = await app.request('/example.com/profile');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      setup: { reason: 'PURPOSE_UNDECLARED', action: 'DECLARE_PURPOSE' },
    });
  });

  it('hides domains from a different tenant', async () => {
    const { app } = createApp('tenant-2', 'tenant-1');
    const response = await app.request('/example.com/evidence');
    expect(response.status).toBe(404);
  });

  it('keeps an explicitly UNKNOWN purpose in the actionable setup lane', async () => {
    const { app } = createApp();
    await app.request('/example.com/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'UNKNOWN', criticality: 'NORMAL' }),
    });
    const response = await app.request('/example.com/profile');
    await expect(response.json()).resolves.toMatchObject({
      profile: { purpose: 'UNKNOWN' },
      setup: { reason: 'PURPOSE_UNDECLARED', action: 'DECLARE_PURPOSE' },
    });
  });

  it('rejects unauthenticated and invalid profile writes', async () => {
    const unauthenticated = createApp('tenant-1', 'tenant-1', 'actor-1', false).app;
    const unauthorized = await unauthenticated.request('/example.com/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const { app } = createApp();
    const invalid = await app.request('/example.com/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'NOT_A_PURPOSE', criticality: 'HIGH' }),
    });
    expect(unauthorized.status).toBe(401);
    expect(invalid.status).toBe(400);
  });

  it('rejects unauthenticated and malformed baseline acceptance', async () => {
    const unauthenticated = createApp('tenant-1', 'tenant-1', 'actor-1', false).app;
    const denied = await unauthenticated.request('/example.com/baselines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const { app } = createApp();
    const invalid = await app.request('/example.com/baselines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        signalKind: 'TLS_CERTIFICATE_REGRESSION',
        sourceSnapshotId: 'snapshot-1',
        discriminator: 'example.com:443',
        maxEvidenceAgeSeconds: 60,
        policy: { kind: 'SPF_PRESENT' },
      }),
    });
    expect(denied.status).toBe(401);
    expect(invalid.status).toBe(400);
  });

  it('writes a validated profile with an attributed atomic audit event', async () => {
    const { app, audits } = createApp();
    const response = await app.request('/example.com/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
      body: JSON.stringify({ purpose: 'WEB', criticality: 'HIGH', responsibleActorId: 'owner-1' }),
    });
    expect(response.status).toBe(200);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'domain_profile_updated',
      actorId: 'actor-1',
      tenantId: 'tenant-1',
    });
  });

  it('returns only latest snapshot external evidence', async () => {
    const { app } = createApp();
    const response = await app.request('/example.com/evidence');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      snapshotId: 'snapshot-1',
      evidence: [{ probeType: 'tls_cert' }],
    });
  });
});
