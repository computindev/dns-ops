import { describe, expect, it } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { mcpCommands } from '../schema/index.js';
import { McpCommandRepository } from './mcp-command.js';

function createDb() {
  const rows: Array<Record<string, unknown>> = [];
  const db = {
    async selectWhere(table: unknown) {
      return table === mcpCommands ? rows : [];
    },
    async insert(table: unknown, values: Record<string, unknown>) {
      if (table !== mcpCommands) throw new Error('Unexpected table');
      const row = {
        id: `command-${rows.length + 1}`,
        status: 'PENDING',
        response: null,
        completedAt: null,
        ...values,
      };
      rows.push(row);
      return row;
    },
    async updateOne(table: unknown, values: Record<string, unknown>) {
      if (table !== mcpCommands || !rows[0] || rows[0].status !== 'PENDING') return undefined;
      Object.assign(rows[0], values);
      return rows[0];
    },
  };
  return { db: db as unknown as IDatabaseAdapter, rows };
}

const input = {
  tenantId: 'tenant-1',
  actorId: 'actor-1',
  operation: 'scan_request',
  idempotencyKey: 'key-1',
  requestFingerprint: 'a'.repeat(64),
};

describe('McpCommandRepository', () => {
  it('claims once and replays the completed response', async () => {
    const { db } = createDb();
    const repository = new McpCommandRepository(db);
    const claim = await repository.claim(input);
    expect(claim.state).toBe('CLAIMED');
    if (claim.state !== 'CLAIMED') throw new Error('Expected claimed command');
    await repository.complete(
      input.tenantId,
      claim.command.id,
      { snapshotId: 'snapshot-1' },
      'snapshot-1'
    );
    await expect(repository.claim(input)).resolves.toMatchObject({
      state: 'REPLAY',
      command: { response: { snapshotId: 'snapshot-1' } },
    });
  });

  it('rejects a key reused for different input', async () => {
    const { db } = createDb();
    const repository = new McpCommandRepository(db);
    await repository.claim(input);
    await expect(
      repository.claim({ ...input, requestFingerprint: 'b'.repeat(64) })
    ).rejects.toMatchObject({ code: 'MCP_IDEMPOTENCY_CONFLICT' });
  });
});
