/**
 * Legacy tools route runtime tests
 *
 * PR-03.1: Tests for startup validation and INFRA_CONFIG_MISSING error codes
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { legacyToolsRoutes } from './legacy-tools.js';

interface MockState {
  legacyAccessLogs: Array<Record<string, unknown>>;
  shadowComparisons: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
}

function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') return '';
  const record = table as Record<symbol | string, unknown>;
  const symbolName = Symbol.for('drizzle:Name');
  if (typeof record[symbolName] === 'string') {
    return record[symbolName] as string;
  }
  const symbols = Object.getOwnPropertySymbols(record);
  const drizzleName = symbols.find((symbol) => String(symbol) === 'Symbol(drizzle:Name)');
  if (drizzleName && typeof record[drizzleName] === 'string') {
    return record[drizzleName] as string;
  }
  return '';
}

function getConditionParam(condition: unknown): unknown {
  const sql = condition as {
    queryChunks?: Array<{ constructor?: { name?: string }; value?: unknown }>;
  };
  return sql.queryChunks?.find((chunk) => chunk?.constructor?.name === 'Param')?.value;
}

function createMockDb(state: MockState): IDatabaseAdapter {
  return {
    getDrizzle: vi.fn(),
    select: vi.fn(async (table: unknown) => {
      const tableName = getTableName(table);
      if (tableName === 'legacy_access_logs') return [...state.legacyAccessLogs];
      if (tableName === 'shadow_comparisons') return [...state.shadowComparisons];
      if (tableName === 'snapshots') return [...state.snapshots];
      if (tableName === 'findings') return [...state.findings];
      return [];
    }),
    selectWhere: vi.fn(async (table: unknown, condition: unknown) => {
      const tableName = getTableName(table);
      const param = getConditionParam(condition);
      if (tableName === 'legacy_access_logs')
        return state.legacyAccessLogs.filter((row) => row.domain === param);
      if (tableName === 'shadow_comparisons')
        return state.shadowComparisons.filter((row) => row.domain === param);
      if (tableName === 'snapshots')
        return state.snapshots.filter((row) => row.domainName === param);
      if (tableName === 'findings') return state.findings.filter((row) => row.snapshotId === param);
      return [];
    }),
    selectOne: vi.fn(),
    insert: vi.fn(async (_table: unknown, values: Record<string, unknown>) => ({
      id: `log-${Date.now()}`,
      createdAt: new Date(),
      ...values,
    })),
    insertMany: vi.fn(),
    update: vi.fn(),
    updateOne: vi.fn(),
    delete: vi.fn(),
    deleteOne: vi.fn(),
    transaction: vi.fn(async (callback: (db: IDatabaseAdapter) => Promise<unknown>) =>
      callback(createMockDb(state))
    ),
  } as unknown as IDatabaseAdapter;
}

function createApp(state: MockState, auth = true) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', createMockDb(state));
    if (auth) {
      c.set('tenantId', 'tenant-1');
      c.set('actorId', 'actor-1');
    }
    await next();
  });
  app.route('/api/legacy-tools', legacyToolsRoutes);
  return app;
}

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv.VITE_DMARC_TOOL_URL = process.env.VITE_DMARC_TOOL_URL;
  savedEnv.VITE_DKIM_TOOL_URL = process.env.VITE_DKIM_TOOL_URL;
  process.env.VITE_DMARC_TOOL_URL = 'https://dmarc.example.com/check';
  process.env.VITE_DKIM_TOOL_URL = 'https://dkim.example.com/lookup';
});

afterEach(() => {
  process.env.VITE_DMARC_TOOL_URL = savedEnv.VITE_DMARC_TOOL_URL;
  process.env.VITE_DKIM_TOOL_URL = savedEnv.VITE_DKIM_TOOL_URL;
});

const emptyState: MockState = {
  legacyAccessLogs: [],
  shadowComparisons: [],
  snapshots: [],
  findings: [],
};

describe('legacyToolsRoutes runtime', () => {
  describe('GET /config', () => {
    it('returns tool availability based on env vars', async () => {
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/config');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        dmarc: { available: boolean; disclaimer: string };
        dkim: { available: boolean };
      };
      expect(json.dmarc.available).toBe(true);
      expect(json.dkim.available).toBe(true);
      expect(json.dmarc.disclaimer).toContain('informational');
    });

    it('reports unavailable when env vars unset', async () => {
      process.env.VITE_DMARC_TOOL_URL = '';
      process.env.VITE_DKIM_TOOL_URL = '';
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/config');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        dmarc: { available: boolean };
        dkim: { available: boolean };
      };
      expect(json.dmarc.available).toBe(false);
      expect(json.dkim.available).toBe(false);
    });

    it('reports partial availability when only DMARC configured', async () => {
      process.env.VITE_DKIM_TOOL_URL = '';
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/config');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        dmarc: { available: boolean; supportDeepLink: boolean };
        dkim: { available: boolean; supportDeepLink: boolean };
      };
      expect(json.dmarc.available).toBe(true);
      expect(json.dmarc.supportDeepLink).toBe(true);
      expect(json.dkim.available).toBe(false);
      expect(json.dkim.supportDeepLink).toBe(false);
    });
  });

  describe('GET /dmarc/deeplink', () => {
    it('returns deep-link for valid domain', async () => {
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=example.com');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        tool: string;
        domain: string;
        url: string;
        legacyWarning: boolean;
      };
      expect(json.tool).toBe('dmarc');
      expect(json.domain).toBe('example.com');
      expect(json.url).toContain('dmarc.example.com');
      expect(json.url).toContain('domain=example.com');
      expect(json.legacyWarning).toBe(true);
    });

    it('returns 400 when domain missing', async () => {
      const app = createApp(emptyState);
      const response = await app.request('/api/legacy-tools/dmarc/deeplink');
      expect(response.status).toBe(400);
    });

    it('returns 400 for invalid domain', async () => {
      const app = createApp(emptyState);
      const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=not a domain!');
      expect(response.status).toBe(400);
    });

    it('returns 503 when tool not configured', async () => {
      process.env.VITE_DMARC_TOOL_URL = '';
      const app = createApp(emptyState);
      const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=example.com');
      expect(response.status).toBe(503);
    });

    it('returns INFRA_CONFIG_MISSING code when tool not configured (PR-03.1)', async () => {
      process.env.VITE_DMARC_TOOL_URL = '';
      const app = createApp(emptyState);
      const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=example.com');

      expect(response.status).toBe(503);
      const json = (await response.json()) as {
        ok: boolean;
        code: string;
        error: string;
        requestId: string;
        details?: { tool: string; hint: string };
      };

      // PR-03.1: Verify standardized error envelope
      expect(json.ok).toBe(false);
      expect(json.code).toBe('INFRA_CONFIG_MISSING');
      expect(json.error).toContain('DMARC');
      expect(json.error).toContain('not configured');
      expect(json.requestId).toBeDefined();
      expect(json.details?.tool).toBe('dmarc');
      expect(json.details?.hint).toContain('VITE_DMARC_TOOL_URL');
    });
  });

  describe('GET /dkim/deeplink', () => {
    it('returns deep-link for valid domain + selector', async () => {
      const app = createApp(emptyState);

      const response = await app.request(
        '/api/legacy-tools/dkim/deeplink?domain=example.com&selector=google'
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        tool: string;
        domain: string;
        selector: string;
        url: string;
      };
      expect(json.tool).toBe('dkim');
      expect(json.selector).toBe('google');
      expect(json.url).toContain('selector=google');
    });

    it('returns 400 when selector missing', async () => {
      const app = createApp(emptyState);
      const response = await app.request('/api/legacy-tools/dkim/deeplink?domain=example.com');
      expect(response.status).toBe(400);
    });

    it('returns 400 for invalid selector', async () => {
      const app = createApp(emptyState);
      const response = await app.request(
        '/api/legacy-tools/dkim/deeplink?domain=example.com&selector=bad selector!'
      );
      expect(response.status).toBe(400);
    });

    it('returns 503 when tool not configured', async () => {
      process.env.VITE_DKIM_TOOL_URL = '';
      const app = createApp(emptyState);
      const response = await app.request(
        '/api/legacy-tools/dkim/deeplink?domain=example.com&selector=google'
      );
      expect(response.status).toBe(503);
    });

    it('returns INFRA_CONFIG_MISSING code when tool not configured (PR-03.1)', async () => {
      process.env.VITE_DKIM_TOOL_URL = '';
      const app = createApp(emptyState);
      const response = await app.request(
        '/api/legacy-tools/dkim/deeplink?domain=example.com&selector=google'
      );

      expect(response.status).toBe(503);
      const json = (await response.json()) as {
        ok: boolean;
        code: string;
        error: string;
        requestId: string;
        details?: { tool: string; hint: string };
      };

      // PR-03.1: Verify standardized error envelope
      expect(json.ok).toBe(false);
      expect(json.code).toBe('INFRA_CONFIG_MISSING');
      expect(json.error).toContain('DKIM');
      expect(json.error).toContain('not configured');
      expect(json.requestId).toBeDefined();
      expect(json.details?.tool).toBe('dkim');
      expect(json.details?.hint).toContain('VITE_DKIM_TOOL_URL');
    });

    it('returns 503 with INFRA_CONFIG_MISSING when DKIM tool not configured', async () => {
      process.env.VITE_DKIM_TOOL_URL = '';
      const app = createApp(emptyState);
      const response = await app.request(
        '/api/legacy-tools/dkim/deeplink?domain=example.com&selector=google'
      );
      expect(response.status).toBe(503);
      const json = (await response.json()) as { ok: boolean; code: string; error: string };
      expect(json.ok).toBe(false);
      expect(json.code).toBe('INFRA_CONFIG_MISSING');
      expect(json.error).toContain('DKIM');
    });
  });

  describe('POST /log', () => {
    it('logs valid legacy tool access', async () => {
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'dmarc', domain: 'example.com', action: 'view' }),
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as { success: boolean; logged: boolean };
      expect(json.success).toBe(true);
      expect(json.logged).toBe(true);
    });

    it('rejects invalid tool type', async () => {
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'invalid', domain: 'example.com', action: 'view' }),
      });

      expect(response.status).toBe(400);
    });

    it('rejects missing required fields', async () => {
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'dmarc' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /bulk-deeplinks', () => {
    it('generates multiple deep-links', async () => {
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/bulk-deeplinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            { tool: 'dmarc', domain: 'example.com' },
            { tool: 'dkim', domain: 'test.com', selector: 'selector1' },
          ],
        }),
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        results: Array<{ index: number; url?: string; error?: string }>;
        legacyWarning: boolean;
      };
      expect(json.results).toHaveLength(2);
      expect(json.results[0]?.url).toContain('dmarc.example.com');
      expect(json.results[1]?.url).toContain('dkim.example.com');
      expect(json.legacyWarning).toBe(true);
    });

    it('rejects batch over 50 items', async () => {
      const app = createApp(emptyState);
      const requests = Array.from({ length: 51 }, (_, i) => ({
        tool: 'dmarc',
        domain: `d${i}.com`,
      }));

      const response = await app.request('/api/legacy-tools/bulk-deeplinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      });

      expect(response.status).toBe(400);
    });

    it('returns per-item errors for invalid requests', async () => {
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/bulk-deeplinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            { tool: 'dmarc', domain: 'not a domain!' },
            { tool: 'dkim', domain: 'example.com' }, // missing selector
          ],
        }),
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        results: Array<{ error?: string }>;
      };
      expect(json.results[0]?.error).toBe('Invalid domain');
      expect(json.results[1]?.error).toBe('Invalid selector');
    });

    it('returns INFRA_CONFIG_MISSING code in per-item errors (PR-03.1)', async () => {
      process.env.VITE_DMARC_TOOL_URL = '';
      process.env.VITE_DKIM_TOOL_URL = '';
      const app = createApp(emptyState);

      const response = await app.request('/api/legacy-tools/bulk-deeplinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            { tool: 'dmarc', domain: 'example.com' },
            { tool: 'dkim', domain: 'example.com', selector: 'google' },
          ],
        }),
      });

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        results: Array<{ error?: string; code?: string }>;
      };

      // PR-03.1: Verify INFRA_CONFIG_MISSING code in per-item errors
      expect(json.results[0]?.error).toBe('DMARC tool not configured');
      expect(json.results[0]?.code).toBe('INFRA_CONFIG_MISSING');
      expect(json.results[1]?.error).toBe('DKIM tool not configured');
      expect(json.results[1]?.code).toBe('INFRA_CONFIG_MISSING');
    });
  });

  describe('GET /shadow-stats', () => {
    it('returns aggregate shadow comparison stats', async () => {
      const state: MockState = {
        legacyAccessLogs: [
          { id: 'log-1', tool: 'dmarc', domain: 'example.com', tenantId: 'tenant-1', action: 'view', success: true },
        ],
        shadowComparisons: [
          {
            id: 'sc-1',
            domain: 'example.com',
            tenantId: 'tenant-1',
            status: 'match',
            comparisons: [],
            comparedAt: new Date(),
          },
        ],
        snapshots: [],
        findings: [],
      };
      const app = createApp(state);

      const response = await app.request('/api/legacy-tools/shadow-stats');

      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        domain: string;
        durable: boolean;
        stats: {
          legacy: { total: number };
          shadow: { total: number };
        };
      };
      expect(json.domain).toBe('all');
      expect(json.durable).toBe(true);
    });
  });

  // ===========================================================================
  // PR-03.2: Spec-required test cases (exact inputs from PR-03 spec)
  // ===========================================================================
  describe('PR-03.2 spec: Query param injection via domain', () => {
    it('rejects domain with ?evil=true&redirect=http://attacker.com (PR-03.2a)', async () => {
      const app = createApp(emptyState);
      // When a domain like "example.com?evil=true&redirect=http://attacker.com"
      // is passed as a query param, the URL parser splits on & so domain becomes
      // "example.com?evil=true" and "redirect" becomes a separate query param.
      // Either way the domain is invalid (contains ?) and must be rejected.
      const maliciousDomain = 'example.com?evil=true';
      const response = await app.request(
        `/api/legacy-tools/dmarc/deeplink?domain=${encodeURIComponent(maliciousDomain)}`
      );
      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string };
      expect(json.error).toContain('Invalid domain');
    });

    it('extra query params from injection attempt are NOT forwarded to deep link (PR-03.2a)', async () => {
      const app = createApp(emptyState);
      // If attacker crafts URL with &redirect=http://attacker.com, the
      // "redirect" query param is separate from domain and must not appear
      // in any deep link output. Test with a valid domain to verify.
      const response = await app.request(
        '/api/legacy-tools/dmarc/deeplink?domain=example.com&redirect=http://attacker.com'
      );
      // The valid domain should work (200)
      expect(response.status).toBe(200);
      const json = (await response.json()) as { url: string };
      // But the injected redirect param must NOT appear in the output URL
      expect(json.url).not.toContain('redirect=http://attacker.com');
      expect(json.url).not.toContain('evil=');
      // Verify the domain in the deep link is only "example.com"
      const parsedUrl = new URL(json.url);
      expect(parsedUrl.searchParams.get('domain')).toBe('example.com');
      expect(parsedUrl.searchParams.has('redirect')).toBe(false);
    });

    it('fully encoded injection domain is also rejected (PR-03.2a)', async () => {
      const app = createApp(emptyState);
      // The full malicious string URL-encoded: ? and & and = are all encoded
      const fullyEncoded = 'example.com%3Fevil%3Dtrue%26redirect%3Dhttp%3A%2F%2Fattacker.com';
      const response = await app.request(`/api/legacy-tools/dmarc/deeplink?domain=${fullyEncoded}`);
      // After URL decoding by Hono, domain = "example.com?evil=true&redirect=http://attacker.com"
      // The ? makes it invalid
      expect(response.status).toBe(400);
    });
  });

  describe('PR-03.2 spec: XSS via domain attribute injection', () => {
    it('rejects domain with "><script>alert(1)</script> (PR-03.2b)', async () => {
      const app = createApp(emptyState);
      const xssDomain = 'example.com"><script>alert(1)</script>';
      const response = await app.request(
        `/api/legacy-tools/dmarc/deeplink?domain=${encodeURIComponent(xssDomain)}`
      );
      // Domain contains ", >, < — all invalid for DNS names
      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string };
      expect(json.error).toContain('Invalid domain');
    });

    it('rejects URL-variant XSS domain via direct query (no encoding) (PR-03.2b)', async () => {
      const app = createApp(emptyState);
      // Without encodeURIComponent, the raw " character in the URL is invalid
      // but Hono includes it in the domain value, so domain validation rejects it.
      // This is the safe behavior: no XSS content ever reaches deep link output.
      const response = await app.request(
        '/api/legacy-tools/dmarc/deeplink?domain=example.com"><script>alert(1)</script>'
      );
      // Domain validation rejects the " character — output is safe
      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string };
      expect(json.error).toContain('Invalid domain');
    });
  });

  describe('PR-03.2 spec: IDN domain münchen.de', () => {
    it('rejects münchen.de — non-ASCII domain (PR-03.2c)', async () => {
      const app = createApp(emptyState);
      const idnDomain = 'münchen.de';
      const response = await app.request(
        `/api/legacy-tools/dmarc/deeplink?domain=${encodeURIComponent(idnDomain)}`
      );
      // Legacy tools don't support IDN; non-ASCII chars are rejected
      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string };
      expect(json.error).toContain('Invalid domain');
    });

    it('rejects münchen.de for DKIM deep link as well (PR-03.2c)', async () => {
      const app = createApp(emptyState);
      const response = await app.request(
        `/api/legacy-tools/dkim/deeplink?domain=${encodeURIComponent('münchen.de')}&selector=google`
      );
      expect(response.status).toBe(400);
      const json = (await response.json()) as { error: string };
      expect(json.error).toContain('Invalid domain');
    });
  });

  describe('PR-03.2 spec: Deep link output URL well-formedness', () => {
    it('produces a valid, parseable URL for a normal domain (PR-03.2d)', async () => {
      const app = createApp(emptyState);
      const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=example.com');
      expect(response.status).toBe(200);
      const json = (await response.json()) as { url: string };
      // Must be a parseable URL
      const parsed = new URL(json.url);
      expect(parsed.protocol).toBe('https:');
      expect(parsed.hostname).toBe('dmarc.example.com');
      expect(parsed.searchParams.get('domain')).toBe('example.com');
    });

    it('produces a valid URL for DKIM with selector (PR-03.2d)', async () => {
      const app = createApp(emptyState);
      const response = await app.request(
        '/api/legacy-tools/dkim/deeplink?domain=example.com&selector=google'
      );
      expect(response.status).toBe(200);
      const json = (await response.json()) as { url: string };
      const parsed = new URL(json.url);
      expect(parsed.protocol).toBe('https:');
      expect(parsed.searchParams.get('domain')).toBe('example.com');
      expect(parsed.searchParams.get('selector')).toBe('google');
    });

    it('domain param in deep link is properly URL-encoded (PR-03.2d)', async () => {
      const app = createApp(emptyState);
      const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=example.com');
      expect(response.status).toBe(200);
      const json = (await response.json()) as { url: string };
      // The URL should be parseable and domain param clean
      const parsed = new URL(json.url);
      // No double-encoding — domain=example.com not domain=example%2Ecom
      expect(parsed.searchParams.get('domain')).toBe('example.com');
      // No injection characters in the URL
      expect(json.url).not.toContain('<');
      expect(json.url).not.toContain('>');
      expect(json.url).not.toContain('"');
      expect(json.url).not.toContain('javascript:');
    });
  });

  // PR-03.2: Security tests for deep-link URL safety
  describe('PR-03.2: URL Safety', () => {
    describe('XSS prevention in domain parameter', () => {
      it('rejects domain with script tag', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=<script>alert(1)</script>'
        );
        expect(response.status).toBe(400);
      });

      it('rejects domain with javascript: URL', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=javascript:alert(1)'
        );
        expect(response.status).toBe(400);
      });

      it('rejects domain with onload event', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=example.com"onload="alert(1)'
        );
        expect(response.status).toBe(400);
      });

      it('rejects domain with expression injection', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=example.com style="expression:alert(1)"'
        );
        expect(response.status).toBe(400);
      });
    });

    describe('IDN (punycode) handling', () => {
      it('rejects punycode domain (xn--) ', async () => {
        const app = createApp(emptyState);
        // xn-- is the punycode prefix
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=xn--ls8h.example.com'
        );
        expect(response.status).toBe(400);
      });

      it('rejects domain with unicode characters', async () => {
        const app = createApp(emptyState);
        // Greek alpha unicode character
        const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=α example.com');
        expect(response.status).toBe(400);
      });

      it('rejects domain with mixed scripts (IDN homograph)', async () => {
        const app = createApp(emptyState);
        // Cyrillic 'а' (U+0430) vs Latin 'a' (U+0061) - looks identical
        const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=exаmple.com');
        expect(response.status).toBe(400);
      });

      it('rejects emoji in domain', async () => {
        const app = createApp(emptyState);
        const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=🚨.com');
        expect(response.status).toBe(400);
      });
    });

    describe('Query parameter injection prevention', () => {
      it('escapes ampersands in domain value', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=example.com&extra=malicious'
        );
        // The extra param should be ignored (not part of domain query)
        expect(response.status).toBe(200);
        const json = (await response.json()) as { url: string };
        // Verify the extra param is not in the resulting URL
        expect(json.url).not.toContain('extra=malicious');
      });

      it('sanitizes domain with hash fragment', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=example.com#steal=cookie'
        );
        // Hash fragment is invalid in domain - should be rejected
        expect(response.status).toBe(400);
      });

      it('prevents domain query param override', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=evil.com&domain=target.com'
        );
        // Should only use first domain value
        const json = (await response.json()) as { domain: string };
        expect(json.domain).toBe('evil.com');
      });

      it('rejects newline characters in domain', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=example.com%0aalert(1)'
        );
        expect(response.status).toBe(400);
      });

      it('rejects null bytes in domain', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=example.com%00malicious'
        );
        expect(response.status).toBe(400);
      });
    });

    describe('DKIM selector injection prevention', () => {
      it('rejects selector with newline', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dkim/deeplink?domain=example.com&selector=google%0aalert(1)'
        );
        expect(response.status).toBe(400);
      });

      it('rejects selector with null byte', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dkim/deeplink?domain=example.com&selector=google%00malicious'
        );
        expect(response.status).toBe(400);
      });

      it('rejects selector exceeding max length', async () => {
        const app = createApp(emptyState);
        const longSelector = 'a'.repeat(64);
        const response = await app.request(
          `/api/legacy-tools/dkim/deeplink?domain=example.com&selector=${longSelector}`
        );
        expect(response.status).toBe(400);
      });
    });

    describe('Deep-link URL construction safety', () => {
      it('does not allow URL scheme override in domain', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=https://evil.com'
        );
        expect(response.status).toBe(400);
      });

      it('does not allow FTP scheme in domain', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=ftp://example.com'
        );
        expect(response.status).toBe(400);
      });

      it('does not allow file scheme in domain', async () => {
        const app = createApp(emptyState);
        const response = await app.request(
          '/api/legacy-tools/dmarc/deeplink?domain=file:///etc/passwd'
        );
        expect(response.status).toBe(400);
      });

      it('does not allow IP address as domain', async () => {
        const app = createApp(emptyState);
        const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=127.0.0.1');
        expect(response.status).toBe(400);
      });

      it('does not allow localhost as domain', async () => {
        const app = createApp(emptyState);
        const response = await app.request('/api/legacy-tools/dmarc/deeplink?domain=localhost');
        expect(response.status).toBe(400);
      });
    });
  });
});
