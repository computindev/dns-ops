import type { IDatabaseAdapter } from '@dns-ops/db';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import { dispatchMcpTool, toMcpDispatchError } from './mcp-dispatch.js';

describe('MCP tool dispatch', () => {
  it('rejects unknown and malformed tools before persistence', async () => {
    const context = {} as Context<Env>;
    const db = {} as IDatabaseAdapter;
    const principal = {
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      scopes: new Set(['DOMAIN_READ'] as const),
    };
    await expect(dispatchMcpTool(context, db, principal, 'unknown_tool', {})).rejects.toMatchObject(
      { code: -32601 }
    );
    await expect(
      dispatchMcpTool(context, db, principal, 'domain_get_profile', {})
    ).rejects.toMatchObject({ code: -32602 });
  });

  it('maps unexpected exceptions without internal leakage', () => {
    expect(toMcpDispatchError(new Error('database connection password=x'))).toMatchObject({
      code: -32603,
      message: 'Tool execution failed',
    });
  });
});
