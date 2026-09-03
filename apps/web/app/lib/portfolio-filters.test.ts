/**
 * Portfolio Filter Criteria Tests - Issue #60
 *
 * Round-trip coverage for the expirationWithinDays criterion:
 * current UI state -> saved criteria -> loaded UI state -> search request body.
 */

import { describe, expect, it } from 'vitest';

import {
  assessSavedCriteriaCompatibility,
  type CurrentFilters,
  currentFiltersToSavedCriteria,
  currentFiltersToSearchBody,
  EMPTY_CURRENT_FILTERS,
  hasActiveFilters,
  savedCriteriaToCurrentFilters,
} from './portfolio-filters.js';

describe('portfolio-filters expirationWithinDays round-trip', () => {
  it('round-trips a 90-day expiry window through saved criteria and back', () => {
    const current: CurrentFilters = {
      ...EMPTY_CURRENT_FILTERS,
      expirationWithinDays: 90,
    };

    const criteria = currentFiltersToSavedCriteria(current);
    expect(criteria.expirationWithinDays).toBe(90);

    const loaded = savedCriteriaToCurrentFilters(criteria);
    expect(loaded.expirationWithinDays).toBe(90);
    expect(loaded).toEqual(current);

    const body = currentFiltersToSearchBody(loaded) as { expirationWithinDays?: number };
    expect(body.expirationWithinDays).toBe(90);
  });

  it('round-trips 7 and 30 day windows', () => {
    for (const window of [7, 30] as const) {
      const current: CurrentFilters = { ...EMPTY_CURRENT_FILTERS, expirationWithinDays: window };
      const criteria = currentFiltersToSavedCriteria(current);
      const loaded = savedCriteriaToCurrentFilters(criteria);
      const body = currentFiltersToSearchBody(loaded) as { expirationWithinDays?: number };
      expect(loaded.expirationWithinDays).toBe(window);
      expect(body.expirationWithinDays).toBe(window);
    }
  });

  it('omits expirationWithinDays from saved criteria and search body when unset', () => {
    const current = EMPTY_CURRENT_FILTERS;

    const criteria = currentFiltersToSavedCriteria(current);
    expect(criteria.expirationWithinDays).toBeUndefined();

    const body = currentFiltersToSearchBody(current);
    expect('expirationWithinDays' in body).toBe(false);
  });

  it('counts an expiry window as an active filter', () => {
    expect(hasActiveFilters({ ...EMPTY_CURRENT_FILTERS, expirationWithinDays: 90 })).toBe(true);
    expect(hasActiveFilters(EMPTY_CURRENT_FILTERS)).toBe(false);
  });

  it('combines the expiry window with other criteria without losing either', () => {
    const current: CurrentFilters = {
      query: 'example',
      tags: ['production'],
      severities: ['high'],
      zoneManagement: ['managed'],
      expirationWithinDays: 30,
    };

    const criteria = currentFiltersToSavedCriteria(current);
    expect(criteria).toEqual({
      domainPatterns: ['example'],
      tags: ['production'],
      findings: { severities: ['high'] },
      zoneManagement: ['managed'],
      expirationWithinDays: 30,
    });

    const loaded = savedCriteriaToCurrentFilters(criteria);
    expect(loaded).toEqual(current);
  });

  it('marks persisted expiry values other than 7/30/90 as incompatible', () => {
    for (const invalid of [45, 0, -7, 365]) {
      const compatibility = assessSavedCriteriaCompatibility({
        expirationWithinDays: invalid as 7 | 30 | 90,
      });
      expect(compatibility.supported).toBe(false);
      expect(compatibility.reasons.join(' ')).toMatch(/expiry/i);
    }
  });

  it('accepts persisted expiry criteria of exactly 7, 30, or 90', () => {
    for (const valid of [7, 30, 90]) {
      expect(
        assessSavedCriteriaCompatibility({ expirationWithinDays: valid as 7 | 30 | 90 }).supported
      ).toBe(true);
    }
  });

  it('drops invalid persisted expiry values when loading into current filters', () => {
    const loaded = savedCriteriaToCurrentFilters({
      expirationWithinDays: 45 as 7 | 30 | 90,
    });
    expect(loaded.expirationWithinDays).toBeNull();
  });

  it('drops non-numeric persisted expiry values when loading into current filters', () => {
    const loaded = savedCriteriaToCurrentFilters({
      expirationWithinDays: '90' as unknown as 7 | 30 | 90,
    });
    expect(loaded.expirationWithinDays).toBeNull();
  });
});
