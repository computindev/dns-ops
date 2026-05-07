/**
 * Delegation API Routes
 *
 * Endpoints for delegation analysis and visualization.
 */

import { DomainRepository, ObservationRepository, SnapshotRepository } from '@dns-ops/db';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/authorization.js';
import { getWebLogger } from '../middleware/error-tracking.js';
import type { Env } from '../types.js';

export const delegationRoutes = new Hono<Env>();

// Helper to enforce tenant isolation: returns null on error (caller returns 404)
async function enforceSnapshotTenantIsolation(
  snapshotId: string,
  db: Env['Variables']['db'],
  tenantId: string | undefined
) {
  const snapshotRepo = new SnapshotRepository(db);
  const domainRepo = new DomainRepository(db);

  const snapshot = await snapshotRepo.findById(snapshotId);
  if (!snapshot) return null;

  const domain = await domainRepo.findById(snapshot.domainId);
  if (!domain) return null;

  // Tenant isolation: cross-tenant access returns 404 (not 403, to avoid leaking existence)
  if (!tenantId && domain.tenantId) return null;
  if (tenantId && domain.tenantId && domain.tenantId !== tenantId) return null;

  return { snapshot, domain };
}

/**
 * GET /api/snapshot/:snapshotId/delegation
 * Get delegation analysis for a snapshot
 */
