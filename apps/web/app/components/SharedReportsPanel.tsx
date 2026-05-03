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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Shared Reports</h3>
        <p className="text-sm text-gray-500">
          Create persisted, redacted reports for external stakeholders
        </p>
      </div>

      <div className="p-4 space-y-4">
        {localError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {localError}
          </div>
        )}

        {authRequired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Operator sign-in is required to list or create tenant shared reports. Public share links
            continue to work without sign-in.
          </div>
        )}

        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <div>
            <label htmlFor={reportTitleId} className="block text-sm font-medium text-gray-700">
              Report title
            </label>
            <input
              id={reportTitleId}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly stakeholder report"
              disabled={authRequired}
              className="focus-ring mt-1 block w-full rounded-md border-gray-300 shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          <button
            type="button"
            onClick={() => createMutation.mutate(title)}
            disabled={createMutation.isPending || authRequired}
            className="focus-ring min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Shared Report'}
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading reports...</p>
        ) : authRequired ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            Sign in to list and create tenant shared reports.
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No shared reports yet.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const shareUrl = report.shareToken
                ? `${origin}/api/alerts/reports/shared/${report.shareToken}`
                : null;
              return (
                <div key={report.id} className="rounded-lg border border-gray-200 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-medium text-gray-900">{report.title}</h4>
                      <p className="text-xs text-gray-500">
                        {report.status} · {new Date(report.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {report.visibility}
                      </span>
                      {report.status !== 'expired' && !authRequired && (
                        <button
                          type="button"
                          onClick={() => expireMutation.mutate(report.id)}
                          disabled={
                            expireMutation.isPending && expireMutation.variables === report.id
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:text-gray-400"
                        >
                          {expireMutation.isPending && expireMutation.variables === report.id
                            ? 'Expiring...'
                            : 'Expire'}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-700">
                    {report.summary.activeAlerts} active alerts across{' '}
                    {report.summary.totalMonitored} monitored domains.
                  </p>

                  {shareUrl && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Share link
                      </p>
                      <a
                        className="text-sm text-blue-600 break-all hover:text-blue-700"
                        href={shareUrl}
                      >
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
