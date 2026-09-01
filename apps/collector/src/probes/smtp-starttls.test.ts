/**
 * SMTP STARTTLS SSRF unit tests — DNS rebinding mitigation (Issue #67 review, P1)
 *
 * A persisted MX hostname can pass the hostname-string SSRF check and still
 * resolve (at connect time) to a private/reserved address. These tests prove
 * that the probe:
 * - fails closed when the hostname resolves to a private/loopback IP;
 * - pins the socket connection to the IP that passed the SSRF check (Node
 *   never re-resolves the hostname);
 * - fails closed on DNS resolution errors instead of falling back to
 *   hostname-based connect (which would re-open the TOCTOU gap).
 *
 * No real network is used: node:dns and the net.Socket are mocked.
 */

import { promises as dnsPromises } from 'node:dns';
import { Socket } from 'node:net';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { probeSMTPStarttls } from './smtp-starttls.js';

vi.mock('node:dns', () => ({
  promises: {
    lookup: vi.fn(),
  },
}));

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  const { EventEmitter } = await import('node:events');

  /**
   * Minimal fake SMTP socket that records the connect target and serves a
   * fixed 220 banner plus an EHLO response without STARTTLS.
   */
  class FakeSocket extends EventEmitter {
    static instances: FakeSocket[] = [];

    connectArgs: { port: number; host: string } | null = null;

    constructor() {
      super();
      FakeSocket.instances.push(this);
    }

    connect(port: number, host: string): this {
      this.connectArgs = { port, host };
      setImmediate(() => {
        this.emit('connect');
        // Data arrives after the connect promise continuation has
        // registered the banner reader.
        setImmediate(() => {
          this.emit('data', Buffer.from('220 fake-mx.example ESMTP ready\r\n'));
        });
      });
      return this;
    }

    setTimeout(_ms: number): this {
      return this;
    }

    write(chunk: string): boolean {
      if (chunk.startsWith('EHLO')) {
        setImmediate(() => {
          this.emit('data', Buffer.from('250-fake-mx.example\r\n250 HELP\r\n'));
        });
      }
      return true;
    }

    destroy(): this {
      return this;
    }

    end(): this {
      return this;
    }
  }

  return { ...actual, Socket: FakeSocket };
});

const mockLookup = dnsPromises.lookup as ReturnType<typeof vi.fn>;

/** Sockets created since the last reset (real module code news one per probe). */
function createdSockets(): Array<{ connectArgs: { port: number; host: string } | null }> {
  return (Socket as unknown as { instances: unknown[] }).instances as Array<{
    connectArgs: { port: number; host: string } | null;
  }>;
}

function resetSockets(): void {
  (Socket as unknown as { instances: unknown[] }).instances = [];
}

beforeEach(() => {
  mockLookup.mockReset();
  resetSockets();
});

describe('probeSMTPStarttls — resolved-IP SSRF pinning (Issue #67 review, P1)', () => {
  it('fails closed when the hostname resolves to a loopback IP and never creates a socket', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });

    const result = await probeSMTPStarttls('rebind.attacker.example', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
    expect(result.error).toContain('127.0.0.1');
    expect(createdSockets()).toHaveLength(0);
  });

  it('fails closed when the hostname resolves to a private IP and never creates a socket', async () => {
    mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 });

    const result = await probeSMTPStarttls('rebind.attacker.example', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
    expect(result.error).toContain('10.0.0.1');
    expect(createdSockets()).toHaveLength(0);
  });

  it('fails closed when the hostname resolves to a private IPv6 address', async () => {
    mockLookup.mockResolvedValue({ address: 'fc00::1', family: 6 });

    const result = await probeSMTPStarttls('rebind6.attacker.example', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
    expect(result.error).toContain('fc00::1');
    expect(createdSockets()).toHaveLength(0);
  });

  it('connects to the checked public IP, not the hostname', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      port: 25,
      checkAllowlist: false,
      timeoutMs: 5000,
    });

    expect(result.success).toBe(true);
    expect(result.supportsStarttls).toBe(false);
    expect(mockLookup).toHaveBeenCalledWith('mail.example.com');

    const sockets = createdSockets();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].connectArgs).toEqual({ port: 25, host: '93.184.216.34' });
  });

  it('fails closed on DNS resolution errors instead of reconnecting by hostname', async () => {
    mockLookup.mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND mail.example.com'), { code: 'ENOTFOUND' })
    );

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('mail.example.com');
    expect(result.error).toContain('ENOTFOUND');
    expect(createdSockets()).toHaveLength(0);
  });
});
