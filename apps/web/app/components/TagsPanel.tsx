/**
 * Tags Panel - dns-ops-1j4.10.4
 *
 * Domain tags management UI component.
 * Allows adding and removing tags for a domain.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface TagsPanelProps {
  /** Domain UUID (preferred) or domain name */
  domainId: string;
  /** If true, assumes domainId is a domain name and looks up the ID first */
  isDomainName?: boolean;
  /** Callback when tags change (for parent component to refresh) */
  onTagsChange?: (tags: string[]) => void;
}

async function resolveDomain(domainId: string) {
  const response = await fetch(`/api/portfolio/domains/by-name/${encodeURIComponent(domainId)}`, {
    credentials: 'include',
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
  if (response.status === 404) {
    const err = new Error('Not found');
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  if (!response.ok) throw new Error('Failed to resolve domain');
  const data = (await response.json()) as { domain?: { id?: string } };
  return data.domain?.id ?? null;
}

async function fetchTags(resolvedDomainId: string): Promise<string[]> {
  const response = await fetch(`/api/portfolio/domains/${resolvedDomainId}/tags`, {
    credentials: 'include',
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
  if (!response.ok) throw new Error('Failed to fetch tags');
  const data = (await response.json()) as { tags?: Array<string | { tag: string }> };
  return (data.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag.tag));
}

async function fetchAllTags(): Promise<string[]> {
  const response = await fetch('/api/portfolio/tags', { credentials: 'include' });
  if (!response.ok) return [];
  const data = (await response.json()) as { tags?: string[] };
  return data.tags || [];
}

export function TagsPanel({ domainId, isDomainName = false, onTagsChange }: TagsPanelProps) {
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    data: resolvedDomainId,
    isLoading: resolving,
    error: resolveError,
  } = useQuery({
    queryKey: ['domain-resolve', domainId, isDomainName],
    queryFn: () => (isDomainName ? resolveDomain(domainId) : Promise.resolve(domainId)),
    enabled: !!domainId,
    staleTime: Infinity,
  });

  const resolveStatus = resolveError
    ? (resolveError as Error & { status?: number }).status
    : undefined;

  const {
    data: tags = [],
    isLoading: tagsLoading,
    error: tagsError,
  } = useQuery({
    queryKey: ['tags', resolvedDomainId],
    queryFn: () => fetchTags(resolvedDomainId!),
    enabled: !!resolvedDomainId,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ['portfolio-tags'],
    queryFn: fetchAllTags,
    staleTime: Infinity,
  });

  const tagsStatus = tagsError ? (tagsError as Error & { status?: number }).status : undefined;

  const authRequired = resolveStatus === 401 || tagsStatus === 401;
  const writeBlocked = resolveStatus === 403 || tagsStatus === 403;
  const notFound = resolveStatus === 404;
  const error =
    localError ??
    (resolveError && resolveStatus !== 401 && resolveStatus !== 403 && resolveStatus !== 404
      ? resolveError.message
      : null) ??
    (tagsError && tagsStatus !== 401 && tagsStatus !== 403 ? tagsError.message : null);

  const addMutation = useMutation({
    mutationFn: async (tag: string) => {
      const response = await fetch(`/api/portfolio/domains/${resolvedDomainId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
        credentials: 'include',
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
      if (!response.ok) throw new Error('Failed to add tag');
    },
    onSuccess: (_data, tag) => {
      setNewTag('');
      setIsAdding(false);
      queryClient.invalidateQueries({ queryKey: ['tags', resolvedDomainId] });
      const currentTags = queryClient.getQueryData<string[]>(['tags', resolvedDomainId]) ?? [];
      onTagsChange?.([...currentTags, tag]);
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to add tag');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (tag: string) => {
      const response = await fetch(
        `/api/portfolio/domains/${resolvedDomainId}/tags/${encodeURIComponent(tag)}`,
        { method: 'DELETE', credentials: 'include' }
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
      if (!response.ok) throw new Error('Failed to remove tag');
    },
    onSuccess: (_data, tag) => {
      queryClient.invalidateQueries({ queryKey: ['tags', resolvedDomainId] });
      const currentTags = queryClient.getQueryData<string[]>(['tags', resolvedDomainId]) ?? [];
      onTagsChange?.(currentTags.filter((t) => t !== tag));
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to remove tag');
    },
  });

  const handleAddTag = (tagToAdd: string = newTag) => {
    const trimmedTag = tagToAdd.trim().toLowerCase();
    if (!trimmedTag || !resolvedDomainId || tags.includes(trimmedTag)) return;
    addMutation.mutate(trimmedTag);
  };

  const handleRemoveTag = (tag: string) => {
    if (!resolvedDomainId) return;
    removeMutation.mutate(tag);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewTag('');
    }
  };

  const suggestedTags = allTags.filter((t) => !tags.includes(t));
  const loading = resolving || tagsLoading;
  const isSaving = addMutation.isPending || removeMutation.isPending;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Tags</h3>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            disabled={authRequired || writeBlocked}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
          >
            + Add Tag
          </button>
        )}
      </div>

      <div className="p-4">
        {authRequired && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Operator sign-in is required to view or edit tenant tags.
          </div>
        )}

        {writeBlocked && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            You can view tenant tags here, but your current role cannot add or remove them.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {error}
            <button
              type="button"
              onClick={() => setLocalError(null)}
              className="ml-2 text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {isAdding && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter tag name..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={authRequired || writeBlocked}
              />
              <button
                type="button"
                onClick={() => handleAddTag()}
                disabled={!newTag.trim() || isSaving || authRequired || writeBlocked}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewTag('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:text-gray-400"
                disabled={isSaving || authRequired || writeBlocked}
              >
                Cancel
              </button>
            </div>

            {suggestedTags.length > 0 && (
              <div className="mt-3">
                <span className="text-sm text-gray-500">Suggestions:</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {suggestedTags.slice(0, 10).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddTag(tag)}
                      disabled={isSaving || authRequired || writeBlocked}
                      className="px-2 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500 py-4">Loading tags...</div>
        ) : authRequired ? (
          <div className="text-center text-gray-500 py-4">
            Sign in to view and manage tenant tags.
          </div>
        ) : notFound ? (
          <div className="text-center text-gray-500 py-4">
            This domain must exist in the tenant portfolio before tags can be attached.
          </div>
        ) : !resolvedDomainId ? (
          <div className="text-center text-gray-500 py-4">
            Tags are unavailable until domain context can be resolved.
          </div>
        ) : tags.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            No tags yet.{' '}
            {!isAdding && (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                disabled={authRequired || writeBlocked}
              >
                Add one
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:bg-blue-200 rounded-full p-0.5 disabled:text-gray-400 disabled:hover:bg-transparent"
                  disabled={authRequired || writeBlocked}
                  aria-label={`Remove ${tag} tag`}
                >
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
