/**
 * Notification Routes Tests - PR-08.1
 */

import { promises as dnsPromises } from 'node:dns';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { installWebhookTransportMock } from './webhook.test-support.js';

const repos = vi.hoisted(() => ({
  findById: vi.fn(),
  claimPendingNotification: vi.fn(),
  completeNotificationClaim: vi.fn(),
  releaseNotificationClaim: vi.fn(),
  findMonitoredById: vi.fn(),
  findDomainById: vi.fn(),
}));

vi.mock('@dns-ops/db', () => ({
  AlertRepository: class {
    findById = repos.findById;
    claimPendingNotification = repos.claimPendingNotification;
    completeNotificationClaim = repos.completeNotificationClaim;
    releaseNotificationClaim = repos.releaseNotificationClaim;
  },
  MonitoredDomainRepository: class {
    findById = repos.findMonitoredById;
  },
  DomainRepository: class {
    findById = repos.findDomainById;
  },
}));

import { notificationRoutes } from './routes.js';

vi.mock('node:dns', () => ({
  promises: { lookup: vi.fn() },
}));

const mockLookup = dnsPromises.lookup as ReturnType<typeof vi.fn>;
const mockHttpsRequest = vi.hoisted(() => vi.fn());
const mockFetch = vi.fn();
vi.mock('node:https', () => ({ request: mockHttpsRequest }));

describe('Notification Routes', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('tenantId', 'tenant-1');
      c.set('db', {} as Env['Variables']['db']);
      await next();
    });
    app.route('/api/notify', notificationRoutes);
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockLookup.mockReset().mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockHttpsRequest.mockReset();
    installWebhookTransportMock(mockHttpsRequest, mockFetch);
    repos.findById.mockResolvedValue({
      id: 'alert-123',
      title: 'Test Alert',
      description: 'Test description',
      severity: 'high',
      tenantId: 'tenant-1',
      status: 'pending',
      monitoredDomainId: 'mon-1',
    });
    repos.claimPendingNotification.mockResolvedValue({
      token: 'claim-token',
      alert: { id: 'alert-123' },
    });
    repos.completeNotificationClaim.mockResolvedValue({ status: 'sent' });
    repos.findMonitoredById.mockResolvedValue({
      id: 'mon-1',
      domainId: 'dom-1',
      tenantId: 'tenant-1',
    });
    repos.findDomainById.mockResolvedValue({
      id: 'dom-1',
      tenantId: 'tenant-1',
      name: 'example.com',
      normalizedName: 'example.com',
    });
  });

  describe('POST /api/notify/webhook', () => {
    const validAlert = {
      id: 'alert-123',
      title: 'Test Alert',
      description: 'Test description',
      severity: 'high',
      domain: 'example.com',
      tenantId: 'tenant-1',
    };

    it('sends webhook successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com/alerts',
          alert: validAlert,
        }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
    });

    it('returns 400 if webhookUrl is missing', async () => {
      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert: validAlert }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Bad Request');
    });

    it('returns 400 if alert is missing', async () => {
      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: 'https://webhook.example.com' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Bad Request');
    });

    it('returns 400 if alert.id is missing', async () => {
      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com',
          alert: { title: 'x' },
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toContain('alert.id is required');
    });

    it('rejects a caller-supplied tenant that does not match context', async () => {
      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com/alerts',
          alert: { ...validAlert, tenantId: 'other-tenant' },
        }),
      });
      expect(response.status).toBe(403);
      expect(repos.findById).not.toHaveBeenCalled();
    });

    it('loads the tenant-owned alert instead of trusting body content', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      repos.findById.mockResolvedValueOnce({
        id: 'alert-123',
        title: 'Stored title',
        description: 'Stored description',
        severity: 'high',
        tenantId: 'tenant-1',
        status: 'pending',
        monitoredDomainId: 'mon-1',
      });
      await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com/alerts',
          alert: { ...validAlert, title: 'Forged title' },
        }),
      });
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('Stored title');
      expect(repos.findById).toHaveBeenCalledWith('alert-123', 'tenant-1');
    });

    it('uses the stored domain name and ignores a forged alert.domain', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com/alerts',
          alert: { ...validAlert, domain: 'evil.example' },
        }),
      });
      expect(response.status).toBe(200);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.domain).toBe('example.com');
      expect(callBody.domain360Link).toContain('/domain/example.com');
      expect(JSON.stringify(callBody)).not.toContain('evil.example');
    });

    it('returns 404 when monitored domain ownership is missing', async () => {
      repos.findMonitoredById.mockResolvedValueOnce(undefined);
      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com/alerts',
          alert: validAlert,
        }),
      });
      expect(response.status).toBe(404);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('blocks SSRF attempts', async () => {
      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'http://10.0.0.1/webhook',
          alert: validAlert,
        }),
      });

      expect(response.status).toBe(502);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('SSRF_BLOCKED');
    });

    it('handles webhook delivery failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com/alerts',
          alert: validAlert,
        }),
      });

      expect(response.status).toBe(502);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it('uses custom baseUrl for Domain360 link', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com/alerts',
          alert: validAlert,
          baseUrl: 'https://custom.example.com',
        }),
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.domain360Link).toBe('https://custom.example.com/domain/example.com');
    });
  });

  describe('GET /api/notify/health', () => {
    it('returns healthy status', async () => {
      const response = await app.request('/api/notify/health');

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe('healthy');
      expect(json.service).toBe('notification');
    });
  });
});
