import { describe, expect, it } from 'vitest';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { auditEvents, domainProfiles, domains } from '../schema/index.js';
import { DomainProfileRepository } from './domain-profile.js';

function conditionParams(condition: unknown): unknown[] {
  if (!condition || typeof condition !== 'object') return [];
  const candidate = condition as {
    constructor?: { name?: string };
    value?: unknown;
    queryChunks?: unknown[];
  };
  if (candidate.constructor?.name === 'Param') return [candidate.value];
  return (candidate.queryChunks ?? []).flatMap(conditionParams);
}

function createDb(domainTenantId = 'tenant-1', failAuditInsert = false) {
  const domain = {
    id: 'domain-1',
    name: 'example.com',
    normalizedName: 'example.com',
    punycodeName: null,
    zoneManagement: 'unknown' as const,
    tenantId: domainTenantId,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const profiles: Array<typeof domainProfiles.$inferSelect> = [];
  const audits: Array<typeof auditEvents.$inferSelect> = [];

  const db = {
    async selectOne(table: unknown, condition: unknown) {
      const params = conditionParams(condition);
      if (table === domains) {
        return params.includes(domain.id) && params.includes(domain.tenantId) ? domain : undefined;
      }
      if (table === domainProfiles) {
        return profiles.find(
          (profile) => params.includes(profile.domainId) && params.includes(profile.tenantId)
        );
      }
      return undefined;
    },
    async selectWhere(table: unknown, condition: unknown) {
      if (table !== domainProfiles) return [];
      const params = conditionParams(condition);
      return profiles.filter((profile) => params.includes(profile.tenantId));
    },
    async insert(table: unknown, values: typeof domainProfiles.$inferInsert) {
      if (table === auditEvents) {
        if (failAuditInsert) throw new Error('audit insert failed');
        const event = {
          id: 'audit-1',
          createdAt: new Date(),
          ...values,
        } as unknown as typeof auditEvents.$inferSelect;
        audits.push(event);
        return event;
      }
      if (table !== domainProfiles) throw new Error('Unexpected table');
      const row = {
        ...values,
        responsibleActorId: values.responsibleActorId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as typeof domainProfiles.$inferSelect;
      profiles.push(row);
      return row;
    },
    async updateOne(
      table: unknown,
      values: Partial<typeof domainProfiles.$inferInsert>,
      condition: unknown
    ) {
      if (table !== domainProfiles || !profiles[0]) return undefined;
      const params = conditionParams(condition);
      if (!params.includes(profiles[0].domainId) || !params.includes(profiles[0].tenantId)) {
        return undefined;
      }
      profiles[0] = { ...profiles[0], ...values } as typeof domainProfiles.$inferSelect;
      return profiles[0];
    },
    async transaction<T>(callback: (tx: IDatabaseAdapter) => Promise<T>) {
      const profileBefore = [...profiles];
      const auditBefore = [...audits];
      try {
        return await callback(db as unknown as IDatabaseAdapter);
      } catch (error) {
        profiles.splice(0, profiles.length, ...profileBefore);
        audits.splice(0, audits.length, ...auditBefore);
        throw error;
      }
    },
  };

  return { db: db as unknown as IDatabaseAdapter, profiles, audits };
}

describe('DomainProfileRepository', () => {
  it('creates and updates the single tenant-owned profile', async () => {
    const { db, profiles } = createDb();
    const repository = new DomainProfileRepository(db);

    const created = await repository.set({
      domainId: 'domain-1',
      tenantId: 'tenant-1',
      purpose: 'WEB',
      criticality: 'HIGH',
      responsibleActorId: 'operator-1',
    });
    const updated = await repository.set({
      domainId: 'domain-1',
      tenantId: 'tenant-1',
      purpose: 'REDIRECT',
      criticality: 'NORMAL',
    });

    expect(created.purpose).toBe('WEB');
    expect(updated.purpose).toBe('REDIRECT');
    expect(updated.responsibleActorId).toBeNull();
    expect(profiles).toHaveLength(1);
    await expect(repository.listByTenant('tenant-1')).resolves.toEqual([updated]);
    await expect(repository.listByTenant('other-tenant')).resolves.toEqual([]);
    await expect(repository.findByDomainId('domain-1', 'other-tenant')).resolves.toBeNull();
  });

  it('writes profile state and attribution in one transaction', async () => {
    const { db, audits } = createDb();
    const profile = await new DomainProfileRepository(db).setWithAudit(
      { domainId: 'domain-1', tenantId: 'tenant-1', purpose: 'WEB', criticality: 'NORMAL' },
      {
        actorId: 'actor-1',
        tenantId: 'tenant-1',
        actorEmail: null,
        ipAddress: null,
        userAgent: null,
      }
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'domain_profile_updated',
      entityId: 'domain-1',
      newValue: profile,
      actorId: 'actor-1',
    });
  });

  it('rolls profile state back when audit insertion fails', async () => {
    const { db, profiles, audits } = createDb('tenant-1', true);
    await expect(
      new DomainProfileRepository(db).setWithAudit(
        { domainId: 'domain-1', tenantId: 'tenant-1', purpose: 'WEB', criticality: 'NORMAL' },
        {
          actorId: 'actor-1',
          tenantId: 'tenant-1',
          actorEmail: null,
          ipAddress: null,
          userAgent: null,
        }
      )
    ).rejects.toThrow('audit insert failed');
    expect(profiles).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('rejects cross-tenant writes', async () => {
    const { db } = createDb('tenant-1');
    await expect(
      new DomainProfileRepository(db).set({
        domainId: 'domain-1',
        tenantId: 'other-tenant',
        purpose: 'WEB',
        criticality: 'NORMAL',
      })
    ).rejects.toThrow('outside the tenant');
  });
});
