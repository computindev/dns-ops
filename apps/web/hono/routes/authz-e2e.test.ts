/**
 * Authorization E2E Integration Tests
 *
 * Comprehensive tests covering:
 * 1. requireAdminAccess OR logic (CF header | ADMIN_EMAILS allowlist | internal secret | dev actor)
 * 2. Findings routes auth enforcement (requireAuth on all read paths)
 * 3. Backfill cross-tenant isolation (skip, don't return-early from loop)
 * 4. Domain normalization consistency (isValidDomain ↔ normalizeDomain)
 *
 * These tests would have caught the bugs found in this review:
 * - Missing requireAuth on 3 findings GET routes
 * - return vs continue in backfill loop (exit-early vs skip)
 * - requireAdminAccess admin credential logic bug
 * - isValidDomain whitespace inconsistency
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authMiddleware, requireAuthMiddleware } from '../middleware/auth.js';
import type { Env } from '../types.js';
import { alertRoutes } from './alerts.js';
import { apiRoutes } from './api.js';
import { delegationRoutes } from './delegation.js';
import { findingsRoutes } from './findings.js';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a mock DB adapter that correctly handles Drizzle conditions.
 * Returns matching rows for any selectOne query on registered tables.
 */
function createMockDb(
  domains: Array<Record<string, unknown>> = [],
  snapshots: Array<Record<string, unknown>> = [],
  findings: Array<Record<string, unknown>> = [],
  rulesetVersions: Array<Record<string, unknown>> = []
): IDatabaseAdapter {
  const findById = <T extends { id?: string }>(table: T[], id: unknown): T | undefined => {
    return table.find((row) => row.id === id) as T | undefined;
  };

  return {
    getDrizzle: vi.fn().mockReturnValue({
      query: {
        domains: {
          findMany: vi.fn().mockResolvedValue(domains),
          findFirst: vi.fn().mockImplementation((opts?: { where?: unknown }) => {
            if (!opts?.where) return Promise.resolve(undefined);
            const param = extractParam(opts.where);
            return Promise.resolve(domains.find((d) => d.id === param));
          }),
        },
        snapshots: {
          findMany: vi.fn().mockResolvedValue(snapshots),
          findFirst: vi.fn().mockImplementation((opts?: { where?: unknown }) => {
            if (!opts?.where) return Promise.resolve(undefined);
            const param = extractParam(opts.where);
            return Promise.resolve(snapshots.find((s) => s.id === param));
          }),
        },
        findings: {
          findMany: vi.fn().mockResolvedValue(findings),
        },
        rulesetVersions: {
          findMany: vi.fn().mockResolvedValue(rulesetVersions),
          findFirst: vi.fn().mockImplementation((opts?: { where?: unknown }) => {
            if (!opts?.where) return Promise.resolve(undefined);
            const idParam = extractParam(opts.where);
            const versionParam = extractParam(opts.where, 'version');
            // Try version match first
            if (versionParam) {
              const found = rulesetVersions.find((r) => r.version === versionParam);
              if (found) return Promise.resolve(found);
            }
            return Promise.resolve(rulesetVersions.find((r) => r.id === idParam));
          }),
        },
      },
    }),
    select: vi.fn().mockResolvedValue([]),
    selectWhere: vi.fn().mockImplementation((table: unknown, _condition: unknown) => {
      const tableName = String(table);
      if (tableName.includes('domain') || tableName.includes('Domain')) {
        return Promise.resolve([...domains]);
      }
      if (tableName.includes('snapshot') || tableName.includes('Snapshot')) {
        return Promise.resolve([...snapshots]);
      }
      if (tableName.includes('finding') || tableName.includes('Finding')) {
        return Promise.resolve([...findings]);
      }
      return Promise.resolve([]);
    }),
    selectOne: vi.fn().mockImplementation((table: unknown, condition: unknown) => {
      const tableName = String(table);
      const param = extractParam(condition);
      const versionParam = extractParam(condition, 'version');
      if (tableName.includes('domain') || tableName.includes('Domain')) {
        return Promise.resolve(findById(domains, param));
      }
      if (tableName.includes('snapshot') || tableName.includes('Snapshot')) {
        return Promise.resolve(findById(snapshots, param));
      }
      if (tableName.includes('finding') || tableName.includes('Finding')) {
        return Promise.resolve(findById(findings, param));
      }
      if (tableName.includes('ruleset') || tableName.includes('Ruleset')) {
        // findByVersion uses 'version' field, findById uses 'id'
        const byVersion = rulesetVersions.find((r) => r.version === versionParam);
        if (byVersion) return Promise.resolve(byVersion);
        return Promise.resolve(findById(rulesetVersions, param));
      }
      return Promise.resolve(undefined);
    }),
    insert: vi.fn().mockImplementation((table: unknown, data: unknown) => {
      // Return a created object with an id
      const tableName = String(table);
      if (tableName.includes('ruleset') || tableName.includes('Ruleset')) {
        return Promise.resolve({
          id: 'rs-newly-created',
          version: (data as { version?: string })?.version ?? 'new',
          name: '',
          description: '',
          rules: [],
          active: true,
          createdBy: 'test',
          createdAt: new Date(),
        });
      }
      return Promise.resolve({ id: 'newly-created-id', ...(data as object) });
    }),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(),
  } as unknown as IDatabaseAdapter;
}

