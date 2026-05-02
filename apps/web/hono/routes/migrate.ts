/**
 * Database Migration Tests
 *
 * Tests that verify all required database tables exist
 * and have the correct schema.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@dns-ops/logging';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env } from '../types.js';

const logger = createLogger({ service: 'migrate-routes' });

const migrateRoutes = new Hono<Env>();

// All tables that should exist in the database
const REQUIRED_TABLES = [
  'users',
  'sessions',
  'domains',
  'ruleset_versions',
  'snapshots',
  'observations',
  'record_sets',
  'findings',
  'suggestions',
  'domain_notes',
  'domain_tags',
  'saved_filters',
  'audit_events',
  'template_overrides',
  'monitored_domains',
  'alerts',
  'shared_reports',
  'fleet_reports',
  'probe_observations',
];

// Critical columns for each table (table -> required columns)
const CRITICAL_COLUMNS: Record<string, string[]> = {
  users: ['id', 'email', 'password_hash', 'tenant_id', 'created_at', 'updated_at'],
  sessions: ['id', 'token', 'user_email', 'tenant_id', 'expires_at', 'created_at'],
  domains: ['id', 'name', 'normalized_name', 'tenant_id', 'created_at', 'updated_at'],
  snapshots: ['id', 'domain_id', 'tenant_id', 'collector', 'created_at'],
  observations: ['id', 'snapshot_id', 'query_name', 'query_type', 'rcode'],
  record_sets: ['id', 'snapshot_id', 'domain_id', 'name', 'type', 'records', 'tenant_id'],
  findings: ['id', 'domain_id', 'tenant_id', 'severity', 'code', 'message'],
  suggestions: ['id', 'domain_id', 'tenant_id', 'action', 'target', 'description'],
  domain_notes: ['id', 'domain_id', 'tenant_id', 'content', 'created_by', 'created_at'],
  domain_tags: ['id', 'domain_id', 'tenant_id', 'tag', 'created_by', 'created_at'],
  monitored_domains: [
    'id',
    'domain_id',
    'schedule',
    'tenant_id',
    'created_by',
    'created_at',
    'is_active',
  ],
  alerts: ['id', 'monitored_domain_id', 'tenant_id', 'status', 'severity', 'message'],
  audit_events: ['id', 'tenant_id', 'action', 'actor_id', 'created_at'],
  ruleset_versions: ['id', 'version', 'rules', 'tenant_id', 'created_at'],
  saved_filters: ['id', 'tenant_id', 'name', 'filters', 'created_by', 'created_at'],
  template_overrides: ['id', 'tenant_id', 'template_id', 'field_name', 'value', 'created_by'],
  shared_reports: ['id', 'tenant_id', 'name', 'type', 'config', 'created_by'],
  fleet_reports: ['id', 'tenant_id', 'name', 'findings', 'created_by', 'created_at'],
  probe_observations: ['id', 'tenant_id', 'domain', 'record_type', 'resolver', 'response_code'],
};

/**
 * GET /api/migrate/status
 * Check if database is accessible and has required tables
 */
