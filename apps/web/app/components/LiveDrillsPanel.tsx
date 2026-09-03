/**
 * Live Drills Panel - Issue #62
 *
 * Operator surface for starting the fail-closed controlled-live harness
 * against the allowlisted asorin.ai tuples. Starts require two distinct
 * operators (request + confirm); every other domain stays observation-only.
 * This panel never sees provider or fixture secrets — the harness resolves
 * its own runtime credentials and fails closed without them.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface DrillTuple {
  name: string;
  types: string[];
  mutationIds: string[];
}

interface DrillRunRow {
  id: string;
  mutationId: string;
  recordName: string;
  status: string;
  requesterActor: string;
  confirmerActor: string | null;
  recoveryArtifact: string | null;
  runnerMessage: string | null;
  createdAt: string;
}

interface DrillsPayload {
  harness: { available: boolean; manifestId: string | null; zone: string | null };
  tuples: DrillTuple[];
  scenarios: Record<string, { host: string; expectedSignal: string }>;
  runs: DrillRunRow[];
}

async function fetchDrills(): Promise<DrillsPayload> {
  const response = await fetch('/api/portfolio/drills', { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to load live drills');
  return (await response.json()) as DrillsPayload;
}

const STATUS_LABELS: Record<string, string> = {
  requested: 'Awaiting second-operator confirm',
  approved: 'Confirmed — ready to start',
  started: 'Harness running',
  fault_applied: 'Fault applied — restore required',
  failed: 'Failed (fail-closed)',
};

export function LiveDrillsPanel() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['live-drills'],
    queryFn: fetchDrills,
  });

  const act = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: Record<string, unknown> }) => {
      const response = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Drill action failed');
      }
      return response.json();
    },
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['live-drills'] });
    },
    onError: (mutationError) => setActionError((mutationError as Error).message),
  });

  const tuples = data?.tuples ?? [];
  const runs = data?.runs ?? [];
  const openRun = runs.find((run) => ['requested', 'approved', 'started'].includes(run.status));
  const settledRuns = runs.filter(
    (run) => !['requested', 'approved', 'started'].includes(run.status)
  );

  return (
    <div className="ds-panel portfolio-panel">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-lg font-medium text-ink">Live drills</h3>
        <p className="text-sm text-muted">
          Controlled LIVE-01–03 runs through the fail-closed harness. Starting a drill requires a
          second operator to confirm; only the allowlisted asorin.ai tuples can start. All other
          domains stay observation-only.
        </p>
      </div>

      <div className="space-y-4 p-4">
        {error && (
          <div className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">
            Live drills are unavailable right now.
          </div>
        )}
        {isLoading && <div className="py-4 text-center text-muted">Loading live drills...</div>}

        {data && !data.harness.available && (
          <div className="rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning">
            The controlled-live harness is not available in this deployment. Drills can only be
            started where the harness and its runtime secret files are provisioned.
          </div>
        )}

        {actionError && (
          <div className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">
            {actionError}
          </div>
        )}

        {data?.harness.available && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Allowlisted live drill tuples</caption>
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">
                    Record
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Types
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Scenario
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {tuples.map((tuple) =>
                  tuple.mutationIds.map((mutationId) => {
                    const scenario = data.scenarios[mutationId];
                    const busy = openRun !== undefined;
                    return (
                      <tr key={`${tuple.name}-${mutationId}`} className="border-b border-line">
                        <td className="px-2 py-2 font-medium text-ink">{tuple.name}</td>
                        <td className="px-2 py-2">{tuple.types.join(', ')}</td>
                        <td className="px-2 py-2">
                          {mutationId}
                          {scenario?.host ? ` · ${scenario.host}` : ''}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            disabled={busy || act.isPending}
                            onClick={() =>
                              act.mutate({ path: '/api/portfolio/drills', body: { mutationId } })
                            }
                            className="ds-button ds-button--secondary ds-button--sm"
                          >
                            Request drill
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {openRun && (
          <div className="rounded-lg border border-brand bg-info-surface p-3 text-sm text-text">
            <p className="font-medium text-ink">
              {openRun.mutationId} · {openRun.recordName} —{' '}
              {STATUS_LABELS[openRun.status] ?? openRun.status}
            </p>
            <p className="mt-1 text-muted">
              Requested by {openRun.requesterActor}
              {openRun.confirmerActor ? ` · confirmed by ${openRun.confirmerActor}` : ''}
            </p>
            <div className="mt-2 flex gap-2">
              {openRun.status === 'requested' && (
                <button
                  type="button"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({ path: `/api/portfolio/drills/${openRun.id}/confirm` })
                  }
                  className="ds-button ds-button--primary ds-button--sm"
                >
                  Confirm as second operator
                </button>
              )}
              {openRun.status === 'approved' && (
                <button
                  type="button"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ path: `/api/portfolio/drills/${openRun.id}/start` })}
                  className="ds-button ds-button--primary ds-button--sm"
                >
                  Start harness
                </button>
              )}
            </div>
          </div>
        )}

        {settledRuns.length > 0 && (
          <div>
            <h4 className="mb-2 font-medium text-ink">Recent drill runs</h4>
            <ul className="space-y-2 text-sm">
              {settledRuns.slice(0, 5).map((run) => (
                <li key={run.id} className="rounded-lg border border-line p-3">
                  <p className="font-medium text-ink">
                    {run.mutationId} · {run.recordName} — {STATUS_LABELS[run.status] ?? run.status}
                  </p>
                  {run.recoveryArtifact && (
                    <p className="mt-1 text-muted">
                      Recovery artifact: {run.recoveryArtifact}. Restore with{' '}
                      <code>tools/controlled-live-harness/runner.mjs</code> before the next drill.
                    </p>
                  )}
                  {run.runnerMessage && <p className="mt-1 text-muted">{run.runnerMessage}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
