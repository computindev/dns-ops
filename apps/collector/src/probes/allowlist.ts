/**
 * Probe Destination Allowlist - Bead 10 / AUTH-003
 *
 * Ensures probes only target destinations derived from DNS results.
 * Prevents arbitrary outbound probing.
 *
 * TENANT ISOLATION: Each tenant has isolated allowlist entries.
 * All operations are scoped by tenantId.
 */

import type { DNSQueryResult } from '../dns/types.js';

export interface AllowlistEntry {
  tenantId: string;
  type: 'mx' | 'mta-sts' | 'smtp' | 'custom';
  hostname: string;
  port?: number;
  derivedFrom: {
    domain: string;
    queryType: string;
    queryName: string;
    answerData: string;
  };
  expiresAt: Date;
}

export interface TenantScopedAllowlist {
  /**
   * Generate allowlist entries from DNS query results for this tenant.
   * Persisted evidence can supply its already-computed expiry.
   */
  generateFromDnsResults(
    domain: string,
    dnsResults: DNSQueryResult[],
    expiresAt?: Date
  ): AllowlistEntry[];

  /**
   * Add a custom allowlist entry for this tenant
   */
  addCustomEntry(
    hostname: string,
    port: number,
    requestedBy: string,
    reason: string
  ): AllowlistEntry;

  /**
   * Check if a destination is allowed for this tenant
   */
  isAllowed(hostname: string, port?: number): boolean;

  /**
   * Get allowlist entry for a destination
   */
  getEntry(hostname: string, port?: number): AllowlistEntry | undefined;

  /**
   * Get all active allowlist entries for this tenant
   */
  getAllEntries(): AllowlistEntry[];

  /**
   * Clear all entries for this tenant
   */
  clear(): void;
}

/**
 * Canonical hostname form for allowlist keying: DNS names are
 * case-insensitive (RFC 1035 §2.3.3) and may carry a trailing root dot.
 * Persisted MX targets arrive normalized lowercase, while raw MX answer
 * data may be mixed-case — both entries and lookups are canonicalized so
 * mixed-case answers authorize normalized probe targets.
 */
function canonicalHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

