/**
 * Fleet Reports Panel - dns-ops-1j4.12.8
 *
 * UI for running fleet reports against domain inventories.
 * Allows operators to check SPF, DMARC, MX, and infrastructure across many domains.
 */

import { useCallback, useId, useState } from 'react';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  checks: string[];
}

interface CheckResult {
  check: string;
  status: 'pass' | 'fail' | 'warning' | 'missing' | 'unknown';
  severity: 'ok' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: Record<string, unknown>;
}

interface FleetReportResult {
  domain: string;
  snapshotId: string;
  collectedAt: string;
  rulesetVersion: string | null;
  findingsCount: number;
  checks: CheckResult[];
  issues: CheckResult[];
}

interface FleetReportResponse {
  reportGeneratedAt: string;
  domainsChecked: number;
  domainsWithErrors: number;
  backedByPersistedFindings: boolean;
  summary: {
    totalDomains: number;
    domainsWithIssues: number;
    unknownChecks: number;
    [key: string]: unknown;
  };
  results?: FleetReportResult[];
  highPriorityIssues?: CheckResult[];
  errors?: Array<{ domain: string; error: string }>;
}

// Report templates are intentionally client-side static config. The collector
// exposes GET /api/fleet-report/templates, but the web proxy does not surface
// it — templates are stable enough to live in the UI bundle without a network
// round-trip or loading state.
const DEFAULT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'mail-security-baseline',
    name: 'Mail Security Baseline',
    description: 'Check SPF, DMARC, DKIM across inventory',
    checks: ['spf', 'dmarc', 'dkim', 'mx'],
  },
  {
    id: 'infrastructure-audit',
    name: 'Infrastructure Audit',
    description: 'Identify stale IPs and infrastructure issues',
    checks: ['infrastructure', 'delegation'],
  },
  {
    id: 'full-check',
    name: 'Full Check',
    description: 'Complete check of all aspects',
    checks: ['spf', 'dmarc', 'dkim', 'mx', 'infrastructure', 'delegation'],
  },
];

