/**
 * Notes Panel - dns-ops-1j4.10.3
 *
 * Domain notes management UI component.
 * Allows creating, editing, and deleting notes for a domain.
 */

import { useCallback, useEffect, useState } from 'react';

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

export function NotesPanel({ domainId, isDomainName = false }: NotesPanelProps) {
  const [resolvedDomainId, setResolvedDomainId] = useState<string | null>(
    isDomainName ? null : domainId
  );
  const [resolutionAttempted, setResolutionAttempted] = useState(!isDomainName);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [writeBlocked, setWriteBlocked] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isDomainName) {
      setResolvedDomainId(domainId);
      setResolutionAttempted(true);
      return;
    }

    async function resolveDomainId() {
      setResolutionAttempted(false);
      setError(null);
      try {
        const response = await fetch(
          `/api/portfolio/domains/by-name/${encodeURIComponent(domainId)}`,
          { credentials: 'include' }
        );
        if (response.status === 401) {
          setAuthRequired(true);
          setResolvedDomainId(null);
          setLoading(false);
          setResolutionAttempted(true);
          return;
        }
        if (response.status === 403) {
          setResolvedDomainId(null);
          setLoading(false);
          setError('You do not have permission to view tenant notes for this domain.');
          setResolutionAttempted(true);
          return;
        }
        if (response.status === 404) {
          setResolvedDomainId(null);
          setLoading(false);
          setError('This domain must exist in the tenant portfolio before notes can be attached.');
          setResolutionAttempted(true);
          return;
        }
        if (!response.ok) {
          setResolvedDomainId(null);
          setLoading(false);
          setError('Failed to resolve domain context for notes');
          setResolutionAttempted(true);
          return;
        }

        const data = (await response.json()) as { domain?: { id?: string } };
        if (data.domain?.id) {
          setAuthRequired(false);
          setResolvedDomainId(data.domain.id);
          setLoading(true);
        } else {
          setResolvedDomainId(null);
          setLoading(false);
          setError('Resolved domain response did not include a domain ID.');
        }
      } catch {
        setResolvedDomainId(null);
        setLoading(false);
        setError('Failed to resolve domain context for notes');
      } finally {
        setResolutionAttempted(true);
      }
    }

    void resolveDomainId();
  }, [domainId, isDomainName]);

  const fetchNotes = useCallback(async () => {
    if (!resolvedDomainId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/portfolio/domains/${resolvedDomainId}/notes`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          setAuthRequired(true);
          setNotes([]);
          return;
        }
        if (response.status === 403) {
          setNotes([]);
          throw new Error('You do not have permission to view tenant notes.');
        }
        throw new Error('Failed to fetch notes');
      }

      setAuthRequired(false);
      const data = (await response.json()) as { notes?: Note[] };
      setNotes(
        (data.notes || []).map((note) => ({
          ...note,
          author: note.author || note.createdBy || null,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [resolvedDomainId]);

  useEffect(() => {
    if (resolvedDomainId) {
      void fetchNotes();
    }
  }, [resolvedDomainId, fetchNotes]);

  const handleCreateNote = async () => {
    if (!newNoteContent.trim() || !resolvedDomainId) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/portfolio/domains/${resolvedDomainId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNoteContent }),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          setAuthRequired(true);
          throw new Error('Operator sign-in is required to create notes.');
        }
        if (response.status === 403) {
          setWriteBlocked(true);
          throw new Error('You do not have permission to create tenant notes.');
        }
        throw new Error('Failed to create note');
      }

      setAuthRequired(false);
      setNewNoteContent('');
      setIsCreating(false);
      await fetchNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editContent.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/portfolio/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          setAuthRequired(true);
          throw new Error('Operator sign-in is required to update notes.');
        }
        if (response.status === 403) {
          setWriteBlocked(true);
          throw new Error('You do not have permission to update tenant notes.');
        }
        throw new Error('Failed to update note');
      }

      setAuthRequired(false);
      setEditingId(null);
      setEditContent('');
      await fetchNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const response = await fetch(`/api/portfolio/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          setAuthRequired(true);
          throw new Error('Operator sign-in is required to delete notes.');
        }
        if (response.status === 403) {
          setWriteBlocked(true);
          throw new Error('You do not have permission to delete tenant notes.');
        }
        throw new Error('Failed to delete note');
      }

      setAuthRequired(false);
      await fetchNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    }
  };

  const startEditing = (note: Note) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

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
              onClick={() => setError(null)}
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
        ) : !resolvedDomainId && resolutionAttempted ? (
          <div className="py-4 text-center text-gray-500">
            {error || 'Notes are unavailable until domain context can be resolved.'}
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
