/**
 * Simulation Panel Component
 *
 * Shows non-executable playbook guidance for generic findings. Concrete local
 * simulation remains unavailable until provider-confirmed values are complete.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CopyProviderRecords } from './CopyProviderRecords.js';
import { EmptyState, ErrorState, LoadingState } from './ui/StateDisplay.js';

interface GuidanceOnlySuggestion {
  kind: 'GUIDANCE_ONLY';
  title: string;
  explanation: string;
  playbookId: string;
  requiresProviderConfirmation: boolean;
  executableMutation: null;
}

interface SimFinding {
  type: string;
  title: string;
  severity: string;
  ruleId: string;
}

interface SimulationResult {
  mode: 'GUIDANCE_ONLY';
  domain: string;
  detectedProvider: 'unknown';
  proposedChanges: [];
  guidanceOnlySuggestions: GuidanceOnlySuggestion[];
  currentFindings: SimFinding[];
  summary: {
    changesProposed: 0;
    guidanceProvided: number;
    currentFindings: number;
  };
}

interface SimulationPanelProps {
  snapshotId: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#2563eb',
  info: '#6b7280',
};

async function runSimulationFetch(snapshotId: string): Promise<SimulationResult> {
  const response = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMessage = `Guidance request failed (${response.status})`;
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
    queryFn: () => {
      if (!snapshotId) throw new Error('Snapshot ID is required');
      return runSimulationFetch(snapshotId);
    },
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
        description="Collect data first, then review remediation guidance."
        size="sm"
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Generating guidance..." />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={handleRun} />;
  }

  // Not yet run
  if (!result) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Generate non-executable playbook guidance for current findings.
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
          Generate Guidance
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
        <SummaryPill label="Guidance" value={result.summary.guidanceProvided} />
        <SummaryPill label="Current findings" value={result.summary.currentFindings} />
      </div>

      {result.guidanceOnlySuggestions.length > 0 && (
        <section>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Guidance only
          </h4>
          <p style={{ color: '#92400e', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
            No executable mutation is available. Confirm provider, domain purpose, and exact values
            before planning a local simulation.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {result.guidanceOnlySuggestions.map((guidance) => (
              <div
                key={guidance.playbookId}
                style={{ padding: '0.75rem', border: '1px solid #fcd34d', borderRadius: '6px' }}
              >
                <strong>{guidance.title}</strong>
                <p style={{ marginTop: '0.25rem', color: '#4b5563', fontSize: '0.875rem' }}>
                  {guidance.explanation}
                </p>
                <p style={{ marginTop: '0.25rem', color: '#92400e', fontSize: '0.75rem' }}>
                  Playbook: {guidance.playbookId}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <CopyProviderRecords domain={result.domain} />

      {result.currentFindings.length > 0 && (
        <section>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Current findings ({result.currentFindings.length})
          </h4>
          <FindingsList findings={result.currentFindings} />
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
          Refresh Guidance
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
