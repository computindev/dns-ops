import { Hono } from 'hono';
import { dbMiddleware } from '../middleware/db.js';
import type { Env } from '../types.js';
import { mcpRoutes } from './mcp.js';

/**
 * Server-only MCP app. It is mounted from the TanStack SSR entrypoint so `/mcp`
 * never enters the browser route graph or relies on the `/api` application path.
 */
export const mcpServer = new Hono<Env>();
mcpServer.use('*', dbMiddleware);
mcpServer.route('/mcp', mcpRoutes);
