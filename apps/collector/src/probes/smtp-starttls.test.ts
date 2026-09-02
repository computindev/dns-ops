/**
 * SMTP STARTTLS SSRF unit tests — DNS rebinding mitigation (Issue #67 review, P1)
 * plus the TLS trust contract (Issue #74).
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
 * The trust-contract tests prove `success` requires negotiated,
 * chain-authorized, hostname-authorized TLS (real `tls.checkServerIdentity`
 * evaluates the fake certificate SAN), that invalid certificates survive as
 * diagnostic evidence, and that no QUIT is sent over an untrusted session.
 *
 * No real network is used: node:dns and the net.Socket are mocked.
 */

import { promises as dnsPromises } from 'node:dns';
import { Socket } from 'node:net';
import * as tls from 'node:tls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeAllowlistManager } from './allowlist.js';
import { resetProbeSemaphore } from './semaphore.js';
import { probeMXHosts, probeSMTPStarttls } from './smtp-starttls.js';

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
    destroyed = false;

    constructor() {
      super();
      FakeSocket.instances.push(this);
    }

    connect(port: number, host: string): this {
      this.connectArgs = { port, host };
      if (stallPhase === 'connect') return this;
      const emitResponse = () => {
        this.emit('connect');
        // Data arrives after the connect promise continuation has
        // registered the banner reader.
        const emitBanner = () => {
          if (stallPhase !== 'banner') {
            this.emit('data', Buffer.from('220 fake-mx.example ESMTP ready\r\n'));
          }
        };
        if (responseDelayMs > 0) setTimeout(emitBanner, responseDelayMs);
        else setImmediate(emitBanner);
      };
      if (socketConnectDelayMs > 0) setTimeout(emitResponse, socketConnectDelayMs);
      else setImmediate(emitResponse);
      return this;
    }

    setTimeout(_ms: number): this {
      return this;
    }

    write(chunk: string): boolean {
      if (chunk.startsWith('EHLO') && stallPhase !== 'ehlo') {
        const emitEhlo = () => {
          const capabilities = ehloAdvertisesStarttls
            ? '250-fake-mx.example\r\n250-STARTTLS\r\n250 HELP\r\n'
            : '250-fake-mx.example\r\n250 HELP\r\n';
          this.emit('data', Buffer.from(capabilities));
        };
        if (responseDelayMs > 0) setTimeout(emitEhlo, responseDelayMs);
        else setImmediate(emitEhlo);
      } else if (chunk.startsWith('STARTTLS') && stallPhase !== 'starttls') {
        const emitStarttls = () =>
          this.emit(
            'data',
            Buffer.from(starttlsRejected ? '454 TLS not available\r\n' : '220 Ready\r\n')
          );
        if (responseDelayMs > 0) setTimeout(emitStarttls, responseDelayMs);
        else setImmediate(emitStarttls);
      }
      return true;
    }

    destroy(): this {
      this.destroyed = true;
      return this;
    }

    end(): this {
      return this;
    }
  }

  return { ...actual, Socket: FakeSocket };
});

vi.mock('node:tls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:tls')>();
  const { EventEmitter } = await import('node:events');

  class FakeTlsSocket extends EventEmitter {
    writes: string[] = [];
    destroyed = false;
    readonly authorized: boolean;
    readonly authorizationError: string | Error | undefined;

    constructor(options: Record<string, unknown>) {
      super();
      this.servername = typeof options.servername === 'string' ? options.servername : undefined;
      this.authorized = tlsChainAuthorized;
      this.authorizationError = tlsChainAuthorized ? undefined : tlsAuthorizationError;
      tlsSocketViews.push(this);
      if (stallPhase !== 'tls') setImmediate(() => this.emit('secureConnect'));
    }

    setTimeout(_timeoutMs: number): this {
      return this;
    }

    getCipher() {
      return { name: 'TLS_AES_128_GCM_SHA256', version: 'TLSv1.3' };
    }

    getPeerCertificate() {
      if (!tlsProvidesCertificate) return {};
      return {
        subject: { CN: this.servername ?? 'fake-mx.example' },
        issuer: { CN: 'fake-ca' },
        subjectaltname: tlsHostnameAuthorized
          ? `DNS:${this.servername ?? 'fake-mx.example'}`
          : 'DNS:other-mx.example',
        valid_from: 'Jan 1 00:00:00 2026 GMT',
        valid_to: 'Jan 1 00:00:00 2027 GMT',
        fingerprint: 'AA:BB',
      };
    }

    write(chunk: string): boolean {
      this.writes.push(chunk);
      return true;
    }

    end(): this {
      return this;
    }

    destroy(): this {
      this.destroyed = true;
      return this;
    }
  }

  return {
    ...actual,
    connect: vi.fn((options: Record<string, unknown>) => new FakeTlsSocket(options)),
  };
});

