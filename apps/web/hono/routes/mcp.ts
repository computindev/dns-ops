import { Hono } from 'hono';
import { authenticateMcpBearer, type McpPrincipal, parseMcpPrincipals } from '../lib/mcp-auth.js';
import { dispatchMcpTool, toMcpDispatchError } from '../lib/mcp-dispatch.js';
import { MCP_TOOLS } from '../lib/mcp-tools.js';
import type { Env } from '../types.js';

export const mcpRoutes = new Hono<Env>();

type JsonRpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

function rpcError(id: unknown, code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id: typeof id === 'string' || typeof id === 'number' ? id : null,
    error: { code, message },
  };
}

function principalSecret(c: { env: Env['Bindings'] }): string | undefined {
  return c.env.MCP_PRINCIPALS_JSON ?? process.env.MCP_PRINCIPALS_JSON;
}

/**
 * MCP transport discovery is intentionally separate from session auth. Its bearer
 * principal is static and derives tenant/actor/scope from a token hash only.
 */
mcpRoutes.post('/', async (c) => {
  let principals: McpPrincipal[];
  try {
    principals = parseMcpPrincipals(principalSecret(c));
  } catch {
    return c.json(rpcError(null, -32603, 'MCP authorization configuration is invalid'), 500);
  }
  const principal = authenticateMcpBearer(c.req.header('authorization'), principals);
  if (!principal) return c.json(rpcError(null, -32001, 'Unauthorized'), 401);

  const request = (await c.req.json().catch(() => null)) as JsonRpcRequest | null;
  if (
    !request ||
    request.jsonrpc !== '2.0' ||
    typeof request.method !== 'string' ||
    (typeof request.id !== 'undefined' &&
      request.id !== null &&
      typeof request.id !== 'string' &&
      typeof request.id !== 'number')
  ) {
    return c.json(rpcError(null, -32600, 'Invalid request'), 400);
  }
  if (request.method === 'initialize') {
    return c.json({
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'dns-ops', version: '0.1.0' },
        capabilities: { tools: {} },
      },
    });
  }
  if (request.method === 'tools/list') {
    return c.json({
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: { tools: MCP_TOOLS.filter((tool) => principal.scopes.has(tool.requiredScope)) },
    });
  }
  if (request.method === 'tools/call') {
    const params = request.params;
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return c.json(rpcError(request.id, -32602, 'Invalid tool call parameters'), 400);
    }
    const call = params as { name?: unknown; arguments?: unknown };
    if (typeof call.name !== 'string') {
      return c.json(rpcError(request.id, -32602, 'Tool name is required'), 400);
    }
    // Collector proxy headers must remain principal-derived rather than model arguments.
    c.set('tenantId', principal.tenantId);
    c.set('actorId', principal.actorId);
    try {
      const result = await dispatchMcpTool(
        c,
        c.get('db'),
        principal,
        call.name,
        call.arguments ?? {}
      );
      return c.json({ jsonrpc: '2.0', id: request.id ?? null, result });
    } catch (error) {
      const mapped = toMcpDispatchError(error);
      return c.json(
        rpcError(request.id, mapped.code, mapped.message),
        mapped.code === -32601 ? 404 : 400
      );
    }
  }
  return c.json(rpcError(request.id, -32601, 'Method not found'), 404);
});
