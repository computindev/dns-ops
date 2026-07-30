/**
 * Suggestions Routes Tests - PR-02.6.1
 *
 * Tests for suggestion management endpoints:
 * - PATCH /api/suggestions/:suggestionId/apply
 * - PATCH /api/suggestions/:suggestionId/dismiss
 * - GET /api/suggestions/:suggestionId
 *
 * Key focus: API safeguard for review-only suggestions
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { suggestionsRoutes } from './suggestions.js';

// =============================================================================
// MOCK DATABASE SETUP
// =============================================================================

interface MockSuggestion {
  id: string;
  findingId: string;
  title: string;
  description: string;
  action: string;
  riskPosture: string;
  blastRadius: string;
  reviewOnly: boolean;
  appliedAt: Date | null;
  appliedBy: string | null;
  dismissedAt: Date | null;
  dismissedBy: string | null;
  dismissalReason: string | null;
  createdAt: Date;
}

interface MockData {
  suggestions: MockSuggestion[];
  findings: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  domains: Array<Record<string, unknown>>;
}

function createMockData(): MockData {
  const now = new Date();
  return {
    findings: [
      { id: 'finding-1', snapshotId: 'snapshot-1', type: 'mail.no-spf-record' },
      { id: 'finding-2', snapshotId: 'snapshot-1', type: 'mail.no-mx-record' },
      { id: 'finding-3', snapshotId: 'snapshot-1', type: 'mail.no-dmarc-record' },
      { id: 'finding-4', snapshotId: 'snapshot-1', type: 'mail.no-dkim-queried' },
    ],
    snapshots: [{ id: 'snapshot-1', domainId: 'domain-1' }],
    domains: [{ id: 'domain-1', tenantId: 'test-tenant' }],
    suggestions: [
      {
        id: 'suggestion-regular',
        findingId: 'finding-1',
        title: 'Add SPF record',
        description: 'Add SPF record to prevent email spoofing',
        action: 'Add TXT record with SPF policy',
        riskPosture: 'low',
        blastRadius: 'single',
        reviewOnly: false,
        appliedAt: null,
        appliedBy: null,
        dismissedAt: null,
        dismissedBy: null,
        dismissalReason: null,
        createdAt: now,
      },
      {
        id: 'suggestion-review-only',
        findingId: 'finding-2',
        title: 'Change MX records',
        description: 'Update MX records to new provider',
        action: 'Replace MX records',
        riskPosture: 'high',
        blastRadius: 'domain',
        reviewOnly: true,
        appliedAt: null,
        appliedBy: null,
        dismissedAt: null,
        dismissedBy: null,
        dismissalReason: null,
        createdAt: now,
      },
      {
        id: 'suggestion-already-applied',
        findingId: 'finding-3',
        title: 'Already done',
        description: 'This was already applied',
        action: 'N/A',
        riskPosture: 'low',
        blastRadius: 'single',
        reviewOnly: false,
        appliedAt: now,
        appliedBy: 'user-1',
        dismissedAt: null,
        dismissedBy: null,
        dismissalReason: null,
        createdAt: now,
      },
      {
        id: 'suggestion-dismissed',
        findingId: 'finding-4',
        title: 'Dismissed suggestion',
        description: 'This was dismissed',
        action: 'N/A',
        riskPosture: 'low',
        blastRadius: 'single',
        reviewOnly: false,
        appliedAt: null,
        appliedBy: null,
        dismissedAt: now,
        dismissedBy: 'user-1',
        dismissalReason: 'Not applicable',
        createdAt: now,
      },
    ],
  };
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const name = record[Symbol.for('drizzle:Name')];
  return typeof name === 'string' ? name : '';
}

// Helper to extract ID from drizzle-orm eq() condition
function getConditionParam(condition: unknown): string | undefined {
  const sql = condition as {
    queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
  };
  return sql.queryChunks?.find((chunk) => chunk?.constructor?.name === 'Param')?.value as
    | string
    | undefined;
}

function createMockDb(data: MockData) {
  return {
    selectOne: vi.fn(async (table: unknown, condition: unknown) => {
      const id = getConditionParam(condition);
      if (!id) return undefined;
      switch (getTableName(table)) {
        case 'suggestions':
          return data.suggestions.find((suggestion) => suggestion.id === id);
        case 'findings':
          return data.findings.find((finding) => finding.id === id);
        case 'snapshots':
          return data.snapshots.find((snapshot) => snapshot.id === id);
        case 'domains':
          return data.domains.find((domain) => domain.id === id);
        default:
          return undefined;
      }
    }),
    update: vi.fn(async (_table: unknown, updates: Partial<MockSuggestion>, condition: unknown) => {
      const id = getConditionParam(condition);
      if (id) {
        const suggestion = data.suggestions.find((s: MockSuggestion) => s.id === id);
        if (suggestion) {
          Object.assign(suggestion, updates);
          return suggestion;
        }
      }
      return null;
    }),
    insert: vi.fn(async (_table: unknown, insertData: unknown) => insertData),
    insertMany: vi.fn(async (_table: unknown, insertData: unknown[]) => insertData),
    delete: vi.fn(async () => null),
    selectWhere: vi.fn(async () => []),
    select: vi.fn(async () => []),
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Suggestions Routes', () => {
  let app: Hono<Env>;
  let mockData: MockData;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockData = createMockData();
    mockDb = createMockDb(mockData);

    app = new Hono<Env>();

    // Setup middleware to inject dependencies
    app.use('*', (c, next) => {
      c.set('db', mockDb as unknown as Env['Variables']['db']);
      c.set('tenantId', 'test-tenant');
      c.set('actorId', 'test-user');
      return next();
    });

    app.route('/suggestions', suggestionsRoutes);
  });

  // ===========================================================================
  // PATCH /api/suggestions/:suggestionId/apply
  // ===========================================================================

  describe('PATCH /suggestions/:suggestionId/apply', () => {
    it.each([
      'suggestion-regular',
      'suggestion-review-only',
    ])('refuses to apply guidance-only suggestion %s', async (suggestionId) => {
      const res = await app.request(`/suggestions/${suggestionId}/apply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmApply: true }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as {
        code: string;
        guidance: { kind: string; executableMutation: null };
      };
      expect(body.code).toBe('GUIDANCE_ONLY');
      expect(body.guidance).toMatchObject({
        kind: 'GUIDANCE_ONLY',
        executableMutation: null,
      });
    });

    it('should return 404 for non-existent suggestion', async () => {
      const res = await app.request('/suggestions/nonexistent/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe('NOT_FOUND');
    });

    it('should return 409 for already applied suggestion', async () => {
      const res = await app.request('/suggestions/suggestion-already-applied/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe('GUIDANCE_ONLY');
      expect(body.error).toContain('historically acknowledged');
    });

    it('should return 409 for dismissed suggestion', async () => {
      const res = await app.request('/suggestions/suggestion-dismissed/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe('DISMISSED');
    });

    it('should return 401 without authentication', async () => {
      const appNoAuth = new Hono<Env>();
      appNoAuth.use('*', (c, next) => {
        c.set('db', mockDb as unknown as Env['Variables']['db']);
        // No actorId set
        return next();
      });
      appNoAuth.route('/suggestions', suggestionsRoutes);

      const res = await appNoAuth.request('/suggestions/suggestion-regular/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('tenant isolation', () => {
    it.each([
      'GET',
      'PATCH',
      'DELETE',
    ] as const)('hides cross-tenant suggestions for %s-style access', async (method) => {
      mockData.domains[0].tenantId = 'other-tenant';
      const before = structuredClone(mockData.suggestions[0]);
      const suffix = method === 'GET' ? '' : method === 'PATCH' ? '/apply' : '/dismiss';
      const response = await app.request(`/suggestions/suggestion-regular${suffix}`, {
        method: method === 'GET' ? 'GET' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify({ reason: 'cross-tenant' }),
      });

      expect(response.status).toBe(404);
      expect(mockData.suggestions[0]).toEqual(before);
    });
  });

  // ===========================================================================
  // PATCH /api/suggestions/:suggestionId/dismiss
  // ===========================================================================

  describe('PATCH /suggestions/:suggestionId/dismiss', () => {
    it('should dismiss a pending suggestion', async () => {
      const res = await app.request('/suggestions/suggestion-regular/dismiss', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Not needed' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; suggestion: { id: string } };
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent suggestion on dismiss', async () => {
      const res = await app.request('/suggestions/nonexistent/dismiss', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe('NOT_FOUND');
    });

    it('should return 409 for already dismissed suggestion', async () => {
      const res = await app.request('/suggestions/suggestion-dismissed/dismiss', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe('ALREADY_DISMISSED');
    });

    it('describes historical applied state as acknowledgement on dismiss', async () => {
      const res = await app.request('/suggestions/suggestion-already-applied/dismiss', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe('GUIDANCE_ONLY');
      expect(body.error).toContain('historically acknowledged');
    });
  });

  // ===========================================================================
  // GET /api/suggestions/:suggestionId
  // ===========================================================================

  describe('GET /suggestions/:suggestionId', () => {
    it('should return a suggestion by ID', async () => {
      const res = await app.request('/suggestions/suggestion-regular');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        suggestion: { id: string; title: string; description: string; action: string };
      };
      expect(body.suggestion).toMatchObject({
        id: 'suggestion-regular',
        title: 'Confirm authorized senders with the mail provider',
        action: 'Playbook: mail.spf.provider-confirmation',
      });
      expect(body.suggestion.description).not.toContain('Add SPF record');
    });

    it('should return 404 for non-existent suggestion', async () => {
      const res = await app.request('/suggestions/nonexistent');

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe('NOT_FOUND');
    });
  });
});
