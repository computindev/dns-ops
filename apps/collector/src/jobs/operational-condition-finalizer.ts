import type { InternalSignalKind } from '@dns-ops/contracts';
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
    default:
      throw new Error(`Unsupported canonical finalizer signal: ${kind}`);
  }
}

/**
 * The sole canonical notification boundary. Evaluator output never sends directly;
 * only a newly-created or reopened canonical alert is delivered.
 */
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
    send: (
      alertId: string,
      webhookUrl: string,
      alert: CanonicalConditionOutcome['alert']
    ) => Promise<unknown>;
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
    if (input.webhookUrl && (outcome.created.alert || outcome.reopened.alert)) {
      await dependencies.send(outcome.alert.id, input.webhookUrl, outcome.alert);
    }
  }
  return { evaluation, outcomes };
}
