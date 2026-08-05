/**
 * DNS Ops Workbench - Shared Request/Response DTOs
 *
 * This file defines shared request/response DTOs used across web and collector.
 * It does not yet cover every live route shape in the repo; some newer web-facing
 * workflows still need first-class contract DTOs to fully eliminate divergence risk.
 */

import type {
  Confidence,
  ResultState,
  Severity,
  SupportedRecordType,
  ZoneManagement,
} from './enums.js';

// =============================================================================
// COLLECTION REQUESTS/RESPONSES
// =============================================================================

/**
 * Request to collect DNS data for a domain
 */
export interface CollectDomainRequest {
  /** Domain name to collect */
  domain: string;

  /** Zone management classification */
  zoneManagement?: ZoneManagement;

  /** Who triggered the collection */
  triggeredBy?: string;

  /** Record types to collect (defaults to phase-1 set) */
  recordTypes?: SupportedRecordType[];

  /** Include mail-specific records (SPF, DKIM, DMARC) */
  includeMailRecords?: boolean;

  /** Explicit DKIM selectors to query */
  dkimSelectors?: string[];

  /** Selectors from managed zone config */
  managedDkimSelectors?: string[];
}

/**
 * Response from domain collection
 */
export interface CollectDomainResponse {
  success: boolean;
  domain: string;
  snapshotId: string;
  observationCount: number;
  resultState: ResultState;
  duration: number;
  error?: string;
}

// =============================================================================
// LOOKUP REQUESTS/RESPONSES
// =============================================================================

/**
 * Request to lookup a domain's latest snapshot
 */
export interface LookupDomainRequest {
  /** Domain name or ID */
  domain: string;

  /** Whether to include full observations */
  includeObservations?: boolean;

  /** Whether to include findings */
  includeFindings?: boolean;
}

/**
 * Request to collect mail-related DNS records for a domain
 */
export interface CollectMailRequest {
  /** Domain name to collect */
  domain: string;

  /** Optional snapshot ID for persisted mode */
  snapshotId?: string;

  /** Preferred mail provider (auto-detected if not provided) */
  preferredProvider?: string;

  /** Explicit DKIM selectors to check */
  explicitSelectors?: string[];

  /** Include SPF, DMARC records (default: true) */
  includeSpfDmarc?: boolean;

  /** Include MTA-STS, TLS-RPT records (default: true) */
  includeMtaSts?: boolean;
}

/**
 * Response for mail collection
 */
export interface CollectMailResponse {
  success: boolean;
  domain: string;
  persisted: boolean;
  observationCount?: number;
  selectorCount?: number;
  result: {
    mx?: Array<{ preference: number; exchange: string }>;
    spf?: string;
    dmarc?: string;
    mxValid: boolean;
    hasNullMx: boolean;
    nullMxPolicy?: string;
    dkim?: Record<string, { status: string; publicKey?: string; selector?: string }>;
    mtaSts?: {
      version: string;
      mx: string;
      mode: string;
      maxAge: number;
    };
    tlsRpt?: {
      rua: string;
    };
  };
  duration: number;
  error?: string;
}

export interface LookupDomainResponse {
  domain: {
    id: string;
    name: string;
    normalizedName: string;
    zoneManagement: ZoneManagement;
  };
  latestSnapshot?: {
    id: string;
    resultState: ResultState;
    createdAt: string;
    observationCount: number;
    findingCount: number;
  };
}

/**
 * Request to lookup a specific snapshot
 */
export interface LookupSnapshotRequest {
  snapshotId: string;
  includeObservations?: boolean;
  includeFindings?: boolean;
  includeSuggestions?: boolean;
}

// =============================================================================
// FINDINGS REQUESTS/RESPONSES
// =============================================================================

/**
 * Request to list findings for a snapshot
 */
export interface ListFindingsRequest {
  snapshotId: string;
  severity?: Severity[];
  confidence?: Confidence[];
  reviewOnly?: boolean;
}

/**
 * Finding summary in list responses
 */
export interface FindingSummary {
  id: string;
  type: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  reviewOnly: boolean;
  createdAt: string;
}

/**
 * Response for findings list
 */
export interface ListFindingsResponse {
  findings: FindingSummary[];
  total: number;
}

// =============================================================================
// REMEDIATION & SHARED REPORT ROUTES (LIVE WEB SURFACE)
// =============================================================================

export type RemediationStatus = 'open' | 'in-progress' | 'resolved' | 'closed';
export type RemediationPriority = 'low' | 'medium' | 'high' | 'critical';
export type SharedReportVisibility = 'private' | 'tenant' | 'shared';
export type SharedReportStatus = 'generating' | 'ready' | 'expired' | 'error';
export type AlertLifecycleStatus = 'pending' | 'sent' | 'suppressed' | 'acknowledged' | 'resolved';

