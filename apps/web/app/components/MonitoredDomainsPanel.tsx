/**
 * Monitored Domains Panel - dns-ops-1j4.12.4
 *
 * UI for managing monitored domains with full CRUD operations.
 * Allows operators to add, configure, and remove domains from monitoring.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';

interface MonitoredDomain {
  id: string;
  domainId: string;
  domainName: string;
  schedule: 'hourly' | 'daily' | 'weekly';
  alertChannels: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
  maxAlertsPerDay: number;
  suppressionWindowMinutes: number;
  isActive: boolean;
  lastCheckAt: string | null;
  lastAlertAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const SCHEDULE_OPTIONS: { value: 'hourly' | 'daily' | 'weekly'; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

async function fetchDomains(): Promise<{ monitoredDomains: MonitoredDomain[] }> {
  const response = await fetch('/api/monitoring/domains', { credentials: 'include' });
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
  if (!response.ok) throw new Error('Failed to fetch monitored domains');
  return (await response.json()) as { monitoredDomains: MonitoredDomain[] };
}

export function MonitoredDomainsPanel() {
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDomain, setEditingDomain] = useState<MonitoredDomain | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['monitoring-domains'],
    queryFn: fetchDomains,
  });

  const domains = data?.monitoredDomains ?? [];
  const status = error ? (error as Error & { status?: number }).status : undefined;
  const authRequired = status === 401;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/monitoring/domains/${id}`, { method: 'DELETE' });
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
      if (!response.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-domains'] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to delete');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/monitoring/domains/${id}/toggle`, { method: 'POST' });
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
      if (!response.ok) throw new Error('Failed to toggle');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-domains'] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to toggle');
    },
  });

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to remove this domain from monitoring?')) return;
    deleteMutation.mutate(id);
  };

  const handleToggle = (id: string) => {
    toggleMutation.mutate(id);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Monitored Domains</h3>
          <p className="text-sm text-gray-500">Configure automatic monitoring and alerts</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          disabled={authRequired}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          + Add Domain
        </button>
      </div>

      <div className="p-4">
        {authRequired && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Operator sign-in is required to view or change monitored domains.
          </div>
        )}

        {localError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {localError}
            <button
              type="button"
              onClick={() => setLocalError(null)}
              className="ml-2 text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {(showAddDialog || editingDomain) && (
          <MonitoredDomainDialog
            editingDomain={editingDomain}
            authRequired={authRequired}
            onAuthRequired={() => {
              setLocalError('Operator sign-in is required to save monitoring configuration.');
            }}
            onClose={() => {
              setShowAddDialog(false);
              setEditingDomain(null);
            }}
            onSave={() => {
              queryClient.invalidateQueries({ queryKey: ['monitoring-domains'] });
              setShowAddDialog(false);
              setEditingDomain(null);
            }}
          />
        )}

        {isLoading ? (
          <div className="text-center text-gray-500 py-8">Loading monitored domains...</div>
        ) : authRequired ? (
          <div className="text-center py-8 text-gray-500">
            Sign in to view and manage tenant monitoring configuration.
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <svg
                className="w-12 h-12 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p className="text-gray-500">No domains are being monitored yet.</p>
            <button
              type="button"
              onClick={() => setShowAddDialog(true)}
              disabled={authRequired}
              className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium disabled:text-gray-400"
            >
              Add your first domain
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map((domain) => (
              <MonitoredDomainCard
                key={domain.id}
                domain={domain}
                onEdit={() => setEditingDomain(domain)}
                onDelete={() => handleDelete(domain.id)}
                onToggle={() => handleToggle(domain.id)}
                disabled={authRequired}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Monitored Domain Card
// =============================================================================

interface MonitoredDomainCardProps {
  domain: MonitoredDomain;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  disabled?: boolean;
}

function MonitoredDomainCard({
  domain,
  onEdit,
  onDelete,
  onToggle,
  disabled = false,
}: MonitoredDomainCardProps) {
  const formatTime = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getAlertChannelsSummary = (): string => {
    const channels: string[] = [];
    if (domain.alertChannels.email?.length) {
      channels.push(`${domain.alertChannels.email.length} email(s)`);
    }
    if (domain.alertChannels.webhook) {
      channels.push('webhook');
    }
    if (domain.alertChannels.slack) {
      channels.push('slack');
    }
    return channels.length > 0 ? channels.join(', ') : 'None configured';
  };

  return (
    <div
      className={`p-4 rounded-lg border ${
        domain.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-75'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to="/domain/$domain"
              params={{ domain: domain.domainName.toLowerCase() }}
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              {domain.domainName}
            </Link>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                domain.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {domain.isActive ? 'Active' : 'Paused'}
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium capitalize">
              {domain.schedule}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
            <div>
              <span className="text-gray-500">Last check:</span>{' '}
              <span className="text-gray-700">{formatTime(domain.lastCheckAt)}</span>
            </div>
            <div>
              <span className="text-gray-500">Last alert:</span>{' '}
              <span className="text-gray-700">{formatTime(domain.lastAlertAt)}</span>
            </div>
            <div>
              <span className="text-gray-500">Max alerts/day:</span>{' '}
              <span className="text-gray-700">{domain.maxAlertsPerDay}</span>
            </div>
            <div>
              <span className="text-gray-500">Channels:</span>{' '}
              <span className="text-gray-700">{getAlertChannelsSummary()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-4">
          <button
            type="button"
            onClick={onToggle}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:text-gray-300 disabled:hover:bg-transparent"
            title={domain.isActive ? 'Pause monitoring' : 'Resume monitoring'}
            disabled={disabled}
          >
            {domain.isActive ? (
              <svg
                aria-hidden="true"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:text-gray-300 disabled:hover:bg-transparent"
            title="Edit"
            disabled={disabled}
          >
            <svg
              aria-hidden="true"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded disabled:text-gray-300 disabled:hover:bg-transparent"
            title="Remove from monitoring"
            disabled={disabled}
          >
            <svg
              aria-hidden="true"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Monitored Domain Dialog
// =============================================================================

interface MonitoredDomainDialogProps {
  editingDomain: MonitoredDomain | null;
  authRequired: boolean;
  onAuthRequired: () => void;
  onClose: () => void;
  onSave: () => void;
}

function MonitoredDomainDialog({
  editingDomain,
  authRequired,
  onAuthRequired,
  onClose,
  onSave,
}: MonitoredDomainDialogProps) {
  const idPrefix = useId();
  const domainNameId = `${idPrefix}-domain-name`;
  const scheduleId = `${idPrefix}-schedule`;
  const emailsId = `${idPrefix}-emails`;
  const webhookId = `${idPrefix}-webhook`;
  const slackId = `${idPrefix}-slack`;
  const maxAlertsId = `${idPrefix}-max-alerts`;
  const suppressionId = `${idPrefix}-suppression`;
  const [domainName, setDomainName] = useState(editingDomain?.domainName || '');
  const [schedule, setSchedule] = useState<'hourly' | 'daily' | 'weekly'>(
    editingDomain?.schedule || 'daily'
  );
  const [emailsInput, setEmailsInput] = useState(
    editingDomain?.alertChannels.email?.join(', ') || ''
  );
  const [webhook, setWebhook] = useState(editingDomain?.alertChannels.webhook || '');
  const [slack, setSlack] = useState(editingDomain?.alertChannels.slack || '');
  const [maxAlertsPerDay, setMaxAlertsPerDay] = useState(
    editingDomain?.maxAlertsPerDay?.toString() || '5'
  );
  const [suppressionWindow, setSuppressionWindow] = useState(
    editingDomain?.suppressionWindowMinutes?.toString() || '60'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingDomain && !domainName.trim()) {
      setError('Domain name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const emails = emailsInput
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      const body = {
        ...(editingDomain ? {} : { domainName: domainName.trim() }),
        schedule,
        alertChannels: {
          ...(emails.length > 0 && { email: emails }),
          ...(webhook.trim() && { webhook: webhook.trim() }),
          ...(slack.trim() && { slack: slack.trim() }),
        },
        maxAlertsPerDay: parseInt(maxAlertsPerDay, 10) || 5,
        suppressionWindowMinutes: parseInt(suppressionWindow, 10) || 60,
      };

      const url = editingDomain
        ? `/api/monitoring/domains/${editingDomain.id}`
        : '/api/monitoring/domains';

      const response = await fetch(url, {
        method: editingDomain ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (response.status === 401) {
          onAuthRequired();
          throw new Error('Operator sign-in is required to save monitoring configuration.');
        }
        if (response.status === 403) {
          throw new Error('You do not have permission to save monitoring configuration.');
        }
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || 'Failed to save');
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <form onSubmit={handleSubmit}>
        <h4 className="font-medium text-gray-900 mb-3">
          {editingDomain ? `Edit ${editingDomain.domainName}` : 'Add Domain to Monitoring'}
        </h4>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {!editingDomain && (
            <div>
              <label
                htmlFor={domainNameId}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Domain Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id={domainNameId}
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                placeholder="example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={authRequired}
              />
            </div>
          )}

          <div>
            <label htmlFor={scheduleId} className="block text-sm font-medium text-gray-700 mb-1">
              Check Schedule
            </label>
            <select
              id={scheduleId}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as 'hourly' | 'daily' | 'weekly')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              disabled={authRequired}
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t pt-3">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Alert Channels</h5>

            <div className="space-y-2">
              <div>
                <label htmlFor={emailsId} className="block text-xs text-gray-500 mb-1">
                  Email addresses (comma-separated)
                </label>
                <input
                  type="text"
                  id={emailsId}
                  value={emailsInput}
                  onChange={(e) => setEmailsInput(e.target.value)}
                  placeholder="admin@example.com, ops@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100"
                  disabled={authRequired}
                />
              </div>

              <div>
                <label htmlFor={webhookId} className="block text-xs text-gray-500 mb-1">
                  Webhook URL
                </label>
                <input
                  type="url"
                  id={webhookId}
                  value={webhook}
                  onChange={(e) => setWebhook(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100"
                  disabled={authRequired}
                />
              </div>

              <div>
                <label htmlFor={slackId} className="block text-xs text-gray-500 mb-1">
                  Slack Channel
                </label>
                <input
                  type="text"
                  id={slackId}
                  value={slack}
                  onChange={(e) => setSlack(e.target.value)}
                  placeholder="#dns-alerts"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100"
                  disabled={authRequired}
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-3">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Noise Budget</h5>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={maxAlertsId} className="block text-xs text-gray-500 mb-1">
                  Max alerts per day
                </label>
                <input
                  type="number"
                  id={maxAlertsId}
                  value={maxAlertsPerDay}
                  onChange={(e) => setMaxAlertsPerDay(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100"
                  disabled={authRequired}
                />
              </div>
              <div>
                <label htmlFor={suppressionId} className="block text-xs text-gray-500 mb-1">
                  Suppression window (minutes)
                </label>
                <input
                  type="number"
                  id={suppressionId}
                  value={suppressionWindow}
                  onChange={(e) => setSuppressionWindow(e.target.value)}
                  min="1"
                  max="1440"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100"
                  disabled={authRequired}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            disabled={saving || authRequired}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || authRequired || (!editingDomain && !domainName.trim())}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : editingDomain ? 'Update' : 'Add Domain'}
          </button>
        </div>
      </form>
    </div>
  );
}
