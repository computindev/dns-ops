import {
  type InternalCaseStatus,
  type InternalSignalKind,
  internalConditionKey,
} from '@dns-ops/contracts';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import {
  alerts,
  auditEvents,
  domains,
  findings,
  type InternalCase,
  type InternalSignal,
  internalCaseEvents,
  internalCases,
  internalSignals,
  monitoredDomains,
  type NewAlert,
  type NewInternalCase,
  type NewInternalSignal,
  snapshots,
} from '../schema/index.js';

export interface ObserveOperationalCondition {
  tenantId: string;
  domainId: string;
  snapshotId: string;
  kind: InternalSignalKind;
  discriminator?: string;
  monitoredDomainId: string;
  title: string;
  description: string;
  severity: NewAlert['severity'];
  triggeredByFindingId?: string;
}

export interface OperationalConditionResult {
  signal: InternalSignal;
  case: InternalCase;
  alert: typeof alerts.$inferSelect;
  created: { signal: boolean; case: boolean; alert: boolean };
  reopened: { signal: boolean; case: boolean; alert: boolean };
}

function requiredAnd(...conditions: SQL[]): SQL {
  const condition = and(...conditions);
  if (!condition) throw new Error('Expected at least one database predicate');
  return condition;
}

function operationConflict(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'OPERATION_CONFLICT' });
}

function isRetryableConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (String(error.code) === '23505' || String(error.code) === 'OPERATION_CONFLICT')
  );
}

class InternalSignalRepository {
  constructor(private db: IDatabaseAdapter) {}

  async findByConditionKey(tenantId: string, conditionKey: string): Promise<InternalSignal | null> {
    const rows = await this.db.selectWhere(
      internalSignals,
      eq(internalSignals.conditionKey, conditionKey)
    );
    return rows.find((row) => row.tenantId === tenantId) ?? null;
  }

  async create(data: NewInternalSignal): Promise<InternalSignal> {
    return this.db.insert(internalSignals, data);
  }

  async markObserved(signal: InternalSignal, snapshotId: string): Promise<InternalSignal> {
    const lastSeenPredicate = signal.lastSeenSnapshotId
      ? eq(internalSignals.lastSeenSnapshotId, signal.lastSeenSnapshotId)
      : isNull(internalSignals.lastSeenSnapshotId);
    const updated = await this.db.updateOne(
      internalSignals,
      {
        status: 'ACTIVE',
        lastSeenSnapshotId: snapshotId,
        lastSeenAt: new Date(),
        resolvedAt: signal.status === 'RESOLVED' ? null : signal.resolvedAt,
      },
      requiredAnd(
        eq(internalSignals.id, signal.id),
        eq(internalSignals.status, signal.status),
        lastSeenPredicate
      )
    );
    if (!updated) throw operationConflict('Signal changed during observation');
    return updated;
  }

  async resolve(signal: InternalSignal, tenantId: string): Promise<InternalSignal | null> {
    if (signal.tenantId !== tenantId) return null;
    const updated = await this.db.updateOne(
      internalSignals,
      { status: 'RESOLVED', resolvedAt: new Date() },
      requiredAnd(
        eq(internalSignals.id, signal.id),
        eq(internalSignals.status, signal.status),
        signal.lastSeenSnapshotId
          ? eq(internalSignals.lastSeenSnapshotId, signal.lastSeenSnapshotId)
          : isNull(internalSignals.lastSeenSnapshotId)
      )
    );
    if (!updated) throw operationConflict('Signal changed during resolution');
    return updated;
  }
}

class InternalCaseRepository {
  constructor(private db: IDatabaseAdapter) {}

  async findBySignalId(signalId: string, tenantId: string): Promise<InternalCase | null> {
    const rows = await this.db.selectWhere(internalCases, eq(internalCases.signalId, signalId));
    return rows.find((row) => row.tenantId === tenantId) ?? null;
  }

  async create(data: NewInternalCase, actorId = 'system'): Promise<InternalCase> {
    const internalCase = await this.db.insert(internalCases, data);
    await this.db.insert(internalCaseEvents, {
      caseId: internalCase.id,
      tenantId: internalCase.tenantId,
      actorId,
      fromStatus: null,
      toStatus: internalCase.status,
    });
    return internalCase;
  }

