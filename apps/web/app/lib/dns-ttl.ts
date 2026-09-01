/**
 * Remaining-TTL estimation for parsed DNS record rows (issue #55).
 *
 * Evidence rule: a row's estimate comes only from matching answers of
 * successful `public-recursive` observations referenced by
 * `sourceObservationIds`. The averaged `record.ttl` is never used — it mixes
 * vantages and fabricates 0 for missing data, so it cannot drive a countdown.
 *
 * "Estimated live at" means the expiry of the latest observed
 * public-recursive cache entry, not Internet-wide propagation.
 */
import type { Observation } from '@dns-ops/db/schema';

export const DNS_QUERY_TIMESTAMP_BASIS = 'response-received-v1' as const;

export type TtlEvidenceMetadata = unknown;

export type TtlEstimate =
  | { state: 'live'; deadline: number; remainingSeconds: number }
  /** Evidence existed but the observed cache entry has expired. */
  | { state: 'stale'; deadline: number }
  /** No valid matching public-recursive evidence for this row. */
  | { state: 'unknown' };

export type ObservationIndex = ReadonlyMap<string, Observation>;

/** Server-wall-clock epoch anchored to a monotonic browser timestamp. */
export interface EvidenceClock {
  epochMs: number;
  monotonicMs: number;
}

export function indexObservationsById(observations: readonly Observation[]): ObservationIndex {
  return new Map(observations.map((obs) => [obs.id, obs]));
}

/** DNS names compare case-insensitively; the root-label dot is insignificant. */
export function normalizeDnsName(name: string): string {
  return (typeof name === 'string' ? name : '').trim().toLowerCase().replace(/\.$/, '');
}

/** `queriedAt` is a Date from drizzle but an ISO string once fetched as JSON. */
function parseQueriedAt(value: unknown): number | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) && Number.isInteger(ms) ? ms : null;
}

function isUsableTtl(ttl: unknown): ttl is number {
  return typeof ttl === 'number' && Number.isFinite(ttl) && Number.isInteger(ttl) && ttl >= 0;
}

/** Largest ECMAScript time value (±100,000,000 days from the epoch). */
const MAX_TIME_VALUE_MS = 8.64e15;

/** A candidate deadline must itself be a valid `Date`, or the row is UNKNOWN. */
function isUsableDeadline(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_TIME_VALUE_MS;
}

function calculateDeadline(queriedAt: number, ttl: unknown): number | null {
  if (!isUsableTtl(ttl)) return null;
  const ttlMs = ttl * 1000;
  if (!Number.isFinite(ttlMs)) return null;
  const deadline = queriedAt + ttlMs;
  return isUsableDeadline(deadline) ? deadline : null;
}

function resolverIdentity(observation: Observation): string | null {
  if (typeof observation.vantageIdentifier !== 'string') return null;
  const identifier = observation.vantageIdentifier.trim().toLowerCase();
  return identifier.length > 0 ? identifier : null;
}

function isMatchingAnswer(
  answer: { name: string; type: string },
  name: string,
  type: string
): boolean {
  return (
    typeof answer.name === 'string' &&
    typeof answer.type === 'string' &&
    normalizeDnsName(answer.name) === name &&
    answer.type.toUpperCase() === type
  );
}

function usableObservation(
  observation: Observation,
  now: number
): { queriedAt: number; resolverId: string } | null {
  if (
    observation.status !== 'success' ||
    observation.vantageType !== 'public-recursive' ||
    typeof observation.snapshotId !== 'string' ||
    observation.snapshotId.trim() === ''
  ) {
    return null;
  }
  const resolverId = resolverIdentity(observation);
  if (!resolverId) return null;
  const queriedAt = parseQueriedAt(observation.queriedAt);
  if (queriedAt === null || queriedAt > now) return null;
  return { queriedAt, resolverId };
}

/** Compute the minimum valid deadline among members of one matching RRset. */
function rrsetDeadline(
  observation: Observation,
  queriedAt: number,
  owner: string,
  type: string
): number | null {
  const matching = (observation.answerSection ?? []).filter((answer) =>
    isMatchingAnswer(answer, owner, type)
  );
  if (matching.length === 0) return null;
  const deadlines = matching
    .map((answer) => calculateDeadline(queriedAt, answer.ttl))
    .filter((deadline): deadline is number => deadline !== null);
  return deadlines.length === matching.length ? Math.min(...deadlines) : null;
}

interface CnameBranch {
  targets: Set<string>;
  invalid: boolean;
  /** One minimum deadline per observed CNAME RRset; duplicates aggregate by max. */
  observationDeadlines: number[];
}

