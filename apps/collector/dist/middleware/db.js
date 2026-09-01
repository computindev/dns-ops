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
import { createPostgresAdapter, pingDatabaseForReadiness } from '@dns-ops/db';
import { createMiddleware } from 'hono/factory';
import { getCollectorLogger } from './error-tracking.js';
const logger = getCollectorLogger();
/** Public-safe message — never echo driver/host/user details on readiness. */
export const PUBLIC_DB_NOT_READY_MESSAGE = 'Database unreachable';
let sharedAdapter = null;
let sharedDatabaseUrl = null;
function getDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
    }
    return databaseUrl;
}
export function getSharedDbAdapter() {
    const databaseUrl = getDatabaseUrl();
    if (!sharedAdapter || sharedDatabaseUrl !== databaseUrl) {
        sharedAdapter = createPostgresAdapter(databaseUrl);
        sharedDatabaseUrl = databaseUrl;
    }
    return sharedAdapter;
}
/**
 * Reset the process-scoped adapter cache.
 * Intended for tests that change DATABASE_URL between cases.
 */
export function resetSharedDbAdapterForTests() {
    sharedAdapter = null;
    sharedDatabaseUrl = null;
}
/**
 * Prove the configured database is reachable with a bounded SELECT 1.
 * Adapter construction alone is not sufficient (false-green).
 *
 * Uses a short-lived client with an explicit timeout so a blackholed peer
 * cannot stall readiness. Does not apply that timeout to the shared adapter
 * used by ordinary application queries.
 */
export async function checkDatabaseReady(options) {
    try {
        const databaseUrl = getDatabaseUrl();
        await pingDatabaseForReadiness(databaseUrl, options);
        // Warm the shared adapter only after connectivity is proven.
        getSharedDbAdapter();
        return { ok: true };
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : 'DB check failed';
        logger.error('Database readiness check failed', error instanceof Error ? error : new Error(detail), {
            path: '/readyz',
        });
        return {
            ok: false,
            // Never surface driver/host/user material on the public readiness body.
            message: PUBLIC_DB_NOT_READY_MESSAGE,
        };
    }
}
export const dbMiddleware = createMiddleware(async (c, next) => {
    try {
        c.set('db', getSharedDbAdapter());
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to create database adapter', err, {
            path: c.req.path,
            method: c.req.method,
        });
        return c.json({
            error: 'Database connection error',
            message: err.message,
        }, 500);
    }
    return next();
});
export const dbMiddlewareStrict = createMiddleware(async (c, next) => {
    c.set('db', getSharedDbAdapter());
    return next();
});
//# sourceMappingURL=db.js.map