  async transition(
    current: InternalCase,
    status: InternalCaseStatus,
    metadata: {
      actorId?: string;
      note?: string;
      disposition?: string;
      verificationSnapshotId?: string;
    } = {}
  ): Promise<InternalCase> {
    const allowed: Record<InternalCaseStatus, InternalCaseStatus[]> = {
      OPEN: ['ACKNOWLEDGED', 'BLOCKED', 'RESOLVED', 'DISMISSED'],
      ACKNOWLEDGED: ['BLOCKED', 'RESOLVED', 'DISMISSED'],
      BLOCKED: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'],
      RESOLVED: ['OPEN'],
      DISMISSED: ['OPEN'],
    };
    if (current.status !== status && !allowed[current.status].includes(status)) {
      throw new Error(`Invalid case transition: ${current.status} -> ${status}`);
    }
    if (current.status === status) return current;
    if (status === 'RESOLVED' && !metadata.verificationSnapshotId) {
      throw new Error('Verified service evidence is required for case resolution');
    }

    const update: Partial<NewInternalCase> = {
      status,
      updatedAt: new Date(),
      version: current.version + 1,
      note: metadata.note ?? current.note,
      disposition: metadata.disposition ?? current.disposition,
    };
    if (status === 'ACKNOWLEDGED') {
      update.acknowledgedAt = new Date();
      update.acknowledgedBy = metadata.actorId;
    }
    if (status === 'RESOLVED') {
      update.resolvedAt = new Date();
      update.verificationSnapshotId = metadata.verificationSnapshotId;
    }
    if (status === 'OPEN') {
      update.resolvedAt = null;
      update.verificationSnapshotId = null;
    }

    const transitioned = await this.db.updateOne(
      internalCases,
      update,
      requiredAnd(
        eq(internalCases.id, current.id),
        eq(internalCases.status, current.status),
        eq(internalCases.version, current.version)
      )
    );
    if (!transitioned) throw operationConflict('Case changed during transition');
    await this.db.insert(internalCaseEvents, {
      caseId: current.id,
      tenantId: current.tenantId,
      actorId: metadata.actorId ?? 'system',
      fromStatus: current.status,
      toStatus: status,
      note: metadata.note,
      disposition: metadata.disposition,
      verificationSnapshotId: metadata.verificationSnapshotId,
    });
    return transitioned;
  }
}

export class OperationalConditionService {
  constructor(private db: IDatabaseAdapter) {}