delegationRoutes.get('/snapshot/:snapshotId/delegation', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  const isolation = await enforceSnapshotTenantIsolation(snapshotId, db, tenantId);
  if (!isolation) {
    return c.json({ error: 'Snapshot not found' }, 404);
  }
  const { snapshot } = isolation;

  try {
    const observationRepo = new ObservationRepository(db);

    // Check if snapshot has delegation metadata
    const hasDelegationData = (
      snapshot as unknown as { metadata?: { hasDelegationData?: boolean } }
    ).metadata?.hasDelegationData;
    if (!hasDelegationData) {
      return c.json({
        snapshotId,
        message: 'No delegation data available for this snapshot',
        delegation: null,
      });
    }

    // Fetch NS-related observations
    const observations = await observationRepo.findBySnapshotId(snapshotId);

    // Extract NS records from parent view
    const nsObservations = observations.filter(
      (obs) => obs.queryType === 'NS' && obs.queryName === snapshot.domainName
    );

    // Extract glue records (A/AAAA for NS targets)
    const glueObservations = observations.filter(
      (obs) =>
        (obs.queryType === 'A' || obs.queryType === 'AAAA') &&
        obs.queryName.includes('.') &&
        !obs.queryName.endsWith(snapshot.domainName)
    );

    // Build delegation response
    const delegation = {
      domain: snapshot.domainName,
      parentZone: (snapshot as unknown as { metadata?: { parentZone?: string } }).metadata
        ?.parentZone,
      nameServers: nsObservations
        .filter((obs) => obs.status === 'success')
        .flatMap((obs) =>
          (obs.answerSection || [])
            .filter((a) => a.type === 'NS')
            .map((a) => ({
              name: a.data,
              source: obs.vantageIdentifier,
            }))
        ),
      glue: glueObservations
        .filter((obs) => obs.status === 'success')
        .map((obs) => ({
          name: obs.queryName,
          type: obs.queryType,
          address: obs.answerSection?.[0]?.data,
        })),
      hasDivergence:
        (snapshot as unknown as { metadata?: { hasDivergence?: boolean } }).metadata
          ?.hasDivergence || false,
      hasDnssec:
        (snapshot as unknown as { metadata?: { hasDnssec?: boolean } }).metadata?.hasDnssec ||
        false,
    };

    return c.json({
      snapshotId,
      delegation,
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching delegation',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshot/:snapshotId/delegation',
        method: 'GET',
        tenantId: c.get('tenantId'),
        snapshotId: c.req.param('snapshotId'),
      }
    );
    return c.json(
      {
        error: 'Failed to fetch delegation data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/domain/:domain/delegation/latest
 * Get latest delegation analysis for a domain
 */
delegationRoutes.get('/domain/:domain/delegation/latest', requireAuth, async (c) => {
  const domain = c.req.param('domain');
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  try {
    const domainRepo = new DomainRepository(db);
    const snapshotRepo = new SnapshotRepository(db);

    if (!tenantId) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    // Tenant isolation: check domain ownership without global-domain first-match leakage.
    const domainRecord = await domainRepo.findByNameForTenant(domain, tenantId);
    if (!domainRecord) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    // Find latest snapshot with delegation data
    const snapshots = await snapshotRepo.findByDomain(domainRecord.id);
    const snapshotWithDelegation = snapshots.find(
      (s) =>
        (s as unknown as { metadata?: { hasDelegationData?: boolean } }).metadata?.hasDelegationData
    );

    if (!snapshotWithDelegation) {
      return c.json(
        {
          domain,
          message: 'No delegation data available for this domain',
        },
        404
      );
    }

    // Redirect to the snapshot-specific endpoint
    return c.redirect(`/api/snapshot/${snapshotWithDelegation.id}/delegation`);
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching latest delegation:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshot/:snapshotId/delegation/latest',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to fetch delegation data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/snapshot/:snapshotId/delegation/issues
 * Get delegation issues (divergence, lame, missing glue)
 */
delegationRoutes.get('/snapshot/:snapshotId/delegation/issues', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  const isolation = await enforceSnapshotTenantIsolation(snapshotId, db, tenantId);
  if (!isolation) {
    return c.json({ error: 'Snapshot not found' }, 404);
  }
  const { snapshot } = isolation;

  try {
    const observationRepo = new ObservationRepository(db);

    const observations = await observationRepo.findBySnapshotId(snapshotId);

    // Find divergence in NS responses
    const nsObservations = observations.filter(
      (obs) => obs.queryType === 'NS' && obs.queryName === snapshot.domainName
    );

    const issues: Array<{
      type: string;
      severity: string;
      description: string;
      details: unknown;
    }> = [];

    // Check for divergence
    const successfulNs = nsObservations.filter((o) => o.status === 'success');
    const nsSets = successfulNs.map((o) =>
      (o.answerSection || [])
        .filter((a) => a.type === 'NS')
        .map((a) => a.data)
        .sort()
        .join(',')
    );

    const uniqueSets = [...new Set(nsSets)];
    if (uniqueSets.length > 1) {
      issues.push({
        type: 'ns-divergence',
        severity: 'critical',
        description: 'Name servers differ across vantages',
        details: {
          vantages: successfulNs.map((o) => ({
            source: o.vantageIdentifier,
            ns: (o.answerSection || []).filter((a) => a.type === 'NS').map((a) => a.data),
          })),
        },
      });
    }

    // Check for missing glue
    const metadata = (snapshot as unknown as { metadata?: { nsServers?: string[] } }).metadata;
    if (metadata?.nsServers) {
      for (const ns of metadata.nsServers) {
        // Check if glue exists for in-zone NS
        if (ns.toLowerCase().endsWith(`.${snapshot.domainName.toLowerCase()}`)) {
          const glueObs = observations.find(
            (o) =>
              (o.queryType === 'A' || o.queryType === 'AAAA') &&
              o.queryName.toLowerCase() === ns.toLowerCase()
          );
          if (!glueObs || glueObs.status !== 'success') {
            issues.push({
              type: 'missing-glue',
              severity: 'high',
              description: `Missing glue record for ${ns}`,
              details: { nsServer: ns },
            });
          }
        }
      }
    }

    return c.json({
      snapshotId,
      domain: snapshot.domainName,
      issues,
      issueCount: issues.length,
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching delegation issues:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshot/:snapshotId/delegation',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to fetch delegation issues',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/snapshot/:snapshotId/delegation/dnssec
 * Get DNSSEC evidence and chain validation details
 */
delegationRoutes.get('/snapshot/:snapshotId/delegation/dnssec', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  const isolation = await enforceSnapshotTenantIsolation(snapshotId, db, tenantId);
  if (!isolation) {
    return c.json({ error: 'Snapshot not found' }, 404);
  }
  const { snapshot } = isolation;

  try {
    const observationRepo = new ObservationRepository(db);

    const observations = await observationRepo.findBySnapshotId(snapshotId);

    // Extract DNSSEC-related observations
    const dsObservations = observations.filter(
      (obs) => obs.queryType === 'DS' && obs.queryName === snapshot.domainName
    );

    const dnskeyObservations = observations.filter(
      (obs) => obs.queryType === 'DNSKEY' && obs.queryName === snapshot.domainName
    );

    const rrsigObservations = observations.filter((obs) => obs.queryType === 'RRSIG');

    // Parse DS records
    const dsRecords = dsObservations
      .filter((obs) => obs.status === 'success')
      .flatMap((obs) =>
        (obs.answerSection || [])
          .filter((a) => a.type === 'DS')
          .map((a) => {
            // DS record format: keyTag algorithm digestType digest
            const parts = a.data.split(' ');
            return {
              keyTag: parts[0] || '',
              algorithm: parts[1] || '',
              digestType: parts[2] || '',
              digest: parts.slice(3).join(' ') || '',
              source: obs.vantageIdentifier,
              ttl: a.ttl,
            };
          })
      );

    // Parse DNSKEY records
    const dnskeyRecords = dnskeyObservations
      .filter((obs) => obs.status === 'success')
      .flatMap((obs) =>
        (obs.answerSection || [])
          .filter((a) => a.type === 'DNSKEY')
          .map((a) => {
            // DNSKEY format: flags protocol algorithm publicKey
            const parts = a.data.split(' ');
            const flags = parseInt(parts[0] || '0', 10);
            return {
              flags,
              isKSK: (flags & 0x0001) !== 0, // SEP flag
              isZSK: (flags & 0x0001) === 0,
              protocol: parts[1] || '',
              algorithm: parts[2] || '',
              publicKey: parts.slice(3).join(' ') || '',
              source: obs.vantageIdentifier,
              ttl: a.ttl,
            };
          })
      );

    // Count RRSIG coverage
    const signedTypes = new Set(
      rrsigObservations
        .filter((obs) => obs.status === 'success')
        .flatMap((obs) =>
          (obs.answerSection || [])
            .filter((a) => a.type === 'RRSIG')
            .map((a) => {
              // RRSIG first field is the covered type
              const parts = a.data.split(' ');
              return parts[0] || '';
            })
        )
    );

    // Determine DNSSEC status
    const hasDs = dsRecords.length > 0;
    const hasDnskey = dnskeyRecords.length > 0;
    const hasKsk = dnskeyRecords.some((k) => k.isKSK);
    const hasZsk = dnskeyRecords.some((k) => k.isZSK);
    const hasRrsig = signedTypes.size > 0;

    let status: 'signed' | 'partially-signed' | 'unsigned' | 'broken' = 'unsigned';
    let statusMessage = '';

    if (hasDs && hasDnskey && hasRrsig) {
      if (hasKsk && hasZsk) {
        status = 'signed';
        statusMessage = 'Zone is properly DNSSEC-signed';
      } else {
        status = 'partially-signed';
        statusMessage = 'Zone has DNSSEC records but may be missing KSK or ZSK';
      }
    } else if (hasDs && !hasDnskey) {
      status = 'broken';
      statusMessage = 'DS record exists in parent but DNSKEY not found in zone';
    } else if (hasDnskey && !hasDs) {
      status = 'partially-signed';
      statusMessage = 'Zone has DNSKEY but no DS in parent (chain incomplete)';
    } else {
      status = 'unsigned';
      statusMessage = 'Zone is not DNSSEC-signed';
    }

    // Build response
    const dnssec = {
      status,
      statusMessage,
      hasDelegationSigner: hasDs,
      hasDnskey,
      hasKsk,
      hasZsk,
      hasRrsig,
      signedRecordTypes: Array.from(signedTypes),
      dsRecords,
      dnskeyRecords,
      chainSummary: {
        dsCount: dsRecords.length,
        dnskeyCount: dnskeyRecords.length,
        kskCount: dnskeyRecords.filter((k) => k.isKSK).length,
        zskCount: dnskeyRecords.filter((k) => k.isZSK).length,
        signedTypeCount: signedTypes.size,
      },
    };

    return c.json({
      snapshotId,
      domain: snapshot.domainName,
      dnssec,
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching DNSSEC evidence:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshots/:snapshotId/delegation/dnssec',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to fetch DNSSEC evidence',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/snapshot/:snapshotId/delegation/evidence
 * Get detailed delegation evidence with per-nameserver responses
 */
delegationRoutes.get('/snapshot/:snapshotId/delegation/evidence', requireAuth, async (c) => {
  const snapshotId = c.req.param('snapshotId');
  const db = c.get('db');
  const tenantId = c.get('tenantId');

  const isolation = await enforceSnapshotTenantIsolation(snapshotId, db, tenantId);
  if (!isolation) {
    return c.json({ error: 'Snapshot not found' }, 404);
  }
  const { snapshot } = isolation;

  try {
    const observationRepo = new ObservationRepository(db);

    const observations = await observationRepo.findBySnapshotId(snapshotId);

    // Get NS observations grouped by vantage
    const nsObservations = observations.filter(
      (obs) => obs.queryType === 'NS' && obs.queryName === snapshot.domainName
    );

    // Build per-vantage evidence
    const vantageEvidence = nsObservations.map((obs) => {
      const nsRecords = (obs.answerSection || [])
        .filter((a) => a.type === 'NS')
        .map((a) => ({
          name: a.data,
          ttl: a.ttl,
        }));

      return {
        vantageType: obs.vantageType,
        vantageIdentifier: obs.vantageIdentifier,
        status: obs.status,
        responseTime: obs.responseTimeMs,
        nsRecords,
        nsCount: nsRecords.length,
        rawResponse: {
          answerCount: obs.answerSection?.length || 0,
          authorityCount: obs.authoritySection?.length || 0,
          additionalCount: obs.additionalSection?.length || 0,
        },
      };
    });

    // Find authoritative nameserver responses
    const authoritativeResponses = observations.filter(
      (obs) => obs.vantageType === 'authoritative'
    );

    // Build per-nameserver evidence
    const nameserverEvidence: Record<
      string,
      {
        hostname: string;
        ipv4?: string;
        ipv6?: string;
        isResponsive: boolean;
        responseDetails?: {
          queryName: string;
          queryType: string;
          status: string;
          responseTime: number;
        }[];
      }
    > = {};

    for (const obs of authoritativeResponses) {
      const ns = obs.vantageIdentifier;
      if (!ns) continue; // Skip if no vantage identifier

      if (!nameserverEvidence[ns]) {
        nameserverEvidence[ns] = {
          hostname: ns,
          isResponsive: false,
          responseDetails: [],
        };
      }

      if (obs.status === 'success') {
        nameserverEvidence[ns].isResponsive = true;
      }

      nameserverEvidence[ns].responseDetails?.push({
        queryName: obs.queryName,
        queryType: obs.queryType,
        status: obs.status,
        responseTime: obs.responseTimeMs ?? 0,
      });
    }

    // Get glue records
    const glueRecords = observations
      .filter(
        (obs) => (obs.queryType === 'A' || obs.queryType === 'AAAA') && obs.status === 'success'
      )
      .flatMap((obs) =>
        (obs.answerSection || [])
          .filter((a) => a.type === 'A' || a.type === 'AAAA')
          .map((a) => ({
            hostname: obs.queryName,
            type: a.type,
            address: a.data,
            ttl: a.ttl,
            source: obs.vantageIdentifier,
          }))
      );

    // Compute consistency score
    const allNsSets = vantageEvidence
      .filter((v) => v.status === 'success')
      .map((v) =>
        v.nsRecords
          .map((n) => n.name)
          .sort()
          .join(',')
      );
    const uniqueNsSets = new Set(allNsSets);
    const consistencyScore =
      uniqueNsSets.size === 1 ? 100 : Math.round((1 / uniqueNsSets.size) * 100);

    const evidence = {
      domain: snapshot.domainName,
      vantageEvidence,
      nameserverEvidence: Object.values(nameserverEvidence),
      glueRecords,
      summary: {
        totalVantages: vantageEvidence.length,
        successfulVantages: vantageEvidence.filter((v) => v.status === 'success').length,
        consistencyScore,
        isConsistent: uniqueNsSets.size <= 1,
        uniqueNsSetCount: uniqueNsSets.size,
        nameserverCount: Object.keys(nameserverEvidence).length,
        responsiveNameservers: Object.values(nameserverEvidence).filter((n) => n.isResponsive)
          .length,
        glueRecordCount: glueRecords.length,
      },
    };

    return c.json({
      snapshotId,
      evidence,
    });
  } catch (error) {
    const logger = getWebLogger();
    logger.error(
      'Error fetching delegation evidence:',
      error instanceof Error ? error : new Error(String(error)),
      {
        requestId: c.req.header('X-Request-ID'),
        path: '/api/snapshot/:snapshotId/delegation',
        method: 'GET',
        tenantId: c.get('tenantId'),
      }
    );
    return c.json(
      {
        error: 'Failed to fetch delegation evidence',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
