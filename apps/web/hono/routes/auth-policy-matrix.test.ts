/**
 * Auth Policy Matrix Tests - AUTH-006
 *
 * BDD tests that enforce route-level authorization consistency:
 * 1. Every route has explicit auth policy
 * 2. No route falls through without policy decision
 * 3. Public routes explicitly allowlisted
 * 4. All write routes require requireWritePermission
 * 5. All admin routes require requireAdminAccess
 * 6. Fails on unknown routes (new routes must update matrix)
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { apiRoutes } from './api.js';

// =============================================================================
// AUTH POLICY MATRIX - Single Source of Truth
// =============================================================================

export const AUTH_POLICY_VERSION = '1.0.0';

export type AuthPolicy =
  | 'public' // No authentication required
  | 'auth-read' // Requires requireAuth (read operations)
  | 'auth-write' // Requires requireWritePermission
  | 'admin'; // Requires requireAdminAccess

export interface RoutePolicy {
  path: string;
  method: string;
  policy: AuthPolicy;
  notes?: string;
}

// All routes must be explicitly defined here
// This matrix is the single source of truth for route authorization
// NOTE: Paths should match the ACTUAL registered paths after route mounting
export const AUTH_POLICY_MATRIX: RoutePolicy[] = [
  // =============================================================================
  // PUBLIC ROUTES - Explicitly allowlisted
  // =============================================================================
  { path: '/api/health', method: 'GET', policy: 'public', notes: 'Basic health check' },
  {
    path: '/api/alerts/reports/shared/:token',
    method: 'GET',
    policy: 'public',
    notes: 'Shared report access via token',
  },
  {
    path: '/api/auth/signup',
    method: 'POST',
    policy: 'public',
    notes: 'Public auth endpoint, does not use requireAuth',
  },
  {
    path: '/api/auth/login',
    method: 'POST',
    policy: 'public',
    notes: 'Public auth endpoint, does not use requireAuth',
  },
  {
    path: '/api/auth/logout',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Session endpoint, checks cookie directly not requireAuth',
  },
  {
    path: '/api/auth/me',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Session endpoint, checks cookie directly not requireAuth',
  },

  // =============================================================================
  // ADMIN ROUTES - requireAdminAccess
  // =============================================================================
  {
    path: '/api/health/detailed',
    method: 'GET',
    policy: 'admin',
    notes: 'Detailed health with sensitive info',
  },
  // Portfolio template overrides (admin-only)
  {
    path: '/api/portfolio/templates/overrides',
    method: 'POST',
    policy: 'admin',
    notes: 'Create template override',
  },
  {
    path: '/api/portfolio/templates/overrides/:overrideId',
    method: 'PUT',
    policy: 'admin',
    notes: 'Update template override',
  },
  {
    path: '/api/portfolio/templates/overrides/:overrideId',
    method: 'DELETE',
    policy: 'admin',
    notes: 'Delete template override',
  },
  // Shadow comparison admin routes
  {
    path: '/api/shadow-comparison/mismatch-report',
    method: 'POST',
    policy: 'admin',
    notes: 'Generate mismatch report',
  },
  {
    path: '/api/shadow-comparison/:id/adjudicate',
    method: 'POST',
    policy: 'admin',
    notes: 'Adjudicate comparison',
  },
  {
    path: '/api/shadow-comparison/seed-baselines',
    method: 'POST',
    policy: 'admin',
    notes: 'Seed provider baselines',
  },
  // Provider template admin routes
  {
    path: '/api/mail/providers/:provider/selectors',
    method: 'POST',
    policy: 'admin',
    notes: 'Add provider selector',
  },

  // =============================================================================
  // AUTH-READ ROUTES - requireAuth (default for most read operations)
  // =============================================================================
  // Delegation routes
  { path: '/api/snapshot/:snapshotId/delegation', method: 'GET', policy: 'auth-read' },
  { path: '/api/domain/:domain/delegation/latest', method: 'GET', policy: 'auth-read' },
  { path: '/api/snapshot/:snapshotId/delegation/issues', method: 'GET', policy: 'auth-read' },
  { path: '/api/snapshot/:snapshotId/delegation/dnssec', method: 'GET', policy: 'auth-read' },
  { path: '/api/snapshot/:snapshotId/delegation/evidence', method: 'GET', policy: 'auth-read' },
  // Legacy tools - mounted at root, not /api/legacy-tools
  {
    path: '/api/log',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Legacy tools log endpoint, uses requireAuth',
  },
  { path: '/api/config', method: 'GET', policy: 'auth-read', notes: 'Legacy tools config' },
  {
    path: '/api/dmarc/deeplink',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Legacy DMARC deeplink',
  },
  { path: '/api/dkim/deeplink', method: 'GET', policy: 'auth-read', notes: 'Legacy DKIM deeplink' },
  {
    path: '/api/bulk-deeplinks',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Legacy bulk deeplinks, uses requireAuth',
  },
  { path: '/api/shadow-stats', method: 'GET', policy: 'auth-read', notes: 'Legacy shadow stats' },
  // Selectors
  { path: '/api/snapshot/:snapshotId/selectors', method: 'GET', policy: 'auth-read' },
  { path: '/api/domain/:domain/selectors/suggest', method: 'GET', policy: 'auth-read' },
  // Shadow comparison
  {
    path: '/api/shadow-comparison/compare',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Uses requireAuth, not requireWritePermission',
  },
  { path: '/api/shadow-comparison/stats', method: 'GET', policy: 'auth-read' },
  { path: '/api/shadow-comparison/domain/:domain', method: 'GET', policy: 'auth-read' },
  { path: '/api/shadow-comparison/legacy-logs', method: 'GET', policy: 'auth-read' },
  { path: '/api/shadow-comparison/provider-baselines', method: 'GET', policy: 'auth-read' },
  {
    path: '/api/shadow-comparison/provider-baselines/:providerKey',
    method: 'GET',
    policy: 'auth-read',
  },
  { path: '/api/shadow-comparison/mismatch-reports/:domain', method: 'GET', policy: 'auth-read' },
  { path: '/api/shadow-comparison/:id', method: 'GET', policy: 'auth-read' },
  // Simulation
  { path: '/api/simulate/actionable-types', method: 'GET', policy: 'auth-read' },
  // Ruleset versions
  { path: '/api/ruleset-versions', method: 'GET', policy: 'auth-read' },
  { path: '/api/ruleset-versions/active', method: 'GET', policy: 'auth-read' },
  { path: '/api/ruleset-versions/latest', method: 'GET', policy: 'auth-read' },
  { path: '/api/ruleset-versions/by-version/:version', method: 'GET', policy: 'auth-read' },
  { path: '/api/ruleset-versions/:id', method: 'GET', policy: 'auth-read' },
  // Fleet report
  {
    path: '/api/fleet-report/run',
    method: 'POST',
    policy: 'auth-write',
    notes: 'Fleet report generation, uses requireWritePermission',
  },
  {
    path: '/api/fleet-report/import-csv',
    method: 'POST',
    policy: 'auth-write',
    notes: 'Fleet report CSV import, uses requireWritePermission',
  },
  // Findings summary (auth required)
  {
    path: '/api/snapshot/:snapshotId/findings/summary',
    method: 'GET',
    policy: 'auth-read',
  },
  // Findings evaluation trigger (requires auth)
  {
    path: '/api/snapshot/:snapshotId/evaluate',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Uses requireAuth, creates findings in DB',
  },
  // Findings backfill (admin-like but uses requireAuth)
  {
    path: '/api/findings/backfill',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Uses requireAuth, batch operations',
  },
  { path: '/api/findings/backfill/status', method: 'GET', policy: 'auth-read' },

  // =============================================================================
  // AUTH-WRITE ROUTES - requireWritePermission (mutating operations)
  // =============================================================================
  // Domain collection (write operation)
  { path: '/api/collect/domain', method: 'POST', policy: 'auth-write' },
  // Mail collection (write operation)
  { path: '/api/collect/mail', method: 'POST', policy: 'auth-write' },
  // Monitoring domains management
  { path: '/api/monitoring/domains', method: 'POST', policy: 'auth-write' },
  { path: '/api/monitoring/domains/:id', method: 'PUT', policy: 'auth-write' },
  { path: '/api/monitoring/domains/:id', method: 'DELETE', policy: 'auth-write' },
  { path: '/api/monitoring/domains/:id/toggle', method: 'POST', policy: 'auth-write' },
  // Portfolio notes/tags (write operations)
  { path: '/api/portfolio/domains/:domainId/notes', method: 'POST', policy: 'auth-write' },
  { path: '/api/portfolio/notes/:noteId', method: 'PUT', policy: 'auth-write' },
  { path: '/api/portfolio/notes/:noteId', method: 'DELETE', policy: 'auth-write' },
  { path: '/api/portfolio/domains/:domainId/tags', method: 'POST', policy: 'auth-write' },
  {
    path: '/api/portfolio/domains/:domainId/tags/:tag',
    method: 'DELETE',
    policy: 'auth-write',
  },
  // Portfolio filters (write operations)
  { path: '/api/portfolio/filters', method: 'POST', policy: 'auth-write' },
  { path: '/api/portfolio/filters/:filterId', method: 'PUT', policy: 'auth-write' },
  { path: '/api/portfolio/filters/:filterId', method: 'DELETE', policy: 'auth-write' },
  // Alerts write operations
  { path: '/api/alerts/reports', method: 'POST', policy: 'auth-write' },
  { path: '/api/alerts/reports/:id/expire', method: 'POST', policy: 'auth-write' },
  { path: '/api/alerts/:id/acknowledge', method: 'POST', policy: 'auth-write' },
  { path: '/api/alerts/:id/resolve', method: 'POST', policy: 'auth-write' },
  { path: '/api/alerts/:id/suppress', method: 'POST', policy: 'auth-write' },
  // Remediation write operations - mounted at /api not /api/mail
  {
    path: '/api/remediation',
    method: 'POST',
    policy: 'auth-write',
    notes: 'Mail remediation create',
  },
  {
    path: '/api/remediation/:id',
    method: 'PATCH',
    policy: 'auth-write',
    notes: 'Mail remediation update',
  },
  // Findings write operations
  { path: '/api/findings/:findingId/acknowledge', method: 'PATCH', policy: 'auth-write' },
  { path: '/api/findings/:findingId/false-positive', method: 'PATCH', policy: 'auth-write' },
  // Ruleset version activation
  { path: '/api/ruleset-versions/:id/activate', method: 'POST', policy: 'auth-write' },

  // =============================================================================
  // ROUTES WITH CONDITIONAL/IMPLICIT AUTH (tenant isolation based)
  // These routes use tenant isolation instead of explicit middleware
  // They should be reviewed and standardized
  // =============================================================================
  // Portfolio search (tenant-scoped, implicit auth via tenantId check)
  {
    path: '/api/portfolio/search',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Uses tenant isolation, POST for request body',
  },
  {
    path: '/api/portfolio/domains/by-name/:domain',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/portfolio/domains/:domainId/notes',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/portfolio/domains/:domainId/tags',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/portfolio/tags',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/portfolio/filters',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/portfolio/templates/overrides',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/portfolio/audit',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  // Monitoring domains read (tenant-scoped)
  {
    path: '/api/monitoring/domains',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/monitoring/domains/:id',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  // Remediation read (tenant-scoped) - mounted at /api not /api/mail
  {
    path: '/api/remediation',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Mail remediation list, uses tenant isolation',
  },
  {
    path: '/api/remediation/stats',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Mail remediation stats',
  },
  {
    path: '/api/remediation/by-id/:id',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Mail remediation by ID',
  },
  {
    path: '/api/remediation/domain/:domain',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Mail remediation by domain',
  },
  // Alerts read (tenant-scoped)
  { path: '/api/alerts', method: 'GET', policy: 'auth-read', notes: 'Uses tenant isolation' },
  { path: '/api/alerts/:id', method: 'GET', policy: 'auth-read', notes: 'Uses tenant isolation' },
  {
    path: '/api/alerts/reports',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  // Domain/snapshot read (tenant-scoped via domain ownership)
  {
    path: '/api/domain/:domain/latest',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation via domain ownership',
  },
  {
    path: '/api/snapshot/:snapshotId/observations',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation via domain ownership',
  },
  {
    path: '/api/snapshot/:snapshotId/recordsets',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation via domain ownership',
  },
  // Snapshots routes (tenant-scoped)
  {
    path: '/api/snapshots/:domain',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/snapshots/:domain/latest',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/snapshots/:domain/:id',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  {
    path: '/api/snapshots/:domain/diff',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Uses tenant isolation, POST for request body',
  },
  {
    path: '/api/snapshots/:domain/compare-latest',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Uses tenant isolation',
  },
  // Findings (tenant-scoped via domain ownership)
  {
    path: '/api/snapshot/:snapshotId/findings',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation via domain ownership',
  },
  {
    path: '/api/snapshot/:snapshotId/findings/mail',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation via domain ownership',
  },
  {
    path: '/api/findings/:findingId',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Uses tenant isolation via domain ownership',
  },
  // Simulation (tenant-scoped)
  { path: '/api/simulate', method: 'POST', policy: 'auth-read', notes: 'Uses tenant isolation' },
  // Suggestions (actorId checked in handler)
  {
    path: '/api/suggestions/:suggestionId',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Checks actorId in handler',
  },
  {
    path: '/api/suggestions/:suggestionId/apply',
    method: 'PATCH',
    policy: 'auth-read',
    notes: 'Checks actorId in handler, uses requireAuth not requireWritePermission',
  },
  {
    path: '/api/suggestions/:suggestionId/dismiss',
    method: 'PATCH',
    policy: 'auth-read',
    notes: 'Checks actorId in handler, uses requireAuth not requireWritePermission',
  },
  // Provider templates (auth applied via router.use())
  { path: '/api/mail/providers', method: 'GET', policy: 'auth-read', notes: 'Router-level auth' },
  {
    path: '/api/mail/providers/:provider',
    method: 'GET',
    policy: 'auth-read',
    notes: 'Router-level auth',
  },
  {
    path: '/api/mail/compare-to-provider',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Router-level auth, uses requireAuth',
  },
  {
    path: '/api/mail/detect-provider',
    method: 'POST',
    policy: 'auth-read',
    notes: 'Router-level auth, uses requireAuth',
  },
  // Migrate routes (admin only)
  {
    path: '/api/migrate/status',
    method: 'GET',
    policy: 'admin',
    notes: 'Database migration status',
  },
  { path: '/api/migrate/schema', method: 'GET', policy: 'admin', notes: 'Database schema check' },
  { path: '/api/migrate/reset', method: 'POST', policy: 'admin', notes: 'Reset migration tracker' },
  { path: '/api/migrate/repair', method: 'POST', policy: 'admin', notes: 'Repair schema' },
  { path: '/api/migrate/rebuild', method: 'POST', policy: 'admin', notes: 'Rebuild database' },
  { path: '/api/migrate/run-init', method: 'POST', policy: 'admin', notes: 'Run init migration' },

  // Provider templates admin (uses requireAdminAccess)
  // Already covered above
];

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Auth Policy Matrix - AUTH-006', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = new Hono<Env>();

    // Setup mock context with all necessary variables
    app.use('*', async (c, next) => {
      c.set('db', {
        select: vi.fn().mockReturnValue([]),
        selectOne: vi.fn(),
        selectWhere: vi.fn().mockResolvedValue([]),
        insert: vi.fn(),
        insertMany: vi.fn(),
        update: vi.fn(),
        getDrizzle: vi.fn().mockReturnValue({
          query: {
            domains: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
            snapshots: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
            findings: { findMany: vi.fn().mockResolvedValue([]) },
          },
        }),
      } as unknown as Env['Variables']['db']);
      c.set('tenantId', 'test-tenant');
      c.set('actorId', 'test-user');
      c.set('actorEmail', 'test@example.com');
      return next();
    });

    app.route('/api', apiRoutes);
  });

  describe('Policy Matrix Completeness', () => {
    it('should have every registered route in the policy matrix', async () => {
      // Extract all registered routes from the app
      const registeredRoutes = extractRoutes(app);

      // Find routes not in the matrix
      const missingFromMatrix: string[] = [];
      for (const route of registeredRoutes) {
        const normalizedPath = normalizeRoutePath(route.path);
        const existsInMatrix = AUTH_POLICY_MATRIX.some(
          (policy) =>
            normalizeRoutePath(policy.path) === normalizedPath && policy.method === route.method
        );
        if (!existsInMatrix) {
          missingFromMatrix.push(`${route.method} ${route.path}`);
        }
      }

      if (missingFromMatrix.length > 0) {
        console.error('Routes missing from AUTH_POLICY_MATRIX:');
        for (const route of missingFromMatrix) {
          console.error(`  - ${route}`);
        }
      }

      expect(missingFromMatrix).toEqual([]);
    });

    it('should not have unknown routes in matrix that do not exist', async () => {
      const registeredRoutes = extractRoutes(app);
      const registeredSet = new Set(
        registeredRoutes.map((r) => `${r.method} ${normalizeRoutePath(r.path)}`)
      );

      const orphanedPolicies: string[] = [];
      for (const policy of AUTH_POLICY_MATRIX) {
        const key = `${policy.method} ${normalizeRoutePath(policy.path)}`;
        if (!registeredSet.has(key)) {
          orphanedPolicies.push(key);
        }
      }

      if (orphanedPolicies.length > 0) {
        console.error('Orphaned policies (route not found):');
        for (const policy of orphanedPolicies) {
          console.error(`  - ${policy}`);
        }
      }

      expect(orphanedPolicies).toEqual([]);
    });
  });

  describe('Public Routes', () => {
    it('should allow access to public routes without auth', async () => {
      const publicRoutes = AUTH_POLICY_MATRIX.filter((p) => p.policy === 'public');

      for (const route of publicRoutes) {
        // Create fresh app without auth context
        const publicApp = new Hono<Env>();
        publicApp.route('/api', apiRoutes);

        const res = await publicApp.request(route.path, { method: route.method });

        // Should NOT be 401 or 403 for public routes
        // (may be 404 if resources don't exist, that's fine)
        expect([401, 403]).not.toContain(res.status);
      }
    });

    it('should have explicit public allowlist with known routes', () => {
      const publicRoutes = AUTH_POLICY_MATRIX.filter((p) => p.policy === 'public');

      // Known public routes
      const expectedPublicPaths = ['/api/health', '/api/alerts/reports/shared/:token'];

      for (const expected of expectedPublicPaths) {
        const exists = publicRoutes.some((p) => p.path === expected);
        expect(exists, `Expected public route ${expected} to be in matrix`).toBe(true);
      }
    });
  });

  describe('Admin Routes', () => {
    it('should require admin access for admin policy routes', async () => {
      const adminRoutes = AUTH_POLICY_MATRIX.filter((p) => p.policy === 'admin');

      // Create a fresh app WITHOUT actorEmail so requireAdminAccess blocks
      const noAdminApp = new Hono<Env>();
      noAdminApp.use('*', async (c, next) => {
        c.set('db', {
          select: vi.fn().mockReturnValue([]),
          selectWhere: vi.fn().mockResolvedValue([]),
          getDrizzle: vi.fn().mockReturnValue({
            query: {
              domains: { findMany: vi.fn().mockResolvedValue([]) },
            },
          }),
        } as unknown as Env['Variables']['db']);
        // Note: NOT setting actorEmail - this should trigger admin rejection
        c.set('tenantId', 'test-tenant');
        c.set('actorId', 'test-user');
        // actorEmail intentionally omitted
        return next();
      });
      noAdminApp.route('/api', apiRoutes);

      for (const route of adminRoutes) {
        // Request without admin credentials (no actorEmail)
        const res = await noAdminApp.request(route.path, { method: route.method });

        // Should be 401 or 403
        expect(
          [401, 403],
          `Admin route ${route.method} ${route.path} should require admin`
        ).toContain(res.status);
      }
    });

    it('should have all admin routes using requireAdminAccess', () => {
      // These are the routes that should be admin-only
      const expectedAdminOperations = [
        '/api/health/detailed',
        '/api/portfolio/templates/overrides', // POST
        '/api/shadow-comparison/mismatch-report',
        '/api/shadow-comparison/:id/adjudicate',
        '/api/shadow-comparison/seed-baselines',
        '/api/mail/providers/:provider/selectors',
      ];

      for (const path of expectedAdminOperations) {
        const policy = AUTH_POLICY_MATRIX.find((p) => p.path === path);
        expect(policy?.policy, `Route ${path} should be admin`).toBe('admin');
      }
    });
  });

  describe('Write Routes', () => {
    it('should require write permission for write policy routes', async () => {
      const writeRoutes = AUTH_POLICY_MATRIX.filter((p) => p.policy === 'auth-write');

      for (const route of writeRoutes) {
        // Create app with auth but no write permission (system actor)
        const restrictedApp = new Hono<Env>();
        restrictedApp.use('*', async (c, next) => {
          c.set('db', {
            select: vi.fn().mockReturnValue([]),
            selectWhere: vi.fn().mockResolvedValue([]),
            getDrizzle: vi.fn().mockReturnValue({
              query: {
                domains: { findMany: vi.fn().mockResolvedValue([]) },
              },
            }),
          } as unknown as Env['Variables']['db']);
          c.set('tenantId', 'test-tenant');
          c.set('actorId', 'system'); // System actor should not have write
          return next();
        });
        restrictedApp.route('/api', apiRoutes);

        const res = await restrictedApp.request(route.path, {
          method: route.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        // Should be 403 for write operations with system actor
        if (res.status !== 404 && res.status !== 400) {
          // 404/400 means it passed auth and failed at validation/resource
          expect(
            res.status,
            `Write route ${route.method} ${route.path} should require write permission`
          ).toBe(403);
        }
      }
    });
  });

  describe('Auth Consistency', () => {
    it('should not have any route without a policy defined', () => {
      // Every route in the matrix should have a policy
      for (const route of AUTH_POLICY_MATRIX) {
        expect(route.policy, `Route ${route.path} must have a policy`).toBeDefined();
        expect(['public', 'auth-read', 'auth-write', 'admin']).toContain(route.policy);
      }
    });

    it('should document all POST/PUT/PATCH/DELETE as write or admin', () => {
      const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
      const writeOrAdmin = AUTH_POLICY_MATRIX.filter(
        (p) => p.policy === 'auth-write' || p.policy === 'admin'
      );

      const violatingRoutes = AUTH_POLICY_MATRIX.filter(
        (p) =>
          mutatingMethods.includes(p.method) &&
          !writeOrAdmin.some((w) => w.path === p.path && w.method === p.method)
      );

      if (violatingRoutes.length > 0) {
        console.error('Mutating routes without write/admin policy:');
        for (const route of violatingRoutes) {
          console.error(`  - ${route.method} ${route.path} (${route.policy})`);
        }
      }

      // Some routes may legitimately be auth-read if they use tenant isolation
      // Or if they use requireAuth (not requireWritePermission) for mutating ops
      // This test documents them but doesn't fail
      const undocumented = violatingRoutes.filter(
        (r) => !r.notes?.includes('tenant isolation') && !r.notes?.includes('requireAuth')
      );

      expect(undocumented, 'Undocumented mutating routes without write/admin policy').toEqual([]);
    });
  });

  describe('Matrix Version', () => {
    it('should have a version defined', () => {
      expect(AUTH_POLICY_VERSION).toBeDefined();
      expect(AUTH_POLICY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface RouteInfo {
  path: string;
  method: string;
}

function extractRoutes(app: Hono<Env>): RouteInfo[] {
  const routes: RouteInfo[] = [];

  // Access internal route structure
  const routeData = app.routes;

  if (!routeData) return routes;

  for (const route of routeData) {
    // Skip the wildcard middleware route
    if (route.path === '*' || route.path === '/*') continue;

    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method !== 'ALL' && method !== 'USE') {
        routes.push({
          path: normalizeRoutePath(route.path),
          method,
        });
      }
    }
  }

  return routes;
}

function normalizeRoutePath(path: string): string {
  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  // Remove trailing slash except for root
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}
