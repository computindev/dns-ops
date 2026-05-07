import type { Observation, Snapshot } from '@dns-ops/db/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type KeyboardEvent, useCallback, useEffect, useId, useState } from 'react';
import { AuthPending } from '../../components/AuthPending.js';
import { DelegationPanel } from '../../components/DelegationPanel.js';
import { DiscoveredSelectors } from '../../components/DiscoveredSelectors.js';
import { DNSViews } from '../../components/DNSViews.js';
import { MailFindingsPanel } from '../../components/MailFindingsPanel.js';
import { MailDiagnostics } from '../../components/mail/index.js';
import { NotesPanel } from '../../components/NotesPanel.js';
import { SimulationPanel } from '../../components/SimulationPanel.js';
import { SnapshotHistoryPanel } from '../../components/SnapshotHistoryPanel.js';
import { ResultStateBadge, ZoneManagementBadge } from '../../components/StatusBadges.js';
import { TagsPanel } from '../../components/TagsPanel.js';
import { isDelegationTabEnabled, isSimulationEnabled } from '../../config/features.js';

type DomainTabId = 'overview' | 'dns' | 'mail' | 'history' | 'delegation';

/**
 * Loader error types for differentiated error handling
 */
export type LoaderErrorType = 'api_unreachable' | 'fetch_error';

export interface LoaderError {
  type: LoaderErrorType;
  message: string;
}

export interface DomainLoaderData {
  domain: string;
  snapshot: Snapshot | null;
  observations: Observation[];
  error?: LoaderError;
}

interface DomainSearchParams {
  tab?: DomainTabId;
  addToPortfolio?: boolean;
}

// Delegation tab is controlled by feature flag (shipped by default)
const DELEGATION_ENABLED = isDelegationTabEnabled();
const SIMULATION_ENABLED = isSimulationEnabled();
const BASE_TABS: DomainTabId[] = ['overview', 'dns', 'mail', 'history'];
const ALL_TABS: DomainTabId[] = DELEGATION_ENABLED ? [...BASE_TABS, 'delegation'] : BASE_TABS;
const VALID_TABS: DomainTabId[] = ALL_TABS;

import { requireAuthGuard } from '../../lib/auth-guard.js';

export const Route = createFileRoute('/domain/$domain')({
  component: Domain360Page,
  beforeLoad: async () => {
    await requireAuthGuard();
  },
  pendingComponent: AuthPending,
  validateSearch: (search: Record<string, unknown>): DomainSearchParams => {
    const tab = search.tab as string | undefined;
    return {
      tab: tab && VALID_TABS.includes(tab as DomainTabId) ? (tab as DomainTabId) : undefined,
      addToPortfolio: search.addToPortfolio === 'true' || search.addToPortfolio === true,
    };
  },
  loader: ({ params }): DomainLoaderData => {
    // Loader only provides the domain name from route params.
    // Data fetching is handled by TanStack Query (useQuery) in the
    // component so it remains interceptable by Playwright E2E mocks.
    return { domain: params.domain, snapshot: null, observations: [] };
  },
});

const DOMAIN_TABS: { id: DomainTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'dns', label: 'DNS' },
  { id: 'mail', label: 'Mail' },
  { id: 'history', label: 'History' },
  // Delegation tab controlled by feature flag
  ...(DELEGATION_ENABLED ? [{ id: 'delegation' as const, label: 'Delegation' }] : []),
];

interface DomainData {
  snapshot: Snapshot | null;
  observations: Observation[];
}

async function fetchDomainData(domain: string): Promise<DomainData> {
  const snapshotResponse = await fetch(`/api/domain/${domain}/latest`, { credentials: 'include' });

  if (!snapshotResponse.ok) {
    if (snapshotResponse.status === 404) {
      return { snapshot: null, observations: [] };
    }
    throw new Error(
      `Failed to load domain data: ${snapshotResponse.status} ${snapshotResponse.statusText}`
    );
  }

  const snap = (await snapshotResponse.json()) as { id: string } & Snapshot;

  let observations: Observation[] = [];
  try {
    const obsResponse = await fetch(`/api/snapshot/${snap.id}/observations`, {
      credentials: 'include',
    });
    if (obsResponse.ok) {
      observations = (await obsResponse.json()) as Observation[];
    }
  } catch {
    // Observation fetch failed but we still have snapshot - not critical
  }

  return { snapshot: snap, observations };
}

