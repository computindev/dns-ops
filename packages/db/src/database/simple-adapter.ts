/**
 * Simple Database Adapter
 *
 * Type-safe adapter using type assertions to work around
 * Drizzle's strict typing while maintaining clean interfaces.
 */

import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTable } from 'drizzle-orm/pg-core';
import type * as schema from '../schema/index.js';

type Schema = typeof schema;
type AnyDrizzleDB = NodePgDatabase<Schema> | DrizzleD1Database<Schema>;

/**
 * Simple database adapter that works with both PostgreSQL and D1
 * Uses type assertions to work around Drizzle's complex union types
 */
export class SimpleDatabaseAdapter {
  constructor(
    private db: AnyDrizzleDB,
    public readonly type: 'postgres' | 'd1'
  ) {}

  /**
   * Get underlying Drizzle instance (for advanced use cases)
   */
  getDrizzle(): AnyDrizzleDB {
    return this.db;
  }

  /**
   * Execute a raw SQL query
   */
  async execute(query: SQLWrapper): Promise<unknown> {
    const db = this.db as NodePgDatabase<Schema>;
    return db.execute(query);
  }

  /**
   * Select all records from table
   */
  async select<T extends PgTable>(table: T): Promise<Array<T['$inferSelect']>> {
    const db = this.db as NodePgDatabase<Schema>;
    return await db.select().from(table);
  }

  /**
   * Select records matching condition
   */
  async selectWhere<T extends PgTable>(
    table: T,
    condition: SQL
  ): Promise<Array<T['$inferSelect']>> {
    const db = this.db as NodePgDatabase<Schema>;
    return await db.select().from(table).where(condition);
  }

  /**
   * Select single record matching condition
   */
  async selectOne<T extends PgTable>(
    table: T,
    condition: SQL
  ): Promise<T['$inferSelect'] | undefined> {
    const db = this.db as NodePgDatabase<Schema>;
    const results = await db.select().from(table).where(condition).limit(1);
    return results[0];
  }

  /**
   * Insert single record
   */
  async insert<T extends PgTable>(table: T, values: T['$inferInsert']): Promise<T['$inferSelect']> {
    const db = this.db as NodePgDatabase<Schema>;
    const results = await db.insert(table).values(values).returning();
    return results[0];
  }

  /**
   * Insert multiple records
   */
  async insertMany<T extends PgTable>(
    table: T,
    values: T['$inferInsert'][]
  ): Promise<T['$inferSelect'][]> {
    const db = this.db as NodePgDatabase<Schema>;
    return await db.insert(table).values(values).returning();
  }

  /**
   * Update records matching condition
   */
  async update<T extends PgTable>(
    table: T,
    values: Partial<T['$inferInsert']>,
    condition: SQL
  ): Promise<T['$inferSelect'][]> {
    const db = this.db as NodePgDatabase<Schema>;
    return await db.update(table).set(values).where(condition).returning();
  }

  /**
   * Update single record
   */
  async updateOne<T extends PgTable>(
    table: T,
    values: Partial<T['$inferInsert']>,
    condition: SQL
  ): Promise<T['$inferSelect'] | undefined> {
    const db = this.db as NodePgDatabase<Schema>;
    const results = await db.update(table).set(values).where(condition).returning();
    return results[0];
  }

  /**
   * Delete records matching condition
   */
  async delete<T extends PgTable>(table: T, condition: SQL): Promise<T['$inferSelect'][]> {
    const db = this.db as NodePgDatabase<Schema>;
    return await db.delete(table).where(condition).returning();
  }

  /**
   * Delete single record
   */
  async deleteOne<T extends PgTable>(
    table: T,
    condition: SQL
  ): Promise<T['$inferSelect'] | undefined> {
    const db = this.db as NodePgDatabase<Schema>;
    const results = await db.delete(table).where(condition).returning();
    return results[0];
  }

  /**
   * Execute within a transaction
   */
  async transaction<T>(callback: (adapter: SimpleDatabaseAdapter) => Promise<T>): Promise<T> {
    const db = this.db as NodePgDatabase<Schema>;
    return await db.transaction(async (tx) => {
      const txAdapter = new SimpleDatabaseAdapter(tx as AnyDrizzleDB, this.type);
      return await callback(txAdapter);
    });
  }
}

/**
 * Create adapter from Drizzle instance
 */
export function createSimpleAdapter(
  db: AnyDrizzleDB,
  type: 'postgres' | 'd1'
): SimpleDatabaseAdapter {
  return new SimpleDatabaseAdapter(db, type);
}

// Export type for consumers
export type { SimpleDatabaseAdapter as IDatabaseAdapter };
