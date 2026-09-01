/**
 * Mail Collection Job
 *
 * Collects mail-related DNS records for a domain:
 * - MX (with null MX detection)
 * - DMARC, DKIM, SPF
 * - MTA-STS, TLS-RPT
 *
 * ## Behavior with and without snapshotId
 *
 * **With snapshotId (persisted mode):**
 * - Results are stored in the database as observations
 * - DKIM selectors are tracked with provenance
 * - Mail evidence summary is created for findings engine
 * - Historical tracking enabled
 *
 * **Without snapshotId (ephemeral mode):**
 * - Results are returned in the response only
 * - No database writes occur
 * - Useful for ad-hoc diagnostics and previews
 * - Can be promoted to persisted by later collecting with a snapshotId
 *
 * This design allows:
 * 1. Quick checks without creating state (debugging, exploration)
 * 2. Full collection as part of a snapshot workflow
 */
import { KNOWN_MAIL_PROVIDERS, validateCollectMailRequestDetailed, } from '@dns-ops/contracts';
import { createPostgresAdapter, DkimSelectorRepository, MailEvidenceRepository, ObservationRepository, } from '@dns-ops/db';
import { isValidDomain } from '@dns-ops/parsing';
import { Hono } from 'hono';
import { performMailCheck } from '../mail/checker.js';
import { getCollectorLogger } from '../middleware/error-tracking.js';
const logger = getCollectorLogger();
export const collectMailRoutes = new Hono();
/**
 * POST /api/collect/mail
 * Trigger mail record collection for a domain
 */
collectMailRoutes.post('/mail', async (c) => {
    const body = await c.req.json();
    // Validate request using shared validation (PR-11.1)
    // Validates: domain (required), preferredProvider (optional enum),
    // explicitSelectors (optional array, max 20 items)
    const validation = validateCollectMailRequestDetailed(body);
    if (!validation.valid) {
        return c.json({ error: 'Invalid request', message: validation.errors.join('; ') }, 400);
    }
    const req = body;
    const { domain, snapshotId, preferredProvider, explicitSelectors } = req;
    // Normalize domain
    const normalizedDomain = domain.toLowerCase().trim().replace(/\.$/, '');
    // Validate domain format using shared validation
    if (!isValidDomain(normalizedDomain)) {
        return c.json({ error: 'Invalid domain format', message: `"${domain}" is not a valid domain name` }, 400);
    }
    try {
        // Perform mail check
        const startTime = Date.now();
        const result = await performMailCheck(normalizedDomain, {
            preferredProvider,
            explicitSelectors,
        });
        const duration = Date.now() - startTime;
        // Store results if snapshotId provided
        let observationCount = 0;
        let selectorCount = 0;
        if (snapshotId) {
            const dbUrl = process.env.DATABASE_URL;
            if (!dbUrl) {
                return c.json({ error: 'DATABASE_URL not configured' }, 500);
            }
            const db = createPostgresAdapter(dbUrl);
            const observationRepo = new ObservationRepository(db);
            const selectorRepo = new DkimSelectorRepository(db);
            const mailEvidenceRepo = new MailEvidenceRepository(db);
            // Store observations
            observationCount = await storeMailObservations(observationRepo, snapshotId, normalizedDomain, result);
            // Store DKIM selectors with provenance
            selectorCount = await storeDkimSelectors(selectorRepo, snapshotId, normalizedDomain, result);
            // Store mail evidence summary
            await storeMailEvidence(mailEvidenceRepo, snapshotId, normalizedDomain, result);
        }
        // Determine mode based on whether snapshotId was provided
        const persisted = !!snapshotId;
        return c.json({
            success: true,
            domain: normalizedDomain,
            snapshotId: snapshotId || null,
            persisted, // true if results stored, false if ephemeral
            duration,
            results: {
                dmarc: {
                    present: result.dmarc.present,
                    valid: result.dmarc.valid,
                    errors: result.dmarc.errors,
                },
                dkim: {
                    present: result.dkim.present,
                    valid: result.dkim.valid,
                    selector: result.dkim.selector,
                    selectorProvenance: result.dkim.selectorProvenance,
                    triedSelectors: result.dkim.triedSelectors,
                    errors: result.dkim.errors,
                },
                spf: {
                    present: result.spf.present,
                    valid: result.spf.valid,
                    errors: result.spf.errors,
                },
            },
            observationCount,
            selectorCount,
        }, 200);
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Mail collection error', err, { domain: normalizedDomain });
        return c.json({
            error: 'Mail collection failed',
            message: err.message,
        }, 500);
    }
});
/**
 * POST /api/collect/mail/check
 * Quick ephemeral mail check - never persists, for diagnostics and previews.
 *
 * Use this endpoint for:
 * - Quick diagnostics without creating state
 * - Preview before running a full collection
 * - Testing mail configuration changes
 */
