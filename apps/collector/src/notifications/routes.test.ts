/**
 * Notification Routes Tests - PR-08.1
 */

import { promises as dnsPromises } from 'node:dns';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types.js';
import { notificationRoutes } from './routes.js';
import { installWebhookTransportMock } from './webhook.test-support.js';

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
    app.route('/api/notify', notificationRoutes);
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockLookup.mockReset().mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockHttpsRequest.mockReset();
    installWebhookTransportMock(mockHttpsRequest, mockFetch);
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

    it('returns 400 if alert fields are missing', async () => {
      const response = await app.request('/api/notify/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: 'https://webhook.example.com',
          alert: { id: 'alert-123' }, // Missing required fields
        }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toContain('title is required');
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
