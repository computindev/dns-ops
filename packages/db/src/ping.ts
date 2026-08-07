/**
 * Database connectivity probes.
 *
 * - pingDatabase: ordinary adapter round-trip (no readiness timeout).
 * - pingDatabaseForReadiness: short-lived client with a hard bound so a
 *   blackholed TCP peer cannot stall the readiness endpoint forever.
 *
 * Readiness timeouts are intentionally NOT applied to shared pools used by
 * migrations or application queries.
 */

import { sql } from 'drizzle-orm';
import pg from 'pg';
import { parseSSLConfig } from './client.js';
import type { IDatabaseAdapter } from './database/simple-adapter.js';

/** Default bound for readiness-only probes (not ordinary queries). */
export const DEFAULT_DB_READINESS_TIMEOUT_MS = 2_000;

/**
 * Execute a single round-trip `SELECT 1` against the given adapter.
 * Rejects if the database is unreachable or the query fails.
 *
 * No timeout is imposed here — callers that need a bound (readiness) must
 * use {@link pingDatabaseForReadiness} instead.
 */
export async function pingDatabase(db: IDatabaseAdapter): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

function destroyClientSocket(client: pg.Client): void {
  try {
    const connection = (client as unknown as { connection?: { stream?: NodeJS.ReadWriteStream } })
      .connection;
    const stream = connection?.stream as { destroy?: () => void } | undefined;
    stream?.destroy?.();
  } catch {
    // best-effort hard close
  }
}

async function forceEndClient(client: pg.Client): Promise<void> {
  destroyClientSocket(client);
  await Promise.race([
    client.end().catch(() => undefined),
    // Never let teardown stall the readiness caller.
    new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    }),
  ]);
}

/**
 * Bounded readiness probe via a short-lived `pg.Client`.
 *
 * Uses connection/query timeouts and always tears down the client (including
 * destroying the socket on timeout) so neither the probe promise nor an
 * in-flight connect is left hanging indefinitely.
 */
export async function pingDatabaseForReadiness(
  connectionString: string,
  options?: { timeoutMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_DB_READINESS_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive finite number');
  }

  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    ssl: parseSSLConfig(connectionString),
  });

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        destroyClientSocket(client);
        reject(new Error(`Database readiness probe timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      void client
        .connect()
        .then(() => client.query('SELECT 1'))
        .then(() => {
          if (settled) return;
          settled = true;
          resolve();
        })
        .catch((error: unknown) => {
          if (settled) return;
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  } finally {
    if (timer) clearTimeout(timer);
    await forceEndClient(client);
  }
}
