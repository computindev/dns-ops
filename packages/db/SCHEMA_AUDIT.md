# Schema Audit Report

**Date:** 2026-03-20
**Auditor:** BlueGrove (Claude Code Agent)

## Summary

Comparison between TypeScript schema definitions (`packages/db/src/schema/`) and SQL migration (`packages/db/src/migrations/0000_nebulous_steve_rogers.sql`).

**Status:** DRIFT DETECTED - Missing tables and enums in migration

---

## Tables Comparison

### Present in Both (16 tables)
| TypeScript Table | SQL Table | Status |
|------------------|-----------|--------|
| `domains` | `domains` | OK |
| `rulesetVersions` | `ruleset_versions` | OK |
| `snapshots` | `snapshots` | OK |
| `vantagePoints` | `vantage_points` | OK |
| `observations` | `observations` | OK |
| `recordSets` | `record_sets` | OK |
| `findings` | `findings` | OK |
| `suggestions` | `suggestions` | OK |
| `domainNotes` | `domain_notes` | OK |
| `domainTags` | `domain_tags` | OK |
| `savedFilters` | `saved_filters` | OK |
| `auditEvents` | `audit_events` | OK |
| `templateOverrides` | `template_overrides` | OK |
| `monitoredDomains` | `monitored_domains` | OK |
| `alerts` | `alerts` | OK |
| `remediationRequests` | `remediation_requests` | OK |

### Missing from Migration (2 tables)
| TypeScript Table | File | Status |
|------------------|------|--------|
| `dkimSelectors` | `mail.ts` | **MISSING** |
| `mailEvidence` | `mail.ts` | **MISSING** |

---

## Enums Comparison

### Present in Both (13 enums)
| TypeScript Enum | SQL Enum | Status |
|-----------------|----------|--------|
| `resultStateEnum` | `result_state` | OK |
| `severityEnum` | `severity` | OK |
| `confidenceEnum` | `confidence` | OK |
| `riskPostureEnum` | `risk_posture` | OK |
| `blastRadiusEnum` | `blast_radius` | OK |
| `zoneManagementEnum` | `zone_management` | OK |
| `vantageTypeEnum` | `vantage_type` | OK |
| `collectionStatusEnum` | `collection_status` | OK |
| `auditActionEnum` | `audit_action` | OK |
| `monitoringScheduleEnum` | `monitoring_schedule` | OK |
| `alertStatusEnum` | `alert_status` | OK |
| `remediationStatusEnum` | `remediation_status` | OK |
| `remediationPriorityEnum` | `remediation_priority` | OK |

### Missing from Migration (3 enums)
| TypeScript Enum | File | Status |
|-----------------|------|--------|
| `selectorProvenanceEnum` | `mail.ts` | **MISSING** |
| `selectorConfidenceEnum` | `mail.ts` | **MISSING** |
| `mailProviderEnum` | `mail.ts` | **MISSING** |

---

## Required DDL to Fix Drift

