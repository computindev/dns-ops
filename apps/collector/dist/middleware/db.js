/**
 * Database Middleware
 *
 * Sets up database context for collector routes.
 * Creates a PostgreSQL adapter once per process and attaches it to the Hono context.
 */
import { createPostgresAdapter } from '@dns-ops/db';
import { createMiddleware } from 'hono/factory';
import { getCollectorLogger } from './error-tracking.js';
const logger = getCollectorLogger();
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