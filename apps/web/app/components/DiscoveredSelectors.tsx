/**
 * Discovered DKIM Selectors Component
 *
 * Displays DKIM selectors discovered during mail collection
 * with their provenance and confidence levels.
 */

import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState } from './ui/StateDisplay.js';

interface DiscoveredSelector {
  selector: string;
  found: boolean;
  provenance:
    | 'managed-zone-config'
    | 'operator-supplied'
    | 'provider-heuristic'
    | 'common-dictionary'
    | 'not-found';
  confidence: 'certain' | 'high' | 'medium' | 'low' | 'heuristic';
  provider?: string;
}

interface SelectorResponse {
  selectors?: DiscoveredSelector[];
}

interface DiscoveredSelectorsProps {
  snapshotId: string;
}

export function DiscoveredSelectors({ snapshotId }: DiscoveredSelectorsProps) {
  const {
    data: selectors = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['selectors', snapshotId],
    queryFn: async () => {
      const res = await fetch(`/api/snapshot/${snapshotId}/selectors`);
      const data = (await res.json()) as SelectorResponse;
      return data.selectors ?? [];
    },
    enabled: !!snapshotId,
  });

  if (isLoading) {
    return <LoadingState message="Discovering DKIM selectors..." size="sm" />;
  }

  if (error) {
    return <ErrorState message={error.message} size="sm" />;
  }

  if (selectors.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        <p>No DKIM selectors discovered yet.</p>
        <p className="mt-1">This may indicate:</p>
        <ul className="list-disc ml-5 mt-1">
          <li>No DKIM configured for this domain</li>
          <li>Selectors use non-standard names</li>
          <li>Provider not in detection database</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selectors.map((sel) => (
        <div
          key={sel.selector}
          className={`p-3 rounded-lg border ${
            sel.found ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono font-medium">{sel.selector}._domainkey</code>
              {sel.found && (
                <span className="text-green-600">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </div>
            <ConfidenceBadge confidence={sel.confidence} />
          </div>

          <div className="mt-2 text-xs text-gray-600">
            <span className="font-medium">Source:</span> {formatProvenance(sel.provenance)}
            {sel.provider && <span className="ml-2 text-blue-600">({sel.provider})</span>}
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-500 mt-3">
        Selectors discovered using a 5-level precedence strategy (managed config → operator supplied
        → provider heuristic → common dictionary → not found).
      </p>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    certain: 'bg-green-100 text-green-800',
    high: 'bg-blue-100 text-blue-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-orange-100 text-orange-800',
    heuristic: 'bg-gray-100 text-gray-600',
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${styles[confidence] || styles.heuristic}`}
    >
      {confidence}
    </span>
  );
}

function formatProvenance(provenance: string): string {
  const labels: Record<string, string> = {
    'managed-zone-config': 'Managed zone configuration',
    'operator-supplied': 'Operator supplied',
    'provider-heuristic': 'Provider heuristic detection',
    'common-dictionary': 'Common selector dictionary',
    'not-found': 'Not found',
  };
  return labels[provenance] || provenance;
}
