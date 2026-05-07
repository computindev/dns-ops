/**
 * Domain Collection Job
 *
 * API routes for triggering DNS collection jobs.
 * Uses shared contracts from @dns-ops/contracts for request/response types.
 *
 * ARCHITECTURE DECISION: Synchronous Single-Domain Collection (PR-07.2)
 * ========================================================================
 * Single-domain collection via POST /api/collect/domain runs synchronously
 * by design. This is intentional and provides several benefits:
 *
 * 1. IMMEDIATE FEEDBACK: Users get instant results for ad-hoc domain checks
 *    without polling or websockets. The HTTP response includes snapshot ID,
 *    observation count, and collection status.
 *
 * 2. NO REDIS DEPENDENCY: Single-domain collection works without Redis,
 *    reducing infrastructure requirements for basic usage. The job queue
 *    (BullMQ) is only required for scheduled monitoring and fleet reports.
 *
 * 3. SIMPLER ERROR HANDLING: Errors are returned directly in the HTTP
 *    response rather than requiring separate status polling.
 *
 * 4. REQUEST-RESPONSE SEMANTICS: DNS collection is fast enough (typically
 *    <5s) that async processing adds unnecessary complexity for single
 *    domains.
 *
 * When to use the job queue instead:
 * - Scheduled monitoring refreshes (use scheduleMonitoringJob)
 * - Fleet report generation (use getReportsQueue)
 * - Bulk domain processing (future: batch collection endpoint)
 *
 * The queue infrastructure exists in ./queue.ts but is intentionally NOT
 * used for single-domain ad-hoc collection.
 */
import { validateCollectDomainRequest, } from '@dns-ops/contracts';
import { DomainRepository, SnapshotRepository } from '@dns-ops/db';
import { isValidDomain, normalizeDomain } from '@dns-ops/parsing';
import { Hono } from 'hono';
import { DNSCollector } from '../dns/collector.js';
import { getCollectorLogger, trackCollectionError, trackCollectionResult, } from '../middleware/error-tracking.js';
const logger = getCollectorLogger();
class DomainOwnershipError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'DomainOwnershipError';
    }
}
export const collectDomainRoutes = new Hono();
/**
 * POST /api/collect/domain
 * Trigger a DNS collection for a domain
 *
 * Request: CollectDomainRequest
 * Response: CollectDomainResponse | ApiErrorResponse
 */
