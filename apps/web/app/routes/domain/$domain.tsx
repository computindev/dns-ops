import type { FindingsSummaryResponse } from '@dns-ops/contracts/responses';
import type { Observation, Snapshot } from '@dns-ops/db/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { AuthPending } from '../../components/AuthPending.js';
import { DelegationPanel } from '../../components/DelegationPanel.js';
import { DiscoveredSelectors } from '../../components/DiscoveredSelectors.js';
import { DNSViews } from '../../components/DNSViews.js';
import { DomainEvidencePanel } from '../../components/DomainEvidencePanel.js';
import { MailFindingsPanel } from '../../components/MailFindingsPanel.js';
import { MailDiagnostics } from '../../components/mail/index.js';
import { NotesPanel } from '../../components/NotesPanel.js';
import { SimulationPanel } from '../../components/SimulationPanel.js';
import { SnapshotHistoryPanel } from '../../components/SnapshotHistoryPanel.js';
import { ResultStateBadge, ZoneManagementBadge } from '../../components/StatusBadges.js';
import { TagsPanel } from '../../components/TagsPanel.js';
import { Button } from '../../components/ui/Button.js';
import { isDelegationTabEnabled, isSimulationEnabled } from '../../config/features.js';
import { createEvidenceClock, type EvidenceClock } from '../../lib/dns-ttl.js';

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
import { invalidateDomainEvidenceQueries } from '../../lib/evidence-query-cache.js';

