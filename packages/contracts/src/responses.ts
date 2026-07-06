/**
 * Canonical API Response DTOs
 * All route responses MUST use these types for consistency.
 */

import type { Confidence, KnownProvider, RiskPosture, Severity } from './enums.js';
import type {
  FindingSummary,
  RemediationRequestDto,
  SharedReportAlertSummaryItem,
  SharedReportDto,
  SharedReportSummary,
} from './requests.js';

// Re-export types from requests.ts that are used as responses
export type {
  FindingSummary,
  RemediationRequestDto,
  SharedReportAlertSummaryItem,
  SharedReportDto,
  SharedReportSummary,
};

// =============================================================================
// BASE ENTITY TYPES (local definitions to avoid circular deps)
// =============================================================================

/**
 * Finding entity (subset for responses)
 */
export interface Finding {
  id: string;
  snapshotId: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  riskPosture: RiskPosture;
  blastRadius: string;
  reviewOnly: boolean;
  evidence: Array<{
    observationId: string;
    recordSetId?: string;
    description: string;
  }>;
  ruleId: string;
  ruleVersion: string;
  rulesetVersionId?: string | null;
  acknowledgedAt?: Date | null;
  acknowledgedBy?: string | null;
  falsePositive?: boolean | null;
  createdAt: Date;
}

/**
 * Suggestion entity
 */
export interface Suggestion {
  id: string;
  findingId: string;
  title: string;
  description: string;
  action: string;
  riskPosture: RiskPosture;
  blastRadius: string;
  reviewOnly: boolean;
  appliedAt?: Date | null;
  appliedBy?: string | null;
  dismissedAt?: Date | null;
  dismissedBy?: string | null;
  dismissalReason?: string | null;
  createdAt: Date;
}

/**
 * Alert entity
 */
export interface Alert {
  id: string;
  monitoredDomainId: string;
  title: string;
  description: string;
  severity: Severity;
  triggeredByFindingId?: string | null;
  status: 'pending' | 'sent' | 'suppressed' | 'acknowledged' | 'resolved';
  dedupKey?: string | null;
  acknowledgedAt?: Date | null;
  acknowledgedBy?: string | null;
  resolvedAt?: Date | null;
  resolutionNote?: string | null;
  tenantId: string;
  createdAt: Date;
}

/**
 * Domain note entity
 */
