import { createHash } from 'node:crypto';
import {
  type IDatabaseAdapter,
  McpCommandRepository,
  OperationalConditionService,
} from '@dns-ops/db';
import { type AuthenticatedMcpPrincipal, requireMcpScope } from './mcp-auth.js';

export type McpCommandResult =
  | { ok: true; value: Record<string, unknown>; replayed: boolean }
  | { ok: false; error: { code: string; message: string }; replayed: boolean };

function fingerprint(value: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
  );
  return createHash('sha256').update(canonical).digest('hex');
}

function errorResult(code: string, message: string): McpCommandResult {
  return { ok: false, error: { code, message }, replayed: false };
}

function replayResult(response: Record<string, unknown>): McpCommandResult {
  return response as McpCommandResult;
}

/** Command adapter used by MCP only; all principal data is bearer-derived. */
export class McpCaseCommandService {
  constructor(
    private db: IDatabaseAdapter,
    private principal: AuthenticatedMcpPrincipal
  ) {}

  async caseOpen(input: {
    domainId: string;
    conditionKey: string;
    idempotencyKey: string;
  }): Promise<McpCommandResult> {
    requireMcpScope(this.principal, 'CASE_WRITE');
    if (!input.domainId || !input.conditionKey || !input.idempotencyKey) {
      return errorResult(
        'INVALID_ARGUMENT',
        'domainId, conditionKey, and idempotencyKey are required'
      );
    }
    const commands = new McpCommandRepository(this.db);
    const claim = await commands.claim({
      tenantId: this.principal.tenantId,
      actorId: this.principal.actorId,
      operation: 'case_open',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint(input),
    });
    if (claim.state === 'REPLAY') {
      if (!claim.command.response) throw new Error('Completed MCP command has no response');
      return { ...replayResult(claim.command.response), replayed: true };
    }
    let result: McpCommandResult;
    let resourceId: string | undefined;
    try {
      const found = await new OperationalConditionService(this.db).openCanonicalCase(
        this.principal.tenantId,
        input.domainId,
        input.conditionKey
      );
      if (found) {
        resourceId = found.case.id;
        result = { ok: true, value: { case: found.case, signal: found.signal }, replayed: false };
      } else {
        result = errorResult('NOT_FOUND', 'Active canonical case not found');
      }
    } catch {
      result = errorResult('COMMAND_FAILED', 'Case open failed');
    }
    await commands.complete(
      this.principal.tenantId,
      claim.command.id,
      result as unknown as Record<string, unknown>,
      resourceId,
      result.ok ? 'COMPLETED' : 'FAILED'
    );
    return result;
  }

  async caseSetDisposition(input: {
    caseId: string;
    disposition: string;
    expectedVersion: number;
    idempotencyKey: string;
  }): Promise<McpCommandResult> {
    requireMcpScope(this.principal, 'CASE_WRITE');
    if (
      !input.caseId ||
      !input.disposition ||
      !input.idempotencyKey ||
      !Number.isInteger(input.expectedVersion)
    ) {
      return errorResult(
        'INVALID_ARGUMENT',
        'caseId, disposition, expectedVersion, and idempotencyKey are required'
      );
    }
    const commands = new McpCommandRepository(this.db);
    const claim = await commands.claim({
      tenantId: this.principal.tenantId,
      actorId: this.principal.actorId,
      operation: 'case_set_disposition',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint(input),
    });
    if (claim.state === 'REPLAY') {
      if (!claim.command.response) throw new Error('Completed MCP command has no response');
      return { ...replayResult(claim.command.response), replayed: true };
    }
    let result: McpCommandResult;
    try {
      const updated = await new OperationalConditionService(this.db).setCaseDisposition({
        tenantId: this.principal.tenantId,
        actorId: this.principal.actorId,
        caseId: input.caseId,
        disposition: input.disposition,
        expectedVersion: input.expectedVersion,
      });
      result = updated
        ? { ok: true, value: { case: updated }, replayed: false }
        : errorResult('NOT_FOUND', 'Case not found');
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error && error.code === 'OPERATION_CONFLICT'
          ? 'CASE_VERSION_STALE'
          : 'COMMAND_FAILED';
      result = errorResult(
        code,
        code === 'CASE_VERSION_STALE' ? 'Case version is stale' : 'Case disposition update failed'
      );
    }
    await commands.complete(
      this.principal.tenantId,
      claim.command.id,
      result as unknown as Record<string, unknown>,
      result.ok ? input.caseId : undefined,
      result.ok ? 'COMPLETED' : 'FAILED'
    );
    return result;
  }
}
