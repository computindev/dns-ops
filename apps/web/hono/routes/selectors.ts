/**
 * DKIM Selectors API Routes
 *
 * Endpoints for retrieving discovered DKIM selectors with provenance.
 * Provenance/confidence/provider are stored at collection time in dkim_selectors table.
 */

import {
  DkimSelectorRepository,
  DomainRepository,
  ObservationRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/authorization.js';
import { getWebLogger } from '../middleware/error-tracking.js';
import type { Env } from '../types.js';

export const selectorRoutes = new Hono<Env>();

/**
 * GET /api/snapshot/:snapshotId/selectors
 * Get discovered DKIM selectors with provenance
 *
 * Returns selector data from dkim_selectors table which stores provenance
 * at collection time (not inferred from selector names).
 */
selectorRoutes.get('/snapshot/:snapshotId/selectors', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const db = c.get('db');

  try {
    const snapshotRepo = new SnapshotRepository(db);
    const domainRepo = new DomainRepository(db);
    const selectorRepo = new DkimSelectorRepository(db);

    // Fetch snapshot and verify tenant ownership through its domain.
    const snapshot = await snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    const domain = await domainRepo.findById(snapshot.domainId);
    const tenantId = c.get('tenantId');
    if (
      !domain ||
      (!tenantId && domain.tenantId) ||
      (tenantId && domain.tenantId && domain.tenantId !== tenantId)
    ) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    // Fetch selectors from dkim_selectors table (with stored provenance)
    const storedSelectors = await selectorRepo.findBySnapshotId(snapshotId);

    // If we have stored selectors, use them (provenance was persisted at collection time)
    if (storedSelectors.length > 0) {
      const selectors = storedSelectors.map((s) => ({
        selector: s.selector,
        found: s.found,
        provenance: s.provenance,
        confidence: s.confidence,
        provider: s.provider || undefined,
        queryName: `${s.selector}._domainkey.${s.domain}`,
        recordData: s.recordData || undefined,
        isValid: s.isValid,
        validationError: s.validationError || undefined,
      }));

      return c.json({
        snapshotId,
        selectors,
        count: selectors.length,
        found: selectors.filter((s) => s.found).length,
        source: 'persisted', // Indicates data came from stored provenance
      });
    }

    // Fallback: Check observations if no dkim_selectors records exist
    // This handles legacy snapshots collected before provenance persistence
    const observationRepo = new ObservationRepository(db);
    const observations = await observationRepo.findBySnapshotId(snapshotId);

    const dkimObservations = observations.filter(
      (obs) => obs.queryType === 'TXT' && obs.queryName.includes('_domainkey')
    );

    if (dkimObservations.length === 0) {
      return c.json({
        snapshotId,
        selectors: [],
        message: 'No DKIM selectors discovered for this snapshot',
        discoveryMethod: 'none',
      });
    }

    // Parse selectors from observations (legacy fallback with inferred provenance)
    const selectors = dkimObservations.map((obs) => {
      const selectorMatch = obs.queryName.match(/^([^.]+)\._domainkey\./);
      const selector = selectorMatch ? selectorMatch[1] : 'unknown';

      // Legacy inference - provenance unknown for old snapshots
      return {
        selector,
        found: obs.status === 'success' && obs.answerSection && obs.answerSection.length > 0,
        provenance: 'unknown' as const, // Mark as unknown for legacy data
        confidence: 'heuristic' as const,
        queryName: obs.queryName,
        status: obs.status,
      };
    });

    return c.json({
      snapshotId,
      selectors,
      count: selectors.length,
      found: selectors.filter((s) => s.found).length,
      source: 'inferred', // Indicates data was inferred from observations
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching selectors',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshot/:snapshotId/selectors',
        method: 'GET',
        tenantId: c.get('tenantId'),
        snapshotId: c.req.param('snapshotId'),
      }
    );
    return c.json(
      {
        error: 'Failed to fetch selectors',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/domain/:domain/selectors/suggest
 * Suggest DKIM selectors based on provider detection
 *
 * Uses direct repo access instead of self-referencing HTTP fetch,
 * which would fail on Cloudflare Workers (no loopback).
 */
selectorRoutes.get('/domain/:domain/selectors/suggest', requireAuth, async (c) => {
  const domain = c.req.param('domain');
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  try {
    const domainRepo = new DomainRepository(db);
    const snapshotRepo = new SnapshotRepository(db);
    const observationRepo = new ObservationRepository(db);

    if (!tenantId) {
      return c.json({ error: 'No data for domain' }, 404);
    }

    // Look up domain and latest snapshot via repos (not self-fetch)
    const domainRecord = await domainRepo.findByNameForTenant(domain, tenantId);
    if (!domainRecord) {
      return c.json({ error: 'No data for domain' }, 404);
    }

    const snapshots = await snapshotRepo.findByDomain(domainRecord.id, 1);
    if (snapshots.length === 0) {
      return c.json({ error: 'No snapshots for domain' }, 404);
    }

    const observations = await observationRepo.findBySnapshotId(snapshots[0].id);

    // Simple provider detection from MX observations
    const mxObs = observations.find((o) => o.queryType === 'MX');
    let provider: string | null = null;
    let suggestedSelectors: string[] = [];

    const mxData = mxObs?.answerSection?.[0]?.data?.toLowerCase();
    if (mxData) {
      if (mxData.includes('google')) {
        provider = 'google-workspace';
        suggestedSelectors = ['google', '20210112'];
      } else if (mxData.includes('outlook') || mxData.includes('microsoft')) {
        provider = 'microsoft-365';
        suggestedSelectors = ['selector1', 'selector2'];
      }
    }

    return c.json({
      domain,
      provider,
      suggestedSelectors,
      message: provider
        ? `Detected ${provider} - suggested selectors based on provider templates`
        : 'No provider detected - try common selectors',
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to suggest selectors',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