/**
 * Extract the parameter value from a Drizzle eq() condition.
 * Works for both ID lookups (UUID) and field lookups (e.g., version strings).
 */
function createSessionDb(userEmail: string, tenantId: string): IDatabaseAdapter {
  const db = createMockDb();
  return {
    ...db,
    getDrizzle: vi.fn().mockReturnValue({
      query: {
        sessions: {
          findFirst: vi.fn().mockResolvedValue({
            tenantId,
            userEmail,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        },
      },
    }),
  } as unknown as IDatabaseAdapter;
}

function createAuthedApiApp(db: IDatabaseAdapter): Hono<Env> {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', db as Env['Variables']['db']);
    await next();
  });
  app.use('*', authMiddleware);
  app.use('/api/*', async (c, next) => requireAuthMiddleware(c, next));
  app.route('/api', apiRoutes);
  return app;
}

function extractParam(condition: unknown, fieldName?: string): unknown {
  if (!condition) return undefined;
  try {
    // Try to extract from the condition object's queryChunks
    const c = condition as Record<string, unknown>;
    const queryChunks = c.queryChunks as Array<{
      constructor?: { name?: string };
      value?: unknown;
    }>;
    const param = queryChunks?.find((chunk) => chunk?.constructor?.name === 'Param')?.value;
    if (param !== undefined) return param;

    // Fall back to UUID pattern in string representation
    const str = String(condition);
    const uuidMatch = str.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    if (uuidMatch) return uuidMatch[0];

    // If looking for a specific field (e.g., 'version'), try to extract from JSON
    if (fieldName) {
      const json = JSON.stringify(condition);
      const fieldMatch = json.match(new RegExp(`"${fieldName}"\\s*:\\s*"?([^",}]+)"?`));
      if (fieldMatch) return fieldMatch[1];
    }

    return undefined;
  } catch {
    return undefined;
  }
}

// =============================================================================
// TEST SUITE: requireAdminAccess OR Logic
// =============================================================================

