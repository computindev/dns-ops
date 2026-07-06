/**
 * DNS Ops Workbench - Database Schema
 *
 * Core entities for the persistence layer:
 * - Domain: DNS domains being monitored
 * - Snapshot: A point-in-time collection of DNS data
 * - Observation: Raw DNS query results (immutable)
 * - RecordSet: Normalized DNS records
 * - Finding: Analysis results from rules engine
 * - Suggestion: Recommended actions
 * - RulesetVersion: Version tracking for rules
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Enums matching the contracts package
export const resultStateEnum = pgEnum('result_state', ['complete', 'partial', 'failed']);

export const severityEnum = pgEnum('severity', ['critical', 'high', 'medium', 'low', 'info']);

export const confidenceEnum = pgEnum('confidence', [
  'certain',
  'high',
  'medium',
  'low',
  'heuristic',
]);

export const riskPostureEnum = pgEnum('risk_posture', [
  'safe',
  'low',
  'medium',
  'high',
  'critical',
]);

export const blastRadiusEnum = pgEnum('blast_radius', [
  'none',
  'single-domain',
  'subdomain-tree',
  'related-domains',
  'infrastructure',
  'organization-wide',
]);

export const zoneManagementEnum = pgEnum('zone_management', ['managed', 'unmanaged', 'unknown']);

export const vantageTypeEnum = pgEnum('vantage_type', [
  'public-recursive',
  'authoritative',
  'parent-zone',
  'probe',
]);

export const collectionStatusEnum = pgEnum('collection_status', [
  'success',
  'timeout',
  'refused',
  'truncated',
  'nxdomain',
  'nodata',
  'error',
]);

// =============================================================================
// DOMAIN TABLE
// =============================================================================

export const domains = pgTable(
  'domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 253 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 253 }).notNull(),
    punycodeName: varchar('punycode_name', { length: 253 }),
    zoneManagement: zoneManagementEnum('zone_management').notNull().default('unknown'),
    tenantId: uuid('tenant_id'), // Multi-tenant isolation: NULL = system/unowned domain
    metadata: jsonb('metadata'), // Flexible metadata storage
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Composite unique index: allows same domain name per tenant
    // NULL tenant_id is allowed (system domains) - PostgreSQL treats NULLs as distinct
    nameTenantIdx: uniqueIndex('domain_name_tenant_idx').on(table.normalizedName, table.tenantId),
    tenantIdx: index('domain_tenant_idx').on(table.tenantId),
    zoneMgmtIdx: index('domain_zone_management_idx').on(table.zoneManagement),
  })
);

// =============================================================================
// RULESET VERSION TABLE
// =============================================================================

export const rulesetVersions = pgTable(
  'ruleset_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: varchar('version', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    rules: jsonb('rules').notNull(), // Serialized rule definitions
    active: boolean('active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: varchar('created_by', { length: 100 }).notNull(),
  },
  (table) => ({
    versionIdx: uniqueIndex('ruleset_version_idx').on(table.version),
    activeIdx: index('ruleset_active_idx').on(table.active),
  })
);

// =============================================================================
// SNAPSHOT TABLE
// =============================================================================

export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    domainName: varchar('domain_name', { length: 253 }).notNull(), // Denormalized for queries
    resultState: resultStateEnum('result_state').notNull(),

    // Snapshot scope - explicitly tracks what was queried
    queriedNames: jsonb('queried_names').notNull().$type<string[]>(),
    queriedTypes: jsonb('queried_types').notNull().$type<string[]>(),
    vantages: jsonb('vantages').notNull().$type<string[]>(),
    zoneManagement: zoneManagementEnum('zone_management').notNull(),

    // Ruleset version used for findings
    rulesetVersionId: uuid('ruleset_version_id').references(() => rulesetVersions.id),

    // Metadata
    triggeredBy: varchar('triggered_by', { length: 100 }).notNull(), // user ID or 'system'
    collectionDurationMs: integer('collection_duration_ms'),
    errorMessage: text('error_message'),

    // Collection and delegation metadata (Bead 12, dns-ops-1j4.5.5, dns-ops-1j4.6.4)
    metadata: jsonb('metadata').$type<{
      // Vantage identifiers (IPs/hostnames) for detailed tracking
      vantageIdentifiers?: string[];
      // Delegation data
      hasDelegationData?: boolean;
      parentZone?: string;
      nsServers?: string[];
      // Delegation divergence
      hasDivergence?: boolean;
      divergenceDetails?: Array<{
        queryName: string;
        queryType: string;
        groups: Array<{
          servers: string[];
          signature: string;
        }>;
        totalServers: number;
      }>;
      // Lame delegation details
      lameDelegations?: Array<{
        server: string;
        reason: 'not-authoritative' | 'timeout' | 'refused' | 'error';
      }>;
      // Missing glue records
      missingGlue?: string[];
      // DNSSEC info
      hasDnssec?: boolean;
      dnssec?: {
        adFlagSet?: boolean;
        hasDnskey?: boolean;
        hasDs?: boolean;
      };
    }>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainIdx: index('snapshot_domain_idx').on(table.domainId),
    createdAtIdx: index('snapshot_created_at_idx').on(table.createdAt),
    domainCreatedIdx: index('snapshot_domain_created_idx').on(table.domainId, table.createdAt),
    stateIdx: index('snapshot_state_idx').on(table.resultState),
  })
);

// =============================================================================
// OBSERVATION TABLE (Immutable)
// =============================================================================

export const observations = pgTable(
  'observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),

    // Query details
    queryName: varchar('query_name', { length: 253 }).notNull(),
    queryType: varchar('query_type', { length: 10 }).notNull(),

    // Vantage type used (public-recursive, authoritative, etc.)
    vantageType: vantageTypeEnum('vantage_type').notNull(),
    // Specific identifier for this vantage (NS IP, resolver IP, etc.)
    vantageIdentifier: varchar('vantage_identifier', { length: 100 }),

    // Collection status
    status: collectionStatusEnum('status').notNull(),

    // Timing
    queriedAt: timestamp('queried_at', { withTimezone: true }).notNull().defaultNow(),
    responseTimeMs: integer('response_time_ms'),

    // DNS response details
    responseCode: integer('response_code'),
    flags: jsonb('flags').$type<Record<string, boolean>>(), // AA, TC, RD, RA, etc.

    // Raw sections (stored as JSON for flexibility)
    answerSection: jsonb('answer_section').$type<DNSRecord[]>(),
    authoritySection: jsonb('authority_section').$type<DNSRecord[]>(),
    additionalSection: jsonb('additional_section').$type<DNSRecord[]>(),

    // Error details
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details'),

    // Raw response for debugging (optional, may be large)
    rawResponse: text('raw_response'),
  },
  (table) => ({
    snapshotIdx: index('observation_snapshot_idx').on(table.snapshotId),
    queryIdx: index('observation_query_idx').on(table.queryName, table.queryType),
    statusIdx: index('observation_status_idx').on(table.status),
  })
);

// DNS Record structure for JSON fields
export interface DNSRecord {
  name: string;
  type: string;
  ttl: number;
  data: string;
  // Extended fields for specific types
  priority?: number; // MX, SRV
  mname?: string; // SOA
  rname?: string; // SOA
  serial?: number; // SOA
  refresh?: number; // SOA
  retry?: number; // SOA
  expire?: number; // SOA
  minimum?: number; // SOA
}

// =============================================================================
// RECORD SET TABLE (Normalized view of observations)
// =============================================================================

export const recordSets = pgTable(
  'record_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),

    // Record details
    name: varchar('name', { length: 253 }).notNull(),
    type: varchar('type', { length: 10 }).notNull(),
    ttl: integer('ttl'),

    // Values (multiple for records with same name/type)
    values: jsonb('values').notNull().$type<string[]>(),

    // Source observations that contributed to this record set
    sourceObservationIds: jsonb('source_observation_ids').notNull().$type<string[]>(),
    sourceVantages: jsonb('source_vantages').notNull().$type<string[]>(),

    // Consolidation metadata
    isConsistent: boolean('is_consistent').notNull(), // false if vantages disagree
    consolidationNotes: text('consolidation_notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    snapshotIdx: index('recordset_snapshot_idx').on(table.snapshotId),
    nameTypeIdx: index('recordset_name_type_idx').on(table.name, table.type),
  })
);

// =============================================================================
// FINDING TABLE
// =============================================================================

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),

    // Finding classification
    type: varchar('type', { length: 100 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),

    // Assessment
    severity: severityEnum('severity').notNull(),
    confidence: confidenceEnum('confidence').notNull(),
    riskPosture: riskPostureEnum('risk_posture').notNull(),
    blastRadius: blastRadiusEnum('blast_radius').notNull(),
    reviewOnly: boolean('review_only').notNull().default(false),

    // Evidence links
    evidence: jsonb('evidence').notNull().$type<EvidenceLink[]>(),

    // Rule that generated this finding
    ruleId: varchar('rule_id', { length: 100 }).notNull(),
    ruleVersion: varchar('rule_version', { length: 50 }).notNull(),

    // Ruleset version that generated this finding (for idempotent re-evaluation).
    // NOT NULL + backfill enforced by migration 0011_findings_ruleset_version_not_null.
    // Every findings insert site (collector + web) populates this from the active
    // ruleset version resolved at collection time.
    // NOTE: the FK still carries ON DELETE SET NULL (pre-existing); a future
    // ruleset_versions delete would now violate NOT NULL. Left for TB-3 to
    // resolve (e.g. ON DELETE RESTRICT) — out of scope for the nullability fix.
    rulesetVersionId: uuid('ruleset_version_id')
      .notNull()
      .references(() => rulesetVersions.id, { onDelete: 'set null' }),

    // Finding state
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: varchar('acknowledged_by', { length: 100 }),
    falsePositive: boolean('false_positive').default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    snapshotIdx: index('finding_snapshot_idx').on(table.snapshotId),
    typeIdx: index('finding_type_idx').on(table.type),
    severityIdx: index('finding_severity_idx').on(table.severity),
    reviewOnlyIdx: index('finding_review_only_idx').on(table.reviewOnly),
    rulesetVersionIdx: index('finding_ruleset_version_idx').on(table.rulesetVersionId),
    // Prevent duplicate findings for the same (snapshot, rule, type, ruleset version)
    uniqueFindingIdx: uniqueIndex('finding_unique_idx').on(
      table.snapshotId,
      table.ruleId,
      table.type,
      table.rulesetVersionId
    ),
  })
);

export interface EvidenceLink {
  observationId: string;
  recordSetId?: string;
  description: string;
  // Highlight specific data within the observation
  highlightedRecords?: number[]; // Indexes into answer section
}

// =============================================================================
// SUGGESTION TABLE
// =============================================================================

export const suggestions = pgTable(
  'suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id, { onDelete: 'cascade' }),

    // Suggestion details
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    action: text('action').notNull(), // Specific action to take

    // Risk assessment
    riskPosture: riskPostureEnum('risk_posture').notNull(),
    blastRadius: blastRadiusEnum('blast_radius').notNull(),
    reviewOnly: boolean('review_only').notNull().default(false),

    // Suggestion state
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    appliedBy: varchar('applied_by', { length: 100 }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedBy: varchar('dismissed_by', { length: 100 }),
    dismissalReason: text('dismissal_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    findingIdx: index('suggestion_finding_idx').on(table.findingId),
    reviewOnlyIdx: index('suggestion_review_only_idx').on(table.reviewOnly),
  })
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;

export type RulesetVersion = typeof rulesetVersions.$inferSelect;
export type NewRulesetVersion = typeof rulesetVersions.$inferInsert;

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;

export type Observation = typeof observations.$inferSelect;
export type NewObservation = typeof observations.$inferInsert;

export type RecordSet = typeof recordSets.$inferSelect;
export type NewRecordSet = typeof recordSets.$inferInsert;

export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;

export type Suggestion = typeof suggestions.$inferSelect;
export type NewSuggestion = typeof suggestions.$inferInsert;

// =============================================================================
// DOMAIN NOTES & TAGS (Bead 14)
// =============================================================================

export const domainNotes = pgTable(
  'domain_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),

    // Note content
    content: text('content').notNull(),

    // Actor context
    createdBy: varchar('created_by', { length: 100 }).notNull(),
    tenantId: uuid('tenant_id').notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainIdx: index('domain_note_domain_idx').on(table.domainId),
    tenantIdx: index('domain_note_tenant_idx').on(table.tenantId),
    createdIdx: index('domain_note_created_idx').on(table.createdAt),
  })
);

export const domainTags = pgTable(
  'domain_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),

    // Tag
    tag: varchar('tag', { length: 50 }).notNull(),

    // Actor context
    createdBy: varchar('created_by', { length: 100 }).notNull(),
    tenantId: uuid('tenant_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainIdx: index('domain_tag_domain_idx').on(table.domainId),
    tagIdx: index('domain_tag_tag_idx').on(table.tag),
    tenantIdx: index('domain_tag_tenant_idx').on(table.tenantId),
    uniqueTag: uniqueIndex('domain_tag_unique_idx').on(table.domainId, table.tag),
  })
);

export type DomainNote = typeof domainNotes.$inferSelect;
export type NewDomainNote = typeof domainNotes.$inferInsert;
export type DomainTag = typeof domainTags.$inferSelect;
export type NewDomainTag = typeof domainTags.$inferInsert;

// =============================================================================
// SAVED FILTERS (Bead 14)
// =============================================================================

export const savedFilters = pgTable(
  'saved_filters',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Filter definition
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    // Filter criteria (JSON for flexibility)
    criteria: jsonb('criteria').notNull().$type<{
      domainPatterns?: string[];
      zoneManagement?: ('managed' | 'unmanaged' | 'unknown')[];
      findings?: {
        types?: string[];
        severities?: ('critical' | 'high' | 'medium' | 'low' | 'info')[];
        minConfidence?: 'certain' | 'high' | 'medium' | 'low' | 'heuristic';
      };
      tags?: string[];
      lastSnapshotWithin?: number; // hours
    }>(),

    // Visibility
    isShared: boolean('is_shared').notNull().default(false),

    // Actor context
    createdBy: varchar('created_by', { length: 100 }).notNull(),
    tenantId: uuid('tenant_id').notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('saved_filter_tenant_idx').on(table.tenantId),
    createdByIdx: index('saved_filter_created_by_idx').on(table.createdBy),
    sharedIdx: index('saved_filter_shared_idx').on(table.isShared),
  })
);

export type SavedFilter = typeof savedFilters.$inferSelect;
export type NewSavedFilter = typeof savedFilters.$inferInsert;

// =============================================================================
// AUDIT EVENTS (Bead 14)
// =============================================================================

export const auditActionEnum = pgEnum('audit_action', [
  'domain_note_created',
  'domain_note_updated',
  'domain_note_deleted',
  'domain_tag_added',
  'domain_tag_removed',
  'filter_created',
  'filter_updated',
  'filter_deleted',
  'template_override_created',
  'template_override_updated',
  'template_override_deleted',
  'remediation_request_created',
  'remediation_request_updated',
  'shared_report_created',
  'shared_report_expired',
  'monitored_domain_created',
  'monitored_domain_updated',
  'monitored_domain_deleted',
  'monitored_domain_toggled',
  'alert_acknowledged',
  'alert_resolved',
  'alert_suppressed',
]);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Action details
    action: auditActionEnum('action').notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),

    // Change details
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value'),

    // Actor context
    actorId: varchar('actor_id', { length: 100 }).notNull(),
    actorEmail: varchar('actor_email', { length: 255 }),
    tenantId: uuid('tenant_id'),

    // Request context
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('audit_entity_idx').on(table.entityType, table.entityId),
    actorIdx: index('audit_actor_idx').on(table.actorId),
    tenantIdx: index('audit_tenant_idx').on(table.tenantId),
    actionIdx: index('audit_action_idx').on(table.action),
    createdIdx: index('audit_created_idx').on(table.createdAt),
  })
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;

// =============================================================================
// TEMPLATE OVERRIDES (Bead 14)
// =============================================================================

export const templateOverrides = pgTable(
  'template_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Template reference
    providerKey: varchar('provider_key', { length: 50 }).notNull(),
    templateKey: varchar('template_key', { length: 50 }).notNull(),

    // Override content (merged with base template)
    overrideData: jsonb('override_data').notNull(),

    // Scope
    appliesToDomains: jsonb('applies_to_domains').$type<string[]>(), // null = all domains

    // Actor context
    createdBy: varchar('created_by', { length: 100 }).notNull(),
    tenantId: uuid('tenant_id').notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerIdx: index('template_override_provider_idx').on(table.providerKey),
    tenantIdx: index('template_override_tenant_idx').on(table.tenantId),
    uniqueOverride: uniqueIndex('template_override_unique_idx').on(
      table.providerKey,
      table.templateKey,
      table.tenantId
    ),
  })
);

export type TemplateOverride = typeof templateOverrides.$inferSelect;
export type NewTemplateOverride = typeof templateOverrides.$inferInsert;

// =============================================================================
// MONITORED DOMAINS (Bead 15)
// =============================================================================

export const monitoringScheduleEnum = pgEnum('monitoring_schedule', ['hourly', 'daily', 'weekly']);

export const monitoredDomains = pgTable(
  'monitored_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),

    // Schedule
    schedule: monitoringScheduleEnum('schedule').notNull().default('daily'),

    // Alert configuration
    alertChannels: jsonb('alert_channels').notNull().$type<{
      email?: string[];
      webhook?: string;
      slack?: string;
    }>(),

    // Noise budget
    maxAlertsPerDay: integer('max_alerts_per_day').notNull().default(5),
    suppressionWindowMinutes: integer('suppression_window_minutes').notNull().default(60),

    // State
    isActive: boolean('is_active').notNull().default(true),
    lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
    lastAlertAt: timestamp('last_alert_at', { withTimezone: true }),

    // Actor context
    createdBy: varchar('created_by', { length: 100 }).notNull(),
    tenantId: uuid('tenant_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainIdx: uniqueIndex('monitored_domain_unique_idx').on(table.domainId),
    tenantIdx: index('monitored_domain_tenant_idx').on(table.tenantId),
    activeIdx: index('monitored_domain_active_idx').on(table.isActive),
    scheduleIdx: index('monitored_domain_schedule_idx').on(table.schedule),
  })
);

export type MonitoredDomain = typeof monitoredDomains.$inferSelect;
export type NewMonitoredDomain = typeof monitoredDomains.$inferInsert;

// =============================================================================
// ALERTS (Bead 15)
// =============================================================================

export const alertStatusEnum = pgEnum('alert_status', [
  'pending',
  'sent',
  'suppressed',
  'acknowledged',
  'resolved',
]);

export const sharedReportVisibilityEnum = pgEnum('shared_report_visibility', [
  'private',
  'tenant',
  'shared',
]);

export const sharedReportStatusEnum = pgEnum('shared_report_status', [
  'generating',
  'ready',
  'expired',
  'error',
]);

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    monitoredDomainId: uuid('monitored_domain_id')
      .notNull()
      .references(() => monitoredDomains.id, { onDelete: 'cascade' }),

    // Alert content
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    severity: severityEnum('severity').notNull(),

    // Trigger
    triggeredByFindingId: uuid('triggered_by_finding_id').references(() => findings.id),

    // Status
    status: alertStatusEnum('status').notNull().default('pending'),

    // Deduplication
    dedupKey: varchar('dedup_key', { length: 200 }), // For grouping similar alerts

    // Acknowledgment
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: varchar('acknowledged_by', { length: 100 }),

    // Resolution
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),

    // Actor context
    tenantId: uuid('tenant_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    monitoredIdx: index('alert_monitored_idx').on(table.monitoredDomainId),
    statusIdx: index('alert_status_idx').on(table.status),
    tenantIdx: index('alert_tenant_idx').on(table.tenantId),
    dedupIdx: index('alert_dedup_idx').on(table.dedupKey),
    createdIdx: index('alert_created_idx').on(table.createdAt),
  })
);

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

export const sharedReports = pgTable(
  'shared_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    createdBy: varchar('created_by', { length: 100 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    visibility: sharedReportVisibilityEnum('visibility').notNull().default('shared'),
    status: sharedReportStatusEnum('status').notNull().default('generating'),
    shareToken: varchar('share_token', { length: 128 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    summary: jsonb('summary').notNull(),
    alertSummary: jsonb('alert_summary').notNull().$type<
      Array<{
        title: string;
        severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
        status: 'pending' | 'sent' | 'suppressed' | 'acknowledged' | 'resolved';
        createdAt: Date | string;
      }>
    >(),
    metadata: jsonb('metadata').$type<{
      sourceAlertIds?: string[];
      redacted?: boolean;
      generatedAlertCount?: number;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('shared_report_tenant_idx').on(table.tenantId),
    statusIdx: index('shared_report_status_idx').on(table.status),
    visibilityIdx: index('shared_report_visibility_idx').on(table.visibility),
    shareTokenIdx: uniqueIndex('shared_report_share_token_idx').on(table.shareToken),
    createdIdx: index('shared_report_created_idx').on(table.createdAt),
  })
);

export type SharedReport = typeof sharedReports.$inferSelect;
export type NewSharedReport = typeof sharedReports.$inferInsert;

// =============================================================================
// FLEET REPORTS TABLE
// =============================================================================

export const fleetReportStatusEnum = pgEnum('fleet_report_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const fleetReports = pgTable(
  'fleet_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    createdBy: varchar('created_by', { length: 100 }).notNull(),
    status: fleetReportStatusEnum('status').notNull().default('pending'),
    inventory: jsonb('inventory').notNull().$type<string[]>(),
    checks: jsonb('checks').notNull().$type<string[]>(),
    format: varchar('format', { length: 20 }).notNull().default('summary'),
    summary: jsonb('summary').$type<{
      totalDomains: number;
      processedDomains: number;
      totalFindings: number;
      checksApplied: string[];
    }>(),
    domainResults:
      jsonb('domain_results').$type<
        Array<{
          domain: string;
          findingsCount: number;
          severityCounts: Record<string, number>;
        }>
      >(),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('fleet_report_tenant_idx').on(table.tenantId),
    statusIdx: index('fleet_report_status_idx').on(table.status),
    createdIdx: index('fleet_report_created_idx').on(table.createdAt),
  })
);

export type FleetReport = typeof fleetReports.$inferSelect;
export type NewFleetReport = typeof fleetReports.$inferInsert;

// =============================================================================
// PROBE OBSERVATIONS TABLE
// =============================================================================

export const probeTypeEnum = pgEnum('probe_type', ['smtp_starttls', 'mta_sts', 'tls_cert', 'http']);

export const probeStatusEnum = pgEnum('probe_status', [
  'success',
  'timeout',
  'refused',
  'ssrf_blocked',
  'allowlist_denied',
  'parse_error',
  'error',
]);

/**
 * Probe-specific data stored in JSONB
 */
