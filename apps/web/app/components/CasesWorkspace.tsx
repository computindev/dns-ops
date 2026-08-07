import type { InternalCaseStatus, InternalSignalKind } from '@dns-ops/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  type CaseDetail,
  type CaseListItem,
  fetchCase,
  fetchCases,
  saveCaseDisposition,
} from '../lib/case-api.js';
import { Button } from './ui/Button.js';
import { EmptyState, ErrorState, LoadingState } from './ui/StateDisplay.js';

const CASE_STATUSES: Array<'all' | InternalCaseStatus> = [
  'all',
  'OPEN',
  'ACKNOWLEDGED',
  'BLOCKED',
  'RESOLVED',
  'DISMISSED',
];

const SIGNAL_KINDS: InternalSignalKind[] = [
  'DOMAIN_EXPIRING_SOON',
  'TLS_CERTIFICATE_REGRESSION',
  'HTTP_ENDPOINT_UNAVAILABLE',
  'REDIRECT_TOPOLOGY_REGRESSION',
  'HOMEPAGE_INDEXABILITY_REGRESSION',
  'MAIL_DNS_CONFIGURATION_REGRESSION',
];

const SIGNAL_KIND_LABELS: Record<InternalSignalKind, string> = {
  DOMAIN_EXPIRING_SOON: 'Domain Expiring Soon',
  TLS_CERTIFICATE_REGRESSION: 'TLS Certificate Regression',
  HTTP_ENDPOINT_UNAVAILABLE: 'HTTP Endpoint Unavailable',
  REDIRECT_TOPOLOGY_REGRESSION: 'Redirect Topology Regression',
  HOMEPAGE_INDEXABILITY_REGRESSION: 'Homepage Indexability Regression',
  MAIL_DNS_CONFIGURATION_REGRESSION: 'Mail DNS Configuration Regression',
};

