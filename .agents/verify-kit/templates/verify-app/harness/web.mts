// harness/web.mts — Playwright driver skeleton for verify-<<app>>.
// Run:  VERIFY_RUN_DIR=verification/runs/<id> bun harness/web.mts <feature-id>
//   or: node --experimental-strip-types harness/web.mts <feature-id>
// Deps: pnpm add -D playwright && pnpm exec playwright install chromium
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page, type BrowserContext } from 'playwright';

export const BASE_URL = process.env.APP_URL ?? 'http://localhost:3000'; // <<FILL: real dev port>>
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
  const ctx = await browser.newContext({ recordVideo: { dir: path.join(RUN_DIR, 'video') } });
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

/** Deterministic test login. <<FILL>> — seeded user or dev auto-login. Never live OAuth. */
export async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill(process.env.VERIFY_USER ?? 'verify@example.test');
  await page.getByLabel('Password').fill(process.env.VERIFY_PASS ?? 'verify-pass');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('[data-state="app-ready"]').waitFor({ timeout: 15_000 }); // <<FILL: semantic ready state>>
}

// ---- one drive per feature id; keep each drive matching its feature file's "Driving it" section
const drives: Record<string, (page: Page, ev: Evidence) => Promise<void>> = {
  '<<domain.capability>>': async (page, ev) => {
    await login(page);
    await page.goto(`${BASE_URL}/<<route>>`);
    await page.getByRole('button', { name: '<<accessible name>>' }).click();
    await page.locator('[data-action-id="<<domain.capability.submit>>"]').click();
    await page.locator('[data-state="<<end-state>>"]').waitFor({ timeout: 10_000 }); // poll the end state, never sleep
    await ev.shot(page, '<<end-state>>');
    const rb = await (await page.request.get(`${BASE_URL}/api/<<resource>>`)).json(); // independent read-back
    await ev.readback('<<resource>>', rb);
  },
};

const feature = process.argv[2] ?? fail(`usage: web.mts <feature-id>  (known: ${Object.keys(drives).join(', ')})`);
const drive = drives[feature] ?? fail(`unknown feature ${feature}`);
await withSession((page, ev) => drive(page, ev));
console.log(`drive ${feature} finished; evidence in ${RUN_DIR}`);