describe('requireAdminAccess OR logic (AUTH-006 bugfix)', () => {
  // These routes use requireAdminAccess
  const ADMIN_ROUTES = [
    { path: '/api/health/detailed', method: 'GET' },
    { path: '/api/portfolio/templates/overrides', method: 'POST' },
    { path: '/api/mail/providers/google/selectors', method: 'POST' },
  ];

  describe('Allowlisted Cloudflare Access identity is no longer sufficient (TB-1)', () => {
    for (const route of ADMIN_ROUTES) {
      it(`${route.method} ${route.path} - rejected with only CF identity`, async () => {
        process.env.ADMIN_EMAILS = 'internal@cloudflare.com';
        const app = new Hono<Env>();
        app.use('*', async (c, next) => {
          c.set('db', createMockDb() as Env['Variables']['db']);
          c.set('tenantId', 'tenant-1');
          c.set('actorId', 'user-1');
          // No actorEmail set — only CF header, which no longer grants admin (TB-1).
          await next();
        });
        app.route('/api', apiRoutes);

        const res = await app.request(route.path, {
          method: route.method,
          headers: {
            'CF-Access-Authenticated-User-Email': 'internal@cloudflare.com',
            'CF-Access-Authenticated-User-Id': 'cf-admin-id',
          },
        });

        // CF-Access headers are forgeable and no longer grant admin (TB-1).
        expect(res.status).toBe(403);
      });
    }
  });

  describe('actorEmail requires ADMIN_EMAILS allowlist (no CF header)', () => {
    for (const route of ADMIN_ROUTES) {
      it(`${route.method} ${route.path} - blocks non-admin actorEmail`, async () => {
        const app = new Hono<Env>();
        app.use('*', async (c, next) => {
          c.set('db', createMockDb() as Env['Variables']['db']);
          c.set('tenantId', 'tenant-1');
          c.set('actorId', 'user-1');
          c.set('actorEmail', 'user@company.com');
          await next();
        });
        app.route('/api', apiRoutes);

        const res = await app.request(route.path, { method: route.method });

        expect(res.status).toBe(403);
      });

      it(`${route.method} ${route.path} - passes with ADMIN_EMAILS allowlist`, async () => {
        process.env.ADMIN_EMAILS = 'admin@company.com';
        const app = new Hono<Env>();
        app.use('*', async (c, next) => {
          c.set('db', createMockDb() as Env['Variables']['db']);
          c.set('tenantId', 'tenant-1');
          c.set('actorId', 'user-1');
          c.set('actorEmail', 'admin@company.com');
          await next();
        });
        app.route('/api', apiRoutes);

        const res = await app.request(route.path, { method: route.method });

        expect(res.status).not.toBe(403);
      });
    }
  });

  describe('Neither CF header nor admin allowlist requires other credentials', () => {
    for (const route of ADMIN_ROUTES) {
      it(`${route.method} ${route.path} - blocked without CF header and without actorEmail`, async () => {
        const app = new Hono<Env>();
        app.use('*', async (c, next) => {
          c.set('db', createMockDb() as Env['Variables']['db']);
          c.set('tenantId', 'tenant-1');
          c.set('actorId', 'user-1');
          // No actorEmail, no CF header
          await next();
        });
        app.route('/api', apiRoutes);

        const res = await app.request(route.path, { method: route.method });

        // Should be 403 - requires one of CF header, ADMIN_EMAILS match, INTERNAL_SECRET, or X-Dev-Actor
        expect(res.status).toBe(403);
      });
    }
  });

  describe('X-Internal-Secret satisfies admin access after route auth context exists', () => {
    for (const route of ADMIN_ROUTES) {
      it(`${route.method} ${route.path} - passes with internal secret`, async () => {
        process.env.INTERNAL_SECRET = 'super-secret-123';
        const app = new Hono<Env>();
        app.use('*', async (c, next) => {
          c.set('db', createMockDb() as Env['Variables']['db']);
          c.set('tenantId', 'tenant-1');
          c.set('actorId', 'internal-service');
          // No actorEmail, no CF header
          await next();
        });
        app.route('/api', apiRoutes);

        const res = await app.request(route.path, {
          method: route.method,
          headers: { 'X-Internal-Secret': 'super-secret-123' },
        });

        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
        process.env.INTERNAL_SECRET = undefined;
      });
    }

    it('GET /api/health/detailed accepts internal secret without user context', async () => {
      process.env.INTERNAL_SECRET = 'super-secret-123';
      const app = new Hono<Env>();
      app.use('*', async (c, next) => {
        c.set('db', createMockDb() as Env['Variables']['db']);
        await next();
      });
      app.route('/api', apiRoutes);

      const res = await app.request('/api/health/detailed', {
        headers: { 'X-Internal-Secret': 'super-secret-123' },
      });

      expect(res.status).toBe(200);
      process.env.INTERNAL_SECRET = undefined;
    });
  });

  describe('X-Dev-Actor header in development grants admin', () => {
    it('GET /api/health/detailed - passes with X-Dev-Actor', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const app = new Hono<Env>();
      app.use('*', async (c, next) => {
        c.set('db', createMockDb() as Env['Variables']['db']);
        c.set('tenantId', 'tenant-1');
        c.set('actorId', 'user-1');
        // No actorEmail, no CF header
        await next();
      });
      app.route('/api', apiRoutes);

      const res = await app.request('/api/health/detailed', {
        method: 'GET',
        headers: { 'X-Dev-Actor': 'true' },
      });

      expect(res.status).not.toBe(403);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('X-Test-Admin header in test mode grants admin', () => {
    it('GET /api/health/detailed - passes with X-Test-Admin in test mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const app = new Hono<Env>();
      app.use('*', async (c, next) => {
        c.set('db', createMockDb() as Env['Variables']['db']);
        c.set('tenantId', 'tenant-1');
        c.set('actorId', 'user-1');
        // No actorEmail, no CF header
        await next();
      });
      app.route('/api', apiRoutes);

      const res = await app.request('/api/health/detailed', {
        method: 'GET',
        headers: { 'X-Test-Admin': 'true' },
      });

      expect(res.status).not.toBe(403);
      process.env.NODE_ENV = originalEnv;
    });
  });
});

// =============================================================================
// TEST SUITE: Full auth chain hardening regressions
// =============================================================================

describe('Full API auth chain hardening regressions', () => {
  const TENANT_UUID = '00000000-0000-4000-8000-000000000001';

  it('rejects forged legacy email:tenant cookies before admin routes', async () => {
    const app = createAuthedApiApp(createMockDb());

    const res = await app.request('/api/health/detailed', {
      headers: {
        Cookie: `dns_ops_session=${encodeURIComponent('attacker@example.com:example.com')}`,
      },
    });

    expect(res.status).toBe(401);
  });

  it('rejects non-admin database-session users (CF email header ignored, TB-1)', async () => {
    const app = createAuthedApiApp(createSessionDb('user@example.com', TENANT_UUID));

    const res = await app.request('/api/health/detailed', {
      headers: {
        Cookie: 'dns_ops_session=valid-db-token',
        'CF-Access-Authenticated-User-Email': 'admin@example.com',
      },
    });

    expect(res.status).toBe(403);
  });

  it('allows database-session admins from runtime ADMIN_EMAILS bindings', async () => {
    const app = createAuthedApiApp(createSessionDb('admin@example.com', TENANT_UUID));

    const res = await app.request(
      '/api/health/detailed',
      { headers: { Cookie: 'dns_ops_session=valid-db-token' } },
      { ADMIN_EMAILS: 'admin@example.com' }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; checks?: unknown };
    expect(body.status).toBe('healthy');
    expect(body.checks).toBeDefined();
  });
});

// =============================================================================
// TEST SUITE: Findings Routes Auth Enforcement
// =============================================================================

describe('Findings routes requireAuth enforcement (AUTH-006 bugfix)', () => {
  const TENANT_A = 'tenant-a';
  const TENANT_B = 'tenant-b';
  const DOMAIN_ID = 'domain-001';
  const SNAPSHOT_ID = 'snapshot-001';
  const FINDING_ID = 'finding-001';

  const domains = [
    {
      id: DOMAIN_ID,
      name: 'example.com',
      normalizedName: 'example.com',
      zoneManagement: 'managed' as const,
      tenantId: TENANT_A,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const snapshots = [
    {
      id: SNAPSHOT_ID,
      domainId: DOMAIN_ID,
      domainName: 'example.com',
      resultState: 'complete' as const,
      zoneManagement: 'managed' as const,
      tenantId: TENANT_A,
      createdAt: new Date(),
      rulesetVersionId: null,
    },
  ];

  const findings = [
    {
      id: FINDING_ID,
      snapshotId: SNAPSHOT_ID,
      type: 'mail.no-spf-record',
      title: 'No SPF record',
      severity: 'high',
      confidence: 'high',
      riskPosture: 'risk',
      blastRadius: 'medium',
      reviewOnly: false,
      evidence: [],
      ruleId: 'spf-rule',
      ruleVersion: '1.0.0',
      rulesetVersionId: null,
      createdAt: new Date(),
    },
  ];

  function createFindingsApp(options: { tenantId?: string; includeAuth?: boolean } = {}) {
    const { tenantId = TENANT_A, includeAuth = true } = options;
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', createMockDb(domains, snapshots, findings) as Env['Variables']['db']);
      if (includeAuth) {
        c.set('tenantId', tenantId);
        c.set('actorId', 'test-actor');
        c.set('actorEmail', 'test@example.com');
      }
      await next();
    });
    app.route('/api', findingsRoutes);
    return app;
  }

  describe('GET /api/snapshot/:snapshotId/findings - requires auth', () => {
    it('returns 401 without auth context', async () => {
      const app = createFindingsApp({ includeAuth: false });
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/findings`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for cross-tenant snapshot', async () => {
      const app = createFindingsApp({ tenantId: TENANT_B });
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/findings`);
      // Tenant isolation returns 404 (not 403 to avoid leaking existence)
      expect(res.status).toBe(404);
    });

    it('returns data for authenticated tenant-a request (not 401)', async () => {
      const app = createFindingsApp({ tenantId: TENANT_A });
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/findings`);
      // Should NOT be 401 — auth is satisfied
      // May be 200 (data), 500 (rules engine mock), etc. — but NOT 401
      expect(res.status).not.toBe(401);
    });
  });

  describe('GET /api/snapshot/:snapshotId/findings/mail - requires auth', () => {
    it('returns 401 without auth context', async () => {
      const app = createFindingsApp({ includeAuth: false });
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/findings/mail`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for cross-tenant snapshot', async () => {
      const app = createFindingsApp({ tenantId: TENANT_B });
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/findings/mail`);
      expect(res.status).toBe(404);
    });

    it('returns non-401 for authenticated tenant', async () => {
      const app = createFindingsApp({ tenantId: TENANT_A });
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/findings/mail`);
      expect(res.status).not.toBe(401);
    });
  });

  describe('GET /api/findings/:findingId - requires auth', () => {
    it('returns 401 without auth context', async () => {
      const app = createFindingsApp({ includeAuth: false });
      const res = await app.request(`/api/findings/${FINDING_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for cross-tenant finding', async () => {
      const app = createFindingsApp({ tenantId: TENANT_B });
      const res = await app.request(`/api/findings/${FINDING_ID}`);
      expect(res.status).toBe(404);
    });

    it('returns non-401 for authenticated tenant', async () => {
      const app = createFindingsApp({ tenantId: TENANT_A });
      const res = await app.request(`/api/findings/${FINDING_ID}`);
      expect(res.status).not.toBe(401);
    });
  });

  describe('GET /api/snapshot/:snapshotId/findings/summary - requires auth', () => {
    it('returns 401 without auth context', async () => {
      const app = createFindingsApp({ includeAuth: false });
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/findings/summary`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for cross-tenant snapshot', async () => {
      const app = createFindingsApp({ tenantId: TENANT_B });
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/findings/summary`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/findings/backfill - requires auth', () => {
    it('returns 401 without auth context', async () => {
      const app = createFindingsApp({ includeAuth: false });
      const res = await app.request('/api/findings/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/findings/backfill/status - requires auth', () => {
    it('returns 401 without auth context', async () => {
      const app = createFindingsApp({ includeAuth: false });
      const res = await app.request('/api/findings/backfill/status');
      expect(res.status).toBe(401);
    });
  });
});

// =============================================================================
// TEST SUITE: Backfill Cross-Tenant Isolation (return vs continue bug)
// =============================================================================

describe('Backfill cross-tenant isolation (loop bugfix)', () => {
  const TENANT_A = 'tenant-a';
  const TENANT_B = 'tenant-b';

  const domainTenantA = {
    id: 'domain-a',
    name: 'mine.example.com',
    normalizedName: 'mine.example.com',
    zoneManagement: 'managed' as const,
    tenantId: TENANT_A,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const domainTenantB = {
    id: 'domain-b',
    name: 'theirs.example.com',
    normalizedName: 'theirs.example.com',
    zoneManagement: 'managed' as const,
    tenantId: TENANT_B,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const snapshotA = {
    id: 'snap-a',
    domainId: 'domain-a',
    domainName: 'mine.example.com',
    resultState: 'complete' as const,
    zoneManagement: 'managed' as const,
    tenantId: TENANT_A,
    createdAt: new Date(),
    rulesetVersionId: null,
  };

  const snapshotB = {
    id: 'snap-b',
    domainId: 'domain-b',
    domainName: 'theirs.example.com',
    resultState: 'complete' as const,
    zoneManagement: 'managed' as const,
    tenantId: TENANT_B,
    createdAt: new Date(),
    rulesetVersionId: null,
  };

  function createBackfillApp(tenantId: string) {
    // Create a specialized DB mock for backfill that properly handles:
    // - db.select(snapshots) used by countNeedingBackfill/findNeedingBackfill
    // - findByVersion used by ensureRulesetVersion
    // - insert used by create ruleset version
    const localSnapshots = [snapshotA, snapshotB];
    const localDomains = [domainTenantA, domainTenantB];
    const localRulesetVersions = [
      {
        id: 'rs-1',
        version: '1.2.0',
        name: 'DNS and Mail Rules',
        active: true,
        createdBy: 'system',
        createdAt: new Date(),
        description: '',
      },
    ];

    const backfillDb = {
      ...createMockDb(localDomains, localSnapshots, [], localRulesetVersions),
      // Override select to return snapshots (needed by findNeedingBackfill)
      select: vi.fn().mockImplementation((table: unknown) => {
        // Inline table name extraction (avoid closure issue with getTableName)
        let tableName = '';
        try {
          const symbols = Object.getOwnPropertySymbols(table as object);
          const drizzleName = symbols.find((s) => String(s).includes('drizzle:Name'));
          if (drizzleName) {
            const val = (table as Record<symbol, unknown>)[drizzleName];
            if (typeof val === 'string') tableName = val;
          }
        } catch {
          /* ignore */
        }
        if (tableName === 'snapshots') return Promise.resolve([...localSnapshots]);
        if (tableName === 'domains') return Promise.resolve([...localDomains]);
        return Promise.resolve([]);
      }),
    } as unknown as IDatabaseAdapter;

    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', backfillDb as Env['Variables']['db']);
      c.set('tenantId', tenantId);
      c.set('actorId', 'actor-1');
      c.set('actorEmail', 'test@example.com');
      await next();
    });
    app.route('/api', apiRoutes);
    return app;
  }

  it('processes batch even when cross-tenant snapshots exist (not return-early)', async () => {
    // Tenant A backfills — snap-B (tenant B) should be SKIPPED, not STOP the batch
    const app = createBackfillApp(TENANT_A);
    const res = await app.request('/api/findings/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false }),
    });

    const body = (await res.json()) as {
      processed?: number;
      success?: number;
      results?: Array<{ snapshotId: string; status: string; error?: string }>;
    };

    // CRITICAL: The batch should NOT have been aborted by cross-tenant snapshot.
    // If the old "return" bug exists, processed=0 because the loop exits on snap-B.
    // Correct behavior: processed > 0 (snap-B is skipped, batch continues).
    expect(res.status).toBe(200);
    expect(body.processed ?? 0).toBeGreaterThan(0);
  });

  it('includes cross-tenant snapshots in results with error (not excluded)', async () => {
    const app = createBackfillApp(TENANT_A);
    const res = await app.request('/api/findings/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const body = (await res.json()) as {
      success?: number;
      errors?: number;
      results?: Array<{ snapshotId: string; status: string; error?: string }>;
    };

    expect(res.status).toBe(200);

    // snap-B (cross-tenant) must appear in results (not excluded by return-early)
    const crossTenantResult = body.results?.find((r) => r.snapshotId === 'snap-b');
    expect(crossTenantResult).toBeDefined();
    expect(crossTenantResult?.status).toBe('error');
    expect(crossTenantResult?.error).toMatch(/cross-tenant|denied|not found/i);
  });

  it('marks cross-tenant snapshots as error status (not success)', async () => {
    const app = createBackfillApp(TENANT_A);
    const res = await app.request('/api/findings/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const body = (await res.json()) as {
      results?: Array<{ snapshotId: string; status: string }>;
    };

    const crossTenantResult = body.results?.find((r) => r.snapshotId === 'snap-b');
    // Must be 'error', NOT 'success' (which would happen if cross-tenant was skipped silently)
    expect(crossTenantResult?.status).toBe('error');
  });

  it('dryRun returns stats without processing', async () => {
    const app = createBackfillApp(TENANT_A);
    const res = await app.request('/api/findings/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true }),
    });

    const body = (await res.json()) as { dryRun?: boolean; stats?: { needsBackfill?: number } };

    expect(res.status).toBe(200);
    expect(body.dryRun).toBe(true);
  });
});

// =============================================================================
// TEST SUITE: Domain Normalization Consistency
// =============================================================================

describe('Domain normalization consistency (CONTRACT-001)', () => {
  it('isValidDomain and normalizeDomain agree on valid ASCII domains', async () => {
    const { isValidDomain, normalizeDomain } = await import('@dns-ops/parsing');

    const validAscii = [
      'example.com',
      'sub.example.com',
      'deep.sub.example.com',
      'example123.com',
      '123.example.com',
      'localhost',
      'a.io',
    ];

    for (const domain of validAscii) {
      expect(isValidDomain(domain), `"${domain}" should be valid`).toBe(true);
      expect(() => normalizeDomain(domain), `"${domain}" normalize should not throw`).not.toThrow();
    }
  });

  it('isValidDomain and normalizeDomain agree on valid IDN domains', async () => {
    const { isValidDomain, normalizeDomain } = await import('@dns-ops/parsing');

    const validIdn = ['münchen.de', 'café.com', '神社.jp', '中文网.cn', 'münchen.de.', 'CAFÉ.COM'];

    for (const domain of validIdn) {
      expect(isValidDomain(domain), `"${domain}" should be valid`).toBe(true);
      const result = normalizeDomain(domain);
      expect(result.unicode, `"${domain}" unicode should be defined`).toBeDefined();
      expect(result.punycode, `"${domain}" punycode should be defined`).toBeDefined();
      expect(result.normalized, `"${domain}" normalized should be defined`).toBeDefined();
    }
  });

  it('isValidDomain trims whitespace (matches normalizeDomain behavior)', async () => {
    const { isValidDomain, normalizeDomain } = await import('@dns-ops/parsing');

    // These are valid after trimming
    const whitespaceCases = [
      { input: '  example.com', expected: 'example.com' },
      { input: 'example.com  ', expected: 'example.com' },
      { input: '  example.com  ', expected: 'example.com' },
      { input: '\texample.com\n', expected: 'example.com' },
    ];

    for (const { input, expected } of whitespaceCases) {
      const isValidResult = isValidDomain(input);
      let threw = false;
      let normalized = '';
      try {
        normalized = normalizeDomain(input).normalized;
      } catch {
        threw = true;
      }

      // If normalize succeeds, isValidDomain must also succeed
      if (!threw) {
        expect(
          isValidResult,
          `"${JSON.stringify(input)}" isValidDomain should match normalizeDomain`
        ).toBe(true);
        expect(normalized).toBe(expected);
      }
    }
  });

  it('isValidDomain and normalizeDomain reject the same invalid domains', async () => {
    const { isValidDomain, normalizeDomain } = await import('@dns-ops/parsing');

    const invalidDomains = [
      '',
      '   ',
      'exam ple.com',
      '-example.com',
      'example-.com',
      'example..com',
      'exam!ple.com',
      `${'a'.repeat(64)}.com`,
      `${'a'.repeat(250)}.com`,
    ];

    for (const domain of invalidDomains) {
      const isValidResult = isValidDomain(domain);
      let threw = false;
      try {
        normalizeDomain(domain);
      } catch {
        threw = true;
      }

      // At least one must reject it
      expect(
        !isValidResult || threw,
        `"${domain.slice(0, 30)}" should be rejected by at least one of isValidDomain/normalizeDomain`
      ).toBe(true);
    }
  });

  it('normalizeDomain returns consistent normalized form', async () => {
    const { normalizeDomain } = await import('@dns-ops/parsing');

    const cases = [
      { input: 'EXAMPLE.COM', expected: 'example.com' },
      { input: 'Example.Com', expected: 'example.com' },
      { input: 'example.com.', expected: 'example.com' },
      { input: '  example.com  ', expected: 'example.com' },
      { input: 'münchen.de', expected: 'xn--mnchen-3ya.de' },
      { input: 'xn--MNCHEN-3YA.DE', expected: 'xn--mnchen-3ya.de' },
    ];

    for (const { input, expected } of cases) {
      const result = normalizeDomain(input);
      expect(result.normalized, `"${input}" → "${expected}"`).toBe(expected);
      expect(result.punycode, `"${input}" punycode should equal normalized`).toBe(expected);
    }
  });

  it('tryNormalizeDomain returns null for invalid domains', async () => {
    const { tryNormalizeDomain } = await import('@dns-ops/parsing');

    expect(tryNormalizeDomain('')).toBeNull();
    expect(tryNormalizeDomain('exam!le.com')).toBeNull();
    expect(tryNormalizeDomain('exam ple.com')).toBeNull();
    expect(tryNormalizeDomain('example.com')).not.toBeNull();
    expect(tryNormalizeDomain('münchen.de')).not.toBeNull();
    expect(tryNormalizeDomain('example..com')).toBeNull();
    expect(tryNormalizeDomain('-example.com')).toBeNull();
  });

  it('isValidDomain rejects domains exceeding 253 characters', async () => {
    const { isValidDomain } = await import('@dns-ops/parsing');
    expect(isValidDomain(`${'a'.repeat(250)}.com`)).toBe(false);
  });

  it('isValidDomain rejects labels exceeding 63 characters', async () => {
    const { isValidDomain } = await import('@dns-ops/parsing');
    expect(isValidDomain(`${'a'.repeat(64)}.com`)).toBe(false);
  });

  it('isValidDomain accepts punycode domains', async () => {
    const { isValidDomain } = await import('@dns-ops/parsing');
    expect(isValidDomain('xn--mnchen-3ya.de')).toBe(true);
    expect(isValidDomain('XN--MNCHEN-3YA.DE')).toBe(true);
  });
});

// =============================================================================
// TEST SUITE: Delegation Route Auth
// =============================================================================

describe('Delegation routes requireAuth enforcement', () => {
  const DOMAIN_ID = 'domain-001';
  const SNAPSHOT_ID = 'snapshot-001';
  const TENANT_A = 'tenant-a';
  const TENANT_B = 'tenant-b';

  const domains = [
    {
      id: DOMAIN_ID,
      name: 'example.com',
      normalizedName: 'example.com',
      zoneManagement: 'managed' as const,
      tenantId: TENANT_A,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const snapshots = [
    {
      id: SNAPSHOT_ID,
      domainId: DOMAIN_ID,
      domainName: 'example.com',
      resultState: 'complete' as const,
      zoneManagement: 'managed' as const,
      tenantId: TENANT_A,
      createdAt: new Date(),
      metadata: { hasDelegationData: true },
    },
  ];

  function createDelegationApp(tenantId?: string, includeAuth = true) {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', createMockDb(domains, snapshots, []) as Env['Variables']['db']);
      if (includeAuth) {
        c.set('tenantId', tenantId ?? TENANT_A);
        c.set('actorId', 'actor-1');
        c.set('actorEmail', 'test@example.com');
      }
      await next();
    });

    app.route('/api', delegationRoutes);
    return app;
  }

  describe('GET /api/snapshot/:snapshotId/delegation', () => {
    it('returns 401 without auth', async () => {
      const app = createDelegationApp(undefined, false);
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for cross-tenant snapshot', async () => {
      const app = createDelegationApp(TENANT_B);
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation`);
      expect(res.status).toBe(404);
    });

    it('returns non-401 for authorized tenant', async () => {
      const app = createDelegationApp(TENANT_A);
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation`);
      expect(res.status).not.toBe(401);
    });
  });

  describe('GET /api/snapshot/:snapshotId/delegation/dnssec', () => {
    it('returns 401 without auth', async () => {
      const app = createDelegationApp(undefined, false);
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/dnssec`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for cross-tenant snapshot', async () => {
      const app = createDelegationApp(TENANT_B);
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/dnssec`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/snapshot/:snapshotId/delegation/issues', () => {
    it('returns 401 without auth', async () => {
      const app = createDelegationApp(undefined, false);
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/issues`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/snapshot/:snapshotId/delegation/evidence', () => {
    it('returns 401 without auth', async () => {
      const app = createDelegationApp(undefined, false);
      const res = await app.request(`/api/snapshot/${SNAPSHOT_ID}/delegation/evidence`);
      expect(res.status).toBe(401);
    });
  });
});

// =============================================================================
// TEST SUITE: Suggestions Route Auth
// =============================================================================

describe('Suggestions routes auth enforcement', () => {
  /**
   * Creates a test app with optional auth context.
   * Use omitActorId: true to test missing actorId scenario (bypasses JS default parameter).
   */
  function createSuggestionsApp(
    options: { actorId?: string; includeAuth?: boolean; omitActorId?: boolean } = {}
  ) {
    const { actorId = 'test-actor', includeAuth = true, omitActorId = false } = options;
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', createMockDb() as Env['Variables']['db']);
      if (includeAuth) {
        c.set('tenantId', 'tenant-1');
        // Only set actorId if not omitted - this tests missing actorId vs undefined
        if (!omitActorId) {
          c.set('actorId', actorId as string);
        }
        c.set('actorEmail', 'test@example.com');
      }
      await next();
    });

    // Mount through apiRoutes so /suggestions prefix is correct
    app.route('/api', apiRoutes);
    return app;
  }

  describe('PATCH /api/suggestions/:suggestionId/apply', () => {
    it('returns 401 without actorId in context', async () => {
      // Use omitActorId to truly test missing actorId (not undefined which triggers default)
      const app = createSuggestionsApp({ omitActorId: true, includeAuth: true });
      const res = await app.request('/api/suggestions/sug-001/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it('returns 401 without any auth context at all', async () => {
      const app = createSuggestionsApp({ includeAuth: false });
      const res = await app.request('/api/suggestions/sug-001/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/suggestions/:suggestionId/dismiss', () => {
    it('returns 401 without actorId in context', async () => {
      const app = createSuggestionsApp({ omitActorId: true, includeAuth: true });
      const res = await app.request('/api/suggestions/sug-001/dismiss', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });
});

// =============================================================================
// TEST SUITE: Alerts Shared Report Auth
// =============================================================================

describe('Alerts shared report auth (AUTH-005)', () => {
  function createAlertsApp(options: { actorId?: string; includeAuth?: boolean } = {}) {
    const { actorId = 'test-actor', includeAuth = true } = options;
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', createMockDb() as Env['Variables']['db']);
      if (includeAuth) {
        c.set('tenantId', 'tenant-1');
        c.set('actorId', actorId as string);
        c.set('actorEmail', 'test@example.com');
      }
      await next();
    });

    app.route('/api/alerts', alertRoutes);
    return app;
  }

  describe('GET /api/alerts/reports/shared/:token - public route', () => {
    it('allows access without auth (public route)', async () => {
      const app = createAlertsApp({ includeAuth: false });
      const res = await app.request('/api/alerts/reports/shared/nonexistent-token');
      // Should NOT be 401 — public route
      expect([401, 403]).not.toContain(res.status);
    });

    it('returns 404 for nonexistent token', async () => {
      const app = createAlertsApp({ includeAuth: false });
      const res = await app.request('/api/alerts/reports/shared/nonexistent-token');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/alerts/reports - requires write permission', () => {
    it('returns 401 without auth', async () => {
      const app = createAlertsApp({ includeAuth: false });
      const res = await app.request('/api/alerts/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 for system actor (no write permission)', async () => {
      const app = createAlertsApp({ actorId: 'system' });
      const res = await app.request('/api/alerts/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('returns 403 for unknown actor (no write permission)', async () => {
      const app = createAlertsApp({ actorId: 'unknown' });
      const res = await app.request('/api/alerts/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });
  });
});

// =============================================================================
// TEST SUITE: requireWritePermission Blocks System Actor
// =============================================================================

describe('requireWritePermission blocks system/unknown actors', () => {
  const WRITE_ROUTES = [
    { path: '/api/collect/domain', method: 'POST', body: { domain: 'example.com' } },
    { path: '/api/alerts/reports', method: 'POST', body: { title: 'Test Report' } },
  ];

  for (const route of WRITE_ROUTES) {
    it(`${route.method} ${route.path} - blocks 'system' actor with 403`, async () => {
      const app = new Hono<Env>();
      app.use('*', async (c, next) => {
        c.set('db', createMockDb() as Env['Variables']['db']);
        c.set('tenantId', 'tenant-1');
        c.set('actorId', 'system'); // System actor — should be blocked
        c.set('actorEmail', 'system@internal');
        await next();
      });
      app.route('/api', apiRoutes);

      const res = await app.request(route.path, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(route.body),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Forbidden');
    });

    it(`${route.method} ${route.path} - blocks 'unknown' actor with 403`, async () => {
      const app = new Hono<Env>();
      app.use('*', async (c, next) => {
        c.set('db', createMockDb() as Env['Variables']['db']);
        c.set('tenantId', 'tenant-1');
        c.set('actorId', 'unknown');
        c.set('actorEmail', 'unknown@internal');
        await next();
      });
      app.route('/api', apiRoutes);

      const res = await app.request(route.path, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(route.body),
      });

      expect(res.status).toBe(403);
    });

    it(`${route.method} ${route.path} - allows valid user actor (not 403)`, async () => {
      const app = new Hono<Env>();
      app.use('*', async (c, next) => {
        c.set('db', createMockDb() as Env['Variables']['db']);
        c.set('tenantId', 'tenant-1');
        c.set('actorId', 'user-123');
        c.set('actorEmail', 'user@example.com');
        await next();
      });
      app.route('/api', apiRoutes);

      const res = await app.request(route.path, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(route.body),
      });

      // Should NOT be 403 - valid user passes write permission check
      expect(res.status).not.toBe(403);
    });
  }
});

// =============================================================================
// TEST SUITE: Findings PATCH Routes Auth
// =============================================================================

describe('Findings PATCH routes require write permission', () => {
  const FINDING_ID = 'finding-001';

  function createFindingsPatchApp(options: { actorId?: string } = {}) {
    const { actorId = 'test-actor' } = options;
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', createMockDb([], [], []) as Env['Variables']['db']);
      c.set('tenantId', 'tenant-1');
      c.set('actorId', actorId as string);
      c.set('actorEmail', 'test@example.com');
      await next();
    });
    // Mount via apiRoutes to get correct route mounting
    app.route('/api', apiRoutes);
    return app;
  }

  describe('PATCH /api/findings/:findingId/acknowledge', () => {
    it('returns 403 for system actor', async () => {
      const app = createFindingsPatchApp({ actorId: 'system' });
      const res = await app.request(`/api/findings/${FINDING_ID}/acknowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('returns 403 for unknown actor', async () => {
      const app = createFindingsPatchApp({ actorId: 'unknown' });
      const res = await app.request(`/api/findings/${FINDING_ID}/acknowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('allows valid user actor', async () => {
      const app = createFindingsPatchApp({ actorId: 'user-123' });
      const res = await app.request(`/api/findings/${FINDING_ID}/acknowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).not.toBe(403);
    });
  });

  describe('PATCH /api/findings/:findingId/false-positive', () => {
    it('returns 403 for system actor', async () => {
      const app = createFindingsPatchApp({ actorId: 'system' });
      const res = await app.request(`/api/findings/${FINDING_ID}/false-positive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('allows valid user actor', async () => {
      const app = createFindingsPatchApp({ actorId: 'user-123' });
      const res = await app.request(`/api/findings/${FINDING_ID}/false-positive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).not.toBe(403);
    });
  });
});
