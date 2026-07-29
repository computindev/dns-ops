/**
 * DNS Ops Workbench - Database Repositories
 *
 * Export all repository classes for database operations.
 */

// Re-export database adapter
export {
  createSimpleAdapter,
  type IDatabaseAdapter,
  SimpleDatabaseAdapter,
} from '../database/index.js';
export { type DomainFilter, DomainRepository } from './domain.js';
export {
  DomainRepositoryResults,
  withDomainResults,
} from './domain.result.js';
// Domain repositories
export { DomainProfileRepository, type SetDomainProfile } from './domain-profile.js';
export { FindingRepository } from './finding.js';
export { FleetReportRepository } from './fleet-report.js';
// Mail evidence repositories
export { DkimSelectorRepository, MailEvidenceRepository } from './mail-evidence.js';
export { type McpCommandClaim, McpCommandRepository } from './mcp-command.js';
export { ObservationRepository } from './observation.js';
export {
  type AcceptOperationalBaseline,
  OperationalBaselineRepository,
} from './operational-baseline.js';
export {
  type ObserveOperationalCondition,
  type OperationalConditionResult,
  OperationalConditionService,
} from './operations.js';
// Parity evidence repositories
export {
  LegacyAccessLogRepository,
  MismatchReportRepository,
  ProviderBaselineRepository,
  ShadowComparisonRepository,
} from './parity.js';
// Portfolio repositories
export {
  AlertRepository,
  AuditEventRepository,
  DomainNoteRepository,
  DomainTagRepository,
  MonitoredDomainRepository,
  SavedFilterRepository,
  SharedReportRepository,
  TemplateOverrideRepository,
} from './portfolio.js';
export { ProbeObservationRepository } from './probe-observation.js';
export { RecordSetRepository } from './recordset.js';
export { RemediationRepository } from './remediation.js';
// Result-based error handling (gradual migration)
export {
  DbError,
  type DbErrorCode,
  dbResult,
  dbResultOrNotFound,
  ensureTenantIsolation,
  isDbError,
  mapDatabaseError,
  partitionDbResults,
  Result,
  type ResultOrError,
  toNotFoundError,
  toTenantIsolationError,
  unwrapDbResultOr,
} from './result.js';
export { RulesetVersionRepository } from './ruleset-version.js';
// Legacy repositories (using adapter pattern)
export { SnapshotRepository } from './snapshot.js';
export {
  SnapshotRepositoryResults,
  withSnapshotResults,
} from './snapshot.result.js';
export { SuggestionRepository } from './suggestion.js';
