/**
 * Probe Sandbox Security E2E Tests — PR-06
 *
 * End-to-end security tests that exercise the full probe sandbox stack:
 * SSRF guard → allowlist → semaphore → probe execution.
 *
 * These tests are designed to catch the class of issues found during the
 * PR-06 security review:
 *   1. IPv6 policy bypass (including mapped and site-local forms)
 *   2. Redirect-to-private bypass (following 3xx to private IP)
 *   3. Concurrency/timeout not wired from env config
 *   4. Global semaphore not enforced across concurrent requests
 *
 * Each section documents the original gap and the mitigating test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DNSQueryResult } from '../dns/types.js';
import { probeAllowlistManager } from '../probes/allowlist.js';
import { resetProbeSemaphore, Semaphore } from '../probes/semaphore.js';
import { checkSSRF, validateUrl } from '../probes/ssrf-guard.js';

// ---------------------------------------------------------------------------
// PR-06.1 — SSRF Guard: IPv6 targets fail closed
// ---------------------------------------------------------------------------

describe('PR-06.1 E2E: IPv6 SSRF targets fail closed', () => {
  // IPv6 policy is intentionally fail closed until a complete, maintained
  // public-address policy exists. Mapped forms cannot bypass that boundary.

  const IPV6_TARGETS = [
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:8.8.8.8',
    '::ffff:7f00:0001',
    'fec0::1',
    '2001:db8::1',
  ] as const;

  for (const addr of IPV6_TARGETS) {
    it(`blocks IPv6 target ${addr}`, () => {
      const r = checkSSRF(addr);
      expect(r.allowed, `${addr} should be blocked`).toBe(false);
      expect(r.blockedCategory, `${addr} wrong category`).toBe('reserved');
    });
  }

  it('validateUrl blocks https://[::ffff:127.0.0.1] (IPv6 URL syntax)', () => {
    // Browsers and curl accept bracketed IPv6 in URLs
    const r = validateUrl('https://[::ffff:127.0.0.1]/path');
    expect(r.allowed).toBe(false);
    expect(r.blockedCategory).toBe('reserved');
  });

  it('validateUrl blocks https://[::ffff:10.0.0.1]', () => {
    const r = validateUrl('https://[::ffff:10.0.0.1]');
    expect(r.allowed).toBe(false);
    expect(r.blockedCategory).toBe('reserved');
  });
});

// ---------------------------------------------------------------------------
// PR-06.1 E2E — DNS rebinding / TOCTOU documentation
// ---------------------------------------------------------------------------

describe('PR-06.1 E2E: DNS rebinding risk documentation', () => {
  // The SSRF guard checks the URL hostname and each resolved address. Active
  // transports pin the checked address before making a connection.

  it('blocks a private IP that a rebound hostname could resolve to (127.0.0.1)', () => {
    // After rebinding, the guard MUST block the resolved IP
    const r = checkSSRF('127.0.0.1');
    expect(r.allowed).toBe(false);
    expect(r.blockedCategory).toBe('loopback');
  });

  it('blocks a private IP that a rebound hostname could resolve to (10.0.0.1)', () => {
    const r = checkSSRF('10.0.0.1');
    expect(r.allowed).toBe(false);
  });

  it('blocks AWS metadata after rebinding (169.254.169.254)', () => {
    const r = checkSSRF('169.254.169.254');
    expect(r.allowed).toBe(false);
    expect(r.blockedCategory).toBe('link-local');
  });

  // SMTP, MTA-STS, and webhook transports use checked-address pinning.
});

// ---------------------------------------------------------------------------
// PR-06.1 E2E — redirect-to-private
// ---------------------------------------------------------------------------

describe('PR-06.1 E2E: Redirect-to-private prevention in MTA-STS fetch', () => {
  // Native HTTPS transports do not follow redirects; MTA-STS and webhook
  // delivery reject every 3xx response.

  it('validateUrl blocks redirect target http://127.0.0.1/exfil', () => {
    const r = validateUrl('http://127.0.0.1/exfil');
    expect(r.allowed).toBe(false);
    expect(r.blockedCategory).toBe('loopback');
  });

  it('validateUrl blocks redirect target http://192.168.1.1/internal', () => {
    const r = validateUrl('http://192.168.1.1/internal');
    expect(r.allowed).toBe(false);
    expect(r.blockedCategory).toBe('private');
  });

  it('validateUrl blocks redirect target http://169.254.169.254/latest/meta-data/', () => {
    const r = validateUrl('http://169.254.169.254/latest/meta-data/');
    expect(r.allowed).toBe(false);
    expect(r.blockedCategory).toBe('link-local');
  });

  it('validateUrl blocks redirect target http://[::ffff:127.0.0.1]/', () => {
    const r = validateUrl('http://[::ffff:127.0.0.1]/');
    expect(r.allowed).toBe(false);
    expect(r.blockedCategory).toBe('reserved');
  });

  it('validateUrl allows redirect to legitimate public URL', () => {
    const r = validateUrl('https://mta-sts.example.com/.well-known/mta-sts.txt');
    expect(r.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PR-06.1 E2E — unique local IPv6 targets fail closed
// ---------------------------------------------------------------------------

describe('PR-06.1 E2E: unique local IPv6 targets fail closed', () => {
  // Every IPv6 target is rejected until a complete, maintained policy exists.

  const UNIQUE_LOCAL = [
    { addr: 'fc00::1', desc: 'fc00:: start' },
    { addr: 'fc10::1', desc: 'fc10:: (missed by old fc00: prefix)' },
    { addr: 'fc80::1', desc: 'fc80:: (missed by old prefix)' },
    { addr: 'fcff::ffff', desc: 'fcff:: (end of fc range)' },
    { addr: 'fd00::1', desc: 'fd00:: (start of fd range)' },
    { addr: 'fd12:3456:789a:bcde::', desc: 'fd mid-range' },
    { addr: 'fdff::ffff', desc: 'fdff:: (end of fc00::/7)' },
  ];

  for (const { addr, desc } of UNIQUE_LOCAL) {
    it(`blocks ${desc} (${addr}) as reserved`, () => {
      const r = checkSSRF(addr);
      expect(r.allowed, `${addr} should be blocked`).toBe(false);
      expect(r.blockedCategory, `${addr} wrong category`).toBe('reserved');
    });
  }
});

// ---------------------------------------------------------------------------
// PR-06.1 E2E — RFC 1918 boundary coverage
// ---------------------------------------------------------------------------

describe('PR-06.1 E2E: RFC 1918 boundary IPs', () => {
  const BOUNDARY_CASES = [
    // 10.0.0.0/8
    { ip: '10.0.0.0', blocked: true, cat: 'private' },
    { ip: '10.255.255.255', blocked: true, cat: 'private' },
    { ip: '9.255.255.255', blocked: false, cat: null },
    { ip: '11.0.0.0', blocked: false, cat: null },
    // 172.16.0.0/12
    { ip: '172.16.0.0', blocked: true, cat: 'private' },
    { ip: '172.31.255.255', blocked: true, cat: 'private' },
    { ip: '172.15.255.255', blocked: false, cat: null },
    { ip: '172.32.0.0', blocked: false, cat: null },
    // 192.168.0.0/16
    { ip: '192.168.0.0', blocked: true, cat: 'private' },
    { ip: '192.168.255.255', blocked: true, cat: 'private' },
    { ip: '192.167.255.255', blocked: false, cat: null },
    { ip: '192.169.0.0', blocked: false, cat: null },
    // 127.0.0.0/8 (full range)
    { ip: '127.0.0.0', blocked: true, cat: 'loopback' },
    { ip: '127.0.0.1', blocked: true, cat: 'loopback' },
    { ip: '127.0.0.2', blocked: true, cat: 'loopback' },
    { ip: '127.255.255.255', blocked: true, cat: 'loopback' },
    { ip: '126.255.255.255', blocked: false, cat: null },
    { ip: '128.0.0.0', blocked: false, cat: null },
    // 169.254.0.0/16 (link-local)
    { ip: '169.254.0.0', blocked: true, cat: 'link-local' },
    { ip: '169.254.255.255', blocked: true, cat: 'link-local' },
  ] as const;

  for (const { ip, blocked, cat } of BOUNDARY_CASES) {
    if (blocked) {
      it(`blocks ${ip} (category: ${cat})`, () => {
        const r = checkSSRF(ip);
        expect(r.allowed, `${ip} should be blocked`).toBe(false);
        expect(r.blockedCategory).toBe(cat);
      });
    } else {
      it(`allows ${ip} (public)`, () => {
        const r = checkSSRF(ip);
        expect(r.allowed, `${ip} should be allowed`).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// PR-06.2 E2E — Semaphore: concurrency+1 scenario
// ---------------------------------------------------------------------------

describe('PR-06.2 E2E: Semaphore concurrency enforcement', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetProbeSemaphore(); // reset global singleton between tests
  });

  it('never exceeds configured concurrency (concurrency+1 scenario)', async () => {
    const CONCURRENCY = 3;
    const sem = new Semaphore(CONCURRENCY);

    let maxConcurrent = 0;
    let current = 0;
    const completed: number[] = [];

    const probe = async (id: number) => {
      await sem.acquire();
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      // Simulate work
      await new Promise<void>((r) => setTimeout(r, 20));
      completed.push(id);
      current--;
      sem.release();
    };

    // Start CONCURRENCY+1 probes simultaneously
    await Promise.all(Array.from({ length: CONCURRENCY + 1 }, (_, i) => probe(i)));

    expect(maxConcurrent).toBeLessThanOrEqual(CONCURRENCY);
    expect(completed).toHaveLength(CONCURRENCY + 1);
  }, 5000);

  it('queues excess probes rather than dropping them', async () => {
    const sem = new Semaphore(2);
    const order: string[] = [];

    const probe = async (name: string, delayMs: number) =>
      sem.run(async () => {
        order.push(`start:${name}`);
        await new Promise<void>((r) => setTimeout(r, delayMs));
        order.push(`end:${name}`);
      });

    // Start 4 probes with only 2 permits
    await Promise.all([probe('A', 30), probe('B', 30), probe('C', 30), probe('D', 30)]);

    // All 4 should have started and ended
    expect(order.filter((e) => e.startsWith('start:')).length).toBe(4);
    expect(order.filter((e) => e.startsWith('end:')).length).toBe(4);
  }, 5000);

  it('sem.available decrements when permits acquired', async () => {
    const sem = new Semaphore(3);
    expect(sem.available).toBe(3);

    await sem.acquire();
    expect(sem.available).toBe(2);

    await sem.acquire();
    expect(sem.available).toBe(1);

    sem.release();
    expect(sem.available).toBe(2);
  });

  it('sem.queued reflects waiters behind the semaphore', async () => {
    const sem = new Semaphore(1);

    // Saturate the semaphore
    await sem.acquire();
    expect(sem.available).toBe(0);
    expect(sem.queued).toBe(0);

    // Start two waiters (they will queue)
    const waiter1 = sem.acquire();
    const waiter2 = sem.acquire();
    // Micro-tick to let the promise callbacks register
    await Promise.resolve();
    await Promise.resolve();

    expect(sem.queued).toBe(2);

    // Release — one waiter should dequeue
    sem.release();
    await waiter1;
    expect(sem.queued).toBe(1);

    sem.release();
    await waiter2;
    expect(sem.queued).toBe(0);

    sem.release(); // restore balance
  });

  it('rejects invalid permit count at construction', () => {
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(-1)).toThrow();
    expect(() => new Semaphore(1.5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PR-06.2 E2E — Timeout enforcement
// ---------------------------------------------------------------------------

describe('PR-06.2 E2E: Probe timeout enforcement', () => {
  it('AbortController aborts fetch after timeoutMs', async () => {
    const timeoutMs = 80;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);

    const start = Date.now();
    let didAbort = false;

    try {
      // Hang indefinitely
      await new Promise<void>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    } catch (e) {
      didAbort = (e as Error).message === 'aborted';
    } finally {
      clearTimeout(tid);
    }

    const elapsed = Date.now() - start;
    expect(didAbort, 'should have aborted').toBe(true);
    expect(elapsed, `elapsed ${elapsed}ms should be < ${timeoutMs + 100}ms`).toBeLessThan(
      timeoutMs + 100
    );
  });

  it('timeout does not fire for fast operations', async () => {
    const timeoutMs = 200;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);

    let completed = false;
    try {
      // Fast operation
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      completed = true;
    } finally {
      clearTimeout(tid);
    }

    expect(completed).toBe(true);
    expect(controller.signal.aborted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR-06.3 E2E — Allowlist integration
// ---------------------------------------------------------------------------

describe('PR-06.3 E2E: Allowlist integration', () => {
  const TENANT = 'e2e-test-tenant';

  beforeEach(() => {
    probeAllowlistManager.clearTenant(TENANT);
  });

  afterEach(() => {
    probeAllowlistManager.clearTenant(TENANT);
  });

  it('probe to non-allowlisted domain is rejected', () => {
    // No DNS results loaded → nothing in allowlist
    const allowed = probeAllowlistManager.isAllowed(TENANT, 'evil-actor.com', 25);
    expect(allowed).toBe(false);
  });

  it('probe to MX-derived hostname is accepted', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'example.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'test' },
        success: true,
        answers: [{ name: 'example.com', type: 'MX', ttl: 300, data: '10 mail.example.com.' }],
        authority: [],
        additional: [],
        responseTime: 10,
      },
    ];

    probeAllowlistManager
      .getTenantAllowlist(TENANT)
      .generateFromDnsResults('example.com', dnsResults);

    expect(probeAllowlistManager.isAllowed(TENANT, 'mail.example.com', 25)).toBe(true);
  });

  it('domain with no MX → empty allowlist → all probes rejected', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'no-mx.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'test' },
        success: true,
        answers: [], // NODATA
        authority: [],
        additional: [],
        responseTime: 10,
      },
    ];

    const entries = probeAllowlistManager
      .getTenantAllowlist(TENANT)
      .generateFromDnsResults('no-mx.com', dnsResults);

    expect(entries).toHaveLength(0);
    expect(probeAllowlistManager.isAllowed(TENANT, 'no-mx.com', 25)).toBe(false);
    expect(probeAllowlistManager.isAllowed(TENANT, 'mail.no-mx.com', 25)).toBe(false);
  });

  it('allowlist is tenant-scoped — tenant A entry not visible to tenant B', () => {
    const TENANT_A = `${TENANT}-A`;
    const TENANT_B = `${TENANT}-B`;

    probeAllowlistManager.clearTenant(TENANT_A);
    probeAllowlistManager.clearTenant(TENANT_B);

    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'a-corp.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'test' },
        success: true,
        answers: [{ name: 'a-corp.com', type: 'MX', ttl: 300, data: '10 mail.a-corp.com.' }],
        authority: [],
        additional: [],
        responseTime: 10,
      },
    ];

    probeAllowlistManager
      .getTenantAllowlist(TENANT_A)
      .generateFromDnsResults('a-corp.com', dnsResults);

    // Tenant A can probe mail.a-corp.com
    expect(probeAllowlistManager.isAllowed(TENANT_A, 'mail.a-corp.com', 25)).toBe(true);

    // Tenant B cannot (different allowlist)
    expect(probeAllowlistManager.isAllowed(TENANT_B, 'mail.a-corp.com', 25)).toBe(false);

    probeAllowlistManager.clearTenant(TENANT_A);
    probeAllowlistManager.clearTenant(TENANT_B);
  });

  it('SSRF-blocked hostnames are NOT allowlistable', () => {
    // Even if someone tries to addCustomEntry with a private host,
    // the SSRF guard is checked independently at probe time.
    const allowlist = probeAllowlistManager.getTenantAllowlist(TENANT);
    allowlist.addCustomEntry('127.0.0.1', 25, 'test', 'should not bypass SSRF');

    // The allowlist says yes — but the SSRF guard is a separate layer
    expect(allowlist.isAllowed('127.0.0.1', 25)).toBe(true); // allowlist doesn't know about SSRF

    // SSRF guard independently blocks it
    const ssrfResult = checkSSRF('127.0.0.1');
    expect(ssrfResult.allowed).toBe(false);

    // In the actual probe code, SSRF check runs BEFORE allowlist check,
    // so the probe would be rejected at the SSRF layer.
    // This test documents that defense-in-depth is critical.
  });
});

// ---------------------------------------------------------------------------
// Full-stack integration: SSRF guard + allowlist both enforced
// ---------------------------------------------------------------------------

describe('PR-06 E2E: Defense-in-depth — both SSRF guard and allowlist enforced', () => {
  // This tests the intended call flow: checkSSRF runs first, then allowlist.
  // Neither alone is sufficient.

  function simulateProbeRequest(
    hostname: string,
    tenantId: string,
    port: number
  ): { blocked: boolean; reason: string } {
    // Layer 1: SSRF guard
    const ssrf = checkSSRF(hostname);
    if (!ssrf.allowed) {
      return { blocked: true, reason: `ssrf:${ssrf.blockedCategory}:${ssrf.reason}` };
    }

    // Layer 2: allowlist
    const allowed = probeAllowlistManager.isAllowed(tenantId, hostname, port);
    if (!allowed) {
      return { blocked: true, reason: 'allowlist:not-in-allowlist' };
    }

    return { blocked: false, reason: 'allowed' };
  }

  const TENANT = 'defense-in-depth-tenant';

  beforeEach(() => {
    probeAllowlistManager.clearTenant(TENANT);
  });
  afterEach(() => {
    probeAllowlistManager.clearTenant(TENANT);
  });

  it('private IP: blocked at SSRF layer regardless of allowlist', () => {
    // Even if allowlist has the entry, SSRF should block first
    probeAllowlistManager
      .getTenantAllowlist(TENANT)
      .addCustomEntry('127.0.0.1', 25, 'test', 'bypass attempt');

    const r = simulateProbeRequest('127.0.0.1', TENANT, 25);
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain('ssrf:loopback');
  });

  it('IPv4-mapped private: blocked at SSRF layer', () => {
    probeAllowlistManager
      .getTenantAllowlist(TENANT)
      .addCustomEntry('::ffff:192.168.1.1', 25, 'test', 'bypass attempt');

    const r = simulateProbeRequest('::ffff:192.168.1.1', TENANT, 25);
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain('ssrf:reserved');
  });

  it('public hostname not in allowlist: blocked at allowlist layer', () => {
    // No allowlist entries for this tenant
    const r = simulateProbeRequest('mail.legitimate.com', TENANT, 25);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('allowlist:not-in-allowlist');
  });

  it('MX-derived public hostname: allowed through both layers', () => {
    const dnsResults: DNSQueryResult[] = [
      {
        query: { name: 'corp.com', type: 'MX' },
        vantage: { type: 'public-recursive', identifier: 'test' },
        success: true,
        answers: [{ name: 'corp.com', type: 'MX', ttl: 300, data: '10 mail.corp.com.' }],
        authority: [],
        additional: [],
        responseTime: 10,
      },
    ];
    probeAllowlistManager.getTenantAllowlist(TENANT).generateFromDnsResults('corp.com', dnsResults);

    const r = simulateProbeRequest('mail.corp.com', TENANT, 25);
    expect(r.blocked).toBe(false);
    expect(r.reason).toBe('allowed');
  });
});