interface CnameEvidenceIndex {
  branches: Map<string, CnameBranch>;
  /** Every owner with CNAME evidence, including evidence unusable for this resolver. */
  owners: Set<string>;
}

/**
 * Index CNAME RRsets for one snapshot/resolver pair. CNAME answers from a
 * different snapshot or resolver are deliberately invisible to the chain;
 * their owners are retained so a missing same-resolver hop cannot be inferred
 * as a terminal record.
 */
function indexCnameBranches(
  index: ObservationIndex,
  snapshotId: string,
  resolverId: string,
  now: number
): CnameEvidenceIndex {
  const branches = new Map<string, CnameBranch>();
  const owners = new Set<string>();

  for (const observation of index.values()) {
    if (
      observation.snapshotId !== snapshotId ||
      typeof observation.queryType !== 'string' ||
      observation.queryType.toUpperCase() !== 'CNAME' ||
      observation.status !== 'success' ||
      observation.vantageType !== 'public-recursive'
    ) {
      continue;
    }

    const answersByOwner = new Map<string, NonNullable<Observation['answerSection']>>();
    for (const answer of observation.answerSection ?? []) {
      if (
        typeof answer.name !== 'string' ||
        typeof answer.type !== 'string' ||
        answer.type.toUpperCase() !== 'CNAME'
      ) {
        continue;
      }
      const owner = normalizeDnsName(answer.name);
      if (!owner) continue;
      owners.add(owner);
      const answers = answersByOwner.get(owner) ?? [];
      answers.push(answer);
      answersByOwner.set(owner, answers);
    }

    const usable = usableObservation(observation, now);
    if (!usable || usable.resolverId !== resolverId) continue;

    for (const [owner, answers] of answersByOwner) {
      const branch = branches.get(owner) ?? {
        targets: new Set<string>(),
        invalid: false,
        observationDeadlines: [],
      };
      const memberDeadlines: number[] = [];

      for (const answer of answers) {
        if (typeof answer.data !== 'string') {
          branch.invalid = true;
          continue;
        }
        const target = normalizeDnsName(answer.data);
        const memberDeadline = calculateDeadline(usable.queriedAt, answer.ttl);
        if (!target || memberDeadline === null) {
          branch.invalid = true;
          continue;
        }
        branch.targets.add(target);
        memberDeadlines.push(memberDeadline);
      }

      if (memberDeadlines.length > 0) {
        branch.observationDeadlines.push(Math.min(...memberDeadlines));
      } else {
        branch.invalid = true;
      }
      branches.set(owner, branch);
    }
  }

  return { branches, owners };
}

interface CnameChain {
  kind: 'direct' | 'alias';
  terminalOwner: string;
  deadline?: number;
}

/** Follow one unambiguous, same-resolver CNAME chain. */
function resolveCnameChain(startOwner: string, evidence: CnameEvidenceIndex): CnameChain | null {
  const visited = new Set<string>();
  const deadlines: number[] = [];
  let current = startOwner;

  while (true) {
    if (visited.has(current)) return null;
    visited.add(current);

    const branch = evidence.branches.get(current);
    if (!branch) {
      // A CNAME owner seen in another resolver (or in unusable evidence) is
      // not safe to treat as the terminal owner of this resolver's chain.
      if (evidence.owners.has(current)) return null;
      return deadlines.length === 0
        ? { kind: 'direct', terminalOwner: startOwner }
        : {
            kind: 'alias',
            terminalOwner: current,
            deadline: Math.min(...deadlines),
          };
    }
    if (branch.invalid || branch.targets.size !== 1 || branch.observationDeadlines.length === 0) {
      return null;
    }

    // Repeated observations of the same resolver/RRset use the latest observed
    // expiry, while members within each RRset were reduced with Math.min above.
    deadlines.push(Math.max(...branch.observationDeadlines));
    current = [...branch.targets][0];
  }
}

function supportedTimingBasis(metadata: TtlEvidenceMetadata): boolean {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    'dnsQueryTimestampBasis' in metadata &&
    metadata.dnsQueryTimestampBasis === DNS_QUERY_TIMESTAMP_BASIS
  );
}

/**
 * Estimate the remaining cache lifetime of a normalized record row.
 *
 * A direct RRset uses the minimum member deadline per resolver observation,
 * then the maximum deadline across resolver observations. An aliased row
 * reduces each required CNAME RRset and its terminal RRset the same way. The
 * snapshot timing marker is mandatory so legacy/unproven snapshots render
 * UNKNOWN rather than presenting an invented countdown.
 */
