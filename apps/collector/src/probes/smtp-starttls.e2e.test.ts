/** Deterministic SMTP STARTTLS integration fixtures. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { probeSMTPStarttls } from './smtp-starttls.js';

interface FixtureSocketView {
  connectArgs: { port: number; host: string } | null;
  writes: string[];
  destroyed: boolean;
  ended: boolean;
}

interface FixtureTlsSocketView {
  options: Record<string, unknown>;
  writes: string[];
  destroyed: boolean;
  ended: boolean;
  authorized: boolean;
}

const fixtureState = vi.hoisted(() => ({
  sockets: [] as FixtureSocketView[],
  tlsSockets: [] as FixtureTlsSocketView[],
  lookup: vi.fn(),
  tlsConnect: vi.fn(),
}));

vi.mock('node:dns', () => ({
  promises: {
    lookup: fixtureState.lookup,
  },
}));

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  const { EventEmitter } = await import('node:events');

  class FixtureSocket extends EventEmitter {
    connectArgs: { port: number; host: string } | null = null;
    writes: string[] = [];
    timeoutMs: number | undefined;
    destroyed = false;
    ended = false;

    constructor() {
      super();
      fixtureState.sockets.push(this);
    }

    connect(port: number, host: string): this {
      this.connectArgs = { port, host };
      queueMicrotask(() => {
        this.emit('connect');
        queueMicrotask(() =>
          this.emit('data', Buffer.from('220 mail.fixture.example ESMTP ready\r\n'))
        );
      });
      return this;
    }

    setTimeout(timeoutMs: number): this {
      this.timeoutMs = timeoutMs;
      return this;
    }

    write(chunk: string): boolean {
      this.writes.push(chunk);
      if (chunk.startsWith('EHLO')) {
        queueMicrotask(() => {
          this.emit(
            'data',
            Buffer.from('250-mail.fixture.example\r\n250-SIZE 102400\r\n250-START')
          );
          queueMicrotask(() => this.emit('data', Buffer.from('TLS\r\n250 HELP\r\n')));
        });
      } else if (chunk.startsWith('STARTTLS')) {
        queueMicrotask(() => this.emit('data', Buffer.from('220 2.0.0 Ready to start TLS\r\n')));
      }
      return true;
    }

    destroy(): this {
      this.destroyed = true;
      return this;
    }

    end(): this {
      this.ended = true;
      return this;
    }
  }

  return { ...actual, Socket: FixtureSocket };
});

vi.mock('node:tls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:tls')>();
  const { EventEmitter } = await import('node:events');

  class FixtureTlsSocket extends EventEmitter {
    readonly options: Record<string, unknown>;
    readonly authorized = true;
    writes: string[] = [];
    timeoutMs: number | undefined;
    destroyed = false;
    ended = false;

    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      fixtureState.tlsSockets.push(this);
    }

    setTimeout(timeoutMs: number): this {
      this.timeoutMs = timeoutMs;
      return this;
    }

    getCipher() {
      return { name: 'TLS_AES_128_GCM_SHA256', version: 'TLSv1.3' };
    }

    getPeerCertificate() {
      return {
        subject: { CN: 'mail.fixture.example' },
        issuer: { CN: 'fixture-ca' },
        subjectaltname: 'DNS:mail.fixture.example',
        valid_from: 'Jan 1 00:00:00 2026 GMT',
        valid_to: 'Jan 1 00:00:00 2027 GMT',
        fingerprint: 'AA:BB:CC',
      };
    }

    write(chunk: string): boolean {
      this.writes.push(chunk);
      return true;
    }

    end(): this {
      this.ended = true;
      return this;
    }

    destroy(): this {
      this.destroyed = true;
      return this;
    }
  }

  fixtureState.tlsConnect.mockImplementation((options: Record<string, unknown>) => {
    const socket = new FixtureTlsSocket(options);
    queueMicrotask(() => socket.emit('secureConnect'));
    return socket;
  });

  return { ...actual, connect: fixtureState.tlsConnect };
});

beforeEach(() => {
  fixtureState.lookup.mockReset().mockResolvedValue({ address: '93.184.216.34', family: 4 });
  fixtureState.tlsConnect.mockClear();
  fixtureState.sockets.length = 0;
  fixtureState.tlsSockets.length = 0;
});

describe('SMTP STARTTLS deterministic fixture', () => {
  it('negotiates trusted STARTTLS over a pinned socket and cleans up', async () => {
    const result = await probeSMTPStarttls('mail.fixture.example', 'tenant-fixture', {
      timeoutMs: 1000,
      checkAllowlist: false,
      ehloDomain: 'fixture-client.example',
    });

    expect(result).toMatchObject({
      success: true,
      hostname: 'mail.fixture.example',
      port: 25,
      supportsStarttls: true,
      tlsNegotiated: true,
      tlsTrusted: true,
      tlsVersion: 'TLSv1.3',
      tlsCipher: 'TLS_AES_128_GCM_SHA256',
    });
    expect(result.certificate).toMatchObject({
      subject: 'mail.fixture.example',
      issuer: 'fixture-ca',
      fingerprint: 'AA:BB:CC',
      chainAuthorized: true,
      hostnameAuthorized: true,
    });
    expect(result.error).toBeUndefined();
    expect(fixtureState.lookup).toHaveBeenCalledWith('mail.fixture.example');

    const socket = fixtureState.sockets[0];
    expect(socket?.connectArgs).toEqual({ port: 25, host: '93.184.216.34' });

    // Exact command transcript: capability negotiation only, never any
    // credential-bearing SMTP command (no AUTH, MAIL FROM, RCPT TO, DATA).
    expect(socket?.writes).toEqual(['EHLO fixture-client.example\r\n', 'STARTTLS\r\n']);
    const allCommands = [...(socket?.writes ?? []), ...(fixtureState.tlsSockets[0]?.writes ?? [])];
    expect(allCommands.some((command) => /AUTH|MAIL FROM|RCPT TO|DATA/i.test(command))).toBe(false);

    const tlsOptions = fixtureState.tlsConnect.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(tlsOptions.socket).toBe(socket);
    expect(tlsOptions).toMatchObject({
      servername: 'mail.fixture.example',
      rejectUnauthorized: false,
    });
    expect(
      (tlsOptions.checkServerIdentity as (h: string, c: unknown) => undefined | Error)?.(
        'mail.fixture.example',
        {}
      )
    ).toBeUndefined();

    const tlsSocket = fixtureState.tlsSockets[0];
    expect(tlsSocket?.authorized).toBe(true);
    expect(tlsSocket?.writes).toEqual(['QUIT\r\n']);
    expect(socket?.destroyed).toBe(true);
    expect(tlsSocket?.destroyed).toBe(true);
    expect(tlsSocket?.ended).toBe(true);
  });
});
