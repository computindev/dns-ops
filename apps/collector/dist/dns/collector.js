/**
 * DNS Collection Orchestrator
 *
 * Coordinates DNS queries across multiple vantages and stores results.
 * Evaluates rules and persists findings immediately after collection.
 */
import { determineStatus } from '@dns-ops/contracts';
import { DomainRepository, FindingRepository, ObservationRepository, RecordSetRepository, RulesetVersionRepository, SnapshotRepository, SuggestionRepository, } from '@dns-ops/db';
import { observationsToRecordSets } from '@dns-ops/parsing';
import { authoritativeFailureRule, authoritativeMismatchRule, bimiRule, cnameCoexistenceRule, dkimRule, dmarcRule, mtaStsRule, mxPresenceRule, RulesEngine, recursiveAuthoritativeMismatchRule, spfRule, tlsRptRule, unmanagedZonePartialCoverageRule, } from '@dns-ops/rules';
import { getDnsQueryConcurrency } from '../config/env.js';
import { DelegationCollector } from '../delegation/collector.js';
import { getCollectorLogger } from '../middleware/error-tracking.js';
import { Semaphore } from '../probes/semaphore.js';
import { DNSResolver } from './resolver.js';
// Current ruleset version - keep in sync with web app findings.ts
const CURRENT_RULESET_VERSION = '1.2.0';
const CURRENT_RULESET_NAME = 'DNS and Mail Rules';
const logger = getCollectorLogger();
/**
 * Create the combined ruleset with DNS and Mail rules
 */