export interface SMTPProbeData {
  supportsStarttls: boolean;
  tlsVersion?: string;
  tlsCipher?: string;
  certificate?: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    fingerprint: string;
  };
  smtpBanner?: string;
}

export interface MTASTSProbeData {
  policyUrl: string;
  policy?: {
    version: string;
    mode: 'enforce' | 'testing' | 'none';
    maxAge: number;
    mx: string[];
  };
  rawPolicy?: string;
  tlsVersion?: string;
  certificateValid?: boolean;
}

export type ProbeData = SMTPProbeData | MTASTSProbeData;

export const probeObservations = pgTable(
  'probe_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),

    // Probe classification
    probeType: probeTypeEnum('probe_type').notNull(),
    status: probeStatusEnum('status').notNull(),

    // Target details
    hostname: varchar('hostname', { length: 253 }).notNull(),
    port: integer('port'),

    // Result
    success: boolean('success').notNull(),
    errorMessage: text('error_message'),

    // Timing
    probedAt: timestamp('probed_at', { withTimezone: true }).notNull().defaultNow(),
    responseTimeMs: integer('response_time_ms'),

    // Probe-specific data (SMTP TLS info, MTA-STS policy, etc.)
    probeData: jsonb('probe_data').$type<ProbeData>(),
  },
  (table) => ({
    snapshotIdx: index('probe_observation_snapshot_idx').on(table.snapshotId),
    probeTypeIdx: index('probe_observation_type_idx').on(table.probeType),
    hostnameIdx: index('probe_observation_hostname_idx').on(table.hostname),
    statusIdx: index('probe_observation_status_idx').on(table.status),
    successIdx: index('probe_observation_success_idx').on(table.success),
  })
);

