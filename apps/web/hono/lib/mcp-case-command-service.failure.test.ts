import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  openCanonicalCase: vi.fn(),
}));

vi.mock('@dns-ops/db', () => ({
  McpCommandRepository: class {
    claim = mocks.claim;
    complete = mocks.complete;
  },
  OperationalConditionService: class {
    openCanonicalCase = mocks.openCanonicalCase;
  },
}));

import { McpCaseCommandService } from './mcp-case-command-service.js';

describe('McpCaseCommandService command failures', () => {
  it('persists a deterministic failed case-open result instead of leaving the command pending', async () => {
    mocks.claim.mockResolvedValue({ state: 'CLAIMED', command: { id: 'command-1' } });
    mocks.openCanonicalCase.mockRejectedValue(new Error('database unavailable'));
    mocks.complete.mockResolvedValue(undefined);

    const service = new McpCaseCommandService({} as never, {
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      actorId: 'actor-1',
      scopes: new Set(['CASE_WRITE']),
    });

    await expect(
      service.caseOpen({
        domainId: 'domain-1',
        conditionKey: 'mail.no-spf-record',
        idempotencyKey: 'key-1',
      })
    ).resolves.toEqual({
      ok: false,
      error: { code: 'COMMAND_FAILED', message: 'Case open failed' },
      replayed: false,
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      'tenant-1',
      'command-1',
      expect.objectContaining({ error: expect.objectContaining({ code: 'COMMAND_FAILED' }) }),
      undefined,
      'FAILED'
    );
  });
});