export function FleetReportsPanel() {
  const inventoryFieldId = useId();
  const templates = DEFAULT_TEMPLATES;
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [inventoryInput, setInventoryInput] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [report, setReport] = useState<FleetReportResponse | null>(null);
  const [showResultDetails, setShowResultDetails] = useState(false);

  const parseInventory = (input: string): string[] => {
    return input
      .split(/[\n,]/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d?.includes('.'));
  };

  const handleCsvUpload = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const response = await fetch('/api/fleet-report/import-csv', {
        method: 'POST',
        body: text,
      });

      if (!response.ok) {
        if (response.status === 401) {
          setAuthRequired(true);
          throw new Error('Operator sign-in is required to import fleet report inventories.');
        }
        if (response.status === 403) {
          throw new Error('You do not have permission to import fleet report inventories.');
        }
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || 'Failed to parse CSV');
      }

      setAuthRequired(false);

      const data = (await response.json()) as { inventory: string[] };
      setInventoryInput(data.inventory.join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import CSV');
    }
  }, []);

  const handleRunReport = async () => {
    const inventory = parseInventory(inventoryInput);

    if (inventory.length === 0) {
      setError('Please enter at least one domain');
      return;
    }

    if (!selectedTemplate) {
      setError('Please select a report template');
      return;
    }

    setRunning(true);
    setError(null);
    setReport(null);

    try {
      const response = await fetch('/api/fleet-report/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory,
          checks: selectedTemplate.checks,
          format: 'detailed',
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setAuthRequired(true);
          throw new Error('Operator sign-in is required to run fleet reports.');
        }
        if (response.status === 403) {
          throw new Error('You do not have permission to run fleet reports.');
        }
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || 'Failed to run report');
      }

      setAuthRequired(false);

      const data = (await response.json()) as FleetReportResponse;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run report');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="ds-panel portfolio-panel">
      <div className="px-4 py-3 border-b border-line">
        <h3 className="text-lg font-medium text-ink">Fleet Reports</h3>
        <p className="text-sm text-muted">Run bulk checks across your domain inventory</p>
      </div>

      <div className="p-4 space-y-4">
        {authRequired && (
          <div className="rounded-lg border border-warning bg-warning-surface p-4 text-sm text-warning">
            Operator sign-in is required to import inventory or run tenant fleet reports.
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="p-3 bg-danger-surface border border-danger rounded-lg text-danger text-sm">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 text-danger hover:text-danger"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Template Selection */}
        <div>
          <p className="block text-sm font-medium text-text mb-2">Report Template</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplate(template)}
                className={`p-3 text-left rounded-lg border-2 transition-colors ${
                  selectedTemplate?.id === template.id
                    ? 'border-brand bg-info-surface'
                    : 'border-line hover:border-line'
                }`}
              >
                <div className="font-medium text-ink">{template.name}</div>
                <p className="text-xs text-muted mt-1">{template.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {template.checks.map((check) => (
                    <span
                      key={check}
                      className="px-1.5 py-0.5 bg-surface-muted rounded text-xs text-text uppercase"
                    >
                      {check}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Inventory Input */}
        <div>
          <label htmlFor={inventoryFieldId} className="block text-sm font-medium text-text mb-1">
            Domain Inventory
          </label>
          <textarea
            id={inventoryFieldId}
            value={inventoryInput}
            onChange={(e) => setInventoryInput(e.target.value)}
            rows={6}
            placeholder="Enter domain names, one per line or comma-separated:
example.com
example.org, example.net"
            className="ds-input w-full px-3 py-2 border border-line rounded-lg focus:ring-2 focus:ring-focus focus:border-brand font-mono text-sm"
          />
          <div className="mt-2 flex items-center gap-4">
            <span className="text-xs text-muted">
              {parseInventory(inventoryInput).length} domains
            </span>
            <label className="text-xs text-brand hover:text-brand cursor-pointer">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                disabled={authRequired}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCsvUpload(file);
                }}
              />
              Import from CSV
            </label>
          </div>
        </div>

        {/* Run Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleRunReport}
            disabled={
              authRequired ||
              running ||
              !selectedTemplate ||
              parseInventory(inventoryInput).length === 0
            }
            className="ds-button ds-button--primary ds-button--md"
          >
            {running ? 'Running Report...' : 'Run Report'}
          </button>
        </div>

        {/* Report Results */}
        {report && (
          <div className="border-t pt-4 mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-ink">Report Results</h4>
              <span className="text-sm text-muted">
                Generated {new Date(report.reportGeneratedAt).toLocaleString()}
              </span>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <SummaryCard label="Domains Checked" value={report.domainsChecked} color="blue" />
              <SummaryCard
                label="With Issues"
                value={report.summary.domainsWithIssues}
                color={report.summary.domainsWithIssues > 0 ? 'yellow' : 'green'}
              />
              <SummaryCard
                label="Unknown"
                value={report.summary.unknownChecks}
                color={report.summary.unknownChecks > 0 ? 'orange' : 'green'}
              />
              <SummaryCard
                label="High Priority"
                value={report.highPriorityIssues?.length || 0}
                color={report.highPriorityIssues?.length ? 'red' : 'green'}
              />
              <SummaryCard
                label="Errors"
                value={report.domainsWithErrors}
                color={report.domainsWithErrors > 0 ? 'orange' : 'green'}
              />
            </div>

            {/* High Priority Issues */}
            {report.highPriorityIssues && report.highPriorityIssues.length > 0 && (
              <div className="bg-danger-surface border border-danger rounded-lg p-4">
                <h5 className="font-medium text-danger mb-2">High Priority Issues</h5>
                <div className="space-y-2">
                  {report.highPriorityIssues.slice(0, 10).map((issue) => (
                    <div key={`${issue.severity}-${issue.message}`} className="text-sm">
                      <span
                        className={`inline-block w-16 px-1.5 py-0.5 rounded text-xs text-center font-medium ${
                          issue.severity === 'critical'
                            ? 'bg-danger text-brand-ink'
                            : 'bg-warning text-brand-ink'
                        }`}
                      >
                        {issue.severity}
                      </span>
                      <span className="ml-2 text-text">{issue.message}</span>
                    </div>
                  ))}
                  {report.highPriorityIssues.length > 10 && (
                    <p className="text-xs text-danger">
                      ...and {report.highPriorityIssues.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Detailed Results Toggle */}
            {report.results && report.results.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowResultDetails(!showResultDetails)}
                  className="text-sm text-brand hover:text-brand font-medium"
                >
                  {showResultDetails ? 'Hide Details' : 'Show Domain Details'}
                </button>

                {showResultDetails && (
                  <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                    {report.results.map((result) => (
                      <DomainResultCard key={result.domain} result={result} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Errors */}
            {report.errors && report.errors.length > 0 && (
              <div className="bg-warning-surface border border-warning rounded-lg p-4">
                <h5 className="font-medium text-warning mb-2">Errors</h5>
                <div className="space-y-1 text-sm text-warning">
                  {report.errors.slice(0, 10).map((err) => (
                    <div key={`${err.domain}-${err.error}`}>
                      <span className="font-mono">{err.domain}</span>: {err.error}
                    </div>
                  ))}
                  {report.errors.length > 10 && (
                    <p className="text-xs">...and {report.errors.length - 10} more</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Export for testing — UNKNOWN must never render with clean/success styling.
export function statusBadge(status: CheckResult['status']): { style: string; icon: string } {
  const badges = {
    pass: { style: 'ds-badge--success', icon: '✓' },
    fail: { style: 'ds-badge--danger', icon: '✗' },
    warning: { style: 'ds-badge--warning', icon: '!' },
    missing: { style: 'ds-badge--unknown', icon: '?' },
    unknown: { style: 'ds-badge--unknown', icon: '?' },
  };
  return badges[status];
}

// =============================================================================
// Helper Components
// =============================================================================

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-info-surface text-brand',
    green: 'bg-success-surface text-success',
    yellow: 'bg-warning-surface text-warning',
    red: 'bg-danger-surface text-danger',
    orange: 'bg-warning-surface text-warning',
  };

  return (
    <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-sm">{label}</div>
    </div>
  );
}

function DomainResultCard({ result }: { result: FleetReportResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasIssues = result.issues.length > 0;
  const hasUnknownChecks = result.checks.some((check) => check.status === 'unknown');

  return (
    <div
      className={`p-3 rounded-lg border ${
        hasIssues || hasUnknownChecks
          ? 'border-warning bg-warning-surface'
          : 'border-line bg-surface-muted'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-ink">{result.domain}</span>
          <span className="ml-2 text-xs text-muted">{result.findingsCount} findings</span>
          {hasUnknownChecks && (
            <span className="ds-badge ds-badge--unknown ml-2">Unknown checks</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-muted hover:text-text"
        >
          {expanded ? 'Hide' : 'Show'} checks
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1">
          {result.checks.map((check) => (
            <div
              key={`${check.check}-${check.status}-${check.message}`}
              className="flex items-center gap-2 text-sm"
            >
              <StatusBadge status={check.status} />
              <span className="uppercase text-xs font-medium text-text w-20">{check.check}</span>
              <span className="text-text">{check.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CheckResult['status'] }) {
  const badge = statusBadge(status);
  return (
    <span className={`ds-badge ${badge.style}`} title={status}>
      {badge.icon}
    </span>
  );
}
