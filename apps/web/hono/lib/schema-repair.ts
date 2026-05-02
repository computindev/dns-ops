/**
 * Schema Repair - Add missing columns from broken early migrations
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { createLogger } from '@dns-ops/logging';
import { sql } from 'drizzle-orm';

const logger = createLogger({ service: 'schema-repair' });

export async function repairSchema(db: IDatabaseAdapter): Promise<void> {
  logger.info('[SchemaRepair] Checking for missing columns...');

  const repairs = [
    // Alerts table
    {
      table: 'alerts',
      column: 'title',
      sql: `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT 'Alert'`,
    },
    {
      table: 'alerts',
      column: 'description',
      sql: `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
    },
    {
      table: 'alerts',
      column: 'status',
      sql: `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'`,
    },
    {
      table: 'alerts',
      column: 'dedup_key',
      sql: `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(200)`,
    },
    {
      table: 'alerts',
      column: 'triggered_by_finding_id',
      sql: `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS triggered_by_finding_id UUID`,
    },
    {
      table: 'alerts',
      column: 'resolved_at',
      sql: `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE`,
    },
    {
      table: 'alerts',
      column: 'resolution_note',
      sql: `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolution_note TEXT`,
    },

    // Shared reports table
    {
      table: 'shared_reports',
      column: 'title',
      sql: `ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT 'Report'`,
    },
    {
      table: 'shared_reports',
      column: 'description',
      sql: `ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS description TEXT`,
    },

    // Findings table
    {
      table: 'findings',
      column: 'type',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS type VARCHAR(100) NOT NULL DEFAULT 'unknown'`,
    },
    {
      table: 'findings',
      column: 'title',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT 'Finding'`,
    },
    {
      table: 'findings',
      column: 'description',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
    },
    {
      table: 'findings',
      column: 'risk_posture',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS risk_posture VARCHAR(20) NOT NULL DEFAULT 'medium'`,
    },
    {
      table: 'findings',
      column: 'blast_radius',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS blast_radius VARCHAR(30) NOT NULL DEFAULT 'none'`,
    },
    {
      table: 'findings',
      column: 'review_only',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS review_only BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      table: 'findings',
      column: 'rule_id',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS rule_id VARCHAR(100) NOT NULL DEFAULT 'unknown'`,
    },
    {
      table: 'findings',
      column: 'rule_version',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS rule_version VARCHAR(50) NOT NULL DEFAULT '1.0.0'`,
    },
    {
      table: 'findings',
      column: 'ruleset_version_id',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS ruleset_version_id UUID`,
    },
    {
      table: 'findings',
      column: 'acknowledged_at',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE`,
    },
    {
      table: 'findings',
      column: 'acknowledged_by',
      sql: `ALTER TABLE findings ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(100)`,
    },

    // Snapshots table
    {
      table: 'snapshots',
      column: 'metadata',
      sql: `ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
    },

    // Observations table
    {
      table: 'observations',
      column: 'success',
      sql: `ALTER TABLE observations ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true`,
    },
    {
      table: 'observations',
      column: 'vantage_type',
      sql: `ALTER TABLE observations ADD COLUMN IF NOT EXISTS vantage_type VARCHAR(20)`,
    },
    {
      table: 'observations',
      column: 'vantage_id',
      sql: `ALTER TABLE observations ADD COLUMN IF NOT EXISTS vantage_id UUID`,
    },

    // Record sets table
    {
      table: 'record_sets',
      column: 'metadata',
      sql: `ALTER TABLE record_sets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
    },

    // Suggestions table
    {
      table: 'suggestions',
      column: 'effort',
      sql: `ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS effort VARCHAR(20) DEFAULT 'medium'`,
    },
    {
      table: 'suggestions',
      column: 'priority',
      sql: `ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 50`,
    },
    {
      table: 'suggestions',
      column: 'resolved',
      sql: `ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false`,
    },
    {
      table: 'suggestions',
      column: 'finding_id',
      sql: `ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS finding_id UUID`,
    },

    // Monitored domains table
    {
      table: 'monitored_domains',
      column: 'alert_channels',
      sql: `ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS alert_channels JSONB DEFAULT '{}'`,
    },

    // Fleet reports table
    {
      table: 'fleet_reports',
      column: 'config',
      sql: `ALTER TABLE fleet_reports ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'`,
    },

    // Probe observations table
    {
      table: 'probe_observations',
      column: 'metadata',
      sql: `ALTER TABLE probe_observations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
    },

    // Ruleset versions table
    {
      table: 'ruleset_versions',
      column: 'created_by',
      sql: `ALTER TABLE ruleset_versions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'`,
    },

    // Saved filters table
    {
      table: 'saved_filters',
      column: 'created_by',
      sql: `ALTER TABLE saved_filters ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'`,
    },

    // Template overrides table
    {
      table: 'template_overrides',
      column: 'created_by',
      sql: `ALTER TABLE template_overrides ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'`,
    },

    // Shared reports table
    {
      table: 'shared_reports',
      column: 'created_by',
      sql: `ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'`,
    },

    // Audit events table
    {
      table: 'audit_events',
      column: 'target_type',
      sql: `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS target_type VARCHAR(50)`,
    },
    {
      table: 'audit_events',
      column: 'target_id',
      sql: `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS target_id UUID`,
    },
    {
      table: 'audit_events',
      column: 'metadata',
      sql: `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
    },

    // Domain notes table
    {
      table: 'domain_notes',
      column: 'updated_at',
      sql: `ALTER TABLE domain_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    },

    // Domain tags table
    {
      table: 'domain_tags',
      column: 'updated_at',
      sql: `ALTER TABLE domain_tags ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    },

    // Users table
    {
      table: 'users',
      column: 'updated_at',
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    },
  ];

  // Bulk-query existing columns to skip no-ops
  const existing = await db.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const existingCols = new Set(
    ((existing as any).rows || [])
      .filter((r: any) => r.table_name && r.column_name)
      .map((r: any) => `${r.table_name}.${r.column_name}`)
  );

  let fixed = 0;
  for (const { table, column, sql: repairSql } of repairs) {
    if (existingCols.has(`${table}.${column}`)) continue;
    try {
      await db.execute(sql.raw(repairSql));
      fixed++;
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        logger.warn(`[SchemaRepair] Note: ${err.message}`);
      }
    }
  }

  logger.info(`[SchemaRepair] Applied ${fixed} column fixes`);
}
