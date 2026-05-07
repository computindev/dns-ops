/**
 * Notes Panel - dns-ops-1j4.10.3
 *
 * Domain notes management UI component.
 * Allows creating, editing, and deleting notes for a domain.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface Note {
  id: string;
  domainId: string;
  content: string;
  author?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NotesPanelProps {
  /** Domain UUID (preferred) or domain name */
  domainId: string;
  /** If true, assumes domainId is a domain name and looks up the ID first */
  isDomainName?: boolean;
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

function shouldRetryDomainResolve(failureCount: number, error: Error): boolean {
  const status = (error as Error & { status?: number }).status;
  if (status === 401 || status === 403 || status === 404) {
    return false;
  }
  return failureCount < 2;
}

async function fetchNotes(resolvedDomainId: string): Promise<Note[]> {
  const response = await fetch(`/api/portfolio/domains/${resolvedDomainId}/notes`, {
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
  if (!response.ok) throw new Error('Failed to fetch notes');
  const data = (await response.json()) as { notes?: Note[] };
  return (data.notes || []).map((note) => ({
    ...note,
    author: note.author || note.createdBy || null,
  }));
}

export function NotesPanel({ domainId, isDomainName = false }: NotesPanelProps) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    data: resolvedDomainId,
    isLoading: resolving,
    error: resolveError,
  } = useQuery({
    queryKey: ['domain-resolve', domainId, isDomainName],
    queryFn: () => (isDomainName ? resolveDomain(domainId) : Promise.resolve(domainId)),
    enabled: !!domainId,
    retry: shouldRetryDomainResolve,
  });

  const resolveStatus = resolveError
    ? (resolveError as Error & { status?: number }).status
    : undefined;

  const {
    data: notes = [],
    isLoading: notesLoading,
    error: notesError,
  } = useQuery({
    queryKey: ['notes', resolvedDomainId],
    queryFn: () => {
      if (!resolvedDomainId) throw new Error('Domain ID is required');
      return fetchNotes(resolvedDomainId);
    },
    enabled: !!resolvedDomainId,
  });

  const notesStatus = notesError ? (notesError as Error & { status?: number }).status : undefined;

  const authRequired = resolveStatus === 401 || notesStatus === 401;
  const writeBlocked = resolveStatus === 403 || notesStatus === 403;
  const notFound = resolveStatus === 404;
  const error =
    localError ??
    (resolveError && resolveStatus !== 401 && resolveStatus !== 403 && resolveStatus !== 404
      ? resolveError.message
      : null) ??
    (notesError && notesStatus !== 401 && notesStatus !== 403 ? notesError.message : null);

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/portfolio/domains/${resolvedDomainId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
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
      if (!response.ok) throw new Error('Failed to create note');
      return response.json();
    },
    onSuccess: () => {
      setNewNoteContent('');
      setIsCreating(false);
      queryClient.invalidateQueries({ queryKey: ['notes', resolvedDomainId] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to create note');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
      const response = await fetch(`/api/portfolio/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
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
      if (!response.ok) throw new Error('Failed to update note');
      return response.json();
    },
    onSuccess: () => {
      setEditingId(null);
      setEditContent('');
      queryClient.invalidateQueries({ queryKey: ['notes', resolvedDomainId] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to update note');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await fetch(`/api/portfolio/notes/${noteId}`, {
        method: 'DELETE',
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
      if (!response.ok) throw new Error('Failed to delete note');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', resolvedDomainId] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to delete note');
    },
  });

  const handleCreateNote = () => {
    if (!newNoteContent.trim() || !resolvedDomainId) return;
    createMutation.mutate(newNoteContent.trim());
  };

  const handleUpdateNote = (noteId: string) => {
    if (!editContent.trim()) return;
    updateMutation.mutate({ noteId, content: editContent.trim() });
  };

  const handleDeleteNote = (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    deleteMutation.mutate(noteId);
  };

  const startEditing = (note: Note) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  const loading = resolving || notesLoading;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-lg font-medium text-gray-900">Notes</h3>
        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            disabled={authRequired || writeBlocked}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400"
          >
            + Add Note
          </button>
        )}
      </div>

      <div className="p-4">
        {authRequired && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Operator sign-in is required to view or edit tenant notes.
          </div>
        )}

        {writeBlocked && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            You can view tenant notes here, but your current role cannot create, edit, or delete
            them.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
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

        {isCreating && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Write your note..."
              rows={3}
              disabled={authRequired || writeBlocked}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewNoteContent('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                disabled={isSaving || authRequired || writeBlocked}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNote}
                disabled={!newNoteContent.trim() || isSaving || authRequired || writeBlocked}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-4 text-center text-gray-500">Loading notes...</div>
        ) : authRequired ? (
          <div className="py-4 text-center text-gray-500">
            Sign in to view and manage tenant notes.
          </div>
        ) : notFound ? (
          <div className="py-4 text-center text-gray-500">
            This domain must exist in the tenant portfolio before notes can be attached.
          </div>
        ) : !resolvedDomainId ? (
          <div className="py-4 text-center text-gray-500">
            Notes are unavailable until domain context can be resolved.
          </div>
        ) : notes.length === 0 ? (
          <div className="py-4 text-center text-gray-500">
            No notes yet.{` `}
            {!isCreating && (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                disabled={authRequired || writeBlocked}
              >
                Add one
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                {editingId === note.id ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      disabled={authRequired || writeBlocked}
                      className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                        disabled={isSaving || authRequired}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateNote(note.id)}
                        disabled={!editContent.trim() || isSaving || authRequired || writeBlocked}
                        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="whitespace-pre-wrap text-gray-800">{note.content}</p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <div className="text-gray-500">
                        {note.author && <span className="mr-2">{note.author}</span>}
                        <span>{formatDate(note.updatedAt || note.createdAt)}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(note)}
                          className="text-gray-500 hover:text-blue-600 disabled:text-gray-400"
                          disabled={authRequired || writeBlocked}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-gray-500 hover:text-red-600 disabled:text-gray-400"
                          disabled={authRequired || writeBlocked}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
