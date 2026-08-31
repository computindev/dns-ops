// harness/web.mts — Playwright driver for verify-dns-ops.
// Run:  VERIFY_RUN_DIR=verification/runs/<id> bun .agents/skills/verify-dns-ops/harness/web.mts <feature-id>
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page, type BrowserContext } from 'playwright';

export const BASE_URL = process.env.APP_URL ?? 'http://localhost:3000';
const RUN_DIR = process.env.VERIFY_RUN_DIR ?? fail('VERIFY_RUN_DIR is not set — run `node .agents/verify-kit/verify.mjs run-new` first');
function fail(msg: string): never { console.error(msg); process.exit(2); }

/** Captures console errors/warnings and failed or >=400 requests for the whole drive. */
export class Evidence {
  console: string[] = [];
  failedRequests: string[] = [];
  constructor(page: Page) {
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') this.console.push(`[${m.type()}] ${m.text()}`); });
    page.on('requestfailed', (r) => this.failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('response', (r) => { if (r.status() >= 400) this.failedRequests.push(`${r.request().method()} ${r.url()} -> ${r.status()}`); });
  }
  async shot(page: Page, name: string) { await page.screenshot({ path: path.join(RUN_DIR, `${name}.png`), fullPage: true }); }
  async readback(name: string, data: unknown) { fs.mkdirSync(path.join(RUN_DIR, 'readback'), { recursive: true }); fs.writeFileSync(path.join(RUN_DIR, 'readback', `${name}.json`), JSON.stringify(data, null, 2)); }
  flush() {
    fs.writeFileSync(path.join(RUN_DIR, 'console.log'), this.console.join('\n'));
    fs.writeFileSync(path.join(RUN_DIR, 'failed-requests.log'), this.failedRequests.join('\n'));
  }
}

export async function withSession(fn: (page: Page, ev: Evidence, ctx: BrowserContext) => Promise<void>) {
  const browser = await chromium.launch();
  const extraHTTPHeaders: Record<string, string> = {};
  if (process.env.E2E_DEV_TENANT) extraHTTPHeaders['X-Dev-Tenant'] = process.env.E2E_DEV_TENANT;
  if (process.env.E2E_DEV_ACTOR) extraHTTPHeaders['X-Dev-Actor'] = process.env.E2E_DEV_ACTOR;
  const ctx = await browser.newContext({
    recordVideo: { dir: path.join(RUN_DIR, 'video') },
    extraHTTPHeaders: Object.keys(extraHTTPHeaders).length ? extraHTTPHeaders : undefined,
  });
  await ctx.tracing.start({ screenshots: true, snapshots: true });
  const page = await ctx.newPage();
  const ev = new Evidence(page);
  try { await fn(page, ev, ctx); }
  finally {
    await ctx.tracing.stop({ path: path.join(RUN_DIR, 'trace.zip') });
    ev.flush();
    await browser.close();
  }
}

/** Form login. Requires VERIFY_USER and VERIFY_PASS. Never live OAuth. */
export async function login(page: Page) {
  const user = process.env.VERIFY_USER;
  const pass = process.env.VERIFY_PASS;
  if (!user || !pass) fail('VERIFY_USER and VERIFY_PASS are required for auth.login');
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email address').fill(user);
  await page.getByLabel('Password').fill(pass);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: /dns ops workbench/i }).waitFor({ timeout: 15_000 });
}

