/**
 * Database Middleware
 *
 * Sets up database context for collector routes.
 * Creates a PostgreSQL adapter once per process and attaches it to the Hono context.
 */
import type { IDatabaseAdapter } from '@dns-ops/db';
import type { Env } from '../types.js';
export declare function getSharedDbAdapter(): IDatabaseAdapter;
export declare const dbMiddleware: import("hono").MiddlewareHandler<Env, any, {}>;
export declare const dbMiddlewareStrict: import("hono").MiddlewareHandler<Env, any, {}>;
//# sourceMappingURL=db.d.ts.map