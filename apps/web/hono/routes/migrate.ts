/**
 * Database migration inspection routes.
 *
 * RT-4: release runner (scripts/run-migrations.mjs via Railway releaseCommand)
 * is the sole automatic schema writer. Destructive recovery endpoints that used
 * to clear ledgers / drop tables and promise request-time re-migration are
 * permanently unavailable — request traffic never applies DDL.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env } from '../types.js';

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const migrateRoutes = new Hono<Env>();

/** Operator guidance when HTTP recovery endpoints are invoked. */
export const SCHEMA_RECOVERY_UNAVAILABLE_MESSAGE =
  'Schema recovery is not available via the HTTP API. The release runner (scripts/run-migrations.mjs via Railway releaseCommand) is the sole automatic schema writer. Recover schema by running that runner through the deploy/release pipeline (or out-of-band with the target DATABASE_URL) — not via app request routes.';

export const SCHEMA_RECOVERY_UNAVAILABLE_CODE = 'SCHEMA_RECOVERY_VIA_RELEASE_ONLY' as const;

function recoveryUnavailableResponse(c: {
  json: (
    body: {
      status: 'unavailable';
      code: typeof SCHEMA_RECOVERY_UNAVAILABLE_CODE;
      message: string;
    },
    status: 410
  ) => Response;
}) {
  return c.json(
    {
      status: 'unavailable',
      code: SCHEMA_RECOVERY_UNAVAILABLE_CODE,
      message: SCHEMA_RECOVERY_UNAVAILABLE_MESSAGE,
    },
    410
  );
}

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
  } catch (err: unknown) {
    return c.json({ status: 'error', message: getErrorMessage(err) }, 500);
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
      const missing = requiredCols.filter((col) => !existingCols.includes(col));

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
  } catch (err: unknown) {
    return c.json({ status: 'error', message: getErrorMessage(err) }, 500);
  }
});

/**
 * POST /api/migrate/reset
 * Permanently unavailable: clearing ledgers cannot trigger request-time recovery.
 */
migrateRoutes.post('/reset', (c) => recoveryUnavailableResponse(c));

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
  } catch (err: unknown) {
    return c.json({ status: 'error', message: getErrorMessage(err) }, 500);
  }
});

/**
 * POST /api/migrate/rebuild
 * Permanently unavailable: dropping tables cannot trigger request-time recovery.
 */
migrateRoutes.post('/rebuild', (c) => recoveryUnavailableResponse(c));

/**
 * POST /api/migrate/run-init
 * Execute the full 0000_nebulous_steve_rogers baseline migration directly
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
      } catch (err: unknown) {
        const errorMsg = getErrorMessage(err);
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
  } catch (err: unknown) {
    return c.json({ status: 'error', message: getErrorMessage(err) }, 500);
  }
});

export default migrateRoutes;
