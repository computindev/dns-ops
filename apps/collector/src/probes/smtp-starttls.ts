/**
 * SMTP STARTTLS Probe - Bead 10 / AUTH-003
 *
 * Checks SMTP server for STARTTLS capability.
 * Performs limited SMTP handshake to detect TLS support.
 *
 * Trust contract (issue #74): the STARTTLS handshake is a diagnostic
 * observation made with one permissive TLS connection so invalid
 * certificates are retained as evidence. `success` is true only for
 * negotiated, chain-authorized, hostname-authorized TLS; it must never be
 * true for an untrusted certificate.
 */

import * as dns from 'node:dns';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { isExpiryFresh, probeAllowlistManager } from './allowlist.js';
import { getProbeSemaphore } from './semaphore.js';
import { checkSSRF } from './ssrf-guard.js';

export interface SMTPProbeResult {
  success: boolean;
  hostname: string;
  port: number;
  /** EHLO advertised STARTTLS. */
  supportsStarttls: boolean;
  /** The diagnostic TLS handshake completed. */
  tlsNegotiated: boolean;
  /** Chain and hostname authorization both passed for the negotiated session. */
  tlsTrusted: boolean;
  tlsVersion?: string;
  tlsCipher?: string;
  certificate?: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    fingerprint: string;
    /** Runtime trust store accepted the certificate chain. */
    chainAuthorized: boolean;
    /** Certificate matches the probe hostname (SAN/CN). */
    hostnameAuthorized: boolean;
    /** First authorization failure, retained as diagnostic evidence. */
    authorizationError?: string;
  };
  smtpBanner?: string;
  error?: string;
  responseTimeMs: number;
}

interface SMTPResponse {
  code: number;
  message: string;
  lines: string[];
}

const MAX_SMTP_RESPONSE_BYTES = 64 * 1024;

class SMTPProbeTimeoutError extends Error {
  constructor() {
    super('SMTP probe deadline exceeded');
    this.name = 'SMTPProbeTimeoutError';
  }
}

function remainingMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

/** Race an operation against the probe's cumulative abort signal. */
function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new SMTPProbeTimeoutError());

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new SMTPProbeTimeoutError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    );
  });
}

/**
 * Read one complete SMTP response. The caller owns the cumulative deadline;
 * this helper never starts a fresh per-response timeout.
 */
function readResponse(
  socket: net.Socket,
  signal: AbortSignal,
  deadline: number
): Promise<SMTPResponse> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let settled = false;

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('timeout', onTimeout);
      signal.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const finish = (response: SMTPResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };
    const onAbort = () => {
      const error = new SMTPProbeTimeoutError();
      fail(error);
      socket.destroy();
    };
    const onClose = () => {
      fail(new Error('SMTP socket closed before response'));
    };
    const onError = (error: Error) => {
      fail(error);
    };
    const onTimeout = () => {
      const error = new SMTPProbeTimeoutError();
      fail(error);
      socket.destroy();
    };
    const onData = (data: Buffer | string) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buffer.byteLength + chunk.byteLength > MAX_SMTP_RESPONSE_BYTES) {
        const error = new Error('SMTP response exceeded 65536 bytes');
        fail(error);
        socket.destroy();
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);

      const text = buffer.toString('utf8');
      if (!text.endsWith('\n')) return;
      const lines = text
        .split(/\r?\n/)
        .slice(0, -1)
        .filter((line) => line.trim().length > 0);
      const lastLine = lines[lines.length - 1];
      const finalLineMatch = lastLine?.match(/^(\d{3})\s/);
      if (!finalLineMatch) return;

      finish({
        code: Number.parseInt(finalLineMatch[1], 10),
        message: lines.join('\n'),
        lines,
      });
    };

    try {
      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('close', onClose);
      socket.on('timeout', onTimeout);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted || deadline <= Date.now()) {
        onTimeout();
        return;
      }
      socket.setTimeout(remainingMs(deadline));
    } catch (error) {
      fail(error);
    }
  });
}

function sendCommand(socket: net.Socket, command: string, signal: AbortSignal): void {
  if (signal.aborted) throw new SMTPProbeTimeoutError();
  socket.write(`${command}\r\n`);
}

function connectSocket(
  socket: net.Socket,
  port: number,
  address: string,
  signal: AbortSignal,
  deadline: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('timeout', onTimeout);
      signal.removeEventListener('abort', onAbort);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === undefined) resolve();
      else reject(error);
    };
    const onAbort = () => {
      const error = new SMTPProbeTimeoutError();
      finish(error);
      socket.destroy();
    };
    const onClose = () => {
      finish(new Error('SMTP socket closed before connect'));
    };
    const onConnect = () => finish();
    const onError = (error: Error) => finish(error);
    const onTimeout = () => {
      const error = new SMTPProbeTimeoutError();
      finish(error);
      socket.destroy();
    };

    try {
      socket.once('connect', onConnect);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.once('timeout', onTimeout);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted || deadline <= Date.now()) {
        onAbort();
        return;
      }
      socket.setTimeout(remainingMs(deadline));
      socket.connect(port, address);
    } catch (error) {
      finish(error);
    }
  });
}

