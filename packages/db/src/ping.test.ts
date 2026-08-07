/**
 * Bounded readiness probe tests (RT-3).
 *
 * Covers the timeout/blackhole path deterministically without Docker:
 * a TCP server accepts connections but never speaks the Postgres protocol.
 */

import { type AddressInfo, createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IDatabaseAdapter } from './database/simple-adapter.js';
import { DEFAULT_DB_READINESS_TIMEOUT_MS, pingDatabase, pingDatabaseForReadiness } from './ping.js';

async function listenBlackhole(): Promise<{ server: Server; port: number }> {
  const server = createServer((_socket) => {
    // Accept TCP but never complete the Postgres startup handshake.
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { server, port: address.port };
}

describe('pingDatabase (adapter, unbounded)', () => {
  it('resolves when adapter execute succeeds', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    } as unknown as IDatabaseAdapter;

    await expect(pingDatabase(db)).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects when adapter execute fails', async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as IDatabaseAdapter;

    await expect(pingDatabase(db)).rejects.toThrow(/connection refused/);
  });
});

describe('pingDatabaseForReadiness (bounded)', () => {
  let blackhole: { server: Server; port: number } | undefined;

  afterEach(async () => {
    if (!blackhole) return;
    const { server } = blackhole;
    blackhole = undefined;
    await new Promise<void>((resolve) => {
      // Drop any lingering accepted sockets so close() cannot hang the suite.
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close(() => resolve());
      setTimeout(resolve, 200);
    });
  });

  it('exports a positive default readiness timeout', () => {
    expect(DEFAULT_DB_READINESS_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DEFAULT_DB_READINESS_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it('rejects invalid timeoutMs', async () => {
    await expect(
      pingDatabaseForReadiness('postgresql://postgres:postgres@127.0.0.1:1/postgres', {
        timeoutMs: 0,
      })
    ).rejects.toThrow(/timeoutMs/);
  });

  it('fails quickly against a refused port', async () => {
    const started = Date.now();
    await expect(
      pingDatabaseForReadiness('postgresql://postgres:postgres@127.0.0.1:1/postgres', {
        timeoutMs: 500,
      })
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('times out against a TCP blackhole without hanging past the bound', async () => {
    blackhole = await listenBlackhole();
    const url = `postgresql://postgres:postgres@127.0.0.1:${blackhole.port}/postgres`;
    const timeoutMs = 250;
    const started = Date.now();

    await expect(pingDatabaseForReadiness(url, { timeoutMs })).rejects.toThrow(
      /timed out after 250ms/i
    );

    const elapsed = Date.now() - started;
    // Must settle near the bound — not hang for tens of seconds.
    expect(elapsed).toBeGreaterThanOrEqual(timeoutMs - 50);
    expect(elapsed).toBeLessThan(timeoutMs + 1_500);
  });
});
