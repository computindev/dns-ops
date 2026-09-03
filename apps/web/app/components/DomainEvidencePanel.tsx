import {
  type EvaluationCoverage,
  evaluationCoverageOrUnknown,
  isEvaluationComplete,
} from '@dns-ops/contracts';
import type { FindingsSummaryResponse } from '@dns-ops/contracts/responses';
import type { Snapshot } from '@dns-ops/db/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { Button } from './ui/Button.js';

export type Unknown = {
  reason: string;
  explanation: string;
  action: string;
  actionLabel: string;
};

type ProfileResponse = {
  profile: { purpose: string; criticality: string; responsibleActorId?: string | null } | null;
  setup: Unknown | null;
};

export type EvidenceResponse = {
  snapshotId: string | null;
  evidence: Array<{
    id: string;
    probeType: string;
    status: string;
    success: boolean;
    errorMessage: string | null;
    freshness?: 'CURRENT' | 'STALE' | 'MISSING_BASELINE' | 'NOT_BASELINE_GATED';
    probeData?: { check?: string; status?: 'OBSERVED' | 'UNKNOWN'; unknown?: Unknown };
  }>;
};

export function deduplicateSetup(setup: Unknown[]): Unknown[] {
  return [
    ...new Map(
      setup.map((unknown) => [
        `${unknown.reason}-${unknown.action}-${unknown.explanation}`,
        unknown,
      ])
    ).values(),
  ];
}

export function isCurrentEvidence(item: EvidenceResponse['evidence'][number]): boolean {
  return (
    item.success &&
    item.probeData?.status !== 'UNKNOWN' &&
    !item.probeData?.unknown &&
    item.freshness !== 'STALE' &&
    item.freshness !== 'MISSING_BASELINE'
  );
}

