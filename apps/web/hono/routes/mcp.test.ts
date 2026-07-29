import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { hashMcpToken } from '../lib/mcp-auth.js';
import { MCP_TOOLS } from '../lib/mcp-tools.js';
import type { Env } from '../types.js';
import { mcpRoutes } from './mcp.js';

const token = 'a-long-random-mcp-bearer-token-with-enough-entropy-12345';
const env = {
  MCP_PRINCIPALS_JSON: JSON.stringify([
    {
      tokenHash: hashMcpToken(token),
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      scopes: ['DOMAIN_READ', 'SIGNAL_READ', 'CASE_READ', 'CASE_WRITE', 'SCAN_REQUEST'],
    },
  ]),
};

function app() {
  const server = new Hono<Env>();
  server.route('/mcp', mcpRoutes);
  return server;
}

function rpc(method: string) {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
  };
}

describe('MCP discovery transport', () => {
  it('requires a configured static bearer principal', async () => {
    const response = await app().request(
      '/mcp',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      },
      env
    );
    expect(response.status).toBe(401);
  });

  it('initializes and lists exactly the approved tool contract', async () => {
    const server = app();
    const initialized = await server.request('/mcp', rpc('initialize'), env);
    expect(initialized.status).toBe(200);
    await expect(initialized.json()).resolves.toMatchObject({
      result: { capabilities: { tools: {} } },
    });
    const listed = await server.request('/mcp', rpc('tools/list'), env);
    await expect(listed.json()).resolves.toMatchObject({ result: { tools: MCP_TOOLS } });
  });

  it('does not disclose tools above the caller scope', async () => {
    const limitedEnv = {
      MCP_PRINCIPALS_JSON: JSON.stringify([
        {
          tokenHash: hashMcpToken(token),
          tenantId: 'tenant-a',
          actorId: 'actor-a',
          scopes: ['CASE_READ'],
        },
      ]),
    };
    const response = await app().request('/mcp', rpc('tools/list'), limitedEnv);
    await expect(response.json()).resolves.toMatchObject({
      result: { tools: [{ name: 'case_get', requiredScope: 'CASE_READ' }] },
    });
  });

  it('rejects malformed and unimplemented transport methods without leaking exceptions', async () => {
    const invalid = await app().request(
      '/mcp',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}',
      },
      env
    );
    expect(invalid.status).toBe(400);
    const missing = await app().request('/mcp', rpc('tools/call'), env);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: -32601 } });
  });
});
