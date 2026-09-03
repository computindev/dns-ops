export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ZoneManagement = 'managed' | 'unmanaged' | 'unknown';
export type ExpirationWindow = 7 | 30 | 90;

export const EXPIRATION_WINDOWS: readonly ExpirationWindow[] = [7, 30, 90];

function normalizeExpirationWindow(value: unknown): ExpirationWindow | null {
  return EXPIRATION_WINDOWS.includes(value as ExpirationWindow)
    ? (value as ExpirationWindow)
    : null;
}

export interface FilterCriteria {
  domainPatterns?: string[];
  zoneManagement?: ZoneManagement[];
  findings?: {
    types?: string[];
    severities?: Severity[];
    minConfidence?: 'certain' | 'high' | 'medium' | 'low' | 'heuristic';
  };
  tags?: string[];
  lastSnapshotWithin?: number;
  expirationWithinDays?: ExpirationWindow;
}

export interface CurrentFilters {
  query: string;
  tags: string[];
  severities: Severity[];
  zoneManagement: ZoneManagement[];
  expirationWithinDays?: ExpirationWindow | null;
}

export interface SavedFilterCriteriaCompatibility {
  supported: boolean;
  reasons: string[];
}

export const EMPTY_CURRENT_FILTERS: CurrentFilters = {
  query: '',
  tags: [],
  severities: [],
  zoneManagement: [],
  expirationWithinDays: null,
};

export function normalizeCurrentFilters(filters: CurrentFilters): CurrentFilters {
  return {
    query: filters.query.trim(),
    tags: dedupe(filters.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
    severities: dedupe(filters.severities),
    zoneManagement: dedupe(filters.zoneManagement),
    expirationWithinDays: normalizeExpirationWindow(filters.expirationWithinDays),
  };
}

export function hasActiveFilters(filters: CurrentFilters): boolean {
  const normalized = normalizeCurrentFilters(filters);
  return (
    normalized.query.length > 0 ||
    normalized.tags.length > 0 ||
    normalized.severities.length > 0 ||
    normalized.zoneManagement.length > 0 ||
    normalized.expirationWithinDays !== null
  );
}

export function currentFiltersToSavedCriteria(filters: CurrentFilters): FilterCriteria {
  const normalized = normalizeCurrentFilters(filters);
  const criteria: FilterCriteria = {};

  if (normalized.query) {
    criteria.domainPatterns = [normalized.query];
  }
  if (normalized.tags.length > 0) {
    criteria.tags = normalized.tags;
  }
  if (normalized.severities.length > 0) {
    criteria.findings = { severities: normalized.severities };
  }
  if (normalized.zoneManagement.length > 0) {
    criteria.zoneManagement = normalized.zoneManagement;
  }
  if (normalized.expirationWithinDays !== null) {
    criteria.expirationWithinDays = normalized.expirationWithinDays;
  }

  return criteria;
}

export function currentFiltersToSearchBody(filters: CurrentFilters): Record<string, unknown> {
  const normalized = normalizeCurrentFilters(filters);
  return {
    ...(normalized.query ? { query: normalized.query } : {}),
    ...(normalized.tags.length > 0 ? { tags: normalized.tags } : {}),
    ...(normalized.severities.length > 0 ? { severities: normalized.severities } : {}),
    ...(normalized.zoneManagement.length > 0 ? { zoneManagement: normalized.zoneManagement } : {}),
    ...(normalized.expirationWithinDays !== null
      ? { expirationWithinDays: normalized.expirationWithinDays }
      : {}),
    limit: 20,
    offset: 0,
  };
}

export function assessSavedCriteriaCompatibility(
  criteria: FilterCriteria
): SavedFilterCriteriaCompatibility {
  const reasons: string[] = [];

  if (criteria.domainPatterns && criteria.domainPatterns.length > 1) {
    reasons.push('multiple domain patterns');
  }
  if (criteria.findings?.types && criteria.findings.types.length > 0) {
    reasons.push('finding types');
  }
  if (criteria.findings?.minConfidence) {
    reasons.push('minimum confidence');
  }
  if (criteria.lastSnapshotWithin) {
    reasons.push('snapshot recency');
  }
  if (
    criteria.expirationWithinDays !== undefined &&
    !normalizeExpirationWindow(criteria.expirationWithinDays)
  ) {
    reasons.push('unsupported expiry window');
  }

  return {
    supported: reasons.length === 0,
    reasons,
  };
}

export function savedCriteriaToCurrentFilters(criteria: FilterCriteria): CurrentFilters {
  return normalizeCurrentFilters({
    query: criteria.domainPatterns?.length === 1 ? criteria.domainPatterns[0] : '',
    tags: criteria.tags || [],
    severities: criteria.findings?.severities || [],
    zoneManagement: criteria.zoneManagement || [],
    expirationWithinDays: normalizeExpirationWindow(criteria.expirationWithinDays),
  });
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}
