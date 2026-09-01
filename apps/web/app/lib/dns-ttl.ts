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

export type TtlEstimate =
  | { state: 'live'; deadline: number; remainingSeconds: number }
  /** Evidence existed but the observed cache entry has expired. */
  | { state: 'stale'; deadline: number }
  /** No valid matching public-recursive evidence for this row. */
  | { state: 'unknown' };

export type ObservationIndex = ReadonlyMap<string, Observation>;

export function indexObservationsById(observations: readonly Observation[]): ObservationIndex {
  return new Map(observations.map((obs) => [obs.id, obs]));
}

/** DNS names compare case-insensitively; the root-label dot is insignificant. */
export function normalizeDnsName(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, '');
}

/** `queriedAt` is a Date from drizzle but an ISO string once fetched as JSON. */
function parseQueriedAt(value: Date | string): number | null {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
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

/**
 * Estimate the remaining cache lifetime of a normalized record row.
 *
 * Deadline = queriedAt + ttl × 1000 per matching answer; the latest deadline
 * across accepted observations is the conservative expiry. Exactly at the
 * deadline the remaining value is a valid `0`; after it the estimate is
 * `stale`. Missing, invalid, future-dated, non-matching, or deadline-overflow
 * evidence (a TTL too large for a representable `Date`) is `unknown`.
 */
export function estimateLiveAt(
  record: { name: string; type: string; sourceObservationIds: readonly string[] },
  index: ObservationIndex,
  now: number
): TtlEstimate {
  const wantedName = normalizeDnsName(record.name);
  const wantedType = record.type.toUpperCase();

  let deadline: number | null = null;

  for (const id of record.sourceObservationIds) {
    const obs = index.get(id);
    if (!obs || obs.status !== 'success' || obs.vantageType !== 'public-recursive') continue;

    const queriedAt = parseQueriedAt(obs.queriedAt as Date | string);
    if (queriedAt === null || queriedAt > now) continue;

    for (const answer of obs.answerSection ?? []) {
      if (normalizeDnsName(answer.name) !== wantedName) continue;
      if (answer.type.toUpperCase() !== wantedType) continue;
      if (!isUsableTtl(answer.ttl)) continue;

      const candidate = queriedAt + answer.ttl * 1000;
      if (!isUsableDeadline(candidate)) continue;
      if (deadline === null || candidate > deadline) deadline = candidate;
    }
  }

  if (deadline === null) return { state: 'unknown' };
  if (now > deadline) return { state: 'stale', deadline };
  return { state: 'live', deadline, remainingSeconds: Math.ceil((deadline - now) / 1000) };
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