collectDomainRoutes.post('/domain', async (c) => {
    try {
        const body = await c.req.json();
        // Validate request shape
        if (!validateCollectDomainRequest(body)) {
            const error = {
                error: 'Invalid request',
                message: 'Domain is required and must be a non-empty string',
                code: 'INVALID_REQUEST',
            };
            return c.json(error, 400);
        }
        const req = body;
        // Use shared domain normalization (same as web app)
        const domainInfo = normalizeDomain(req.domain);
        // Validate domain format using shared validation
        if (!isValidDomain(domainInfo.normalized)) {
            const error = {
                error: 'Invalid domain format',
                message: `"${req.domain}" is not a valid domain name`,
                code: 'INVALID_DOMAIN',
            };
            return c.json(error, 400);
        }
        const tenantId = c.get('tenantId');
        const actorId = c.get('actorId');
        if (!tenantId || !actorId) {
            return c.json({ error: 'Authenticated tenant and actor context required' }, 401);
        }
        const normalizedDomain = domainInfo.normalized;
        const zoneManagement = req.zoneManagement ?? 'unknown';
        const triggeredBy = req.triggeredBy ?? actorId;
        // Extract mail collection options (Bead 08)
        const { dkimSelectors, managedDkimSelectors, includeMailRecords } = req;
        // Configuration for collection
        const config = {
            tenantId,
            domain: normalizedDomain,
            zoneManagement: zoneManagement,
            recordTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA'],
            triggeredBy,
            includeMailRecords: includeMailRecords !== false, // Default to true
            dkimSelectors: Array.isArray(dkimSelectors) ? dkimSelectors : undefined,
            managedDkimSelectors: Array.isArray(managedDkimSelectors) ? managedDkimSelectors : undefined,
        };
        const db = c.get('db');
        if (!db) {
            return c.json({ error: 'Database unavailable' }, 503);
        }
        // VAL-003: Collection dedup check
        // Prevent rapid re-collection of the same domain
        // First, find the domain by name to get the domain ID
        const domainRepo = new DomainRepository(db);
        const domain = await domainRepo.findByNameForTenant(normalizedDomain, tenantId);
        if (domain) {
            // Domain exists, check for recent snapshots using the domain ID (UUID)
            const snapshotRepo = new SnapshotRepository(db);
            const latestSnapshot = await snapshotRepo.findRecentByDomain(domain.id);
            if (latestSnapshot) {
                logger.info('Collection skipped - recent snapshot exists', {
                    domain: normalizedDomain,
                    domainId: domain.id,
                    snapshotId: latestSnapshot.id,
                    createdAt: latestSnapshot.createdAt,
                });
                return c.json({
                    success: false,
                    reason: 'recent_collection_exists',
                    message: `Collection skipped - a snapshot was created ${Math.round((Date.now() - latestSnapshot.createdAt.getTime()) / 1000)} seconds ago. Wait at least 60 seconds between collections.`,
                    snapshotId: latestSnapshot.id,
                    queued: false,
                    lastCollectionAt: latestSnapshot.createdAt.toISOString(),
                }, 429);
            }
        }
        // Run collection
        const collector = new DNSCollector(config, db);
        const result = await collector.collect();
        trackCollectionResult({
            domain: normalizedDomain,
            snapshotId: result.snapshotId,
            recordCount: result.observationCount,
            durationMs: result.duration,
            resultState: result.resultState,
        });
        const response = {
            success: true,
            domain: normalizedDomain,
            snapshotId: result.snapshotId,
            observationCount: result.observationCount,
            resultState: result.resultState,
            duration: result.duration,
        };
        return c.json(response, 201);
    }
    catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        trackCollectionError(error, { domain: 'unknown' });
        if (error instanceof DomainOwnershipError ||
            (error.name === 'DomainOwnershipError' && 'code' in error)) {
            const code = 'code' in error && typeof error.code === 'string' ? error.code : 'DOMAIN_TENANT_CONFLICT';
            return c.json({
                error: 'Collection blocked by domain ownership policy',
                message: error.message,
                code,
            }, 409);
        }
        const errResponse = {
            error: 'Collection failed',
            message: error.message,
            code: 'COLLECTION_ERROR',
        };
        return c.json(errResponse, 500);
    }
});
/**
 * GET /api/collect/status/:snapshotId
 * Check collection status by looking up the snapshot in the database
 */
collectDomainRoutes.get('/status/:snapshotId', async (c) => {
    const db = c.get('db');
    const snapshotId = c.req.param('snapshotId');
    const tenantId = c.get('tenantId');
    const actorId = c.get('actorId');
    if (!tenantId || !actorId) {
        return c.json({ error: 'Authenticated tenant and actor context required' }, 401);
    }
    if (!db) {
        return c.json({ error: 'Database unavailable' }, 503);
    }
    try {
        const snapshotRepo = new SnapshotRepository(db);
        const domainRepo = new DomainRepository(db);
        const snapshot = await snapshotRepo.findById(snapshotId);
        if (!snapshot) {
            return c.json({
                error: 'Snapshot not found',
                snapshotId,
            }, 404);
        }
        const domain = await domainRepo.findById(snapshot.domainId);
        if (!domain || domain.tenantId !== tenantId) {
            return c.json({
                error: 'Snapshot not found',
                snapshotId,
            }, 404);
        }
        // Map resultState to status response
        const status = snapshot.resultState; // 'complete', 'partial', or 'failed'
        return c.json({
            snapshotId,
            status,
            domain: snapshot.domainId, // Note: this is domainId, not domain name
            createdAt: snapshot.createdAt,
            completedAt: snapshot.createdAt, // Collection is synchronous, so same as created
            errorMessage: snapshot.errorMessage,
        });
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Status check error', err, { snapshotId });
        return c.json({
            error: 'Failed to check status',
            message: err.message,
            snapshotId,
        }, 500);
    }
});
// Domain validation is now handled by @dns-ops/parsing.isValidDomain
// which ensures consistent validation between web and collector
//# sourceMappingURL=collect-domain.js.map