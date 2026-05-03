/**
 * Audit Log Panel - dns-ops-1j4.10.6
 *
 * UI for viewing the audit trail of portfolio actions.
 * Shows recent changes to notes, tags, filters, template overrides, monitoring, alerts, and shared reports.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

type AuditAction =
  | 'domain_note_created'
  | 'domain_note_updated'
  | 'domain_note_deleted'
  | 'domain_tag_added'
  | 'domain_tag_removed'
  | 'filter_created'
  | 'filter_updated'
  | 'filter_deleted'
  | 'template_override_created'
  | 'template_override_updated'
  | 'template_override_deleted'
  | 'remediation_request_created'
  | 'remediation_request_updated'
  | 'shared_report_created'
  | 'shared_report_expired'
  | 'monitored_domain_created'
  | 'monitored_domain_updated'
  | 'monitored_domain_deleted'
  | 'monitored_domain_toggled'
  | 'alert_acknowledged'
  | 'alert_resolved'
  | 'alert_suppressed';

interface AuditEvent {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  actorId: string;
  actorEmail: string | null;
  createdAt: string;
}

// Human-readable labels for actions
const ACTION_LABELS: Record<AuditAction, string> = {
  domain_note_created: 'Created note',
  domain_note_updated: 'Updated note',
  domain_note_deleted: 'Deleted note',
  domain_tag_added: 'Added tag',
  domain_tag_removed: 'Removed tag',
  filter_created: 'Created filter',
  filter_updated: 'Updated filter',
  filter_deleted: 'Deleted filter',
  template_override_created: 'Created override',
  template_override_updated: 'Updated override',
  template_override_deleted: 'Deleted override',
  remediation_request_created: 'Created remediation request',
  remediation_request_updated: 'Updated remediation request',
  shared_report_created: 'Created shared report',
  shared_report_expired: 'Expired shared report',
  monitored_domain_created: 'Created monitored domain',
  monitored_domain_updated: 'Updated monitored domain',
  monitored_domain_deleted: 'Deleted monitored domain',
  monitored_domain_toggled: 'Toggled monitored domain',
  alert_acknowledged: 'Acknowledged alert',
  alert_resolved: 'Resolved alert',
  alert_suppressed: 'Suppressed alert',
};

// Icon for each action category
const ACTION_ICONS: Record<string, string> = {
  note: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  tag: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  filter:
    'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
  override:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  remediation:
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  shared: 'M17 20h5V4H2v16h5m10 0v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6m10 0H7',
  monitored:
    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  alert:
    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
};

// Color for each action category
const ACTION_COLORS: Record<string, string> = {
  created: 'text-green-600 bg-green-50',
  updated: 'text-blue-600 bg-blue-50',
  deleted: 'text-red-600 bg-red-50',
  added: 'text-green-600 bg-green-50',
  removed: 'text-red-600 bg-red-50',
};

async function fetchAuditLog(limit: number): Promise<AuditEvent[]> {
  const response = await fetch(`/api/portfolio/audit?limit=${limit}`, { credentials: 'include' });
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
  if (!response.ok) throw new Error('Failed to fetch audit log');
  const data = (await response.json()) as { events: AuditEvent[] };
  return data.events || [];
}

export function AuditLogPanel() {
  const [limit, setLimit] = useState(20);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: events = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['audit-log', limit],
    queryFn: () => fetchAuditLog(limit),
  });

  const status = error ? (error as Error & { status?: number }).status : undefined;
  const authRequired = status === 401;
  const loadError = error && status !== 401 && status !== 403 ? error.message : null;

  const getActionCategory = (action: AuditAction): string => {
    if (action.includes('note')) return 'note';
    if (action.includes('tag')) return 'tag';
    if (action.includes('filter')) return 'filter';
    if (action.includes('override')) return 'override';
    if (action.includes('remediation')) return 'remediation';
    if (action.includes('shared_report')) return 'shared';
    if (action.includes('monitored_domain')) return 'monitored';
    if (action.includes('alert_')) return 'alert';
    return 'note';
  };

  const getActionColorKey = (action: AuditAction): string => {
    if (action.includes('created')) return 'created';
    if (action.includes('updated')) return 'updated';
    if (action.includes('deleted')) return 'deleted';
    if (action.includes('added')) return 'added';
    if (action.includes('removed')) return 'removed';
    if (action.includes('suppressed')) return 'removed';
    if (action.includes('acknowledged')) return 'updated';
    if (action.includes('resolved')) return 'created';
    if (action.includes('toggled')) return 'updated';
    return 'updated';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Audit Log</h3>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isLoading || authRequired}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="p-4">
        {authRequired && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Operator sign-in is required to view the tenant audit log.
          </div>
        )}

        {loadError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {loadError}
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-gray-500 py-8">Loading audit log...</div>
        ) : authRequired ? (
          <div className="text-center text-gray-500 py-8">
            Sign in to view the tenant audit log.
          </div>
        ) : events.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No audit events found</div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <AuditEventCard
                key={event.id}
                event={event}
                isExpanded={expandedId === event.id}
                onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
                category={getActionCategory(event.action)}
                colorKey={getActionColorKey(event.action)}
              />
            ))}

            {events.length >= limit && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setLimit(limit + 20)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Load more events
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Audit Event Card
// =============================================================================

interface AuditEventCardProps {
  event: AuditEvent;
  isExpanded: boolean;
  onToggle: () => void;
  category: string;
  colorKey: string;
}

function AuditEventCard({ event, isExpanded, onToggle, category, colorKey }: AuditEventCardProps) {
  const iconPath = ACTION_ICONS[category] || ACTION_ICONS.note;
  const colorClass = ACTION_COLORS[colorKey] || 'text-gray-600 bg-gray-50';

  const formatTime = (dateString: string): string => {
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

  return (
    <div className="flex gap-3">
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${colorClass}`}
      >
        <svg
          aria-hidden="true"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <div>
            <span className="font-medium text-gray-900">
              {ACTION_LABELS[event.action] || event.action}
            </span>
            <span className="text-gray-500 text-sm ml-2">
              by {event.actorEmail || event.actorId}
            </span>
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(event.createdAt)}</span>
        </div>

        <p className="text-sm text-gray-600 mt-0.5">
          {event.entityType}{' '}
          <span className="font-mono text-xs">{event.entityId.slice(0, 8)}...</span>
        </p>

        {(event.previousValue || event.newValue) && (
          <button
            type="button"
            onClick={onToggle}
            className="mt-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {isExpanded ? 'Hide details' : 'Show details'}
          </button>
        )}

        {isExpanded && (
          <div className="mt-2 space-y-2">
            {event.previousValue && (
              <div>
                <p className="text-xs font-medium text-gray-500">Before:</p>
                <pre className="mt-1 bg-red-50 p-2 rounded text-xs text-red-800 overflow-x-auto">
                  {JSON.stringify(event.previousValue, null, 2)}
                </pre>
              </div>
            )}
            {event.newValue && (
              <div>
                <p className="text-xs font-medium text-gray-500">After:</p>
                <pre className="mt-1 bg-green-50 p-2 rounded text-xs text-green-800 overflow-x-auto">
                  {JSON.stringify(event.newValue, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
