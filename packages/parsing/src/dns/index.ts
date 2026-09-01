/**
 * DNS Response Parsing
 *
 * Parse and normalize DNS responses into structured formats.
 */

import type { DNSRecord } from '@dns-ops/db/schema';

export interface ParsedAnswer {
  name: string;
  type: string;
  ttl: number;
  data: string;
  priority?: number;
}

/** Maximum number of CNAME edges trusted by DNS evidence consumers. */
export const MAX_DNS_CNAME_HOPS = 5;

export interface NormalizedDNSOwner {
  original: string;
  normalized: string;
}

/**
 * Normalize a DNS owner name without applying domain-only restrictions.
 * Service owners such as `_mta-sts.example.com` legitimately contain `_`.
 * DNS responses are expected to expose non-ASCII names in wire-format
 * punycode; arbitrary escaped/binary labels are rejected here.
 */
export function tryNormalizeDNSOwner(name: string): NormalizedDNSOwner | null {
  if (typeof name !== 'string') return null;

  const trimmed = name.trim();
  if (!trimmed || trimmed.endsWith('..')) return null;

  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  if (
    !normalized ||
    normalized.length > 253 ||
    normalized.includes('..') ||
    normalized.includes('*')
  ) {
    return null;
  }

  const labels = normalized.split('.');
  if (
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        label.startsWith('-') ||
        label.endsWith('-') ||
        !/^[a-z0-9_-]+$/i.test(label)
    )
  ) {
    return null;
  }

  return { original: name, normalized: normalized.toLowerCase() };
}

/**
 * Parse raw DNS answer data into structured format
 */
export function parseDNSAnswer(record: DNSRecord): ParsedAnswer {
  const base: ParsedAnswer = {
    name: record.name,
    type: record.type,
    ttl: record.ttl,
    data: record.data,
  };

  // Add type-specific fields
  if (record.type === 'MX' && record.priority !== undefined) {
    base.priority = record.priority;
  }

  return base;
}

/**
 * Parse TXT record data, handling multiple strings
 */
export function parseTXTRecord(data: string): string[] {
  // TXT records can be composed of multiple quoted strings
  // e.g., "v=spf1" "include:_spf.google.com" "~all"
  const strings: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (const char of data) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      if (inQuotes) {
        strings.push(current);
        current = '';
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (inQuotes) {
      current += char;
    }
  }

  // If no quoted strings found, return the whole data as one string
  if (strings.length === 0 && data) {
    return [data];
  }

  return strings;
}

/**
 * Normalize a domain name (lowercase, remove trailing dot)
 */
export function normalizeDomain(name: string): string {
  return name.toLowerCase().replace(/\.$/, '');
}

/**
 * Check if a name is a wildcard
 */
export function isWildcard(name: string): boolean {
  return name.startsWith('*.');
}

/**
 * Extract the wildcard base (e.g., *.example.com -> example.com)
 */
export function getWildcardBase(name: string): string {
  if (!isWildcard(name)) return name;
  return name.slice(2);
}