collectMailRoutes.post('/mail/check', async (c) => {
    const body = await c.req.json();
    // Validate domain
    if (!body.domain || typeof body.domain !== 'string') {
        return c.json({ error: 'Domain is required' }, 400);
    }
    // Validate preferredProvider if provided (PR-11.1)
    if (body.preferredProvider !== undefined &&
        body.preferredProvider !== null &&
        typeof body.preferredProvider === 'string' &&
        body.preferredProvider.length > 0) {
        const knownProviders = KNOWN_MAIL_PROVIDERS;
        if (!knownProviders.includes(body.preferredProvider)) {
            return c.json({ error: `preferredProvider must be one of: ${knownProviders.join(', ')}` }, 400);
        }
    }
    // Validate explicitSelectors if provided (PR-11.1)
    if (body.explicitSelectors !== undefined && body.explicitSelectors !== null) {
        if (!Array.isArray(body.explicitSelectors)) {
            return c.json({ error: 'explicitSelectors must be an array' }, 400);
        }
        if (body.explicitSelectors.length > 20) {
            return c.json({ error: 'explicitSelectors must have at most 20 items' }, 400);
        }
        for (let i = 0; i < body.explicitSelectors.length; i++) {
            if (typeof body.explicitSelectors[i] !== 'string') {
                return c.json({ error: `explicitSelectors[${i}] must be a string` }, 400);
            }
        }
    }
    const { preferredProvider, explicitSelectors } = body;
    const normalizedDomain = body.domain.toLowerCase().trim().replace(/\.$/, '');
    if (!isValidDomain(normalizedDomain)) {
        return c.json({ error: 'Invalid domain format' }, 400);
    }
    try {
        const startTime = Date.now();
        const result = await performMailCheck(normalizedDomain, {
            preferredProvider,
            explicitSelectors,
        });
        const duration = Date.now() - startTime;
        return c.json({
            success: true,
            domain: normalizedDomain,
            persisted: false, // Always ephemeral
            mode: 'check', // Indicates this was a check-only operation
            duration,
            mx: {
                present: result.mx.present,
                isNullMx: result.mx.isNullMx,
                count: result.mx.records.length,
                errors: result.mx.errors,
            },
            dmarc: {
                present: result.dmarc.present,
                valid: result.dmarc.valid,
                record: result.dmarc.record,
                errors: result.dmarc.errors,
            },
            dkim: {
                present: result.dkim.present,
                valid: result.dkim.valid,
                selector: result.dkim.selector,
                selectorProvenance: result.dkim.selectorProvenance,
                provider: result.dkim.provider,
                errors: result.dkim.errors,
            },
            spf: {
                present: result.spf.present,
                valid: result.spf.valid,
                record: result.spf.record,
                errors: result.spf.errors,
            },
            mtaSts: {
                present: result.mtaSts.present,
                valid: result.mtaSts.valid,
                errors: result.mtaSts.errors,
            },
            tlsRpt: {
                present: result.tlsRpt.present,
                valid: result.tlsRpt.valid,
                errors: result.tlsRpt.errors,
            },
        });
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Mail check error', err, { domain: normalizedDomain });
        return c.json({
            error: 'Mail check failed',
            message: err.message,
        }, 500);
    }
});
/**
 * Store mail check results as observations
 */
