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
import { MAX_DNS_CNAME_HOPS, tryNormalizeDNSOwner, tryNormalizeDomain } from '@dns-ops/parsing';
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

interface TrustedSnapshot {
  ok: true;
  domain: string;
  snapshot: Snapshot;
}

interface TrustedChain extends TrustedSnapshot {
  recordSet: RecordSet;
  ownerName: string;
}

async function loadTrustedSnapshot(
  db: IDatabaseAdapter,
  input: { domain: string; tenantId: string }
): Promise<TrustedSnapshot | EvidenceFailure> {
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

  return { ok: true, domain, snapshot };
}

function validateTrustedRecordSet(
  context: TrustedSnapshot,
  recordSet: RecordSet,
  ownerName: string
): TrustedChain | EvidenceFailure {
  if (recordSet.isConsistent !== true) {
    return fail(403, 'Record set is inconsistent across vantages', 'inconsistent-record-set');
  }
  if (
    !Array.isArray(recordSet.sourceObservationIds) ||
    recordSet.sourceObservationIds.length === 0
  ) {
    return fail(403, 'Record set has no source observations', 'missing-source-observations');
  }

  return { ...context, recordSet, ownerName };
}

async function loadTrustedRecordSet(
  db: IDatabaseAdapter,
  input: { domain: string; tenantId: string },
  recordType: 'MX' | 'TXT'
): Promise<TrustedChain | EvidenceFailure> {
  const context = await loadTrustedSnapshot(db, input);
  if (!context.ok) return context;

  const ownerName = recordType === 'MX' ? context.domain : `_mta-sts.${context.domain}`;
  const recordSet = await new RecordSetRepository(db).findByNameAndType(
    context.snapshot.id,
    ownerName,
    recordType
  );
  if (!recordSet) {
    return fail(403, `No persisted ${recordType} record set for this domain`, 'missing-record-set');
  }

  return validateTrustedRecordSet(context, recordSet, ownerName);
}

interface RelevantObservation {
  observation: Observation;
  answers: DNSRecord[];
}

