/**
 * Delegation Panel Component
 *
 * Visualizes delegation data: parent zone view, authoritative servers,
 * glue records, divergence detection, and DNSSEC status.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from './ui/StateDisplay.js';

interface DelegationData {
  domain: string;
  parentZone: string;
  nameServers: Array<{ name: string; source: string }>;
  glue: Array<{ name: string; type: string; address: string }>;
  hasDivergence: boolean;
  hasDnssec: boolean;
}

interface ObservationEvidence {
  queryName: string;
  queryType: string;
  source: string;
  status: string;
  data?: Record<string, unknown>;
}

interface DelegationIssue {
  type: string;
  severity: string;
  description: string;
  details: unknown;
  evidence?: ObservationEvidence[];
}

interface DelegationResponse {
  delegation?: DelegationData;
}

interface DelegationIssuesResponse {
  issues?: DelegationIssue[];
}

interface DelegationPanelProps {
  snapshotId: string | null;
}

async function fetchDelegationData(snapshotId: string): Promise<{
  delegation: DelegationData | null;
  issues: DelegationIssue[];
}> {
  const [delegationRes, issuesRes] = await Promise.all([
    fetch(`/api/snapshot/${snapshotId}/delegation`, { credentials: 'include' }),
    fetch(`/api/snapshot/${snapshotId}/delegation/issues`, { credentials: 'include' }),
  ]);

  if (!delegationRes.ok) {
    throw new Error(
      `Failed to load delegation: ${delegationRes.status} ${delegationRes.statusText}`
    );
  }
  if (!issuesRes.ok) {
    throw new Error(
      `Failed to load delegation issues: ${issuesRes.status} ${issuesRes.statusText}`
    );
  }

  const [delegationData, issuesData] = await Promise.all([
    delegationRes.json() as Promise<DelegationResponse>,
    issuesRes.json() as Promise<DelegationIssuesResponse>,
  ]);

  return {
    delegation: delegationData.delegation || null,
    issues: issuesData.issues || [],
  };
}

export function DelegationPanel({ snapshotId }: DelegationPanelProps) {
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['delegation', snapshotId],
    queryFn: () => fetchDelegationData(snapshotId!),
    enabled: !!snapshotId,
  });

  if (!snapshotId) {
    return (
      <div data-testid="delegation-no-snapshot-state">
        <EmptyState
          icon="globe"
          title="No delegation data available"
          description="Collect a DNS snapshot to view delegation analysis."
          size="sm"
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div data-testid="delegation-loading-state">
        <LoadingState message="Loading delegation data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="delegation-error-state">
        <ErrorState message={error.message} />
      </div>
    );
  }

  if (!data?.delegation) {
    return (
      <div data-testid="delegation-no-data-state">
        <EmptyState
          icon="globe"
          title="No delegation data available"
          description="Delegation collection may not have been enabled for this snapshot."
        />
      </div>
    );
  }

  const { delegation, issues } = data;

  return (
    <div className="space-y-6" data-testid="delegation-panel">
      {issues.length > 0 && (
        <div className="space-y-3">
          {issues.map((issue) => (
            <IssueCard
              key={`${issue.type}-${issue.severity}-${issue.description}`}
              issue={issue}
              isExpanded={
                expandedIssueId === `${issue.type}-${issue.severity}-${issue.description}`
              }
              onToggle={() =>
                setExpandedIssueId(
                  expandedIssueId === `${issue.type}-${issue.severity}-${issue.description}`
                    ? null
                    : `${issue.type}-${issue.severity}-${issue.description}`
                )
              }
            />
          ))}
        </div>
      )}

      <section>
        <h4 className="font-medium text-gray-900 mb-3">Parent Zone Delegation</h4>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-gray-500">Domain</span>
              <p className="font-mono text-sm">{delegation.domain}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Parent Zone</span>
              <p className="font-mono text-sm">{delegation.parentZone}</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h4 className="font-medium text-gray-900 mb-3">Name Servers</h4>
        <div className="space-y-2">
          {delegation.nameServers.length > 0 ? (
            delegation.nameServers.map((ns) => (
              <div
                key={`${ns.name}-${ns.source}`}
                className="flex items-center justify-between p-3 bg-white border rounded-lg"
              >
                <code className="font-mono text-sm">{ns.name}</code>
                <span className="text-xs text-gray-500">via {ns.source}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No name servers found</p>
          )}
        </div>
      </section>

      <section>
        <h4 className="font-medium text-gray-900 mb-3">Glue Records</h4>
        {delegation.glue.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {delegation.glue.map((g) => (
              <div
                key={`${g.name}-${g.type}-${g.address}`}
                className="p-3 bg-white border rounded-lg"
              >
                <div className="font-mono text-sm">{g.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      g.type === 'A' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {g.type}
                  </span>
                  <code className="text-sm text-gray-600">{g.address}</code>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No glue records found</p>
        )}
      </section>

      <section className="flex items-center gap-3 pt-4 border-t">
        <StatusBadge
          label="DNSSEC"
          status={delegation.hasDnssec ? 'present' : 'absent'}
          color={delegation.hasDnssec ? 'green' : 'gray'}
        />
        <StatusBadge
          label="Divergence"
          status={delegation.hasDivergence ? 'detected' : 'none'}
          color={delegation.hasDivergence ? 'red' : 'green'}
        />
      </section>
    </div>
  );
}

function IssueCard({
  issue,
  isExpanded,
  onToggle,
}: {
  issue: DelegationIssue;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasEvidence = issue.evidence && issue.evidence.length > 0;

  const severityColors = {
    critical: { bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
    high: { bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
    medium: { bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
    low: { bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  };

  const colors =
    severityColors[issue.severity as keyof typeof severityColors] || severityColors.medium;

  return (
    <div className={`rounded-lg border ${colors.bg}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 ${colors.dot}`} />
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">{issue.description}</h4>
            <p className="text-sm text-gray-600 mt-1 capitalize">
              {issue.type.replace(/-/g, ' ')} • {issue.severity} severity
            </p>
          </div>
          {hasEvidence && (
            <button
              type="button"
              onClick={onToggle}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <svg
                aria-hidden="true"
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
              Evidence
            </button>
          )}
        </div>
      </div>

      {isExpanded && hasEvidence && (
        <div className="border-t border-gray-200 bg-white/50 p-4">
          <h5 className="text-xs font-medium text-gray-500 uppercase mb-3">
            Observation Evidence ({issue.evidence?.length})
          </h5>
          <div className="space-y-3">
            {issue.evidence?.map((evidence) => (
              <EvidenceCard
                key={`${evidence.queryName}-${evidence.queryType}-${evidence.source}-${evidence.status}`}
                evidence={evidence}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: ObservationEvidence }) {
  const [showRaw, setShowRaw] = useState(false);

  const statusColors: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    timeout: 'bg-yellow-100 text-yellow-700',
    nodata: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="p-3 bg-white rounded border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-gray-900">{evidence.queryName}</code>
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
              {evidence.queryType}
            </span>
            <span
              className={`px-1.5 py-0.5 text-xs rounded font-medium ${statusColors[evidence.status] || 'bg-gray-100 text-gray-600'}`}
            >
              {evidence.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Source: <span className="font-medium">{evidence.source}</span>
          </p>
        </div>
        {evidence.data && (
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-blue-600 hover:text-blue-700 ml-2"
          >
            {showRaw ? 'Hide' : 'Raw'}
          </button>
        )}
      </div>

      {showRaw && evidence.data && (
        <div className="mt-2 p-2 bg-gray-900 rounded text-xs overflow-x-auto">
          <pre className="text-gray-100 font-mono whitespace-pre-wrap">
            {JSON.stringify(evidence.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  label,
  status,
  color,
}: {
  label: string;
  status: string;
  color: 'green' | 'red' | 'gray';
}) {
  const colors = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    gray: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className={`px-3 py-1.5 rounded-lg text-sm ${colors[color]}`}>
      <span className="font-medium">{label}:</span> <span className="capitalize">{status}</span>
    </div>
  );
}
