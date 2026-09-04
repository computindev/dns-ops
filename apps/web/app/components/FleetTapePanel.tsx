/**
 * Fleet Tape Panel - issue #57
 *
 * Portfolio-side digest of snapshot diffs from the last 24 hours. Reads the
 * same tenant-scoped digest as the MCP `fleet_tape` tool.
 */

import { useQuery } from '@tanstack/react-query';

interface FleetTapeEntry {
  domainId: string;
  domainName: string;
  snapshotId: string;
  previousSnapshotId: string | null;
  firstSnapshot: boolean;
  capturedAt: string;
  summary: {
    totalChanges: number;
    additions: number;
    deletions: number;
    modifications: number;
    unchanged: number;
  };
  findingsSummary: {
    totalChanges: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    severityChanges: number;
  };
}

interface FleetTapeResponse {
  generatedAt: string;
  windowHours: number;
  totalDomains: number;
  changedDomains: number;
  entries: FleetTapeEntry[];
}

export function FleetTapePanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fleet-tape'],
    queryFn: async () => {
      const response = await fetch('/api/portfolio/tape', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load fleet tape');
      return (await response.json()) as FleetTapeResponse;
    },
  });

  return (
    <div className="ds-panel portfolio-panel">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-lg font-medium text-ink">24h fleet tape</h3>
        <p className="text-sm text-muted">
          Snapshot changes captured across the portfolio in the last 24 hours.
        </p>
      </div>
      <div className="space-y-4 p-4">
        {isLoading ? (
          <div className="py-8 text-center text-muted">Loading fleet tape...</div>
        ) : isError || !data ? (
          <div className="py-8 text-center text-muted">
            The fleet tape is unavailable right now.
          </div>
        ) : data.entries.length === 0 ? (
          <div className="py-8 text-center text-muted">
            No snapshot changes in the last {data.windowHours} hours.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Snapshot changes in the last 24 hours</caption>
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">
                    Domain
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Captured
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Record changes
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Finding changes
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.snapshotId} className="border-b border-line">
                    <td className="px-2 py-2">
                      {entry.domainName}
                      {entry.firstSnapshot && (
                        <span className="ml-2 text-xs text-muted">first snapshot</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <time dateTime={new Date(entry.capturedAt).toISOString()}>
                        {new Date(entry.capturedAt).toLocaleString()}
                      </time>
                    </td>
                    <td className="px-2 py-2">
                      +{entry.summary.additions} −{entry.summary.deletions} ~
                      {entry.summary.modifications}
                    </td>
                    <td className="px-2 py-2">
                      +{entry.findingsSummary.added} −{entry.findingsSummary.removed} ~
                      {entry.findingsSummary.modified}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
