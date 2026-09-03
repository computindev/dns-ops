/**
 * Built-in portfolio views (issue #63).
 *
 * Three operational views that open the Portfolio workspace: mail-broken,
 * expiring evidence, and incomplete coverage. Each view reuses the saved-filter
 * machinery — the visible search controls are set from `currentFilters`, and the
 * criteria the controls cannot express travel as extra `/api/portfolio/search`
 * parameters alongside them.
 */

import { type CurrentFilters, currentFiltersToSearchBody } from './portfolio-filters.js';

export type BuiltInViewId = 'mail-broken' | 'expiring' | 'incomplete-coverage';

export interface BuiltInView {
  id: BuiltInViewId;
  name: string;
  description: string;
  /** Filters reflected in the visible search controls while the view is active. */
  currentFilters: CurrentFilters;
  /** Extra search criteria the visible controls cannot express. */
  searchParams: Record<string, unknown>;
}

export const BUILT_IN_VIEWS: BuiltInView[] = [
  {
    id: 'mail-broken',
    name: 'Mail broken',
    description: 'Domains with high or critical mail findings (SPF, DMARC, DKIM, MX).',
    currentFilters: { query: '', tags: [], severities: ['high', 'critical'], zoneManagement: [] },
    searchParams: { findingTypePrefix: 'mail.' },
  },
  {
    id: 'expiring',
    name: 'Expiring evidence',
    description: 'No snapshot in the last 30 days — collected evidence is going stale.',
    currentFilters: { query: '', tags: [], severities: [], zoneManagement: [] },
    searchParams: { snapshotOlderThanDays: 30 },
  },
  {
    id: 'incomplete-coverage',
    name: 'Incomplete coverage',
    description: 'Latest evidence has not been fully evaluated by the ruleset.',
    currentFilters: { query: '', tags: [], severities: [], zoneManagement: [] },
    searchParams: { coverage: 'incomplete' },
  },
];

export function getBuiltInView(id: BuiltInViewId): BuiltInView {
  const view = BUILT_IN_VIEWS.find((candidate) => candidate.id === id);
  if (!view) {
    throw new Error(`Unknown built-in view: ${id}`);
  }
  return view;
}

/**
 * Search request body for the current filters plus, when a built-in view is
 * active, the view's extra criteria. Operator refinements win on collision
 * because the view params only carry keys the controls never emit.
 */
export function searchBodyForView(
  filters: CurrentFilters,
  view: BuiltInView | null
): Record<string, unknown> {
  const base = currentFiltersToSearchBody(filters);
  return view ? { ...base, ...view.searchParams } : base;
}
