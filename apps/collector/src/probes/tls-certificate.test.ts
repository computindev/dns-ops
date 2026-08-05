import { EventEmitter } from 'node:events';
import type { TLSCertificateEvidence } from '@dns-ops/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  collectTlsCertificateEvidence,
  type TLSProbeSocket,
  type TLSSocketFactory,
} from './tls-certificate.js';

function evidence(overrides: Partial<TLSCertificateEvidence> = {}): TLSCertificateEvidence {
  return {
    kind: 'TLS_CERTIFICATE',
    hostname: 'example.com',
    resolvedAddress: '1.1.1.1',
    port: 443,
    protocol: 'TLSv1.3',
    cipher: 'TLS_AES_256_GCM_SHA384',
    hostnameAuthorized: true,
    chainAuthorized: true,
    subject: 'CN=example.com',
    issuer: 'CN=Example CA',
    subjectAlternativeNames: ['example.com', 'www.example.com'],
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    fingerprintSha256: 'AA:BB:CC',
    ...overrides,
  };
}

function fakeSocket(options: {
  authorized: boolean;
  authorizationError?: Error;
  subjectaltname?: string;
}) {
  const emitter = new EventEmitter();
  let socket: TLSProbeSocket;
  const destroy = vi.fn(() => socket);
  socket = Object.assign(emitter, {
    authorized: options.authorized,
    authorizationError: options.authorizationError,
    destroy,
    getPeerCertificate: () => ({
      raw: Buffer.from('certificate'),
      fingerprint256: 'AA:BB:CC',
      subject: { CN: 'example.com' },
      issuer: { CN: 'Example CA' },
      subjectaltname: options.subjectaltname ?? 'DNS:example.com, DNS:www.example.com',
      valid_from: 'Jan  1 00:00:00 2026 GMT',
      valid_to: 'Jan  1 00:00:00 2027 GMT',
    }),
    getCipher: () => ({ name: 'TLS_AES_256_GCM_SHA384', version: 'TLSv1.3' }),
    getProtocol: () => 'TLSv1.3',
  }) as unknown as TLSProbeSocket;
  return { socket, destroy, emitter };
}

