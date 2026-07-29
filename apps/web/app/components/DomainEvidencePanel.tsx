import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';

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
  return item.success && item.probeData?.status !== 'UNKNOWN' && !item.probeData?.unknown;
}

export function unknownForEvidence(
  item: EvidenceResponse['evidence'][number]
): Unknown | undefined {
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

  if (profile.isLoading || evidence.isLoading) {
    return (
      <p className="text-sm text-gray-500" role="status">
        Loading evidence coverage…
      </p>
    );
  }
  if (profile.error || evidence.error) {
    return (
      <div className="text-sm text-gray-600" role="alert">
        Evidence setup status is currently unavailable.
        <button
          type="button"
          className="ml-2 font-medium underline"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['domain-profile', domain] });
            void queryClient.invalidateQueries({ queryKey: ['domain-evidence', domain] });
          }}
        >
          Retry
        </button>
      </div>
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
    <section className="space-y-3" aria-labelledby={headingId}>
      <div>
        <h3 id={headingId} className="font-semibold text-gray-900">
          Evidence coverage
        </h3>
        <p className="text-sm text-gray-500">
          Known risk and completed evidence are separate. Unknown checks are never healthy.
        </p>
      </div>
      {uniqueSetup.length > 0 ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-3"
          data-testid="domain-needs-setup-evidence"
        >
          <h4 className="font-medium text-amber-900">Needs setup/evidence</h4>
          <ul className="mt-2 space-y-2 text-sm text-amber-900">
            {uniqueSetup.map((unknown) => (
              <li key={`${unknown.reason}-${unknown.action}-${unknown.explanation}`}>
                <span className="font-medium">{unknown.actionLabel}:</span> {unknown.explanation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {profile.data?.profile ? (
        <p className="text-sm text-gray-600">
          Purpose: <span className="font-medium">{profile.data.profile.purpose}</span> ·
          Criticality: <span className="font-medium">{profile.data.profile.criticality}</span>
        </p>
      ) : null}
      {observed.length > 0 ? (
        <p className="text-sm text-green-700" data-testid="domain-current-evidence">
          {observed.length} probe observation{observed.length === 1 ? '' : 's'} recorded with
          current evidence.
        </p>
      ) : null}
    </section>
  );
}
