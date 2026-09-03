import {
  DomainProfileRepository,
  DomainRepository,
  FindingRepository,
  type IDatabaseAdapter,
  OperationalConditionService,
  ProbeObservationRepository,
  RecordSetRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { compareSnapshots } from '@dns-ops/parsing';
import { loadCasePlaybook } from './case-playbooks.js';
import { buildFleetTape } from './fleet-tape.js';
import { type AuthenticatedMcpPrincipal, requireMcpScope } from './mcp-auth.js';

export class McpNotFoundError extends Error {
  constructor() {
    super('Resource not found');
  }
}

/** Shared tenant/scope enforcement for MCP read operations. */
export class McpReadService {
  constructor(
    private db: IDatabaseAdapter,
    private principal: AuthenticatedMcpPrincipal
  ) {}

  async domainSearch(query = '') {
    requireMcpScope(this.principal, 'DOMAIN_READ');
    return new DomainRepository(this.db).findAll(
      { tenantId: this.principal.tenantId, search: query.slice(0, 100) },
      { limit: 50 }
    );
  }

  async domainProfile(domainId: string) {
    requireMcpScope(this.principal, 'DOMAIN_READ');
    const domain = await this.ownedDomain(domainId);
    const profile = await new DomainProfileRepository(this.db).findByDomainId(
      domain.id,
      this.principal.tenantId
    );
    return { domain, profile, setupRequired: !profile || profile.purpose === 'UNKNOWN' };
  }

  async domainPosture(domainId: string) {
    requireMcpScope(this.principal, 'DOMAIN_READ');
    requireMcpScope(this.principal, 'SIGNAL_READ');
    requireMcpScope(this.principal, 'CASE_READ');
    const domain = await this.ownedDomain(domainId);
    const snapshots = await new SnapshotRepository(this.db).findByDomain(domain.id, 1);
    const latestSnapshot = snapshots[0] ?? null;
    const findings = latestSnapshot
      ? await new FindingRepository(this.db).findBySnapshotId(latestSnapshot.id)
      : [];
    const cases = await new OperationalConditionService(this.db).listCases(
      this.principal.tenantId,
      domain.id
    );
    return {
      domain,
      latestSnapshot,
      findings,
      signals: cases.map((item) => item.signal),
      cases: cases.map((item) => item.case),
      setupRequired: !latestSnapshot || latestSnapshot.resultState !== 'complete',
    };
  }

  async evidence(snapshotId: string) {
    requireMcpScope(this.principal, 'DOMAIN_READ');
    const snapshot = await this.ownedSnapshot(snapshotId);
    const [records, findings, probes] = await Promise.all([
      new RecordSetRepository(this.db).findBySnapshotId(snapshot.id),
      new FindingRepository(this.db).findBySnapshotId(snapshot.id),
      new ProbeObservationRepository(this.db).findBySnapshotId(snapshot.id),
    ]);
    return { snapshot, records, findings, probes, incomplete: snapshot.resultState !== 'complete' };
  }

  async snapshotCompare(domainId: string, leftSnapshotId: string, rightSnapshotId: string) {
    requireMcpScope(this.principal, 'DOMAIN_READ');
    const domain = await this.ownedDomain(domainId);
    const [left, right] = await Promise.all([
      new SnapshotRepository(this.db).findById(leftSnapshotId),
      new SnapshotRepository(this.db).findById(rightSnapshotId),
    ]);
    if (!left || !right || left.domainId !== domain.id || right.domainId !== domain.id) {
      throw new McpNotFoundError();
    }
    const recordRepo = new RecordSetRepository(this.db);
    const findingRepo = new FindingRepository(this.db);
    const [leftRecords, rightRecords, leftFindings, rightFindings] = await Promise.all([
      recordRepo.findBySnapshotId(left.id),
      recordRepo.findBySnapshotId(right.id),
      findingRepo.findBySnapshotId(left.id),
      findingRepo.findBySnapshotId(right.id),
    ]);
    return compareSnapshots(
      {
        id: left.id,
        createdAt: left.createdAt,
        rulesetVersion: String(left.rulesetVersionId ?? 'unknown'),
        queriedNames: left.queriedNames,
        queriedTypes: left.queriedTypes,
        vantages: left.vantages,
      },
      {
        id: right.id,
        createdAt: right.createdAt,
        rulesetVersion: String(right.rulesetVersionId ?? 'unknown'),
        queriedNames: right.queriedNames,
        queriedTypes: right.queriedTypes,
        vantages: right.vantages,
      },
      leftRecords,
      rightRecords,
      left.resultState === 'complete' ? leftFindings : [],
      right.resultState === 'complete' ? rightFindings : []
    );
  }

  async signalList(domainId?: string) {
    requireMcpScope(this.principal, 'SIGNAL_READ');
    if (domainId) await this.ownedDomain(domainId);
    return new OperationalConditionService(this.db).listCases(this.principal.tenantId, domainId);
  }

  async fleetTape() {
    requireMcpScope(this.principal, 'DOMAIN_READ');
    return buildFleetTape(this.db, this.principal.tenantId);
  }

  async caseGet(caseId: string) {
    requireMcpScope(this.principal, 'CASE_READ');
    const result = await new OperationalConditionService(this.db).getCase(
      this.principal.tenantId,
      caseId
    );
    if (!result) throw new McpNotFoundError();
    return result;
  }

  async explainCase(caseKind: string) {
    requireMcpScope(this.principal, 'CASE_READ');
    const playbook = await loadCasePlaybook(caseKind);
    if (!playbook) throw new McpNotFoundError();
    return playbook;
  }

  private async ownedDomain(domainId: string) {
    const domain = await new DomainRepository(this.db).findById(domainId);
    if (!domain || domain.tenantId !== this.principal.tenantId) throw new McpNotFoundError();
    return domain;
  }

  private async ownedSnapshot(snapshotId: string) {
    const snapshot = await new SnapshotRepository(this.db).findById(snapshotId);
    if (!snapshot) throw new McpNotFoundError();
    await this.ownedDomain(snapshot.domainId);
    return snapshot;
  }
}
