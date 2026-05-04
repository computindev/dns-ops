/**
 * Mail Findings Panel Component
 *
 * Displays mail-specific findings (SPF, DMARC, DKIM, etc.) from the rules engine.
 * Includes security score and mail configuration summary.
 */

import type { Finding, Suggestion } from '@dns-ops/db/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from './ui/ConfirmDialog.js';
import { EmptyState, ErrorState, LoadingState } from './ui/StateDisplay.js';

interface MailFindingsPanelProps {
  snapshotId: string | null;
}

interface MailConfig {
  hasMx: boolean;
  hasSpf: boolean;
  hasDmarc: boolean;
  hasDkim: boolean;
  hasMtaSts: boolean;
  hasTlsRpt: boolean;
  securityScore: number;
  issues: string[];
  recommendations: string[];
}

interface MailFindingsData {
  snapshotId: string;
  domain: string;
  rulesetVersion: string;
  persisted: boolean;
  mailConfig: MailConfig;
  findings: Finding[];
  suggestions: Suggestion[];
}

async function fetchMailFindings(snapshotId: string): Promise<MailFindingsData> {
  const res = await fetch(`/api/snapshot/${snapshotId}/findings/mail`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch mail findings');
  return (await res.json()) as MailFindingsData;
}

export function MailFindingsPanel({ snapshotId }: MailFindingsPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['mail-findings', snapshotId],
    queryFn: () => fetchMailFindings(snapshotId!),
    enabled: !!snapshotId,
  });

  if (!snapshotId) {
    return (
      <EmptyState
        icon="inbox"
        title="No snapshot available"
        description="Collect data to analyze mail configuration."
        size="sm"
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Analyzing mail configuration..." size="sm" />;
  }

  if (error) {
    return <ErrorState message={error.message} size="sm" />;
  }

  if (!data) return null;

  const { mailConfig, findings, suggestions } = data;
  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];
  const findingsBySeverity = groupBySeverity(findings);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900">Mail Security Score</h4>
            <p className="text-sm text-gray-600 mt-1">
              Based on SPF, DMARC, DKIM, MTA-STS, and TLS-RPT configuration
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ScoreCircle score={mailConfig.securityScore} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <ConfigStatusCard name="MX" present={mailConfig.hasMx} />
        <ConfigStatusCard name="SPF" present={mailConfig.hasSpf} />
        <ConfigStatusCard name="DMARC" present={mailConfig.hasDmarc} />
        <ConfigStatusCard name="DKIM" present={mailConfig.hasDkim} />
        <ConfigStatusCard name="MTA-STS" present={mailConfig.hasMtaSts} optional />
        <ConfigStatusCard name="TLS-RPT" present={mailConfig.hasTlsRpt} optional />
      </div>

      {(mailConfig.issues.length > 0 || mailConfig.recommendations.length > 0) && (
        <div className="space-y-3">
          {mailConfig.issues.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <h5 className="text-sm font-medium text-red-800 mb-2">Issues</h5>
              <ul className="space-y-1">
                {mailConfig.issues.map((issue) => (
                  <li key={issue} className="text-sm text-red-700 flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">×</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mailConfig.recommendations.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h5 className="text-sm font-medium text-amber-800 mb-2">Recommendations</h5>
              <ul className="space-y-1">
                {mailConfig.recommendations.map((rec) => (
                  <li key={rec} className="text-sm text-amber-700 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">→</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-gray-900">Mail Findings</h4>
          {findings.length > 0 && (
            <span className="text-sm text-gray-500">
              {findings.length} finding{findings.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {findings.length === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 text-sm">✓ No mail configuration issues detected.</p>
          </div>
        )}

        {(['critical', 'high', 'medium', 'low', 'info'] as const).map((severity) => {
          const severityFindings = findingsBySeverity[severity];
          if (!severityFindings || severityFindings.length === 0) return null;

          return (
            <div key={severity} className="space-y-2 mb-4">
              <h5 className="text-sm font-medium text-gray-700 capitalize">
                {severity} ({severityFindings.length})
              </h5>
              {severityFindings.map((finding) => (
                <MailFindingCard
                  key={finding.id}
                  finding={finding}
                  domain={data.domain}
                  suggestions={safeSuggestions.filter((s) => s.findingId === finding.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-gray-400 pt-2 border-t">
        Ruleset v{data.rulesetVersion} · {data.persisted ? 'Persisted' : 'Live'} evaluation
      </div>
    </div>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 80) return 'text-green-600 border-green-500';
    if (score >= 60) return 'text-yellow-600 border-yellow-500';
    if (score >= 40) return 'text-orange-600 border-orange-500';
    return 'text-red-600 border-red-500';
  };

  return (
    <div
      className={`w-16 h-16 rounded-full border-4 flex items-center justify-center ${getColor()}`}
    >
      <span className="text-xl font-bold">{score}</span>
    </div>
  );
}

function ConfigStatusCard({
  name,
  present,
  optional = false,
}: {
  name: string;
  present: boolean;
  optional?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-lg border ${
        present
          ? 'bg-green-50 border-green-200'
          : optional
            ? 'bg-gray-50 border-gray-200'
            : 'bg-red-50 border-red-200'
      }`}
    >
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
          present
            ? 'bg-green-500 text-white'
            : optional
              ? 'bg-gray-300 text-gray-600'
              : 'bg-red-500 text-white'
        }`}
      >
        {present ? '✓' : optional ? '−' : '×'}
      </span>
      <span className={`text-sm font-medium ${present ? 'text-green-800' : 'text-gray-700'}`}>
        {name}
      </span>
    </div>
  );
}

function MailFindingCard({
  finding,
  domain,
  suggestions,
}: {
  finding: Finding;
  domain: string;
  suggestions: Suggestion[];
}) {
  const [expanded, setExpanded] = useState(false);

  const severityColors: Record<string, string> = {
    critical: 'bg-red-600',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
    info: 'bg-gray-400',
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        finding.reviewOnly ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="focus-ring w-full px-4 py-3 text-left hover:bg-black/5 transition-colors duration-150"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
              severityColors[finding.severity] || 'bg-gray-400'
            }`}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h5 className="font-medium text-gray-900">{finding.title}</h5>
              {finding.reviewOnly && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                  Review Required
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{finding.description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <span className="capitalize">{finding.confidence} confidence</span>
              {safeSuggestions.length > 0 && <span>{safeSuggestions.length} suggestion(s)</span>}
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform duration-150 ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-200/50 bg-white">
          {finding.evidence && finding.evidence.length > 0 && (
            <div className="mt-3">
              <h6 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Evidence
              </h6>
              <ul className="space-y-1">
                {finding.evidence.map((ev) => (
                  <li key={ev.description} className="text-sm text-gray-600">
                    • {ev.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {safeSuggestions.length > 0 && (
            <div className="mt-4 space-y-3">
              <h6 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Suggestions
              </h6>
              {safeSuggestions.map((suggestion) => (
                <MailSuggestionCard key={suggestion.id} suggestion={suggestion} domain={domain} />
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
            Rule: {finding.ruleId} · Version: {finding.ruleVersion}
          </div>
        </div>
      )}
    </div>
  );
}

function groupBySeverity(findings: Finding[]): Record<string, Finding[]> {
  return findings.reduce(
    (acc, finding) => {
      const sev = finding.severity;
      if (!acc[sev]) acc[sev] = [];
      acc[sev].push(finding);
      return acc;
    },
    {} as Record<string, Finding[]>
  );
}

// =============================================================================
// Mail Suggestion Card Component (PR-02.6.2)
// =============================================================================

interface MailSuggestionCardProps {
  suggestion: Suggestion;
  domain: string;
}

function MailSuggestionCard({ suggestion, domain }: MailSuggestionCardProps) {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);

  const isPending = !suggestion.appliedAt && !suggestion.dismissedAt;

  const applyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/suggestions/${suggestion.id}/apply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmApply: suggestion.reviewOnly ? true : undefined }),
      });
      if (!response.ok) {
        const error = (await response.json()) as { error?: string; code?: string };
        throw new Error(error.error || 'Failed to apply suggestion');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-findings'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/suggestions/${suggestion.id}/dismiss`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Dismissed by user' }),
      });
      if (!response.ok) throw new Error('Failed to dismiss suggestion');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-findings'] });
    },
  });

  const handleApply = () => {
    if (suggestion.reviewOnly && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    applyMutation.mutate();
  };

  const handleDismiss = () => {
    dismissMutation.mutate();
  };

  return (
    <>
      <div
        className={`p-3 rounded-lg ${
          suggestion.reviewOnly
            ? 'bg-amber-100/50 border border-amber-200'
            : 'bg-blue-50 border border-blue-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h6 className="font-medium text-gray-900">{suggestion.title}</h6>
              {suggestion.reviewOnly && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-800">
                  ⚠️ Review Required
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
            <div className="mt-2 p-2 bg-white/50 rounded text-sm font-mono text-gray-700 whitespace-pre-wrap">
              {suggestion.action}
            </div>
          </div>
        </div>

        {isPending && (
          <div className="mt-3 flex items-center gap-2 pt-2 border-t border-gray-200/50">
            <button
              type="button"
              onClick={handleApply}
              disabled={applyMutation.isPending || dismissMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {applyMutation.isPending ? 'Applying...' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={applyMutation.isPending || dismissMutation.isPending}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {dismissMutation.isPending ? 'Dismissing...' : 'Dismiss'}
            </button>
          </div>
        )}

        {suggestion.appliedAt && (
          <div className="mt-2 pt-2 border-t border-gray-200/50 text-xs text-green-600">
            ✓ Applied {suggestion.appliedBy ? `by ${suggestion.appliedBy}` : ''}
          </div>
        )}

        {suggestion.dismissedAt && (
          <div className="mt-2 pt-2 border-t border-gray-200/50 text-xs text-gray-500">
            Dismissed {suggestion.dismissedBy ? `by ${suggestion.dismissedBy}` : ''}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Apply Review-Only Suggestion?"
        message={
          <div className="space-y-3">
            <p>
              This suggestion is marked as <strong>review-required</strong> because it may have
              significant impact:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600">
              <li>Risk posture: {suggestion.riskPosture}</li>
              <li>Blast radius: {suggestion.blastRadius.replace(/-/g, ' ')}</li>
            </ul>
            <p className="text-amber-700 font-medium">
              This change may affect mail delivery for {domain}. Proceed with caution.
            </p>
          </div>
        }
        confirmLabel="Apply Anyway"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleApply}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
// Build: 1777908076