export function unknownForEvidence(
  item: EvidenceResponse['evidence'][number]
): Unknown | undefined {
  if (item.freshness === 'MISSING_BASELINE') {
    return {
      reason: 'MISSING_BASELINE',
      explanation: `${item.probeType} evidence needs an accepted baseline before it can be considered current.`,
      action: 'ACCEPT_BASELINE',
      actionLabel: 'Accept baseline',
    };
  }
  if (item.freshness === 'STALE') {
    return {
      reason: 'EVIDENCE_STALE',
      explanation: `${item.probeType} evidence is older than its accepted baseline policy allows.`,
      action: 'RUN_FRESH_SCAN',
      actionLabel: 'Run a fresh scan',
    };
  }
  if (item.probeData?.unknown) return item.probeData.unknown;
  if (item.probeData?.status !== 'UNKNOWN') return undefined;
  return {
    reason: 'EVIDENCE_STALE',
    explanation: item.errorMessage || `${item.probeType} evidence is incomplete.`,
    action: 'RUN_FRESH_SCAN',
    actionLabel: 'Run a fresh scan',
  };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) throw new Error(`Evidence request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function isEvidenceComplete({
  snapshot,
  findingsSummary,
  setup,
  requestsReady = true,
}: {
  snapshot: Pick<Snapshot, 'resultState' | 'metadata'> | null;
  findingsSummary: FindingsSummaryResponse | null | undefined;
  setup: readonly Unknown[];
  requestsReady?: boolean;
}): boolean {
  if (
    !snapshot ||
    !findingsSummary ||
    !Number.isFinite(findingsSummary.total) ||
    findingsSummary.total < 0 ||
    !requestsReady ||
    setup.length > 0
  ) {
    return false;
  }
  if (snapshot.resultState !== 'complete') return false;
  if (
    !findingsSummary.findingsEvaluated ||
    !isEvaluationComplete(findingsSummary.evaluationCoverage)
  ) {
    return false;
  }
  return snapshot.metadata?.authoritativeEvidence?.state !== 'UNKNOWN';
}

function unavailableEvidence(subject: string): Unknown {
  return {
    reason: 'EVIDENCE_UNAVAILABLE',
    explanation: `${subject} is currently unavailable.`,
    action: 'RETRY',
    actionLabel: 'Retry',
  };
}

function collectionSetup(snapshot: Snapshot | null): Unknown | undefined {
  if (!snapshot || snapshot.resultState === 'complete') return undefined;
  return {
    reason: 'COLLECTION_INCOMPLETE',
    explanation:
      snapshot.resultState === 'failed'
        ? 'DNS collection failed, so evidence completeness is UNKNOWN.'
        : 'DNS collection is partial, so evidence completeness is UNKNOWN.',
    action: 'RUN_FRESH_SCAN',
    actionLabel: 'Run a fresh scan',
  };
}

function authoritativeSetup(snapshot: Snapshot | null): Unknown | undefined {
  const authoritativeEvidence = snapshot?.metadata?.authoritativeEvidence;
  if (authoritativeEvidence?.state !== 'UNKNOWN') return undefined;
  return (
    authoritativeEvidence.unknown ?? {
      reason: 'AUTHORITATIVE_EVIDENCE_UNAVAILABLE',
      explanation: 'Authoritative DNS evidence is currently UNKNOWN.',
      action: 'RETRY_PROBE',
      actionLabel: 'Retry authoritative evidence',
    }
  );
}

function evaluationSetup(findingsSummary: FindingsSummaryResponse | null | undefined): Unknown[] {
  if (!findingsSummary) return [];
  const coverage: EvaluationCoverage = evaluationCoverageOrUnknown(
    findingsSummary.evaluationCoverage
  );
  return coverage.errors.map((evaluationError) => evaluationError.unknown);
}

export function DomainEvidencePanel({
  domain,
  snapshot,
  findingsSummary,
}: {
  domain: string;
  snapshot: Snapshot | null;
  findingsSummary?: FindingsSummaryResponse | null;
}) {
  const headingId = useId();
  const coverageHeadingId = `${headingId}-coverage`;
  const findingsHeadingId = `${headingId}-findings`;
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['domain-profile', domain],
    queryFn: ({ signal }) =>
      fetchJson<ProfileResponse>(`/api/domains/${encodeURIComponent(domain)}/profile`, signal),
  });
  const evidence = useQuery({
    queryKey: ['domain-evidence', domain],
    queryFn: ({ signal }) =>
      fetchJson<EvidenceResponse>(`/api/domains/${encodeURIComponent(domain)}/evidence`, signal),
  });

  const retry = () => {
    void queryClient.invalidateQueries({ queryKey: ['domain-profile', domain] });
    void queryClient.invalidateQueries({ queryKey: ['domain-evidence', domain] });
  };

  const collectionUnknown = collectionSetup(snapshot);
  const authoritativeUnknown = authoritativeSetup(snapshot);
  const setup: Unknown[] = [
    ...(profile.data?.setup ? [profile.data.setup] : []),
    ...(evidence.data?.evidence
      .map(unknownForEvidence)
      .filter((unknown): unknown is Unknown => Boolean(unknown)) ?? []),
    ...(profile.error ? [unavailableEvidence('Profile setup')] : []),
    ...(evidence.error ? [unavailableEvidence('External evidence')] : []),
    ...(profile.isLoading || evidence.isLoading
      ? [
          {
            reason: 'EVIDENCE_LOADING',
            explanation: 'Profile and external evidence status are still loading.',
            action: 'WAIT',
            actionLabel: 'Loading',
          },
        ]
      : []),
    ...(collectionUnknown ? [collectionUnknown] : []),
    ...(authoritativeUnknown ? [authoritativeUnknown] : []),
    ...evaluationSetup(findingsSummary),
    ...(findingsSummary === null ? [unavailableEvidence('Findings summary')] : []),
    ...(findingsSummary === undefined
      ? [
          {
            reason: 'FINDINGS_LOADING',
            explanation: 'Findings coverage is still loading.',
            action: 'WAIT',
            actionLabel: 'Loading',
          },
        ]
      : []),
    ...(!snapshot
      ? [
          {
            reason: 'SNAPSHOT_UNAVAILABLE',
            explanation: 'No DNS snapshot is available for this domain yet.',
            action: 'RUN_FRESH_SCAN',
            actionLabel: 'Run a fresh scan',
          },
        ]
      : []),
  ];
  const uniqueSetup = deduplicateSetup(setup);
  const profileAndEvidenceReady =
    !profile.isLoading && !profile.error && !evidence.isLoading && !evidence.error;
  const complete = isEvidenceComplete({
    snapshot,
    findingsSummary,
    setup: uniqueSetup,
    requestsReady: profileAndEvidenceReady,
  });
  const findingsCount =
    findingsSummary && Number.isFinite(findingsSummary.total) && findingsSummary.total >= 0
      ? findingsSummary.total
      : null;
  const evaluationComplete = Boolean(
    findingsSummary?.findingsEvaluated && isEvaluationComplete(findingsSummary.evaluationCoverage)
  );
  const findingsKnown = findingsCount !== null && evaluationComplete;
  const findingsCopy =
    findingsCount === null
      ? findingsSummary === null
        ? 'Findings unavailable; no numeric result is shown.'
        : 'Findings are still loading; no numeric result is shown.'
      : findingsCount === 0 && !complete
        ? '0 observed does not establish health while evidence coverage is incomplete.'
        : findingsCount === 0
          ? 'No findings detected by the current evaluated ruleset.'
          : !findingsKnown
            ? `${findingsCount} observed finding${findingsCount === 1 ? '' : 's'}; evaluation coverage is incomplete.`
            : `${findingsCount} current evaluated-ruleset finding${findingsCount === 1 ? '' : 's'} recorded.`;
  const observed = evidence.data?.evidence.filter(isCurrentEvidence) ?? [];

  return (
    <section
      className="domain-evidence ds-panel"
      aria-labelledby={headingId}
      data-state={complete ? 'complete' : 'unknown'}
      data-testid="domain-evidence-panel"
    >
      <header className="domain-evidence__header">
        <div>
          <p className="ds-kicker">Evidence integrity</p>
          <h2 id={headingId}>Evidence completeness</h2>
        </div>
        <p>Coverage and findings are separate. Unknown checks are never healthy.</p>
      </header>

      <div className="domain-evidence__metrics">
        <fieldset
          className="domain-evidence__metric ds-panel--muted"
          aria-labelledby={coverageHeadingId}
          data-state={complete ? 'complete' : 'unknown'}
          data-testid="domain-evidence-completeness"
        >
          <h3 id={coverageHeadingId}>Coverage</h3>
          <dl>
            <div>
              <dt>Evidence completeness</dt>
              <dd>
                <span className={`ds-badge ds-badge--${complete ? 'success' : 'unknown'}`}>
                  {complete ? 'Complete' : 'Needs setup/evidence'}
                </span>
              </dd>
            </div>
          </dl>
          <p
            className="domain-evidence__evaluation"
            data-state={evaluationComplete ? 'complete' : 'unknown'}
          >
            Rule evaluation coverage: {evaluationComplete ? 'Complete' : 'UNKNOWN'}.
          </p>
        </fieldset>

        <fieldset
          className="domain-evidence__metric ds-panel--muted"
          aria-labelledby={findingsHeadingId}
          data-state={findingsKnown ? 'known' : 'unknown'}
          data-testid="domain-evidence-findings"
        >
          <h3 id={findingsHeadingId}>Findings</h3>
          <dl>
            <div>
              <dt>Current evaluated ruleset</dt>
              <dd>
                {findingsCount === null ? (
                  <span className="ds-badge ds-badge--unknown">UNKNOWN</span>
                ) : findingsKnown ? (
                  <span className={`ds-badge ds-badge--${complete ? 'success' : 'unknown'}`}>
                    {findingsCount}
                  </span>
                ) : (
                  <>
                    <span className="ds-badge ds-badge--unknown">UNKNOWN</span>
                    <span>{findingsCount} observed</span>
                  </>
                )}{' '}
                {findingsCount === null
                  ? 'unavailable'
                  : findingsKnown
                    ? `finding${findingsCount === 1 ? '' : 's'}`
                    : 'findings'}
              </dd>
            </div>
          </dl>
          <p
            className="domain-evidence__finding-copy"
            role={findingsSummary === null ? 'alert' : 'status'}
          >
            {findingsCopy}
          </p>
        </fieldset>
      </div>

      {uniqueSetup.length > 0 ? (
        <section
          className="domain-evidence__setup ds-panel--muted"
          aria-labelledby={`${headingId}-setup`}
          data-testid="domain-needs-setup-evidence"
          role={profile.error || evidence.error || findingsSummary === null ? 'alert' : 'status'}
        >
          <div>
            <p className="ds-kicker">Baseline and freshness</p>
            <h3 id={`${headingId}-setup`}>Needs setup/evidence</h3>
          </div>
          <ul>
            {uniqueSetup.map((unknown) => (
              <li key={`${unknown.reason}-${unknown.action}-${unknown.explanation}`}>
                <span className="ds-badge ds-badge--unknown">{unknown.actionLabel}</span>
                <p>{unknown.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile.error || evidence.error ? (
        <div className="domain-evidence__error" role="alert">
          <p>Evidence setup status is currently unavailable.</p>
          <Button onClick={retry} size="sm" variant="quiet">
            Retry
          </Button>
        </div>
      ) : null}

      {profile.data?.profile ? (
        <dl className="domain-evidence__profile">
          <div>
            <dt>Purpose</dt>
            <dd>{profile.data.profile.purpose}</dd>
          </div>
          <div>
            <dt>Criticality</dt>
            <dd>{profile.data.profile.criticality}</dd>
          </div>
        </dl>
      ) : null}

      {observed.length > 0 ? (
        <p className="domain-evidence__current" data-testid="domain-current-evidence">
          <span className="ds-badge ds-badge--success">Current</span>
          {observed.length} probe observation{observed.length === 1 ? '' : 's'} recorded with
          current evidence.
        </p>
      ) : null}
    </section>
  );
}