export interface DomainNote {
  id: string;
  domainId: string;
  content: string;
  createdBy: string;
  tenantId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Domain tag entity
 */
export interface DomainTag {
  id: string;
  domainId: string;
  tag: string;
  createdBy: string;
  tenantId?: string | null;
  createdAt: Date;
}

/**
 * Monitored domain entity
 */
export interface MonitoredDomain {
  id: string;
  domainId: string;
  schedule: 'hourly' | 'daily' | 'weekly';
  alertChannels: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
  maxAlertsPerDay: number;
  suppressionWindowMinutes: number;
  isActive: boolean;
  lastCheckAt?: Date | null;
  lastAlertAt?: Date | null;
  createdBy: string;
  tenantId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Saved filter entity
 */
export interface SavedFilter {
  id: string;
  name: string;
  description?: string | null;
  criteria: Record<string, unknown>;
  isShared: boolean;
  createdBy: string;
  tenantId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Shadow comparison entity
 */
export interface ShadowComparison {
  id: string;
  snapshotId: string;
  domain: string;
  comparedAt: Date;
  status: 'match' | 'mismatch' | 'partial-match' | 'error';
  comparisons: Array<{
    field: string;
    status: 'match' | 'mismatch' | 'new-only' | 'legacy-only' | 'error';
    newValue?: unknown;
    legacyValue?: unknown;
    error?: string;
  }>;
  metrics: {
    fieldComparisonCount: number;
  };
  summary: {
    totalFields: number;
    matches: number;
    mismatches: number;
    newOnly: number;
    legacyOnly: number;
    error?: string;
  };
  legacyOutput: unknown;
  adjudication?: {
    adjudicatedAt: Date;
    adjudicatedBy: string;
    verdict: 'new-correct' | 'legacy-correct' | 'both-wrong' | 'acceptable-difference';
    notes?: string;
  } | null;
}

// =============================================================================
// FINDINGS RESPONSES
// =============================================================================

/**
 * Base finding summary data
 */
export interface FindingSummaryData {
  totalFindings: number;
  dnsFindings: number;
  mailFindings: number;
  suggestions: number;
}

/**
 * GET /snapshot/:snapshotId/findings
 * Response when findings already exist (cached/idempotent)
 */
export interface FindingsResponse {
  snapshotId: string;
  domain: string;
  rulesetVersion: string;
  rulesetVersionId: string;
  persisted: boolean;
  idempotent: boolean;
  summary: FindingSummaryData;
  findings: Finding[];
  suggestions: Suggestion[];
  categorized: {
    dns: Finding[];
    mail: Finding[];
  };
}

/**
 * GET /snapshot/:snapshotId/findings
 * Response when findings are freshly evaluated
 */
export interface FindingsEvaluatedResponse {
  snapshotId: string;
  domain: string;
  rulesetVersion: string;
  rulesetVersionId: string;
  persisted: boolean;
  evaluated: boolean;
  idempotent: boolean;
  rulesEvaluated: number;
  summary: FindingSummaryData;
  findings: Finding[];
  suggestions: Suggestion[];
  categorized: {
    dns: Finding[];
    mail: Finding[];
  };
}

/**
 * Mail configuration analysis result
 */
export interface MailConfiguration {
  hasMx: boolean;
  hasSpf: boolean;
  hasDmarc: boolean;
  hasDkim: boolean;
  hasMtaSts: boolean;
  hasTlsRpt: boolean;
  securityScore: number;
  issues: string[];
  recommendations: string[];
}

/**
 * Enhanced mail configuration with evidence
 */
export interface EnhancedMailConfiguration extends MailConfiguration {
  dmarcPolicy?: string;
  dmarcSubdomainPolicy?: string;
  dmarcPercent?: string;
  dmarcRua?: string[];
  dmarcRuf?: string[];
  spfRecord?: string;
  dmarcRecord?: string;
  detectedProvider?: string;
  providerConfidence?: string;
  hasBimi?: boolean;
}

/**
 * Formatted DKIM selector for API response
 */
export interface FormattedDkimSelector {
  selector: string;
  domain: string;
  provenance: string;
  confidence: string;
  provider?: string;
  found: boolean;
  keyType?: string;
  keySize?: string;
  isValid?: boolean;
  validationError?: string;
}

/**
 * GET /snapshot/:snapshotId/findings/mail
 * Mail-specific findings with evidence
 */
export interface FindingsMailResponse {
  snapshotId: string;
  domain: string;
  rulesetVersion: string;
  persisted?: boolean;
  summary: {
    totalFindings: number;
    suggestions?: number;
    dkimSelectorsFound: number;
    dkimSelectorsTried: number;
  };
  mailConfig: EnhancedMailConfiguration;
  mailEvidence: unknown | null;
  dkimSelectors: FormattedDkimSelector[];
  findings: Finding[];
  suggestions?: Suggestion[];
}

/**
 * GET /snapshot/:snapshotId/findings/summary
 * Quick severity summary
 */
export interface FindingsSummaryResponse {
  snapshotId: string;
  hasFindings: boolean;
  severityCounts: Record<Severity, number>;
  total: number;
}

/**
 * Backfill result item
 */
export interface BackfillResultItem {
  snapshotId: string;
  domainName: string;
  findingsCount: number;
  suggestionsCount: number;
  status: 'success' | 'error';
  error?: string;
}

/**
 * POST /findings/backfill
 * Backfill findings for snapshots
 */
export interface FindingsBackfillResponse {
  processed: number;
  success: number;
  errors: number;
  totalFindings: number;
  totalSuggestions: number;
  rulesetVersion: string;
  rulesetVersionId: string;
  remainingToBackfill: number;
  results: BackfillResultItem[];
}

/**
 * Backfill dry run response
 */
export interface FindingsBackfillDryRunResponse {
  dryRun: boolean;
  rulesetVersion: string;
  rulesetVersionId: string;
  stats: {
    total: number;
    needsBackfill: number;
  };
  message: string;
}

/**
 * Backfill status response
 */
export interface FindingsBackfillStatusResponse {
  rulesetVersion: string;
  rulesetVersionId: string;
  total: number;
  needsBackfill: number;
  evaluated: number;
  completionPercent: number;
}

/**
 * PATCH /findings/:findingId/acknowledge
 * Acknowledge a finding
 */
export interface FindingAcknowledgeResponse {
  success: boolean;
  finding: Finding;
}

/**
 * GET /findings/:findingId
 * Get a single finding
 */
export interface FindingResponse {
  finding: Finding;
}

/**
 * PATCH /findings/:findingId/false-positive
 * Mark finding as false positive
 */
export interface FindingFalsePositiveResponse {
  success: boolean;
  finding: Finding;
}

/**
 * POST /snapshot/:snapshotId/evaluate
 * Re-evaluate findings
 */
export interface FindingsEvaluateResponse extends FindingsEvaluatedResponse {
  previousFindingsDeleted: number;
}

// =============================================================================
// SNAPSHOT RESPONSES
// =============================================================================

/**
 * Snapshot list item
 */
export interface SnapshotListItem {
  id: string;
  createdAt: Date;
  rulesetVersionId: string | null;
  findingsEvaluated: boolean;
  queryScope: {
    names: string[];
    types: string[];
    vantages: string[];
  };
}

/**
 * GET /snapshots/:domain
 * List snapshots for a domain
 */
export interface SnapshotListResponse {
  domain: string;
  count: number;
  snapshots: SnapshotListItem[];
}

/**
 * GET /snapshots/:domain/:id
 * Get a specific snapshot
 */
export interface SnapshotResponse {
  id: string;
  domainId: string;
  createdAt: Date;
  rulesetVersionId: string | null;
  findingsEvaluated: boolean;
  queryScope: {
    names: string[];
    types: string[];
    vantages: string[];
  };
  metadata: unknown;
}

/**
 * GET /snapshots/:domain/latest
 * Get latest snapshot
 */
export interface SnapshotLatestResponse extends SnapshotListItem {
  domain: string;
}

/**
 * Record change in diff
 */
export interface RecordChange {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  name: string;
  recordType: string;
  previous?: {
    ttl: number;
    values: string[];
  };
  current?: {
    ttl: number;
    values: string[];
  };
}

/**
 * Finding change in diff
 */
export interface FindingChange {
  type: 'added' | 'removed' | 'severity-changed' | 'status-changed' | 'unchanged';
  findingType: string;
  title: string;
  severity?: Severity;
  previousSeverity?: Severity;
}

/**
 * Scope changes in diff
 */
export interface ScopeChanges {
  namesAdded: string[];
  namesRemoved: string[];
  typesAdded: string[];
  typesRemoved: string[];
  vantagesAdded: string[];
  vantagesRemoved: string[];
}

/**
 * Diff comparison result
 */
export interface DiffComparison {
  recordChanges: RecordChange[];
  findingChanges: FindingChange[];
  scopeChanges?: ScopeChanges;
}

/**
 * Diff metadata
 */
export interface DiffMetadata {
  snapshotA: {
    id: string;
    createdAt: Date;
    rulesetVersion: string;
  };
  snapshotB: {
    id: string;
    createdAt: Date;
    rulesetVersion: string;
  };
}

/**
 * Full diff result
 */
export interface DiffResult {
  metadata: DiffMetadata;
  comparison: DiffComparison;
}

/**
 * POST /snapshots/:domain/diff
 * Compare two snapshots
 */
export interface SnapshotDiffResponse {
  domain: string;
  diff: DiffResult;
  findingsEvaluated: {
    snapshotA: boolean;
    snapshotB: boolean;
  };
  warnings?: string[];
  ambiguityWarning?: string;
}

/**
 * POST /snapshots/:domain/compare-latest
 * Compare latest two snapshots
 */
export interface SnapshotCompareLatestResponse {
  diff: DiffResult;
  findingsEvaluated: {
    older: boolean;
    newer: boolean;
  };
  warnings?: string[];
}

// =============================================================================
// DELEGATION RESPONSES
// =============================================================================

/**
 * Name server entry
 */
export interface NameServerEntry {
  name: string;
  source: string;
}

/**
 * Glue record entry
 */
export interface GlueRecordEntry {
  name: string;
  type: string;
  address: string;
}

/**
 * Delegation data
 */
export interface DelegationData {
  domain: string;
  parentZone?: string;
  nameServers: NameServerEntry[];
  glue: GlueRecordEntry[];
  hasDivergence: boolean;
  hasDnssec: boolean;
}

/**
 * GET /snapshot/:snapshotId/delegation
 * Get delegation analysis
 */
export interface DelegationResponse {
  snapshotId: string;
  delegation: DelegationData | null;
  message?: string;
}

/**
 * Delegation issue
 */
export interface DelegationIssue {
  type: string;
  severity: string;
  description: string;
  details: unknown;
}

/**
 * GET /snapshot/:snapshotId/delegation/issues
 * Get delegation issues
 */
export interface DelegationIssuesResponse {
  snapshotId: string;
  domain: string;
  issues: DelegationIssue[];
  issueCount: number;
}

/**
 * DS record entry
 */
export interface DSRecordEntry {
  keyTag: string;
  algorithm: string;
  digestType: string;
  digest: string;
  source: string;
  ttl: number;
}

/**
 * DNSKEY record entry
 */
export interface DNSKEYRecordEntry {
  flags: number;
  isKSK: boolean;
  isZSK: boolean;
  protocol: string;
  algorithm: string;
  publicKey: string;
  source: string;
  ttl: number;
}

/**
 * DNSSEC chain summary
 */
export interface DNSSECChainSummary {
  dsCount: number;
  dnskeyCount: number;
  kskCount: number;
  zskCount: number;
  signedTypeCount: number;
}

/**
 * DNSSEC data
 */
export interface DNSSECData {
  status: 'signed' | 'partially-signed' | 'unsigned' | 'broken';
  statusMessage: string;
  hasDelegationSigner: boolean;
  hasDnskey: boolean;
  hasKsk: boolean;
  hasZsk: boolean;
  hasRrsig: boolean;
  signedRecordTypes: string[];
  dsRecords: DSRecordEntry[];
  dnskeyRecords: DNSKEYRecordEntry[];
  chainSummary: DNSSECChainSummary;
}

/**
 * GET /snapshot/:snapshotId/delegation/dnssec
 * Get DNSSEC evidence
 */
export interface DelegationDnssecResponse {
  snapshotId: string;
  domain: string;
  dnssec: DNSSECData;
}

/**
 * Vantage evidence entry
 */
export interface VantageEvidenceEntry {
  vantageType: string;
  vantageIdentifier: string;
  status: string;
  responseTime?: number;
  nsRecords: Array<{ name: string; ttl: number }>;
  nsCount: number;
  rawResponse: {
    answerCount: number;
    authorityCount: number;
    additionalCount: number;
  };
}

/**
 * Nameserver evidence entry
 */
export interface NameserverEvidenceEntry {
  hostname: string;
  ipv4?: string;
  ipv6?: string;
  isResponsive: boolean;
  responseDetails?: Array<{
    queryName: string;
    queryType: string;
    status: string;
    responseTime: number;
  }>;
}

/**
 * Glue record evidence
 */
export interface GlueRecordEvidence {
  hostname: string;
  type: string;
  address: string;
  ttl: number;
  source: string;
}

/**
 * Delegation evidence summary
 */
export interface DelegationEvidenceSummary {
  totalVantages: number;
  successfulVantages: number;
  consistencyScore: number;
  isConsistent: boolean;
  uniqueNsSetCount: number;
  nameserverCount: number;
  responsiveNameservers: number;
  glueRecordCount: number;
}

/**
 * Delegation evidence data
 */
export interface DelegationEvidenceData {
  domain: string;
  vantageEvidence: VantageEvidenceEntry[];
  nameserverEvidence: NameserverEvidenceEntry[];
  glueRecords: GlueRecordEvidence[];
  summary: DelegationEvidenceSummary;
}

/**
 * GET /snapshot/:snapshotId/delegation/evidence
 * Get detailed delegation evidence
 */
export interface DelegationEvidenceResponse {
  snapshotId: string;
  evidence: DelegationEvidenceData;
}

// =============================================================================
// ALERT RESPONSES
// =============================================================================

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * GET /alerts
 * List alerts
 */
export interface AlertListResponse {
  alerts: Alert[];
  pagination: PaginationMeta;
}

/**
 * GET /alerts/:id
 * Get single alert
 */
export interface AlertResponse {
  alert: Alert;
}

/**
 * POST /alerts/:id/acknowledge
 * Acknowledge alert
 */
export interface AlertAcknowledgeResponse {
  alert: Alert;
}

/**
 * POST /alerts/:id/resolve
 * Resolve alert
 */
export interface AlertResolveResponse {
  alert: Alert;
}

/**
 * POST /alerts/:id/suppress
 * Suppress alert
 */
export interface AlertSuppressResponse {
  alert: Alert;
}

/**
 * GET /alerts/reports
 * List shared reports
 */
export interface SharedReportListResponse {
  reports: SharedReportDto[];
}

/**
 * GET /alerts/reports/shared/:token
 * Get shared report by token
 */
export interface SharedReportResponse {
  report: {
    id: string;
    title: string;
    visibility: 'shared';
    status: 'generating' | 'ready' | 'expired' | 'error';
    expiresAt?: string | null;
    createdAt: string;
    summary: SharedReportSummary;
    alertSummary: SharedReportAlertSummaryItem[];
  };
}

/**
 * POST /alerts/reports
 * Create shared report
 */
export interface SharedReportCreateResponse {
  report: SharedReportDto;
  shareUrl?: string;
}

/**
 * POST /alerts/reports/:id/expire
 * Expire shared report
 */
export interface SharedReportExpireResponse {
  report: SharedReportDto;
}

// =============================================================================
// PORTFOLIO RESPONSES
// =============================================================================

/**
 * Domain with findings
 */
export interface DomainWithFindings {
  id: string;
  name: string;
  normalizedName: string;
  zoneManagement: string;
  tenantId?: string | null;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
  findings: Finding[];
  findingsEvaluated: boolean;
  latestSnapshot: {
    id: string;
    createdAt: Date;
    resultState: string;
    rulesetVersionId: string | null;
  } | null;
}

/**
 * POST /portfolio/search
 * Search domains
 */
export interface DomainSearchResponse {
  domains: DomainWithFindings[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * GET /portfolio/domains/by-name/:domain
 * Get domain by name
 */
export interface DomainResponse {
  domain: {
    id: string;
    name: string;
    normalizedName: string;
    zoneManagement: string;
  };
}

/**
 * GET /portfolio/domains/:domainId/notes
 * List domain notes
 */
export interface DomainNoteListResponse {
  notes: DomainNote[];
}

/**
 * POST /portfolio/domains/:domainId/notes
 * Create domain note
 */
export interface DomainNoteCreateResponse {
  note: DomainNote;
}

/**
 * PUT /portfolio/notes/:noteId
 * Update domain note
 */
export interface DomainNoteUpdateResponse {
  note: DomainNote;
}

/**
 * DELETE /portfolio/notes/:noteId
 * Delete domain note
 */
export interface DomainNoteDeleteResponse {
  success: boolean;
}

/**
 * GET /portfolio/domains/:domainId/tags
 * List domain tags
 */
export interface DomainTagListResponse {
  tags: DomainTag[];
}

/**
 * POST /portfolio/domains/:domainId/tags
 * Create domain tag
 */
export interface DomainTagCreateResponse {
  tag: DomainTag;
}

/**
 * DELETE /portfolio/domains/:domainId/tags/:tag
 * Delete domain tag
 */
export interface DomainTagDeleteResponse {
  success: boolean;
}

/**
 * GET /portfolio/tags
 * List all tenant tags
 */
export interface TenantTagListResponse {
  tags: DomainTag[];
}

/**
 * Saved filter with permission
 */
export interface SavedFilterWithPermission extends SavedFilter {
  canManage: boolean;
}

/**
 * GET /portfolio/filters
 * List saved filters
 */
export interface SavedFilterListResponse {
  filters: SavedFilterWithPermission[];
}

/**
 * POST /portfolio/filters
 * Create saved filter
 */
export interface SavedFilterCreateResponse {
  filter: SavedFilter;
}

/**
 * PUT /portfolio/filters/:filterId
 * Update saved filter
 */
export interface SavedFilterUpdateResponse {
  filter: SavedFilter;
}

/**
 * DELETE /portfolio/filters/:filterId
 * Delete saved filter
 */
export interface SavedFilterDeleteResponse {
  success: boolean;
}

/**
 * Template override data (subset)
 */
export interface TemplateOverrideData {
  id: string;
  providerKey: string;
  templateKey: string;
  overrideData: Record<string, unknown>;
  appliesToDomains: string[] | null;
  createdBy: string;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GET /portfolio/templates/overrides
 * List template overrides
 */
export interface TemplateOverrideListResponse {
  overrides: TemplateOverrideData[];
}

/**
 * POST /portfolio/templates/overrides
 * Create template override
 */
export interface TemplateOverrideCreateResponse {
  override: TemplateOverrideData;
}

/**
 * PUT /portfolio/templates/overrides/:overrideId
 * Update template override
 */
export interface TemplateOverrideUpdateResponse {
  override: TemplateOverrideData;
}

/**
 * DELETE /portfolio/templates/overrides/:overrideId
 * Delete template override
 */
export interface TemplateOverrideDeleteResponse {
  success: boolean;
}

/**
 * GET /portfolio/audit
 * List audit events
 */
export interface AuditEventListResponse {
  events: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    previousValue?: unknown;
    newValue?: unknown;
    actorId: string;
    actorEmail?: string | null;
    tenantId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: Date;
  }>;
}

// =============================================================================
// MONITORING RESPONSES
// =============================================================================

/**
 * Monitored domain with name
 */
export interface MonitoredDomainWithName extends MonitoredDomain {
  domainName: string;
}

/**
 * GET /monitoring/domains
 * List monitored domains
 */
export interface MonitoringDomainListResponse {
  monitoredDomains: MonitoredDomainWithName[];
}

/**
 * GET /monitoring/domains/:id
 * Get monitored domain
 */
export interface MonitoringDomainResponse {
  monitoredDomain: MonitoredDomainWithName;
}

/**
 * POST /monitoring/domains
 * Create monitored domain
 */
export interface MonitoringDomainCreateResponse {
  monitoredDomain: MonitoredDomain;
}

/**
 * PUT /monitoring/domains/:id
 * Update monitored domain
 */
export interface MonitoringDomainUpdateResponse {
  monitoredDomain: MonitoredDomain | null;
}

/**
 * DELETE /monitoring/domains/:id
 * Delete monitored domain
 */
export interface MonitoringDomainDeleteResponse {
  success: boolean;
  deletedId: string;
}

/**
 * POST /monitoring/domains/:id/toggle
 * Toggle monitored domain
 */
export interface MonitoringDomainToggleResponse {
  monitoredDomain: MonitoredDomain | null;
}

// =============================================================================
// SUGGESTIONS RESPONSES
// =============================================================================

/**
 * Error response with code
 */
export interface SuggestionErrorResponse {
  error: string;
  code: string;
  suggestionId: string;
  appliedAt?: Date;
  appliedBy?: string;
  dismissedAt?: Date;
  reviewOnly?: boolean;
  hint?: string;
}

/**
 * PATCH /suggestions/:suggestionId/apply
 * Apply suggestion
 */
export interface SuggestionApplyResponse {
  success: boolean;
  suggestion: Suggestion;
  confirmed?: boolean;
}

/**
 * PATCH /suggestions/:suggestionId/dismiss
 * Dismiss suggestion
 */
export interface SuggestionDismissResponse {
  success: boolean;
  suggestion: Suggestion;
}

/**
 * GET /suggestions/:suggestionId
 * Get suggestion
 */
export interface SuggestionResponse {
  suggestion: Suggestion;
}

// =============================================================================
// REMEDIATION RESPONSES (re-exported from requests.ts for convenience)
// =============================================================================

// Remediation / shared-report value unions are declared ONCE in requests.ts and
// re-exported from @dns-ops/contracts via index.ts. Re-exported here so consumers
// importing response DTOs can pull them from the same module without a second,
// divergent declaration.
export type {
  RemediationStatus,
  RemediationPriority,
  SharedReportStatus,
  SharedReportVisibility,
} from './requests.js';

/**
 * GET /remediation
 * List remediation requests
 */
export interface RemediationListResponse {
  remediation: RemediationRequestDto[];
}

/**
 * POST /remediation
 * Create remediation request
 */
export interface RemediationCreateResponse {
  remediation: RemediationRequestDto;
}

/**
 * PATCH /remediation/:id
 * Update remediation request
 */
export interface RemediationUpdateResponse {
  remediation: RemediationRequestDto;
}

/**
 * GET /remediation/stats
 * Remediation statistics
 */
export type RemediationStatsResponse = import('./requests.js').RemediationStatsResponse;

/**
 * GET /remediation/by-id/:id
 * Get remediation by ID
 */
export interface RemediationByIdResponse {
  remediation: RemediationRequestDto;
}

/**
 * GET /remediation/domain/:domain
 * Get remediation by domain
 */
export interface RemediationByDomainResponse {
  remediation: RemediationRequestDto[];
}

// =============================================================================
// HEALTH/API RESPONSES
// =============================================================================

/**
 * GET /api/health
 * Basic health check
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  timestamp: string;
}

/**
 * Circuit breaker info
 */
export interface CircuitBreakerInfo {
  state: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  lastFailureAt: string | null;
}

/**
 * GET /api/health/detailed
 * Detailed health check
 */
export interface HealthDetailedResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  uptime: {
    startedAt: string;
    seconds: number;
    formatted: string;
  };
  timestamp: string;
  checks: {
    database: {
      status: 'connected' | 'error';
      latencyMs: number | null;
    };
    circuitBreaker: CircuitBreakerInfo;
  };
}

// =============================================================================
// SHADOW COMPARISON RESPONSES
// =============================================================================

/**
 * Field comparison result
 */
export interface FieldComparisonResult {
  field: string;
  status: 'match' | 'mismatch' | 'new-only' | 'legacy-only' | 'error';
  newValue?: unknown;
  legacyValue?: unknown;
  error?: string;
}

/**
 * POST /shadow-comparison/compare
 * Compare findings with legacy output
 */
export interface ShadowComparisonResponse {
  comparison: ShadowComparison;
  summary: {
    totalFields: number;
    matches: number;
    mismatches: number;
    newOnly: number;
    legacyOnly: number;
    error?: string;
  };
  status: 'match' | 'mismatch' | 'partial-match' | 'error';
  metrics: {
    fieldComparisonCount: number;
  };
  persisted: boolean;
}

/**
 * Shadow comparison stats
 */
export interface ShadowComparisonStats {
  total: number;
  match: number;
  mismatch: number;
  partialMatch: number;
  error: number;
  matchRate: number;
  averageFieldsCompared: number;
}

/**
 * GET /shadow-comparison/stats
 * Get shadow comparison statistics
 */
export interface ShadowComparisonStatsResponse {
  stats: ShadowComparisonStats;
  pendingAdjudication: number;
  recentMismatches: Array<{
    id: string;
    domain: string;
    status: string;
    summary: unknown;
    comparedAt: Date;
  }>;
  durable: boolean;
}

/**
 * GET /shadow-comparison/domain/:domain
 * Get comparisons for domain
 */
export interface ShadowComparisonDomainResponse {
  domain: string;
  count: number;
  comparisons: Array<{
    id: string;
    status: string;
    summary: unknown;
    comparedAt: Date;
    adjudication?: unknown;
  }>;
}

/**
 * Legacy log entry
 */
export interface LegacyLogEntry {
  id: string;
  toolType: string;
  domain: string;
  requestedAt: Date;
  responseStatus: string;
  outputSummary?: unknown;
}

/**
 * GET /shadow-comparison/legacy-logs
 * Get legacy access logs
 */
export interface LegacyLogsResponse {
  logs: LegacyLogEntry[];
  stats: {
    total: number;
    byTool: Record<string, number>;
    byStatus: Record<string, number>;
  };
}

/**
 * Provider baseline data
 */
export interface ProviderBaselineData {
  providerKey: string;
  providerName: string;
  baseline: Record<string, unknown>;
  dkimSelectors: string[];
  mxPatterns: string[];
  spfIncludes: string[];
  version: string;
  overridesApplied: string[];
}

/**
 * GET /shadow-comparison/provider-baselines
 * Get provider baselines
 */
export interface ProviderBaselinesResponse {
  baselines: ProviderBaselineData[];
  overridesActive: boolean;
}

/**
 * GET /shadow-comparison/provider-baselines/:providerKey
 * Get single provider baseline
 */
export interface ProviderBaselineResponse {
  baseline: ProviderBaselineData;
  overridesApplied: string[];
}

/**
 * Mismatch report data
 */
export interface MismatchReportData {
  id: string;
  domain: string;
  periodStart: Date;
  periodEnd: Date;
  totalComparisons: number;
  matchCount: number;
  mismatchCount: number;
  matchRate: number;
  cutoverThreshold: number;
  cutoverReady: boolean;
  mismatchBreakdown: Record<string, number>;
  cutoverNotes?: string;
  generatedAt: Date;
  generatedBy: string;
}

/**
 * POST /shadow-comparison/mismatch-report
 * Generate mismatch report
 */
export interface MismatchReportResponse {
  report: MismatchReportData;
  message: string;
}

/**
 * GET /shadow-comparison/mismatch-reports/:domain
 * Get mismatch reports for domain
 */
export interface MismatchReportsListResponse {
  domain: string;
  reports: Array<{
    id: string;
    periodStart: Date;
    periodEnd: Date;
    matchRate: number;
    cutoverReady: boolean;
    generatedAt: Date;
  }>;
  latestReport: {
    matchRate: number;
    cutoverReady: boolean;
    totalComparisons: number;
    mismatchBreakdown: Record<string, number>;
    cutoverNotes?: string;
  } | null;
}

/**
 * POST /shadow-comparison/seed-baselines
 * Seed provider baselines
 */
export interface SeedBaselinesResponse {
  message: string;
  count: number;
  providers: string[];
}

/**
 * GET /shadow-comparison/:id
 * Get comparison by ID
 */
export interface ShadowComparisonByIdResponse {
  comparison: ShadowComparison;
}

/**
 * POST /shadow-comparison/:id/adjudicate
 * Adjudicate comparison
 */
export interface ShadowComparisonAdjudicateResponse {
  message: string;
  comparison: ShadowComparison;
}

// =============================================================================
// PROVIDER TEMPLATE RESPONSES
// =============================================================================

/**
 * Provider template summary
 */
export interface ProviderTemplateSummary {
  id: string;
  provider: KnownProvider;
  name: string;
  description: string;
  version: string;
  knownSelectors: string[];
  expected: {
    mx: number;
    spf: { required: boolean } | boolean;
    dmarc: { required: boolean } | boolean;
    dkim: { required: boolean } | boolean;
  };
}

/**
 * GET /mail/providers
 * List provider templates
 */
export interface ProviderTemplateListResponse {
  providers: ProviderTemplateSummary[];
}

/**
 * Provider template details
 */
export interface ProviderTemplateDetails {
  id: string;
  provider: KnownProvider;
  name: string;
  description: string;
  version: string;
  knownSelectors: string[];
  expected: {
    mx?: string[];
    spf?: { required: boolean; record?: string };
    dmarc?: { required: boolean; policy?: string };
    dkim?: { required: boolean; selectors?: string[] };
  };
  detection: {
    mxPatterns: string[];
    spfPatterns: string[];
  };
}

/**
 * GET /mail/providers/:provider
 * Get provider template details
 */
export interface ProviderTemplateResponse {
  template: ProviderTemplateDetails;
}

/**
 * Provider comparison match/mismatch/missing
 */
export interface ProviderComparisonResult {
  overallMatch: boolean;
  matches: string[];
  mismatches: Array<{
    field: string;
    expected: unknown;
    actual: unknown;
  }>;
  missing: string[];
}

/**
 * Actual config from DNS
 */
export interface ActualMailConfig {
  mx?: string[];
  spf?: string;
  dmarc?: string;
  dkimSelectors?: string[];
}

/**
 * POST /mail/compare-to-provider
 * Compare domain to provider template
 */
export interface CompareToProviderResponse {
  domain: string;
  snapshotId: string;
  provider: KnownProvider;
  providerName: string;
  detectionConfidence?: 'high' | 'medium' | 'low';
  comparison: ProviderComparisonResult;
  actual: ActualMailConfig;
  expected: {
    mx?: string[];
    spf?: { required: boolean; record?: string };
    dmarc?: { required: boolean; policy?: string };
    dkim?: { required: boolean; selectors?: string[] };
  };
}

/**
 * POST /mail/detect-provider
 * Detect provider from DNS records
 */
export interface DetectProviderResponse {
  detection: {
    provider: KnownProvider;
    confidence: 'high' | 'medium' | 'low';
    evidence: {
      mxMatch?: boolean;
      spfMatch?: boolean;
      matchingPatterns?: string[];
    };
  };
  template: {
    name: string;
    knownSelectors: string[];
  } | null;
}

/**
 * POST /mail/providers/:provider/selectors
 * Add custom selector
 */
export interface AddSelectorResponse {
  message: string;
  provider: KnownProvider;
  knownSelectors: string[];
}

// =============================================================================
// RULESET VERSION RESPONSES
// =============================================================================

/**
 * Ruleset version data
 */
export interface RulesetVersionData {
  id: string;
  version: string;
  name: string;
  description: string | null;
  rules: unknown[];
  active: boolean;
  createdAt: Date;
  createdBy: string;
}

/**
 * GET /ruleset-versions
 * List ruleset versions
 */
export interface RulesetVersionListResponse {
  versions: RulesetVersionData[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * GET /ruleset-versions/active
 * Get active ruleset version
 */
export type RulesetVersionActiveResponse = RulesetVersionData;

/**
 * GET /ruleset-versions/latest
 * Get latest ruleset version
 */
export type RulesetVersionLatestResponse = RulesetVersionData;

/**
 * GET /ruleset-versions/by-version/:version
 * Get ruleset version by version string
 */
export type RulesetVersionByVersionResponse = RulesetVersionData;

/**
 * GET /ruleset-versions/:id
 * Get ruleset version by ID
 */
export type RulesetVersionByIdResponse = RulesetVersionData;

/**
 * POST /ruleset-versions/:id/activate
 * Activate ruleset version
 */
export interface RulesetVersionActivateResponse {
  success: boolean;
  message: string;
  rulesetVersion: RulesetVersionData;
}

// =============================================================================
// SIMULATION RESPONSES
// =============================================================================

/**
 * Proposed DNS change
 */
export interface ProposedChange {
  type: string;
  name: string;
  recordType: string;
  action: 'add' | 'remove' | 'modify';
  currentValue?: string;
  proposedValue: string;
  rationale: string;
}

/**
 * Finding prediction
 */
export interface FindingPrediction {
  type: string;
  title: string;
  severity: Severity;
  predictedResolution: 'resolved' | 'improved' | 'unchanged' | 'worsened';
  confidence: Confidence;
}

/**
 * POST /simulate
 * Run simulation
 */
export interface SimulationResponse {
  snapshotId: string;
  domainName: string;
  proposedChanges: ProposedChange[];
  predictedFindings: FindingPrediction[];
  summary: {
    totalChanges: number;
    predictedResolutions: number;
    riskLevel: RiskPosture;
  };
}

/**
 * Actionable finding type
 */
export interface ActionableFindingType {
  type: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

/**
 * GET /simulate/actionable-types
 * List actionable finding types
 */
export interface ActionableTypesResponse {
  actionableTypes: ActionableFindingType[];
}

// =============================================================================
// FLEET REPORT RESPONSES
// =============================================================================

/**
 * POST /fleet-report/run
 * Run fleet report
 */
export interface FleetReportRunResponse {
  success: boolean;
  reportId?: string;
  domainCount?: number;
  results?: Array<{
    domain: string;
    status: 'success' | 'error';
    findings?: number;
    error?: string;
  }>;
  error?: string;
}

/**
 * POST /fleet-report/import-csv
 * Import domains from CSV
 */
export interface FleetReportImportResponse {
  success: boolean;
  imported: number;
  errors: number;
  domains: string[];
  errorDetails?: string[];
}

// =============================================================================
// MAIL COLLECTION RESPONSES
// =============================================================================

/**
 * POST /mail/collect/mail
 * Collect mail records
 */
export interface MailCollectResponse {
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
    dkim?: Record<
      string,
      {
        status: string;
        publicKey?: string;
        selector?: string;
      }
    >;
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

// =============================================================================
// OBSERVATION & RECORDSET RESPONSES
// =============================================================================

/**
 * Observation record
 */
export interface ObservationRecord {
  id: string;
  snapshotId: string;
  queryName: string;
  queryType: string;
  vantageType: string;
  vantageIdentifier?: string;
  status: string;
  queriedAt: Date;
  responseTimeMs?: number;
  responseCode?: number;
  flags?: Record<string, boolean>;
  answerSection?: Array<{
    name: string;
    type: string;
    ttl: number;
    data: string;
    priority?: number;
  }>;
  authoritySection?: Array<{
    name: string;
    type: string;
    ttl: number;
    data: string;
  }>;
  additionalSection?: Array<{
    name: string;
    type: string;
    ttl: number;
    data: string;
  }>;
  errorMessage?: string;
  errorDetails?: unknown;
  rawResponse?: string;
}

/**
 * GET /snapshot/:snapshotId/observations
 * Get observations for snapshot
 */
export type ObservationsResponse = ObservationRecord[];

/**
 * Record set entry
 */
export interface RecordSetEntry {
  id: string;
  snapshotId: string;
  name: string;
  type: string;
  ttl?: number;
  values: string[];
  sourceObservationIds: string[];
  sourceVantages: string[];
  isConsistent: boolean;
  consolidationNotes?: string;
  createdAt: Date;
}

/**
 * GET /snapshot/:snapshotId/recordsets
 * Get recordsets for snapshot
 */
export type RecordSetsResponse = RecordSetEntry[];

// =============================================================================
// DOMAIN LATEST RESPONSE
// =============================================================================

/**
 * GET /domain/:domain/latest
 * Get latest snapshot for domain
 */
export interface DomainLatestSnapshotResponse {
  id: string;
  domainId: string;
  domainName: string;
  resultState: string;
  queriedNames: string[];
  queriedTypes: string[];
  vantages: string[];
  zoneManagement: string;
  rulesetVersionId: string | null;
  triggeredBy: string;
  collectionDurationMs?: number;
  errorMessage?: string;
  metadata?: unknown;
  createdAt: Date;
}

// =============================================================================
// COLLECT DOMAIN RESPONSE (re-exported from requests.ts)
// =============================================================================

/**
 * POST /collect/domain
 * Collect domain DNS data
 */
export type CollectDomainResponse = import('./requests.js').CollectDomainResponse;
