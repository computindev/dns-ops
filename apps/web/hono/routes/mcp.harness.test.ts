import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashMcpToken } from '../lib/mcp-auth.js';
import { McpCaseCommandService } from '../lib/mcp-case-command-service.js';
import { McpReadService } from '../lib/mcp-read-service.js';
import { McpScanService } from '../lib/mcp-scan-service.js';
import { MCP_TOOL_NAMES } from '../lib/mcp-tools.js';
import type { Env } from '../types.js';
import { mcpRoutes } from './mcp.js';

const token = 'deterministic-mcp-harness-token-with-sufficient-entropy';
const tenantId = '11111111-1111-4111-8111-111111111111';
const env = {
  MCP_PRINCIPALS_JSON: JSON.stringify([
    {
      principalId: 'mcp-harness',
      tokenSha256: hashMcpToken(token),
      tenantId,
      actorId: 'mcp-harness-actor',
      scopes: ['DOMAIN_READ', 'SIGNAL_READ', 'CASE_READ', 'CASE_WRITE', 'SCAN_REQUEST'],
      enabled: true,
    },
  ]),
};

function app() {
  const server = new Hono<Env>();
  server.route('/mcp', mcpRoutes);
  return server;
}

function call(name: string, args: Record<string, unknown>) {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: name,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  };
}

const fleetTapeDigest = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  windowHours: 24,
  totalDomains: 0,
  changedDomains: 0,
  entries: [],
} as const;

// [name, valid arguments, expected structuredContent, malformed arguments].
// fleet_tape accepts no schema properties, so its malformed input is an
// unexpected property rather than an empty object.
const cases = [
  ['domain_search', { query: 'example' }, [], { query: 1 }],
  ['domain_get_profile', { domainId: 'domain-a' }, { setupRequired: true }, {}],
  ['domain_get_posture', { domainId: 'domain-a' }, { setupRequired: false }, { domainId: 1 }],
  [
    'snapshot_compare',
    { domainId: 'domain-a', leftSnapshotId: 'snapshot-a', rightSnapshotId: 'snapshot-b' },
    { changes: [] },
    { domainId: 'domain-a' },
  ],
  ['evidence_get', { snapshotId: 'snapshot-a' }, { incomplete: true }, { snapshotId: 1 }],
  ['signal_list', { domainId: 'domain-a' }, [], { domainId: 1 }],
  ['fleet_tape', {}, fleetTapeDigest, { unexpected: true }],
  ['case_get', { caseId: 'case-a' }, { case: { id: 'case-a' } }, { caseId: 1 }],
  [
    'explain_case',
    { caseKind: 'DOMAIN_EXPIRING_SOON' },
    { caseKind: 'DOMAIN_EXPIRING_SOON', playbookId: 'domain-expiry', title: 'Domain expiry' },
    {},
  ],
  [
    'case_open',
    { domainId: 'domain-a', conditionKey: 'mail.no-spf-record', idempotencyKey: 'open-1' },
    { ok: true, value: { case: { id: 'case-a' } }, replayed: false },
    { domainId: 'domain-a', conditionKey: 'mail.no-spf-record' },
  ],
  [
    'case_set_disposition',
    { caseId: 'case-a', disposition: 'ACKNOWLEDGED', expectedVersion: 1, idempotencyKey: 'set-1' },
    { ok: true, value: { case: { id: 'case-a', version: 2 } }, replayed: false },
    {
      caseId: 'case-a',
      disposition: 'ACKNOWLEDGED',
      expectedVersion: '1',
      idempotencyKey: 'set-1',
    },
  ],
  [
    'scan_request',
    { domainId: 'domain-a', idempotencyKey: 'scan-1' },
    { ok: true, value: { snapshotId: 'snapshot-a' }, replayed: false },
    { domainId: 'domain-a' },
  ],
] as const;

describe('deterministic MCP transport harness', () => {
  beforeEach(() => {
    vi.spyOn(McpReadService.prototype, 'domainSearch').mockResolvedValue([]);
    vi.spyOn(McpReadService.prototype, 'domainProfile').mockResolvedValue({
      setupRequired: true,
    } as never);
    vi.spyOn(McpReadService.prototype, 'domainPosture').mockResolvedValue({
      setupRequired: false,
    } as never);
    vi.spyOn(McpReadService.prototype, 'snapshotCompare').mockResolvedValue({
      changes: [],
    } as never);
    vi.spyOn(McpReadService.prototype, 'evidence').mockResolvedValue({ incomplete: true } as never);
    vi.spyOn(McpReadService.prototype, 'signalList').mockResolvedValue([]);
    vi.spyOn(McpReadService.prototype, 'fleetTape').mockResolvedValue(
      fleetTapeDigest as unknown as never
    );
    vi.spyOn(McpReadService.prototype, 'caseGet').mockResolvedValue({
      case: { id: 'case-a' },
    } as never);
    vi.spyOn(McpReadService.prototype, 'explainCase').mockResolvedValue({
      caseKind: 'DOMAIN_EXPIRING_SOON',
      playbookId: 'domain-expiry',
      title: 'Domain expiry',
      sections: {},
    } as never);
    vi.spyOn(McpCaseCommandService.prototype, 'caseOpen').mockResolvedValue({
      ok: true,
      value: { case: { id: 'case-a' } },
      replayed: false,
    });
    vi.spyOn(McpCaseCommandService.prototype, 'caseSetDisposition').mockResolvedValue({
      ok: true,
      value: { case: { id: 'case-a', version: 2 } },
      replayed: false,
    });
    vi.spyOn(McpScanService.prototype, 'request').mockResolvedValue({
      ok: true,
      value: { snapshotId: 'snapshot-a' },
      replayed: false,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(cases)('returns a typed successful result for %s', async (name, args, expected) => {
    const response = await app().request('/mcp', call(name, args), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: name,
      result: { structuredContent: expected },
    });
  });

  it('covers the transport matrix for exactly the closed MCP_TOOL_NAMES contract', () => {
    expect(cases.map(([name]) => name)).toEqual(MCP_TOOL_NAMES);
  });

  it('rejects every malformed tool schema before invoking a service', async () => {
    for (const [name, , , malformedArguments] of cases) {
      const response = await app().request('/mcp', call(name, malformedArguments), env);
      expect(response.status, name).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: -32602 } });
    }
  });
});
