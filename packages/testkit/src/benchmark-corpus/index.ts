/**
 * DNS Ops Workbench - Benchmark Corpus
 *
 * Representative domains and test cases for validating the system.
 * Each case has a known expected outcome or explicit "ambiguous by design" label.
 *
 * Categories:
 * - known-good-managed: Well-configured zones under our management
 * - known-good-unmanaged: Well-configured third-party zones
 * - historical-incidents: Domains with past issues (anonymized)
 * - intentionally-misconfigured: Test zones with deliberate issues
 * - edge-cases: IDN, wildcards, NXDOMAIN, NODATA, stale IPs
 */

import type { ResultState, ZoneManagement } from '@dns-ops/contracts';

export interface BenchmarkCase {
  /** Unique identifier for the test case */
  id: string;

  /** Human-readable description */
  description: string;

  /** Domain name to test */
  domain: string;

  /** Expected zone management classification */
  zoneManagement: ZoneManagement;

  /** Expected result state */
  expectedResult: ResultState;

  /** Category of test case */
  category: BenchmarkCategory;

  /** Specific test characteristics */
  characteristics: TestCharacteristic[];

  /** Expected findings (empty for ambiguous cases) */
  expectedFindings?: ExpectedFinding[];

  /** Notes for testers */
  notes?: string;

  /** Whether this case is "ambiguous by design" */
  ambiguousByDesign?: boolean;
}

export type BenchmarkCategory =
  | 'known-good-managed'
  | 'known-good-unmanaged'
  | 'historical-incident'
  | 'intentionally-misconfigured'
  | 'edge-case';

export type TestCharacteristic =
  | 'valid-dnssec'
  | 'invalid-dnssec'
  | 'no-dnssec'
  | 'has-mx'
  | 'null-mx'
  | 'no-mx'
  | 'has-spf'
  | 'no-spf'
  | 'has-dmarc'
  | 'no-dmarc'
  | 'has-dkim'
  | 'no-dkim'
  | 'cname-at-apex'
  | 'wildcard-records'
  | 'idn-punycode'
  | 'nxdomain'
  | 'nodata'
  | 'stale-ip'
  | 'lame-delegation'
  | 'glue-mismatch'
  | 'ns-mismatch'
  | 'timeout-prone'
  | 'refuse-queries';

export interface ExpectedFinding {
  /** Type of finding */
  type: string;

  /** Expected severity */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';

  /** Expected confidence */
  confidence: 'certain' | 'high' | 'medium' | 'low' | 'heuristic';

  /** Whether finding requires review */
  reviewOnly: boolean;
}

// =============================================================================
// KNOWN-GOOD MANAGED ZONES
// =============================================================================

export const knownGoodManaged: BenchmarkCase[] = [
  {
    id: 'managed-001',
    description: 'Standard managed zone with complete mail setup',
    domain: 'example-managed.com',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'known-good-managed',
    characteristics: ['valid-dnssec', 'has-mx', 'has-spf', 'has-dmarc', 'has-dkim'],
    expectedFindings: [],
    notes: 'Gold standard for managed zone configuration',
  },
  {
    id: 'managed-002',
    description: 'Managed zone without mail (web-only)',
    domain: 'webonly-managed.com',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'known-good-managed',
    characteristics: ['valid-dnssec', 'no-mx', 'no-spf', 'no-dmarc', 'no-dkim'],
    expectedFindings: [],
    notes: 'Valid configuration for non-mail domains',
  },
  {
    id: 'managed-003',
    description: 'Managed zone with Null MX (explicitly no mail)',
    domain: 'nomail-managed.com',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'known-good-managed',
    characteristics: ['valid-dnssec', 'null-mx', 'no-spf', 'has-dmarc'],
    expectedFindings: [],
    notes: "RFC 7505 Null MX configuration for domains that don't accept mail",
  },
];

// =============================================================================
// KNOWN-GOOD UNMANAGED ZONES
// =============================================================================

