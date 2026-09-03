/**
 * Pasted Evidence Parsing (Issue #56)
 *
 * Turns operator-pasted text — dig output or an RFC5322 bounce/report header
 * block — into the same observation/finding vocabulary a snapshot produces,
 * without collecting anything. Nothing here performs I/O; callers decide how
 * (or whether) to persist. Every produced finding is marked with
 * `paste` rule ids so downstream surfaces can label it as pasted evidence.
 */

import type {
  DNSRecord,
  EvidenceLink,
  NewFinding,
  Observation,
  RecordSet,
} from '@dns-ops/db/schema';
import { normalizeDomain } from '../dns/index.js';

export type PasteKind = 'dig' | 'bounce-header' | 'unknown';

/** Synthetic snapshot id used for pasted-evidence evaluation (never persisted). */
export const PASTE_SNAPSHOT_ID = '00000000-0000-4000-8000-000000000000';

const PASTE_RULE_ID = 'paste.auth-results.v1';
const PASTE_RULE_VERSION = '1.0.0';

const KNOWN_RECORD_TYPES = new Set([
  'A',
  'AAAA',
  'CAA',
  'CNAME',
  'DNAME',
  'DNSKEY',
  'DS',
  'HINFO',
  'HTTPS',
  'LOC',
  'MX',
  'NAPTR',
  'NS',
  'NSEC',
  'NSEC3',
  'PTR',
  'SOA',
  'SPF',
  'SRV',
  'SVCB',
  'TLSA',
  'TXT',
]);

const RCODE_TO_STATUS: Record<string, { status: Observation['status']; code: number }> = {
  NOERROR: { status: 'success', code: 0 },
  FORMERR: { status: 'error', code: 1 },
  SERVFAIL: { status: 'error', code: 2 },
  NXDOMAIN: { status: 'nxdomain', code: 3 },
  NOTIMP: { status: 'error', code: 4 },
  REFUSED: { status: 'refused', code: 5 },
};

/** Cheap structural detection; ambiguity must fail closed to `unknown`. */
export function detectPasteKind(text: string): PasteKind {
  const trimmed = text.trim();
  if (!trimmed) return 'unknown';
  if (trimmed.includes('<<>>') || /^\s*;;/m.test(trimmed)) return 'dig';
  if (DIG_RECORD_LINE.test(trimmed)) return 'dig';
  if (/^[A-Za-z0-9-]+:\s/m.test(trimmed)) return 'bounce-header';
  return 'unknown';
}

const DIG_RECORD_LINE = /^(\*?\S+?)\.?\s+(\d+)\s+(?:IN\s+)?([A-Z]{1,10})\s+(\S.*)$/m;

function parseDigTtlData(data: string): string {
  const quoted = data.match(/"([^"]*)"/g);
  if (!quoted) return data.trim();
  // RFC 1035: TXT character-strings concatenate without separators.
  return quoted.map((chunk) => chunk.slice(1, -1)).join('');
}

export interface DigParseResult {
  observations: Observation[];
  recordSets: RecordSet[];
  parse: {
    queryName: string | null;
    queryType: string | null;
    rcode: string | null;
    flags: Record<string, boolean> | null;
    recordCount: number;
  };
}

/**
 * Parse dig answer output into synthetic observations and record sets.
 * Only the ANSWER SECTION content (and bare record lines) is evidence; the
 * question/header sections set query context, status, and flags.
 */