export type ProbeObservation = typeof probeObservations.$inferSelect;
export type NewProbeObservation = typeof probeObservations.$inferInsert;

// =============================================================================
// REMEDIATION EXPORTS
// =============================================================================

export {
  type NewRemediationRequest,
  type RemediationRequest,
  remediationPriorityEnum,
  remediationRequests,
  remediationStatusEnum,
} from './remediation.js';

// =============================================================================
// MAIL EVIDENCE EXPORTS
// =============================================================================

export {
  type DkimSelector,
  dkimSelectors,
  type MailEvidence,
  mailEvidence,
  mailProviderEnum,
  type NewDkimSelector,
  type NewMailEvidence,
  selectorConfidenceEnum,
  selectorProvenanceEnum,
} from './mail.js';

// =============================================================================
// PARITY EVIDENCE EXPORTS
// =============================================================================

export {
  adjudicationEnum,
  baselineStatusEnum,
  type FieldComparison,
  fieldComparisonStatusEnum,
  type LegacyAccessLog,
  type LegacyToolOutput,
  legacyAccessLogs,
  legacyToolTypeEnum,
  type MismatchReport,
  mismatchReports,
  type NewLegacyAccessLog,
  type NewMismatchReport,
  type NewProviderBaseline,
  type NewShadowComparison,
  type ProviderBaseline,
  type ProviderBaselineData,
  providerBaselines,
  type ShadowComparison,
  shadowComparisons,
  shadowStatusEnum,
} from './parity.js';

// =============================================================================
// USERS
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 255 }),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// =============================================================================
// SESSIONS
// =============================================================================

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  userEmail: varchar('user_email', { length: 255 }).notNull(),
  tenantId: uuid('tenant_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