migrateRoutes.get('/status', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  try {
    const results = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const resultObj = results as unknown as { rows: { table_name: string }[] };
    const rows = resultObj.rows || [];
    const existingTables = rows.map((r) => r.table_name);
    const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.includes(t));

    if (missingTables.length > 0) {
      return c.json(
        {
          status: 'incomplete',
          missingTables,
          existingTables,
          message: `Missing tables: ${missingTables.join(', ')}`,
        },
        200
      );
    }

    return c.json({
      status: 'complete',
      tables: REQUIRED_TABLES.length,
      message: 'All required tables exist',
    });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

/**
 * GET /api/migrate/schema
 * Check schema for each table
 */
migrateRoutes.get('/schema', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  try {
    const schemaResults: Record<string, { columns: string[]; missing: string[] }> = {};

    for (const [table, requiredCols] of Object.entries(CRITICAL_COLUMNS)) {
      const colResults = await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ${table} AND table_schema = 'public'
      `);

      const colResultObj = colResults as unknown as { rows: { column_name: string }[] };
      const colRows = colResultObj.rows || [];
      const existingCols = colRows.map((r) => r.column_name);
      const missing = requiredCols.filter((c) => !existingCols.includes(c));

      schemaResults[table] = {
        columns: existingCols,
        missing,
      };
    }

    const tablesWithMissing = Object.entries(schemaResults)
      .filter(([, data]) => data.missing.length > 0)
      .map(([table, data]) => ({ table, missing: data.missing }));

    if (tablesWithMissing.length > 0) {
      return c.json(
        {
          status: 'incomplete',
          issues: tablesWithMissing,
          message: `${tablesWithMissing.length} tables have missing columns`,
        },
        200
      );
    }

    return c.json({
      status: 'complete',
      tablesChecked: Object.keys(CRITICAL_COLUMNS).length,
      message: 'All tables have required columns',
    });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

/**
 * POST /api/migrate/reset
 * Reset migration tracker to force re-run all migrations
 */
migrateRoutes.post('/reset', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  try {
    await db.execute(sql`DROP TABLE IF EXISTS __drizzle_migrations;`);
    return c.json({
      status: 'reset',
      message: 'Migration tracker cleared. Migrations will re-run on next request.',
    });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

/**
 * POST /api/migrate/repair
 * Run schema repair manually and return detailed results
 */
migrateRoutes.post('/repair', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  const { repairSchema } = await import('../lib/schema-repair.js');

  try {
    await repairSchema(db);
    return c.json({ status: 'repaired', message: 'Schema repair complete' });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

/**
 * POST /api/migrate/rebuild
 * Nuclear option: drop all broken tables and recreate from real migrations
 */
migrateRoutes.post('/rebuild', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  try {
    // Drop all tables that might be broken (except users/sessions which have real data)
    const tablesToDrop = [
      'alerts',
      'audit_events',
      'domain_notes',
      'domain_tags',
      'findings',
      'fleet_reports',
      'monitored_domains',
      'observations',
      'probe_observations',
      'record_sets',
      'ruleset_versions',
      'saved_filters',
      'shared_reports',
      'snapshots',
      'suggestions',
      'template_overrides',
    ];

    for (const table of tablesToDrop) {
      try {
        await db.execute(sql.raw(`DROP TABLE IF EXISTS "${table}" CASCADE;`));
        logger.info(`[Rebuild] Dropped ${table}`);
      } catch (err: any) {
        logger.warn(`[Rebuild] Could not drop ${table}: ${err.message}`);
      }
    }

    // Clear migration tracker
    await db.execute(sql`DROP TABLE IF EXISTS __drizzle_migrations;`);

    return c.json({
      status: 'rebuilt',
      dropped: tablesToDrop,
      message: 'Broken tables dropped. Real migrations will recreate them on next request.',
    });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

/**
 * POST /api/migrate/run-init
 * Execute the full 0000_init migration directly
 */
migrateRoutes.post('/run-init', async (c) => {
  const db = c.get('db');
  if (!db) {
    return c.json({ error: 'Database not available' }, 503);
  }

  try {
    const migrationFile = join(
      process.cwd(),
      'packages',
      'db',
      'src',
      'migrations',
      '0000_nebulous_steve_rogers.sql'
    );
    const content = await readFile(migrationFile, 'utf-8');
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const results: { statement: string; status: string; error?: string }[] = [];

    for (const statement of statements) {
      try {
        await db.execute(sql.raw(statement));
        results.push({ statement: statement.slice(0, 60), status: 'ok' });
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        const skipErrors = [
          'already exists',
          'does not exist',
          'cannot drop',
          'DuplicateObject',
          'duplicate_object',
          'no such table',
        ];
        const isSkipped = skipErrors.some((e) => errorMsg.includes(e));
        results.push({
          statement: statement.slice(0, 60),
          status: isSkipped ? 'skipped' : 'error',
          error: isSkipped ? undefined : errorMsg,
        });
      }
    }

    const errors = results.filter((r) => r.status === 'error');
    if (errors.length > 0) {
      return c.json(
        {
          status: 'partial',
          total: results.length,
          errors: errors.map((e) => ({ statement: e.statement, error: e.error })),
        },
        200
      );
    }

    return c.json({
      status: 'complete',
      total: results.length,
      message: 'Init migration executed successfully',
    });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

export default migrateRoutes;