async function storeMailObservations(repo, snapshotId, domain, result) {
    const observations = [];
    const now = new Date();
    // DMARC observation
    observations.push({
        snapshotId,
        queryName: `_dmarc.${domain}`,
        queryType: 'TXT',
        vantageType: 'public-recursive',
        status: result.dmarc.present
            ? 'success'
            : result.dmarc.errors?.[0]?.includes('NXDOMAIN')
                ? 'nxdomain'
                : 'error',
        queriedAt: now,
        responseTimeMs: 0, // Would need actual timing
        answerSection: result.dmarc.record
            ? [
                {
                    name: `_dmarc.${domain}`,
                    type: 'TXT',
                    ttl: 3600,
                    data: result.dmarc.record,
                },
            ]
            : undefined,
        errorMessage: result.dmarc.errors?.join(', ') || undefined,
    });
    // DKIM observation
    const dkimName = result.dkim.selector
        ? `${result.dkim.selector}._domainkey.${domain}`
        : `unknown._domainkey.${domain}`;
    observations.push({
        snapshotId,
        queryName: dkimName,
        queryType: 'TXT',
        vantageType: 'public-recursive',
        status: result.dkim.present
            ? 'success'
            : result.dkim.errors?.[0]?.includes('NXDOMAIN')
                ? 'nxdomain'
                : 'error',
        queriedAt: now,
        responseTimeMs: 0,
        answerSection: result.dkim.record
            ? [
                {
                    name: dkimName,
                    type: 'TXT',
                    ttl: 3600,
                    data: result.dkim.record,
                },
            ]
            : undefined,
        errorMessage: result.dkim.errors?.join(', ') || undefined,
    });
    // SPF observation (queried on apex domain)
    observations.push({
        snapshotId,
        queryName: domain,
        queryType: 'TXT',
        vantageType: 'public-recursive',
        status: result.spf.present ? 'success' : 'success', // SPF is optional in terms of DNS resolution
        queriedAt: now,
        responseTimeMs: 0,
        answerSection: result.spf.record
            ? [
                {
                    name: domain,
                    type: 'TXT',
                    ttl: 3600,
                    data: result.spf.record,
                },
            ]
            : undefined,
        errorMessage: result.spf.errors?.join(', ') || undefined,
    });
    // MX observation
    observations.push({
        snapshotId,
        queryName: domain,
        queryType: 'MX',
        vantageType: 'public-recursive',
        status: result.mx.present
            ? 'success'
            : result.mx.errors?.[0]?.includes('NXDOMAIN')
                ? 'nxdomain'
                : 'error',
        queriedAt: now,
        responseTimeMs: 0,
        answerSection: result.mx.records.map((r) => ({
            name: domain,
            type: 'MX',
            ttl: 3600,
            data: `${r.priority} ${r.exchange}`,
            priority: r.priority,
        })),
        errorMessage: result.mx.errors?.join(', ') || undefined,
    });
    // MTA-STS observation
    observations.push({
        snapshotId,
        queryName: `_mta-sts.${domain}`,
        queryType: 'TXT',
        vantageType: 'public-recursive',
        status: result.mtaSts.present
            ? 'success'
            : result.mtaSts.errors?.[0]?.includes('NXDOMAIN')
                ? 'nxdomain'
                : 'error',
        queriedAt: now,
        responseTimeMs: 0,
        answerSection: result.mtaSts.record
            ? [
                {
                    name: `_mta-sts.${domain}`,
                    type: 'TXT',
                    ttl: 3600,
                    data: result.mtaSts.record,
                },
            ]
            : undefined,
        errorMessage: result.mtaSts.errors?.join(', ') || undefined,
    });
    // TLS-RPT observation
    observations.push({
        snapshotId,
        queryName: `_smtp._tls.${domain}`,
        queryType: 'TXT',
        vantageType: 'public-recursive',
        status: result.tlsRpt.present
            ? 'success'
            : result.tlsRpt.errors?.[0]?.includes('NXDOMAIN')
                ? 'nxdomain'
                : 'error',
        queriedAt: now,
        responseTimeMs: 0,
        answerSection: result.tlsRpt.record
            ? [
                {
                    name: `_smtp._tls.${domain}`,
                    type: 'TXT',
                    ttl: 3600,
                    data: result.tlsRpt.record,
                },
            ]
            : undefined,
        errorMessage: result.tlsRpt.errors?.join(', ') || undefined,
    });
    // Insert observations
    await repo.createMany(observations);
    return observations.length;
}
/**
 * Store DKIM selectors with provenance tracking
 */