export interface RemediationRequestDto {
  id: string;
  tenantId: string;
  createdBy: string;
  snapshotId?: string | null;
  domain: string;
  contactEmail: string;
  contactName: string;
  contactPhone?: string | null;
  issues: string[];
  priority: RemediationPriority;
  notes?: string | null;
  status: RemediationStatus;
  assignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface CreateRemediationRequest {
  domain: string;
  snapshotId?: string;
  contactEmail: string;
  contactName: string;
  contactPhone?: string;
  issues: string[];
  priority?: RemediationPriority;
  notes?: string;
}

export interface CreateRemediationResponse {
  remediation: RemediationRequestDto;
}

export interface ListRemediationResponse {
  remediation: RemediationRequestDto[];
}

export interface RemediationStatsResponse {
  counts: Record<RemediationStatus, number>;
}

export interface UpdateRemediationRequest {
  status?: RemediationStatus;
  assignedTo?: string;
  notes?: string;
  /** Required when transitioning to resolved/closed; must be fresh and complete. */
  verificationSnapshotId?: string;
}

export interface UpdateRemediationResponse {
  remediation: RemediationRequestDto;
}

export interface SharedReportSummary {
  totalMonitored: number;
  activeAlerts: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface SharedReportAlertSummaryItem {
  title: string;
  severity: Severity;
  status: AlertLifecycleStatus;
  createdAt: string;
}

export interface SharedReportDto {
  id: string;
  tenantId: string;
  createdBy: string;
  title: string;
  visibility: SharedReportVisibility;
  status: SharedReportStatus;
  shareToken?: string | null;
  expiresAt?: string | null;
  summary: SharedReportSummary;
  alertSummary: SharedReportAlertSummaryItem[];
  metadata?: {
    sourceAlertIds?: string[];
    redacted?: boolean;
    generatedAlertCount?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateSharedReportRequest {
  title?: string;
  visibility?: SharedReportVisibility;
  expiresInDays?: number;
}

export interface CreateSharedReportResponse {
  report: SharedReportDto;
  shareUrl?: string;
}

export interface ListSharedReportsResponse {
  reports: SharedReportDto[];
}

export interface SharedReportPublicView {
  id: string;
  title: string;
  visibility: 'shared';
  status: SharedReportStatus;
  expiresAt?: string | null;
  createdAt: string;
  summary: SharedReportSummary;
  alertSummary: SharedReportAlertSummaryItem[];
}

export interface GetSharedReportResponse {
  report: SharedReportPublicView;
}

export interface ExpireSharedReportResponse {
  report: SharedReportDto;
}

// =============================================================================
// ERROR RESPONSES
// =============================================================================

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate a CollectDomainRequest
 */
export function validateCollectDomainRequest(req: unknown): req is CollectDomainRequest {
  if (!req || typeof req !== 'object') return false;
  const r = req as Record<string, unknown>;
  return typeof r.domain === 'string' && r.domain.length > 0;
}

/**
 * Validate a LookupDomainRequest
 */
export function validateLookupDomainRequest(req: unknown): req is LookupDomainRequest {
  if (!req || typeof req !== 'object') return false;
  const r = req as Record<string, unknown>;
  return typeof r.domain === 'string' && r.domain.length > 0;
}

/**
 * Known mail providers for preferredProvider validation
 */
export const KNOWN_MAIL_PROVIDERS = [
  'google',
  'google-workspace',
  'microsoft',
  'microsoft-365',
  'outlook',
  'zoho',
] as const;

export type KnownMailProvider = (typeof KNOWN_MAIL_PROVIDERS)[number];

/**
 * Validation details for a CollectMailRequest
 */
export interface MailValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a CollectMailRequest with full field validation
 */
export function validateCollectMailRequest(req: unknown): req is CollectMailRequest {
  const result = validateCollectMailRequestDetailed(req);
  return result.valid;
}

/**
 * Detailed validation for CollectMailRequest
 *
 * Validates:
 * - domain: required string
 * - preferredProvider: optional, must be a known provider if provided
 * - explicitSelectors: optional array of strings, max 20 items
 */
export function validateCollectMailRequestDetailed(req: unknown): MailValidationResult {
  const errors: string[] = [];

  if (!req || typeof req !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  const r = req as Record<string, unknown>;

  // domain: required string
  if (typeof r.domain !== 'string' || r.domain.length === 0) {
    errors.push('Domain is required and must be a non-empty string');
  }

  // preferredProvider: optional, must be known provider if provided
  if (r.preferredProvider !== undefined && r.preferredProvider !== null) {
    if (typeof r.preferredProvider !== 'string') {
      errors.push('preferredProvider must be a string');
    } else if (!KNOWN_MAIL_PROVIDERS.includes(r.preferredProvider as KnownMailProvider)) {
      errors.push(`preferredProvider must be one of: ${KNOWN_MAIL_PROVIDERS.join(', ')}`);
    }
  }

  // explicitSelectors: optional array of strings, max 20 items
  if (r.explicitSelectors !== undefined && r.explicitSelectors !== null) {
    if (!Array.isArray(r.explicitSelectors)) {
      errors.push('explicitSelectors must be an array');
    } else {
      if (r.explicitSelectors.length > 20) {
        errors.push('explicitSelectors must have at most 20 items');
      }
      for (let i = 0; i < r.explicitSelectors.length; i++) {
        if (typeof r.explicitSelectors[i] !== 'string') {
          errors.push(`explicitSelectors[${i}] must be a string`);
          break; // Report first non-string only
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