async function loadRelevantObservations(
  db: IDatabaseAdapter,
  chain: TrustedChain,
  recordType: 'CNAME' | 'MX' | 'TXT',
  options: { answerNames?: ReadonlySet<string>; allowNoAnswers?: boolean } = {}
): Promise<RelevantObservation[] | EvidenceFailure> {
  const obsRepo = new ObservationRepository(db);
  const relevant: RelevantObservation[] = [];
  const answerNames = new Set(
    [...(options.answerNames ?? new Set([chain.ownerName]))]
      .map((name) => tryNormalizeDNSOwner(name)?.normalized)
      .filter((name): name is string => name !== undefined)
  );

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
    const observationOwner = tryNormalizeDNSOwner(obs.queryName)?.normalized;
    if (observationOwner !== chain.ownerName || obs.queryType !== recordType) {
      return fail(
        403,
        'Observation does not match the record set query',
        'observation-query-mismatch'
      );
    }
    if (obs.status !== 'success' && !(options.allowNoAnswers && obs.status === 'nodata')) {
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

    const answers = (obs.answerSection ?? []).filter((a) => {
      if (a.type !== recordType) return false;
      const owner = tryNormalizeDNSOwner(a.name)?.normalized;
      return owner !== undefined && answerNames.has(owner);
    });
    if (answers.length === 0 && !options.allowNoAnswers) {
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

interface PersistedCnameChain {
  ok: true;
  canonicalOwnerName: string;
  observations: RelevantObservation[];
}

/**
 * Resolve only CNAME rows persisted in the same complete snapshot. The
 * source observations are checked just like MX/TXT evidence, so a row cannot
 * redirect authorization through an unrelated owner or an untrusted vantage.
 */
function normalizeCnameTarget(value: unknown): string | null {
  return typeof value === 'string' ? (tryNormalizeDNSOwner(value)?.normalized ?? null) : null;
}

async function loadPersistedCnameChain(
  db: IDatabaseAdapter,
  context: TrustedSnapshot,
  initialOwnerName: string
): Promise<PersistedCnameChain | EvidenceFailure> {
  const recordSetRepo = new RecordSetRepository(db);
  const visited = new Set<string>();
  const observations: RelevantObservation[] = [];
  let ownerName = initialOwnerName;
  let hopCount = 0;

  while (true) {
    if (visited.has(ownerName)) {
      return fail(403, 'Persisted CNAME chain contains a loop', 'cname-chain-loop');
    }
    visited.add(ownerName);

    const cnameRecordSet = await recordSetRepo.findByNameAndType(
      context.snapshot.id,
      ownerName,
      'CNAME'
    );
    if (!cnameRecordSet) {
      return { ok: true, canonicalOwnerName: ownerName, observations };
    }
    if (
      !Array.isArray(cnameRecordSet.sourceObservationIds) ||
      cnameRecordSet.sourceObservationIds.length === 0
    ) {
      return fail(
        403,
        'CNAME record set has no source observations',
        'missing-cname-source-observations'
      );
    }
    if (!Array.isArray(cnameRecordSet.values)) {
      return fail(403, 'CNAME record set has no target', 'missing-cname-target');
    }

    const cnameChain: TrustedChain = {
      ...context,
      recordSet: cnameRecordSet,
      ownerName,
    };
    const relevant = await loadRelevantObservations(db, cnameChain, 'CNAME', {
      allowNoAnswers: true,
    });
    if (!Array.isArray(relevant)) return relevant;

    // A successful NODATA CNAME lookup proves that this owner is the terminal
    // name. Do not require a target on the empty CNAME record set created for
    // that observation; the terminal TXT record is checked by the caller.
    if (cnameRecordSet.values.length === 0) {
      if (relevant.some(({ observation }) => (observation.answerSection ?? []).length > 0)) {
        return fail(
          403,
          'CNAME record set has answers but no stored target',
          'unbacked-cname-target'
        );
      }
      return { ok: true, canonicalOwnerName: ownerName, observations };
    }
    if (hopCount >= MAX_DNS_CNAME_HOPS) {
      return fail(
        403,
        `Persisted CNAME chain exceeds ${MAX_DNS_CNAME_HOPS} hops`,
        'cname-chain-hop-limit'
      );
    }

    if (cnameRecordSet.isConsistent !== true) {
      return fail(
        403,
        'CNAME record set is inconsistent across vantages',
        'inconsistent-cname-record-set'
      );
    }
    if (relevant.some(({ answers }) => answers.length === 0)) {
      return fail(403, 'CNAME observation has no answer', 'missing-answer');
    }

    const targets: string[] = [];
    for (const { answers } of relevant) {
      for (const answer of answers) {
        const target = normalizeCnameTarget(answer.data);
        if (!target) {
          return fail(403, 'Persisted CNAME target is malformed', 'malformed-cname-target');
        }
        targets.push(target);
      }
    }

    const uniqueTargets = [...new Set(targets)];
    if (uniqueTargets.length !== 1) {
      return fail(403, 'Persisted CNAME chain has conflicting targets', 'conflicting-cname-target');
    }

    const storedTargets = cnameRecordSet.values.map((value) => normalizeCnameTarget(value));
    if (
      storedTargets.some((target) => !target) ||
      storedTargets.length !== 1 ||
      storedTargets[0] !== uniqueTargets[0]
    ) {
      return fail(
        403,
        'Persisted CNAME target is not backed by its source',
        'unbacked-cname-target'
      );
    }

    observations.push(...relevant);
    const target = uniqueTargets[0];
    if (visited.has(target)) {
      return fail(403, 'Persisted CNAME chain contains a loop', 'cname-chain-loop');
    }
    hopCount++;
    ownerName = target;
  }
}

function toDnsResults(
  relevant: RelevantObservation[],
  ownerName: string,
  recordType: 'CNAME' | 'MX' | 'TXT'
): DNSQueryResult[] {
  return relevant.map(({ observation, answers }) => ({
    query: {
      name:
        recordType === 'CNAME'
          ? (tryNormalizeDNSOwner(observation.queryName)?.normalized ?? observation.queryName)
          : ownerName,
      type: recordType,
    },
    vantage: {
      type: observation.vantageType === 'public-recursive' ? 'public-recursive' : 'authoritative',
      identifier: observation.vantageIdentifier ?? '',
    },
    success: true,
    responseCode: observation.responseCode ?? DNS_RCODE.NOERROR,
    answers: answers.map((a) => ({
      name: tryNormalizeDNSOwner(a.name)?.normalized ?? a.name,
      type: a.type,
      ttl: a.ttl ?? 0,
      data: a.data,
    })),
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
      const target = tryNormalizeDNSOwner(parts[1]);
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
  const context = await loadTrustedSnapshot(db, input);
  if (!context.ok) return context;

  const initialOwnerName = tryNormalizeDNSOwner(`_mta-sts.${context.domain}`)?.normalized;
  if (!initialOwnerName) {
    return fail(400, 'MTA-STS owner is invalid', 'invalid-mta-sts-owner');
  }
  const cnameChain = await loadPersistedCnameChain(db, context, initialOwnerName);
  if (!cnameChain.ok) return cnameChain;

  const txtRecordSet = await new RecordSetRepository(db).findByNameAndType(
    context.snapshot.id,
    cnameChain.canonicalOwnerName,
    'TXT'
  );
  if (!txtRecordSet) {
    return fail(403, 'No persisted TXT record set for this domain', 'missing-record-set');
  }
  const chain = validateTrustedRecordSet(context, txtRecordSet, cnameChain.canonicalOwnerName);
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
  const expiresAt = earliestFreshExpiry([...cnameChain.observations, ...relevant], now);
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
    dnsResults: [
      ...toDnsResults(relevant, chain.ownerName, 'TXT'),
      ...toDnsResults(cnameChain.observations, initialOwnerName, 'CNAME'),
    ],
  };
}
