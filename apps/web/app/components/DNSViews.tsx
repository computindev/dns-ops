/**
 * DNS Views Components
 *
 * Three view modes for DNS snapshot data:
 * - Raw: Complete observation data
 * - Parsed: Normalized record tables
 * - Dig: Familiar dig-style output
 */

import type { Observation } from '@dns-ops/db/schema';
import {
  formatRecordValue,
  getRecordTypeDescription,
  groupRecordsByType,
  observationsToDigFormat,
  observationsToRecordSets,
} from '@dns-ops/parsing';
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  describeEstimate,
  estimateLiveAt,
  formatLiveAt,
  indexObservationsById,
  type TtlEstimate,
  toDateTimeAttribute,
} from '../lib/dns-ttl.js';

interface DNSViewsProps {
  observations: Observation[];
}

type ViewMode = 'parsed' | 'raw' | 'dig';

const VIEW_MODES: { id: ViewMode; label: string; description: string }[] = [
  { id: 'parsed', label: 'Parsed', description: 'Structured record view' },
  { id: 'raw', label: 'Raw', description: 'Complete response data' },
  { id: 'dig', label: 'Dig', description: 'CLI-style output' },
];

export function DNSViews({ observations }: DNSViewsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('parsed');
  const viewIdPrefix = useId();

  const getTabId = (mode: ViewMode) => `${viewIdPrefix}-dns-view-tab-${mode}`;
  const getPanelId = (mode: ViewMode) => `${viewIdPrefix}-dns-view-panel-${mode}`;

  const focusModeTab = (mode: ViewMode) => {
    requestAnimationFrame(() => {
      document.getElementById(getTabId(mode))?.focus();
    });
  };

  const handleModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = VIEW_MODES[(index + 1) % VIEW_MODES.length];
      setViewMode(next.id);
      focusModeTab(next.id);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prevIndex = (index - 1 + VIEW_MODES.length) % VIEW_MODES.length;
      const prev = VIEW_MODES[prevIndex];
      setViewMode(prev.id);
      focusModeTab(prev.id);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const first = VIEW_MODES[0];
      setViewMode(first.id);
      focusModeTab(first.id);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const last = VIEW_MODES[VIEW_MODES.length - 1];
      setViewMode(last.id);
      focusModeTab(last.id);
    }
  };

  return (
    <div>
      <ViewModeSelector
        current={viewMode}
        onChange={setViewMode}
        onKeyDown={handleModeKeyDown}
        getTabId={getTabId}
        getPanelId={getPanelId}
      />

      <div className="mt-4">
        <div
          role="tabpanel"
          id={getPanelId('parsed')}
          aria-labelledby={getTabId('parsed')}
          hidden={viewMode !== 'parsed'}
        >
          {viewMode === 'parsed' && <ParsedView observations={observations} />}
        </div>
        <div
          role="tabpanel"
          id={getPanelId('raw')}
          aria-labelledby={getTabId('raw')}
          hidden={viewMode !== 'raw'}
        >
          {viewMode === 'raw' && <RawView observations={observations} />}
        </div>
        <div
          role="tabpanel"
          id={getPanelId('dig')}
          aria-labelledby={getTabId('dig')}
          hidden={viewMode !== 'dig'}
        >
          {viewMode === 'dig' && <DigView observations={observations} />}
        </div>
      </div>
    </div>
  );
}