function waitForTls(socket: tls.TLSSocket, signal: AbortSignal, deadline: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      socket.off('secureConnect', onSecureConnect);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('timeout', onTimeout);
      signal.removeEventListener('abort', onAbort);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === undefined) resolve();
      else reject(error);
    };
    const onAbort = () => {
      const error = new SMTPProbeTimeoutError();
      finish(error);
      socket.destroy();
    };
    const onSecureConnect = () => finish();
    const onError = (error: Error) => finish(error);
    const onClose = () => finish(new Error('TLS socket closed before handshake'));
    const onTimeout = () => {
      const error = new SMTPProbeTimeoutError();
      finish(error);
      socket.destroy();
    };

    try {
      socket.once('secureConnect', onSecureConnect);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.once('timeout', onTimeout);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted || deadline <= Date.now()) {
        onAbort();
        return;
      }
      socket.setTimeout(remainingMs(deadline));
    } catch (error) {
      finish(error);
    }
  });
}

/**
 * Resolve a probe hostname through the SSRF guard and return the checked IP
 * to pin the connection to. DNS failures fail closed so a later hostname
 * connect cannot re-open the DNS rebinding window.
 */
async function resolveCheckedTarget(
  hostname: string,
  signal: AbortSignal
): Promise<{ ok: true; ip: string } | { ok: false; error: string }> {
  try {
    const result = await withAbort(dns.promises.lookup(hostname), signal);
    const address = typeof result === 'string' ? result : result.address;
    if (!address) return { ok: false, error: `DNS resolution returned no address for ${hostname}` };

    const check = checkSSRF(address);
    if (!check.allowed) {
      return {
        ok: false,
        error: `SSRF blocked: ${hostname} resolves to ${address} (${check.reason})`,
      };
    }
    return { ok: true, ip: address };
  } catch (error) {
    if (signal.aborted || error instanceof SMTPProbeTimeoutError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `DNS resolution failed for ${hostname}: ${message}` };
  }
}

/**
 * Probe SMTP server for STARTTLS capability
 *
 * @param hostname - Target SMTP server hostname
 * @param tenantId - Tenant ID for allowlist scoping (AUTH-003)
 * @param options - Probe options including port, timeout, and allowlist settings
 */
