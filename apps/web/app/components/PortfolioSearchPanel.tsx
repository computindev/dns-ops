import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId, useMemo, useState } from 'react';
import {
  type CurrentFilters,
  currentFiltersToSearchBody,
  EMPTY_CURRENT_FILTERS,
  normalizeCurrentFilters,
  type Severity,
  type ZoneManagement,
} from '../lib/portfolio-filters.js';

interface PortfolioSearchPanelProps {
  currentFilters: CurrentFilters;
  onFiltersChange: (next: CurrentFilters) => void;
}

interface SearchResult {
  id: string;
  name: string;
  normalizedName: string;
  zoneManagement: ZoneManagement;
  findings: Array<{ severity: Severity; summary?: string }>;
  findingsEvaluated: boolean;
  evaluationCoverage: {
    state: 'COMPLETE' | 'PARTIAL';
    errors: Array<{ unknown: { explanation: string; actionLabel: string } }>;
  };
  latestSnapshot: {
    id: string;
    createdAt: string;
    resultState: string;
    rulesetVersionId: string | null;
  } | null;
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const ZONE_MANAGEMENT: ZoneManagement[] = ['managed', 'unmanaged', 'unknown'];

export function PortfolioSearchPanel({
  currentFilters,
  onFiltersChange,
}: PortfolioSearchPanelProps) {
  const queryClient = useQueryClient();
  const idPrefix = useId();
  const queryId = `${idPrefix}-portfolio-search-query`;
  const tagsId = `${idPrefix}-portfolio-search-tags`;
  const [tagDraft, setTagDraft] = useState('');

  const normalizedFilters = useMemo(
    () => normalizeCurrentFilters(currentFilters),
    [currentFilters]
  );

  // Tag suggestions — reference data, rarely changes
  const { data: tagSuggestionsData } = useQuery({
    queryKey: ['portfolio-tags'],
    queryFn: async () => {
      const response = await fetch('/api/portfolio/tags', { credentials: 'include' });
      if (!response.ok) return { tags: [] as string[] };
      return (await response.json()) as { tags?: string[] };
    },
    staleTime: Infinity,
  });

  const tagSuggestions = tagSuggestionsData?.tags ?? [];

  // Portfolio search — reactive to filters
  const {
    data: searchData,
    isLoading,
    error,
    isError,
  } = useQuery({
    queryKey: ['portfolio-search', normalizedFilters],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/portfolio/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFiltersToSearchBody(normalizedFilters)),
        signal,
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const err = new Error('auth');
          (err as Error & { status: number }).status = response.status;
          throw err;
        }
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || 'Failed to search portfolio');
      }

      return (await response.json()) as { domains?: SearchResult[] };
    },
  });

  const results = searchData?.domains ?? [];
  const authRequired = isError && (error as Error & { status?: number })?.status === 401;
  const searchError = isError && !authRequired ? error.message : null;
  const hasSearched = true; // useQuery runs immediately; empty result set is valid

  const filteredSuggestions = tagSuggestions.filter((tag) => !normalizedFilters.tags.includes(tag));

  const updateFilters = (next: Partial<CurrentFilters>) => {
    onFiltersChange(
      normalizeCurrentFilters({
        ...normalizedFilters,
        ...next,
      })
    );
  };

  const toggleSeverity = (severity: Severity) => {
    updateFilters({
      severities: normalizedFilters.severities.includes(severity)
        ? normalizedFilters.severities.filter((value) => value !== severity)
        : [...normalizedFilters.severities, severity],
    });
  };

  const toggleZoneManagement = (zoneManagement: ZoneManagement) => {
    updateFilters({
      zoneManagement: normalizedFilters.zoneManagement.includes(zoneManagement)
        ? normalizedFilters.zoneManagement.filter((value) => value !== zoneManagement)
        : [...normalizedFilters.zoneManagement, zoneManagement],
    });
  };

  const addTag = (rawTag: string) => {
    const tag = rawTag.trim().toLowerCase();
    if (!tag || normalizedFilters.tags.includes(tag)) {
      return;
    }

    updateFilters({ tags: [...normalizedFilters.tags, tag] });
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    updateFilters({ tags: normalizedFilters.tags.filter((value) => value !== tag) });
  };

  const clearFilters = () => {
    setTagDraft('');
    onFiltersChange(EMPTY_CURRENT_FILTERS);
  };

  return (
    <div className="ds-panel portfolio-panel">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-lg font-medium text-ink">Portfolio Search</h3>
        <p className="text-sm text-muted">
          Search tenant domains by name, tag, severity, and zone-management state.
        </p>
      </div>

      <div className="space-y-4 p-4">
        {authRequired && (
          <div className="rounded-lg border border-warning bg-warning-surface p-4 text-sm text-warning">
            Operator sign-in is required to search tenant domains and load saved filters.
          </div>
        )}

        {searchError && (
          <div className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">
            {searchError}
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['portfolio-search'] })}
              className="ml-2 text-danger hover:text-danger"
            >
              Retry
            </button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-text" htmlFor={queryId}>
            Query
          </label>
          <input
            id={queryId}
            type="text"
            value={normalizedFilters.query}
            onChange={(e) => updateFilters({ query: e.target.value })}
            disabled={authRequired}
            placeholder="example.com"
            className="ds-input w-full rounded-lg border border-line px-3 py-2 focus:border-brand focus:ring-2 focus:ring-focus disabled:bg-surface-muted"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text" htmlFor={tagsId}>
            Tags
          </label>
          <div className="flex gap-2">
            <input
              id={tagsId}
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addTag(tagDraft);
                }
              }}
              disabled={authRequired}
              placeholder="Add a tag"
              className="ds-input flex-1"
            />
            <button
              type="button"
              onClick={() => addTag(tagDraft)}
              disabled={authRequired || !tagDraft.trim().length}
              className="ds-button ds-button--primary ds-button--sm"
            >
              Add
            </button>
          </div>
          {normalizedFilters.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {normalizedFilters.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  disabled={authRequired}
                  className="rounded-full bg-info-surface px-3 py-1 text-sm text-brand disabled:opacity-60"
                >
                  {tag} ×
                </button>
              ))}
            </div>
          )}
          {filteredSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {filteredSuggestions.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  disabled={authRequired}
                  className="rounded bg-surface-muted px-2 py-1 text-xs text-text disabled:opacity-60"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-text">Severity</legend>
          <div className="flex flex-wrap gap-3">
            {SEVERITIES.map((severity) => (
              <label key={severity} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={normalizedFilters.severities.includes(severity)}
                  onChange={() => toggleSeverity(severity)}
                  disabled={authRequired}
                />
                {severity}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-text">Zone Management</legend>
          <div className="flex flex-wrap gap-3">
            {ZONE_MANAGEMENT.map((zoneManagement) => (
              <label key={zoneManagement} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={normalizedFilters.zoneManagement.includes(zoneManagement)}
                  onChange={() => toggleZoneManagement(zoneManagement)}
                  disabled={authRequired}
                />
                {zoneManagement}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            disabled={authRequired}
            className="ds-button ds-button--quiet ds-button--sm"
          >
            Clear filters
          </button>
        </div>

        <div className="border-t border-line pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-medium text-ink">Results</h4>
            {!isLoading && hasSearched && !authRequired && (
              <span className="text-sm text-muted">
                {results.length === 20
                  ? 'Showing first 20 matching domains. Refine filters to narrow results.'
                  : `Showing ${results.length} matching domain${results.length === 1 ? '' : 's'}`}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted">Searching portfolio...</div>
          ) : authRequired ? (
            <div className="py-8 text-center text-muted">Sign in to search tenant domains.</div>
          ) : searchError ? (
            <div className="py-8 text-center text-muted">Search is unavailable right now.</div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-muted">
              No tenant domains matched the current filters.
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((result) => (
                <SearchResultCard key={result.id} result={result} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  const counts = result.findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>
  );

  return (
    <div className="rounded-lg border border-line bg-surface-muted p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/domain/$domain"
            params={{ domain: result.normalizedName }}
            className="text-base font-medium text-brand hover:text-brand"
          >
            {result.name}
          </Link>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded bg-surface px-2 py-0.5 text-text">
              {result.zoneManagement}
            </span>
            {result.latestSnapshot ? (
              <span>
                {result.latestSnapshot.resultState} ·{' '}
                {new Date(result.latestSnapshot.createdAt).toLocaleString()}
              </span>
            ) : (
              <span>No snapshot available yet</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 text-sm text-text">
        {!result.findingsEvaluated ? (
          <span className="ds-badge ds-badge--unknown">
            Needs setup/evidence. {result.evaluationCoverage.errors[0]?.unknown.explanation}{' '}
            <strong>
              {result.evaluationCoverage.errors[0]?.unknown.actionLabel ?? 'Run a fresh scan'}.
            </strong>
          </span>
        ) : result.findings.length === 0 ? (
          <span>No matching findings for the current filters.</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {SEVERITIES.filter((severity) => counts[severity] > 0).map((severity) => (
              <span key={severity} className="rounded bg-surface px-2 py-0.5 text-xs text-text">
                {severity}: {counts[severity]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