const mockLookup = dnsPromises.lookup as ReturnType<typeof vi.fn>;
const mockTlsConnect = tls.connect as ReturnType<typeof vi.fn>;
type StallPhase = 'none' | 'dns' | 'connect' | 'banner' | 'ehlo' | 'starttls' | 'tls';
let stallPhase: StallPhase = 'none';
let socketConnectDelayMs = 0;
let responseDelayMs = 0;
let ehloAdvertisesStarttls = true;
let starttlsRejected = false;
let tlsChainAuthorized = true;
let tlsAuthorizationError: string | Error | undefined;
let tlsHostnameAuthorized = true;
let tlsProvidesCertificate = true;

/** TLS sockets created since the last reset, as seen by the assertions. */
const tlsSocketViews: Array<{ writes: string[]; destroyed: boolean }> = [];

/** Sockets created since the last reset (real module code news one per probe). */
function createdSockets(): Array<{
  connectArgs: { port: number; host: string } | null;
  destroyed: boolean;
}> {
  return (Socket as unknown as { instances: unknown[] }).instances as Array<{
    connectArgs: { port: number; host: string } | null;
    destroyed: boolean;
  }>;
}

function resetSockets(): void {
  (Socket as unknown as { instances: unknown[] }).instances = [];
}

beforeEach(() => {
  mockLookup.mockReset();
  mockTlsConnect.mockClear();
  stallPhase = 'none';
  socketConnectDelayMs = 0;
  responseDelayMs = 0;
  ehloAdvertisesStarttls = true;
  starttlsRejected = false;
  tlsChainAuthorized = true;
  tlsAuthorizationError = undefined;
  tlsHostnameAuthorized = true;
  tlsProvidesCertificate = true;
  tlsSocketViews.length = 0;
  resetSockets();
  resetProbeSemaphore(5);
});

