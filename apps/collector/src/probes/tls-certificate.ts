import { isIP } from 'node:net';
import * as tls from 'node:tls';
import type { EvidenceCheckResult, TLSCertificateEvidence } from '@dns-ops/contracts';
import { checkResolvedIP, checkSSRF } from './ssrf-guard.js';

const HTTPS_PORT = 443;
const DEFAULT_TIMEOUT_MS = 8_000;

type Resolver = (hostname: string) => Promise<string[]>;
export type TLSConnector = (
  hostname: string,
  address: string,
  port: number,
  signal: AbortSignal
) => Promise<TLSCertificateEvidence>;

export interface TLSProbeSocket {
  authorized: boolean;
  authorizationError?: string | Error | null;
  once(event: 'secureConnect', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: 'secureConnect', listener: () => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
  destroy(error?: Error): this;
  getPeerCertificate(detailed: true): tls.DetailedPeerCertificate;
  getCipher(): tls.CipherNameAndProtocol;
  getProtocol(): string | null;
}

export type TLSSocketFactory = (options: tls.ConnectionOptions) => TLSProbeSocket;

export interface TLSCertificateCollectionOptions {
  resolveHostname?: Resolver;
  connector?: TLSConnector;
  socketFactory?: TLSSocketFactory;
  timeoutMs?: number;
  now?: () => Date;
}

function deadlineError(): Error {
  return new Error('TLS certificate collection deadline exceeded');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(deadlineError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(deadlineError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function validateHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (
    !normalized ||
    normalized.length > 253 ||
    normalized.includes('/') ||
    normalized.includes(':') ||
    normalized.includes('[') ||
    normalized.includes(']')
  ) {
    throw new Error('Invalid TLS hostname');
  }
  const parsed = new URL(`https://${normalized}/`);
  if (parsed.hostname !== normalized || isIP(normalized) !== 0) {
    throw new Error('TLS evidence requires a registered hostname, not an IP literal');
  }
  const hostnameCheck = checkSSRF(normalized);
  if (!hostnameCheck.allowed) throw new Error(`Unsafe TLS hostname: ${hostnameCheck.reason}`);
  return normalized;
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const { promises: dns } = await import('node:dns');
  const resolved = await dns.lookup(hostname, { all: true });
  return [...new Set(resolved.map(({ address }) => address))].sort();
}

function connectTls(
  hostname: string,
  address: string,
  port: number,
  signal: AbortSignal,
  socketFactory: TLSSocketFactory
): Promise<TLSProbeSocket> {
  return new Promise((resolve, reject) => {
    const socket = socketFactory({
      host: address,
      port,
      servername: hostname,
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
    });
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      socket.off('secureConnect', onSecure);
      socket.off('error', onError);
    };
    const onAbort = () => {
      cleanup();
      socket.destroy();
      reject(deadlineError());
    };
    const onError = (error: Error) => {
      cleanup();
      socket.destroy();
      reject(error);
    };
    const onSecure = () => {
      cleanup();
      resolve(socket);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    socket.once('secureConnect', onSecure);
    socket.once('error', onError);
  });
}

function authorizationErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  return undefined;
}

function distinguishedName(value: tls.PeerCertificate['subject']): string {
  if (!value) return '';
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${key}=${String(entry)}`)
    .join(', ');
}

function subjectAlternativeNames(value: string | undefined): string[] {
  if (!value) return [];
  const entries: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\' && quoted) {
      current += character;
      escaped = true;
    } else if (character === '"') {
      current += character;
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      entries.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  entries.push(current.trim());

  return entries
    .flatMap((entry) => {
      if (!entry.startsWith('DNS:')) return [];
      const rawName = entry.slice(4);
      let name: string;
      try {
        name = rawName.startsWith('"') ? JSON.parse(rawName) : rawName;
      } catch {
        return [];
      }
      return /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
        name
      )
        ? [name]
        : [];
    })
    .sort();
}

function certificateDate(value: string, field: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`TLS certificate has invalid ${field}`);
  return parsed.toISOString();
}

function evidenceFromSocket(
  socket: TLSProbeSocket,
  hostname: string,
  address: string,
  port: number
): TLSCertificateEvidence {
  const certificate = socket.getPeerCertificate(true);
  if (!certificate?.raw || !certificate.fingerprint256) {
    throw new Error('TLS peer did not provide a complete certificate');
  }
  const hostnameError = tls.checkServerIdentity(hostname, certificate);
  const cipher = socket.getCipher();
  const protocol = socket.getProtocol();
  if (!protocol || !cipher.name) throw new Error('TLS session metadata is incomplete');

  return {
    kind: 'TLS_CERTIFICATE',
    hostname,
    resolvedAddress: address,
    port,
    protocol,
    cipher: cipher.name,
    hostnameAuthorized: hostnameError === undefined,
    chainAuthorized: socket.authorized,
    authorizationError:
      [
        socket.authorized
          ? undefined
          : (authorizationErrorMessage(socket.authorizationError) ??
            'certificate chain is not authorized'),
        hostnameError?.message,
      ]
        .filter((value): value is string => Boolean(value))
        .join('; ') || undefined,
    subject: distinguishedName(certificate.subject),
    issuer: distinguishedName(certificate.issuer),
    subjectAlternativeNames: subjectAlternativeNames(certificate.subjectaltname),
    validFrom: certificateDate(certificate.valid_from, 'valid-from date'),
    validTo: certificateDate(certificate.valid_to, 'valid-to date'),
    fingerprintSha256: certificate.fingerprint256,
  };
}

async function defaultConnector(
  hostname: string,
  address: string,
  port: number,
  signal: AbortSignal,
  socketFactory: TLSSocketFactory
): Promise<TLSCertificateEvidence> {
  const socket = await connectTls(hostname, address, port, signal, socketFactory);
  try {
    return evidenceFromSocket(socket, hostname, address, port);
  } finally {
    socket.destroy();
  }
}

function unknown(detail: string) {
  return {
    reason: 'PROBE_FAILED' as const,
    explanation: `TLS certificate evidence could not be collected: ${detail}`,
    action: 'RETRY_PROBE' as const,
    actionLabel: 'Retry TLS certificate probe',
    blocking: true,
  };
}

export async function collectTlsCertificateEvidence(
  registeredHostname: string,
  options: TLSCertificateCollectionOptions = {}
): Promise<EvidenceCheckResult<TLSCertificateEvidence>> {
  const resolver = options.resolveHostname ?? defaultResolver;
  const socketFactory = options.socketFactory ?? ((connectOptions) => tls.connect(connectOptions));
  const connector =
    options.connector ??
    ((hostname, address, port, signal) =>
      defaultConnector(hostname, address, port, signal, socketFactory));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const hostname = validateHostname(registeredHostname);
    const addresses = await abortable(resolver(hostname), controller.signal);
    if (addresses.length === 0) throw new Error('TLS hostname did not resolve');
    for (const address of addresses) {
      if (isIP(address) === 0 || address.includes('%')) {
        throw new Error(`TLS resolver returned a non-IP address: ${address}`);
      }
      const addressCheck = checkResolvedIP(address);
      if (!addressCheck.allowed) {
        throw new Error(`Unsafe TLS address ${address}: ${addressCheck.reason}`);
      }
    }

    const address = [...addresses].sort()[0];
    const evidence = await abortable(
      connector(hostname, address, HTTPS_PORT, controller.signal),
      controller.signal
    );
    if (
      evidence.hostname !== hostname ||
      evidence.resolvedAddress !== address ||
      evidence.port !== HTTPS_PORT
    ) {
      throw new Error('TLS connector returned mismatched target evidence');
    }
    return { status: 'OBSERVED', observedAt: now().toISOString(), evidence };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: 'UNKNOWN', unknown: unknown(detail) };
  } finally {
    clearTimeout(deadline);
  }
}
