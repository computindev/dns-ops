// DNS Ops Workbench - Shared Contracts
//
// This package contains shared TypeScript types, interfaces, and enums
// used across the entire monorepo.
//
// See docs/architecture/runtime-topology.md for how these contracts
// are used across web and collector runtimes.

export * from './dns.js';
export * from './enums.js';
export * from './env.js';
export * from './requests.js';
export * from './result.js';
export * from './tenant.js';

// -----------------------------------------------------------------------------
// Persistence entity types — MOVED to @dns-ops/db
// -----------------------------------------------------------------------------
// The canonical shapes for Domain, Snapshot, Observation, RecordSet, Finding,
// Suggestion, EvidenceLink, and RulesetVersion are the Drizzle-inferred types in
// `@dns-ops/db` (`$inferSelect` / `$inferInsert`). They were previously mirrored
// here by hand and DRIFTED (e.g. `answers` vs the schema's `answerSection`,
// `vantage` vs `vantageType`, `timestamp` vs `queriedAt`). To guarantee a single
// source of truth, those duplicates were removed.
//
// Import persistence shapes from `@dns-ops/db` (or `@dns-ops/db/schema`):
//
//   import type { Finding, Observation, RecordSet, Suggestion } from '@dns-ops/db';
//
// This package remains a leaf dependency and MUST NOT depend on `@dns-ops/db`,
// since `@dns-ops/db` already depends on `@dns-ops/contracts` (a contracts→db
// edge would close a package cycle).
