/**
 * Template Overrides Panel - dns-ops-1j4.10.6
 *
 * UI for managing template overrides.
 * Allows operators to customize provider templates per tenant.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

interface TemplateOverride {
  id: string;
  providerKey: string;
  templateKey: string;
  overrideData: Record<string, unknown>;
  appliesToDomains: string[] | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google Workspace',
  microsoft: 'Microsoft 365',
  zoho: 'Zoho Mail',
  other: 'Other Provider',
  gmail: 'Gmail / Google Workspace',
  outlook: 'Outlook / Microsoft 365',
  yahoo: 'Yahoo Mail',
  protonmail: 'ProtonMail',
  fastmail: 'Fastmail',
  custom: 'Custom Provider',
};

async function fetchOverrides(provider: string): Promise<TemplateOverride[]> {
  const response = await fetch(
    `/api/portfolio/templates/overrides?provider=${encodeURIComponent(provider)}`,
    { credentials: 'include' }
  );
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
  if (!response.ok) throw new Error('Failed to fetch overrides');
  const data = (await response.json()) as { overrides: TemplateOverride[] };
  return data.overrides || [];
}

export function TemplateOverridesPanel() {
  const queryClient = useQueryClient();
  const providerSelectId = useId();
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [editingOverride, setEditingOverride] = useState<TemplateOverride | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    data: overrides = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['template-overrides', selectedProvider],
    queryFn: () => fetchOverrides(selectedProvider),
    enabled: !!selectedProvider,
  });

  const status = error ? (error as Error & { status?: number }).status : undefined;
  const authRequired = status === 401;
  const writeBlocked = status === 403;

  const deleteMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      const response = await fetch(`/api/portfolio/templates/overrides/${overrideId}`, {
        method: 'DELETE',
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
      if (!response.ok) throw new Error('Failed to delete override');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-overrides'] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to delete override');
    },
  });

  const readControlsDisabled = authRequired;
  const writeControlsDisabled = authRequired || writeBlocked;

  return (
    <div className="ds-panel portfolio-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-lg font-medium text-ink">Template Overrides</h3>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={writeControlsDisabled}
          className="text-sm font-medium text-brand hover:text-brand disabled:text-faint"
        >
          + New Override
        </button>
      </div>

      <div className="p-4">
        {authRequired && (
          <div className="mb-4 rounded-lg border border-warning bg-warning-surface p-4 text-sm text-warning">
            Operator sign-in is required to view or edit tenant template overrides.
          </div>
        )}

        {writeBlocked && (
          <div className="mb-4 rounded-lg border border-brand bg-info-surface p-4 text-sm text-brand">
            You can view tenant overrides here, but your current role cannot create, edit, or delete
            them.
          </div>
        )}

        <div className="mb-4">
          <label htmlFor={providerSelectId} className="mb-1 block text-sm font-medium text-text">
            Select Provider
          </label>
          <select
            id={providerSelectId}
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            disabled={readControlsDisabled}
            className="ds-input w-full rounded-lg border border-line px-3 py-2 focus:border-brand focus:ring-2 focus:ring-focus disabled:bg-surface-muted"
          >
            <option value="">Choose a provider...</option>
            {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {localError && (
          <div className="mb-4 rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">
            {localError}
            <button
              type="button"
              onClick={() => setLocalError(null)}
              className="ml-2 text-danger hover:text-danger"
            >
              Dismiss
            </button>
          </div>
        )}

        {(showCreateDialog || editingOverride) && (
          <OverrideDialog
            editingOverride={editingOverride}
            defaultProvider={selectedProvider}
            authRequired={authRequired}
            writeBlocked={writeBlocked}
            onWriteBlocked={() =>
              setLocalError('You do not have permission to save tenant overrides.')
            }
            onClose={() => {
              setShowCreateDialog(false);
              setEditingOverride(null);
            }}
            onSave={() => {
              queryClient.invalidateQueries({ queryKey: ['template-overrides'] });
              setShowCreateDialog(false);
              setEditingOverride(null);
            }}
          />
        )}

        {authRequired ? (
          <div className="py-8 text-center text-muted">
            Sign in to view and manage tenant template overrides.
          </div>
        ) : !selectedProvider ? (
          <div className="py-8 text-center text-muted">
            Select a provider to view and manage template overrides
          </div>
        ) : isLoading ? (
          <div className="py-8 text-center text-muted">Loading overrides...</div>
        ) : overrides.length === 0 ? (
          <div className="py-8 text-center text-muted">
            No overrides for {PROVIDER_LABELS[selectedProvider] || selectedProvider}.{' '}
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="text-brand hover:text-brand disabled:text-faint"
              disabled={writeControlsDisabled}
            >
              Create one
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {overrides.map((override) => (
              <OverrideCard
                key={override.id}
                override={override}
                disabled={writeControlsDisabled}
                onEdit={() => setEditingOverride(override)}
                onDelete={() => deleteMutation.mutate(override.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface OverrideCardProps {
  override: TemplateOverride;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function OverrideCard({ override, disabled, onEdit, onDelete }: OverrideCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-surface-muted p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-ink">{override.templateKey}</span>
            {override.appliesToDomains && override.appliesToDomains.length > 0 && (
              <span className="ds-badge ds-badge--info">
                {override.appliesToDomains.length} domain
                {override.appliesToDomains.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            Created by {override.createdBy} on {new Date(override.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="ml-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1.5 text-muted hover:bg-surface-muted hover:text-text"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            className="rounded p-1.5 text-muted hover:bg-surface-muted hover:text-text disabled:text-faint disabled:hover:bg-transparent"
            title="Edit"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
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
            disabled={disabled}
            className="rounded p-1.5 text-muted hover:bg-danger-surface hover:text-danger disabled:text-faint disabled:hover:bg-transparent"
            title="Delete"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
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

      {expanded && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1 text-xs font-medium text-muted">Override Data:</p>
          <pre className="overflow-x-auto rounded border border-line bg-surface p-2 text-xs text-text">
            {JSON.stringify(override.overrideData, null, 2)}
          </pre>
          {override.appliesToDomains && override.appliesToDomains.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs font-medium text-muted">Applies to:</p>
              <div className="flex flex-wrap gap-1">
                {override.appliesToDomains.map((domain) => (
                  <span
                    key={domain}
                    className="rounded border border-line bg-surface px-2 py-0.5 text-xs text-text"
                  >
                    {domain}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface OverrideDialogProps {
  editingOverride: TemplateOverride | null;
  defaultProvider: string;
  authRequired: boolean;
  writeBlocked: boolean;
  onWriteBlocked: () => void;
  onClose: () => void;
  onSave: () => void;
}

function OverrideDialog({
  editingOverride,
  defaultProvider,
  authRequired,
  writeBlocked,
  onWriteBlocked,
  onClose,
  onSave,
}: OverrideDialogProps) {
  const idPrefix = useId();
  const providerId = `${idPrefix}-override-provider`;
  const templateId = `${idPrefix}-override-template`;
  const dataId = `${idPrefix}-override-data`;
  const domainsId = `${idPrefix}-override-domains`;
  const [providerKey, setProviderKey] = useState(editingOverride?.providerKey || defaultProvider);
  const [templateKey, setTemplateKey] = useState(editingOverride?.templateKey || '');
  const [overrideDataJson, setOverrideDataJson] = useState(
    editingOverride ? JSON.stringify(editingOverride.overrideData, null, 2) : '{}'
  );
  const [appliesToDomains, setAppliesToDomains] = useState(
    editingOverride?.appliesToDomains?.join(', ') || ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controlsDisabled = authRequired || writeBlocked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!providerKey.trim() || !templateKey.trim()) {
      setError('Provider and template key are required');
      return;
    }

    let parsedOverrideData: Record<string, unknown>;
    try {
      parsedOverrideData = JSON.parse(overrideDataJson);
      if (typeof parsedOverrideData !== 'object' || parsedOverrideData === null) {
        throw new Error('Must be an object');
      }
    } catch {
      setError('Override data must be valid JSON object');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body = {
        providerKey: providerKey.trim(),
        templateKey: templateKey.trim(),
        overrideData: parsedOverrideData,
        appliesToDomains: appliesToDomains
          .split(',')
          .map((domain) => domain.trim())
          .filter(Boolean),
      };

      const url = editingOverride
        ? `/api/portfolio/templates/overrides/${editingOverride.id}`
        : '/api/portfolio/templates/overrides';

      const response = await fetch(url, {
        method: editingOverride ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 401) {
          throw new Error('Operator sign-in is required to save overrides.');
        }
        if (response.status === 403) {
          onWriteBlocked();
          throw new Error('You do not have permission to save tenant overrides.');
        }
        throw new Error(errorData.error || 'Failed to save override');
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface-muted p-4">
      <form onSubmit={handleSubmit}>
        <h4 className="mb-3 font-medium text-ink">
          {editingOverride ? 'Edit Override' : 'New Override'}
        </h4>

        {error && (
          <div className="mb-3 rounded border border-danger bg-danger-surface p-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={providerId} className="mb-1 block text-sm font-medium text-text">
                Provider Key <span className="text-danger">*</span>
              </label>
              <select
                id={providerId}
                value={providerKey}
                onChange={(e) => setProviderKey(e.target.value)}
                className="ds-input w-full rounded-lg border border-line px-3 py-2 focus:border-brand focus:ring-2 focus:ring-focus disabled:bg-surface-muted"
                disabled={!!editingOverride || controlsDisabled}
              >
                <option value="">Select...</option>
                {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={templateId} className="mb-1 block text-sm font-medium text-text">
                Template Key <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                id={templateId}
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
                placeholder="e.g., dkim_record"
                className="ds-input w-full rounded-lg border border-line px-3 py-2 focus:border-brand focus:ring-2 focus:ring-focus disabled:bg-surface-muted"
                disabled={!!editingOverride || controlsDisabled}
              />
            </div>
          </div>

          <div>
            <label htmlFor={dataId} className="mb-1 block text-sm font-medium text-text">
              Override Data (JSON) <span className="text-danger">*</span>
            </label>
            <textarea
              id={dataId}
              value={overrideDataJson}
              onChange={(e) => setOverrideDataJson(e.target.value)}
              rows={5}
              disabled={controlsDisabled}
              className="ds-input w-full rounded-lg border border-line px-3 py-2 font-mono text-sm focus:border-brand focus:ring-2 focus:ring-focus disabled:bg-surface-muted"
              placeholder='{"key": "value"}'
            />
          </div>

          <div>
            <label htmlFor={domainsId} className="mb-1 block text-sm font-medium text-text">
              Applies to Domains (comma-separated, leave empty for all)
            </label>
            <input
              type="text"
              id={domainsId}
              value={appliesToDomains}
              onChange={(e) => setAppliesToDomains(e.target.value)}
              placeholder="example.com, test.com"
              className="ds-input w-full rounded-lg border border-line px-3 py-2 focus:border-brand focus:ring-2 focus:ring-focus disabled:bg-surface-muted"
              disabled={controlsDisabled}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text hover:text-text"
            disabled={saving || authRequired}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || controlsDisabled || !providerKey.trim() || !templateKey.trim()}
            className="ds-button ds-button--primary ds-button--sm"
          >
            {saving ? 'Saving...' : editingOverride ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
