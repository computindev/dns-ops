/**
 * Simulation Panel Component
 *
 * Shows proposed DNS changes for actionable findings, with dry-run results
 * showing which findings would resolve, remain, or be introduced.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from './ui/StateDisplay.js';

interface ProposedChange {
  action: 'add' | 'modify' | 'remove';
  name: string;
  type: string;
  currentValues: string[];
  proposedValues: string[];
  rationale: string;
  findingType: string;
  risk: 'low' | 'medium' | 'high';
}

interface SimFinding {
  type: string;
  title: string;
  severity: string;
  ruleId: string;
}

interface SimulationResult {
  domain: string;
  detectedProvider: string;
  proposedChanges: ProposedChange[];
  currentFindings: SimFinding[];
  projectedFindings: SimFinding[];
  resolvedFindings: SimFinding[];
  remainingFindings: SimFinding[];
  newFindings: SimFinding[];
  summary: {
    changesProposed: number;
    findingsBefore: number;
    findingsAfter: number;
    findingsResolved: number;
    findingsNew: number;
  };
}

interface SimulationPanelProps {
  snapshotId: string | null;
}

const RISK_COLORS: Record<string, string> = {
  low: '#16a34a',
  medium: '#d97706',
  high: '#dc2626',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#2563eb',
  info: '#6b7280',
};

const ACTION_LABELS: Record<string, string> = {
  add: 'Add',
  modify: 'Modify',
  remove: 'Remove',
};

async function runSimulationFetch(snapshotId: string): Promise<SimulationResult> {
  const response = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMessage = `Simulation failed (${response.status})`;
    try {
      const errData = (await response.json()) as { error?: string };
      if (errData.error) errorMessage = errData.error;
    } catch {
      // Non-JSON error response — use status-based message
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as SimulationResult;
}

export function SimulationPanel({ snapshotId }: SimulationPanelProps) {
  const queryClient = useQueryClient();
  const [hasRun, setHasRun] = useState(false);

  const {
    data: result,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['simulation', snapshotId],
    queryFn: () => runSimulationFetch(snapshotId!),
    enabled: !!snapshotId && hasRun,
    staleTime: 5 * 60 * 1000, // 5 minutes — simulation results are expensive
  });

  const handleRun = () => {
    setHasRun(true);
    refetch();
  };

  if (!snapshotId) {
    return (
      <EmptyState
        icon="shield"
        title="No snapshot available"
        description="Collect data first, then simulate fixes."
        size="sm"
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Running simulation..." />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={handleRun} />;
  }

  // Not yet run
  if (!result) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Simulate DNS changes to see which findings would be resolved.
        </p>
        <button
          type="button"
          onClick={handleRun}
          style={{
            padding: '0.5rem 1.5rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Run Simulation
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Summary bar */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          padding: '1rem',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <SummaryPill label="Changes" value={result.summary.changesProposed} />
        <SummaryPill label="Findings before" value={result.summary.findingsBefore} />
        <SummaryPill
          label="After"
          value={result.summary.findingsAfter}
          color={
            result.summary.findingsAfter < result.summary.findingsBefore ? '#16a34a' : undefined
          }
        />
        <SummaryPill label="Resolved" value={result.summary.findingsResolved} color="#16a34a" />
        {result.summary.findingsNew > 0 && (
          <SummaryPill label="New" value={result.summary.findingsNew} color="#d97706" />
        )}
        {result.detectedProvider !== 'unknown' && (
          <span
            style={{
              padding: '0.25rem 0.75rem',
              backgroundColor: '#eff6ff',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              color: '#2563eb',
            }}
          >
            Provider: {result.detectedProvider}
          </span>
        )}
      </div>

      {/* Proposed changes */}
      {result.proposedChanges.length > 0 && (
        <section>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
            }}
          >
            Proposed DNS Changes
          </h4>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {result.proposedChanges.map((change) => (
              <ChangeCard key={`${change.action}-${change.name}-${change.type}`} change={change} />
            ))}
          </div>
        </section>
      )}

      {/* Resolved findings */}
      {result.resolvedFindings.length > 0 && (
        <section>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
              color: '#16a34a',
            }}
          >
            ✅ Findings Resolved ({result.resolvedFindings.length})
          </h4>
          <FindingsList findings={result.resolvedFindings} />
        </section>
      )}

      {/* New findings (warnings) */}
      {result.newFindings.length > 0 && (
        <section>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
              color: '#d97706',
            }}
          >
            ⚠️ New Findings Introduced ({result.newFindings.length})
          </h4>
          <FindingsList findings={result.newFindings} />
        </section>
      )}

      {/* Remaining findings */}
      {result.remainingFindings.length > 0 && (
        <section>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
              color: '#6b7280',
            }}
          >
            Remaining ({result.remainingFindings.length})
          </h4>
          <FindingsList findings={result.remainingFindings} />
        </section>
      )}

      {/* Re-run button */}
      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['simulation', snapshotId] });
            refetch();
          }}
          style={{
            padding: '0.375rem 1rem',
            backgroundColor: 'transparent',
            color: '#2563eb',
            border: '1px solid #2563eb',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.75rem',
          }}
        >
          Re-run Simulation
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function SummaryPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <span
      style={{
        padding: '0.25rem 0.75rem',
        backgroundColor: '#f1f5f9',
        borderRadius: '9999px',
        fontSize: '0.75rem',
      }}
    >
      {label}: <strong style={{ color: color || 'inherit' }}>{value}</strong>
    </span>
  );
}

