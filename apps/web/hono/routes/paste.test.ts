import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import { pasteRoutes } from './paste.js';

function createApp() {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Env['Variables']['db']);
    c.set('tenantId', 'tenant-1');
    c.set('actorId', 'actor-1');
    c.set('actorEmail', 'actor-1@example.test');
    await next();
  });
  app.route('/api/paste', pasteRoutes);
  return app;
}

const DIG_SPF_OK = `; <<>> DiG 9.18.1 <<>> example.com TXT
;; ->>HEADER<<- opcode: QUERY, status: NOERROR
;; ANSWER SECTION:
example.com.		300	IN	TXT	"v=spf1 -all"

;; MSG SIZE  rcvd: 48`;

const BOUNCE = `Received: from mail.example.net (mail.example.net. [203.0.113.9]) by mx.example.org with SMTP
Authentication-Results: mx.example.org; spf=none smtp.mailfrom=example.com; dmarc=pass header.from=example.com`;

async function post(app: Hono<Env>, body: Record<string, unknown>) {
  const res = await app.request('/api/paste/findings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('POST /api/paste/findings', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = createApp();
  });

  it('evaluates pasted dig output through the snapshot ruleset without persisting', async () => {
    const { status, body } = await post(app, { domain: 'example.com', content: DIG_SPF_OK });

    expect(status).toBe(200);
    expect(body.collected).toBe(false);
    expect(body.evidenceSource).toBe('pasted');
    expect(body.kind).toBe('dig');
    expect(body.rulesEvaluated).toBeGreaterThan(0);
    expect(body.evaluationCoverage).toEqual({ state: 'COMPLETE', errors: [] });
    const findings = body.findings as Array<Record<string, unknown>>;
    const types = findings.map((f) => f.type);
    expect(types).toContain('mail.spf-present');
    // Parity with snapshot evaluation: the same observation set would produce
    // the same absence findings (no MX / no DMARC were pasted).
    expect(types).toContain('mail.no-mx-record');
    const spf = findings.find((f) => f.type === 'mail.spf-present');
    expect(['info', 'medium']).toContain(spf?.severity);
  });

  it('maps pasted bounce headers to the same finding vocabulary', async () => {
    const { status, body } = await post(app, { domain: 'example.com', content: BOUNCE });

    expect(status).toBe(200);
    expect(body.collected).toBe(false);
    expect(body.kind).toBe('bounce-header');
    const findings = body.findings as Array<Record<string, unknown>>;
    expect(findings.map((f) => f.type)).toEqual(['mail.no-spf-record', 'mail.dmarc-present']);
    expect((body.parse as Record<string, unknown>).receivedHosts).toEqual(['mail.example.net']);
  });

  it('rejects unrecognizable pastes with 422', async () => {
    const { status, body } = await post(app, {
      domain: 'example.com',
      content: 'random prose without structure',
    });
    expect(status).toBe(422);
    expect(String(body.error)).toMatch(/dig output or an RFC5322 header block/);
  });

  it('validates required fields', async () => {
    const missingDomain = await post(app, { content: DIG_SPF_OK });
    expect(missingDomain.status).toBe(400);

    const blankContent = await post(app, { domain: 'example.com', content: '' });
    expect(blankContent.status).toBe(400);
  });
});