describe('collectTlsCertificateEvidence', () => {
  it('pins the deterministic public address while preserving hostname validation', async () => {
    const connector = vi.fn().mockResolvedValue(evidence());
    const result = await collectTlsCertificateEvidence('Example.COM.', {
      resolveHostname: async () => ['8.8.8.8', '1.1.1.1'],
      connector,
      now: () => new Date('2026-02-01T00:00:00Z'),
    });

    expect(result).toEqual({
      status: 'OBSERVED',
      observedAt: '2026-02-01T00:00:00.000Z',
      evidence: evidence(),
    });
    expect(connector).toHaveBeenCalledWith('example.com', '1.1.1.1', 443, expect.any(AbortSignal));
  });

  it('uses one pinned permissive connection and separates chain trust from hostname identity', async () => {
    const { socket, destroy, emitter } = fakeSocket({
      authorized: true,
      subjectaltname: 'DNS:"evil,DNS:forged.example", DNS:real.example',
    });
    const socketFactory = vi.fn(() => {
      queueMicrotask(() => emitter.emit('secureConnect'));
      return socket;
    }) as TLSSocketFactory;

    const result = await collectTlsCertificateEvidence('example.com', {
      resolveHostname: async () => ['1.1.1.1'],
      socketFactory,
    });

    expect(result.status).toBe('OBSERVED');
    if (result.status !== 'OBSERVED') throw new Error('Expected observed fixture');
    expect(result.evidence.chainAuthorized).toBe(true);
    expect(result.evidence.hostnameAuthorized).toBe(false);
    expect(result.evidence.subjectAlternativeNames).toEqual(['real.example']);
    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(socketFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '1.1.1.1',
        port: 443,
        servername: 'example.com',
        rejectUnauthorized: false,
      })
    );
    const connectionOptions = vi.mocked(socketFactory).mock.calls[0][0];
    expect(connectionOptions.checkServerIdentity?.('example.com', {} as never)).toBeUndefined();
    expect(destroy).toHaveBeenCalledWith();
  });

  it('preserves observed invalid-certificate authorization evidence', async () => {
    const invalidEvidence = evidence({
      hostnameAuthorized: false,
      chainAuthorized: false,
      authorizationError: 'certificate has expired',
    });
    const result = await collectTlsCertificateEvidence('example.com', {
      resolveHostname: async () => ['1.1.1.1'],
      connector: async () => invalidEvidence,
    });

    expect(result.status).toBe('OBSERVED');
    if (result.status !== 'OBSERVED') throw new Error('Expected observed fixture');
    expect(result.evidence).toMatchObject({
      hostnameAuthorized: false,
      chainAuthorized: false,
      authorizationError: 'certificate has expired',
    });
  });

  it('rejects the target when any resolved address is private', async () => {
    const connector = vi.fn();
    const result = await collectTlsCertificateEvidence('example.com', {
      resolveHostname: async () => ['1.1.1.1', '127.0.0.1'],
      connector,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown).toMatchObject({ reason: 'PROBE_FAILED', action: 'RETRY_PROBE' });
    expect(result.unknown.explanation).toContain('Unsafe TLS address');
    expect(connector).not.toHaveBeenCalled();
  });

  it('rejects non-IP resolver output and bracketed IPv6 target input', async () => {
    const connector = vi.fn();
    const nonIp = await collectTlsCertificateEvidence('example.com', {
      resolveHostname: async () => ['resolver-alias.example'],
      connector,
    });
    const bracketed = await collectTlsCertificateEvidence('[2001:db8::1]', {
      resolveHostname: vi.fn(),
      connector,
    });

    expect(nonIp.status).toBe('UNKNOWN');
    expect(bracketed.status).toBe('UNKNOWN');
    if (nonIp.status !== 'UNKNOWN' || bracketed.status !== 'UNKNOWN') {
      throw new Error('Expected invalid target fixtures');
    }
    expect(nonIp.unknown.explanation).toContain('non-IP address');
    expect(bracketed.unknown.explanation).toContain('Invalid TLS hostname');
    expect(connector).not.toHaveBeenCalled();
  });

  it('rejects connector evidence for a different target', async () => {
    const result = await collectTlsCertificateEvidence('example.com', {
      resolveHostname: async () => ['1.1.1.1'],
      connector: async () => evidence({ hostname: 'other.example' }),
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown.explanation).toContain('mismatched target evidence');
  });

  it('bounds stalled DNS resolution with the cumulative deadline', async () => {
    const result = await collectTlsCertificateEvidence('example.com', {
      resolveHostname: () => new Promise<string[]>(() => undefined),
      connector: vi.fn(),
      timeoutMs: 5,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown.explanation).toContain('deadline exceeded');
  });

  it('aborts and destroys a stalled production socket without emitting an unhandled error', async () => {
    const { socket, destroy } = fakeSocket({ authorized: false });
    const result = await collectTlsCertificateEvidence('example.com', {
      resolveHostname: async () => ['1.1.1.1'],
      socketFactory: () => socket,
      timeoutMs: 5,
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown.explanation).toContain('deadline exceeded');
    expect(destroy).toHaveBeenCalledWith();
  });

  it('turns connector failure into actionable UNKNOWN', async () => {
    const result = await collectTlsCertificateEvidence('example.com', {
      resolveHostname: async () => ['1.1.1.1'],
      connector: async () => {
        throw new Error('handshake failed');
      },
    });

    expect(result.status).toBe('UNKNOWN');
    if (result.status !== 'UNKNOWN') throw new Error('Expected UNKNOWN fixture');
    expect(result.unknown).toEqual({
      reason: 'PROBE_FAILED',
      explanation: 'TLS certificate evidence could not be collected: handshake failed',
      action: 'RETRY_PROBE',
      actionLabel: 'Retry TLS certificate probe',
      blocking: true,
    });
  });
});