async function storeDkimSelectors(repo, snapshotId, domain, result) {
    const selectors = [];
    // Map provenance from checker to DB enum
    // Checker uses: 'managed', 'heuristic', 'operator', 'provider', 'default'
    // DB uses: 'managed-zone-config', 'operator-supplied', 'provider-heuristic', 'common-dictionary', 'not-found'
    const mapProvenance = (provenance) => {
        switch (provenance) {
            case 'managed':
                return 'managed-zone-config';
            case 'operator':
                return 'operator-supplied';
            case 'provider':
                return 'provider-heuristic';
            case 'dictionary':
            case 'default': // 'default' from checker means common dictionary was used
            case 'heuristic':
                return 'common-dictionary';
            default:
                return 'not-found';
        }
    };
    // Map confidence from provenance
    const mapConfidence = (provenance) => {
        switch (provenance) {
            case 'managed':
                return 'certain';
            case 'operator':
                return 'high';
            case 'provider':
                return 'medium';
            case 'dictionary':
                return 'low';
            default:
                return 'heuristic';
        }
    };
    // Store the found selector
    if (result.dkim.selector) {
        selectors.push({
            snapshotId,
            selector: result.dkim.selector,
            domain,
            provenance: mapProvenance(result.dkim.selectorProvenance),
            confidence: mapConfidence(result.dkim.selectorProvenance),
            provider: result.dkim.provider,
            found: result.dkim.present,
            recordData: result.dkim.record || undefined,
            isValid: result.dkim.valid,
            validationError: result.dkim.errors?.join(', ') || undefined,
        });
    }
    // Store tried selectors that were not found
    if (result.dkim.triedSelectors) {
        for (const tried of result.dkim.triedSelectors) {
            // Skip if already added (the found selector)
            if (tried === result.dkim.selector)
                continue;
            selectors.push({
                snapshotId,
                selector: tried,
                domain,
                provenance: 'common-dictionary', // Tried selectors are from dictionary
                confidence: 'low',
                provider: undefined,
                found: false,
            });
        }
    }
    if (selectors.length > 0) {
        await repo.createMany(selectors);
    }
    return selectors.length;
}
/**
 * Store mail evidence summary
 */
