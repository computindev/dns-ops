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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Evidence request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function DomainEvidencePanel({ domain }: { domain: string }) {
  const headingId = useId();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['domain-profile', domain],
    queryFn: () => fetchJson<ProfileResponse>(`/api/domains/${encodeURIComponent(domain)}/profile`),
  });
  const evidence = useQuery({
    queryKey: ['domain-evidence', domain],
    queryFn: () =>
      fetchJson<EvidenceResponse>(`/api/domains/${encodeURIComponent(domain)}/evidence`),
  });

  const retry = () => {
    void queryClient.invalidateQueries({ queryKey: ['domain-profile', domain] });
    void queryClient.invalidateQueries({ queryKey: ['domain-evidence', domain] });
  };

  if (profile.isLoading || evidence.isLoading) {
    return (
      <section className="domain-evidence ds-panel" aria-labelledby={headingId}>
        <p id={headingId} className="domain-evidence__state" role="status">
          Loading evidence coverage…
        </p>
      </section>
    );
  }
  if (profile.error || evidence.error) {
    return (
      <section className="domain-evidence ds-panel" aria-labelledby={headingId}>
        <div className="domain-evidence__error" role="alert">
          <div>
            <p className="ds-kicker">Evidence status</p>
            <h3 id={headingId}>Evidence setup is unavailable</h3>
            <p>Evidence setup status is currently unavailable.</p>
          </div>
          <Button onClick={retry} size="sm" variant="quiet">
            Retry
          </Button>
        </div>
      </section>
    );
  }

  const setup = [
    ...(profile.data?.setup ? [profile.data.setup] : []),
    ...(evidence.data?.evidence
      .map(unknownForEvidence)
      .filter((unknown): unknown is Unknown => Boolean(unknown)) ?? []),
  ];
  const uniqueSetup = deduplicateSetup(setup);
  const observed = evidence.data?.evidence.filter(isCurrentEvidence) ?? [];

  return (
    <section className="domain-evidence ds-panel" aria-labelledby={headingId}>
      <header className="domain-evidence__header">
        <div>
          <p className="ds-kicker">Evidence integrity</p>
          <h3 id={headingId}>Evidence coverage</h3>
        </div>
        <p>Known risk and completed evidence are separate. Unknown checks are never healthy.</p>
      </header>

      {uniqueSetup.length > 0 ? (
        <section
          className="domain-evidence__setup ds-panel--muted"
          aria-labelledby={`${headingId}-setup`}
          data-testid="domain-needs-setup-evidence"
        >
          <div>
            <p className="ds-kicker">Baseline and freshness</p>
            <h4 id={`${headingId}-setup`}>Needs setup/evidence</h4>
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
