import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from './ui/Button.js';
import { EmptyState, ErrorState, LoadingState } from './ui/StateDisplay.js';

interface SnapshotListItem {
  id: string;
  createdAt: string;
  rulesetVersionId: string | null;
  findingsEvaluated: boolean;
  evaluationCoverage: {
    state: 'COMPLETE' | 'PARTIAL';
    errors: Array<{ unknown: { explanation: string; actionLabel: string } }>;
  };
  queryScope: { names: string[]; types: string[]; vantages: string[] };
}

interface RecordChange {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  name: string;
  recordType: string;
  valuesA?: string[];
  valuesB?: string[];
  diff?: { added: string[]; removed: string[] };
}

interface TTLChange {
  name: string;
  recordType: string;
  ttlA: number;
  ttlB: number;
  change: number;
}

interface FindingChange {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  findingType: string;
  title: string;
  severityA?: string;
  severityB?: string;
  description?: string;
}

interface DiffComparison {
  recordChanges: RecordChange[];
  ttlChanges: TTLChange[];
  findingChanges: FindingChange[];
  scopeChanges: {
    type: 'scope-changed';
    namesAdded: string[];
    namesRemoved: string[];
    typesAdded: string[];
    typesRemoved: string[];
    vantagesRemoved: string[];
    vantagesAdded: string[];
    message: string;
  } | null;
  rulesetChange: {
    type: 'ruleset-changed';
    versionA: string;
    versionB: string;
    message: string;
  } | null;
}

interface RecordSummary {
  totalChanges: number;
  additions: number;
  deletions: number;
  modifications: number;
  unchanged: number;
}

interface FindingsSummary {
  totalChanges: number;
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  severityChanges: number;
}

interface DiffResult {
  snapshotA: { id: string; createdAt: string; rulesetVersion: string };
  snapshotB: { id: string; createdAt: string; rulesetVersion: string };
  comparison: DiffComparison;
  summary: RecordSummary;
  findingsSummary: FindingsSummary;
}

interface DiffResponse {
  diff: DiffResult;
  warnings?: string[];
}

interface SnapshotHistoryPanelProps {
  domain: string;
}

async function fetchSnapshots(domain: string): Promise<SnapshotListItem[]> {
  const response = await fetch(`/api/snapshots/${encodeURIComponent(domain)}?limit=50`, {
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to load snapshots: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { snapshots: SnapshotListItem[] };
  return data.snapshots ?? [];
}

export function SnapshotHistoryPanel({ domain }: SnapshotHistoryPanelProps) {
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResponse | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  const {
    data: snapshots = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['snapshots', domain],
    queryFn: () => fetchSnapshots(domain),
    enabled: !!domain,
  });

  const compareMutation = useMutation({
    mutationFn: async ({ snapshotA, snapshotB }: { snapshotA?: string; snapshotB?: string }) => {
      const url = snapshotA
        ? `/api/snapshots/${encodeURIComponent(domain)}/diff`
        : `/api/snapshots/${encodeURIComponent(domain)}/compare-latest`;
      const body = snapshotA ? JSON.stringify({ snapshotA, snapshotB }) : undefined;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          errorBody.error ?? `${snapshotA ? 'Diff' : 'Compare latest'} failed: ${response.status}`
        );
      }
      return (await response.json()) as DiffResponse;
    },
    onSuccess: (data) => {
      setDiffResult(data);
      setDiffError(null);
    },
    onError: (error) => {
      setDiffError(error instanceof Error ? error.message : 'Unknown error');
    },
  });

  const compareSelected = () => {
    if (selectedA && selectedB)
      compareMutation.mutate({ snapshotA: selectedA, snapshotB: selectedB });
  };

  if (isLoading) {
    return (
      <div className="domain-history ds-panel" data-testid="snapshot-history-loading">
        <LoadingState message="Loading snapshot history…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="domain-history ds-panel" data-testid="snapshot-history-error">
        <ErrorState message={error.message} onRetry={refetch} />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="domain-history ds-panel" data-testid="snapshot-history-empty">
        <EmptyState
          icon="document"
          title="No snapshots yet"
          description="Collect DNS evidence to start building snapshot history."
          size="sm"
        />
      </div>
    );
  }

  const diffLoading = compareMutation.isPending;

  return (
    <section className="domain-history" data-testid="snapshot-history-panel" aria-label="Snapshots">
      <div className="domain-history__toolbar">
        <p className="domain-history__count">
          {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} collected
        </p>
        <div className="domain-history__actions">
          {snapshots.length >= 2 ? (
            <Button
              loading={diffLoading && !selectedA}
              onClick={() => compareMutation.mutate({})}
              size="sm"
              variant="primary"
              data-testid="compare-latest-btn"
            >
              Compare latest
            </Button>
          ) : null}
          <Button
            disabled={diffLoading || !selectedA || !selectedB || selectedA === selectedB}
            onClick={compareSelected}
            size="sm"
            variant="secondary"
            data-testid="compare-selected-btn"
          >
            Compare selected
          </Button>
        </div>
      </div>

      <div className="domain-history__table-wrap">
        <table className="domain-history__table" data-testid="snapshot-list-table">
          <thead>
            <tr>
              <th scope="col">A</th>
              <th scope="col">B</th>
              <th scope="col">Created</th>
              <th scope="col">Ruleset</th>
              <th scope="col">Findings</th>
              <th scope="col">Scope</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <tr
                key={snapshot.id}
                className={
                  selectedA === snapshot.id || selectedB === snapshot.id ? 'is-selected' : ''
                }
              >
                <td data-label="A">
                  <input
                    type="radio"
                    name="snapshotA"
                    checked={selectedA === snapshot.id}
                    onChange={() => setSelectedA(snapshot.id)}
                    aria-label={`Select snapshot ${snapshot.id.slice(0, 8)} as A (older)`}
                    className="domain-history__selection"
                  />
                </td>
                <td data-label="B">
                  <input
                    type="radio"
                    name="snapshotB"
                    checked={selectedB === snapshot.id}
                    onChange={() => setSelectedB(snapshot.id)}
                    aria-label={`Select snapshot ${snapshot.id.slice(0, 8)} as B (newer)`}
                    className="domain-history__selection"
                  />
                </td>
                <td data-label="Created" className="domain-history__timestamp">
                  {new Date(snapshot.createdAt).toLocaleString()}
                </td>
                <td data-label="Ruleset" className="domain-history__mono">
                  {snapshot.rulesetVersionId ? snapshot.rulesetVersionId.slice(0, 8) : '—'}
                </td>
                <td data-label="Findings">
                  {snapshot.findingsEvaluated ? (
                    <span className="ds-badge ds-badge--success">Evaluated</span>
                  ) : (
                    <span
                      className="ds-badge ds-badge--unknown"
                      title={`${snapshot.evaluationCoverage.errors[0]?.unknown.explanation ?? 'Evaluation coverage is incomplete'} ${snapshot.evaluationCoverage.errors[0]?.unknown.actionLabel ?? 'Run a fresh scan'}.`}
                    >
                      Unknown — refresh
                    </span>
                  )}
                </td>
                <td data-label="Scope" className="domain-history__scope">
                  {snapshot.queryScope.names.length} names, {snapshot.queryScope.types.length} types
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {diffError ? (
        <div className="domain-history__error" role="alert" data-testid="diff-error">
          {diffError}
        </div>
      ) : null}

      {diffLoading ? (
        <div className="domain-history__loading" data-testid="diff-loading">
          <LoadingState message="Computing snapshot diff…" size="sm" />
        </div>
      ) : null}

      {diffResult ? (
        <DiffResultView result={diffResult} onClose={() => setDiffResult(null)} />
      ) : null}
    </section>
  );
}

