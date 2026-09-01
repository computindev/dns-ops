/**
 * DNS Collection Orchestrator
 *
 * Coordinates DNS queries across multiple vantages and stores results.
 * Evaluates rules and persists findings immediately after collection.
 */
import type { IDatabaseAdapter } from '@dns-ops/db';
import type { CollectionConfig, CollectionResult } from './types.js';
export declare class DNSCollector {
    private resolver;
    private config;
    private domainRepo;
    private snapshotRepo;
    private observationRepo;
    private recordSetRepo;
    private findingRepo;
    private suggestionRepo;
    private rulesetVersionRepo;
    constructor(config: CollectionConfig, db: IDatabaseAdapter);
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