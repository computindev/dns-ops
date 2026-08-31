/**
 * Persisted DNS Authorization - Issue #67
 *
 * Loads and validates the only DNS evidence trusted for probe target
 * authorization: the collector-created chain
 *
 *   tenant-owned domain → latest complete snapshot → consistent record set
 *     → immutable source observations
 *
 * Caller-supplied DNS-shaped arrays (txtRecords / mxRecords / dnsResults) are
 * never accepted here. Every observation must come from a trusted collector
 * vantage (missing, `mock`, and `probe` provenance is rejected), authoritative
 * answers must carry the AA flag, and every relevant answer must still be
 * fresh, where freshness is `queriedAt + min(answer TTL, 5 minutes)` — the
 * same ceiling the probe allowlist already enforces. Anything else fails
 * closed.
 */

import { DNS_RCODE } from '@dns-ops/contracts';
import {
  type DNSRecord,
  DomainRepository,
  type IDatabaseAdapter,
  type Observation,
  ObservationRepository,
  type RecordSet,
  RecordSetRepository,
  type Snapshot,
  SnapshotRepository,
} from '@dns-ops/db';
import { normalizeDNSDomain, tryNormalizeDomain } from '@dns-ops/parsing';
import type { DNSQueryResult } from '../dns/types.js';
import { validateMTASTSTxtRecord } from './mta-sts.js';

/** Freshness ceiling for persisted evidence. Mirrors the allowlist TTL. */
const MAX_EVIDENCE_FRESHNESS_MS = 5 * 60 * 1000;

export interface EvidenceFailure {
  ok: false;
  status: 400 | 403;
  error: string;
  reason: string;
}

export interface PersistedMxEvidence {
  ok: true;
  domain: string;
  hosts: Array<{ hostname: string; priority: number }>;
  expiresAt: Date;
  /** Derived only from persisted observations; feeds the tenant allowlist. */
  dnsResults: DNSQueryResult[];
}

export interface PersistedMtaStsEvidence {
  ok: true;
  domain: string;
  txtRecord: string;
  txtRecordId: string;
  expiresAt: Date;
  /** Derived only from persisted observations; feeds the tenant allowlist. */
  dnsResults: DNSQueryResult[];
}

function fail(status: 400 | 403, error: string, reason: string): EvidenceFailure {
  return { ok: false, status, error, reason };
}

interface TrustedChain {
  ok: true;
  domain: string;
  snapshot: Snapshot;
  recordSet: RecordSet;
  ownerName: string;
}

async function loadTrustedRecordSet(
  db: IDatabaseAdapter,
  input: { domain: string; tenantId: string },
  recordType: 'MX' | 'TXT'
): Promise<TrustedChain | EvidenceFailure> {
  const normalized = tryNormalizeDomain(input.domain);
  if (!normalized) {
    return fail(400, 'Domain is invalid', 'invalid-domain');
  }
  const domain = normalized.normalized;

  const domainRow = await new DomainRepository(db).findByNameForTenant(domain, input.tenantId);
  if (!domainRow || domainRow.tenantId !== input.tenantId) {
    return fail(403, 'Domain is not registered for this tenant', 'unknown-domain');
  }

  const snapshot = await new SnapshotRepository(db).findLatestByDomain(domainRow.id);
  if (!snapshot) {
    return fail(403, 'No snapshot exists for this domain', 'missing-snapshot');
  }
  if (snapshot.resultState !== 'complete') {
    return fail(403, 'Latest snapshot is not complete', 'incomplete-snapshot');
  }

  const ownerName = recordType === 'MX' ? domain : `_mta-sts.${domain}`;
  const recordSet = await new RecordSetRepository(db).findByNameAndType(
    snapshot.id,
    ownerName,
    recordType
  );
  if (!recordSet) {
    return fail(403, `No persisted ${recordType} record set for this domain`, 'missing-record-set');
  }
  if (recordSet.isConsistent !== true) {
    return fail(403, 'Record set is inconsistent across vantages', 'inconsistent-record-set');
  }
  if (
    !Array.isArray(recordSet.sourceObservationIds) ||
    recordSet.sourceObservationIds.length === 0
  ) {
    return fail(403, 'Record set has no source observations', 'missing-source-observations');
  }

  return { ok: true, domain, snapshot, recordSet, ownerName };
}

