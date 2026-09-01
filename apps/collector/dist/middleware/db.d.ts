/**
 * Database Middleware
 *
 * Sets up database context for collector routes.
 * Creates a PostgreSQL adapter once per process and attaches it to the Hono context.
 *
 * Readiness checks must call checkDatabaseReady() which runs a bounded real
 * SELECT 1 via a short-lived client — constructing the adapter alone is not
 * proof the database is reachable, and ordinary shared-pool queries must not
 * inherit the readiness timeout.
 */
import type { IDatabaseAdapter } from '@dns-ops/db';
import type { Env } from '../types.js';
/** Public-safe message — never echo driver/host/user details on readiness. */
export declare const PUBLIC_DB_NOT_READY_MESSAGE = "Database unreachable";
export declare function getSharedDbAdapter(): IDatabaseAdapter;
/**
 * Reset the process-scoped adapter cache.
 * Intended for tests that change DATABASE_URL between cases.
 */
export declare function resetSharedDbAdapterForTests(): void;
/**
 * Prove the configured database is reachable with a bounded SELECT 1.
 * Adapter construction alone is not sufficient (false-green).
 *
 * Uses a short-lived client with an explicit timeout so a blackholed peer
 * cannot stall readiness. Does not apply that timeout to the shared adapter
 * used by ordinary application queries.
 */
export declare function checkDatabaseReady(options?: {
    timeoutMs?: number;
}): Promise<{
    ok: true;
} | {
    ok: false;
    message: string;
}>;
export declare const dbMiddleware: import("hono").MiddlewareHandler<Env, any, {}>;
export declare const dbMiddlewareStrict: import("hono").MiddlewareHandler<Env, any, {}>;
//# sourceMappingURL=db.d.ts.map