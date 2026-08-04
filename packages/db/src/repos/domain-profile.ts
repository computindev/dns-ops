import type { DomainCriticality, DomainPurpose } from '@dns-ops/contracts';
import { and, eq, type SQL } from 'drizzle-orm';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import {
  auditEvents,
  type DomainProfile,
  domainProfiles,
  domains,
  type NewAuditEvent,
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

export type DomainProfileAuditContext = Omit<
  NewAuditEvent,
  'action' | 'entityType' | 'entityId' | 'previousValue' | 'newValue'
>;

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
    return this.setInternal(input);
  }

  async setWithAudit(
    input: SetDomainProfile,
    audit: DomainProfileAuditContext
  ): Promise<DomainProfile> {
    return this.setInternal(input, audit);
  }

  private async setInternal(
    input: SetDomainProfile,
    audit?: DomainProfileAuditContext
  ): Promise<DomainProfile> {
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

      let profile: DomainProfile;
      if (!existing) {
        profile = await tx.insert(domainProfiles, values);
      } else {
        const updated = await tx.updateOne(
          domainProfiles,
          { ...values, updatedAt: new Date() },
          requiredAnd(
            eq(domainProfiles.domainId, input.domainId),
            eq(domainProfiles.tenantId, input.tenantId)
          )
        );
        if (!updated) throw new Error('Domain profile changed during update');
        profile = updated;
      }
      if (audit) {
        await tx.insert(auditEvents, {
          ...audit,
          action: 'domain_profile_updated',
          entityType: 'domain_profile',
          entityId: input.domainId,
          previousValue: existing ?? null,
          newValue: profile,
        });
      }
      return profile;
    });
  }
}
