import type { DomainCriticality, DomainPurpose } from '@dns-ops/contracts';
import { and, eq, type SQL } from 'drizzle-orm';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import {
  type DomainProfile,
  domainProfiles,
  domains,
  type NewDomainProfile,
} from '../schema/index.js';

function requiredAnd(...conditions: SQL[]): SQL {
  const condition = and(...conditions);
  if (!condition) throw new Error('Expected profile tenant predicates');
  return condition;
}

export interface SetDomainProfile {
  domainId: string;
  tenantId: string;
  purpose: DomainPurpose;
  responsibleActorId?: string;
  criticality: DomainCriticality;
}

export class DomainProfileRepository {
  constructor(private db: IDatabaseAdapter) {}

  async findByDomainId(domainId: string, tenantId: string): Promise<DomainProfile | null> {
    const profile = await this.db.selectOne(
      domainProfiles,
      requiredAnd(eq(domainProfiles.domainId, domainId), eq(domainProfiles.tenantId, tenantId))
    );
    return profile?.tenantId === tenantId ? profile : null;
  }

  async listByTenant(tenantId: string): Promise<DomainProfile[]> {
    return this.db.selectWhere(domainProfiles, eq(domainProfiles.tenantId, tenantId));
  }

  async set(input: SetDomainProfile): Promise<DomainProfile> {
    return this.db.transaction(async (tx) => {
      const domain = await tx.selectOne(
        domains,
        requiredAnd(eq(domains.id, input.domainId), eq(domains.tenantId, input.tenantId))
      );
      if (!domain || domain.tenantId !== input.tenantId) {
        throw new Error('Domain is outside the tenant');
      }

      const existing = await tx.selectOne(
        domainProfiles,
        requiredAnd(
          eq(domainProfiles.domainId, input.domainId),
          eq(domainProfiles.tenantId, input.tenantId)
        )
      );
      const values: NewDomainProfile = {
        domainId: input.domainId,
        tenantId: input.tenantId,
        purpose: input.purpose,
        responsibleActorId: input.responsibleActorId ?? null,
        criticality: input.criticality,
      };

      if (!existing) return tx.insert(domainProfiles, values);
      if (existing.tenantId !== input.tenantId)
        throw new Error('Domain profile is outside the tenant');

      const updated = await tx.updateOne(
        domainProfiles,
        { ...values, updatedAt: new Date() },
        requiredAnd(
          eq(domainProfiles.domainId, input.domainId),
          eq(domainProfiles.tenantId, input.tenantId)
        )
      );
      if (!updated) throw new Error('Domain profile changed during update');
      return updated;
    });
  }
}
