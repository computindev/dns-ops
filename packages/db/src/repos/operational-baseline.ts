import {
  type InternalSignalKind,
  normalizeOperationalDiscriminator,
  type OperationalConditionBaselinePolicy,
  type SupportedOperationalBaseline,
} from '@dns-ops/contracts';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import {
  auditEvents,
  domains,
  type OperationalConditionBaseline,
  operationalConditionBaselines,
  snapshots,
} from '../schema/index.js';

function requiredAnd(...conditions: SQL[]): SQL {
  const condition = and(...conditions);
  if (!condition) throw new Error('Expected baseline predicates');
  return condition;
}

type BaselinePolicyInput =
  | {
      kind: 'TLS_CERTIFICATE_REGRESSION';
      policy: Extract<
        SupportedOperationalBaseline,
        { signalKind: 'TLS_CERTIFICATE_REGRESSION' }
      >['policy'];
    }
  | {
      kind: 'MAIL_DNS_CONFIGURATION_REGRESSION';
      policy: Extract<
        SupportedOperationalBaseline,
        { signalKind: 'MAIL_DNS_CONFIGURATION_REGRESSION' }
      >['policy'];
    };

export type AcceptOperationalBaseline = BaselinePolicyInput & {
  tenantId: string;
  domainId: string;
  discriminator: string;
  sourceSnapshotId: string;
  maxEvidenceAgeSeconds: number;
  actorId: string;
  actorEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function assertPolicy(
  input: AcceptOperationalBaseline
): asserts input is AcceptOperationalBaseline {
  if (input.kind === 'TLS_CERTIFICATE_REGRESSION') {
    const policy = input.policy as OperationalConditionBaselinePolicy;
    if (
      policy.kind !== 'TLS_CERTIFICATE' ||
      typeof policy.requireHostnameAuthorized !== 'boolean' ||
      typeof policy.requireChainAuthorized !== 'boolean' ||
      !Number.isInteger(policy.minimumRemainingValiditySeconds) ||
      policy.minimumRemainingValiditySeconds < 0
    )
      throw new Error('Invalid TLS certificate baseline policy');
    return;
  }
  if (input.policy.kind !== 'SPF_PRESENT') throw new Error('Invalid SPF baseline policy');
}

export class OperationalBaselineRepository {
  constructor(private db: IDatabaseAdapter) {}

  async listActive(tenantId: string, domainId: string): Promise<OperationalConditionBaseline[]> {
    return this.db.selectWhere(
      operationalConditionBaselines,
      requiredAnd(
        eq(operationalConditionBaselines.tenantId, tenantId),
        eq(operationalConditionBaselines.domainId, domainId),
        isNull(operationalConditionBaselines.supersededAt)
      )
    );
  }

  async findActive(
    tenantId: string,
    domainId: string,
    kind: InternalSignalKind,
    discriminator: string
  ): Promise<OperationalConditionBaseline | null> {
    const normalized = normalizeOperationalDiscriminator(discriminator);
    const rows = await this.db.selectWhere(
      operationalConditionBaselines,
      requiredAnd(
        eq(operationalConditionBaselines.tenantId, tenantId),
        eq(operationalConditionBaselines.domainId, domainId),
        eq(operationalConditionBaselines.kind, kind),
        eq(operationalConditionBaselines.discriminator, normalized),
        isNull(operationalConditionBaselines.supersededAt)
      )
    );
    return rows[0] ?? null;
  }

  async accept(input: AcceptOperationalBaseline): Promise<OperationalConditionBaseline> {
    if (!Number.isInteger(input.maxEvidenceAgeSeconds) || input.maxEvidenceAgeSeconds < 1) {
      throw new Error('Baseline max evidence age must be a positive integer');
    }
    assertPolicy(input);
    const discriminator = normalizeOperationalDiscriminator(input.discriminator);
    return this.db.transaction(async (tx) => {
      const domain = await tx.selectOne(domains, eq(domains.id, input.domainId));
      const snapshot = await tx.selectOne(snapshots, eq(snapshots.id, input.sourceSnapshotId));
      if (!domain || domain.tenantId !== input.tenantId || snapshot?.domainId !== input.domainId) {
        throw new Error('Baseline source snapshot is outside the tenant domain');
      }
      const active = await tx.selectWhere(
        operationalConditionBaselines,
        requiredAnd(
          eq(operationalConditionBaselines.tenantId, input.tenantId),
          eq(operationalConditionBaselines.domainId, input.domainId),
          eq(operationalConditionBaselines.kind, input.kind),
          eq(operationalConditionBaselines.discriminator, discriminator),
          isNull(operationalConditionBaselines.supersededAt)
        )
      );
      const now = new Date();
      for (const prior of active) {
        const updated = await tx.updateOne(
          operationalConditionBaselines,
          { supersededAt: now, supersededBy: input.actorId },
          eq(operationalConditionBaselines.id, prior.id)
        );
        if (!updated) throw new Error('Baseline changed during supersession');
      }
      const baseline = await tx.insert(operationalConditionBaselines, {
        tenantId: input.tenantId,
        domainId: input.domainId,
        kind: input.kind,
        discriminator,
        sourceSnapshotId: input.sourceSnapshotId,
        policy: input.policy,
        maxEvidenceAgeSeconds: input.maxEvidenceAgeSeconds,
        acceptedBy: input.actorId,
      });
      await tx.insert(auditEvents, {
        action: 'operational_baseline_accepted',
        entityType: 'operational_condition_baseline',
        entityId: baseline.id,
        previousValue: active,
        newValue: baseline,
        actorId: input.actorId,
        actorEmail: input.actorEmail ?? null,
        tenantId: input.tenantId,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
      return baseline;
    });
  }
}
