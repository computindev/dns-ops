import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';

const listCases = vi.fn();
const getCase = vi.fn();
const setCaseDisposition = vi.fn();
const findAllDomains = vi.fn();
const findDomainById = vi.fn();
vi.mock('@dns-ops/db', () => ({
  DomainRepository: class {
    findAll = findAllDomains;
    findById = findDomainById;
  },
  OperationalConditionService: class {
    listCases = listCases;
    getCase = getCase;
    setCaseDisposition = setCaseDisposition;
  },
}));

import { caseRoutes } from './cases.js';

function app(tenantId = 'tenant-1', actorId = 'actor-1') {
  const server = new Hono<Env>();
  server.use('*', async (c, next) => {
    c.set('db', {} as Env['Variables']['db']);
    c.set('tenantId', tenantId);
    c.set('actorId', actorId);
    await next();
  });
  server.route('/cases', caseRoutes);
  return server;
}

describe('caseRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllDomains.mockResolvedValue([]);
  });

  it('passes only request-context tenant scope to list and get operations', async () => {
    listCases.mockResolvedValueOnce([]);
    getCase.mockResolvedValueOnce(null);
    const server = app();
    expect((await server.request('/cases?domainId=domain-1')).status).toBe(200);
    expect(listCases).toHaveBeenLastCalledWith('tenant-1', 'domain-1');
    expect((await server.request('/cases/case-foreign')).status).toBe(404);
    expect(getCase).toHaveBeenLastCalledWith('tenant-1', 'case-foreign');
  });

  it('adds only a tenant-owned domain label to case responses', async () => {
    listCases.mockResolvedValueOnce([
      {
        case: { id: 'case-1' },
        signal: { id: 'signal-1', domainId: 'domain-1' },
      },
    ]);
    findAllDomains.mockResolvedValueOnce([
      { id: 'domain-1', tenantId: 'tenant-1', name: 'operator.example' },
    ]);
    const response = await app().request('/cases');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cases: [
        {
          case: { id: 'case-1' },
          signal: { id: 'signal-1', domainId: 'domain-1' },
          domain: { id: 'domain-1', name: 'operator.example' },
        },
      ],
    });
    expect(findAllDomains).toHaveBeenCalledWith({ tenantId: 'tenant-1' });

    getCase.mockResolvedValueOnce({
      case: { id: 'case-foreign' },
      signal: { id: 'signal-foreign', domainId: 'domain-foreign' },
      events: [],
    });
    findDomainById.mockResolvedValueOnce({
      id: 'domain-foreign',
      tenantId: 'tenant-2',
      name: 'foreign.example',
    });
    expect((await app().request('/cases/case-foreign')).status).toBe(404);
  });

  it('uses actor context and returns a stable stale-version conflict', async () => {
    setCaseDisposition.mockRejectedValueOnce(
      Object.assign(new Error('stale'), { code: 'OPERATION_CONFLICT' })
    );
    const response = await app().request('/cases/case-1/disposition', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disposition: 'Investigating', expectedVersion: 2 }),
    });
    expect(response.status).toBe(409);
    expect(setCaseDisposition).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      caseId: 'case-1',
      disposition: 'Investigating',
      expectedVersion: 2,
    });
  });
});