export function parseDigOutput(
  text: string,
  options: { vantageType?: Observation['vantageType'] } = {}
): DigParseResult {
  const queryMatch = text.match(/<<>>\s+DiG\s[\s\S]*?<<>>\s*([^\n]*)/);
  let queryName: string | null = null;
  let queryType: string | null = null;
  if (queryMatch) {
    const args = queryMatch[1]
      .trim()
      .split(/\s+/)
      .filter((t) => !/^[+@-]/.test(t));
    if (args.length > 0) queryName = normalizeDomain(args[0]);
    if (args.length > 1 && /^[A-Za-z]{1,10}$/.test(args[1])) queryType = args[1].toUpperCase();
  }

  const rcodeMatch = text.match(/status:\s*([A-Z]+)/);
  const rcode = rcodeMatch ? rcodeMatch[1] : null;

  let flags: Record<string, boolean> | null = null;
  const flagsMatch = text.match(/flags:\s*([^;\n]+);/);
  if (flagsMatch) {
    flags = {};
    for (const token of flagsMatch[1].trim().split(/\s+/)) {
      if (/^[a-z]{2,4}$/.test(token)) flags[token] = true;
    }
  }

  const records: DNSRecord[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    const match = DIG_RECORD_LINE.exec(line);
    if (!match) continue;
    const [, name, ttl, type, data] = match;
    if (!KNOWN_RECORD_TYPES.has(type)) continue;
    records.push({
      name: normalizeDomain(name),
      type,
      ttl: Number(ttl),
      data: type === 'TXT' ? parseDigTtlData(data) : data.trim(),
    });
  }

  const rcodeInfo = rcode ? RCODE_TO_STATUS[rcode] : undefined;
  const status: Observation['status'] = rcodeInfo
    ? rcodeInfo.status
    : records.length > 0
      ? 'success'
      : 'error';
  const responseCode = rcodeInfo ? rcodeInfo.code : null;
  const vantageType = options.vantageType ?? 'public-recursive';

  const groups = new Map<string, DNSRecord[]>();
  for (const record of records) {
    const key = `${record.name}|${record.type}`;
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  const observations: Observation[] = [];
  const recordSets: RecordSet[] = [];
  for (const [key, groupRecords] of groups) {
    const [name, type] = key.split('|');
    const observation: Observation = {
      id: crypto.randomUUID(),
      snapshotId: PASTE_SNAPSHOT_ID,
      queryName: name,
      queryType: type,
      vantageType,
      vantageIdentifier: 'pasted',
      status,
      queriedAt: new Date(),
      responseTimeMs: null,
      responseCode,
      flags,
      answerSection: groupRecords,
      authoritySection: null,
      additionalSection: null,
      errorMessage: status === 'success' ? null : `pasted dig status: ${rcode ?? 'unknown'}`,
      errorDetails: null,
      rawResponse: null,
    };
    observations.push(observation);
    recordSets.push({
      id: crypto.randomUUID(),
      snapshotId: PASTE_SNAPSHOT_ID,
      name,
      type,
      ttl: groupRecords[0].ttl,
      values: groupRecords.map((r) => r.data),
      sourceObservationIds: [observation.id],
      sourceVantages: ['pasted'],
      isConsistent: true,
      consolidationNotes: 'pasted dig output',
      createdAt: new Date(),
    });
  }

  return {
    observations,
    recordSets: status === 'success' ? recordSets : [],
    parse: {
      queryName,
      queryType,
      rcode,
      flags,
      recordCount: records.length,
    },
  };
}

export interface PasteAuthResult {
  method: 'spf' | 'dkim' | 'dmarc';
  result: string;
  domain: string | null;
}

export interface BounceHeaderParseResult {
  headers: Record<string, string>;
  authResults: PasteAuthResult[];
  receivedHosts: string[];
}

function authResultsDomain(token: string): string | null {
  const value = token.split('=').slice(1).join('=').trim();
  if (!value) return null;
  const parts = value.split('@');
  const candidate = parts.length > 1 ? parts[parts.length - 1] : value;
  const normalized = normalizeDomain(candidate.replace(/[<>]/g, ''));
  return /^[a-z0-9.-]+$/.test(normalized) ? normalized : null;
}

function parseAuthResults(value: string): PasteAuthResult[] {
  const results: PasteAuthResult[] = [];
  // First chunk is the authserv-id; the rest are `method=result` / property tokens.
  for (const chunk of value.split(';').slice(1)) {
    const token = chunk.trim();
    const match = /^(spf|dkim|dmarc)=([a-z]+)\b/i.exec(token);
    if (!match) continue;
    const method = match[1].toLowerCase() as PasteAuthResult['method'];
    const domainToken = token
      .split(/\s+/)
      .find((t) =>
        t.startsWith(
          method === 'spf' ? 'smtp.mailfrom=' : method === 'dkim' ? 'header.d=' : 'header.from='
        )
      );
    results.push({
      method,
      result: match[2].toLowerCase(),
      domain: domainToken ? authResultsDomain(domainToken) : null,
    });
  }
  return results;
}

/** Parse an RFC5322 header block (bounce / DMARC report cover message). */
export function parseBounceHeaders(text: string): BounceHeaderParseResult {
  const headers: Record<string, string> = {};
  const receivedHosts: string[] = [];

  let currentName: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      if (currentName) break; // blank line ends the header block
      continue;
    }
    if (/^[ \t]/.test(rawLine) && currentName) {
      headers[currentName] += ` ${rawLine.trim()}`;
      continue;
    }
    const match = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(rawLine);
    if (!match) {
      if (currentName) break; // body content reached
      continue;
    }
    currentName = match[1].toLowerCase();
    headers[currentName] = match[2].trim();
    if (currentName === 'received') {
      const from = match[2].match(/^from\s+(\S+)/i);
      if (from) receivedHosts.push(from[1].replace(/[();,]+$/g, ''));
    }
  }

  const authResults = (
    headers['authentication-results'] ? [headers['authentication-results']] : []
  ).flatMap(parseAuthResults);

  return { headers, authResults, receivedHosts };
}

