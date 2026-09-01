/**
 * Mail Collection Module
 *
 * Extends DNS collection to gather mail-related records:
 * - MX, SPF TXT, _dmarc, DKIM selectors, _mta-sts, _smtp._tls
 * - Null MX detection
 * - DKIM selector discovery with provenance tracking
 */

import type { DNSQueryResult } from '../dns/types.js';
import {
  buildDkimQueryNames,
  isNullMx as checkIsNullMx,
  discoverSelectors,
  isDmarcRecord,
  isMtaStsRecord,
  parseSpfRecord,
  type SelectorDiscoveryConfig,
  type SelectorDiscoveryResult,
} from './selector-discovery.js';

export interface MailCollectionConfig {
  domain?: string;
  operatorSelectors?: string[];
  managedSelectors?: string[];
  skipDictionary?: boolean;
}

export interface MailCollectionResult {
  queries: { name: string; type: string }[];
  selectorDiscovery: SelectorDiscoveryResult;
  expectedRecords: {
    hasMx: boolean;
    hasSpf: boolean;
    hasDmarc: boolean;
    hasDkim: boolean;
    hasMtaSts: boolean;
    hasTlsRpt: boolean;
    isNullMx: boolean;
  };
}

/**
 * Generate mail-related DNS queries
 *
 * Uses the 5-level precedence strategy for DKIM selector discovery:
 * 1. Managed zone configured selectors
 * 2. Operator-supplied selectors
 * 3. Provider-specific heuristics
 * 4. Common selector dictionary
 * 5. No selector found → partial
 */
export async function generateMailQueries(
  domain: string,
  existingResults: DNSQueryResult[] = [],
  config: MailCollectionConfig = {}
): Promise<MailCollectionResult> {
  const discoveryConfig: SelectorDiscoveryConfig = {
    managedSelectors: config.managedSelectors,
    operatorSelectors: config.operatorSelectors,
    skipDictionary: config.skipDictionary,
  };

  // Discover DKIM selectors
  const selectorDiscovery = await discoverSelectors(domain, existingResults, discoveryConfig);

  // Build base queries (always collected)
  const queries: { name: string; type: string }[] = [
    { name: domain, type: 'MX' },
    { name: domain, type: 'TXT' }, // For SPF
    { name: `_dmarc.${domain}`, type: 'TXT' },
    { name: `_mta-sts.${domain}`, type: 'CNAME' },
    { name: `_mta-sts.${domain}`, type: 'TXT' },
    { name: `_smtp._tls.${domain}`, type: 'TXT' },
  ];

  // Add DKIM queries for discovered selectors
  const dkimQueries = buildDkimQueryNames(domain, selectorDiscovery.selectors);
  queries.push(...dkimQueries);

  // Determine expected records based on discovery
  const expectedRecords = {
    hasMx: true, // Always check for MX
    hasSpf: true, // SPF is on base domain TXT
    hasDmarc: true, // Always check for DMARC
    hasDkim: selectorDiscovery.selectors.length > 0,
    hasMtaSts: true, // Always check for MTA-STS
    hasTlsRpt: true, // Always check for TLS-RPT
    isNullMx: false, // Will be determined from results
  };

  return {
    queries,
    selectorDiscovery,
    expectedRecords,
  };
}

/**
 * Analyze mail-related DNS results
 */
export async function analyzeMailResults(results: DNSQueryResult[]): Promise<{
  mx: DNSQueryResult | null;
  spf: string | null;
  dmarc: DNSQueryResult | null;
  dkim: DNSQueryResult[];
  mtaSts: DNSQueryResult | null;
  tlsRpt: DNSQueryResult | null;
  isNullMx: boolean;
  provider: string;
}> {
  let mx: DNSQueryResult | null = null;
  let spf: string | null = null;
  let dmarc: DNSQueryResult | null = null;
  const dkim: DNSQueryResult[] = [];
  let mtaSts: DNSQueryResult | null = null;
  let tlsRpt: DNSQueryResult | null = null;
  let isNullMx = false;

  for (const result of results) {
    if (!result.success) continue;

    // MX record
    if (result.query.type === 'MX' && !result.query.name.includes('_')) {
      mx = result;
      if (checkIsNullMx(result)) {
        isNullMx = true;
      }
    }

    // SPF record (on base domain)
    if (
      result.query.type === 'TXT' &&
      result.query.name === result.query.name.split('.').slice(-2).join('.')
    ) {
      const spfData = parseSpfRecord(result);
      if (spfData) {
        spf = spfData;
      }
    }

    // DMARC
    if (result.query.type === 'TXT' && result.query.name.includes('_dmarc')) {
      if (isDmarcRecord(result)) {
        dmarc = result;
      }
    }

    // DKIM (selector._domainkey.domain)
    if (result.query.type === 'TXT' && result.query.name.includes('_domainkey')) {
      dkim.push(result);
    }

    // MTA-STS
    if (result.query.type === 'TXT' && result.query.name.includes('_mta-sts')) {
      if (isMtaStsRecord(result)) {
        mtaSts = result;
      }
    }

    // TLS-RPT
    if (result.query.type === 'TXT' && result.query.name.includes('_smtp._tls')) {
      tlsRpt = result;
    }
  }

  // Detect provider from MX results
  const { detectProvider } = await import('./selector-discovery.js');
  const provider = detectProvider(mx ? [mx] : []);

  return {
    mx,
    spf,
    dmarc,
    dkim,
    mtaSts,
    tlsRpt,
    isNullMx,
    provider,
  };
}

/**
 * Check if a domain has valid mail configuration
 */
export function hasValidMailConfig(analysis: {
  mx: DNSQueryResult | null;
  spf: string | null;
  dmarc: DNSQueryResult | null;
  isNullMx: boolean;
}): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Null MX is valid - explicitly indicates no mail
  if (analysis.isNullMx) {
    return { valid: true, issues: ['Null MX configured - domain does not accept mail'] };
  }

  // Must have MX record
  if (!analysis.mx) {
    issues.push('No MX record found');
  }

  // Should have SPF
  if (!analysis.spf) {
    issues.push('No SPF record found');
  }

  // Should have DMARC
  if (!analysis.dmarc) {
    issues.push('No DMARC record found');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
