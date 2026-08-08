/**
 * Alerts Panel
 *
 * Displays and manages tenant alerts with filtering and actions.
 * Uses TanStack Query for data fetching and mutations.
 */

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from './ui/StateDisplay.js';

type AlertStatus = 'pending' | 'sent' | 'suppressed' | 'acknowledged' | 'resolved';
type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface AlertRecord {
  id: string;
  monitoredDomainId: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  createdAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
}

interface MonitoredDomainSummary {
  id: string;
  domainName: string;
}

interface AlertListItem extends AlertRecord {
  domainName: string | null;
}

const STATUS_OPTIONS: Array<{ value: 'all' | AlertStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'suppressed', label: 'Suppressed' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
];

const SEVERITY_OPTIONS: Array<{ value: 'all' | AlertSeverity; label: string }> = [
  { value: 'all', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
];

const SEVERITY_BADGES: Record<AlertSeverity, string> = {
  critical: 'ds-badge ds-badge--danger',
  high: 'ds-badge ds-badge--warning',
  medium: 'ds-badge ds-badge--warning',
  low: 'ds-badge ds-badge--info',
  info: 'ds-badge ds-badge--neutral',
};

const STATUS_BADGES: Record<AlertStatus, string> = {
  pending: 'ds-badge ds-badge--danger',
  sent: 'ds-badge ds-badge--info',
  suppressed: 'ds-badge ds-badge--neutral',
  acknowledged: 'ds-badge ds-badge--warning',
  resolved: 'ds-badge ds-badge--success',
};

function canAcknowledge(status: AlertStatus): boolean {
  return ['pending', 'sent', 'suppressed'].includes(status);
}

function canSuppress(status: AlertStatus): boolean {
  return ['pending', 'sent', 'acknowledged'].includes(status);
}

function canResolve(status: AlertStatus): boolean {
  return ['pending', 'sent', 'acknowledged', 'suppressed'].includes(status);
}

function formatTimestamp(timestamp?: string | null): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString();
}

const LIMIT = 25;

interface AlertsPage {
  alerts: AlertListItem[];
  nextOffset: number;
  hasMore: boolean;
  total: number;
}

