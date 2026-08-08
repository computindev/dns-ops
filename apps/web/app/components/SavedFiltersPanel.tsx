/**
 * Saved Filters Panel - dns-ops-1j4.10.5
 *
 * UI for managing saved portfolio filters.
 * Allows saving, loading, updating, deleting, and sharing filters.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import {
  assessSavedCriteriaCompatibility,
  type CurrentFilters,
  currentFiltersToSavedCriteria,
  type FilterCriteria,
  hasActiveFilters,
  normalizeCurrentFilters,
  savedCriteriaToCurrentFilters,
} from '../lib/portfolio-filters.js';

interface SavedFilter {
  id: string;
  name: string;
  description: string | null;
  criteria: FilterCriteria;
  isShared: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
}

interface SavedFiltersPanelProps {
  currentFilters: CurrentFilters;
  onLoadFilter: (filters: CurrentFilters) => void;
  onSaveComplete?: () => void;
}

export type { CurrentFilters } from '../lib/portfolio-filters.js';

async function fetchFilters(): Promise<{ filters: SavedFilter[] }> {
  const response = await fetch('/api/portfolio/filters', { credentials: 'include' });
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
  if (!response.ok) throw new Error('Failed to fetch filters');
  return (await response.json()) as { filters: SavedFilter[] };
}

export function SavedFiltersPanel({
  currentFilters,
  onLoadFilter,
  onSaveComplete,
}: SavedFiltersPanelProps) {
  const queryClient = useQueryClient();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['saved-filters'],
    queryFn: fetchFilters,
  });

  const savedFilters = data?.filters ?? [];
  const status = error ? (error as Error & { status?: number }).status : undefined;
  const authRequired = status === 401;

  const deleteMutation = useMutation({
    mutationFn: async (filterId: string) => {
      const response = await fetch(`/api/portfolio/filters/${filterId}`, {
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
      if (!response.ok) throw new Error('Failed to delete filter');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to delete filter');
    },
  });

  const toggleShareMutation = useMutation({
    mutationFn: async ({ filterId, isShared }: { filterId: string; isShared: boolean }) => {
      const response = await fetch(`/api/portfolio/filters/${filterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isShared }),
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
      if (!response.ok) throw new Error('Failed to update filter');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to update filter');
    },
  });

  const controlsDisabled = authRequired;
  const activeFilters = hasActiveFilters(currentFilters);
  const normalizedCurrentFilters = normalizeCurrentFilters(currentFilters);

  const handleLoadFilter = (filter: SavedFilter) => {
    const compatibility = assessSavedCriteriaCompatibility(filter.criteria);
    if (!compatibility.supported) {
      setLocalError(
        `This saved filter uses unsupported criteria for the current UI: ${compatibility.reasons.join(', ')}.`
      );
      return;
    }
    onLoadFilter(savedCriteriaToCurrentFilters(filter.criteria));
  };

  return (
    <div className="ds-panel portfolio-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-lg font-medium text-ink">Saved Filters</h3>
        {activeFilters && (
          <button
            type="button"
            onClick={() => setShowSaveDialog(true)}
            disabled={controlsDisabled}
            className="text-sm font-medium text-brand hover:text-brand disabled:text-faint"
          >
            + Save Current
          </button>
        )}
      </div>

      <div className="p-4">
        {authRequired && (
          <div className="mb-4 rounded-lg border border-warning bg-warning-surface p-4 text-sm text-warning">
            Operator sign-in is required to view or manage saved filters.
          </div>
        )}

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

        {(showSaveDialog || editingFilter) && (
          <SaveFilterDialog
            currentFilters={currentFilters}
            editingFilter={editingFilter}
            authRequired={authRequired}
            onAuthRequired={() => {
              setLocalError('Operator sign-in is required to save filters.');
              setShowSaveDialog(false);
              setEditingFilter(null);
            }}
            onClose={() => {
              setShowSaveDialog(false);
              setEditingFilter(null);
            }}
            onSave={() => {
              queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
              setShowSaveDialog(false);
              setEditingFilter(null);
              onSaveComplete?.();
            }}
          />
        )}

        {isLoading ? (
          <div className="py-4 text-center text-muted">Loading saved filters...</div>
        ) : authRequired ? (
          <div className="py-4 text-center text-muted">Sign in to view tenant saved filters.</div>
        ) : savedFilters.length === 0 ? (
          <div className="py-4 text-center text-muted">
            No saved filters yet.
            {activeFilters && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  className="text-brand hover:text-brand disabled:text-faint"
                  disabled={controlsDisabled}
                >
                  Save current filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {savedFilters.map((filter) => (
              <SavedFilterCard
                key={filter.id}
                filter={filter}
                isActive={isFilterActive(normalizedCurrentFilters, filter)}
                onLoad={() => handleLoadFilter(filter)}
                onEdit={() => setEditingFilter(filter)}
                onDelete={() => deleteMutation.mutate(filter.id)}
                onToggleShare={() =>
                  toggleShareMutation.mutate({ filterId: filter.id, isShared: !filter.isShared })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SavedFilterCardProps {
  filter: SavedFilter;
  isActive: boolean;
  onLoad: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleShare: () => void;
}

function SavedFilterCard({
  filter,
  isActive,
  onLoad,
  onEdit,
  onDelete,
  onToggleShare,
}: SavedFilterCardProps) {
  const criteriaCount = getCriteriaCount(filter.criteria);
  const compatibility = assessSavedCriteriaCompatibility(filter.criteria);

  return (
    <div
      className={`rounded-lg border p-3 ${
        isActive ? 'border-brand bg-info-surface' : 'border-line bg-surface-muted'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{filter.name}</span>
            {filter.isShared && <span className="ds-badge ds-badge--success">Shared</span>}
            {isActive && <span className="ds-badge ds-badge--info">Active</span>}
            {!compatibility.supported && (
              <span className="ds-badge ds-badge--unknown">Partial</span>
            )}
          </div>
          {filter.description && (
            <p className="mt-1 truncate text-sm text-text">{filter.description}</p>
          )}
          <div className="mt-1 text-xs text-muted">
            {criteriaCount} filter{criteriaCount !== 1 ? 's' : ''} · owner {filter.createdBy}
          </div>
          {!compatibility.supported && (
            <p className="mt-1 text-xs text-warning">
              Unsupported criteria: {compatibility.reasons.join(', ')}
            </p>
          )}
        </div>

        <div className="ml-2 flex items-center gap-1">
          <button
            type="button"
            onClick={onLoad}
            disabled={!compatibility.supported}
            className="rounded p-1.5 text-muted hover:bg-info-surface hover:text-brand disabled:text-faint disabled:hover:bg-transparent"
            title={compatibility.supported ? 'Load filter' : 'Filter uses unsupported criteria'}
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
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={!filter.canManage}
            className="rounded p-1.5 text-muted hover:bg-surface-muted hover:text-text disabled:text-faint disabled:hover:bg-transparent"
            title={filter.canManage ? 'Edit filter' : 'Only the creator can edit this filter'}
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
            onClick={onToggleShare}
            disabled={!filter.canManage}
            className={`rounded p-1.5 disabled:text-faint disabled:hover:bg-transparent ${
              filter.isShared
                ? 'text-success hover:bg-success-surface hover:text-success'
                : 'text-muted hover:bg-surface-muted hover:text-text'
            }`}
            title={
              filter.canManage
                ? filter.isShared
                  ? 'Unshare filter'
                  : 'Share filter'
                : 'Only the creator can share this filter'
            }
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
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!filter.canManage}
            className="rounded p-1.5 text-muted hover:bg-danger-surface hover:text-danger disabled:text-faint disabled:hover:bg-transparent"
            title={filter.canManage ? 'Delete filter' : 'Only the creator can delete this filter'}
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
    </div>
  );
}

interface SaveFilterDialogProps {
  currentFilters: CurrentFilters;
  editingFilter: SavedFilter | null;
  authRequired: boolean;
  onAuthRequired: () => void;
  onClose: () => void;
  onSave: () => void;
}

function SaveFilterDialog({
  currentFilters,
  editingFilter,
  authRequired,
  onAuthRequired,
  onClose,
  onSave,
}: SaveFilterDialogProps) {
  const idPrefix = useId();
  const nameId = `${idPrefix}-filter-name`;
  const descriptionId = `${idPrefix}-filter-description`;
  const sharedId = `${idPrefix}-filter-shared`;
  const [name, setName] = useState(editingFilter?.name || '');
  const [description, setDescription] = useState(editingFilter?.description || '');
  const [isShared, setIsShared] = useState(editingFilter?.isShared || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body = editingFilter
        ? {
            name: name.trim(),
            description: description.trim() || null,
            isShared,
          }
        : {
            name: name.trim(),
            description: description.trim() || null,
            criteria: currentFiltersToSavedCriteria(currentFilters),
            isShared,
          };

      const url = editingFilter
        ? `/api/portfolio/filters/${editingFilter.id}`
        : '/api/portfolio/filters';

      const response = await fetch(url, {
        method: editingFilter ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 401) {
          onAuthRequired();
          throw new Error('Operator sign-in is required to save filters.');
        }
        if (response.status === 403) {
          throw new Error('You do not have permission to manage this filter.');
        }
        throw new Error(errorData.error || 'Failed to save filter');
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save filter');
    } finally {
      setSaving(false);
    }
  };

  const criteriaPreview = editingFilter?.criteria || currentFiltersToSavedCriteria(currentFilters);

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface-muted p-4">
      <form onSubmit={handleSubmit}>
        <h4 className="mb-3 font-medium text-ink">
          {editingFilter ? 'Edit Filter Metadata' : 'Save Filter'}
        </h4>

        {editingFilter && (
          <p className="mb-3 text-sm text-text">
            Editing updates name, description, and sharing only. Stored filter criteria stay
            unchanged.
          </p>
        )}

        {error && (
          <div className="mb-3 rounded border border-danger bg-danger-surface p-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor={nameId} className="mb-1 block text-sm font-medium text-text">
              Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Critical Issues"
              disabled={authRequired}
              className="ds-input w-full rounded-lg border border-line px-3 py-2 focus:border-brand focus:ring-2 focus:ring-focus disabled:bg-surface-muted"
            />
          </div>

          <div>
            <label htmlFor={descriptionId} className="mb-1 block text-sm font-medium text-text">
              Description
            </label>
            <input
              type="text"
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              disabled={authRequired}
              className="ds-input w-full rounded-lg border border-line px-3 py-2 focus:border-brand focus:ring-2 focus:ring-focus disabled:bg-surface-muted"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={sharedId}
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              disabled={authRequired}
              className="h-4 w-4 rounded border-line text-brand focus:ring-focus"
            />
            <label htmlFor={sharedId} className="text-sm text-text">
              Share with team
            </label>
          </div>

          <div className="rounded border border-line bg-surface p-2">
            <p className="mb-1 text-xs font-medium text-muted">Filter criteria:</p>
            <CriteriaPreview criteria={criteriaPreview} />
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
            disabled={saving || authRequired || !name.trim()}
            className="ds-button ds-button--primary ds-button--sm"
          >
            {saving ? 'Saving...' : editingFilter ? 'Update' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CriteriaPreview({ criteria }: { criteria: FilterCriteria }) {
  const chips: string[] = [];

  if (criteria.domainPatterns?.length) {
    chips.push(...criteria.domainPatterns.map((pattern) => `Query: ${pattern}`));
  }
  if (criteria.tags?.length) {
    chips.push(...criteria.tags);
  }
  if (criteria.findings?.severities?.length) {
    chips.push(...criteria.findings.severities);
  }
  if (criteria.zoneManagement?.length) {
    chips.push(...criteria.zoneManagement);
  }
  if (criteria.findings?.types?.length) {
    chips.push(...criteria.findings.types.map((type) => `Type: ${type}`));
  }
  if (criteria.findings?.minConfidence) {
    chips.push(`Confidence: ${criteria.findings.minConfidence}`);
  }
  if (criteria.lastSnapshotWithin) {
    chips.push(`Snapshot <= ${criteria.lastSnapshotWithin}d`);
  }

  if (chips.length === 0) {
    return <span className="text-xs text-faint">No filters selected</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span key={chip} className="rounded bg-surface-muted px-2 py-0.5 text-xs text-text">
          {chip}
        </span>
      ))}
    </div>
  );
}

function isFilterActive(currentFilters: CurrentFilters, filter: SavedFilter): boolean {
  const compatibility = assessSavedCriteriaCompatibility(filter.criteria);
  if (!compatibility.supported) {
    return false;
  }

  const normalizedCurrent = JSON.stringify(normalizeCurrentFilters(currentFilters));
  const normalizedSaved = JSON.stringify(savedCriteriaToCurrentFilters(filter.criteria));
  return Object.is(normalizedCurrent, normalizedSaved);
}

function getCriteriaCount(criteria: FilterCriteria): number {
  let count = 0;
  if (criteria.domainPatterns?.length) count += criteria.domainPatterns.length;
  if (criteria.zoneManagement?.length) count += criteria.zoneManagement.length;
  if (criteria.tags?.length) count += criteria.tags.length;
  if (criteria.findings?.severities?.length) count += criteria.findings.severities.length;
  if (criteria.findings?.types?.length) count += criteria.findings.types.length;
  if (criteria.lastSnapshotWithin) count += 1;
  return count;
}
