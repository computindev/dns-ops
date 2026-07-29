import type { IDatabaseAdapter } from '@dns-ops/db';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import { McpScanService } from './mcp-scan-service.js';

describe('McpScanService', () => {
  it('does not access domains or collector without SCAN_REQUEST', async () => {
    const context = {} as Context<Env>;
    const db = {
      select: async () => {
        throw new Error('persistence must not be reached');
      },
    } as unknown as IDatabaseAdapter;
    const service = new McpScanService(context, db, {
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      actorId: 'actor-1',
      scopes: new Set(['CASE_WRITE']),
    });
    await expect(
      service.request({ domainId: 'domain-1', idempotencyKey: 'key-1' })
    ).rejects.toThrow('MCP scope denied');
  });
});
