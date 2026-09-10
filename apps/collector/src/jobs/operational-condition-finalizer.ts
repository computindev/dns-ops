import type { InternalSignalKind } from '@dns-ops/contracts';
import {
  AlertRepository,
  FindingRepository,
  type IDatabaseAdapter,
  MonitoredDomainRepository,
  OperationalBaselineRepository,
  OperationalConditionService,
  ProbeObservationRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { sendAlertNotification } from '../notifications/webhook.js';
import {
  evaluateOperationalConditions,
  type PersistedConditionBaseline,
  type PersistedConditionFinding,
  type PersistedConditionProbe,
} from './operational-condition-evaluation.js';

export interface CanonicalConditionOutcome {
  created: { alert: boolean };
  reopened: { alert: boolean };
  alert: {
    id: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    status?: 'pending' | 'sent' | 'suppressed' | 'acknowledged' | 'resolved';
  };
}

export interface CanonicalConditionObserver {
  observe(input: {
    tenantId: string;
    domainId: string;
    snapshotId: string;
    kind: InternalSignalKind;
    discriminator: string;
    monitoredDomainId: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    triggeredByFindingId?: string;
  }): Promise<CanonicalConditionOutcome>;
}

export interface CanonicalConditionResolver {
  listCases(
    tenantId: string,
    domainId?: string
  ): Promise<Array<{ case: { id: string; status: string }; signal: { conditionKey: string } }>>;
  resolveCase(
    caseId: string,
    tenantId: string,
    verificationSnapshotId: string,
    evidence: {
      activeConditionKeys: string[];
      evaluatedConditionKeys: Array<{ conditionKey: string; outcome: string }>;
    }
  ): Promise<unknown>;
}

function presentation(
  kind: InternalSignalKind
): Pick<CanonicalConditionOutcome['alert'], 'title' | 'description' | 'severity'> {
  switch (kind) {
    case 'TLS_CERTIFICATE_REGRESSION':
      return {
        title: 'TLS certificate regression',
        description: 'Fresh TLS evidence violates the accepted operational baseline.',
        severity: 'high',
      };
    case 'MAIL_DNS_CONFIGURATION_REGRESSION':
      return {
        title: 'Mail DNS configuration regression',
        description: 'A baseline-required SPF record is missing from the completed scan.',
        severity: 'high',
      };
    case 'REDIRECT_TOPOLOGY_REGRESSION':
      return {
        title: 'Redirect topology regression',
        description: 'Fresh HTTP redirect evidence violates the accepted operational baseline.',
        severity: 'high',
      };
    case 'HOMEPAGE_INDEXABILITY_REGRESSION':
      return {
        title: 'Homepage indexability regression',
        description:
          'Fresh homepage indexability evidence violates the accepted operational baseline.',
        severity: 'high',
      };
    default:
      throw new Error(`Unsupported canonical finalizer signal: ${kind}`);
  }
}

function needsCanonicalDelivery(outcome: CanonicalConditionOutcome): boolean {
  const status = outcome.alert.status;
  if (
    status === 'sent' ||
    status === 'suppressed' ||
    status === 'acknowledged' ||
    status === 'resolved'
  ) {
    return false;
  }
  return outcome.created.alert || outcome.reopened.alert || status === 'pending';
}

type CanonicalAlertSender = (
  alertId: string,
  webhookUrl: string,
  alert: CanonicalConditionOutcome['alert']
) => Promise<{ success: boolean; error?: string; statusUpdated?: boolean } | undefined>;

const NOTIFICATION_LEASE_MS = 30_000;

async function deliverCanonicalAlert(
  outcome: CanonicalConditionOutcome,
  input: { tenantId: string; webhookUrl?: string },
  dependencies: {
    send: CanonicalAlertSender;
    claimPendingNotification?: (alertId: string, tenantId: string) => Promise<boolean>;
    releaseNotificationClaim?: (alertId: string, tenantId: string) => Promise<void>;
  }
) {
  if (!input.webhookUrl || !needsCanonicalDelivery(outcome)) return;
  if (dependencies.claimPendingNotification) {
    const claimed = await dependencies.claimPendingNotification(outcome.alert.id, input.tenantId);
    if (!claimed) return;
  }
  let posted = false;
  try {
    const result = await dependencies.send(outcome.alert.id, input.webhookUrl, outcome.alert);
    posted = result?.success === true;
    if (result?.statusUpdated === false) {
      throw new Error(result.error || 'Alert sent status was not persisted');
    }
    if (!posted) {
      throw new Error(result?.error || 'Canonical alert delivery failed');
    }
  } catch (error) {
    if (!posted) {
      await dependencies.releaseNotificationClaim?.(outcome.alert.id, input.tenantId);
    }
    throw error;
  }
}

/**
 * The sole canonical notification boundary. Evaluator output never sends directly;
 * created, reopened, or still-pending canonical alerts are delivered.
 */
export async function finalizePersistedCanonicalConditions(
  db: IDatabaseAdapter,
  input: { tenantId: string; domainId: string; domainName: string; snapshotId: string; now?: Date }
) {
  const snapshot = await new SnapshotRepository(db).findById(input.snapshotId);
  if (!snapshot || snapshot.domainId !== input.domainId) {
    throw new Error('Canonical finalization snapshot is outside the domain');
  }
  const monitored = await new MonitoredDomainRepository(db).findByDomainId(
    input.domainId,
    input.tenantId
  );
  if (!monitored || !monitored.isActive) {
    return { evaluation: { observations: [], setupEvidence: [] }, outcomes: [] };
  }
  const [baselines, probes, snapshotFindings] = await Promise.all([
    new OperationalBaselineRepository(db).listActive(input.tenantId, input.domainId),
    new ProbeObservationRepository(db).findBySnapshotId(input.snapshotId),
    new FindingRepository(db).findBySnapshotId(input.snapshotId),
  ]);
  const observer = new OperationalConditionService(db);
  const alerts = new AlertRepository(db);
  return finalizeCanonicalConditions(
    {
      tenantId: input.tenantId,
      domainId: input.domainId,
      domainName: input.domainName,
      snapshotId: input.snapshotId,
      snapshotComplete: snapshot.resultState === 'complete',
      monitoredDomainId: monitored.id,
      webhookUrl: monitored.alertChannels.webhook,
      baselines,
      probes,
      findings: snapshotFindings,
      now: input.now ?? new Date(),
    },
    {
      observer,
      resolver: observer,
      claimPendingNotification: async (alertId, tenantId) => {
        const claimed = await alerts.claimPendingNotification(
          alertId,
          tenantId,
          new Date(Date.now() + NOTIFICATION_LEASE_MS)
        );
        return Boolean(claimed);
      },
      releaseNotificationClaim: async (alertId, tenantId) => {
        await alerts.releaseNotificationClaim(alertId, tenantId);
      },
      send: (alertId, webhookUrl, alert) =>
        sendAlertNotification(
          alertId,
          webhookUrl,
          { ...alert, domain: input.domainName, tenantId: input.tenantId },
          db,
          process.env.WEB_APP_URL
        ),
    }
  );
}

export async function finalizeCanonicalConditions(
  input: {
    tenantId: string;
    domainId: string;
    domainName: string;
    snapshotId: string;
    snapshotComplete: boolean;
    monitoredDomainId: string;
    webhookUrl?: string;
    baselines: PersistedConditionBaseline[];
    probes: PersistedConditionProbe[];
    findings: PersistedConditionFinding[];
    now: Date;
  },
  dependencies: {
    observer: CanonicalConditionObserver;
    resolver?: CanonicalConditionResolver;
    send: CanonicalAlertSender;
    claimPendingNotification?: (alertId: string, tenantId: string) => Promise<boolean>;
    releaseNotificationClaim?: (alertId: string, tenantId: string) => Promise<void>;
  }
) {
  const evaluation = evaluateOperationalConditions(input);
  const outcomes: CanonicalConditionOutcome[] = [];
  for (const observation of evaluation.observations) {
    const view = presentation(observation.kind);
    const outcome = await dependencies.observer.observe({
      tenantId: input.tenantId,
      domainId: input.domainId,
      snapshotId: input.snapshotId,
      kind: observation.kind,
      discriminator: observation.discriminator,
      monitoredDomainId: input.monitoredDomainId,
      ...view,
      triggeredByFindingId:
        typeof observation.evidence.findingId === 'string'
          ? observation.evidence.findingId
          : undefined,
    });
    outcomes.push(outcome);
    await deliverCanonicalAlert(outcome, input, dependencies);
  }
  if (dependencies.resolver) {
    const activeConditionKeys = evaluation.observations.map(
      (observation) => observation.conditionKey
    );
    const openCases = await dependencies.resolver.listCases(input.tenantId, input.domainId);
    for (const item of openCases) {
      if (item.case.status === 'RESOLVED' || item.case.status === 'DISMISSED') continue;
      const evaluated = evaluation.evaluatedConditionKeys.find(
        (entry) => entry.conditionKey === item.signal.conditionKey
      );
      if (evaluated?.outcome !== 'HEALTHY') continue;
      if (activeConditionKeys.includes(item.signal.conditionKey)) continue;
      await dependencies.resolver.resolveCase(item.case.id, input.tenantId, input.snapshotId, {
        activeConditionKeys,
        evaluatedConditionKeys: evaluation.evaluatedConditionKeys,
      });
    }
  }
  return { evaluation, outcomes };
}