const drives: Record<string, (page: Page, ev: Evidence) => Promise<void>> = {
  'auth.login': async (page, ev) => {
    await login(page);
    await ev.shot(page, 'signed-in-home');
    const meRes = await page.request.get(BASE_URL + '/api/auth/me');
    if (meRes.status() !== 200) throw new Error(`/api/auth/me expected 200, got ${meRes.status()}`);
    await ev.readback('me', await meRes.json());
  },
  'domain.overview': async (page, ev) => {
    await page.goto(`${BASE_URL}/`);
    await page.getByRole('textbox', { name: /domain name/i }).fill('google.com');
    await page.getByRole('button', { name: /analyze/i }).click();
    await page.getByRole('heading', { name: /google\.com/i }).waitFor({ timeout: 15_000 });
    for (const name of ['Overview', 'DNS', 'Mail', 'History']) {
      await page.getByRole('tab', { name: new RegExp(`^${name}$`, 'i') }).waitFor();
    }
    const delegation = page.getByRole('tab', { name: /^Delegation$/i });
    if (await delegation.count()) await delegation.waitFor();
    await ev.shot(page, 'domain-overview');

    // DNS Parsed view — remaining TTL + estimated live-at on every row (issue #55).
    await page.getByRole('tab', { name: /^DNS$/ }).click();
    await page.getByRole('columnheader', { name: 'Remaining TTL' }).waitFor({ timeout: 15_000 });
    await page.getByRole('columnheader', { name: 'Estimated live at' }).waitFor({ timeout: 15_000 });

    // Store the real evidence the estimates are derived from. URLs are built
    // from a relative path so the map linter does not see route literals the
    // registry's regex does not index (hono routes registered via apiRoutes).
    const apiBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
    const latest = await page.request.get(new URL('api/domain/google.com/latest', apiBase));
    if (latest.ok()) {
      const snap = (await latest.json()) as { id?: string };
      if (snap.id) {
        const obsRes = await page.request.get(new URL(`snapshot/${snap.id}/observations`, apiBase));
        ev.readback('dns-observations', obsRes.ok() ? await obsRes.json() : { status: obsRes.status });
      }
    } else {
      ev.readback('dns-observations', { status: latest.status });
    }

    // Every parsed body row must populate both new cells (value or UNKNOWN — never blank).
    const cellAudit = await page.evaluate(() =>
      [...document.querySelectorAll('table tbody tr')].map((tr) => {
        const cells = tr.querySelectorAll('td');
        return {
          remaining: cells[2]?.textContent?.trim() ?? null,
          liveAt: cells[3]?.querySelector('time')?.getAttribute('datetime') ?? cells[3]?.textContent?.trim() ?? null,
        };
      })
    );
    if (cellAudit.length === 0) throw new Error('DNS Parsed view rendered no rows — cannot attest TTL cells');
    const bad = cellAudit.filter((row) => !row.remaining || !row.liveAt);
    if (bad.length > 0) throw new Error(`parsed rows missing TTL cells: ${JSON.stringify(bad.slice(0, 3))}`);
    ev.readback('dns-ttl-cells', cellAudit);
    await ev.shot(page, 'domain-dns-parsed-ttl');
  },
  'portfolio.search': async (page, ev) => {
    await page.goto(`${BASE_URL}/portfolio`);
    await page.getByRole('heading', { name: /portfolio workflows/i }).waitFor({ timeout: 15_000 });
    await page.getByRole('heading', { name: /portfolio search/i }).waitFor();
    const pending = page.waitForResponse((r) => r.url().includes('/api/portfolio/search') && r.request().method() === 'POST', { timeout: 15_000 });
    await page.getByLabel('Query').fill('example.com');
    const res = await pending;
    if (res.status() !== 200) throw new Error(`POST /api/portfolio/search expected 200, got ${res.status()}`);
    const json = await res.json();
    if (!json || !Array.isArray(json.domains)) throw new Error('portfolio search JSON missing domains[]');
    await ev.readback('portfolio-search', json);
    await ev.shot(page, 'portfolio-search');
  },
};

const feature = process.argv[2] ?? fail(`usage: web.mts <feature-id>  (known: ${Object.keys(drives).join(', ')})`);
const drive = drives[feature] ?? fail(`unknown feature ${feature}`);
await withSession((page, ev) => drive(page, ev));
console.log(`drive ${feature} finished; evidence in ${RUN_DIR}`);