function createCombinedRuleset() {
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
 * Run DNS queries bounded by `semaphore`, preserving input order in the output.
 *
 * Errors thrown by the resolver are recorded in `errors` and yield no result
 * entry (matching the previous sequential behaviour). Failed-but-returned
 * results (success:false) are kept; collectFromVantage records their error.
 */
export async function collectQueriesConcurrently(resolver, queries, vantage, semaphore, errors) {
    const tasks = queries.map((query) => semaphore.run(async () => {
        try {
            return await resolver.query(query, vantage);
        }
        catch (error) {
            errors.push({
                queryName: query.name,
                queryType: query.type,
                vantage: vantage.identifier,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }));
    const settled = await Promise.all(tasks);
    return settled.filter((r) => r !== null);
}
export class DNSCollector {
    resolver;
    semaphore;
    config;
    domainRepo;
    snapshotRepo;
    observationRepo;
    recordSetRepo;
    findingRepo;
    suggestionRepo;
    rulesetVersionRepo;
    constructor(config, db, options) {
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
    async collect() {
        const startTime = Date.now();
        const errors = [];
        // Generate queries based on zone management
        const queries = await this.generateQueries();
        // Collect from public recursive vantage
        const recursiveResults = await this.collectFromVantage(queries, {
            type: 'public-recursive',
            identifier: '8.8.8.8', // Google Public DNS
            region: 'us-central',
        }, errors);
        // Collect from authoritative vantages (for managed zones or if NS discovered)
        const authoritativeResults = [];
        if (this.config.zoneManagement === 'managed') {
            // For managed zones, query authoritative directly
            const nsRecords = await this.discoverAuthoritativeServers();
            for (const ns of nsRecords) {
                const results = await this.collectFromVantage(queries, {
                    type: 'authoritative',
                    identifier: ns,
                }, errors);
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
            }
            catch (error) {
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
        const stored = await this.storeResults(allResults, resultState, delegationData);
        return {
            snapshotId: stored.snapshotId,
            domain: this.config.domain,
            resultState: stored.resultState,
            observationCount: allResults.length,
            duration: Date.now() - startTime,
            errors,
        };
    }
    /**
     * Generate queries based on configuration
     */
    async generateQueries() {
        const queries = [];
        const { domain, zoneManagement, recordTypes, queryNames, includeMailRecords, dkimSelectors, managedDkimSelectors, } = this.config;
        if (queryNames) {
            // Use explicit query names (targeted inspection)
            for (const name of queryNames) {
                for (const type of recordTypes) {
                    queries.push({ name, type });
                }
            }
        }
        else if (zoneManagement === 'unmanaged') {
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
                const mailQueries = await this.generateMailQueries(domain, dkimSelectors, managedDkimSelectors);
                queries.push(...mailQueries);
            }
        }
        else {
            // Full zone queries for managed zones
            for (const type of recordTypes) {
                queries.push({ name: domain, type });
            }
            // Include mail records for managed zones
            if (includeMailRecords !== false) {
                const mailQueries = await this.generateMailQueries(domain, dkimSelectors, managedDkimSelectors);
                queries.push(...mailQueries);
            }
        }
        // Deduplicate queries
        const seen = new Set();
        return queries.filter((q) => {
            const key = `${q.name}|${q.type}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
    /**
     * Generate mail-related queries including DKIM selector discovery
     */
    async generateMailQueries(domain, operatorSelectors, managedSelectors) {
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
    async collectFromVantage(queries, vantage, errors) {
        // Run queries concurrently, bounded by this.semaphore (default 5,
        // overridable via DNS_QUERY_CONCURRENCY). Order is preserved in the output.
        const results = await collectQueriesConcurrently(this.resolver, queries, vantage, this.semaphore, errors);
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
    async discoverAuthoritativeServers() {
        try {
            const nsResult = await this.resolver.query({ name: this.config.domain, type: 'NS' }, { type: 'public-recursive', identifier: '8.8.8.8' });
            if (nsResult.success && nsResult.answers.length > 0) {
                return nsResult.answers.map((a) => a.data.replace(/\.$/, ''));
            }
        }
        catch (error) {
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
    calculateResultState(results, _errors) {
        if (results.length === 0) {
            return 'failed';
        }
        const successCount = results.filter((r) => r.success).length;
        const totalCount = results.length;
        if (this.config.zoneManagement === 'managed') {
            const authoritativeResults = results.filter((r) => r.vantage.type === 'authoritative');
            const lacksAuthoritativeProof = authoritativeResults.length === 0 ||
                authoritativeResults.some((result) => result.success && result.flags?.aa !== true);
            if (lacksAuthoritativeProof)
                return 'partial';
        }
        if (successCount === totalCount) {
            return this.config.zoneManagement === 'unmanaged' ? 'partial' : 'complete';
        }
        if (successCount > 0) {
            return 'partial';
        }
        return 'failed';
    }
    getAuthoritativeEvidenceCoverage(results) {
        if (this.config.zoneManagement !== 'managed') {
            return { state: 'NOT_REQUESTED', nameservers: [] };
        }
        const authoritative = results.filter((result) => result.vantage.type === 'authoritative');
        const nameservers = [...new Set(authoritative.map((result) => result.vantage.identifier))];
        const verified = authoritative.length > 0 &&
            authoritative.every((result) => result.success && result.flags?.aa === true);
        if (verified)
            return { state: 'VERIFIED', nameservers };
        return {
            state: 'UNKNOWN',
            nameservers,
            unknown: {
                reason: 'AUTHORITATIVE_EVIDENCE_UNAVAILABLE',
                explanation: authoritative.length === 0
                    ? 'No direct authoritative response was captured.'
                    : 'At least one direct nameserver response failed or lacked the authoritative-answer flag.',
                action: 'RETRY_PROBE',
                actionLabel: 'Retry authoritative DNS collection',
                blocking: true,
            },
        };
    }
    /**
     * Store results in database
     */
    async storeResults(results, resultState, delegationData) {
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
                authoritativeEvidence: this.getAuthoritativeEvidenceCoverage(results),
                // Delegation data if available (Bead 12, dns-ops-1j4.6.4)
                ...(delegationData
                    ? {
                        hasDelegationData: true,
                        parentZone: delegationData.parentZone,
                        nsServers: delegationData.parentNs.map((ns) => ns.data),
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
        });
        // Create observations for each result
        const observationData = results.map((result) => ({
            snapshotId: snapshot.id,
            queryName: result.query.name,
            queryType: result.query.type,
            vantageType: result.vantage.type === 'public-recursive' ? 'public-recursive' : 'authoritative',
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
            answerSection: result.answers.map((a) => ({
                name: a.name,
                type: a.type,
                ttl: a.ttl,
                data: a.data,
            })),
            authoritySection: result.authority.map((a) => ({
                name: a.name,
                type: a.type,
                ttl: a.ttl,
                data: a.data,
            })),
            additionalSection: result.additional.map((a) => ({
                name: a.name,
                type: a.type,
                ttl: a.ttl,
                data: a.data,
            })),
            errorMessage: result.error || null,
        }));
        const createdObservations = await this.observationRepo.createMany(observationData);
        // Create recordsets from observations
        const createdRecordSets = await this.createRecordSetsFromObservations(snapshot.id, createdObservations);
        // Evaluate rules and persist findings immediately
        // This ensures findings are available for portfolio views without
        // requiring a separate API call
        const { findingsCount, suggestionsCount, evaluationErrors } = await this.evaluateAndPersistFindings(snapshot.id, domainRecord.id, domain, zoneManagement, createdObservations, createdRecordSets);
        if (findingsCount > 0) {
            logger.info('Persisted findings', { domain, findingsCount, suggestionsCount });
        }
        return {
            snapshotId: snapshot.id,
            resultState: evaluationErrors > 0 && resultState === 'complete' ? 'partial' : resultState,
        };
    }
    /**
     * Create RecordSets from normalized observations
     */
    async createRecordSetsFromObservations(snapshotId, observations) {
        const normalizedRecords = observationsToRecordSets(observations);
        const recordSetData = normalizedRecords.map((record) => ({
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
    async evaluateAndPersistFindings(snapshotId, domainId, domainName, zoneManagement, observations, recordSets) {
        try {
            // Create ruleset and engine
            const ruleset = createCombinedRuleset();
            const engine = new RulesEngine(ruleset);
            // Ensure ruleset version exists in DB and get its ID
            let rulesetVersionId;
            const existingVersion = await this.rulesetVersionRepo.findByVersion(ruleset.version);
            if (existingVersion) {
                rulesetVersionId = existingVersion.id;
            }
            else {
                const newVersion = await this.rulesetVersionRepo.create({
                    version: ruleset.version,
                    name: ruleset.name,
                    description: ruleset.description || '',
                    rules: ruleset.rules.map((r) => ({
                        id: r.id,
                        name: r.name,
                        version: r.version,
                        enabled: r.enabled !== false,
                    })),
                    active: true,
                    createdBy: this.config.triggeredBy || 'collector',
                });
                rulesetVersionId = newVersion.id;
            }
            // Update snapshot with ruleset version to indicate findings were evaluated
            await this.snapshotRepo.updateRulesetVersion(snapshotId, rulesetVersionId);
            // Create rule context
            const context = {
                snapshotId,
                domainId,
                domainName,
                zoneManagement,
                observations,
                recordSets,
                rulesetVersion: ruleset.version,
            };
            // Evaluate rules. Per-rule failures are explicit UNKNOWN coverage, not
            // absence of findings. Persist coverage before any early return.
            const { findings, suggestions, errors, complete } = engine.evaluate(context);
            await this.snapshotRepo.updateEvaluationCoverage(snapshotId, {
                state: complete ? 'COMPLETE' : 'PARTIAL',
                errors,
            });
            if (findings.length === 0) {
                return { findingsCount: 0, suggestionsCount: 0, evaluationErrors: errors.length };
            }
            // Persist findings
            // rulesetVersionId is required (NOT NULL since migration 0011) and is
            // resolved above from the active ruleset version — thread it through so
            // every persisted finding is linked for idempotent re-evaluation.
            const findingsToInsert = findings.map((f) => ({
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
            const findingIdMap = new Map();
            for (let i = 0; i < findings.length; i++) {
                const originalId = findings[i].id;
                const persistedId = persistedFindings[i]?.id;
                if (originalId && persistedId) {
                    findingIdMap.set(originalId, persistedId);
                }
            }
            // Persist suggestions with corrected finding IDs
            const suggestionsToInsert = [];
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
                evaluationErrors: errors.length,
            };
        }
        catch (error) {
            // Preserve a typed, sanitized UNKNOWN even when evaluation infrastructure
            // fails outside an individual rule. The detailed exception stays in logs.
            logger.error('Error evaluating and persisting findings', error instanceof Error ? error : new Error(String(error)), { domain: this.config.domain });
            await this.snapshotRepo
                .updateEvaluationCoverage(snapshotId, {
                state: 'PARTIAL',
                errors: [
                    {
                        code: 'RULE_EXECUTION_FAILED',
                        ruleId: 'ruleset',
                        message: 'Ruleset evaluation could not be completed',
                        status: 'UNKNOWN',
                        unknown: {
                            reason: 'CHECK_EVALUATION_FAILED',
                            explanation: 'The ruleset failed before every check produced a trustworthy result.',
                            action: 'RUN_FRESH_SCAN',
                            actionLabel: 'Run a fresh scan',
                            blocking: true,
                        },
                    },
                ],
            })
                .catch(() => undefined);
            return { findingsCount: 0, suggestionsCount: 0, evaluationErrors: 1 };
        }
    }
}
//# sourceMappingURL=collector.js.map