afterEach(() => {
  vi.useRealTimers();
  resetProbeSemaphore(5);
  probeAllowlistManager.clearAll();
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

  it.each([
    'fc00::1',
    'fec0::1',
    '2606:4700:4700::1111',
    '::ffff:93.184.216.34',
  ])('fails closed for every IPv6 answer (%s) and never creates a socket', async (address) => {
    mockLookup.mockResolvedValue({ address, family: 6 });

    const result = await probeSMTPStarttls('rebind6.attacker.example', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
    expect(result.error).toContain(address);
    expect(createdSockets()).toHaveLength(0);
  });

  it.each([
    ['100.64.0.0', '100.64.0.0/10'],
    ['100.127.255.255', '100.64.0.0/10'],
    ['198.18.0.0', '198.18.0.0/15'],
    ['198.19.255.255', '198.18.0.0/15'],
  ])('rejects an IANA special-purpose resolved address at the %s boundary (%s)', async (address) => {
    mockLookup.mockResolvedValue({ address, family: 4 });

    const result = await probeSMTPStarttls('rebind-special.example', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain(`resolves to ${address}`);
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
    expect(result.supportsStarttls).toBe(true);
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

  it('bounds concurrent batch requests with the global semaphore', async () => {
    resetProbeSemaphore(1);
    socketConnectDelayMs = 100;
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    const allowlist = probeAllowlistManager.getTenantAllowlist('tenant-a');
    for (const hostname of ['first.example.com', 'second.example.com']) {
      allowlist.addCustomEntry(hostname, 25, 'test', 'concurrency test');
    }

    const first = probeMXHosts([{ hostname: 'first.example.com', priority: 10 }], 'tenant-a', {
      concurrency: 1,
    });
    const second = probeMXHosts([{ hostname: 'second.example.com', priority: 20 }], 'tenant-a', {
      concurrency: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(createdSockets()).toHaveLength(1);

    const results = await Promise.all([first, second]);
    expect(results.flat()).toHaveLength(2);
    expect(createdSockets()).toHaveLength(2);
  });

  it('does not start a later batch after shared evidence expires', async () => {
    const now = new Date();
    socketConnectDelayMs = 100;
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    const allowlist = probeAllowlistManager.getTenantAllowlist('tenant-a');
    allowlist.addCustomEntry('first.example.com', 25, 'test', 'expiry test');
    allowlist.addCustomEntry('second.example.com', 25, 'test', 'expiry test');

    const resultsPromise = probeMXHosts(
      [
        { hostname: 'first.example.com', priority: 10 },
        { hostname: 'second.example.com', priority: 20 },
      ],
      'tenant-a',
      { concurrency: 1, expiresAt: new Date(now.getTime() + 50) }
    );

    for (let i = 0; i < 100 && createdSockets().length === 0; i++) {
      await Promise.resolve();
    }
    expect(createdSockets()).toHaveLength(1);
    const results = await resultsPromise;

    expect(results).toHaveLength(2);
    expect(results[0]?.success).toBe(true);
    expect(results[1]).toMatchObject({
      success: false,
      error: 'Persisted DNS evidence expired before probe start',
    });
    expect(createdSockets()).toHaveLength(1);
  });

  it.each([
    'dns',
    'connect',
    'banner',
    'ehlo',
    'starttls',
    'tls',
  ] as StallPhase[])('returns within the cumulative deadline when %s stalls', async (phase) => {
    vi.useFakeTimers();
    stallPhase = phase;
    if (phase === 'dns') {
      mockLookup.mockReturnValue(new Promise(() => undefined));
    } else {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    }

    const resultPromise = probeSMTPStarttls(`stall-${phase}.example.com`, 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    const result = await resultPromise;

    expect(result).toMatchObject({ success: false, error: 'Timeout after 25ms' });
    expect(result.tlsNegotiated).toBe(false);
    expect(result.tlsTrusted).toBe(false);
    if (phase === 'tls') {
      // STARTTLS advertisement survives a later handshake failure.
      expect(result.supportsStarttls).toBe(true);
    }
    if (phase !== 'dns') expect(createdSockets()[0]?.destroyed).toBe(true);
  });

  it('destroys a socket when it emits timeout', async () => {
    stallPhase = 'banner';
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    const resultPromise = probeSMTPStarttls('socket-timeout.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
    }
    const socket = (Socket as unknown as { instances: Array<{ emit: (event: string) => void }> })
      .instances[0];
    socket?.emit('timeout');

    const result = await resultPromise;
    expect(result).toMatchObject({ success: false, error: 'Timeout after 1000ms' });
    expect(createdSockets()[0]?.destroyed).toBe(true);
  });

  it('keeps phase timeouts cumulative instead of resetting after each response', async () => {
    vi.useFakeTimers();
    socketConnectDelayMs = 10;
    responseDelayMs = 10;
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const resultPromise = probeSMTPStarttls('cumulative.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    const result = await resultPromise;

    expect(result).toMatchObject({ success: false, error: 'Timeout after 25ms' });
  });

  it('rejects an oversized SMTP response and destroys the socket', async () => {
    stallPhase = 'banner';
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    const resultPromise = probeSMTPStarttls('oversized.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
    }
    const socket = (
      Socket as unknown as { instances: Array<{ emit: (event: string, data: Buffer) => void }> }
    ).instances[0];
    socket?.emit('data', Buffer.alloc(65 * 1024));

    const result = await resultPromise;
    expect(result).toMatchObject({ success: false, error: 'SMTP response exceeded 65536 bytes' });
    expect(createdSockets()[0]?.destroyed).toBe(true);
  });

  it('releases a global permit when a stalled batch host times out', async () => {
    vi.useFakeTimers();
    resetProbeSemaphore(1);
    stallPhase = 'connect';
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    const allowlist = probeAllowlistManager.getTenantAllowlist('tenant-a');
    allowlist.addCustomEntry('stalled.example.com', 25, 'test', 'timeout test');
    allowlist.addCustomEntry('next.example.com', 25, 'test', 'timeout test');

    const first = probeMXHosts([{ hostname: 'stalled.example.com', priority: 10 }], 'tenant-a', {
      concurrency: 1,
      timeoutMs: 20,
    });
    const second = probeMXHosts([{ hostname: 'next.example.com', priority: 20 }], 'tenant-a', {
      concurrency: 1,
      timeoutMs: 20,
    });
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(20);
    const results = await Promise.all([first, second]);

    expect(results).toHaveLength(2);
    expect(results.flat()).toHaveLength(2);
    expect(createdSockets()).toHaveLength(2);
    expect(results.flat().every((result) => result.error === 'Timeout after 20ms')).toBe(true);
  });
});

describe('probeSMTPStarttls — STARTTLS capability reporting (Issue #74)', () => {
  it('reports STARTTLS absence as an unsuccessful, non-negotiated result', async () => {
    ehloAdvertisesStarttls = false;
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: false,
      supportsStarttls: false,
      tlsNegotiated: false,
      tlsTrusted: false,
      smtpBanner: '220 fake-mx.example ESMTP ready',
    });
    expect(result.error).toBeUndefined();
    expect(mockTlsConnect).not.toHaveBeenCalled();
  });

  it('retains a STARTTLS rejection as advertised but never trusted', async () => {
    starttlsRejected = true;
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: false,
      supportsStarttls: true,
      tlsNegotiated: false,
      tlsTrusted: false,
    });
    expect(result.error).toContain('STARTTLS rejected');
    expect(result.error).toContain('454');
    expect(mockTlsConnect).not.toHaveBeenCalled();
  });
});

describe('probeSMTPStarttls — diagnostic TLS trust contract (Issue #74)', () => {
  it('succeeds only for negotiated, chain- and hostname-authorized TLS', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: true,
      supportsStarttls: true,
      tlsNegotiated: true,
      tlsTrusted: true,
      tlsVersion: 'TLSv1.3',
      tlsCipher: 'TLS_AES_128_GCM_SHA256',
    });
    expect(result.error).toBeUndefined();
    expect(result.certificate).toMatchObject({
      subject: 'mail.example.com',
      issuer: 'fake-ca',
      fingerprint: 'AA:BB',
      chainAuthorized: true,
      hostnameAuthorized: true,
      authorizationError: undefined,
    });

    // One pinned diagnostic handshake: the TLS layer wraps the exact raw
    // socket, keeps SNI on the original hostname, is permissive only to
    // retain evidence, and leaves hostname evaluation to the explicit
    // checkServerIdentity call.
    expect(mockTlsConnect).toHaveBeenCalledTimes(1);
    const connectOptions = mockTlsConnect.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(connectOptions.socket).toBe(
      (Socket as unknown as { instances: unknown[] }).instances[0]
    );
    expect(connectOptions).toMatchObject({
      servername: 'mail.example.com',
      rejectUnauthorized: false,
    });
    expect(
      (connectOptions.checkServerIdentity as (h: string, c: unknown) => undefined | Error)?.(
        'mail.example.com',
        {}
      )
    ).toBeUndefined();

    const tlsSockets = tlsSocketViews;
    expect(tlsSockets).toHaveLength(1);
    expect(tlsSockets[0]?.writes).toEqual(['QUIT\r\n']);
  });

  it('preserves an expired certificate as diagnostic evidence and never trusts it', async () => {
    tlsChainAuthorized = false;
    tlsAuthorizationError = new Error('certificate has expired');
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: false,
      supportsStarttls: true,
      tlsNegotiated: true,
      tlsTrusted: false,
      tlsVersion: 'TLSv1.3',
    });
    expect(result.certificate).toMatchObject({
      fingerprint: 'AA:BB',
      chainAuthorized: false,
      hostnameAuthorized: true,
    });
    expect(result.certificate?.authorizationError).toContain('certificate has expired');
    expect(result.error).toContain('TLS certificate not trusted');
    expect(result.error).toContain('certificate has expired');
  });

  it('preserves a string-valued chain authorization error exactly', async () => {
    tlsChainAuthorized = false;
    tlsAuthorizationError = 'DEPTH_ZERO_SELF_SIGNED_CERT';
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.certificate?.authorizationError).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
    expect(result.error).toBe('TLS certificate not trusted: DEPTH_ZERO_SELF_SIGNED_CERT');
  });

  it('preserves a hostname-mismatch certificate and never trusts it', async () => {
    tlsHostnameAuthorized = false;
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: false,
      tlsNegotiated: true,
      tlsTrusted: false,
    });
    expect(result.certificate).toMatchObject({
      chainAuthorized: true,
      hostnameAuthorized: false,
    });
    expect(result.certificate?.authorizationError).toContain("not in the cert's altnames");
    expect(result.error).toContain('TLS certificate not trusted');
  });

  it('preserves an untrusted-chain certificate and never trusts it', async () => {
    tlsChainAuthorized = false;
    tlsAuthorizationError = new Error('unable to verify the first certificate');
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: false,
      tlsNegotiated: true,
      tlsTrusted: false,
    });
    expect(result.certificate).toMatchObject({
      chainAuthorized: false,
      hostnameAuthorized: true,
    });
    expect(result.certificate?.authorizationError).toContain(
      'unable to verify the first certificate'
    );
  });

  it('never sends QUIT over an untrusted TLS session', async () => {
    tlsHostnameAuthorized = false;
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result.tlsTrusted).toBe(false);
    const tlsSockets = tlsSocketViews;
    expect(tlsSockets[0]?.writes).toEqual([]);
    expect(tlsSockets[0]?.destroyed).toBe(true);
  });

  it('fails closed when the TLS session provides no usable peer certificate', async () => {
    tlsProvidesCertificate = false;
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await probeSMTPStarttls('mail.example.com', 'tenant-a', {
      checkAllowlist: false,
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      success: false,
      supportsStarttls: true,
      tlsNegotiated: false,
      tlsTrusted: false,
    });
    expect(result.error).toBe('TLS handshake completed without a usable peer certificate');
    expect(result.certificate).toBeUndefined();
    // The session is destroyed, not completed with QUIT.
    expect(tlsSocketViews[0]?.writes).toEqual([]);
    expect(tlsSocketViews[0]?.destroyed).toBe(true);
  });
});
