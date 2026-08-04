/**
 * Mail Routes
 *
 * API endpoints for mail diagnostics and remediation workflows.
 */

import {
  AuditEventRepository,
  DomainRepository,
  RemediationRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { Hono } from 'hono';
import { getRequestEnvConfig } from '../config/env.js';
import { getFeedbackMetrics } from '../lib/metrics.js';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import { getWebLogger, trackMailCheck } from '../middleware/error-tracking.js';
import {
  domainName,
  email,
  enumValue,
  optionalArray,
  optionalString,
  uuid,
  validateBody,
  validationErrorResponse,
} from '../middleware/validation.js';
import type { Env } from '../types.js';

const REMEDIATION_STATUSES = ['open', 'in-progress', 'resolved', 'closed'] as const;
const REMEDIATION_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export const mailRoutes = new Hono<Env>()
  .post('/collect/mail', requireAuth, requireWritePermission, async (c) => {
    const validation = await validateBody(c, {
      domain: domainName('domain'),
      preferredProvider: enumValue(
        'preferredProvider',
        ['google', 'microsoft', 'zoho', 'other'] as const,
        false
      ),
      explicitSelectors: optionalArray<string>('explicitSelectors', (value, index) => {
        if (typeof value !== 'string' || value.length === 0) {
          throw new Error(`explicitSelectors[${index}] must be a non-empty string`);
        }
        if (value.length > 63) {
          throw new Error(`explicitSelectors[${index}] must be at most 63 characters`);
        }
        return value;
      }),
    });

    if (!validation.success) {
      return validationErrorResponse(c, validation.error);
    }

    const data = validation.data;
    const { collectorUrl, internalSecret } = getRequestEnvConfig(c.env);
    const tenantId = c.get('tenantId');
    const actorId = c.get('actorId');

    if (!tenantId || !actorId) {
      return c.json({ error: 'Authenticated tenant and actor required' }, 403);
    }

    if (!internalSecret) {
      return c.json({ error: 'Collector integration is not configured' }, 503);
    }

    try {
      const response = await fetch(`${collectorUrl}/api/collect/mail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': internalSecret,
          'X-Tenant-Id': tenantId,
          'X-Actor-Id': actorId,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        return c.json(
          { error: error.message || error.error || 'Collector error' },
          response.status
        );
      }

      const result = await response.json();

      trackMailCheck({
        tenantId,
        domain: data.domain as string,
        checkType: 'all',
        success: true,
        durationMs: undefined,
      });

      return c.json(result);
    } catch (error) {
      trackMailCheck({
        tenantId,
        domain: data.domain as string,
        checkType: 'all',
        success: false,
      });
      const logger = getWebLogger();
      logger.error(
        'Collector connection error',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId: c.req.header('X-Request-ID'),
          path: '/api/mail/collect/mail',
          method: 'POST',
          tenantId,
          domain: data.domain,
        }
      );
      return c.json({ error: 'Failed to connect to collector service' }, 503);
    }
  })
  .post('/remediation', requireAuth, requireWritePermission, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');
    const actorId = c.get('actorId');

    if (!db || !tenantId || !actorId) {
      return c.json({ error: 'Database, tenant, and actor context required' }, 503);
    }

    const validation = await validateBody(c, {
      domain: domainName('domain'),
      snapshotId: uuid('snapshotId', false),
      contactEmail: email('contactEmail'),
      contactName: optionalString('contactName', { minLength: 2, maxLength: 100 }),
      contactPhone: optionalString('contactPhone', {
        minLength: 8,
        maxLength: 20,
        pattern: /^\+?[\d\s-]{8,20}$/,
        patternMessage: 'contactPhone must be a valid phone number',
      }),
      issues: optionalArray<string>('issues', (value, index) => {
        if (typeof value !== 'string' || value.length === 0) {
          throw new Error(`issues[${index}] must be a non-empty string`);
        }
        return value;
      }),
      priority: enumValue('priority', REMEDIATION_PRIORITIES, false),
      notes: optionalString('notes', { maxLength: 5000 }),
    });

    if (!validation.success) {
      return validationErrorResponse(c, validation.error);
    }

    const { contactEmail, contactName, contactPhone, domain, issues, notes, priority, snapshotId } =
      validation.data;

    if (!domain) {
      return c.json({ error: 'domain is required' }, 400);
    }

    if (!contactEmail) {
      return c.json({ error: 'contactEmail is required' }, 400);
    }

    if (!contactName) {
      return c.json({ error: 'contactName is required' }, 400);
    }

    if (!issues || issues.length === 0) {
      return c.json({ error: 'issues must include at least one item' }, 400);
    }

    const remediationRepo = new RemediationRepository(db);
    const auditRepo = new AuditEventRepository(db);

    const remediation = await remediationRepo.create({
      tenantId,
      createdBy: actorId,
      domain,
      snapshotId,
      contactEmail,
      contactName,
      contactPhone,
      issues,
      priority: priority ?? 'medium',
      notes,
      status: 'open',
    });

    await auditRepo.create({
      action: 'remediation_request_created',
      entityType: 'remediation_request',
      entityId: remediation.id,
      actorId,
      tenantId,
      newValue: {
        domain,
        issues,
        priority: remediation.priority,
        status: remediation.status,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    getFeedbackMetrics().remediation.created({
      tenantId,
      domainId: domain,
      type: issues?.join(',') ?? 'unknown',
      priority: remediation.priority,
    });

    return c.json({ remediation }, 201);
  })
  .get('/remediation', requireAuth, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');

    if (!db || !tenantId) {
      return c.json({ error: 'Database or tenant context unavailable' }, 503);
    }

    const status = c.req.query('status');
    const priority = c.req.query('priority');
    const domain = c.req.query('domain');

    if (status && !REMEDIATION_STATUSES.includes(status as (typeof REMEDIATION_STATUSES)[number])) {
      return c.json({ error: 'Invalid remediation status filter' }, 400);
    }

    if (
      priority &&
      !REMEDIATION_PRIORITIES.includes(priority as (typeof REMEDIATION_PRIORITIES)[number])
    ) {
      return c.json({ error: 'Invalid remediation priority filter' }, 400);
    }

    const remediationRepo = new RemediationRepository(db);
    const remediation = await remediationRepo.list(tenantId, {
      domains: domain ? [domain] : undefined,
      statuses: status ? [status as (typeof REMEDIATION_STATUSES)[number]] : undefined,
      priorities: priority ? [priority as (typeof REMEDIATION_PRIORITIES)[number]] : undefined,
    });

    return c.json({ remediation });
  })
  .get('/remediation/stats', requireAuth, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');

    if (!db || !tenantId) {
      return c.json({ error: 'Database or tenant context unavailable' }, 503);
    }

    const remediationRepo = new RemediationRepository(db);
    const counts = await remediationRepo.countByStatus(tenantId);
    return c.json({ counts });
  })
  .get('/remediation/by-id/:id', requireAuth, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');
    const id = c.req.param('id');

    if (!db || !tenantId) {
      return c.json({ error: 'Database or tenant context unavailable' }, 503);
    }

    const remediationRepo = new RemediationRepository(db);
    const remediation = await remediationRepo.findById(id, tenantId);

    if (!remediation) {
      return c.json({ error: 'Remediation request not found' }, 404);
    }

    return c.json({ remediation });
  })
  .get('/remediation/domain/:domain', requireAuth, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');
    const domain = c.req.param('domain');

    if (!db || !tenantId) {
      return c.json({ error: 'Database or tenant context unavailable' }, 503);
    }

    const remediationRepo = new RemediationRepository(db);
    const remediation = await remediationRepo.findByDomain(domain, tenantId);
    return c.json({ remediation });
  })
  .patch('/remediation/:id', requireAuth, requireWritePermission, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');
    const actorId = c.get('actorId');
    const id = c.req.param('id');

    if (!db || !tenantId || !actorId) {
      return c.json({ error: 'Database, tenant, and actor context required' }, 503);
    }

    const validation = await validateBody(c, {
      status: enumValue('status', REMEDIATION_STATUSES, false),
      assignedTo: optionalString('assignedTo', { maxLength: 100 }),
      notes: optionalString('notes', { maxLength: 5000 }),
      verificationSnapshotId: uuid('verificationSnapshotId', false),
    });

    if (!validation.success) {
      return validationErrorResponse(c, validation.error);
    }

    const existingRepo = new RemediationRepository(db);
    const existing = await existingRepo.findById(id, tenantId);
    if (!existing) {
      return c.json({ error: 'Remediation request not found' }, 404);
    }

    const status = validation.data.status ?? existing.status;
    const isClosing = status === 'resolved' || status === 'closed';
    let verificationSnapshotId: string | undefined;

    if (isClosing && status !== existing.status) {
      verificationSnapshotId = validation.data.verificationSnapshotId;
      if (!verificationSnapshotId) {
        return c.json(
          {
            error: 'A fresh complete snapshot is required to resolve or close remediation work',
            code: 'FRESH_EVIDENCE_REQUIRED',
          },
          409
        );
      }

      const snapshot = await new SnapshotRepository(db).findById(verificationSnapshotId);
      if (!snapshot || snapshot.domainName.toLowerCase() !== existing.domain.toLowerCase()) {
        return c.json(
          {
            error: 'Verification snapshot does not match this remediation domain',
            code: 'INVALID_EVIDENCE',
          },
          409
        );
      }
      const snapshotDomain = await new DomainRepository(db).findById(snapshot.domainId);
      if (!snapshotDomain || snapshotDomain.tenantId !== tenantId) {
        return c.json({ error: 'Verification snapshot not found', code: 'INVALID_EVIDENCE' }, 404);
      }
      const evaluation = snapshot.metadata?.evaluation;
      const activeLifecycleStartedAt = existing.updatedAt ?? existing.createdAt;
      if (
        snapshot.createdAt <= activeLifecycleStartedAt ||
        snapshot.resultState !== 'complete' ||
        evaluation?.state !== 'COMPLETE'
      ) {
        return c.json(
          {
            error:
              'Verification snapshot must be newer than the request and have complete evaluation coverage',
            code: 'FRESH_EVIDENCE_REQUIRED',
          },
          409
        );
      }
    }

    const remediation = await existingRepo.updateStatus(id, tenantId, status, {
      assignedTo: validation.data.assignedTo,
      notes: validation.data.notes,
    });

    if (!remediation) {
      return c.json({ error: 'Remediation request not found' }, 404);
    }

    const auditRepo = new AuditEventRepository(db);
    await auditRepo.create({
      action: 'remediation_request_updated',
      entityType: 'remediation_request',
      entityId: remediation.id,
      actorId,
      tenantId,
      previousValue: {
        status: existing.status,
        assignedTo: existing.assignedTo,
        notes: existing.notes,
      },
      newValue: {
        status: remediation.status,
        assignedTo: remediation.assignedTo,
        notes: remediation.notes,
        verificationSnapshotId,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    // Emit metric for status transitions
    if (remediation.status !== existing.status) {
      const metricsStatus = remediation.status as string;
      if (metricsStatus === 'resolved' || metricsStatus === 'closed') {
        const durationMs = existing.createdAt
          ? Date.now() - new Date(existing.createdAt).getTime()
          : 0;
        getFeedbackMetrics().remediation.completed({
          tenantId,
          domainId: existing.domain,
          type: (existing.issues as string[])?.join(',') ?? 'unknown',
          durationMs,
        });
      } else if (metricsStatus === 'in-progress') {
        getFeedbackMetrics().remediation.started({
          tenantId,
          domainId: existing.domain,
          type: (existing.issues as string[])?.join(',') ?? 'unknown',
        });
      }
    }

    return c.json({ remediation });
  });