export async function probeSMTPStarttls(
  hostname: string,
  tenantId: string,
  options?: {
    port?: number;
    timeoutMs?: number;
    checkAllowlist?: boolean;
    ehloDomain?: string;
    expiresAt?: Date;
  }
): Promise<SMTPProbeResult> {
  const {
    port = 25,
    timeoutMs = 30000,
    checkAllowlist = true,
    ehloDomain = 'dns-ops-probe.local',
    expiresAt,
  } = options || {};
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const { signal } = controller;
  let rawSocket: net.Socket | undefined;
  let tlsSocket: tls.TLSSocket | undefined;
  // Retained through later failures so an advertised capability survives a
  // TLS handshake error.
  let advertisedStarttls = false;
  const destroyActiveSockets = () => {
    rawSocket?.destroy();
    tlsSocket?.destroy();
  };
  signal.addEventListener('abort', destroyActiveSockets, { once: true });

  try {
    if (!isExpiryFresh(expiresAt)) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Persisted DNS evidence expired before probe start',
        responseTimeMs: Date.now() - startTime,
      };
    }
    if (deadline <= Date.now() || signal.aborted) {
      throw new SMTPProbeTimeoutError();
    }

    const ssrfCheck = checkSSRF(hostname);
    if (!ssrfCheck.allowed) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: `SSRF blocked: ${ssrfCheck.reason}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    if (checkAllowlist && !probeAllowlistManager.isAllowed(tenantId, hostname, port)) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: 'Destination not in allowlist. Generate allowlist from DNS results first.',
        responseTimeMs: Date.now() - startTime,
      };
    }

    const resolved = await resolveCheckedTarget(hostname, signal);
    if (!resolved.ok) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: resolved.error,
        responseTimeMs: Date.now() - startTime,
      };
    }

    if (!isExpiryFresh(expiresAt) || signal.aborted) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        error: signal.aborted
          ? `Timeout after ${timeoutMs}ms`
          : 'Persisted DNS evidence expired before socket start',
        responseTimeMs: Date.now() - startTime,
      };
    }

    rawSocket = new net.Socket();
    await connectSocket(rawSocket, port, resolved.ip, signal, deadline);

    const banner = await readResponse(rawSocket, signal, deadline);
    const smtpBanner = banner.message;
    if (banner.code !== 220) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        smtpBanner,
        error: `Unexpected banner: ${banner.message}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    sendCommand(rawSocket, `EHLO ${ehloDomain}`, signal);
    const ehloResponse = await readResponse(rawSocket, signal, deadline);
    if (ehloResponse.code !== 250) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        smtpBanner,
        error: `EHLO rejected: ${ehloResponse.message}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    const supportsStarttls = ehloResponse.message.toUpperCase().includes('STARTTLS');
    advertisedStarttls = supportsStarttls;
    if (!supportsStarttls) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        tlsNegotiated: false,
        tlsTrusted: false,
        smtpBanner,
        responseTimeMs: Date.now() - startTime,
      };
    }

    sendCommand(rawSocket, 'STARTTLS', signal);
    const starttlsResponse = await readResponse(rawSocket, signal, deadline);
    if (starttlsResponse.code !== 220) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: true,
        tlsNegotiated: false,
        tlsTrusted: false,
        smtpBanner,
        error: `STARTTLS rejected: ${starttlsResponse.message}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // One permissive diagnostic handshake (issue #74): hostname and chain
    // evaluation are disabled here so invalid-certificate evidence survives;
    // trust is decided explicitly below from the exact peer certificate.
    tlsSocket = tls.connect({
      socket: rawSocket,
      servername: hostname,
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
    });
    await waitForTls(tlsSocket, signal, deadline);

    const tlsInfo = tlsSocket.getCipher();
    const cert = tlsSocket.getPeerCertificate(true);
    if (!cert || !cert.subject) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: true,
        tlsNegotiated: false,
        tlsTrusted: false,
        smtpBanner,
        error: 'TLS handshake completed without a usable peer certificate',
        responseTimeMs: Date.now() - startTime,
      };
    }

    const chainAuthorized = tlsSocket.authorized;
    const hostnameError = tls.checkServerIdentity(hostname, cert);
    const hostnameAuthorized = hostnameError === undefined;
    const tlsTrusted = chainAuthorized && hostnameAuthorized;
    const certificate = {
      subject: String(cert.subject.CN || cert.subject.O || 'Unknown'),
      issuer: String(cert.issuer.CN || cert.issuer.O || 'Unknown'),
      validFrom: cert.valid_from,
      validTo: cert.valid_to,
      fingerprint: cert.fingerprint,
      chainAuthorized,
      hostnameAuthorized,
      authorizationError:
        [
          chainAuthorized
            ? undefined
            : (tlsSocket.authorizationError?.message ?? 'certificate chain is not authorized'),
          hostnameError?.message,
        ]
          .filter((value): value is string => Boolean(value))
          .join('; ') || undefined,
    };

    if (!tlsTrusted) {
      // Never complete an SMTP session over an untrusted TLS connection;
      // destroy it once the diagnostic evidence is captured.
      tlsSocket.destroy();
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: true,
        tlsNegotiated: true,
        tlsTrusted: false,
        tlsVersion: tlsInfo.version,
        tlsCipher: tlsInfo.name,
        certificate,
        smtpBanner,
        error: `TLS certificate not trusted: ${certificate.authorizationError ?? 'unknown authorization failure'}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    tlsSocket.write('QUIT\r\n');
    tlsSocket.end();

    return {
      success: true,
      hostname,
      port,
      supportsStarttls: true,
      tlsNegotiated: true,
      tlsTrusted: true,
      tlsVersion: tlsInfo.version,
      tlsCipher: tlsInfo.name,
      certificate,
      smtpBanner,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout =
      signal.aborted ||
      error instanceof SMTPProbeTimeoutError ||
      errorMessage.toLowerCase().includes('timeout') ||
      errorMessage.toLowerCase().includes('etimedout');

    return {
      success: false,
      hostname,
      port,
      supportsStarttls: advertisedStarttls,
      tlsNegotiated: false,
      tlsTrusted: false,
      error: isTimeout ? `Timeout after ${timeoutMs}ms` : errorMessage,
      responseTimeMs: Date.now() - startTime,
    };
  } finally {
    signal.removeEventListener('abort', destroyActiveSockets);
    clearTimeout(timeoutId);
    tlsSocket?.destroy();
    rawSocket?.destroy();
    tlsSocket?.removeAllListeners();
    rawSocket?.removeAllListeners();
  }
}

/**
 * Batch probe multiple MX hosts
 */
export async function probeMXHosts(
  hosts: Array<{ hostname: string; priority: number }>,
  tenantId: string,
  options?: {
    timeoutMs?: number;
    concurrency?: number;
    expiresAt?: Date;
  }
): Promise<SMTPProbeResult[]> {
  const { timeoutMs = 30000, concurrency = 3, expiresAt } = options || {};

  const results: SMTPProbeResult[] = [];
  const semaphore = getProbeSemaphore();

  // Process in local batches while acquiring the same process-wide permit for
  // each host. The local bound controls one request; the semaphore controls
  // all simultaneous batch and single-host requests together.
  for (let i = 0; i < hosts.length; i += concurrency) {
    const batch = hosts.slice(i, i + concurrency);
    const batchPromises = batch.map((host) =>
      semaphore.run(async () => {
        if (!isExpiryFresh(expiresAt)) {
          return {
            success: false,
            hostname: host.hostname,
            port: 25,
            supportsStarttls: false,
            tlsNegotiated: false,
            tlsTrusted: false,
            error: 'Persisted DNS evidence expired before probe start',
            responseTimeMs: 0,
          };
        }
        return probeSMTPStarttls(host.hostname, tenantId, { timeoutMs, expiresAt });
      })
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}
