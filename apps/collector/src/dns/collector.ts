/**
 * DNS Collection Orchestrator
 *
 * Coordinates DNS queries across multiple vantages and stores results.
 * Evaluates rules and persists findings immediately after collection.
 */

import { determineStatus } from '@dns-ops/contracts';
import type {
  IDatabaseAdapter,
  NewFinding,
  NewObservation,
  NewRecordSet,
  NewSnapshot,
  NewSuggestion,
  Observation,
  RecordSet,
} from '@dns-ops/db';
import {
  DomainRepository,
  FindingRepository,
  ObservationRepository,
  RecordSetRepository,
  RulesetVersionRepository,
  SnapshotRepository,
  SuggestionRepository,
} from '@dns-ops/db';
import { observationsToRecordSets } from '@dns-ops/parsing';
import {
  authoritativeFailureRule,
  authoritativeMismatchRule,
  bimiRule,
  cnameCoexistenceRule,
  dkimRule,
  dmarcRule,
  mtaStsRule,
  mxPresenceRule,
  type RuleContext,
  RulesEngine,
  type Ruleset,
  recursiveAuthoritativeMismatchRule,
  spfRule,
  tlsRptRule,
  unmanagedZonePartialCoverageRule,
} from '@dns-ops/rules';
import { getDnsQueryConcurrency } from '../config/env.js';
import { DelegationCollector } from '../delegation/collector.js';
import { getCollectorLogger } from '../middleware/error-tracking.js';
import { Semaphore } from '../probes/semaphore.js';
import { DNSResolver } from './resolver.js';
import type {
  CollectionConfig,
  CollectionError,
  CollectionResult,
  DNSAnswer,
  DNSQuery,
  DNSQueryResult,
  VantageInfo,
} from './types.js';

// Current ruleset version - keep in sync with web app findings.ts
const CURRENT_RULESET_VERSION = '1.2.0';
const CURRENT_RULESET_NAME = 'DNS and Mail Rules';

const logger = getCollectorLogger();

/**
 * Create the combined ruleset with DNS and Mail rules
 */
function createCombinedRuleset(): Ruleset {
  return {
    id: 'dns-mail-v1',
    version: CURRENT_RULESET_VERSION,
    name: CURRENT_RULESET_NAME,
    description: 'Combined DNS and mail analysis rules',
    rules: [
      // DNS rules
      authoritativeFailureRule,
      authoritativeMismatchRule,
      recursiveAuthoritativeMismatchRule,
      cnameCoexistenceRule,
      unmanagedZonePartialCoverageRule,
      // Mail rules
      mxPresenceRule,
      spfRule,
      dmarcRule,
      dkimRule,
      mtaStsRule,
      tlsRptRule,
      bimiRule,
    ],
    createdAt: new Date(),
  };
}

/**
 * Minimal resolver contract DNSCollector depends on. Lets tests inject a fake
 * resolver that records in-flight concurrency without touching real DNS.
 */
export interface ResolverLike {
  query(query: DNSQuery, vantage: VantageInfo): Promise<DNSQueryResult>;
}

/**
 * Run DNS queries bounded by `semaphore`, preserving input order in the output.
 *
 * Errors thrown by the resolver are recorded in `errors` and yield no result
 * entry (matching the previous sequential behaviour). Failed-but-returned
 * results (success:false) are kept; collectFromVantage records their error.
 */
