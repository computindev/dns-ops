import { createHash } from 'node:crypto';
import { DomainRepository, type IDatabaseAdapter, McpCommandRepository } from '@dns-ops/db';
import type { Context } from 'hono';
import type { Env } from '../types.js';
import { proxyToCollector } from './collector-proxy.js';
import { type AuthenticatedMcpPrincipal, requireMcpScope } from './mcp-auth.js';

function fingerprint(input: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(input).sort()))
    .digest('hex');
}

export class McpScanService {
  constructor(
    private context: Context<Env>,
    private db: IDatabaseAdapter,
    private principal: AuthenticatedMcpPrincipal
  ) {}

  async request(input: { domainId: string; idempotencyKey: string }) {
    requireMcpScope(this.principal, 'SCAN_REQUEST');
    if (!input.domainId || !input.idempotencyKey) {
      return {
        ok: false,
        error: { code: 'INVALID_ARGUMENT', message: 'domainId and idempotencyKey are required' },
        replayed: false,
      };
    }
    const domain = await new DomainRepository(this.db).findById(input.domainId);
    if (!domain || domain.tenantId !== this.principal.tenantId) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Registered domain not found' },
        replayed: false,
      };
    }
    const commands = new McpCommandRepository(this.db);
    const claim = await commands.claim({
      tenantId: this.principal.tenantId,
      actorId: this.principal.actorId,
      operation: 'scan_request',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint(input),
    });
    if (claim.state === 'REPLAY') {
      if (!claim.command.response) throw new Error('Completed MCP command has no response');
      return { ...(claim.command.response as object), replayed: true };
    }
    const proxied = await proxyToCollector(this.context, {
      path: '/api/collect/domain',
      method: 'POST',
      body: JSON.stringify({
        domain: domain.normalizedName,
        zoneManagement: domain.zoneManagement,
        triggeredBy: this.principal.actorId,
      }),
    });
    if (proxied instanceof Response) {
      const result = {
        ok: false,
        error: { code: 'COLLECTOR_UNAVAILABLE', message: 'Collector unavailable' },
        replayed: false,
      };
      await commands.complete(
        this.principal.tenantId,
        claim.command.id,
        result,
        undefined,
        'FAILED'
      );
      return result;
    }
    const result:
      | { ok: true; value: Record<string, unknown>; replayed: false }
      | { ok: false; error: { code: string; message: string }; replayed: false } = proxied.ok
      ? { ok: true, value: proxied.json as Record<string, unknown>, replayed: false }
      : {
          ok: false,
          error: {
            code: `COLLECTOR_${proxied.status}`,
            message: 'Collector rejected scan request',
          },
          replayed: false,
        };
    const resourceId =
      result.ok && typeof result.value.snapshotId === 'string'
        ? result.value.snapshotId
        : undefined;
    await commands.complete(
      this.principal.tenantId,
      claim.command.id,
      result,
      resourceId,
      result.ok ? 'COMPLETED' : 'FAILED'
    );
    return result;
  }
}
