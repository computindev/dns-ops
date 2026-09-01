import type { IDatabaseAdapter } from '@dns-ops/db';

export type Env = {
  Bindings: {
    DATABASE_URL?: string;
    HYPERDRIVE_URL?: string;
    COLLECTOR_URL?: string;
    INTERNAL_SECRET?: string;
    API_KEY_SECRET?: string;
    /** JSON array of static API principals containing only SHA-256 token hashes. */
    API_PRINCIPALS_JSON?: string;
    /** One-release legacy tenantId:actorId:secret gate; literal "true" only. */
    ENABLE_LEGACY_API_KEY_AUTH?: string;
    ADMIN_EMAILS?: string;
    /** JSON array of static MCP principals containing only SHA-256 token hashes. */
    MCP_PRINCIPALS_JSON?: string;
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
