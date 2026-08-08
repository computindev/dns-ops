import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';

interface SharedReport {
  id: string;
  title: string;
  visibility: 'private' | 'tenant' | 'shared';
  status: 'generating' | 'ready' | 'expired' | 'error';
  shareToken?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  summary: {
    totalMonitored: number;
    activeAlerts: number;
    bySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
}

async function fetchReports(): Promise<{ reports: SharedReport[] }> {
  const response = await fetch('/api/alerts/reports', { credentials: 'include' });
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
    throw new Error(body.error || 'Failed to load shared reports');
  }
  return (await response.json()) as { reports: SharedReport[] };
}

export function SharedReportsPanel() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const reportTitleId = useId();

  const origin = useMemo(() => (typeof window === 'undefined' ? '' : window.location.origin), []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-reports'],
    queryFn: fetchReports,
  });

  const reports = data?.reports ?? [];
  const status = error ? (error as Error & { status?: number }).status : undefined;
  const authRequired = status === 401;

  const createMutation = useMutation({
    mutationFn: async (reportTitle: string) => {
      const response = await fetch('/api/alerts/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: reportTitle.trim() || undefined,
          visibility: 'shared',
          expiresInDays: 7,
        }),
        credentials: 'include',
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
        throw new Error(body.error || 'Failed to create shared report');
      }
    },
    onSuccess: () => {
      setTitle('');
      queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to create shared report');
    },
  });

  const expireMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const response = await fetch(`/api/alerts/reports/${reportId}/expire`, {
        method: 'POST',
        credentials: 'include',
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
        throw new Error(body.error || 'Failed to expire shared report');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to expire shared report');
    },
  });

  return (
    <div className="ds-panel portfolio-panel">
      <div className="px-4 py-3 border-b border-line">
        <h3 className="text-lg font-medium text-ink">Shared Reports</h3>
        <p className="text-sm text-muted">
          Create persisted, redacted reports for external stakeholders
        </p>
      </div>

      <div className="p-4 space-y-4">
        {localError && (
          <div className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">
            {localError}
          </div>
        )}

        {authRequired && (
          <div className="rounded-lg border border-warning bg-warning-surface p-4 text-sm text-warning">
            Operator sign-in is required to list or create tenant shared reports. Public share links
            continue to work without sign-in.
          </div>
        )}

        <div className="rounded-lg border border-line p-4 space-y-3">
          <div>
            <label htmlFor={reportTitleId} className="block text-sm font-medium text-text">
              Report title
            </label>
            <input
              id={reportTitleId}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly stakeholder report"
              disabled={authRequired}
              className="ds-input mt-1 block w-full rounded-md border-line disabled:bg-surface-muted disabled:text-muted"
            />
          </div>

          <button
            type="button"
            onClick={() => createMutation.mutate(title)}
            disabled={createMutation.isPending || authRequired}
            className="ds-button ds-button--primary ds-button--md"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Shared Report'}
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted">Loading reports...</p>
        ) : authRequired ? (
          <div className="rounded-lg border border-line bg-surface-muted p-4 text-sm text-text">
            Sign in to list and create tenant shared reports.
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface-muted p-4 text-sm text-text">
            No shared reports yet.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const shareUrl = report.shareToken
                ? `${origin}/api/alerts/reports/shared/${report.shareToken}`
                : null;
              return (
                <div key={report.id} className="rounded-lg border border-line p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-medium text-ink">{report.title}</h4>
                      <p className="text-xs text-muted">
                        {report.status} · {new Date(report.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="ds-badge ds-badge--neutral">{report.visibility}</span>
                      {report.status !== 'expired' && !authRequired && (
                        <button
                          type="button"
                          onClick={() => expireMutation.mutate(report.id)}
                          disabled={
                            expireMutation.isPending && expireMutation.variables === report.id
                          }
                          className="rounded border border-line px-2 py-1 text-xs text-text hover:bg-surface-muted disabled:text-faint"
                        >
                          {expireMutation.isPending && expireMutation.variables === report.id
                            ? 'Expiring...'
                            : 'Expire'}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-text">
                    {report.summary.activeAlerts} active alerts across{' '}
                    {report.summary.totalMonitored} monitored domains.
                  </p>

                  {shareUrl && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        Share link
                      </p>
                      <a className="text-sm text-brand break-all hover:text-brand" href={shareUrl}>
                        {shareUrl}
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
