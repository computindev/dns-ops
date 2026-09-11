import {
  DOMAIN_CRITICALITIES,
  DOMAIN_PURPOSES,
  operationalHttpDiscriminator,
  parseSupportedOperationalBaseline,
  purposeUndeclaredUnknown,
} from '@dns-ops/contracts';
import {
  DomainProfileRepository,
  DomainRepository,
  OperationalBaselineRepository,
  ProbeObservationRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { type Context, Hono } from 'hono';
import { getRequestClientIp } from '../lib/request-context.js';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import {
  enumValue,
  optionalString,
  validateBody,
  validationErrorResponse,
} from '../middleware/validation.js';
import type { Env } from '../types.js';

export const domainProfileRoutes = new Hono<Env>();
domainProfileRoutes.use('*', requireAuth);

async function ownedDomain(c: Context<Env>) {
  const tenantId = c.get('tenantId');
  if (!tenantId) return null;
  return new DomainRepository(c.get('db')).findByNameForTenant(c.req.param('domain'), tenantId);
}

type EvidenceFreshness = 'CURRENT' | 'STALE' | 'MISSING_BASELINE' | 'NOT_BASELINE_GATED';

function httpDiscriminator(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    return operationalHttpDiscriminator(url);
  } catch {
    return null;
  }
}

function gatedEvidenceFreshness(
  probeData: unknown,
  baselines: Array<{ kind: string; discriminator: string; maxEvidenceAgeSeconds: number }>,
  ageMs: number
): EvidenceFreshness {
  const data = probeData as {
    check?: string;
    evidence?: { hostname?: string; port?: number; startUrl?: string; requestedUrl?: string };
  } | null;
  const match = (kind: string, discriminator: string | null, rejectFuture = false) => {
    if (!discriminator) return 'NOT_BASELINE_GATED' as const;
    const baseline = baselines.find(
      (candidate) => candidate.kind === kind && candidate.discriminator === discriminator
    );
    if (!baseline) return 'MISSING_BASELINE' as const;
    if (rejectFuture && ageMs < 0) return 'STALE' as const;
    return ageMs > baseline.maxEvidenceAgeSeconds * 1000
      ? ('STALE' as const)
      : ('CURRENT' as const);
  };
  if (data?.check === 'TLS_CERTIFICATE' && data.evidence?.hostname && data.evidence.port) {
    return match(
      'TLS_CERTIFICATE_REGRESSION',
      `${data.evidence.hostname}:${data.evidence.port}`.toLowerCase(),
      true
    );
  }
  if (data?.check === 'REDIRECT_TOPOLOGY') {
    return match('REDIRECT_TOPOLOGY_REGRESSION', httpDiscriminator(data.evidence?.startUrl), true);
  }
  if (data?.check === 'HOMEPAGE_INDEXABILITY') {
    return match(
      'HOMEPAGE_INDEXABILITY_REGRESSION',
      httpDiscriminator(data.evidence?.requestedUrl),
      true
    );
  }
  return 'NOT_BASELINE_GATED';
}

domainProfileRoutes.get('/:domain/profile', async (c) => {
  const tenantId = c.get('tenantId');
  const domain = await ownedDomain(c);
  if (!tenantId || !domain) return c.json({ error: 'Domain not found' }, 404);
  const profile = await new DomainProfileRepository(c.get('db')).findByDomainId(
    domain.id,
    tenantId
  );
  return c.json({
    domain: domain.normalizedName,
    profile,
    setup:
      !profile || profile.purpose === 'UNKNOWN'
        ? purposeUndeclaredUnknown('Domain evidence')
        : null,
  });
});

