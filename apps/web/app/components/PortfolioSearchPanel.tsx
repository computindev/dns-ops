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
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-lg font-medium text-gray-900">Portfolio Search</h3>
        <p className="text-sm text-gray-500">
          Search tenant domains by name, tag, severity, and zone-management state.
        </p>
      </div>

      <div className="space-y-4 p-4">
        {authRequired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Operator sign-in is required to search tenant domains and load saved filters.
          </div>
        )}

        {searchError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {searchError}
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['portfolio-search'] })}
              className="ml-2 text-red-600 hover:text-red-800"
            >
              Retry
            </button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={queryId}>
            Query
          </label>
          <input
            id={queryId}
            type="text"
            value={normalizedFilters.query}
            onChange={(e) => updateFilters({ query: e.target.value })}
            disabled={authRequired}
            placeholder="example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={tagsId}>
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
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <button
              type="button"
              onClick={() => addTag(tagDraft)}
              disabled={authRequired || tagDraft.trim().length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
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
                  className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 disabled:opacity-60"
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
                  className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 disabled:opacity-60"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-gray-700">Severity</legend>
          <div className="flex flex-wrap gap-3">
            {SEVERITIES.map((severity) => (
              <label key={severity} className="flex items-center gap-2 text-sm text-gray-700">
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
          <legend className="mb-1 text-sm font-medium text-gray-700">Zone Management</legend>
          <div className="flex flex-wrap gap-3">
            {ZONE_MANAGEMENT.map((zoneManagement) => (
              <label key={zoneManagement} className="flex items-center gap-2 text-sm text-gray-700">
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
            className="text-sm text-gray-600 hover:text-gray-800 disabled:text-gray-400"
          >
            Clear filters
          </button>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-medium text-gray-900">Results</h4>
            {!isLoading && hasSearched && !authRequired && (
              <span className="text-sm text-gray-500">
                {results.length === 20
                  ? 'Showing first 20 matching domains. Refine filters to narrow results.'
                  : `Showing ${results.length} matching domain${results.length === 1 ? '' : 's'}`}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-gray-500">Searching portfolio...</div>
          ) : authRequired ? (
            <div className="py-8 text-center text-gray-500">Sign in to search tenant domains.</div>
          ) : searchError ? (
            <div className="py-8 text-center text-gray-500">Search is unavailable right now.</div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
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
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/domain/$domain"
            params={{ domain: result.normalizedName }}
            className="text-base font-medium text-blue-600 hover:text-blue-700"
          >
            {result.name}
          </Link>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="rounded bg-white px-2 py-0.5 text-gray-700">
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

      <div className="mt-3 text-sm text-gray-600">
        {!result.findingsEvaluated ? (
          <span>Rules not evaluated yet.</span>
        ) : result.findings.length === 0 ? (
          <span>No matching findings for the current filters.</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {SEVERITIES.filter((severity) => counts[severity] > 0).map((severity) => (
              <span key={severity} className="rounded bg-white px-2 py-0.5 text-xs text-gray-700">
                {severity}: {counts[severity]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