function ChangeCard({ change }: { change: ProposedChange }) {
  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        borderLeft: `4px solid ${RISK_COLORS[change.risk] || '#6b7280'}`,
        backgroundColor: 'white',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.375rem',
        }}
      >
        <span
          style={{
            padding: '0.125rem 0.375rem',
            borderRadius: '4px',
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'white',
            backgroundColor:
              change.action === 'add'
                ? '#16a34a'
                : change.action === 'remove'
                  ? '#dc2626'
                  : '#d97706',
          }}
        >
          {ACTION_LABELS[change.action]}
        </span>
        <code style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
          {change.name} {change.type}
        </code>
        <span
          style={{
            fontSize: '0.625rem',
            color: RISK_COLORS[change.risk],
            fontWeight: 600,
          }}
        >
          {change.risk} risk
        </span>
      </div>

      {/* Current → Proposed diff */}
      {change.currentValues.length > 0 && (
        <div
          style={{
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            color: '#dc2626',
            backgroundColor: '#fef2f2',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            marginBottom: '0.25rem',
          }}
        >
          − {change.currentValues.join(', ')}
        </div>
      )}
      {change.proposedValues.length > 0 && (
        <div
          style={{
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            color: '#16a34a',
            backgroundColor: '#f0fdf4',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            marginBottom: '0.25rem',
          }}
        >
          + {change.proposedValues.join(', ')}
        </div>
      )}

      <p
        style={{
          fontSize: '0.75rem',
          color: '#6b7280',
          margin: '0.25rem 0 0',
        }}
      >
        {change.rationale}
      </p>
    </div>
  );
}

function FindingsList({ findings }: { findings: SimFinding[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {findings.map((f) => (
        <div
          key={`${f.type}-${f.severity}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.375rem 0.75rem',
            backgroundColor: '#f8f8f8',
            borderRadius: '6px',
            fontSize: '0.8125rem',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: SEVERITY_COLORS[f.severity] || '#6b7280',
              flexShrink: 0,
            }}
          />
          <span style={{ color: '#374151' }}>{f.title}</span>
          <span
            style={{
              fontSize: '0.625rem',
              color: '#9ca3af',
              marginLeft: 'auto',
            }}
          >
            {f.severity}
          </span>
        </div>
      ))}
    </div>
  );
}