interface RelevantObservation {
  observation: Observation;
  answers: DNSRecord[];
}

async function loadRelevantObservations(
  db: IDatabaseAdapter,
  chain: TrustedChain,
  recordType: 'MX' | 'TXT'
): Promise<RelevantObservation[] | EvidenceFailure> {
  const obsRepo = new ObservationRepository(db);
  const relevant: RelevantObservation[] = [];

  for (const id of chain.recordSet.sourceObservationIds) {
    const obs = await obsRepo.findById(id);
    if (!obs) {
      return fail(403, 'Source observation is missing', 'missing-source-observation');
    }
    if (obs.snapshotId !== chain.snapshot.id) {
      return fail(
        403,
        'Observation belongs to a different snapshot',
        'observation-snapshot-mismatch'
      );
    }
    if (normalizeDNSDomain(obs.queryName) !== chain.ownerName || obs.queryType !== recordType) {
      return fail(
        403,
        'Observation does not match the record set query',
        'observation-query-mismatch'
      );
    }
    if (obs.status !== 'success') {
      return fail(403, 'Source observation was not successful', 'unsuccessful-observation');
    }
    if (obs.responseCode !== DNS_RCODE.NOERROR) {
      return fail(403, 'Source observation has a failed DNS response', 'dns-response-failure');
    }

    const identifier = (obs.vantageIdentifier ?? '').trim();
    if (!identifier) {
      return fail(403, 'Observation has no vantage identifier', 'missing-vantage-identifier');
    }
    const lowered = identifier.toLowerCase();
    if (lowered === 'mock' || lowered === 'probe' || obs.vantageType === 'probe') {
      return fail(403, 'Observation vantage is not trusted', 'untrusted-vantage');
    }
    if (obs.vantageType === 'authoritative' && obs.flags?.authoritative !== true) {
      return fail(
        403,
        'Authoritative observation is missing the AA flag',
        'authoritative-answer-flag-missing'
      );
    }

    const answers = (obs.answerSection ?? []).filter(
      (a) => a.type === recordType && normalizeDNSDomain(a.name) === chain.ownerName
    );
    if (answers.length === 0) {
      return fail(403, 'Observation carries no answer for this record set', 'missing-answer');
    }

    relevant.push({ observation: obs, answers });
  }

  return relevant;
}

/**
 * Freshness of one answer: queriedAt + min(answer TTL, five-minute ceiling),
 * strictly in the future. Zero/invalid TTLs, future-dated queries, and the
 * exact expiry boundary all fail.
 */
function answerExpiry(queriedAt: unknown, ttlSeconds: unknown, now: Date): Date | null {
  const queried =
    queriedAt instanceof Date ? queriedAt.getTime() : Date.parse(String(queriedAt ?? ''));
  if (!Number.isFinite(queried)) {
    return null;
  }
  if (!Number.isFinite(ttlSeconds as number) || (ttlSeconds as number) <= 0) {
    return null;
  }
  if (queried > now.getTime()) {
    return null;
  }
  const ttlMs = Math.min((ttlSeconds as number) * 1000, MAX_EVIDENCE_FRESHNESS_MS);
  return new Date(queried + ttlMs);
}

function earliestFreshExpiry(relevant: RelevantObservation[], now: Date): Date | EvidenceFailure {
  let earliest: Date | null = null;
  for (const { observation, answers } of relevant) {
    for (const answer of answers) {
      const expiry = answerExpiry(observation.queriedAt, answer.ttl, now);
      if (!expiry || expiry.getTime() <= now.getTime()) {
        return fail(403, 'Persisted DNS evidence is stale', 'stale-evidence');
      }
      if (!earliest || expiry < earliest) {
        earliest = expiry;
      }
    }
  }
  if (!earliest) {
    return fail(403, 'Persisted DNS evidence has no answers', 'missing-answer');
  }
  return earliest;
}

