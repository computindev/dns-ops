/**
 * Snapshot History Panel — Bead 07 UI
 *
 * Lists snapshots for a domain and allows comparing two snapshots
 * to see record changes, finding changes, scope/ruleset drift.
 *
 * API endpoints consumed:
 *   GET  /api/snapshots/:domain          → snapshot list
 *   POST /api/snapshots/:domain/diff     → compare two snapshots
 *   POST /api/snapshots/:domain/compare-latest → compare latest two
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from './ui/StateDisplay.js';

// ---------------------------------------------------------------------------
// Types — mirrors JSON responses from snapshots.ts
// ---------------------------------------------------------------------------

interface SnapshotListItem {
  id: string;
  createdAt: string;
  rulesetVersionId: string | null;
  findingsEvaluated: boolean;
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
    vantagesAdded: string[];
    vantagesRemoved: string[];
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SnapshotHistoryPanelProps {
  domain: string;
}

async function fetchSnapshots(domain: string): Promise<SnapshotListItem[]> {
  const res = await fetch(`/api/snapshots/${encodeURIComponent(domain)}?limit=50`, {
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Failed to load snapshots: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { snapshots: SnapshotListItem[] };
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
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          body.error ?? `${snapshotA ? 'Diff' : 'Compare latest'} failed: ${res.status}`
        );
      }
      return (await res.json()) as DiffResponse;
    },
    onSuccess: (data) => {
      setDiffResult(data);
      setDiffError(null);
    },
    onError: (err) => {
      setDiffError(err instanceof Error ? err.message : 'Unknown error');
    },
  });

  const compareSelected = () => {
    if (!selectedA || !selectedB) return;
    compareMutation.mutate({ snapshotA: selectedA, snapshotB: selectedB });
  };

  const compareLatest = () => {
    compareMutation.mutate({});
  };

  const clearDiff = () => {
    setDiffResult(null);
    setDiffError(null);
  };

  if (isLoading) {
    return (
      <div data-testid="snapshot-history-loading">
        <LoadingState message="Loading snapshot history…" />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="snapshot-history-error">
        <ErrorState message={error.message} onRetry={refetch} />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div data-testid="snapshot-history-empty">
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
    <div className="space-y-6" data-testid="snapshot-history-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Snapshot History</h3>
          <p className="text-sm text-gray-500">
            {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} collected
          </p>
        </div>
        <div className="flex gap-2">
          {snapshots.length >= 2 && (
            <button
              type="button"
              onClick={compareLatest}
              disabled={diffLoading}
              className="focus-ring px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              data-testid="compare-latest-btn"
            >
              {diffLoading && !selectedA ? 'Comparing…' : 'Compare Latest'}
            </button>
          )}
          <button
            type="button"
            onClick={compareSelected}
            disabled={diffLoading || !selectedA || !selectedB || selectedA === selectedB}
            className="focus-ring px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="compare-selected-btn"
          >
            Compare Selected
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-sm" data-testid="snapshot-list-table">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">A</th>
              <th className="px-3 py-2 text-left font-medium">B</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
              <th className="px-3 py-2 text-left font-medium">Ruleset</th>
              <th className="px-3 py-2 text-left font-medium">Findings</th>
              <th className="px-3 py-2 text-left font-medium">Scope</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {snapshots.map((snap) => (
              <tr
                key={snap.id}
                className={`hover:bg-gray-50 ${
                  selectedA === snap.id || selectedB === snap.id ? 'bg-blue-50' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="radio"
                    name="snapshotA"
                    checked={selectedA === snap.id}
                    onChange={() => setSelectedA(snap.id)}
                    aria-label={`Select snapshot ${snap.id.slice(0, 8)} as A (older)`}
                    className="accent-blue-600"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="radio"
                    name="snapshotB"
                    checked={selectedB === snap.id}
                    onChange={() => setSelectedB(snap.id)}
                    aria-label={`Select snapshot ${snap.id.slice(0, 8)} as B (newer)`}
                    className="accent-blue-600"
                  />
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                  {new Date(snap.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {snap.rulesetVersionId ? snap.rulesetVersionId.slice(0, 8) : '—'}
                </td>
                <td className="px-3 py-2">
                  {snap.findingsEvaluated ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Evaluated
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      Pending
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {snap.queryScope.names.length} names, {snap.queryScope.types.length} types
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {diffError && (
        <div
          className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700"
          role="alert"
          data-testid="diff-error"
        >
          {diffError}
        </div>
      )}

      {diffLoading && (
        <div data-testid="diff-loading">
          <LoadingState message="Computing snapshot diff…" size="sm" />
        </div>
      )}

      {diffResult && <DiffResultView result={diffResult} onClose={clearDiff} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff Result View
// ---------------------------------------------------------------------------

function DiffResultView({ result, onClose }: { result: DiffResponse; onClose: () => void }) {
  const { diff, warnings } = result;
  const { findingsSummary, comparison } = diff;

  const nonUnchangedRecords = comparison.recordChanges.filter((r) => r.type !== 'unchanged');
  const recordStats = {
    added: comparison.recordChanges.filter((r) => r.type === 'added').length,
    removed: comparison.recordChanges.filter((r) => r.type === 'removed').length,
    modified: comparison.recordChanges.filter((r) => r.type === 'modified').length,
    unchanged: comparison.recordChanges.filter((r) => r.type === 'unchanged').length,
  };

  return (
    <div className="space-y-4" data-testid="diff-result">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">Comparison Result</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
          data-testid="close-diff-btn"
        >
          ✕ Close
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="font-medium text-gray-700">Snapshot A (older)</p>
          <p className="text-xs text-gray-500 tabular-nums">
            {new Date(diff.snapshotA.createdAt).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 font-mono">
            Ruleset: {diff.snapshotA.rulesetVersion.slice(0, 8)}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="font-medium text-gray-700">Snapshot B (newer)</p>
          <p className="text-xs text-gray-500 tabular-nums">
            {new Date(diff.snapshotB.createdAt).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 font-mono">
            Ruleset: {diff.snapshotB.rulesetVersion.slice(0, 8)}
          </p>
        </div>
      </div>

      {warnings && warnings.length > 0 && (
        <div
          className="p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-sm text-yellow-800"
          data-testid="diff-warnings"
        >
          <p className="font-medium mb-1">⚠ Warnings</p>
          <ul className="list-disc list-inside space-y-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h5 className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
          DNS Records
        </h5>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="diff-summary">
          <SummaryCard label="Added" value={recordStats.added} color="green" />
          <SummaryCard label="Removed" value={recordStats.removed} color="red" />
          <SummaryCard label="Modified" value={recordStats.modified} color="yellow" />
          <SummaryCard label="Unchanged" value={recordStats.unchanged} color="gray" />
        </div>
      </div>

      {comparison.scopeChanges && (
        <div
          className="p-3 rounded-lg border border-orange-200 bg-orange-50 text-sm"
          data-testid="scope-changes"
        >
          <p className="font-medium text-orange-800 mb-1">Scope Changed</p>
          <p className="text-orange-700">{comparison.scopeChanges.message}</p>
        </div>
      )}

      {comparison.rulesetChange && (
        <div
          className="p-3 rounded-lg border border-purple-200 bg-purple-50 text-sm"
          data-testid="ruleset-changes"
        >
          <p className="font-medium text-purple-800 mb-1">Ruleset Changed</p>
          <p className="text-purple-700">{comparison.rulesetChange.message}</p>
        </div>
      )}

      {nonUnchangedRecords.length > 0 && (
        <ChangeSection title="Record Changes" testId="record-changes">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Change</th>
                  <th className="px-3 py-1.5 text-left font-medium">Name</th>
                  <th className="px-3 py-1.5 text-left font-medium">Type</th>
                  <th className="px-3 py-1.5 text-left font-medium">Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {nonUnchangedRecords.map((r) => (
                  <tr key={`${r.name}-${r.recordType}-${r.type}`}>
                    <td className="px-3 py-1.5">
                      <ChangeBadge type={r.type} />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.name}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.recordType}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.type === 'added' && r.valuesB?.join(', ')}
                      {r.type === 'removed' && (
                        <span className="line-through text-gray-400">{r.valuesA?.join(', ')}</span>
                      )}
                      {r.type === 'modified' && (
                        <span>
                          <span className="line-through text-red-400 mr-1">
                            {r.diff?.removed?.join(', ')}
                          </span>
                          <span className="text-green-700">{r.diff?.added?.join(', ')}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChangeSection>
      )}

      {comparison.ttlChanges.length > 0 && (
        <ChangeSection title="TTL Changes" testId="ttl-changes">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Name</th>
                  <th className="px-3 py-1.5 text-left font-medium">Type</th>
                  <th className="px-3 py-1.5 text-right font-medium">Before</th>
                  <th className="px-3 py-1.5 text-right font-medium">After</th>
                  <th className="px-3 py-1.5 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comparison.ttlChanges.map((t) => (
                  <tr key={`${t.name}-${t.recordType}`}>
                    <td className="px-3 py-1.5 font-mono text-xs">{t.name}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{t.recordType}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.ttlA}s</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.ttlB}s</td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${t.change > 0 ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {t.change > 0 ? '+' : ''}
                      {t.change}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChangeSection>
      )}

      {findingsSummary.totalChanges > 0 && (
        <ChangeSection title="Finding Changes" testId="finding-changes">
          <div className="space-y-2">
            <div className="flex gap-3 text-xs text-gray-500 mb-2">
              <span>+{findingsSummary.added} added</span>
              <span>−{findingsSummary.removed} removed</span>
              <span>~{findingsSummary.modified} modified</span>
            </div>
            {comparison.findingChanges
              .filter((f) => f.type !== 'unchanged')
              .map((f) => (
                <div
                  key={`${f.findingType}-${f.type}`}
                  className="flex items-start gap-2 p-2 rounded border border-gray-100"
                >
                  <ChangeBadge type={f.type} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{f.title}</p>
                    <p className="text-xs text-gray-500">
                      {f.findingType}
                      {f.severityA && f.severityB && f.severityA !== f.severityB
                        ? ` · severity ${f.severityA} → ${f.severityB}`
                        : f.severityB
                          ? ` · ${f.severityB}`
                          : ''}
                    </p>
                    {f.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </ChangeSection>
      )}

      {nonUnchangedRecords.length === 0 &&
        comparison.ttlChanges.length === 0 &&
        findingsSummary.totalChanges === 0 && (
          <div className="text-center py-6 text-gray-500 text-sm" data-testid="no-changes">
            No record or finding changes detected between these snapshots.
          </div>
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'red' | 'yellow' | 'gray';
}) {
  const bg = {
    green: 'bg-green-50',
    red: 'bg-red-50',
    yellow: 'bg-yellow-50',
    gray: 'bg-gray-50',
  };
  return (
    <div className={`${bg[color]} rounded-lg p-3 text-center`}>
      <div className="text-xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

function ChangeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    added: 'bg-green-100 text-green-800',
    removed: 'bg-red-100 text-red-800',
    modified: 'bg-yellow-100 text-yellow-800',
    unchanged: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = {
    added: '+',
    removed: '−',
    modified: '~',
    unchanged: '=',
  };
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold ${styles[type] ?? styles.unchanged}`}
    >
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
    <div data-testid={testId}>
      <h5 className="font-medium text-gray-900 mb-2">{title}</h5>
      {children}
    </div>
  );
}
