/**
 * 24h fleet tape (issue #57): digest of snapshot diffs in the last 24 hours
 * for the tenant portfolio. One implementation backs both surfaces — the MCP
 * `fleet_tape` tool and the portfolio UI digest — so they always answer with
 * the same numbers. Email delivery is deliberately out of scope.
 */
import {
  DomainRepository,
  FindingRepository,
  type IDatabaseAdapter,
  RecordSetRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { compareSnapshots } from '@dns-ops/parsing';

export const FLEET_TAPE_WINDOW_HOURS = 24;

export interface FleetTapeEntry {
  domainId: string;
  domainName: string;
  /** Newest snapshot captured inside the window. */
  snapshotId: string;
  /** Snapshot the diff is taken against; null when this is the domain's first snapshot. */
  previousSnapshotId: string | null;
  firstSnapshot: boolean;
  capturedAt: Date;
  summary: {
    totalChanges: number;
    additions: number;
    deletions: number;
    modifications: number;
    unchanged: number;
  };
  findingsSummary: {
    totalChanges: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    severityChanges: number;
  };
}

export interface FleetTapeDigest {
  generatedAt: string;
  windowHours: number;
  totalDomains: number;
  changedDomains: number;
  entries: FleetTapeEntry[];
}

/**
 * Build the 24h digest. A domain appears when its newest snapshot was captured
 * inside the window and is diffed against its immediately older snapshot;
 * domains without fresh evidence are omitted entirely.
 */
export async function buildFleetTape(
  db: IDatabaseAdapter,
  tenantId: string,
  now: Date = new Date()
): Promise<FleetTapeDigest> {
  const domains = await new DomainRepository(db).findAll({ tenantId });
  const windowStartMs = now.getTime() - FLEET_TAPE_WINDOW_HOURS * 60 * 60 * 1000;
  const snapshotRepo = new SnapshotRepository(db);
  const recordRepo = new RecordSetRepository(db);
  const findingRepo = new FindingRepository(db);

  const entries: FleetTapeEntry[] = [];
  for (const domain of domains) {
    // Newest-first per SnapshotRepository.findByDomain.
    const snapshots = await snapshotRepo.findByDomain(domain.id, 50);
    const latest = snapshots[0];
    if (!latest || new Date(latest.createdAt).getTime() < windowStartMs) continue;
    const previous = snapshots[1];

    const [records, previousRecords, findings, previousFindings] = await Promise.all([
      recordRepo.findBySnapshotId(latest.id),
      previous ? recordRepo.findBySnapshotId(previous.id) : Promise.resolve([]),
      findingRepo.findBySnapshotId(latest.id),
      previous && previous.resultState === 'complete'
        ? findingRepo.findBySnapshotId(previous.id)
        : Promise.resolve([]),
    ]);

    // Same truth rule as snapshot_compare: findings from an incomplete snapshot
    // are not evidence and stay out of the diff.
    const diff = compareSnapshots(
      {
        id: previous?.id ?? '',
        createdAt: previous?.createdAt ?? latest.createdAt,
        rulesetVersion: String(previous?.rulesetVersionId ?? 'unknown'),
        queriedNames: previous?.queriedNames ?? [],
        queriedTypes: previous?.queriedTypes ?? [],
        vantages: previous?.vantages ?? [],
      },
      {
        id: latest.id,
        createdAt: latest.createdAt,
        rulesetVersion: String(latest.rulesetVersionId ?? 'unknown'),
        queriedNames: latest.queriedNames,
        queriedTypes: latest.queriedTypes,
        vantages: latest.vantages,
      },
      previousRecords,
      records,
      previous && previous.resultState === 'complete' ? previousFindings : [],
      latest.resultState === 'complete' ? findings : []
    );

    entries.push({
      domainId: domain.id,
      domainName: domain.name,
      snapshotId: latest.id,
      previousSnapshotId: previous?.id ?? null,
      firstSnapshot: !previous,
      capturedAt: latest.createdAt,
      summary: diff.summary,
      findingsSummary: diff.findingsSummary,
    });
  }

  entries.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());

  return {
    generatedAt: now.toISOString(),
    windowHours: FLEET_TAPE_WINDOW_HOURS,
    totalDomains: domains.length,
    changedDomains: entries.length,
    entries,
  };
}
