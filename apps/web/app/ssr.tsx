import { getRouterManifest } from '@tanstack/react-start/router-manifest';
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { mcpServer } from '../hono/routes/mcp-server.js';
import { createRouter } from './router.js';

/**
 * `/mcp` is a server-only transport endpoint. Keeping it here avoids importing
 * Hono, PostgreSQL, or Node-only security code into the browser route graph.
 */
export default createStartHandler({ createRouter, getRouterManifest })(async (context) => {
  const url = new URL(context.request.url);
  if (url.pathname === '/mcp' && context.request.method === 'POST') {
    return mcpServer.fetch(context.request, {});
  }
  return defaultStreamHandler(context);
});