/** An omitted expiry keeps the legacy allowlist API's TTL behavior. */
export function isExpiryFresh(expiresAt?: Date): boolean {
  if (expiresAt === undefined) return true;
  const timestamp = expiresAt instanceof Date ? expiresAt.getTime() : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

/**
 * Create a tenant-scoped allowlist instance
 */
export function createTenantAllowlist(tenantId: string): TenantScopedAllowlist {
  const entries: Map<string, AllowlistEntry> = new Map();
  const defaultTtlMs = 5 * 60 * 1000; // 5 minute default TTL

  function key(entry: AllowlistEntry): string {
    return entry.port ? `${entry.hostname}:${entry.port}` : entry.hostname;
  }

  function cleanup(): void {
    for (const [k, entry] of entries) {
      if (!isExpiryFresh(entry.expiresAt)) {
        entries.delete(k);
      }
    }
  }

  return {
    generateFromDnsResults(
      domain: string,
      dnsResults: DNSQueryResult[],
      persistedExpiresAt?: Date
    ): AllowlistEntry[] {
      const resultEntries: AllowlistEntry[] = [];
      const now = new Date();
      const entryExpiresAt = persistedExpiresAt
        ? new Date(persistedExpiresAt.getTime())
        : new Date(now.getTime() + defaultTtlMs);

      for (const dnsResult of dnsResults) {
        if (!dnsResult.success) continue;

        // Extract MX hosts
        if (dnsResult.query.type === 'MX') {
          for (const answer of dnsResult.answers) {
            const parts = answer.data.trim().split(/\s+/);
            if (parts.length >= 2) {
              const hostname = canonicalHostname(parts[1]);
              const entry: AllowlistEntry = {
                tenantId,
                type: 'mx',
                hostname,
                port: 25,
                derivedFrom: {
                  domain,
                  queryType: dnsResult.query.type,
                  queryName: dnsResult.query.name,
                  answerData: answer.data,
                },
                expiresAt: new Date(entryExpiresAt.getTime()),
              };
              resultEntries.push(entry);
              entries.set(key(entry), entry);
            }
          }
        }

        // Extract MTA-STS policy host
        if (
          dnsResult.query.type === 'TXT' &&
          (dnsResult.query.name.toLowerCase().includes('_mta-sts') ||
            dnsResult.answers.some((answer) =>
              answer.data.trim().toLowerCase().startsWith('v=stsv1')
            ))
        ) {
          const entry: AllowlistEntry = {
            tenantId,
            type: 'mta-sts',
            hostname: canonicalHostname(`mta-sts.${domain}`),
            port: 443,
            derivedFrom: {
              domain,
              queryType: dnsResult.query.type,
              queryName: dnsResult.query.name,
              answerData: dnsResult.answers.map((a: { data: string }) => a.data).join(', '),
            },
            expiresAt: new Date(entryExpiresAt.getTime()),
          };
          resultEntries.push(entry);
          entries.set(key(entry), entry);
        }
      }

      return resultEntries;
    },

    addCustomEntry(
      hostname: string,
      port: number,
      requestedBy: string,
      reason: string
    ): AllowlistEntry {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + defaultTtlMs);

      const entry: AllowlistEntry = {
        tenantId,
        type: 'custom',
        hostname: canonicalHostname(hostname),
        port,
        derivedFrom: {
          domain: 'custom',
          queryType: 'manual',
          queryName: hostname,
          answerData: `Requested by ${requestedBy}: ${reason}`,
        },
        expiresAt,
      };

      entries.set(key(entry), entry);
      return entry;
    },

    isAllowed(hostname: string, port?: number): boolean {
      cleanup();

      const host = canonicalHostname(hostname);
      const entryKey = port ? `${host}:${port}` : host;
      if (entries.has(entryKey)) {
        return true;
      }

      for (const entry of entries.values()) {
        if (entry.hostname === host) {
          if (port === undefined || entry.port === undefined || entry.port === port) {
            return true;
          }
        }
      }

      return false;
    },

    getEntry(hostname: string, port?: number): AllowlistEntry | undefined {
      cleanup();

      const host = canonicalHostname(hostname);
      const entryKey = port ? `${host}:${port}` : host;
      return entries.get(entryKey);
    },

    getAllEntries(): AllowlistEntry[] {
      cleanup();
      return Array.from(entries.values());
    },

    clear(): void {
      entries.clear();
    },
  };
}

/**
 * Tenant-aware allowlist manager
 * Manages allowlists across all tenants
 */
export class ProbeAllowlistManager {
  private tenantAllowlists: Map<string, TenantScopedAllowlist> = new Map();

  /**
   * Get or create a tenant-scoped allowlist
   */
  getTenantAllowlist(tenantId: string): TenantScopedAllowlist {
    let allowlist = this.tenantAllowlists.get(tenantId);
    if (!allowlist) {
      allowlist = createTenantAllowlist(tenantId);
      this.tenantAllowlists.set(tenantId, allowlist);
    }
    return allowlist;
  }

  /**
   * Check if a destination is allowed for a specific tenant
   */
  isAllowed(tenantId: string, hostname: string, port?: number): boolean {
    return this.getTenantAllowlist(tenantId).isAllowed(hostname, port);
  }

  /**
   * Clear all allowlists (use with caution)
   */
  clearAll(): void {
    this.tenantAllowlists.clear();
  }

  /**
   * Clear a specific tenant's allowlist
   */
  clearTenant(tenantId: string): void {
    this.tenantAllowlists.delete(tenantId);
  }

  /**
   * Get all active tenants with allowlists
   */
  getActiveTenants(): string[] {
    return Array.from(this.tenantAllowlists.keys());
  }
}

// Global manager instance
export const probeAllowlistManager = new ProbeAllowlistManager();