function toDnsResults(
  relevant: RelevantObservation[],
  ownerName: string,
  recordType: 'MX' | 'TXT'
): DNSQueryResult[] {
  return relevant.map(({ observation, answers }) => ({
    query: { name: ownerName, type: recordType },
    vantage: {
      type: observation.vantageType === 'public-recursive' ? 'public-recursive' : 'authoritative',
      identifier: observation.vantageIdentifier ?? '',
    },
    success: true,
    responseCode: observation.responseCode ?? DNS_RCODE.NOERROR,
    answers: answers.map((a) => ({ name: a.name, type: a.type, ttl: a.ttl ?? 0, data: a.data })),
    authority: [],
    additional: [],
    responseTime: observation.responseTimeMs ?? 0,
  }));
}

/**
 * Load fresh, persisted MX evidence for a tenant-owned domain.
 */
export async function loadPersistedMxEvidence(
  db: IDatabaseAdapter,
  input: { domain: string; tenantId: string }
): Promise<PersistedMxEvidence | EvidenceFailure> {
  const chain = await loadTrustedRecordSet(db, input, 'MX');
  if (!chain.ok) return chain;

  const relevant = await loadRelevantObservations(db, chain, 'MX');
  if (!Array.isArray(relevant)) return relevant;

  const now = new Date();
  const expiresAt = earliestFreshExpiry(relevant, now);
  if (!(expiresAt instanceof Date)) return expiresAt;

  const hosts: Array<{ hostname: string; priority: number }> = [];
  const seen = new Set<string>();
  for (const { answers } of relevant) {
    for (const answer of answers) {
      const parts = answer.data.trim().split(/\s+/);
      if (parts.length < 2) {
        return fail(403, 'Persisted MX answer is malformed', 'malformed-mx-answer');
      }
      const priority = Number.parseInt(parts[0], 10);
      const target = tryNormalizeDomain(parts[1]);
      if (!Number.isFinite(priority) || !target) {
        return fail(403, 'Persisted MX answer is malformed', 'malformed-mx-answer');
      }
      if (!seen.has(target.normalized)) {
        seen.add(target.normalized);
        hosts.push({ hostname: target.normalized, priority });
      }
    }
  }
  if (hosts.length === 0) {
    return fail(403, 'Persisted MX evidence has no targets', 'missing-answer');
  }

  return {
    ok: true,
    domain: chain.domain,
    hosts,
    expiresAt,
    dnsResults: toDnsResults(relevant, chain.ownerName, 'MX'),
  };
}

/**
 * Load fresh, persisted MTA-STS TXT evidence for a tenant-owned domain.
 */
export async function loadPersistedMtaStsEvidence(
  db: IDatabaseAdapter,
  input: { domain: string; tenantId: string }
): Promise<PersistedMtaStsEvidence | EvidenceFailure> {
  const chain = await loadTrustedRecordSet(db, input, 'TXT');
  if (!chain.ok) return chain;

  const values = Array.isArray(chain.recordSet.values) ? chain.recordSet.values : [];
  const txtRecord = values.find((v) => v.includes('v=STSv1'));
  if (!txtRecord) {
    return fail(403, 'No persisted MTA-STS TXT record', 'missing-mta-sts-txt');
  }

  const relevant = await loadRelevantObservations(db, chain, 'TXT');
  if (!Array.isArray(relevant)) return relevant;

  // The TXT value must be backed by a fresh source observation, not just the
  // consolidated record-set row.
  const backedByAnswer = relevant.some(({ answers }) => answers.some((a) => a.data === txtRecord));
  if (!backedByAnswer) {
    return fail(
      403,
      'MTA-STS TXT value is not backed by a source observation',
      'unbacked-mta-sts-txt'
    );
  }

  const now = new Date();
  const expiresAt = earliestFreshExpiry(relevant, now);
  if (!(expiresAt instanceof Date)) return expiresAt;

  const validation = await validateMTASTSTxtRecord(chain.domain, [txtRecord]);
  if (!validation.valid) {
    return fail(403, validation.error ?? 'MTA-STS TXT record is invalid', 'missing-mta-sts-txt');
  }

  return {
    ok: true,
    domain: chain.domain,
    txtRecord,
    txtRecordId: validation.id ?? '',
    expiresAt,
    dnsResults: toDnsResults(relevant, chain.ownerName, 'TXT'),
  };
}