function labelSignalKind(kind: InternalSignalKind): string {
  return SIGNAL_KIND_LABELS[kind];
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function statusTone(
  status: InternalCaseStatus
): 'info' | 'success' | 'warning' | 'danger' | 'unknown' {
  if (status === 'OPEN') return 'danger';
  if (status === 'ACKNOWLEDGED') return 'info';
  if (status === 'BLOCKED') return 'warning';
  if (status === 'RESOLVED') return 'success';
  return 'unknown';
}

function caseSummary(item: CaseListItem): string {
  return `${labelSignalKind(item.signal.kind)} · ${item.signal.status.toLowerCase()}`;
}

function CaseQueueRow({
  item,
  selected,
  onSelect,
  detailId,
}: {
  item: CaseListItem;
  selected: boolean;
  onSelect: () => void;
  detailId: string;
}) {
  return (
    <button
      type="button"
      aria-controls={detailId}
      aria-pressed={selected}
      className={`cases-queue-row ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
    >
      <span
        className={`cases-status-dot cases-status-dot--${statusTone(item.case.status)}`}
        aria-hidden="true"
      />
      <span className="cases-queue-row__content">
        <strong>{labelSignalKind(item.signal.kind)}</strong>
        <small>{caseSummary(item)}</small>
        <small className="cases-queue-row__domain">{item.domain.name}</small>
      </span>
      <span className={`ds-badge ds-badge--${statusTone(item.case.status)}`}>
        {item.case.status.toLowerCase()}
      </span>
    </button>
  );
}

function CaseDetailPanel({ detail, panelId }: { detail: CaseDetail; panelId: string }) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const historyTitleId = useId();
  const dispositionId = useId();
  const [draft, setDraft] = useState(detail.case.disposition ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    setDraft(detail.case.disposition ?? '');
  }, [detail.case.disposition]);

  const saveMutation = useMutation({
    mutationFn: saveCaseDisposition,
    onSuccess: (updated) => {
      setDraft(updated.disposition ?? '');
      setHasSaved(true);
      setSaveError(null);
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: ['case', detail.case.id] });
    },
    onError: (error) => {
      const apiError = error as Error & { code?: string };
      setHasSaved(false);
      setSaveError(
        apiError.code === 'CASE_VERSION_STALE'
          ? 'Another operator changed this case. The current record has been refreshed.'
          : apiError.message
      );
      if (apiError.code === 'CASE_VERSION_STALE') {
        void queryClient.invalidateQueries({ queryKey: ['case', detail.case.id] });
        void queryClient.invalidateQueries({ queryKey: ['cases'] });
      }
    },
  });

  const saveDisposition = () => {
    const disposition = draft.trim();
    if (!disposition) {
      setSaveError('Enter a disposition before saving.');
      return;
    }
    setHasSaved(false);
    setSaveError(null);
    saveMutation.mutate({
      caseId: detail.case.id,
      disposition,
      expectedVersion: detail.case.version,
    });
  };

  return (
    <article className="cases-detail" aria-labelledby={titleId} id={panelId}>
      <div className="cases-detail__topline">
        <span className="ds-kicker">Case detail</span>
        <span className={`ds-badge ds-badge--${statusTone(detail.case.status)}`}>
          {detail.case.status.toLowerCase()}
        </span>
      </div>
      <h2 id={titleId}>{labelSignalKind(detail.signal.kind)}</h2>
      <p className="cases-detail__lede">
        This canonical signal is {detail.signal.status.toLowerCase()}. Its lifecycle and operator
        disposition remain attached to the same tenant-scoped case record.
      </p>

      <dl className="cases-evidence-list">
        <div>
          <dt>Domain</dt>
          <dd>{detail.domain.name}</dd>
        </div>
        <div>
          <dt>Condition key</dt>
          <dd>{detail.signal.conditionKey}</dd>
        </div>
        <div>
          <dt>Last observed</dt>
          <dd>{formatTimestamp(detail.signal.lastSeenAt)}</dd>
        </div>
        <div>
          <dt>Record version</dt>
          <dd>{detail.case.version}</dd>
        </div>
      </dl>

      <section className="cases-disposition" aria-labelledby={`${dispositionId}-label`}>
        <div>
          <label id={`${dispositionId}-label`} htmlFor={dispositionId} className="ds-kicker">
            Operator disposition
          </label>
          <p>
            Record the current operational decision. Case resolution still requires fresh evidence.
          </p>
        </div>
        <textarea
          id={dispositionId}
          className="ds-input cases-disposition__input"
          value={draft}
          onChange={(event) => {
            setHasSaved(false);
            setDraft(event.target.value);
          }}
          aria-invalid={saveError ? 'true' : undefined}
          aria-describedby={saveError ? `${dispositionId}-error` : undefined}
          disabled={saveMutation.isPending}
          maxLength={500}
          placeholder="Record the decision and next responsible action"
          rows={4}
        />
        <p
          className="cases-inline-error"
          id={`${dispositionId}-error`}
          role={saveError ? 'alert' : undefined}
        >
          {saveError}
        </p>
        <Button
          loading={saveMutation.isPending}
          onClick={saveDisposition}
          state={saveError ? 'error' : hasSaved ? 'success' : undefined}
          variant="primary"
        >
          {hasSaved ? 'Disposition saved' : 'Save disposition'}
        </Button>
      </section>

      <section className="cases-history" aria-labelledby={historyTitleId}>
        <div>
          <p className="ds-kicker">Lifecycle audit</p>
          <h3 id={historyTitleId}>History</h3>
        </div>
        {detail.events.length === 0 ? (
          <p className="cases-history__empty">No lifecycle events are available for this case.</p>
        ) : (
          <ol>
            {detail.events.map((event) => (
              <li key={event.id}>
                <span className="cases-history__marker" aria-hidden="true" />
                <div>
                  <strong>
                    {event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : event.toStatus}
                  </strong>
                  <p>{event.disposition ?? event.note ?? 'Case lifecycle event recorded.'}</p>
                  <small>
                    {event.actorId} · {formatTimestamp(event.createdAt)}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

export function CasesWorkspace() {
  const queryClient = useQueryClient();
  const workspaceTitleId = useId();
  const queueTitleId = useId();
  const detailPanelId = useId();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | InternalCaseStatus>('all');
  const [kindFilter, setKindFilter] = useState<'all' | InternalSignalKind>('all');
  const casesQuery = useQuery({
    queryKey: ['cases'],
    queryFn: ({ signal }) => fetchCases(signal),
  });

  const visibleCases = useMemo(
    () =>
      (casesQuery.data ?? []).filter(
        (item) =>
          (statusFilter === 'all' || item.case.status === statusFilter) &&
          (kindFilter === 'all' || item.signal.kind === kindFilter)
      ),
    [casesQuery.data, kindFilter, statusFilter]
  );
  const selectedCase =
    visibleCases.find((item) => item.case.id === selectedCaseId) ?? visibleCases[0] ?? null;
  const detailQuery = useQuery({
    queryKey: ['case', selectedCase?.case.id],
    queryFn: ({ signal }) => fetchCase(selectedCase?.case.id ?? '', signal),
    enabled: Boolean(selectedCase),
  });

  const error = casesQuery.error as (Error & { status?: number }) | null;
  const authRequired = error?.status === 401;
  const forbidden = error?.status === 403;
  const filtersActive = statusFilter !== 'all' || kindFilter !== 'all';
  const clearFilters = () => {
    setStatusFilter('all');
    setKindFilter('all');
  };

  return (
    <section className="cases-workspace" aria-labelledby={workspaceTitleId}>
      <header className="cases-workspace__header">
        <div>
          <p className="ds-kicker">Operator workspace</p>
          <h1 id={workspaceTitleId}>Cases &amp; Signals</h1>
          <p>
            Work the operational queue from the canonical signal, through evidence, to a durable
            disposition.
          </p>
        </div>
        <div className="cases-workspace__controls">
          <div className="cases-workspace__filters">
            <label>
              <span>Case status</span>
              <select
                className="ds-input"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'all' | InternalCaseStatus)
                }
                disabled={authRequired || forbidden}
              >
                {CASE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status === 'all' ? 'All statuses' : status.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Signal kind</span>
              <select
                className="ds-input"
                value={kindFilter}
                onChange={(event) =>
                  setKindFilter(event.target.value as 'all' | InternalSignalKind)
                }
                disabled={authRequired || forbidden}
              >
                <option value="all">All signal kinds</option>
                {SIGNAL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {labelSignalKind(kind)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="cases-workspace__actions">
            {filtersActive ? (
              <Button onClick={clearFilters} size="sm" variant="quiet">
                Clear filters
              </Button>
            ) : null}
            <Button
              loading={casesQuery.isFetching}
              onClick={() => void casesQuery.refetch()}
              size="sm"
              variant="secondary"
            >
              Refresh queue
            </Button>
          </div>
        </div>
      </header>

      {authRequired ? (
        <EmptyState
          icon="shield"
          title="Sign in required"
          description="Sign in to inspect tenant-scoped cases and operational evidence."
        />
      ) : forbidden ? (
        <EmptyState
          icon="shield"
          title="Case access is restricted"
          description="Your current operator role cannot read this tenant’s case queue."
        />
      ) : casesQuery.isLoading ? (
        <LoadingState message="Loading case queue…" />
      ) : casesQuery.isError ? (
        <ErrorState
          title="Cases unavailable"
          message={error?.message ?? 'The case queue could not be loaded.'}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['cases'] })}
        />
      ) : visibleCases.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={casesQuery.data?.length ? 'No cases match these filters' : 'No active cases'}
          description={
            casesQuery.data?.length
              ? 'Adjust the status or signal-kind filters to review other case records.'
              : 'Canonical cases will appear here when an operational signal requires attention.'
          }
          action={filtersActive ? { label: 'Clear filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <div className="cases-workspace__body">
          <section className="cases-queue" aria-labelledby={queueTitleId}>
            <div className="cases-queue__title">
              <div>
                <p className="ds-kicker">Queue</p>
                <h2 id={queueTitleId}>{visibleCases.length} visible cases</h2>
              </div>
              <span>{casesQuery.data?.length ?? 0} total</span>
            </div>
            <p aria-live="polite" className="sr-only">
              {visibleCases.length} case{visibleCases.length === 1 ? '' : 's'} visible
              {filtersActive ? ' with the current filters' : ''}.
            </p>
            <div>
              {visibleCases.map((item) => (
                <CaseQueueRow
                  key={item.case.id}
                  detailId={detailPanelId}
                  item={item}
                  selected={item.case.id === selectedCase?.case.id}
                  onSelect={() => setSelectedCaseId(item.case.id)}
                />
              ))}
            </div>
          </section>

          {detailQuery.isLoading ? (
            <LoadingState message="Loading case evidence…" />
          ) : detailQuery.isError ? (
            <ErrorState
              title="Case detail unavailable"
              message={(detailQuery.error as Error).message}
              onRetry={() =>
                queryClient.invalidateQueries({ queryKey: ['case', selectedCase?.case.id] })
              }
            />
          ) : detailQuery.data ? (
            <CaseDetailPanel
              key={detailQuery.data.case.id}
              detail={detailQuery.data}
              panelId={detailPanelId}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