async function fetchAlertsPage(
  statusFilter: 'all' | AlertStatus,
  severityFilter: 'all' | AlertSeverity,
  offset: number
): Promise<AlertsPage> {
  const search = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (statusFilter !== 'all') search.set('status', statusFilter);
  if (severityFilter !== 'all') search.set('severity', severityFilter);

  const alertsResponse = await fetch(`/api/alerts?${search.toString()}`, {
    credentials: 'include',
  });

  if (alertsResponse.status === 401) {
    const err = new Error('Unauthorized');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  if (alertsResponse.status === 403) {
    const err = new Error('Forbidden');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  if (!alertsResponse.ok) {
    const body = (await alertsResponse.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Failed to load alerts');
  }

  const alertsBody = (await alertsResponse.json()) as {
    alerts: AlertRecord[];
    pagination: { total: number; offset: number; hasMore: boolean };
  };

  let domainNamesById: Record<string, string> = {};
  try {
    const monitoringResponse = await fetch('/api/monitoring/domains', { credentials: 'include' });
    if (monitoringResponse.ok) {
      const monitoringBody = (await monitoringResponse.json()) as {
        monitoredDomains: MonitoredDomainSummary[];
      };
      domainNamesById = Object.fromEntries(
        (monitoringBody.monitoredDomains || []).map((domain) => [domain.id, domain.domainName])
      );
    }
  } catch {
    // Render alerts without domain enrichment when the monitoring lookup fails.
  }

  const mapped = (alertsBody.alerts || []).map((alert) => ({
    ...alert,
    domainName: domainNamesById[alert.monitoredDomainId] ?? null,
  }));

  return {
    alerts: mapped,
    nextOffset: offset + mapped.length,
    hasMore: alertsBody.pagination?.hasMore ?? false,
    total: alertsBody.pagination?.total ?? mapped.length,
  };
}

export function AlertsPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | AlertStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | AlertSeverity>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeActionByAlertId, setActiveActionByAlertId] = useState<
    Record<string, 'acknowledge' | 'resolve' | 'suppress' | null>
  >({});
  const [resolveDraftByAlertId, setResolveDraftByAlertId] = useState<Record<string, string>>({});
  const [expandedResolveAlertId, setExpandedResolveAlertId] = useState<string | null>(null);

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } =
    useInfiniteQuery({
      queryKey: ['alerts', statusFilter, severityFilter],
      queryFn: ({ pageParam = 0 }) => fetchAlertsPage(statusFilter, severityFilter, pageParam),
      getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
      initialPageParam: 0,
    });

  const alerts = useMemo(() => data?.pages.flatMap((page) => page.alerts) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  const status = error ? (error as Error & { status?: number }).status : undefined;
  const authRequired = status === 401;
  const loadError = error && status !== 401 && status !== 403 ? (error as Error).message : null;

  const handleStatusChange = (value: 'all' | AlertStatus) => {
    setExpandedResolveAlertId(null);
    setResolveDraftByAlertId({});
    setActionError(null);
    setStatusFilter(value);
  };

  const handleSeverityChange = (value: 'all' | AlertSeverity) => {
    setExpandedResolveAlertId(null);
    setResolveDraftByAlertId({});
    setActionError(null);
    setSeverityFilter(value);
  };

  const actionMutation = useMutation({
    mutationFn: async ({
      alertId,
      action,
      resolutionNote,
    }: {
      alertId: string;
      action: 'acknowledge' | 'resolve' | 'suppress';
      resolutionNote?: string;
    }) => {
      const response = await fetch(`/api/alerts/${alertId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'resolve' ? JSON.stringify({ resolutionNote }) : undefined,
      });
      if (response.status === 401) {
        const err = new Error('Unauthorized');
        (err as Error & { status: number }).status = 401;
        throw err;
      }
      if (response.status === 403) {
        const err = new Error('Forbidden');
        (err as Error & { status: number }).status = 403;
        throw err;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Failed to ${action} alert`);
      }
    },
    onSuccess: () => {
      setExpandedResolveAlertId(null);
      setResolveDraftByAlertId({});
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    },
    onSettled: (_data, _err, variables) => {
      setActiveActionByAlertId((current) => ({ ...current, [variables.alertId]: null }));
    },
  });

  const runAlertAction = (
    alertId: string,
    action: 'acknowledge' | 'resolve' | 'suppress',
    resolutionNote?: string
  ) => {
    setActiveActionByAlertId((current) => ({ ...current, [alertId]: action }));
    setActionError(null);
    actionMutation.mutate({ alertId, action, resolutionNote });
  };

  return (
    <div className="ds-panel portfolio-panel">
      <div className="px-4 py-3 border-b border-line flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-medium text-ink">Alerts</h3>
          <p className="text-sm text-muted">
            Review alert state, triage, and resolve operator-visible issues
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="text-sm text-text">
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) => handleStatusChange(event.target.value as 'all' | AlertStatus)}
              disabled={authRequired}
              className="rounded-lg border border-line px-3 py-2 text-sm disabled:bg-surface-muted disabled:text-muted"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-text">
            <span className="sr-only">Filter by severity</span>
            <select
              value={severityFilter}
              onChange={(event) =>
                handleSeverityChange(event.target.value as 'all' | AlertSeverity)
              }
              disabled={authRequired}
              className="rounded-lg border border-line px-3 py-2 text-sm disabled:bg-surface-muted disabled:text-muted"
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {authRequired ? (
          <div className="rounded-lg border border-warning bg-warning-surface p-4 text-sm text-warning">
            Operator sign-in is required to review or mutate tenant alerts.
          </div>
        ) : null}

        {loadError ? (
          <ErrorState
            title="Alerts unavailable"
            message={loadError}
            onRetry={() => queryClient.invalidateQueries({ queryKey: ['alerts'] })}
            size="sm"
          />
        ) : null}

        {actionError ? (
          <div className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">
            {actionError}
          </div>
        ) : null}

        {isLoading ? (
          <LoadingState message="Loading alerts..." size="md" />
        ) : authRequired ? (
          <EmptyState
            icon="shield"
            title="Sign in required"
            description="Sign in to review and manage tenant alerts."
          />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={
              statusFilter === 'all' && severityFilter === 'all'
                ? 'No alerts yet'
                : 'No alerts match these filters'
            }
            description={
              statusFilter === 'all' && severityFilter === 'all'
                ? 'Once monitored domains produce alerts, they will appear here.'
                : 'Try broadening the current status or severity filters.'
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted">
              Showing {alerts.length} of {total} alerts
            </div>
            {alerts.map((alert) => {
              const actionInFlight = activeActionByAlertId[alert.id];
              const resolveDraft = resolveDraftByAlertId[alert.id] || '';
              const resolveExpanded = expandedResolveAlertId === alert.id;

              return (
                <div key={alert.id} className="rounded-lg border border-line p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {alert.domainName ? (
                          <Link
                            to="/domain/$domain"
                            params={{ domain: alert.domainName.toLowerCase() }}
                            className="font-medium text-brand hover:text-brand"
                          >
                            {alert.domainName}
                          </Link>
                        ) : (
                          <h4 className="font-medium text-ink">Unknown domain</h4>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGES[alert.severity]}`}
                        >
                          {alert.severity}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[alert.status]}`}
                        >
                          {alert.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-text">{alert.title}</p>
                      <p className="mt-1 text-sm text-text">{alert.description}</p>
                    </div>
                    <div className="text-xs text-muted text-left sm:text-right">
                      <div>Created {formatTimestamp(alert.createdAt)}</div>
                      {alert.acknowledgedAt ? (
                        <div>Acknowledged {formatTimestamp(alert.acknowledgedAt)}</div>
                      ) : null}
                      {alert.resolvedAt ? (
                        <div>Resolved {formatTimestamp(alert.resolvedAt)}</div>
                      ) : null}
                    </div>
                  </div>

                  {alert.resolutionNote ? (
                    <div className="rounded bg-surface-muted px-3 py-2 text-sm text-text">
                      Resolution note: {alert.resolutionNote}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {canAcknowledge(alert.status) ? (
                      <button
                        type="button"
                        disabled={!!actionInFlight || authRequired}
                        onClick={() => runAlertAction(alert.id, 'acknowledge')}
                        className="focus-ring rounded-lg border border-line px-3 py-2 text-sm text-text hover:bg-surface-muted disabled:bg-surface-muted disabled:text-faint"
                      >
                        {actionInFlight === 'acknowledge' ? 'Acknowledging...' : 'Acknowledge'}
                      </button>
                    ) : null}

                    {canSuppress(alert.status) ? (
                      <button
                        type="button"
                        disabled={!!actionInFlight || authRequired}
                        onClick={() => runAlertAction(alert.id, 'suppress')}
                        className="focus-ring rounded-lg border border-line px-3 py-2 text-sm text-text hover:bg-surface-muted disabled:bg-surface-muted disabled:text-faint"
                      >
                        {actionInFlight === 'suppress' ? 'Suppressing...' : 'Suppress'}
                      </button>
                    ) : null}

                    {canResolve(alert.status) ? (
                      <button
                        type="button"
                        disabled={!!actionInFlight || authRequired}
                        onClick={() => {
                          setExpandedResolveAlertId(resolveExpanded ? null : alert.id);
                          setResolveDraftByAlertId((current) => ({
                            ...current,
                            [alert.id]: current[alert.id] ?? alert.resolutionNote ?? '',
                          }));
                        }}
                        className="ds-button ds-button--primary ds-button--sm"
                      >
                        Resolve
                      </button>
                    ) : null}
                  </div>

                  {resolveExpanded ? (
                    <div className="rounded-lg border border-brand bg-info-surface p-3 space-y-2">
                      <label className="block text-sm font-medium text-text">
                        Resolution note
                        <textarea
                          value={resolveDraft}
                          onChange={(event) =>
                            setResolveDraftByAlertId((current) => ({
                              ...current,
                              [alert.id]: event.target.value,
                            }))
                          }
                          rows={3}
                          disabled={!!actionInFlight || authRequired}
                          className="ds-input mt-1 block w-full rounded-md border-line disabled:bg-surface-muted"
                          placeholder="Describe how this alert was resolved"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!!actionInFlight || authRequired}
                          onClick={() =>
                            runAlertAction(alert.id, 'resolve', resolveDraft.trim() || undefined)
                          }
                          className="ds-button ds-button--primary ds-button--sm"
                        >
                          {actionInFlight === 'resolve' ? 'Resolving...' : 'Confirm Resolve'}
                        </button>
                        <button
                          type="button"
                          disabled={!!actionInFlight}
                          onClick={() => setExpandedResolveAlertId(null)}
                          className="focus-ring rounded-lg border border-line px-3 py-2 text-sm text-text hover:bg-surface-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {hasNextPage ? (
              <button
                type="button"
                disabled={isFetchingNextPage || authRequired}
                onClick={() => fetchNextPage()}
                className="focus-ring rounded-lg border border-line px-4 py-2 text-sm text-text hover:bg-surface-muted disabled:bg-surface-muted disabled:text-faint"
              >
                {isFetchingNextPage ? 'Loading more...' : 'Load more alerts'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
