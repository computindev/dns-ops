import { and, eq, type SQL } from 'drizzle-orm';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { type McpCommand, mcpCommands } from '../schema/index.js';

function requiredAnd(...conditions: SQL[]): SQL {
  const condition = and(...conditions);
  if (!condition) throw new Error('Expected MCP command predicates');
  return condition;
}

function commandError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export type McpCommandClaim =
  | { state: 'CLAIMED'; command: McpCommand }
  | { state: 'REPLAY'; command: McpCommand };

export class McpCommandRepository {
  constructor(private db: IDatabaseAdapter) {}

  async claim(input: {
    tenantId: string;
    actorId: string;
    operation: string;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<McpCommandClaim> {
    if (!/^[a-f0-9]{64}$/.test(input.requestFingerprint)) {
      throw new Error('MCP request fingerprint must be a SHA-256 hex digest');
    }
    const predicate = requiredAnd(
      eq(mcpCommands.tenantId, input.tenantId),
      eq(mcpCommands.actorId, input.actorId),
      eq(mcpCommands.operation, input.operation),
      eq(mcpCommands.idempotencyKey, input.idempotencyKey)
    );
    const existing = (await this.db.selectWhere(mcpCommands, predicate))[0];
    if (existing) return this.resolveExisting(existing, input.requestFingerprint);
    try {
      return { state: 'CLAIMED', command: await this.db.insert(mcpCommands, input) };
    } catch (error) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === '23505'))
        throw error;
      const raced = (await this.db.selectWhere(mcpCommands, predicate))[0];
      if (!raced) throw error;
      return this.resolveExisting(raced, input.requestFingerprint);
    }
  }

  async complete(
    tenantId: string,
    commandId: string,
    response: Record<string, unknown>,
    resourceId?: string
  ): Promise<McpCommand> {
    const completed = await this.db.updateOne(
      mcpCommands,
      { status: 'COMPLETED', response, resourceId: resourceId ?? null, completedAt: new Date() },
      requiredAnd(
        eq(mcpCommands.id, commandId),
        eq(mcpCommands.tenantId, tenantId),
        eq(mcpCommands.status, 'PENDING')
      )
    );
    if (!completed) throw commandError('MCP_COMMAND_CONFLICT', 'MCP command completion changed');
    return completed;
  }

  private resolveExisting(command: McpCommand, fingerprint: string): McpCommandClaim {
    if (command.requestFingerprint !== fingerprint) {
      throw commandError(
        'MCP_IDEMPOTENCY_CONFLICT',
        'MCP idempotency key was reused for different input'
      );
    }
    if (command.status !== 'COMPLETED' || !command.response) {
      throw commandError('MCP_COMMAND_IN_PROGRESS', 'MCP command is already in progress');
    }
    return { state: 'REPLAY', command };
  }
}
