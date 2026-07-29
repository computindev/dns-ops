import type { IDatabaseAdapter } from '@dns-ops/db';
import { describe, expect, it } from 'vitest';
import { McpCaseCommandService } from './mcp-case-command-service.js';

describe('McpCaseCommandService', () => {
  it('does not access persistence without CASE_WRITE', async () => {
    const db = {
      select: async () => {
        throw new Error('must not reach persistence');
      },
    } as unknown as IDatabaseAdapter;
    const service = new McpCaseCommandService(db, {
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      scopes: new Set(['CASE_READ']),
    });
    await expect(
      service.caseOpen({
        domainId: 'domain-1',
        conditionKey: 'condition-1',
        idempotencyKey: 'key-1',
      })
    ).rejects.toThrow('MCP scope denied');
  });
});