domainProfileRoutes.get('/:domain/evidence', async (c) => {
  const tenantId = c.get('tenantId');
  const domain = await ownedDomain(c);
  if (!tenantId || !domain) return c.json({ error: 'Domain not found' }, 404);
  const snapshots = await new SnapshotRepository(c.get('db')).findByDomain(domain.id, 1);
  if (!snapshots[0])
    return c.json({ domain: domain.normalizedName, snapshotId: null, evidence: [] });
  const probes = await new ProbeObservationRepository(c.get('db')).findBySnapshotId(
    snapshots[0].id
  );
  const baselines = await new OperationalBaselineRepository(c.get('db')).listActive(
    tenantId,
    domain.id
  );
  const now = Date.now();
  const evidence = probes
    .filter((probe) => ['rdap', 'tls_cert', 'http'].includes(probe.probeType))
    .map((probe) => {
      const gated = gatedEvidenceFreshness(
        probe.probeData,
        baselines,
        now - probe.probedAt.getTime()
      );
      return { ...probe, freshness: gated };
    });
  return c.json({
    domain: domain.normalizedName,
    snapshotId: snapshots[0].id,
    activeBaselineIds: baselines.map((baseline) => baseline.id),
    evidence,
  });
});

domainProfileRoutes.post('/:domain/baselines', requireWritePermission, async (c) => {
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const domain = await ownedDomain(c);
  if (!tenantId || !actorId || !domain) return c.json({ error: 'Domain not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const maxEvidenceAgeSeconds = body?.maxEvidenceAgeSeconds;
  if (
    !body ||
    typeof body.sourceSnapshotId !== 'string' ||
    typeof body.discriminator !== 'string' ||
    typeof maxEvidenceAgeSeconds !== 'number' ||
    !Number.isInteger(maxEvidenceAgeSeconds)
  ) {
    return c.json({ error: 'Invalid baseline request' }, 400);
  }
  let parsed: ReturnType<typeof parseSupportedOperationalBaseline>;
  try {
    parsed = parseSupportedOperationalBaseline({
      signalKind: body.signalKind,
      policy: body.policy,
      discriminator: body.discriminator,
    });
  } catch {
    return c.json({ error: 'Unsupported baseline policy' }, 400);
  }
  try {
    const baseline = await new OperationalBaselineRepository(c.get('db')).accept({
      tenantId,
      domainId: domain.id,
      kind: parsed.signalKind,
      discriminator: parsed.discriminator,
      sourceSnapshotId: body.sourceSnapshotId,
      policy: parsed.policy as never,
      maxEvidenceAgeSeconds,
      actorId,
      actorEmail: c.get('actorEmail') ?? null,
      ipAddress: getRequestClientIp(c) ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    });
    return c.json({ baseline }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Baseline acceptance failed' },
      400
    );
  }
});

domainProfileRoutes.put('/:domain/profile', requireWritePermission, async (c) => {
  const tenantId = c.get('tenantId');
  const actorId = c.get('actorId');
  const domain = await ownedDomain(c);
  if (!tenantId || !actorId || !domain) return c.json({ error: 'Domain not found' }, 404);
  const validation = await validateBody(c, {
    purpose: enumValue('purpose', DOMAIN_PURPOSES),
    criticality: enumValue('criticality', DOMAIN_CRITICALITIES),
    responsibleActorId: optionalString('responsibleActorId', { maxLength: 100 }),
  });
  if (!validation.success) return validationErrorResponse(c, validation.error);
  if (!validation.data.purpose || !validation.data.criticality) {
    return c.json({ error: 'Invalid profile values' }, 400);
  }
  const repo = new DomainProfileRepository(c.get('db'));
  const { purpose, criticality, responsibleActorId } = validation.data;
  const profile = await repo.setWithAudit(
    {
      domainId: domain.id,
      tenantId,
      purpose: purpose as (typeof DOMAIN_PURPOSES)[number],
      criticality: criticality as (typeof DOMAIN_CRITICALITIES)[number],
      responsibleActorId,
    },
    {
      actorId,
      actorEmail: c.get('actorEmail') ?? null,
      tenantId,
      ipAddress: getRequestClientIp(c) ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    }
  );
  return c.json({ profile });
});