function DiffResultView({ result, onClose }: { result: DiffResponse; onClose: () => void }) {
  const { diff, warnings } = result;
  const { findingsSummary, comparison } = diff;
  const recordChanges = Array.isArray(comparison?.recordChanges) ? comparison.recordChanges : [];
  const nonUnchangedRecords = recordChanges.filter((record) => record.type !== 'unchanged');
  const recordStats = {
    added: recordChanges.filter((record) => record.type === 'added').length,
    removed: recordChanges.filter((record) => record.type === 'removed').length,
    modified: recordChanges.filter((record) => record.type === 'modified').length,
    unchanged: recordChanges.filter((record) => record.type === 'unchanged').length,
  };

  return (
    <section
      className="domain-diff ds-panel"
      data-testid="diff-result"
      aria-label="Snapshot comparison"
    >
      <div className="domain-diff__header">
        <div>
          <p className="ds-kicker">Evidence comparison</p>
          <h3>Comparison result</h3>
        </div>
        <Button onClick={onClose} size="sm" variant="quiet" data-testid="close-diff-btn">
          Close
        </Button>
      </div>

      <div className="domain-diff__snapshots">
        <SnapshotReference label="Snapshot A (older)" snapshot={diff.snapshotA} />
        <SnapshotReference label="Snapshot B (newer)" snapshot={diff.snapshotB} />
      </div>

      {warnings?.length ? (
        <div
          className="domain-diff__notice domain-diff__notice--warning"
          data-testid="diff-warnings"
        >
          <p>Warnings</p>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section>
        <p className="ds-kicker">DNS records</p>
        <div className="domain-diff__summary" data-testid="diff-summary">
          <SummaryCard label="Added" value={recordStats.added} tone="success" />
          <SummaryCard label="Removed" value={recordStats.removed} tone="danger" />
          <SummaryCard label="Modified" value={recordStats.modified} tone="warning" />
          <SummaryCard label="Unchanged" value={recordStats.unchanged} tone="neutral" />
        </div>
      </section>

      {comparison.scopeChanges ? (
        <div
          className="domain-diff__notice domain-diff__notice--warning"
          data-testid="scope-changes"
        >
          <p>Scope changed</p>
          <span>{comparison.scopeChanges.message}</span>
        </div>
      ) : null}

      {comparison.rulesetChange ? (
        <div
          className="domain-diff__notice domain-diff__notice--info"
          data-testid="ruleset-changes"
        >
          <p>Ruleset changed</p>
          <span>{comparison.rulesetChange.message}</span>
        </div>
      ) : null}

      {nonUnchangedRecords.length ? (
        <ChangeSection title="Record changes" testId="record-changes">
          <DiffTable>
            <thead>
              <tr>
                <th scope="col">Change</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Values</th>
              </tr>
            </thead>
            <tbody>
              {nonUnchangedRecords.map((record) => (
                <tr key={`${record.name}-${record.recordType}-${record.type}`}>
                  <td data-label="Change">
                    <ChangeBadge type={record.type} />
                  </td>
                  <td data-label="Name" className="domain-history__mono">
                    {record.name}
                  </td>
                  <td data-label="Type" className="domain-history__mono">
                    {record.recordType}
                  </td>
                  <td data-label="Values">
                    {record.type === 'added' && record.valuesB?.join(', ')}
                    {record.type === 'removed' ? (
                      <span className="domain-diff__removed">{record.valuesA?.join(', ')}</span>
                    ) : null}
                    {record.type === 'modified' ? (
                      <span>
                        <span className="domain-diff__removed">
                          {record.diff?.removed?.join(', ')}
                        </span>{' '}
                        <span className="domain-diff__added">{record.diff?.added?.join(', ')}</span>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DiffTable>
        </ChangeSection>
      ) : null}

      {comparison.ttlChanges.length ? (
        <ChangeSection title="TTL changes" testId="ttl-changes">
          <DiffTable>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
                <th scope="col">Δ</th>
              </tr>
            </thead>
            <tbody>
              {comparison.ttlChanges.map((ttl) => (
                <tr key={`${ttl.name}-${ttl.recordType}`}>
                  <td data-label="Name" className="domain-history__mono">
                    {ttl.name}
                  </td>
                  <td data-label="Type" className="domain-history__mono">
                    {ttl.recordType}
                  </td>
                  <td data-label="Before" className="domain-history__timestamp">
                    {ttl.ttlA}s
                  </td>
                  <td data-label="After" className="domain-history__timestamp">
                    {ttl.ttlB}s
                  </td>
                  <td
                    data-label="Change"
                    className={ttl.change > 0 ? 'domain-diff__added' : 'domain-diff__removed'}
                  >
                    {ttl.change > 0 ? '+' : ''}
                    {ttl.change}s
                  </td>
                </tr>
              ))}
            </tbody>
          </DiffTable>
        </ChangeSection>
      ) : null}

      {findingsSummary.totalChanges ? (
        <ChangeSection title="Finding changes" testId="finding-changes">
          <div className="domain-diff__finding-summary">
            <span>+{findingsSummary.added} added</span>
            <span>−{findingsSummary.removed} removed</span>
            <span>~{findingsSummary.modified} modified</span>
          </div>
          <ul className="domain-diff__findings">
            {comparison.findingChanges
              .filter((finding) => finding.type !== 'unchanged')
              .map((finding) => (
                <li key={`${finding.findingType}-${finding.type}`}>
                  <ChangeBadge type={finding.type} />
                  <div>
                    <strong>{finding.title}</strong>
                    <p>
                      {finding.findingType}
                      {finding.severityA &&
                      finding.severityB &&
                      finding.severityA !== finding.severityB
                        ? ` · severity ${finding.severityA} → ${finding.severityB}`
                        : finding.severityB
                          ? ` · ${finding.severityB}`
                          : ''}
                    </p>
                    {finding.description ? <small>{finding.description}</small> : null}
                  </div>
                </li>
              ))}
          </ul>
        </ChangeSection>
      ) : null}

      {!nonUnchangedRecords.length &&
      !comparison.ttlChanges.length &&
      !findingsSummary.totalChanges ? (
        <p className="domain-diff__empty" data-testid="no-changes">
          No record or finding changes detected between these snapshots.
        </p>
      ) : null}
    </section>
  );
}

function SnapshotReference({
  label,
  snapshot,
}: {
  label: string;
  snapshot: { createdAt: string; rulesetVersion: string };
}) {
  return (
    <div className="domain-diff__snapshot ds-panel--muted">
      <p>{label}</p>
      <span className="domain-history__timestamp">
        {new Date(snapshot.createdAt).toLocaleString()}
      </span>
      <code>Ruleset: {snapshot.rulesetVersion.slice(0, 8)}</code>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`domain-diff__summary-card domain-diff__summary-card--${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ChangeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    added: '+',
    removed: '−',
    modified: '~',
    unchanged: '=',
  };
  return (
    <span className={`domain-change-badge domain-change-badge--${type}`}>
      {labels[type] ?? '?'}
    </span>
  );
}

function ChangeSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="domain-diff__section" data-testid={testId}>
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function DiffTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="domain-history__table-wrap">
      <table className="domain-history__table domain-history__table--diff">{children}</table>
    </div>
  );
}
