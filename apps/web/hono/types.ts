import type { IDatabaseAdapter } from '@dns-ops/db';

export type Env = {
  Bindings: {
    DATABASE_URL?: string;
    HYPERDRIVE_URL?: string;
    COLLECTOR_URL?: string;
    INTERNAL_SECRET?: string;
    API_KEY_SECRET?: string;
    ADMIN_EMAILS?: string;
    /** Cloudflare Workers environment */
    NODE_ENV?: string;
    /** Cloudflare Workers ASSETS binding */
    ASSETS?: unknown;
    /** Cloudflare Workers Hyperdrive binding */
    HYPERDRIVE?: unknown;
  };
  Variables: {
    db: IDatabaseAdapter;
    tenantId?: string;
    actorId?: string;
    actorEmail?: string;
    /** Unique request ID for tracing (set by middleware) */
    requestId?: string;
  };
};
