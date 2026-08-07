/**
 * Bounded database connectivity probe.
 *
 * Used by readiness/health endpoints to prove the dependency is reachable
 * rather than merely that an adapter object was constructed.
 */

import { sql } from 'drizzle-orm';
import type { IDatabaseAdapter } from './database/simple-adapter.js';

/**
 * Execute a single round-trip `SELECT 1` against the given adapter.
 * Rejects if the database is unreachable or the query fails.
 */
export async function pingDatabase(db: IDatabaseAdapter): Promise<void> {
  await db.execute(sql`SELECT 1`);
}
