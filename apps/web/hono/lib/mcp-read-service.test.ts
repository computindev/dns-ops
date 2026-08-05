import type { IDatabaseAdapter } from '@dns-ops/db';
import { describe, expect, it } from 'vitest';
import { McpReadService } from './mcp-read-service.js';

describe('McpReadService', () => {
  it('re-checks the resource scope before accessing persistence', async () => {
    const db = {
      select: async () => {
        throw new Error('persistence must not be reached');
      },
    } as unknown as IDatabaseAdapter;
    const service = new McpReadService(db, {
      principalId: 'principal-1',
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      scopes: new Set(['CASE_READ']),
    });
    await expect(service.domainSearch()).rejects.toThrow('MCP scope denied');
  });

  it('does not let a domain-read-only principal access posture signals or cases', async () => {
    const db = {
      select: async () => {
        throw new Error('persistence must not be reached');
      },
    } as unknown as IDatabaseAdapter;
    const service = new McpReadService(db, {
      principalId: 'principal-1',
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      scopes: new Set(['DOMAIN_READ']),
    });
    await expect(service.domainPosture('domain-1')).rejects.toThrow('MCP scope denied');
  });

  it('does not let a case-read principal enumerate signals', async () => {
    const db = {
      select: async () => {
        throw new Error('persistence must not be reached');
      },
    } as unknown as IDatabaseAdapter;
    const service = new McpReadService(db, {
      principalId: 'principal-1',
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      scopes: new Set(['CASE_READ']),
    });
    await expect(service.signalList()).rejects.toThrow('MCP scope denied');
  });
});
