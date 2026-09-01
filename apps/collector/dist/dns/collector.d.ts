/**
 * DNS Collection Orchestrator
 *
 * Coordinates DNS queries across multiple vantages and stores results.
 * Evaluates rules and persists findings immediately after collection.
 */
import type { IDatabaseAdapter } from '@dns-ops/db';
import { Semaphore } from '../probes/semaphore.js';
import type { CollectionConfig, CollectionError, CollectionResult, DNSQuery, DNSQueryResult, VantageInfo } from './types.js';
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
export declare function collectQueriesConcurrently(resolver: ResolverLike, queries: DNSQuery[], vantage: VantageInfo, semaphore: Semaphore, errors: CollectionError[]): Promise<DNSQueryResult[]>;
export declare class DNSCollector {
    private resolver;
    private readonly semaphore;
    private config;
    private domainRepo;
    private snapshotRepo;
    private observationRepo;
    private recordSetRepo;
    private findingRepo;
    private suggestionRepo;
    private rulesetVersionRepo;
    constructor(config: CollectionConfig, db: IDatabaseAdapter, options?: {
        resolver?: ResolverLike;
        queryConcurrency?: number;
    });
    /**
     * Execute full DNS collection for the domain
     */
    collect(): Promise<CollectionResult>;
    /**
     * Generate queries based on configuration
     */
    private generateQueries;
    /**
     * Generate mail-related queries including DKIM selector discovery
     */
    private generateMailQueries;
    /**
     * Collect queries from a specific vantage
     */
    private collectFromVantage;
    /**
     * Discover authoritative nameservers for the domain
     */
    private discoverAuthoritativeServers;
    /**
     * Calculate overall result state based on query results
     */
    private calculateResultState;
    private getAuthoritativeEvidenceCoverage;
    /**
     * Store results in database
     */
    private storeResults;
    /**
     * Create RecordSets from normalized observations
     */
    private createRecordSetsFromObservations;
    /**
     * Evaluate rules and persist findings for a snapshot
     *
     * This is called automatically after collection to ensure findings are
     * immediately available for portfolio views and other consumers.
     */
    private evaluateAndPersistFindings;
}
//# sourceMappingURL=collector.d.ts.map