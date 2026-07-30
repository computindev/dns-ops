import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  openCanonicalCase: vi.fn(),
  setCaseDisposition: vi.fn(),
}));

vi.mock('@dns-ops/db', () => ({
  McpCommandRepository: class {
    claim = mocks.claim;
    complete = mocks.complete;
  },
  OperationalConditionService: class {
    openCanonicalCase = mocks.openCanonicalCase;
    setCaseDisposition = mocks.setCaseDisposition;
  },
}));

import { McpCaseCommandService } from './mcp-case-command-service.js';

describe('McpCaseCommandService command failures', () => {
  afterEach(() => vi.clearAllMocks());

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

  it('replays a duplicate case-open key without another canonical-service invocation', async () => {
    const response = {
      ok: true,
      value: { case: { id: 'case-1' }, signal: { id: 'signal-1' } },
      replayed: false,
    } as const;
    mocks.claim
      .mockResolvedValueOnce({ state: 'CLAIMED', command: { id: 'command-1' } })
      .mockResolvedValueOnce({ state: 'REPLAY', command: { id: 'command-1', response } });
    mocks.openCanonicalCase.mockResolvedValue({
      case: { id: 'case-1' },
      signal: { id: 'signal-1' },
    });
    mocks.complete.mockResolvedValue(undefined);

    const service = new McpCaseCommandService({} as never, {
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      actorId: 'actor-1',
      scopes: new Set(['CASE_WRITE']),
    });
    const input = {
      domainId: 'domain-1',
      conditionKey: 'mail.no-spf-record',
      idempotencyKey: 'key-replay',
    };

    await expect(service.caseOpen(input)).resolves.toEqual(response);
    await expect(service.caseOpen(input)).resolves.toEqual({ ...response, replayed: true });
    expect(mocks.openCanonicalCase).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith(
      'tenant-1',
      'command-1',
      response,
      'case-1',
      'COMPLETED'
    );
  });

  it('persists a stale expectedVersion result with no internal exception leakage', async () => {
    mocks.claim.mockResolvedValue({ state: 'CLAIMED', command: { id: 'command-2' } });
    mocks.setCaseDisposition.mockRejectedValue(
      Object.assign(new Error('database conflict detail'), { code: 'OPERATION_CONFLICT' })
    );
    mocks.complete.mockResolvedValue(undefined);

    const service = new McpCaseCommandService({} as never, {
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      actorId: 'actor-1',
      scopes: new Set(['CASE_WRITE']),
    });

    await expect(
      service.caseSetDisposition({
        caseId: 'case-1',
        disposition: 'ACKNOWLEDGED',
        expectedVersion: 1,
        idempotencyKey: 'key-2',
      })
    ).resolves.toEqual({
      ok: false,
      error: { code: 'CASE_VERSION_STALE', message: 'Case version is stale' },
      replayed: false,
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      'tenant-1',
      'command-2',
      expect.objectContaining({ error: expect.objectContaining({ code: 'CASE_VERSION_STALE' }) }),
      undefined,
      'FAILED'
    );
  });
});
