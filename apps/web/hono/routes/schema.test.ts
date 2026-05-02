/**
 * Schema Validation Test
 *
 * Tests that verify all required database tables and columns exist.
 */

import { createPostgresAdapter } from '@dns-ops/db';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

// Tables we actually use in production code
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

const hasDatabaseUrl = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabaseUrl)('Database Schema', () => {
  let db: ReturnType<typeof createPostgresAdapter>;

  beforeAll(() => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for tests');
    }
    db = createPostgresAdapter(connectionString);
  });

  describe('Required Tables', () => {
    for (const table of REQUIRED_TABLES) {
      it(`should have ${table} table`, async () => {
        const result = await db.execute(sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = ${table}
          ) as exists
        `);

        const rows = (result as any).rows;
        expect(rows[0].exists).toBe(true);
      });
    }
  });

  describe('No missing columns in critical tables', () => {
    it('should have all expected columns in all required tables', async () => {
      const issues: string[] = [];

      for (const table of REQUIRED_TABLES) {
        // Get columns for this table
        const colResult = await db.execute(sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = ${table}
        `);

        const colRows = (colResult as any).rows;
        const columns = colRows.map((r: any) => r.column_name);

        // Check it has an 'id' column (all tables should)
        if (!columns.includes('id')) {
          issues.push(`${table}: missing 'id'`);
        }

        // Check tenant_id for multi-tenant tables
        if (!['users', 'sessions'].includes(table) && !columns.includes('tenant_id')) {
          issues.push(`${table}: missing 'tenant_id'`);
        }
      }

      if (issues.length > 0) {
        console.error('Schema issues:', issues);
      }

      expect(issues).toEqual([]);
    });
  });

  describe('Primary keys exist', () => {
    it('should have primary keys on all tables', async () => {
      for (const table of REQUIRED_TABLES) {
        const result = await db.execute(sql`
          SELECT COUNT(*) as count
          FROM information_schema.table_constraints
          WHERE constraint_type = 'PRIMARY KEY' AND table_name = ${table}
        `);

        const rows = (result as any).rows;
        expect(Number(rows[0].count)).toBeGreaterThan(0);
      }
    });
  });
});