function pasteFinding(input: {
  type: string;
  title: string;
  description: string;
  severity: NewFinding['severity'];
  evidence: EvidenceLink[];
}): NewFinding {
  return {
    id: crypto.randomUUID(),
    snapshotId: PASTE_SNAPSHOT_ID,
    type: input.type,
    title: input.title,
    description: input.description,
    severity: input.severity,
    confidence: 'certain',
    riskPosture: input.severity === 'info' ? 'safe' : 'medium',
    blastRadius: 'single-domain',
    reviewOnly: false,
    evidence: input.evidence,
    ruleId: PASTE_RULE_ID,
    ruleVersion: PASTE_RULE_VERSION,
    rulesetVersionId: 'pasted',
    createdAt: new Date(),
  };
}

const PRESENT_TYPES: Record<PasteAuthResult['method'], { type: string; label: string }> = {
  spf: { type: 'mail.spf-present', label: 'SPF record' },
  dkim: { type: 'mail.dkim-keys-present', label: 'DKIM keys' },
  dmarc: { type: 'mail.dmarc-present', label: 'DMARC policy' },
};

const NONE_TYPES: Partial<
  Record<
    PasteAuthResult['method'],
    { type: string; label: string; severity: NewFinding['severity'] }
  >
> = {
  // spf=none / dmarc=none are authoritative per RFC 7208/7489: no record was
  // found for the domain. dkim=none only means this message was not DKIM'd —
  // it proves nothing about published keys, so it produces no finding.
  spf: { type: 'mail.no-spf-record', label: 'SPF record', severity: 'high' },
  dmarc: { type: 'mail.no-dmarc-record', label: 'DMARC policy', severity: 'high' },
};

/**
 * Map pasted Authentication-Results entries to the same finding types a
 * snapshot evaluation produces. Only `none` (record provably absent) and
 * `pass` (record provably present and evaluated) map; per-message failure
 * results cannot establish configuration facts, so they are skipped.
 */
export function authResultsToFindings(authResults: PasteAuthResult[]): NewFinding[] {
  const findings: NewFinding[] = [];
  for (const entry of authResults) {
    const description = `Pasted Authentication-Results carries ${entry.method}=${entry.result}${
      entry.domain ? ` for ${entry.domain}` : ''
    }. This is per-message evaluation of the pasted header, not a fresh DNS collection.`;
    const evidence: EvidenceLink[] = [
      {
        observationId: PASTE_SNAPSHOT_ID,
        description: `Authentication-Results: ${entry.method}=${entry.result}${
          entry.domain ? ` (domain ${entry.domain})` : ''
        } — pasted evidence`,
      },
    ];
    if (entry.result === 'pass') {
      const present = PRESENT_TYPES[entry.method];
      findings.push(
        pasteFinding({
          type: present.type,
          title: `${present.label} present for ${entry.domain ?? 'pasted domain'} (pasted evidence)`,
          description,
          severity: 'info',
          evidence,
        })
      );
      continue;
    }
    const absent = NONE_TYPES[entry.method];
    if (absent && entry.result === 'none') {
      findings.push(
        pasteFinding({
          type: absent.type,
          title: `No ${absent.label.toLowerCase()} found for ${entry.domain ?? 'pasted domain'} (pasted evidence)`,
          description,
          severity: absent.severity,
          evidence,
        })
      );
    }
  }
  return findings;
}
