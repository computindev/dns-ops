/**
 * Database Middleware
 *
 * Sets up database context for collector routes.
 * Creates a PostgreSQL adapter once per process and attaches it to the Hono context.
 *
 * Readiness checks must call checkDatabaseReady() which runs a real SELECT 1 —
 * constructing the adapter alone is not proof the database is reachable.
 */

import type { IDatabaseAdapter } from '@dns-ops/db';
import { createPostgresAdapter, pingDatabase } from '@dns-ops/db';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types.js';
import { getCollectorLogger } from './error-tracking.js';

const logger = getCollectorLogger();

let sharedAdapter: IDatabaseAdapter | null = null;
let sharedDatabaseUrl: string | null = null;

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  return databaseUrl;
}

export function getSharedDbAdapter(): IDatabaseAdapter {
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
export function resetSharedDbAdapterForTests(): void {
  sharedAdapter = null;
  sharedDatabaseUrl = null;
}

/**
 * Prove the configured database is reachable with a bounded SELECT 1.
 * Adapter construction alone is not sufficient (false-green).
 */
export async function checkDatabaseReady(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const db = getSharedDbAdapter();
    await pingDatabase(db);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'DB check failed',
    };
  }
}

export const dbMiddleware = createMiddleware<Env>(async (c, next) => {
  try {
    c.set('db', getSharedDbAdapter());
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to create database adapter', err, {
      path: c.req.path,
      method: c.req.method,
    });
    return c.json(
      {
        error: 'Database connection error',
        message: err.message,
      },
      500
    );
  }

  return next();
});

export const dbMiddlewareStrict = createMiddleware<Env>(async (c, next) => {
  c.set('db', getSharedDbAdapter());
  return next();
});
