import { describe, expect, it } from 'vitest';
import { BUILT_IN_VIEWS, getBuiltInView, searchBodyForView } from './built-in-views.js';
import { type CurrentFilters, EMPTY_CURRENT_FILTERS } from './portfolio-filters.js';

describe('built-in portfolio views (issue #63)', () => {
  it('exposes exactly the three operational views with unique ids', () => {
    expect(BUILT_IN_VIEWS.map((view) => view.id)).toEqual([
      'mail-broken',
      'expiring',
      'incomplete-coverage',
    ]);
    expect(new Set(BUILT_IN_VIEWS.map((view) => view.id)).size).toBe(BUILT_IN_VIEWS.length);
    for (const view of BUILT_IN_VIEWS) {
      expect(view.name.trim().length).toBeGreaterThan(0);
      expect(view.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('mail-broken searches high/critical mail findings', () => {
    const view = getBuiltInView('mail-broken');
    const body = searchBodyForView(view.currentFilters, view);

    expect(body.findingTypePrefix).toBe('mail.');
    expect(body.severities).toEqual(['high', 'critical']);
  });

  it('expiring searches evidence older than 30 days', () => {
    const view = getBuiltInView('expiring');
    const body = searchBodyForView(view.currentFilters, view);

    expect(body.snapshotOlderThanDays).toBe(30);
  });

  it('incomplete-coverage searches unevaluated evidence', () => {
    const view = getBuiltInView('incomplete-coverage');
    const body = searchBodyForView(view.currentFilters, view);

    expect(body.coverage).toBe('incomplete');
  });

  it('keeps operator refinements alongside the active view', () => {
    const refined: CurrentFilters = {
      query: 'acme',
      tags: ['production'],
      severities: ['high'],
      zoneManagement: [],
    };
    const body = searchBodyForView(refined, getBuiltInView('expiring'));

    expect(body.query).toBe('acme');
    expect(body.tags).toEqual(['production']);
    expect(body.severities).toEqual(['high']);
    expect(body.snapshotOlderThanDays).toBe(30);
  });

  it('without a view the body is the plain filter body', () => {
    const body = searchBodyForView(EMPTY_CURRENT_FILTERS, null);

    expect(body).not.toHaveProperty('findingTypePrefix');
    expect(body).not.toHaveProperty('snapshotOlderThanDays');
    expect(body).not.toHaveProperty('coverage');
  });

  it('getBuiltInView rejects unknown ids', () => {
    expect(() => getBuiltInView('nope' as 'mail-broken')).toThrow(/Unknown built-in view/);
  });
});
