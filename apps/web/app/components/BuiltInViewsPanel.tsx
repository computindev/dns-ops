/**
 * Built-in Views Panel (issue #63).
 *
 * The Portfolio start screen: three operational views (mail-broken, expiring
 * evidence, incomplete coverage) that load instantly and can be refined with
 * the regular search controls. Selecting the active view again clears it.
 */

import { BUILT_IN_VIEWS, type BuiltInView, type BuiltInViewId } from '../lib/built-in-views.js';

interface BuiltInViewsPanelProps {
  activeView: BuiltInViewId | null;
  onSelectView: (view: BuiltInView) => void;
  onClearView: () => void;
}

export function BuiltInViewsPanel({
  activeView,
  onSelectView,
  onClearView,
}: BuiltInViewsPanelProps) {
  return (
    <div className="ds-panel portfolio-panel">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-lg font-medium text-ink">Built-in views</h3>
        <p className="text-sm text-muted">
          Start from an operational view of the portfolio, then refine it with the search controls.
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {BUILT_IN_VIEWS.map((view) => {
          const isActive = view.id === activeView;
          return (
            <button
              key={view.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => (isActive ? onClearView() : onSelectView(view))}
              className={`rounded-lg border p-3 text-left ${
                isActive ? 'border-brand bg-info-surface' : 'border-line bg-surface-muted'
              }`}
            >
              <span className="block font-medium text-ink">{view.name}</span>
              <span className="mt-1 block text-sm text-text">{view.description}</span>
              <span className="mt-2 inline-block">
                <span className={`ds-badge ${isActive ? 'ds-badge--info' : 'ds-badge--unknown'}`}>
                  {isActive ? 'Active' : 'View'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