export const Route = createFileRoute('/domain/$domain')({
  component: Domain360Page,
  remountDeps: ({ params }) => params.domain,
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

export interface DomainData {
  snapshot: Snapshot | null;
  observations: Observation[];
  evidenceClock: EvidenceClock | null;
  findingsSummary: FindingsSummaryResponse | null;
}

export const DOMAIN_COLLECTION_TIMEOUT_MS = 30_000;
export type DomainCollectionAbortReason = 'timeout' | 'superseded' | 'unmount' | 'aborted';
type ManualAbortReason = Exclude<DomainCollectionAbortReason, 'timeout'>;

export interface DomainCollectionRequest {
  readonly signal: AbortSignal;
  readonly reason: DomainCollectionAbortReason | null;
  abort(reason?: ManualAbortReason): void;
  dispose(): void;
}

export function createCollectionRequest(
  timeoutMs = DOMAIN_COLLECTION_TIMEOUT_MS
): DomainCollectionRequest {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortReason: DomainCollectionAbortReason | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const onAbort = () => clearTimer();
  controller.signal.addEventListener('abort', onAbort, { once: true });

  const request: DomainCollectionRequest = {
    get reason() {
      return abortReason;
    },
    signal: controller.signal,
    abort(reason = 'aborted') {
      if (controller.signal.aborted) return;
      abortReason = reason;
      controller.abort();
    },
    dispose() {
      clearTimer();
      controller.signal.removeEventListener('abort', onAbort);
    },
  };

  timer = setTimeout(() => {
    abortReason = 'timeout';
    controller.abort();
  }, timeoutMs);

  return request;
}

export class DomainCollectionAbortError extends Error {
  constructor(readonly reason: DomainCollectionAbortReason) {
    super(
      reason === 'timeout'
        ? 'DNS collection timed out. Try Refresh again.'
        : reason === 'superseded'
          ? 'DNS collection was superseded by a newer refresh.'
          : reason === 'unmount'
            ? 'DNS collection was cancelled because the page was left.'
            : 'DNS collection was cancelled. Try Refresh again.'
    );
    this.name = reason === 'timeout' ? 'TimeoutError' : 'AbortError';
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  throw error;
}

export async function collectDomain(
  domain: string,
  addToPortfolio: boolean,
  request: Pick<DomainCollectionRequest, 'signal' | 'reason'>
): Promise<void> {
  try {
    if (request.signal.aborted) {
      throw new DomainCollectionAbortError(request.reason ?? 'aborted');
    }

    const response = await fetch('/api/collect/domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, zoneManagement: 'unmanaged', addToPortfolio }),
      credentials: 'include',
      signal: request.signal,
    });

    if (request.signal.aborted) {
      throw new DomainCollectionAbortError(request.reason ?? 'aborted');
    }

    if (!response.ok) {
      const errorData = (await response.json().catch((error) => {
        if (request.reason || request.signal.aborted || isAbortError(error)) throw error;
        return { error: 'Refresh failed' };
      })) as {
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
  } catch (error) {
    if (request.reason) throw new DomainCollectionAbortError(request.reason);
    if (request.signal.aborted || isAbortError(error)) {
      throw new DomainCollectionAbortError('aborted');
    }
    throw error;
  }
}

function monotonicNow(): number | null {
  if (typeof performance === 'undefined') return null;
  const now = performance.now();
  return Number.isFinite(now) ? now : null;
}

export async function fetchDomainData(domain: string, signal?: AbortSignal): Promise<DomainData> {
  const snapshotStartedAt = monotonicNow();
  const snapshotResponse = await fetch(`/api/domain/${domain}/latest`, {
    credentials: 'include',
    signal,
  });
  throwIfAborted(signal);
  const snapshotReceivedAt = monotonicNow();

  if (!snapshotResponse.ok) {
    if (snapshotResponse.status === 404) {
      return {
        snapshot: null,
        observations: [],
        evidenceClock: null,
        findingsSummary: null,
      };
    }
    throw new Error(
      `Failed to load domain data: ${snapshotResponse.status} ${snapshotResponse.statusText}`
    );
  }

  const snap = (await snapshotResponse.json()) as { id: string } & Snapshot;
  throwIfAborted(signal);
  const snapshotClock =
    snapshotStartedAt !== null && snapshotReceivedAt !== null
      ? createEvidenceClock(
          snapshotResponse.headers.get('Date'),
          snapshotStartedAt,
          snapshotReceivedAt
        )
      : null;

  let observations: Observation[] = [];
  let evidenceClock: EvidenceClock | null = snapshotClock;
  try {
    const observationStartedAt = monotonicNow();
    const obsResponse = await fetch(`/api/snapshot/${snap.id}/observations`, {
      credentials: 'include',
      signal,
    });
    throwIfAborted(signal);
    const observationReceivedAt = monotonicNow();
    if (obsResponse.ok) {
      observations = (await obsResponse.json()) as Observation[];
      evidenceClock =
        observationStartedAt !== null && observationReceivedAt !== null
          ? createEvidenceClock(
              obsResponse.headers.get('Date'),
              observationStartedAt,
              observationReceivedAt
            )
          : null;
    } else {
      evidenceClock = null;
    }
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    // Observation fetch failed but we still have snapshot - not critical.
    // Without a response-calibrated clock any displayed TTL must be UNKNOWN.
    evidenceClock = null;
  }

  let findingsSummary: FindingsSummaryResponse | null = null;
  try {
    const summaryResponse = await fetch(`/api/snapshot/${snap.id}/findings/summary`, {
      credentials: 'include',
      signal,
    });
    throwIfAborted(signal);
    if (summaryResponse.ok) {
      findingsSummary = (await summaryResponse.json()) as FindingsSummaryResponse;
      throwIfAborted(signal);
    }
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    // A summary failure must not discard a usable snapshot, but it must stay
    // UNKNOWN rather than becoming a fabricated zero-finding result.
    findingsSummary = null;
  }

  return { snapshot: snap, observations, evidenceClock, findingsSummary };
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
    queryFn: ({ signal }) => fetchDomainData(domain, signal),
    enabled: !!domain,
  });

  const snapshot = domainData?.snapshot ?? null;
  const observations = Array.isArray(domainData?.observations) ? domainData.observations : [];
  const findingsSummary = domainData?.findingsSummary;

  const loaderError: LoaderError | undefined = error
    ? {
        type:
          error instanceof Error && error.message.startsWith('Failed to load')
            ? 'fetch_error'
            : 'api_unreachable',
        message: error instanceof Error ? error.message : 'Unable to reach the API server',
      }
    : undefined;

  const refreshRequestRef = useRef<DomainCollectionRequest | null>(null);
  const refreshSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  const abortActiveRefresh = useCallback((reason: ManualAbortReason) => {
    const request = refreshRequestRef.current;
    if (!request) return;
    request.abort(reason);
    request.dispose();
    if (refreshRequestRef.current === request) refreshRequestRef.current = null;
  }, []);

  type RefreshVariables = { id: number; request: DomainCollectionRequest };
  const refreshMutation = useMutation<void, Error, RefreshVariables>({
    mutationFn: async ({ request }) => {
      try {
        await collectDomain(domain, addToPortfolio, request);
      } finally {
        request.dispose();
        if (refreshRequestRef.current === request) refreshRequestRef.current = null;
      }
    },
    onSuccess: (_data, variables) => {
      if (!mountedRef.current || variables.id !== refreshSequenceRef.current) return;
      if (addToPortfolio && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('addToPortfolio');
        window.history.replaceState(window.history.state, '', url.toString());
      }
      queryClient.invalidateQueries({ queryKey: ['domain-data', domain] });
      void invalidateDomainEvidenceQueries(queryClient, domain);
      queryClient.invalidateQueries({ queryKey: ['domain-resolve', domain, true] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err, variables) => {
      if (!mountedRef.current || variables.id !== refreshSequenceRef.current) return;
      if (err instanceof DomainCollectionAbortError) {
        if (err.reason === 'superseded' || err.reason === 'unmount') return;
        setRefreshError(err.message);
        return;
      }
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

  const startRefresh = useCallback(() => {
    abortActiveRefresh('superseded');
    const requestId = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = requestId;
    const request = createCollectionRequest();
    refreshRequestRef.current = request;
    setRefreshError(null);
    refreshMutation.mutate({ id: requestId, request });
  }, [abortActiveRefresh, refreshMutation.mutate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortActiveRefresh('unmount');
    };
  }, [abortActiveRefresh]);

  // Auto-trigger collection on first load when no snapshot exists
  useEffect(() => {
    const shouldAutoCollect =
      !isLoading &&
      !snapshot &&
      !error &&
      !refreshMutation.isPending &&
      !refreshMutation.isSuccess &&
      !refreshMutation.isError;
    if (shouldAutoCollect) startRefresh();
  }, [
    isLoading,
    snapshot,
    error,
    refreshMutation.isPending,
    refreshMutation.isSuccess,
    refreshMutation.isError,
    startRefresh,
  ]);

  const handleRefresh = useCallback(() => {
    startRefresh();
  }, [startRefresh]);

  return (
    <div className="domain-360" data-loaded={!isLoading || undefined}>
      <header className="domain-360__header ds-panel">
        <div className="domain-360__title-row">
          <div>
            <p className="ds-kicker">Domain 360</p>
            <h1>{domain}</h1>
          </div>
          <Button
            loading={refreshMutation.isPending}
            onClick={handleRefresh}
            aria-busy={refreshMutation.isPending}
            variant="primary"
          >
            Refresh
          </Button>
        </div>

        {snapshot ? (
          <>
            <div className="domain-360__metadata">
              <ZoneManagementBadge type={snapshot.zoneManagement} />
              <ResultStateBadge state={snapshot.resultState} />
              <span className="domain-360__timestamp">
                Last updated: {new Date(snapshot.createdAt).toLocaleString()}
              </span>
            </div>
            {snapshot.metadata?.authoritativeEvidence?.state === 'UNKNOWN' && (
              <div className="domain-360__alert domain-360__alert--unknown ds-panel--muted">
                <strong>Authoritative evidence UNKNOWN.</strong>{' '}
                {snapshot.metadata.authoritativeEvidence.unknown?.explanation}{' '}
                <Button
                  disabled={refreshMutation.isPending}
                  onClick={handleRefresh}
                  size="sm"
                  variant="quiet"
                >
                  {snapshot.metadata.authoritativeEvidence.unknown?.actionLabel ??
                    'Retry authoritative DNS collection'}
                </Button>
              </div>
            )}
          </>
        ) : loaderError ? (
          <div
            className="domain-360__state domain-360__state--error"
            data-testid="loader-error-banner"
          >
            <p>{loaderError.message}</p>
          </div>
        ) : refreshMutation.isPending ? (
          <div
            className="domain-360__state domain-360__state--collecting"
            data-testid="domain-collecting-banner"
          >
            <div className="flex items-center gap-3">
              <div className="ds-button__spinner" aria-hidden="true" />
              <p>
                Collecting DNS data for <strong>{domain}</strong>... This takes about 5 seconds.
                {addToPortfolio ? ' This domain will be added to your portfolio.' : ''}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="domain-360__state domain-360__state--warning"
            data-state="warning"
            data-testid="domain-no-data-banner"
            role="status"
          >
            <p>
              No DNS data for {domain} yet. Click <strong>Refresh</strong> to collect now.
            </p>
          </div>
        )}

        {refreshError ? (
          <div
            className="domain-360__alert domain-360__state--error"
            data-testid="domain-refresh-error-banner"
            role="alert"
          >
            <span>{refreshError}</span>
            <Button
              disabled={refreshMutation.isPending}
              onClick={handleRefresh}
              size="sm"
              variant="quiet"
            >
              Retry
            </Button>
          </div>
        ) : null}
      </header>

      <div role="tablist" aria-label="Domain DNS views" className="domain-360__tabs">
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
            className="domain-360__tab"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="domain-360__panel ds-panel">
        <div
          role="tabpanel"
          id={getPanelId('overview')}
          aria-labelledby={getTabId('overview')}
          hidden={activeTab !== 'overview'}
          data-testid="domain-tabpanel-overview"
        >
          {activeTab === 'overview' && (
            <OverviewTab
              domain={domain}
              snapshot={snapshot}
              observations={observations}
              findingsSummary={findingsSummary}
            />
          )}
        </div>

        <div
          role="tabpanel"
          id={getPanelId('dns')}
          aria-labelledby={getTabId('dns')}
          hidden={activeTab !== 'dns'}
          data-testid="domain-tabpanel-dns"
        >
          {activeTab === 'dns' && (
            <DnsTab
              observations={observations}
              snapshotMetadata={snapshot?.metadata}
              evidenceClock={domainData?.evidenceClock}
            />
          )}
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
  findingsSummary,
}: {
  domain: string;
  snapshot: Snapshot | null;
  observations: Observation[];
  findingsSummary?: FindingsSummaryResponse | null;
}) {
  const scopeHeadingId = useId();
  const metadataHeadingId = useId();

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <DomainEvidencePanel
          domain={domain}
          snapshot={snapshot}
          findingsSummary={findingsSummary}
        />

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
      <DomainEvidencePanel domain={domain} snapshot={snapshot} findingsSummary={findingsSummary} />

      <div className="domain-stat-grid">
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
          <h3 className="font-semibold text-gray-900 mb-2">Remediation Guidance</h3>
          <p className="text-sm text-gray-500 mb-3">
            Review non-executable playbooks. Exact changes require confirmed provider context.
          </p>
          <SimulationPanel snapshotId={snapshot.id} />
        </div>
      )}

      <section className="domain-scope ds-panel--muted" aria-labelledby={scopeHeadingId}>
        <div>
          <p className="ds-kicker">Collection boundary</p>
          <h3 id={scopeHeadingId}>Query scope</h3>
        </div>
        <div className="domain-scope__lists">
          <ScopeList label="Names" values={snapshot.queriedNames || []} />
          <ScopeList label="Types" values={snapshot.queriedTypes || []} />
          <ScopeList label="Vantages" values={snapshot.vantages || []} />
        </div>
        {snapshot.zoneManagement === 'unmanaged' ? (
          <p className="domain-scope__notice">
            Targeted inspection mode: this is a DNS evidence snapshot, not a full zone enumeration.
          </p>
        ) : null}
      </section>

      <section className="domain-metadata" aria-labelledby={metadataHeadingId}>
        <div>
          <p className="ds-kicker">Collected evidence</p>
          <h3 id={metadataHeadingId}>Snapshot metadata</h3>
        </div>
        <dl>
          <div>
            <dt>Created</dt>
            <dd className="domain-360__timestamp">
              {new Date(snapshot.createdAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd className="domain-360__timestamp">
              {snapshot.collectionDurationMs ? `${snapshot.collectionDurationMs}ms` : 'N/A'}
            </dd>
          </div>
          <div>
            <dt>Triggered by</dt>
            <dd>{snapshot.triggeredBy || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Ruleset</dt>
            <dd>{snapshot.rulesetVersionId || 'Pending evaluation'}</dd>
          </div>
        </dl>
      </section>

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

function DnsTab({
  observations,
  snapshotMetadata,
  evidenceClock,
}: {
  observations: Observation[];
  snapshotMetadata?: Snapshot['metadata'];
  evidenceClock?: EvidenceClock | null;
}) {
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
      <DNSViews
        observations={observations}
        snapshotMetadata={snapshotMetadata}
        evidenceClock={evidenceClock}
      />
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
      <div className="domain-section-heading">
        <p className="ds-kicker">Evidence timeline</p>
        <h2>Snapshot history</h2>
        <p>View and compare past DNS snapshots to track changes over time for {domain}.</p>
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
  return (
    <div className={`domain-stat-card domain-stat-card--${color}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ScopeList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="domain-scope__list">
      <p>{label}</p>
      {values.length > 0 ? (
        <div>
          {values.map((value) => (
            <span key={`${label}-${value}`} className="ds-badge ds-badge--info">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <span className="domain-scope__empty">N/A</span>
      )}
    </div>
  );
}
