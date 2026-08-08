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

/** Graceful client teardown; never let end() stall the readiness caller. */
async function endClientQuietly(client: pg.Client): Promise<void> {
  await Promise.race([
    client.end().catch(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    }),
  ]);
}

/** Hard-close path for timed-out probes (socket destroy + bounded end). */
async function forceEndClient(client: pg.Client): Promise<void> {
  destroyClientSocket(client);
  await endClientQuietly(client);
}

/**
 * Bounded readiness probe via a short-lived `pg.Client`.
 *
 * Uses the same TLS policy as {@link createPostgresAdapter} (`strictDefault:
 * true`) so a self-signed/invalid cert cannot pass readiness while the app
 * pool fails. SSL mode still comes from {@link parseSSLConfig} (sslmode /
 * DB_TLS_REJECT_UNAUTHORIZED / env defaults) — policy is not duplicated here.
 *
 * Uses connection/query timeouts and always tears down the client. Socket
 * destruction is reserved for the hard-timeout path so a successful ping is
 * not followed by an abrupt destroy.
 */
export async function pingDatabaseForReadiness(
  connectionString: string,
  options?: { timeoutMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_DB_READINESS_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive finite number');
  }

  // Match createPostgresAdapter TLS strictness (not the lenient web createClient default).
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    ssl: parseSSLConfig(connectionString, { strictDefault: true }),
  });

  let settled = false;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        timedOut = true;
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
    if (timedOut) {
      await forceEndClient(client);
    } else {
      await endClientQuietly(client);
    }
  }
}