export function estimateLiveAt(
  record: { name: string; type: string; sourceObservationIds: readonly string[] },
  index: ObservationIndex,
  now: number,
  metadata?: TtlEvidenceMetadata
): TtlEstimate {
  if (!supportedTimingBasis(metadata) || !isUsableDeadline(now)) return { state: 'unknown' };

  const wantedName = normalizeDnsName(record.name);
  const wantedType = typeof record.type === 'string' ? record.type.toUpperCase() : '';
  if (!wantedName || !wantedType) return { state: 'unknown' };

  const resolverDeadlines = new Map<string, number>();

  for (const id of record.sourceObservationIds ?? []) {
    const observation = index.get(id);
    if (!observation) continue;
    const usable = usableObservation(observation, now);
    if (
      !usable ||
      typeof observation.queryType !== 'string' ||
      observation.queryType.toUpperCase() !== wantedType
    ) {
      continue;
    }

    const chain =
      wantedType === 'CNAME'
        ? { kind: 'direct' as const, terminalOwner: wantedName }
        : resolveCnameChain(
            wantedName,
            indexCnameBranches(index, observation.snapshotId, usable.resolverId, now)
          );
    if (!chain) continue;

    const terminalDeadline = rrsetDeadline(
      observation,
      usable.queriedAt,
      chain.terminalOwner,
      wantedType
    );
    if (terminalDeadline === null) continue;

    const candidate =
      chain.kind === 'alias' && chain.deadline !== undefined
        ? Math.min(chain.deadline, terminalDeadline)
        : terminalDeadline;
    const previous = resolverDeadlines.get(usable.resolverId);
    if (previous === undefined || candidate > previous) {
      resolverDeadlines.set(usable.resolverId, candidate);
    }
  }

  if (resolverDeadlines.size === 0) return { state: 'unknown' };
  const deadline = Math.max(...resolverDeadlines.values());
  if (now > deadline) return { state: 'stale', deadline };
  return { state: 'live', deadline, remainingSeconds: Math.ceil((deadline - now) / 1000) };
}

/** Parse an RFC HTTP Date header without trusting the browser wall clock. */
export function parseServerDate(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return isUsableDeadline(parsed) ? parsed : null;
}

/**
 * Anchor a server-calibrated epoch at response receipt. HTTP Date has
 * one-second precision, so the upper-bound adjustment is intentionally
 * conservative; request elapsed time is measured with monotonic time.
 */
export function createEvidenceClock(
  serverDateHeader: string | null | undefined,
  requestStartedAt: number,
  responseReceivedAt: number
): EvidenceClock | null {
  const serverDateMs = parseServerDate(serverDateHeader);
  if (
    serverDateMs === null ||
    !Number.isFinite(requestStartedAt) ||
    !Number.isFinite(responseReceivedAt) ||
    responseReceivedAt < requestStartedAt
  ) {
    return null;
  }

  const requestDurationMs = responseReceivedAt - requestStartedAt;
  const epochMs = serverDateMs + requestDurationMs + 1000;
  return isUsableDeadline(epochMs) ? { epochMs, monotonicMs: responseReceivedAt } : null;
}

/** Read the calibrated wall time using only a monotonic browser timestamp. */
export function readEvidenceClock(clock: EvidenceClock, monotonicNow: number): number | null {
  if (
    !isUsableDeadline(clock.epochMs) ||
    !Number.isFinite(clock.monotonicMs) ||
    !Number.isFinite(monotonicNow) ||
    monotonicNow < clock.monotonicMs
  ) {
    return null;
  }
  const now = clock.epochMs + (monotonicNow - clock.monotonicMs);
  return isUsableDeadline(now) ? now : null;
}

const liveAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

/** Human-readable expiry (locale-dependent prose; tests assert the ISO form). */
export function formatLiveAt(deadline: number): string {
  return liveAtFormatter.format(new Date(deadline));
}

/** Machine-readable value for the `<time datetime>` attribute. */
export function toDateTimeAttribute(deadline: number): string {
  return new Date(deadline).toISOString();
}

/** Accessible explanation for the rendered estimate. */
export function describeEstimate(estimate: TtlEstimate): string {
  switch (estimate.state) {
    case 'live':
      return `Latest observed public-recursive cache expires at ${toDateTimeAttribute(estimate.deadline)}`;
    case 'stale':
      return `Observed public-recursive cache expired at ${toDateTimeAttribute(estimate.deadline)}`;
    default:
      return 'No valid public-recursive evidence for this record';
  }
}