async function storeMailEvidence(repo, snapshotId, domain, result) {
    // Parse DMARC record for policy details
    let dmarcPolicy;
    let dmarcSubdomainPolicy;
    let dmarcPercent;
    const dmarcRua = [];
    const dmarcRuf = [];
    if (result.dmarc.record) {
        const record = result.dmarc.record;
        // Extract policy
        const pMatch = record.match(/\bp=([^;]+)/);
        if (pMatch)
            dmarcPolicy = pMatch[1].trim();
        // Extract subdomain policy
        const spMatch = record.match(/\bsp=([^;]+)/);
        if (spMatch)
            dmarcSubdomainPolicy = spMatch[1].trim();
        // Extract percent
        const pctMatch = record.match(/\bpct=(\d+)/);
        if (pctMatch)
            dmarcPercent = pctMatch[1];
        // Extract RUA
        const ruaMatch = record.match(/\brua=([^;]+)/);
        if (ruaMatch) {
            const uris = ruaMatch[1].split(',').map((u) => u.trim());
            dmarcRua.push(...uris);
        }
        // Extract RUF
        const rufMatch = record.match(/\bruf=([^;]+)/);
        if (rufMatch) {
            const uris = rufMatch[1].split(',').map((u) => u.trim());
            dmarcRuf.push(...uris);
        }
    }
    // Calculate security score
    let score = 0;
    const scoreBreakdown = {
        mx: 0,
        spf: 0,
        dmarc: 0,
        dkim: 0,
        mtaSts: 0,
        tlsRpt: 0,
        bimi: 0,
    };
    // MX: 15 points (0 for null MX)
    if (result.mx.present && !result.mx.isNullMx) {
        scoreBreakdown.mx = 15;
        score += 15;
    }
    // SPF: 20 points
    if (result.spf.present && result.spf.valid) {
        scoreBreakdown.spf = 20;
        score += 20;
    }
    else if (result.spf.present) {
        scoreBreakdown.spf = 10;
        score += 10;
    }
    // DMARC: 25 points (full for reject, less for quarantine/none)
    if (result.dmarc.present && result.dmarc.valid) {
        if (dmarcPolicy === 'reject') {
            scoreBreakdown.dmarc = 25;
            score += 25;
        }
        else if (dmarcPolicy === 'quarantine') {
            scoreBreakdown.dmarc = 20;
            score += 20;
        }
        else {
            scoreBreakdown.dmarc = 10;
            score += 10;
        }
    }
    // DKIM: 20 points
    if (result.dkim.present && result.dkim.valid) {
        scoreBreakdown.dkim = 20;
        score += 20;
    }
    else if (result.dkim.present) {
        scoreBreakdown.dkim = 10;
        score += 10;
    }
    // MTA-STS: 10 points
    if (result.mtaSts.present && result.mtaSts.valid) {
        scoreBreakdown.mtaSts = 10;
        score += 10;
    }
    // TLS-RPT: 10 points
    if (result.tlsRpt.present && result.tlsRpt.valid) {
        scoreBreakdown.tlsRpt = 10;
        score += 10;
    }
    // BIMI: Future enhancement
    // For now, this remains 0
    const evidence = {
        snapshotId,
        domain,
        detectedProvider: result.dkim.provider,
        providerConfidence: result.dkim.selectorProvenance === 'provider' ? 'medium' : 'heuristic',
        hasMx: result.mx.present,
        isNullMx: result.mx.isNullMx,
        mxHosts: result.mx.records.map((r) => r.exchange),
        hasSpf: result.spf.present,
        spfRecord: result.spf.record || undefined,
        hasDmarc: result.dmarc.present,
        dmarcRecord: result.dmarc.record || undefined,
        dmarcPolicy,
        dmarcSubdomainPolicy,
        dmarcPercent,
        dmarcRua: dmarcRua.length > 0 ? dmarcRua : undefined,
        dmarcRuf: dmarcRuf.length > 0 ? dmarcRuf : undefined,
        hasDkim: result.dkim.present,
        dkimSelectorsFound: result.dkim.selector ? [result.dkim.selector] : undefined,
        dkimSelectorCount: result.dkim.selector ? '1' : '0',
        hasMtaSts: result.mtaSts.present,
        mtaStsMode: result.mtaSts.valid ? 'enforce' : undefined, // We'd need to fetch the policy for the actual mode
        mtaStsVersion: result.mtaSts.version,
        hasTlsRpt: result.tlsRpt.present,
        tlsRptRua: result.tlsRpt.rua,
        hasBimi: false,
        securityScore: String(score),
        scoreBreakdown,
    };
    await repo.upsert(evidence);
}
//# sourceMappingURL=collect-mail.js.map