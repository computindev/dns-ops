/**
 * SMTP STARTTLS Probe - Bead 10 / AUTH-003
 *
 * Checks SMTP server for STARTTLS capability.
 * Performs limited SMTP handshake to detect TLS support.
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
  supportsStarttls: boolean;
  tlsVersion?: string;
  tlsCipher?: string;
  certificate?: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    fingerprint: string;
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

/**
 * Read SMTP response from socket
 *
 * SMTP responses can be multiline (ESMTP). Format:
 * - Continuation lines start with "xxx-" (same code, more data)
 * - Final line starts with "xxx " (space after code indicates end)
 *
 * SEC-004: Fixed to read ALL lines of multiline responses.
 * Previously only read the last line, missing STARTTLS in middle of EHLO response.
 */
function readResponse(socket: net.Socket, timeoutMs: number): Promise<SMTPResponse> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for SMTP response`));
    }, timeoutMs);

    const onData = (data: Buffer) => {
      buffer += data.toString();

      // Check for complete response - need to find final line
      // Final line format: "xxx <text>" (space after 3-digit code)
      // Continuation format: "xxx-<text>" (hyphen after 3-digit code)
      // Note: After splitting by \r?\n, lines should not contain \r, but we filter empty strings
      const lines = buffer.split(/\r?\n/).filter((l) => l.trim());

      if (lines.length === 0) return;

      const lastLine = lines[lines.length - 1];

      // Check if this is the final line (space after code, not hyphen)
      const finalLineMatch = lastLine.match(/^(\d{3})\s/);
      if (finalLineMatch) {
        clearTimeout(timeout);
        socket.off('data', onData);

        // SEC-004: Join all lines for complete response
        const allLines = lines.join('\n');
        resolve({
          code: parseInt(finalLineMatch[1], 10),
          message: allLines,
          lines: lines,
        });
      }
    };

    socket.on('data', onData);
    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Send SMTP command
 */
function sendCommand(socket: net.Socket, command: string): void {
  socket.write(`${command}\r\n`);
}

/**
 * Resolve a probe hostname through the SSRF guard and return the checked IP
 * to pin the connection to (Issue #67 review, P1).
 *
 * Fail closed: unlike resolveAndCheck() (which tolerates DNS failure for
 * HTTP fetches), any resolution failure blocks the probe — connecting by
 * hostname afterwards would let Node re-resolve it and re-open the TOCTOU
 * gap.
 */
async function resolveCheckedTarget(
  hostname: string
): Promise<{ ok: true; ip: string } | { ok: false; error: string }> {
  try {
    const { address } = await dns.promises.lookup(hostname);
    const check = checkSSRF(address);
    if (!check.allowed) {
      return {
        ok: false,
        error: `SSRF blocked: ${hostname} resolves to ${address} (${check.reason})`,
      };
    }
    return { ok: true, ip: address };
  } catch (error) {
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

  try {
    if (!isExpiryFresh(expiresAt)) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        error: 'Persisted DNS evidence expired before probe start',
        responseTimeMs: Date.now() - startTime,
      };
    }
    // SSRF check
    const ssrfCheck = checkSSRF(hostname);
    if (!ssrfCheck.allowed) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        error: `SSRF blocked: ${ssrfCheck.reason}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Allowlist check (tenant-scoped via probeAllowlistManager)
    if (checkAllowlist && !probeAllowlistManager.isAllowed(tenantId, hostname, port)) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        error: 'Destination not in allowlist. Generate allowlist from DNS results first.',
        responseTimeMs: Date.now() - startTime,
      };
    }

    // SSRF check — resolve the hostname, check the resolved address, and
    // pin the connection to the checked IP so Node never re-resolves it at
    // connect time (closes the DNS rebinding TOCTOU gap).
    const resolved = await resolveCheckedTarget(hostname);
    if (!resolved.ok) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        error: resolved.error,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // The DNS/allowlist checks above may have delayed the request. Do not
    // create or connect a socket after the persisted evidence expires.
    if (!isExpiryFresh(expiresAt)) {
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        error: 'Persisted DNS evidence expired before socket start',
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Create socket connection
    const socket = new net.Socket();

    // Set timeout
    socket.setTimeout(timeoutMs);

    // Connect to the pinned, checked IP (SNI/cert checks still use the
    // original hostname in the TLS upgrade below).
    await new Promise<void>((resolve, reject) => {
      if (!isExpiryFresh(expiresAt)) {
        socket.destroy();
        reject(new Error('Persisted DNS evidence expired before socket start'));
        return;
      }
      socket.once('connect', resolve);
      socket.once('error', reject);
      socket.connect(port, resolved.ip);
    });

    // Read banner
    const banner = await readResponse(socket, 10000);
    const smtpBanner = banner.message;

    if (banner.code !== 220) {
      socket.destroy();
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        smtpBanner,
        error: `Unexpected banner: ${banner.message}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Send EHLO
    sendCommand(socket, `EHLO ${ehloDomain}`);
    const ehloResponse = await readResponse(socket, 10000);

    if (ehloResponse.code !== 250) {
      socket.destroy();
      return {
        success: false,
        hostname,
        port,
        supportsStarttls: false,
        smtpBanner,
        error: `EHLO rejected: ${ehloResponse.message}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Check for STARTTLS in capabilities
    const supportsStarttls = ehloResponse.message.toUpperCase().includes('STARTTLS');

    if (!supportsStarttls) {
      socket.destroy();
      return {
        success: true,
        hostname,
        port,
        supportsStarttls: false,
        smtpBanner,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Try STARTTLS
    sendCommand(socket, 'STARTTLS');
    const starttlsResponse = await readResponse(socket, 10000);

    if (starttlsResponse.code !== 220) {
      socket.destroy();
      return {
        success: true,
        hostname,
        port,
        supportsStarttls: true,
        smtpBanner,
        error: `STARTTLS rejected: ${starttlsResponse.message}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Upgrade to TLS
    const tlsSocket = tls.connect({
      socket,
      servername: hostname,
      rejectUnauthorized: false, // Allow self-signed for probing
    });

    await new Promise<void>((resolve, reject) => {
      tlsSocket.once('secureConnect', resolve);
      tlsSocket.once('error', reject);
    });

    // Get TLS info
    const tlsInfo = tlsSocket.getCipher();
    const cert = tlsSocket.getPeerCertificate();

    // Close connection gracefully
    tlsSocket.write('QUIT\r\n');
    tlsSocket.end();

    return {
      success: true,
      hostname,
      port,
      supportsStarttls: true,
      tlsVersion: tlsInfo.version,
      tlsCipher: tlsInfo.name,
      certificate: cert.subject
        ? {
            subject: String(cert.subject.CN || cert.subject.O || 'Unknown'),
            issuer: String(cert.issuer.CN || cert.issuer.O || 'Unknown'),
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            fingerprint: cert.fingerprint,
          }
        : undefined,
      smtpBanner,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout =
      errorMessage.toLowerCase().includes('timeout') ||
      errorMessage.toLowerCase().includes('etimedout') ||
      errorMessage.includes('ETIMEDOUT');

    return {
      success: false,
      hostname,
      port,
      supportsStarttls: false,
      error: isTimeout ? `Timeout after ${timeoutMs}ms` : errorMessage,
      responseTimeMs: Date.now() - startTime,
    };
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