function Domain360Page() {
  const queryClient = useQueryClient();
  const loaderData = Route.useLoaderData() as DomainLoaderData;
  const { domain } = loaderData;
  const { tab: urlTab, addToPortfolio = false } = Route.useSearch();
  const [activeTab, setActiveTab] = useState<DomainTabId>(urlTab ?? 'overview');
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const tabDomIdPrefix = useId();

  const {
    data: domainData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['domain-data', domain],
    queryFn: () => fetchDomainData(domain),
    enabled: !!domain,
  });

  const snapshot = domainData?.snapshot ?? null;
  const observations = Array.isArray(domainData?.observations) ? domainData.observations : [];

  const loaderError: LoaderError | undefined = error
    ? {
        type:
          error instanceof Error && error.message.startsWith('Failed to load')
            ? 'fetch_error'
            : 'api_unreachable',
        message: error instanceof Error ? error.message : 'Unable to reach the API server',
      }
    : undefined;

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/collect/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, zoneManagement: 'unmanaged', addToPortfolio }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ error: 'Refresh failed' }))) as {
          error?: string;
          message?: string;
        };
        if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication failed. Please sign in again.');
        }
        if (response.status === 503) {
          throw new Error(
            'DNS collector is temporarily unavailable. The service may be restarting — try again in 30 seconds.'
          );
        }
        if (response.status === 429) {
          throw new Error(
            errorData.message || 'Collection rate limit reached. Wait 60 seconds before retrying.'
          );
        }
        throw new Error(
          errorData.message || errorData.error || `Collection failed (${response.status})`
        );
      }
    },
    onSuccess: () => {
      if (addToPortfolio && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('addToPortfolio');
        window.history.replaceState(window.history.state, '', url.toString());
      }
      queryClient.invalidateQueries({ queryKey: ['domain-data', domain] });
      queryClient.invalidateQueries({ queryKey: ['domain-resolve', domain, true] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err) => {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed');
    },
  });

  const handleTabChange = useCallback((newTab: DomainTabId) => {
    // Immediate local state update for responsive UI
    setActiveTab(newTab);
    // Sync URL for bookmarkability via history API (avoids TanStack Router
    // re-render which can reset component state before search params commit).
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (newTab === 'overview') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', newTab);
      }
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, []);

  const getTabId = (tabId: DomainTabId) => `${tabDomIdPrefix}-domain-tab-${tabId}`;
  const getPanelId = (tabId: DomainTabId) => `${tabDomIdPrefix}-domain-panel-${tabId}`;

  const focusTab = (tabId: DomainTabId) => {
    requestAnimationFrame(() => {
      document.getElementById(getTabId(tabId))?.focus();
    });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextTab = DOMAIN_TABS[(index + 1) % DOMAIN_TABS.length];
      handleTabChange(nextTab.id);
      focusTab(nextTab.id);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prevTab = DOMAIN_TABS[(index - 1 + DOMAIN_TABS.length) % DOMAIN_TABS.length];
      handleTabChange(prevTab.id);
      focusTab(prevTab.id);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      handleTabChange(DOMAIN_TABS[0].id);
      focusTab(DOMAIN_TABS[0].id);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      handleTabChange(DOMAIN_TABS[DOMAIN_TABS.length - 1].id);
      focusTab(DOMAIN_TABS[DOMAIN_TABS.length - 1].id);
    }
  };

  // Auto-trigger collection on first load when no snapshot exists
  useEffect(() => {
    const shouldAutoCollect =
      !isLoading &&
      !snapshot &&
      !error &&
      !refreshMutation.isPending &&
      !refreshMutation.isSuccess &&
      !refreshMutation.isError;
    if (shouldAutoCollect) {
      setRefreshError(null);
      refreshMutation.mutate();
    }
  }, [
    isLoading,
    snapshot,
    error,
    refreshMutation.isPending,
    refreshMutation.isSuccess,
    refreshMutation.isError,
    refreshMutation.mutate,
  ]);

  const handleRefresh = useCallback(() => {
    setRefreshError(null);
    refreshMutation.mutate();
  }, [refreshMutation.mutate]);

  return (
    <div data-loaded={!isLoading || undefined}>
      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold text-gray-900 break-all">{domain}</h1>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            aria-busy={refreshMutation.isPending}
            className="focus-ring min-h-10 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {refreshMutation.isPending ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {snapshot ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ZoneManagementBadge type={snapshot.zoneManagement} />
            <ResultStateBadge state={snapshot.resultState} />
            <span className="text-sm text-gray-500 tabular-nums">
              Last updated: {new Date(snapshot.createdAt).toLocaleString()}
            </span>
          </div>
        ) : loaderError ? (
          <div
            className={`mt-4 p-4 rounded-lg border ${
              loaderError.type === 'api_unreachable'
                ? 'bg-red-50 border-red-200'
                : 'bg-orange-50 border-orange-200'
            }`}
            data-testid="loader-error-banner"
          >
            <p
              className={
                loaderError.type === 'api_unreachable' ? 'text-red-800' : 'text-orange-800'
              }
            >
              {loaderError.message}
            </p>
          </div>
        ) : refreshMutation.isPending ? (
          <div
            className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg"
            data-testid="domain-collecting-banner"
          >
            <div className="flex items-center gap-3">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-blue-800">
                Collecting DNS data for <strong>{domain}</strong>... This takes about 5 seconds.
                {addToPortfolio ? ' This domain will be added to your portfolio.' : ''}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
            data-testid="domain-no-data-banner"
          >
            <p className="text-yellow-800">
              No DNS data for {domain} yet. Click <strong>Refresh</strong> to collect now.
            </p>
          </div>
        )}

        {refreshError ? (
          <div
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            data-testid="domain-refresh-error-banner"
            role="alert"
          >
            {refreshError}
            <button
              type="button"
              onClick={handleRefresh}
              className="ml-3 font-medium underline"
              disabled={refreshMutation.isPending}
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <div
          role="tablist"
          aria-label="Domain DNS views"
          className="-mb-px flex w-max min-w-full space-x-4 sm:space-x-8"
        >
          {DOMAIN_TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              id={getTabId(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={getPanelId(tab.id)}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`focus-ring min-h-10 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div
          role="tabpanel"
          id={getPanelId('overview')}
          aria-labelledby={getTabId('overview')}
          hidden={activeTab !== 'overview'}
          data-testid="domain-tabpanel-overview"
        >
          {activeTab === 'overview' && (
            <OverviewTab domain={domain} snapshot={snapshot} observations={observations} />
          )}
        </div>

        <div
          role="tabpanel"
          id={getPanelId('dns')}
          aria-labelledby={getTabId('dns')}
          hidden={activeTab !== 'dns'}
          data-testid="domain-tabpanel-dns"
        >
          {activeTab === 'dns' && <DnsTab observations={observations} />}
        </div>

        <div
          role="tabpanel"
          id={getPanelId('mail')}
          aria-labelledby={getTabId('mail')}
          hidden={activeTab !== 'mail'}
          data-testid="domain-tabpanel-mail"
        >
          {activeTab === 'mail' && <MailTab domain={domain} snapshotId={snapshot?.id} />}
        </div>

        <div
          role="tabpanel"
          id={getPanelId('history')}
          aria-labelledby={getTabId('history')}
          hidden={activeTab !== 'history'}
          data-testid="domain-tabpanel-history"
        >
          {activeTab === 'history' && <HistoryTab domain={domain} />}
        </div>

        {/* Delegation panel - shipped by default */}
        {DELEGATION_ENABLED && (
          <div
            role="tabpanel"
            id={getPanelId('delegation')}
            aria-labelledby={getTabId('delegation')}
            hidden={activeTab !== 'delegation'}
            data-testid="domain-tabpanel-delegation"
          >
            {activeTab === 'delegation' && (
              <DelegationTab domain={domain} snapshotId={snapshot?.id} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  domain,
  snapshot,
  observations,
}: {
  domain: string;
  snapshot: Snapshot | null;
  observations: Observation[];
}) {
  if (!snapshot) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500">No DNS evidence available yet for {domain}.</p>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Operator Context</h3>
            <p className="text-sm text-gray-500">
              Keep tenant-scoped notes and tags attached to the domain even before the next evidence
              refresh.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <NotesPanel domainId={domain} isDomainName />
            <TagsPanel domainId={domain} isDomainName />
          </div>
        </div>
      </div>
    );
  }

  const successCount = observations.filter(
    (observation) => observation.status === 'success'
  ).length;
  const errorCount = observations.length - successCount;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Queries" value={observations.length} />
        <StatCard label="Successful" value={successCount} color="green" />
        <StatCard
          label="Errors/Timeouts"
          value={errorCount}
          color={errorCount > 0 ? 'red' : 'gray'}
        />
      </div>

      {SIMULATION_ENABLED && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Fix Simulation</h3>
          <p className="text-sm text-gray-500 mb-3">
            Simulate DNS changes to see which findings would be resolved.
          </p>
          <SimulationPanel snapshotId={snapshot.id} />
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-3">Query Scope</h3>
        <div className="space-y-3">
          <ScopeList label="Names" values={snapshot.queriedNames || []} />
          <ScopeList label="Types" values={snapshot.queriedTypes || []} />
          <ScopeList label="Vantages" values={snapshot.vantages || []} />
        </div>
        {snapshot.zoneManagement === 'unmanaged' ? (
          <p className="mt-3 text-xs text-blue-700">
            Targeted inspection mode: this is a DNS evidence snapshot, not a full zone enumeration.
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Snapshot Metadata</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Created</dt>
            <dd className="text-gray-900 tabular-nums">
              {new Date(snapshot.createdAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Duration</dt>
            <dd className="text-gray-900 tabular-nums">
              {snapshot.collectionDurationMs ? `${snapshot.collectionDurationMs}ms` : 'N/A'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Triggered By</dt>
            <dd className="text-gray-900">{snapshot.triggeredBy || 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Ruleset</dt>
            <dd className="text-gray-900">{snapshot.rulesetVersionId || 'Pending evaluation'}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900">Operator Context</h3>
          <p className="text-sm text-gray-500">
            Keep tenant-scoped notes and tags attached to the domain alongside the latest DNS
            evidence.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <NotesPanel domainId={domain} isDomainName />
          <TagsPanel domainId={domain} isDomainName />
        </div>
      </div>
    </div>
  );
}

function DnsTab({ observations }: { observations: Observation[] }) {
  if (observations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">
          No DNS observations available yet. Refresh to collect DNS data.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">DNS Records</h3>
        <p className="text-sm text-gray-500">
          View DNS evidence in Parsed, Raw, or Dig-style formats.
        </p>
      </div>
      <DNSViews observations={observations} />
    </div>
  );
}

function MailTab({ domain, snapshotId }: { domain: string; snapshotId?: string }) {
  if (!snapshotId) {
    return (
      <div className="text-center py-12" data-testid="mail-no-snapshot-state">
        <p className="text-gray-500">
          No DNS evidence available yet for {domain}. Refresh to collect mail data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Persisted mail findings - canonical read path */}
      <section>
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900">Mail Security Analysis</h3>
          <p className="text-sm text-gray-500">
            Persisted mail configuration findings based on collected evidence.
          </p>
        </div>
        <MailFindingsPanel snapshotId={snapshotId} />
      </section>

      {/* Discovered DKIM selectors */}
      <section>
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900">DKIM Selectors</h3>
          <p className="text-sm text-gray-500">
            Discovered DKIM selectors with provenance and confidence levels.
          </p>
        </div>
        <DiscoveredSelectors snapshotId={snapshotId} />
      </section>

      {/* Supplemental live diagnostics */}
      <section className="border-t pt-4">
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900">Live Diagnostics</h3>
          <p className="text-sm text-gray-500">
            Run additional mail diagnostics to refresh and analyze current mail configuration.
          </p>
        </div>
        <MailDiagnostics domain={domain} snapshotId={snapshotId} />
      </section>
    </div>
  );
}

function HistoryTab({ domain }: { domain: string }) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">Snapshot History</h3>
        <p className="text-sm text-gray-500">
          View and compare past DNS snapshots to track changes over time for {domain}.
        </p>
      </div>
      <SnapshotHistoryPanel domain={domain} />
    </div>
  );
}

function DelegationTab({ domain, snapshotId }: { domain: string; snapshotId?: string }) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">Delegation Analysis</h3>
        <p className="text-sm text-gray-500">
          View delegation status, name server configuration, and glue records for {domain}.
        </p>
      </div>
      <DelegationPanel snapshotId={snapshotId ?? null} />
    </div>
  );
}

function StatCard({
  label,
  value,
  color = 'gray',
}: {
  label: string;
  value: number;
  color?: 'gray' | 'green' | 'red';
}) {
  const colorClasses = {
    gray: 'bg-gray-50',
    green: 'bg-green-50',
    red: 'bg-red-50',
  };

  return (
    <div className={`${colorClasses[color]} rounded-lg p-4 text-center`}>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

function ScopeList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{label}</p>
      {values.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={`${label}-${value}`}
              className="rounded-full bg-white/80 border border-blue-200 px-2 py-0.5 text-xs text-blue-900"
            >
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-blue-800">N/A</p>
      )}
    </div>
  );
}