export async function collectQueriesConcurrently(
  resolver: ResolverLike,
  queries: DNSQuery[],
  vantage: VantageInfo,
  semaphore: Semaphore,
  errors: CollectionError[]
): Promise<DNSQueryResult[]> {
  const tasks = queries.map((query) =>
    semaphore.run(async () => {
      try {
        return await resolver.query(query, vantage);
      } catch (error) {
        errors.push({
          queryName: query.name,
          queryType: query.type,
          vantage: vantage.identifier,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })
  );
  const settled = await Promise.all(tasks);
  return settled.filter((r): r is DNSQueryResult => r !== null);
}

export class DNSCollector {
  private resolver: ResolverLike;
  private readonly semaphore: Semaphore;
  private config: CollectionConfig;
  private domainRepo: DomainRepository;
  private snapshotRepo: SnapshotRepository;
  private observationRepo: ObservationRepository;
  private recordSetRepo: RecordSetRepository;
  private findingRepo: FindingRepository;
  private suggestionRepo: SuggestionRepository;
  private rulesetVersionRepo: RulesetVersionRepository;

  constructor(
    config: CollectionConfig,
    db: IDatabaseAdapter,
    options?: { resolver?: ResolverLike; queryConcurrency?: number }
  ) {
    this.config = config;
    this.resolver = options?.resolver ?? new DNSResolver();
    this.semaphore = new Semaphore(options?.queryConcurrency ?? getDnsQueryConcurrency());
    this.domainRepo = new DomainRepository(db);
    this.snapshotRepo = new SnapshotRepository(db);
    this.observationRepo = new ObservationRepository(db);
    this.recordSetRepo = new RecordSetRepository(db);
    this.findingRepo = new FindingRepository(db);
    this.suggestionRepo = new SuggestionRepository(db);
    this.rulesetVersionRepo = new RulesetVersionRepository(db);
  }

  /**
   * Execute full DNS collection for the domain
   */
  async collect(): Promise<CollectionResult> {
    const startTime = Date.now();
    const errors: CollectionError[] = [];

    // Generate queries based on zone management
    const queries = await this.generateQueries();

    // Collect from public recursive vantage
    const recursiveResults = await this.collectFromVantage(
      queries,
      {
        type: 'public-recursive',
        identifier: '8.8.8.8', // Google Public DNS
        region: 'us-central',
      },
      errors
    );

    // Collect from authoritative vantages (for managed zones or if NS discovered)
    const authoritativeResults: DNSQueryResult[] = [];
    if (this.config.zoneManagement === 'managed') {
      // For managed zones, query authoritative directly
      const nsRecords = await this.discoverAuthoritativeServers();
      for (const ns of nsRecords) {
        const results = await this.collectFromVantage(
          queries,
          {
            type: 'authoritative',
            identifier: ns,
          },
          errors
        );
        authoritativeResults.push(...results);
      }
    }

    // Combine all results
    const allResults = [...recursiveResults, ...authoritativeResults];

    // Collect delegation data if enabled (Bead 12)
    let delegationData = null;
    if (this.config.includeDelegationData !== false) {
      // Default to true
      try {
        const delegationCollector = new DelegationCollector(this.config.domain);
        delegationData = await delegationCollector.collectDelegationSummary('8.8.8.8');
      } catch (error) {
        logger.warn('Delegation collection failed', {
          domain: this.config.domain,
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail the entire collection if delegation fails
      }
    }

    // Calculate result state
    const resultState = this.calculateResultState(allResults, errors);

    // Store results to database via domain/snapshot/observation repositories
    const snapshotId = await this.storeResults(allResults, resultState, delegationData);

    return {
      snapshotId,
      domain: this.config.domain,
      resultState,
      observationCount: allResults.length,
      duration: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Generate queries based on configuration
   */
  private async generateQueries(): Promise<DNSQuery[]> {
    const queries: DNSQuery[] = [];
    const {
      domain,
      zoneManagement,
      recordTypes,
      queryNames,
      includeMailRecords,
      dkimSelectors,
      managedDkimSelectors,
    } = this.config;

    if (queryNames) {
      // Use explicit query names (targeted inspection)
      for (const name of queryNames) {
        for (const type of recordTypes) {
          queries.push({ name, type });
        }
      }
    } else if (zoneManagement === 'unmanaged') {
      // Targeted inspection for unmanaged zones
      const targetedNames = [
        domain,
        `_dmarc.${domain}`,
        `_mta-sts.${domain}`,
        `_smtp._tls.${domain}`,
      ];

      for (const name of targetedNames) {
        for (const type of recordTypes) {
          queries.push({ name, type });
        }
      }

      // Include mail records with DKIM selector discovery (Bead 08)
      if (includeMailRecords !== false) {
        // Default to true
        const mailQueries = await this.generateMailQueries(
          domain,
          dkimSelectors,
          managedDkimSelectors
        );
        queries.push(...mailQueries);
      }
    } else {
      // Full zone queries for managed zones
      for (const type of recordTypes) {
        queries.push({ name: domain, type });
      }

      // Include mail records for managed zones
      if (includeMailRecords !== false) {
        const mailQueries = await this.generateMailQueries(
          domain,
          dkimSelectors,
          managedDkimSelectors
        );
        queries.push(...mailQueries);
      }
    }

    // Deduplicate queries
    const seen = new Set<string>();
    return queries.filter((q) => {
      const key = `${q.name}|${q.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate mail-related queries including DKIM selector discovery
   */
  private async generateMailQueries(
    domain: string,
    operatorSelectors?: string[],
    managedSelectors?: string[]
  ): Promise<DNSQuery[]> {
    const { generateMailQueries: generateMailQueriesFunc } = await import('../mail/collector.js');

    const mailResult = await generateMailQueriesFunc(domain, [], {
      domain,
      operatorSelectors,
      managedSelectors,
    });

    return mailResult.queries;
  }

  /**
   * Collect queries from a specific vantage
   */
  private async collectFromVantage(
    queries: DNSQuery[],
    vantage: VantageInfo,
    errors: CollectionError[]
  ): Promise<DNSQueryResult[]> {
    // Run queries concurrently, bounded by this.semaphore (default 5,
    // overridable via DNS_QUERY_CONCURRENCY). Order is preserved in the output.
    const results = await collectQueriesConcurrently(
      this.resolver,
      queries,
      vantage,
      this.semaphore,
      errors
    );

    // Track errors for failed-but-returned queries.
    for (const result of results) {
      if (!result.success) {
        errors.push({
          queryName: result.query.name,
          queryType: result.query.type,
          vantage: vantage.identifier,
          error: result.error || 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Discover authoritative nameservers for the domain
   */
  private async discoverAuthoritativeServers(): Promise<string[]> {
    try {
      const nsResult = await this.resolver.query(
        { name: this.config.domain, type: 'NS' },
        { type: 'public-recursive', identifier: '8.8.8.8' }
      );

      if (nsResult.success && nsResult.answers.length > 0) {
        return nsResult.answers.map((a: DNSAnswer) => a.data.replace(/\.$/, ''));
      }
    } catch (error) {
      logger.warn('Failed to discover NS records', {
        domain: this.config.domain,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }

  /**
   * Calculate overall result state based on query results
   */
  private calculateResultState(
    results: DNSQueryResult[],
    _errors: CollectionError[]
  ): 'complete' | 'partial' | 'failed' {
    if (results.length === 0) {
      return 'failed';
    }

    const successCount = results.filter((r) => r.success).length;
    const totalCount = results.length;

    if (successCount === totalCount) {
      return this.config.zoneManagement === 'unmanaged' ? 'partial' : 'complete';
    }

    if (successCount > 0) {
      return 'partial';
    }

    return 'failed';
  }

  /**
   * Store results in database
   */
  private async storeResults(
    results: DNSQueryResult[],
    resultState: 'complete' | 'partial' | 'failed',
    delegationData?: import('../delegation/collector.js').DelegationSummary | null
  ): Promise<string> {
    const { tenantId, domain, zoneManagement, triggeredBy } = this.config;
    // Find or create domain within the current tenant scope.
    // The same normalized domain may legitimately exist in multiple tenant portfolios.
    let domainRecord = await this.domainRepo.findByNameForTenant(domain, tenantId);
    if (!domainRecord) {
      domainRecord = await this.domainRepo.create({
        name: domain,
        normalizedName: domain.toLowerCase(),
        zoneManagement,
        tenantId,
      });
    }

    // Create snapshot
    const snapshot = await this.snapshotRepo.create({
      domainId: domainRecord.id,
      domainName: domain,
      resultState,
      queriedNames: [...new Set(results.map((r) => r.query.name))],
      queriedTypes: [...new Set(results.map((r) => r.query.type))],
      vantages: [...new Set(results.map((r) => r.vantage.type))],
      zoneManagement,
      triggeredBy: triggeredBy || 'system',
      // Store collection metadata including vantage identifiers and delegation data
      metadata: {
        // Vantage identifiers (IPs/hostnames) for detailed tracking
        vantageIdentifiers: [...new Set(results.map((r) => r.vantage.identifier))],
        // Delegation data if available (Bead 12, dns-ops-1j4.6.4)
        ...(delegationData
          ? {
              hasDelegationData: true,
              parentZone: delegationData.parentZone,
              nsServers: delegationData.parentNs.map((ns: DNSAnswer) => ns.data),
              // Divergence details
              hasDivergence: delegationData.hasDivergence,
              divergenceDetails: delegationData.divergenceDetails.map((d) => ({
                queryName: d.queryName,
                queryType: d.queryType,
                groups: d.groups.map((g) => ({
                  servers: g.servers,
                  signature: g.signature,
                })),
                totalServers: d.totalServers,
              })),
              // Lame delegation details
              lameDelegations: delegationData.lameDelegations.map((l) => ({
                server: l.server,
                reason: l.reason,
              })),
              // Missing glue
              missingGlue: delegationData.missingGlue,
              // DNSSEC info
              hasDnssec: delegationData.dnssecInfo?.hasRrsig || false,
              dnssec: delegationData.dnssecInfo
                ? {
                    adFlagSet: delegationData.dnssecInfo.adFlagSet,
                    hasDnskey: delegationData.dnssecInfo.dnskeyRecords.length > 0,
                    hasDs: delegationData.dnssecInfo.dsRecords.length > 0,
                  }
                : undefined,
            }
          : {}),
      },
    } as NewSnapshot);

    // Create observations for each result
    const observationData: NewObservation[] = results.map((result) => ({
      snapshotId: snapshot.id,
      queryName: result.query.name,
      queryType: result.query.type,
      vantageType:
        result.vantage.type === 'public-recursive' ? 'public-recursive' : 'authoritative',
      vantageIdentifier: result.vantage.identifier,
      // Use determineStatus for comprehensive status classification
      // including NODATA (success with no answers) and truncation (TC flag)
      status: determineStatus({
        success: result.success,
        rcode: result.responseCode,
        error: result.error,
        answerCount: result.answers.length,
        truncated: result.flags?.tc,
      }),
      queriedAt: new Date(),
      responseTimeMs: result.responseTime,
      responseCode: result.responseCode ?? null,
      flags: result.flags
        ? {
            authoritative: result.flags.aa,
            truncated: result.flags.tc,
            recursionDesired: result.flags.rd,
            recursionAvailable: result.flags.ra,
            authenticated: result.flags.ad,
            checkingDisabled: result.flags.cd,
          }
        : null,
      answerSection: result.answers.map((a: DNSAnswer) => ({
        name: a.name,
        type: a.type,
        ttl: a.ttl,
        data: a.data,
      })),
      authoritySection: result.authority.map((a: DNSAnswer) => ({
        name: a.name,
        type: a.type,
        ttl: a.ttl,
        data: a.data,
      })),
      additionalSection: result.additional.map((a: DNSAnswer) => ({
        name: a.name,
        type: a.type,
        ttl: a.ttl,
        data: a.data,
      })),
      errorMessage: result.error || null,
    }));

    const createdObservations = await this.observationRepo.createMany(observationData);

    // Create recordsets from observations
    const createdRecordSets = await this.createRecordSetsFromObservations(
      snapshot.id,
      createdObservations
    );

    // Evaluate rules and persist findings immediately
    // This ensures findings are available for portfolio views without
    // requiring a separate API call
    const { findingsCount, suggestionsCount } = await this.evaluateAndPersistFindings(
      snapshot.id,
      domainRecord.id,
      domain,
      zoneManagement as 'managed' | 'unmanaged' | 'unknown',
      createdObservations,
      createdRecordSets
    );

    if (findingsCount > 0) {
      logger.info('Persisted findings', { domain, findingsCount, suggestionsCount });
    }

    return snapshot.id;
  }

  /**
   * Create RecordSets from normalized observations
   */
  private async createRecordSetsFromObservations(
    snapshotId: string,
    observations: Observation[]
  ): Promise<RecordSet[]> {
    const normalizedRecords = observationsToRecordSets(observations);

    const recordSetData: NewRecordSet[] = normalizedRecords.map((record) => ({
      snapshotId,
      name: record.name,
      type: record.type,
      ttl: record.ttl,
      values: record.values,
      sourceObservationIds: record.sourceObservationIds,
      sourceVantages: record.sourceVantages,
      isConsistent: record.isConsistent,
      consolidationNotes: record.consolidationNotes || null,
    }));

    if (recordSetData.length > 0) {
      return this.recordSetRepo.createMany(recordSetData);
    }

    return [];
  }

  /**
   * Evaluate rules and persist findings for a snapshot
   *
   * This is called automatically after collection to ensure findings are
   * immediately available for portfolio views and other consumers.
   */
  private async evaluateAndPersistFindings(
    snapshotId: string,
    domainId: string,
    domainName: string,
    zoneManagement: 'managed' | 'unmanaged' | 'unknown',
    observations: Observation[],
    recordSets: RecordSet[]
  ): Promise<{ findingsCount: number; suggestionsCount: number }> {
    try {
      // Create ruleset and engine
      const ruleset = createCombinedRuleset();
      const engine = new RulesEngine(ruleset);

      // Ensure ruleset version exists in DB and get its ID
      let rulesetVersionId: string;
      const existingVersion = await this.rulesetVersionRepo.findByVersion(ruleset.version);
      if (existingVersion) {
        rulesetVersionId = existingVersion.id;
      } else {
        const newVersion = await this.rulesetVersionRepo.create({
          version: ruleset.version,
          name: ruleset.name,
          description: ruleset.description || '',
          rules: ruleset.rules.map(
            (r: { id: string; name: string; version: string; enabled: boolean }) => ({
              id: r.id,
              name: r.name,
              version: r.version,
              enabled: r.enabled !== false,
            })
          ),
          active: true,
          createdBy: this.config.triggeredBy || 'collector',
        });
        rulesetVersionId = newVersion.id;
      }

      // Update snapshot with ruleset version to indicate findings were evaluated
      await this.snapshotRepo.updateRulesetVersion(snapshotId, rulesetVersionId);

      // Create rule context
      const context: RuleContext = {
        snapshotId,
        domainId,
        domainName,
        zoneManagement,
        observations,
        recordSets,
        rulesetVersion: ruleset.version,
      };

      // Evaluate rules
      const { findings, suggestions } = engine.evaluate(context);

      if (findings.length === 0) {
        return { findingsCount: 0, suggestionsCount: 0 };
      }

      // Persist findings
      // rulesetVersionId is required (NOT NULL since migration 0011) and is
      // resolved above from the active ruleset version — thread it through so
      // every persisted finding is linked for idempotent re-evaluation.
      const findingsToInsert: NewFinding[] = findings.map((f) => ({
        snapshotId,
        type: f.type,
        title: f.title,
        description: f.description,
        severity: f.severity,
        confidence: f.confidence,
        riskPosture: f.riskPosture,
        blastRadius: f.blastRadius,
        reviewOnly: f.reviewOnly,
        evidence: f.evidence,
        ruleId: f.ruleId,
        ruleVersion: f.ruleVersion,
        rulesetVersionId,
      }));

      const persistedFindings = await this.findingRepo.createMany(findingsToInsert);

      // Build finding ID map for suggestion linking
      const findingIdMap = new Map<string, string>();
      for (let i = 0; i < findings.length; i++) {
        const originalId = findings[i].id;
        const persistedId = persistedFindings[i]?.id;
        if (originalId && persistedId) {
          findingIdMap.set(originalId, persistedId);
        }
      }

      // Persist suggestions with corrected finding IDs
      const suggestionsToInsert: NewSuggestion[] = [];
      for (const s of suggestions) {
        const persistedFindingId = findingIdMap.get(s.findingId);
        if (persistedFindingId) {
          suggestionsToInsert.push({
            findingId: persistedFindingId,
            title: s.title,
            description: s.description,
            action: s.action,
            riskPosture: s.riskPosture,
            blastRadius: s.blastRadius,
            reviewOnly: s.reviewOnly ?? false,
          });
        }
      }

      if (suggestionsToInsert.length > 0) {
        await this.suggestionRepo.createMany(suggestionsToInsert);
      }

      return {
        findingsCount: persistedFindings.length,
        suggestionsCount: suggestionsToInsert.length,
      };
    } catch (error) {
      // Log error but don't fail the collection
      logger.error(
        'Error evaluating and persisting findings',
        error instanceof Error ? error : new Error(String(error)),
        { domain: this.config.domain }
      );
      return { findingsCount: 0, suggestionsCount: 0 };
    }
  }
}