  async observe(input: ObserveOperationalCondition): Promise<OperationalConditionResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.transaction((tx) =>
          new OperationalConditionService(tx).observeTransaction(input)
        );
      } catch (error) {
        if (!isRetryableConflict(error) || attempt === 2) throw error;
      }
    }
    throw new Error('Unable to observe operational condition');
  }

  private async observeTransaction(
    input: ObserveOperationalCondition
  ): Promise<OperationalConditionResult> {
    const snapshot = await this.validateObservationOwnership(input);
    const signalRepo = new InternalSignalRepository(this.db);
    const caseRepo = new InternalCaseRepository(this.db);
    const conditionKey = internalConditionKey(
      input.tenantId,
      input.domainId,
      input.kind,
      input.discriminator
    );

    let signal = await signalRepo.findByConditionKey(input.tenantId, conditionKey);
    const signalCreated = !signal;
    const signalReopened = signal?.status === 'RESOLVED';
    if (signal?.lastSeenSnapshotId && signal.lastSeenSnapshotId !== input.snapshotId) {
      const priorSnapshot = await this.db.selectOne(
        snapshots,
        eq(snapshots.id, signal.lastSeenSnapshotId)
      );
      if (priorSnapshot && snapshot.createdAt <= priorSnapshot.createdAt) {
        throw new Error('Signal evidence must be newer than its latest observed snapshot');
      }
    }
    const existingCase = signal ? await caseRepo.findBySignalId(signal.id, input.tenantId) : null;
    const priorVerificationSnapshot = existingCase?.verificationSnapshotId
      ? await this.db.selectOne(snapshots, eq(snapshots.id, existingCase.verificationSnapshotId))
      : null;
    if (
      signalReopened &&
      (signal?.lastSeenSnapshotId === input.snapshotId ||
        existingCase?.verificationSnapshotId === input.snapshotId ||
        (priorVerificationSnapshot && snapshot.createdAt <= priorVerificationSnapshot.createdAt))
    ) {
      throw new Error('Resolved signal requires evidence newer than its resolution lifecycle');
    }

    signal = signal
      ? await signalRepo.markObserved(signal, input.snapshotId)
      : await signalRepo.create({
          tenantId: input.tenantId,
          domainId: input.domainId,
          kind: input.kind,
          conditionKey,
          status: 'ACTIVE',
          firstSeenSnapshotId: input.snapshotId,
          lastSeenSnapshotId: input.snapshotId,
        });

    let internalCase = existingCase;
    const caseCreated = !internalCase;
    const caseReopened =
      internalCase?.status === 'RESOLVED' || internalCase?.status === 'DISMISSED';
    internalCase = internalCase
      ? caseReopened
        ? await caseRepo.transition(internalCase, 'OPEN')
        : internalCase
      : await caseRepo.create({ tenantId: input.tenantId, signalId: signal.id, status: 'OPEN' });

    const existingAlerts = await this.db.selectWhere(alerts, eq(alerts.signalId, signal.id));
    let alert = existingAlerts.find((row) => row.tenantId === input.tenantId);
    const alertCreated = !alert;
    const alertReopened = alert?.status === 'resolved';
    if (!alert) {
      alert = await this.db.insert(alerts, {
        monitoredDomainId: input.monitoredDomainId,
        tenantId: input.tenantId,
        signalId: signal.id,
        dedupKey: conditionKey,
        title: input.title,
        description: input.description,
        severity: input.severity,
        triggeredByFindingId: input.triggeredByFindingId,
        status: 'pending',
      });
    } else if (alertReopened) {
      alert =
        (await this.db.updateOne(
          alerts,
          { status: 'pending', resolvedAt: null, resolutionNote: null },
          requiredAnd(eq(alerts.id, alert.id), eq(alerts.status, 'resolved'))
        )) ??
        (() => {
          throw operationConflict('Alert changed during reopen');
        })();
    }

    return {
      signal,
      case: internalCase,
      alert,
      created: { signal: signalCreated, case: caseCreated, alert: alertCreated },
      reopened: { signal: signalReopened, case: caseReopened, alert: alertReopened },
    };
  }

  private async validateObservationOwnership(input: ObserveOperationalCondition) {
    const domain = await this.db.selectOne(domains, eq(domains.id, input.domainId));
    const snapshot = await this.db.selectOne(snapshots, eq(snapshots.id, input.snapshotId));
    const monitored = await this.db.selectOne(
      monitoredDomains,
      eq(monitoredDomains.id, input.monitoredDomainId)
    );
    if (!domain || domain.tenantId !== input.tenantId) {
      throw new Error('Operational condition domain is outside the tenant');
    }
    if (!snapshot || snapshot.domainId !== input.domainId) {
      throw new Error('Operational condition snapshot does not belong to the domain');
    }
    if (
      !monitored ||
      monitored.tenantId !== input.tenantId ||
      monitored.domainId !== input.domainId
    ) {
      throw new Error('Monitored domain is outside the operational condition tenant');
    }
    if (input.triggeredByFindingId) {
      const finding = await this.db.selectOne(
        findings,
        eq(findings.id, input.triggeredByFindingId)
      );
      if (!finding || finding.snapshotId !== input.snapshotId) {
        throw new Error('Finding does not belong to the operational condition snapshot');
      }
    }
    return snapshot;
  }

  /**
   * MCP/operator case_open is intentionally constrained to an existing active
   * canonical signal. It never creates model-authored conditions, alerts, or cases.
   */
  async openCanonicalCase(
    tenantId: string,
    domainId: string,
    conditionKey: string
  ): Promise<{ case: InternalCase; signal: InternalSignal } | null> {
    const signals = await this.db.selectWhere(
      internalSignals,
      eq(internalSignals.conditionKey, conditionKey)
    );
    const signal = signals.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.domainId === domainId &&
        candidate.status === 'ACTIVE'
    );
    if (!signal) return null;
    const cases = await this.db.selectWhere(internalCases, eq(internalCases.signalId, signal.id));
    const internalCase = cases.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.status !== 'RESOLVED' &&
        candidate.status !== 'DISMISSED'
    );
    return internalCase ? { case: internalCase, signal } : null;
  }

  async getCase(
    tenantId: string,
    caseId: string
  ): Promise<{
    case: InternalCase;
    signal: InternalSignal;
    events: (typeof internalCaseEvents.$inferSelect)[];
  } | null> {
    const cases = await this.db.selectWhere(internalCases, eq(internalCases.id, caseId));
    const internalCase = cases.find((candidate) => candidate.tenantId === tenantId);
    if (!internalCase) return null;
    const signals = await this.db.selectWhere(
      internalSignals,
      eq(internalSignals.id, internalCase.signalId)
    );
    const signal = signals.find((candidate) => candidate.tenantId === tenantId);
    if (!signal) return null;
    const events = await this.db.selectWhere(
      internalCaseEvents,
      eq(internalCaseEvents.caseId, caseId)
    );
    return {
      case: internalCase,
      signal,
      events: events
        .filter((event) => event.tenantId === tenantId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
    };
  }

  async listCases(
    tenantId: string,
    domainId?: string
  ): Promise<Array<{ case: InternalCase; signal: InternalSignal }>> {
    const [cases, signals] = await Promise.all([
      this.db.selectWhere(internalCases, eq(internalCases.tenantId, tenantId)),
      this.db.selectWhere(internalSignals, eq(internalSignals.tenantId, tenantId)),
    ]);
    const signalsById = new Map(
      signals
        .filter((signal) => !domainId || signal.domainId === domainId)
        .map((signal) => [signal.id, signal])
    );
    return cases
      .map((internalCase) => ({
        case: internalCase,
        signal: signalsById.get(internalCase.signalId),
      }))
      .filter((item): item is { case: InternalCase; signal: InternalSignal } =>
        Boolean(item.signal)
      );
  }

  async setCaseDisposition(input: {
    tenantId: string;
    caseId: string;
    expectedVersion: number;
    disposition: string;
    actorId: string;
  }): Promise<InternalCase | null> {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new Error('Case expected version must be a positive integer');
    }
    if (!input.disposition.trim() || input.disposition.length > 500) {
      throw new Error('Case disposition must contain 1-500 characters');
    }
    return this.db.transaction(async (tx) => {
      const cases = await tx.selectWhere(internalCases, eq(internalCases.id, input.caseId));
      const current = cases.find((internalCase) => internalCase.tenantId === input.tenantId);
      if (!current) return null;
      if (current.version !== input.expectedVersion) {
        throw operationConflict('Case version is stale');
      }
      const updated = await tx.updateOne(
        internalCases,
        {
          disposition: input.disposition.trim(),
          version: current.version + 1,
          updatedAt: new Date(),
        },
        requiredAnd(
          eq(internalCases.id, current.id),
          eq(internalCases.tenantId, input.tenantId),
          eq(internalCases.version, input.expectedVersion)
        )
      );
      if (!updated) throw operationConflict('Case changed during disposition update');
      await tx.insert(internalCaseEvents, {
        caseId: current.id,
        tenantId: input.tenantId,
        actorId: input.actorId,
        fromStatus: current.status,
        toStatus: current.status,
        disposition: updated.disposition,
      });
      await tx.insert(auditEvents, {
        action: 'mcp_case_disposition_set',
        entityType: 'internal_case',
        entityId: current.id,
        tenantId: input.tenantId,
        actorId: input.actorId,
        previousValue: { disposition: current.disposition, version: current.version },
        newValue: { disposition: updated.disposition, version: updated.version },
      });
      return updated;
    });
  }

  async resolveCase(
    caseId: string,
    tenantId: string,
    verificationSnapshotId: string,
    activeConditionKeys: string[],
    note?: string,
    actorId = 'system'
  ): Promise<InternalCase | null> {
    return this.db.transaction(async (tx) => {
      const internalCase = await tx.selectOne(internalCases, eq(internalCases.id, caseId));
      if (!internalCase || internalCase.tenantId !== tenantId) return null;
      const signal = await tx.selectOne(
        internalSignals,
        eq(internalSignals.id, internalCase.signalId)
      );
      const snapshot = await tx.selectOne(snapshots, eq(snapshots.id, verificationSnapshotId));
      if (
        !signal ||
        signal.tenantId !== tenantId ||
        !snapshot ||
        snapshot.domainId !== signal.domainId
      ) {
        throw new Error('Verification snapshot does not belong to this operational condition');
      }
      const domain = await tx.selectOne(domains, eq(domains.id, snapshot.domainId));
      const lastObservedSnapshot = signal.lastSeenSnapshotId
        ? await tx.selectOne(snapshots, eq(snapshots.id, signal.lastSeenSnapshotId))
        : null;
      if (!domain || domain.tenantId !== tenantId)
        throw new Error('Verification snapshot not found');
      if (
        snapshot.createdAt <= internalCase.updatedAt ||
        (lastObservedSnapshot && snapshot.createdAt <= lastObservedSnapshot.createdAt) ||
        snapshot.resultState !== 'complete' ||
        snapshot.metadata?.evaluation?.state !== 'COMPLETE'
      ) {
        throw new Error('Fresh complete evidence is required to resolve this case');
      }
      if (activeConditionKeys.includes(signal.conditionKey)) {
        throw new Error('Verification evidence still reproduces the operational condition');
      }

      const resolved = await new InternalCaseRepository(tx).transition(internalCase, 'RESOLVED', {
        actorId,
        note,
        verificationSnapshotId,
      });
      await new InternalSignalRepository(tx).resolve(signal, tenantId);
      const linkedAlerts = await tx.selectWhere(alerts, eq(alerts.signalId, signal.id));
      const alert = linkedAlerts.find((row) => row.tenantId === tenantId);
      if (alert && alert.status !== 'resolved') {
        const resolvedAlert = await tx.updateOne(
          alerts,
          { status: 'resolved', resolvedAt: new Date(), resolutionNote: note },
          requiredAnd(eq(alerts.id, alert.id), eq(alerts.status, alert.status))
        );
        if (!resolvedAlert) throw operationConflict('Alert changed during resolution');
      }
      return resolved;
    });
  }
}