/**
 * Legacy compatibility: Global allowlist instance
 * DEPRECATED: Use probeAllowlistManager.getTenantAllowlist(tenantId) instead
 *
 * @deprecated Use TenantScopedAllowlist for new code
 */
export class ProbeAllowlist {
  private entries: Map<string, AllowlistEntry> = new Map();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = 5 * 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  generateFromDnsResults(
    domain: string,
    dnsResults: DNSQueryResult[],
    persistedExpiresAt?: Date
  ): AllowlistEntry[] {
    const entries: AllowlistEntry[] = [];
    const now = new Date();
    const entryExpiresAt = persistedExpiresAt
      ? new Date(persistedExpiresAt.getTime())
      : new Date(now.getTime() + this.defaultTtlMs);

    for (const result of dnsResults) {
      if (!result.success) continue;

      if (result.query.type === 'MX') {
        for (const answer of result.answers) {
          const parts = answer.data.trim().split(/\s+/);
          if (parts.length >= 2) {
            const hostname = canonicalHostname(parts[1]);
            const entry: AllowlistEntry = {
              tenantId: 'default', // Legacy entries are tenant-scoped
              type: 'mx',
              hostname,
              port: 25,
              derivedFrom: {
                domain,
                queryType: result.query.type,
                queryName: result.query.name,
                answerData: answer.data,
              },
              expiresAt: new Date(entryExpiresAt.getTime()),
            };
            entries.push(entry);
            this.entries.set(this.key(entry), entry);
          }
        }
      }

      if (
        result.query.type === 'TXT' &&
        (result.query.name.toLowerCase().includes('_mta-sts') ||
          result.answers.some((answer) => answer.data.trim().toLowerCase().startsWith('v=stsv1')))
      ) {
        const entry: AllowlistEntry = {
          tenantId: 'default',
          type: 'mta-sts',
          hostname: canonicalHostname(`mta-sts.${domain}`),
          port: 443,
          derivedFrom: {
            domain,
            queryType: result.query.type,
            queryName: result.query.name,
            answerData: result.answers.map((a: { data: string }) => a.data).join(', '),
          },
          expiresAt: new Date(entryExpiresAt.getTime()),
        };
        entries.push(entry);
        this.entries.set(this.key(entry), entry);
      }
    }

    return entries;
  }

  addCustomEntry(
    hostname: string,
    port: number,
    requestedBy: string,
    reason: string
  ): AllowlistEntry {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.defaultTtlMs);

    const entry: AllowlistEntry = {
      tenantId: 'default',
      type: 'custom',
      hostname: canonicalHostname(hostname),
      port,
      derivedFrom: {
        domain: 'custom',
        queryType: 'manual',
        queryName: hostname,
        answerData: `Requested by ${requestedBy}: ${reason}`,
      },
      expiresAt,
    };

    this.entries.set(this.key(entry), entry);
    return entry;
  }

  isAllowed(hostname: string, port?: number): boolean {
    this.cleanup();

    const host = canonicalHostname(hostname);
    const key = port ? `${host}:${port}` : host;
    if (this.entries.has(key)) {
      return true;
    }

    for (const entry of this.entries.values()) {
      if (entry.hostname === host) {
        if (port === undefined || entry.port === undefined || entry.port === port) {
          return true;
        }
      }
    }

    return false;
  }

  getEntry(hostname: string, port?: number): AllowlistEntry | undefined {
    this.cleanup();

    const host = canonicalHostname(hostname);
    const key = port ? `${host}:${port}` : host;
    return this.entries.get(key);
  }

  getAllEntries(): AllowlistEntry[] {
    this.cleanup();
    return Array.from(this.entries.values());
  }

  private cleanup(): void {
    for (const [key, entry] of this.entries) {
      if (!isExpiryFresh(entry.expiresAt)) {
        this.entries.delete(key);
      }
    }
  }

  private key(entry: AllowlistEntry): string {
    return entry.port ? `${entry.hostname}:${entry.port}` : entry.hostname;
  }

  clear(): void {
    this.entries.clear();
  }
}

// Global legacy instance
export const probeAllowlist = new ProbeAllowlist();