function ViewModeSelector({
  current,
  onChange,
  onKeyDown,
  getTabId,
  getPanelId,
}: {
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  getTabId: (mode: ViewMode) => string;
  getPanelId: (mode: ViewMode) => string;
}) {
  return (
    <div className="rounded-lg bg-gray-100 p-1" role="tablist" aria-label="DNS view mode">
      <div className="flex space-x-1">
        {VIEW_MODES.map((mode, index) => (
          <button
            key={mode.id}
            type="button"
            id={getTabId(mode.id)}
            role="tab"
            aria-selected={current === mode.id}
            aria-controls={getPanelId(mode.id)}
            tabIndex={current === mode.id ? 0 : -1}
            onClick={() => onChange(mode.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`focus-ring flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              current === mode.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title={mode.description}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ==================== PARSED VIEW ====================

function ParsedView({ observations }: { observations: Observation[] }) {
  const recordSets = observationsToRecordSets(observations);
  const grouped = groupRecordsByType(recordSets);
  const observationIndex = useMemo(() => indexObservationsById(observations), [observations]);

  // One shared ticker drives every row's countdown; each tick recomputes from
  // Date.now() so long-lived tabs do not accumulate interval drift.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (recordSets.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">No successful observations to display</div>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([type, records]) => (
        <section key={type} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <h4 className="font-semibold text-gray-900">
              {type} Records
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({records.length}) · {getRecordTypeDescription(type)}
              </span>
            </h4>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <caption className="sr-only">
                {type} DNS records with remaining TTL and estimated cache expiry
              </caption>
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    TTL
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    Remaining TTL
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    Estimated live at
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    Value
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    Sources
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map((record) => (
                  <tr key={`${record.name}-${record.type}-${record.values.join(',')}`}>
                    <td className="px-4 py-2 text-sm font-mono text-gray-900">{record.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-600 tabular-nums">
                      {record.ttl !== null && record.ttl !== undefined ? `${record.ttl}s` : '—'}
                    </td>
                    <TtlEstimateCells estimate={estimateLiveAt(record, observationIndex, now)} />
                    <td className="px-4 py-2 text-sm">
                      <div className="space-y-1">
                        {record.values.map((value) => {
                          const valueKey =
                            typeof value === 'string' ? value : JSON.stringify(value);
                          return (
                            <div
                              key={`${record.name}-${record.type}-${valueKey}`}
                              className="font-mono text-gray-800"
                            >
                              {formatRecordValue(record.type, value)}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {record.sourceVantages.join(', ')}
                    </td>
                    <td className="px-4 py-2">
                      {!record.isConsistent ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800"
                          title={record.consolidationNotes}
                        >
                          Divergent
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Consistent
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

// ==================== RAW VIEW ====================

/**
 * Remaining TTL + estimated live-at cells for one parsed row.
 *
 * "Estimated live at" is the expiry of the latest observed public-recursive
 * cache entry — not Internet-wide propagation. Missing, invalid, future-dated
 * or expired evidence renders a visible UNKNOWN for both cells.
 */
function TtlEstimateCells({ estimate }: { estimate: TtlEstimate }) {
  if (estimate.state === 'live') {
    return (
      <>
        <td className="px-4 py-2 text-sm text-gray-600 tabular-nums">
          <span title={describeEstimate(estimate)}>
            {estimate.remainingSeconds}s<span className="sr-only"> remaining</span>
          </span>
        </td>
        <td className="px-4 py-2 text-sm text-gray-600 tabular-nums">
          <time dateTime={toDateTimeAttribute(estimate.deadline)}>
            {formatLiveAt(estimate.deadline)}
          </time>
        </td>
      </>
    );
  }

  return (
    <>
      <td className="px-4 py-2 text-sm text-gray-400" data-state="unknown">
        <span title={describeEstimate(estimate)}>UNKNOWN</span>
      </td>
      <td className="px-4 py-2 text-sm text-gray-400" data-state="unknown">
        <span title={describeEstimate(estimate)}>UNKNOWN</span>
      </td>
    </>
  );
}

function RawView({ observations }: { observations: Observation[] }) {
  return (
    <div className="space-y-4">
      {observations.map((obs) => (
        <details
          key={obs.id}
          className="border rounded-lg overflow-hidden"
          open={obs.status !== 'success'}
        >
          <summary className="bg-gray-50 px-4 py-2 cursor-pointer hover:bg-gray-100">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {obs.queryName} {obs.queryType}
                <span className="ml-2 text-sm text-gray-500">
                  from {obs.vantageIdentifier || obs.vantageType}
                </span>
              </span>
              <StatusBadge status={obs.status} />
            </div>
          </summary>

          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Response Code:</span>{' '}
                <span className="font-mono">{obs.responseCode ?? 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Response Time:</span>{' '}
                <span className="tabular-nums">{obs.responseTimeMs}ms</span>
              </div>
              <div>
                <span className="text-gray-500">Queried At:</span>{' '}
                <span>{new Date(obs.queriedAt).toLocaleString()}</span>
              </div>
            </div>

            {Boolean(obs.flags) && (
              <div>
                <span className="text-gray-500 text-sm">Flags:</span>
                <pre className="mt-1 text-xs bg-gray-50 p-2 rounded">
                  {JSON.stringify(obs.flags, null, 2)}
                </pre>
              </div>
            )}

            <Section title="Answer Section" data={obs.answerSection} />
            <Section title="Authority Section" data={obs.authoritySection} />
            <Section title="Additional Section" data={obs.additionalSection} />

            {obs.errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <span className="text-red-800 font-medium">Error:</span>
                <pre className="mt-1 text-sm text-red-700">{obs.errorMessage}</pre>
              </div>
            )}

            {obs.rawResponse && (
              <div>
                <span className="text-gray-500 text-sm">Raw Response:</span>
                <pre className="mt-1 text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto">
                  {obs.rawResponse}
                </pre>
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function Section({ title, data }: { title: string; data: unknown }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null;

  return (
    <div>
      <span className="text-gray-500 text-sm">{title}:</span>
      <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    success: { color: 'bg-green-100 text-green-800', label: 'Success' },
    timeout: { color: 'bg-yellow-100 text-yellow-800', label: 'Timeout' },
    refused: { color: 'bg-orange-100 text-orange-800', label: 'Refused' },
    nxdomain: { color: 'bg-red-100 text-red-800', label: 'NXDOMAIN' },
    nodata: { color: 'bg-yellow-100 text-yellow-800', label: 'NODATA' },
    error: { color: 'bg-red-100 text-red-800', label: 'Error' },
    truncated: { color: 'bg-yellow-100 text-yellow-800', label: 'Truncated' },
  };

  const { color, label } = config[status] || { color: 'bg-gray-100 text-gray-800', label: status };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

// ==================== DIG VIEW ====================

function DigView({ observations }: { observations: Observation[] }) {
  const [showAll, setShowAll] = useState(false);

  const displayObservations = showAll ? observations : observations.slice(0, 5);
  const hasMore = observations.length > 5;

  return (
    <div>
      <div className="bg-gray-900 text-gray-100 rounded-lg overflow-hidden">
        <div className="p-4 font-mono text-sm whitespace-pre overflow-x-auto">
          {String(observationsToDigFormat(displayObservations))}
        </div>
      </div>

      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="focus-ring mt-2 text-sm text-blue-600 hover:text-blue-800"
        >
          Show all {observations.length} observations...
        </button>
      )}
    </div>
  );
}
