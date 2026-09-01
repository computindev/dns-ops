/** Webhook delivery tests for the pinned native HTTPS transport. */

import { promises as dnsPromises } from 'node:dns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWebhookPayload, isPrivateUrl, sendAlertWebhook } from './webhook.js';
import { installWebhookTransportMock, type WebhookTransportState } from './webhook.test-support.js';

const mockLookup = dnsPromises.lookup as ReturnType<typeof vi.fn>;
const mockHttpsRequest = vi.hoisted(() => vi.fn());
vi.mock('node:dns', () => ({
  promises: { lookup: vi.fn() },
}));
vi.mock('node:https', () => ({ request: mockHttpsRequest }));

const payload = {
  alertId: 'alert-123',
  title: 'Test',
  description: 'desc',
  severity: 'high' as const,
  domain: 'example.com',
  tenantId: 'tenant-1',
  timestamp: new Date().toISOString(),
  domain360Link: 'https://app.example.com/domain/example.com',
};

let transport: WebhookTransportState;

beforeEach(() => {
  mockLookup.mockReset().mockResolvedValue({ address: '93.184.216.34', family: 4 });
  mockHttpsRequest.mockReset();
  transport = installWebhookTransportMock(mockHttpsRequest);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Webhook URL validation', () => {
  it('blocks private and localhost URLs', () => {
    expect(isPrivateUrl('http://10.0.0.1:8080')).toBe(true);
    expect(isPrivateUrl('http://localhost:8080')).toBe(true);
    expect(isPrivateUrl('http://127.0.0.1:8080')).toBe(true);
  });

  it('allows a syntactically public HTTPS URL before DNS resolution', () => {
    expect(isPrivateUrl('https://webhook.example.com/alerts')).toBe(false);
  });
});

describe('Pinned webhook delivery', () => {
  it('pins the checked public IPv4 while preserving method, body, headers, Host, SNI, and TLS validation', async () => {
    const result = await sendAlertWebhook('https://webhook.example.com:8443/alerts?x=1', payload);

    expect(result).toMatchObject({
      success: true,
      statusCode: 200,
      resolvedHostname: 'webhook.example.com',
    });
    expect(mockLookup).toHaveBeenCalledWith('webhook.example.com', { family: 4 });

    const request = transport.requests[0];
    expect(request?.options).toMatchObject({
      protocol: 'https:',
      hostname: '93.184.216.34',
      port: 8443,
      path: '/alerts?x=1',
      method: 'POST',
      agent: false,
      servername: 'webhook.example.com',
      rejectUnauthorized: true,
      headers: {
        Host: 'webhook.example.com:8443',
        'Content-Type': 'application/json',
        'User-Agent': 'dns-ops-collector/1.0 webhook-notifier',
      },
    });
    expect(JSON.parse(request?.body ?? '')).toEqual(payload);

    const lookup = request?.options.lookup as
      | ((
          hostname: string,
          options: { family?: number },
          callback: (...args: unknown[]) => void
        ) => void)
      | undefined;
    const callback = vi.fn();
    lookup?.('93.184.216.34', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });

  it('fails closed on DNS errors without opening an HTTPS request', async () => {
    mockLookup.mockRejectedValueOnce(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));

    const result = await sendAlertWebhook('https://missing.example.com/alerts', payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOTFOUND');
    expect(transport.requests).toHaveLength(0);
  });

  it.each([
    '127.0.0.1',
    'fec0::1',
    '2606:4700:4700::1111',
    '::ffff:93.184.216.34',
  ])('fails closed when DNS returns non-public or IPv6 address %s', async (address) => {
    mockLookup.mockResolvedValueOnce({ address, family: address.includes(':') ? 6 : 4 });

    const result = await sendAlertWebhook('https://webhook.example.com/alerts', payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain(address);
    expect(transport.requests).toHaveLength(0);
  });

  it('rejects redirects without following Location', async () => {
    transport.plan = { statusCode: 301, headers: { location: 'http://127.0.0.1/' } };

    const result = await sendAlertWebhook('https://webhook.example.com/alerts', payload);

    expect(result).toMatchObject({ success: false, error: 'HTTP redirect 301 is not allowed' });
    expect(transport.requests).toHaveLength(1);
    expect(transport.responses[0]?.destroyed).toBe(true);
  });

  it('bounds declared and streamed response bodies', async () => {
    transport.plan = { statusCode: 200, headers: { 'content-length': '65537' } };
    const declared = await sendAlertWebhook('https://webhook.example.com/alerts', payload);
    expect(declared.success).toBe(false);
    expect(declared.error).toContain('Content-Length');

    transport.plan = { statusCode: 200, body: 'x'.repeat(65537) };
    const streamed = await sendAlertWebhook('https://webhook.example.com/alerts', payload);
    expect(streamed.success).toBe(false);
    expect(streamed.error).toContain('body exceeds');
  });

  it('enforces one cumulative timeout across DNS, connection, and body consumption', async () => {
    vi.useFakeTimers();
    transport.plan = { stall: true };
    const promise = sendAlertWebhook('https://slow.example.com/alerts', payload);

    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toMatchObject({ success: false, error: 'TIMEOUT' });
    expect(transport.requests[0]?.destroyed).toBe(true);
  });

  it('requires HTTPS for outbound webhook delivery', async () => {
    const result = await sendAlertWebhook('http://webhook.example.com/alerts', payload);

    expect(result).toMatchObject({ success: false, error: 'HTTPS_REQUIRED' });
    expect(transport.requests).toHaveLength(0);
  });
});

describe('buildWebhookPayload', () => {
  it('builds the expected payload and default link', () => {
    const built = buildWebhookPayload({
      id: 'a1',
      title: 'Test',
      severity: 'high',
      domain: 'ex.com',
      tenantId: 't1',
    });

    expect(built).toMatchObject({
      alertId: 'a1',
      description: '',
      domain360Link: 'https://app.dns-ops.example.com/domain/ex.com',
    });
  });
});