```sql
-- Missing enums from mail.ts
DO $$ BEGIN
 CREATE TYPE "selector_provenance" AS ENUM('managed-zone-config', 'operator-supplied', 'provider-heuristic', 'common-dictionary', 'not-found');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "selector_confidence" AS ENUM('certain', 'high', 'medium', 'low', 'heuristic');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "mail_provider" AS ENUM('google-workspace', 'microsoft-365', 'amazon-ses', 'sendgrid', 'mailgun', 'mailchimp', 'zoho', 'fastmail', 'protonmail', 'custom', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Missing table: dkim_selectors
CREATE TABLE IF NOT EXISTS "dkim_selectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_id" uuid NOT NULL,
  "selector" varchar(63) NOT NULL,
  "domain" varchar(253) NOT NULL,
  "provenance" "selector_provenance" NOT NULL,
  "confidence" "selector_confidence" NOT NULL,
  "provider" "mail_provider",
  "found" boolean NOT NULL,
  "record_data" text,
  "key_type" varchar(10),
  "key_size" varchar(10),
  "hash_algorithms" jsonb,
  "flags" jsonb,
  "is_valid" boolean,
  "validation_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "dkim_selector_snapshot_idx" ON "dkim_selectors" ("snapshot_id");
CREATE INDEX IF NOT EXISTS "dkim_selector_selector_idx" ON "dkim_selectors" ("selector");
CREATE INDEX IF NOT EXISTS "dkim_selector_domain_idx" ON "dkim_selectors" ("domain");
CREATE INDEX IF NOT EXISTS "dkim_selector_provider_idx" ON "dkim_selectors" ("provider");
CREATE INDEX IF NOT EXISTS "dkim_selector_provenance_idx" ON "dkim_selectors" ("provenance");

DO $$ BEGIN
 ALTER TABLE "dkim_selectors" ADD CONSTRAINT "dkim_selectors_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Missing table: mail_evidence
CREATE TABLE IF NOT EXISTS "mail_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_id" uuid NOT NULL,
  "domain" varchar(253) NOT NULL,
  "detected_provider" "mail_provider",
  "provider_confidence" "selector_confidence",
  "has_mx" boolean DEFAULT false NOT NULL,
  "is_null_mx" boolean DEFAULT false NOT NULL,
  "mx_hosts" jsonb,
  "has_spf" boolean DEFAULT false NOT NULL,
  "spf_record" text,
  "spf_mechanisms" jsonb,
  "has_dmarc" boolean DEFAULT false NOT NULL,
  "dmarc_record" text,
  "dmarc_policy" varchar(20),
  "dmarc_subdomain_policy" varchar(20),
  "dmarc_percent" varchar(5),
  "dmarc_rua" jsonb,
  "dmarc_ruf" jsonb,
  "has_dkim" boolean DEFAULT false NOT NULL,
  "dkim_selectors_found" jsonb,
  "dkim_selector_count" varchar(5),
  "has_mta_sts" boolean DEFAULT false NOT NULL,
  "mta_sts_mode" varchar(20),
  "mta_sts_version" varchar(10),
  "mta_sts_max_age" varchar(15),
  "has_tls_rpt" boolean DEFAULT false NOT NULL,
  "tls_rpt_rua" jsonb,
  "has_bimi" boolean DEFAULT false NOT NULL,
  "bimi_version" varchar(10),
  "bimi_location" text,
  "bimi_authority" text,
  "security_score" varchar(5),
  "score_breakdown" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mail_evidence_snapshot_idx" ON "mail_evidence" ("snapshot_id");
CREATE INDEX IF NOT EXISTS "mail_evidence_domain_idx" ON "mail_evidence" ("domain");
CREATE INDEX IF NOT EXISTS "mail_evidence_provider_idx" ON "mail_evidence" ("detected_provider");
CREATE INDEX IF NOT EXISTS "mail_evidence_score_idx" ON "mail_evidence" ("security_score");

DO $$ BEGIN
 ALTER TABLE "mail_evidence" ADD CONSTRAINT "mail_evidence_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

---

## Recommendations

1. **Immediate Action:** Run `npx drizzle-kit generate` to create a new migration that includes the missing tables and enums from `mail.ts`.

2. **Verification:** After generating, compare the new migration file against the TypeScript schema to ensure complete coverage.

3. **Apply Migration:** Run `npx drizzle-kit migrate` or apply the SQL directly to sync the database.

4. **Prevention:** `check-drift` inventories release-runner SQL vs the stale Drizzle journal; it does not certify catalog parity. Run:
   ```bash
   cd packages/db
   bun run build
   bun run check-drift
   DATABASE_URL=postgres://... bun run verify-migrations
   ```
   See `scripts/check-drift.ts`. Catalog parity requires `verify-migrations`.

---

## Table Consumption Status

Tables in the schema may be defined but not fully consumed by runtime code. This section tracks consumption.

### Fully Consumed Tables

| Table | Repository | API Routes | UI Consumer |
|-------|------------|------------|-------------|
| `domains` | DomainRepository | /api/domain/* | Domain 360 |
| `snapshots` | SnapshotRepository | /api/snapshots/* | Domain 360, History |
| `observations` | ObservationRepository | /api/snapshot/:id/observations | DNS Views |
| `findings` | FindingRepository | /api/snapshot/:id/findings | Findings Panel |
| `ruleset_versions` | RulesetVersionRepository | /api/ruleset-versions/* | (admin) |
| `monitored_domains` | MonitoredDomainRepository | /api/monitoring/* | Portfolio |
| `alerts` | AlertRepository | /api/alerts/* | Alerts Panel |

### Partially Consumed Tables

| Table | Status | Gap |
|-------|--------|-----|
| `vantage_points` | Schema only | No repository; vantage info stored inline in observations |
| `template_overrides` | Repository exists | UI exists; no management API |

### De-scoped / Backlog Tables

| Table | Reason | Future Use |
|-------|--------|------------|
| `vantage_points` | Observations use inline `vantage_type` and `vantage_identifier` | Future: normalize for vantage management UI |

**vantage_points rationale:**
The `vantage_points` table was designed for a future vantage point management feature. Currently:
- Observations store `vantage_type` (public-recursive, authoritative, etc.) inline
- Observations store `vantage_identifier` (resolver IP, NS name) inline
- The `vantage_id` FK in observations is nullable and unused

When to implement:
- When operators need to manage custom vantage points
- When reporting requires vantage point grouping
- When multi-region collection is implemented

### Seeding

To seed the initial ruleset version:
```bash
bun run packages/db/scripts/seed-ruleset.ts
```

---

## Files Analyzed

- `packages/db/src/schema/index.ts` - Main schema file
- `packages/db/src/schema/mail.ts` - Mail evidence schema (drift source)
- `packages/db/src/schema/remediation.ts` - Remediation schema
- `packages/db/src/migrations/0000_nebulous_steve_rogers.sql` - Initial migration

---

*Generated by schema audit task dns-ops-1j4.4.1*
*Updated by dns-ops-1j4.4.5 - Added table consumption status*