export const knownGoodUnmanaged: BenchmarkCase[] = [
  {
    id: 'unmanaged-001',
    description: 'Well-configured third-party zone (Google Workspace)',
    domain: 'google.com',
    zoneManagement: 'unmanaged',
    expectedResult: 'partial',
    category: 'known-good-unmanaged',
    characteristics: ['valid-dnssec', 'has-mx', 'has-spf', 'has-dmarc', 'has-dkim'],
    notes: 'Targeted inspection only - no zone enumeration',
  },
  {
    id: 'unmanaged-002',
    description: 'Well-configured third-party zone (Cloudflare)',
    domain: 'cloudflare.com',
    zoneManagement: 'unmanaged',
    expectedResult: 'partial',
    category: 'known-good-unmanaged',
    characteristics: ['valid-dnssec', 'has-mx', 'has-spf', 'has-dmarc'],
    notes: 'Targeted inspection only - limited to phase-1 record types',
  },
  {
    id: 'unmanaged-003',
    description: 'Root zone (extreme edge case)',
    domain: '.',
    zoneManagement: 'unmanaged',
    expectedResult: 'partial',
    category: 'known-good-unmanaged',
    characteristics: ['no-dnssec'],
    ambiguousByDesign: true,
    notes: 'DNS root zone - special handling required',
  },
];

// =============================================================================
// HISTORICAL INCIDENTS (Anonymized)
// =============================================================================

export const historicalIncidents: BenchmarkCase[] = [
  {
    id: 'incident-001',
    description: 'SPF record with nested dependencies requiring first-level-only disclosure',
    domain: 'spf-lookup-incident.test',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'historical-incident',
    characteristics: ['has-mx', 'has-spf', 'has-dmarc'],
    expectedFindings: [
      {
        type: 'mail.spf-present',
        severity: 'medium',
        confidence: 'certain',
        reviewOnly: true,
      },
    ],
    notes:
      'The published record contains unresolved dependencies. Phase 0–1 does not evaluate or claim compliance with the recursive ten-term lookup budget.',
  },
  {
    id: 'incident-002',
    description: 'Missing DMARC record (spoofing incident)',
    domain: 'missing-dmarc-incident.test',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'historical-incident',
    characteristics: ['has-mx', 'has-spf', 'no-dmarc'],
    expectedFindings: [
      {
        type: 'dmarc-missing',
        severity: 'medium',
        confidence: 'certain',
        reviewOnly: false,
      },
    ],
    notes: 'Domain lacked DMARC policy, leading to spoofing',
  },
  {
    id: 'incident-003',
    description: 'Stale IP migration (A record pointing to decommissioned server)',
    domain: 'stale-ip-incident.test',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'historical-incident',
    characteristics: ['has-mx', 'stale-ip'],
    expectedFindings: [
      {
        type: 'a-record-stale-ip',
        severity: 'critical',
        confidence: 'high',
        reviewOnly: true,
      },
    ],
    notes: 'A record pointed to IP that was decommissioned',
  },
];

// =============================================================================
// INTENTIONALLY MISCONFIGURED TEST ZONES
// =============================================================================

export const intentionallyMisconfigured: BenchmarkCase[] = [
  {
    id: 'misconfig-001',
    description: 'CNAME at zone apex (RFC violation)',
    domain: 'cname-apex.test',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'intentionally-misconfigured',
    characteristics: ['cname-at-apex', 'has-mx'],
    expectedFindings: [
      {
        type: 'cname-at-apex',
        severity: 'high',
        confidence: 'certain',
        reviewOnly: true,
      },
    ],
    notes: 'CNAME at apex violates RFC 1035 - should use ALIAS/ANAME',
  },
  {
    id: 'misconfig-002',
    description: 'MX points to CNAME (RFC violation)',
    domain: 'mx-cname-target.test',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'intentionally-misconfigured',
    characteristics: ['has-mx'],
    expectedFindings: [
      {
        type: 'mx-points-to-cname',
        severity: 'medium',
        confidence: 'certain',
        reviewOnly: true,
      },
    ],
    notes: 'MX records must point to A/AAAA records, not CNAMEs',
  },
  {
    id: 'misconfig-003',
    description: 'Lame delegation (NS points to non-responsive server)',
    domain: 'lame-delegation.test',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'intentionally-misconfigured',
    characteristics: ['lame-delegation'],
    expectedFindings: [
      {
        type: 'lame-delegation',
        severity: 'high',
        confidence: 'certain',
        reviewOnly: true,
      },
    ],
    notes: 'NS record points to server that is not authoritative',
  },
  {
    id: 'misconfig-004',
    description: 'Inconsistent NS across authoritative servers',
    domain: 'ns-mismatch.test',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'intentionally-misconfigured',
    characteristics: ['ns-mismatch'],
    expectedFindings: [
      {
        type: 'ns-set-inconsistent',
        severity: 'critical',
        confidence: 'certain',
        reviewOnly: true,
      },
    ],
    notes: 'Different authoritative servers return different NS sets',
  },
];

// =============================================================================
// EDGE CASES
// =============================================================================

export const edgeCases: BenchmarkCase[] = [
  {
    id: 'edge-001',
    description: 'IDN/punycode domain',
    domain: 'xn--nxasmq5a3a.test',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'edge-case',
    characteristics: ['idn-punycode'],
    notes: 'Internationalized domain name (Greek characters)',
  },
  {
    id: 'edge-002',
    description: 'Wildcard DNS records',
    domain: 'wildcard-test.com',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'edge-case',
    characteristics: ['wildcard-records'],
    notes: 'Domain uses wildcard records for subdomains',
  },
  {
    id: 'edge-003',
    description: 'NXDOMAIN case (non-existent domain)',
    domain: 'this-definitely-does-not-exist-12345.test',
    zoneManagement: 'unknown',
    expectedResult: 'failed',
    category: 'edge-case',
    characteristics: ['nxdomain'],
    notes: 'Domain should return NXDOMAIN',
  },
  {
    id: 'edge-004',
    description: 'NODATA case (name exists but no records for type)',
    domain: 'nodata-test.com',
    zoneManagement: 'managed',
    expectedResult: 'complete',
    category: 'edge-case',
    characteristics: ['nodata'],
    notes: 'Query for AAAA when only A exists should return NODATA',
  },
  {
    id: 'edge-005',
    description: 'Query timeout prone domain',
    domain: 'timeout-prone.test',
    zoneManagement: 'unmanaged',
    expectedResult: 'partial',
    category: 'edge-case',
    characteristics: ['timeout-prone'],
    ambiguousByDesign: true,
    notes: 'Domain with slow/unresponsive nameservers - may timeout',
  },
  {
    id: 'edge-006',
    description: 'Refuse queries domain',
    domain: 'refuse-queries.test',
    zoneManagement: 'unmanaged',
    expectedResult: 'partial',
    category: 'edge-case',
    characteristics: ['refuse-queries'],
    notes: 'Nameserver returns REFUSED for certain queries',
  },
];

// =============================================================================
// ALL BENCHMARK CASES
// =============================================================================

export const benchmarkCorpus: BenchmarkCase[] = [
  ...knownGoodManaged,
  ...knownGoodUnmanaged,
  ...historicalIncidents,
  ...intentionallyMisconfigured,
  ...edgeCases,
];

/**
 * Get benchmark cases by category
 */
export function getCasesByCategory(category: BenchmarkCategory): BenchmarkCase[] {
  return benchmarkCorpus.filter((c) => c.category === category);
}

/**
 * Get benchmark case by ID
 */
export function getCaseById(id: string): BenchmarkCase | undefined {
  return benchmarkCorpus.find((c) => c.id === id);
}

/**
 * Get all managed zone test cases
 */
export function getManagedCases(): BenchmarkCase[] {
  return benchmarkCorpus.filter((c) => c.zoneManagement === 'managed');
}

/**
 * Get all unmanaged zone test cases
 */
export function getUnmanagedCases(): BenchmarkCase[] {
  return benchmarkCorpus.filter((c) => c.zoneManagement === 'unmanaged');
}

/**
 * Get cases with specific characteristics
 */
export function getCasesByCharacteristic(characteristic: TestCharacteristic): BenchmarkCase[] {
  return benchmarkCorpus.filter((c) => c.characteristics.includes(characteristic));
}

export default benchmarkCorpus;
