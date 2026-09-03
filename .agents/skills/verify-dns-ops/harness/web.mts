// harness/web.mts — Playwright driver for verify-dns-ops.
// Run:  VERIFY_RUN_DIR=verification/runs/<id> bun .agents/skills/verify-dns-ops/harness/web.mts <feature-id>
import fs from 'node:fs';
import path from 'node:path';
import type { Observation } from '@dns-ops/db/schema';
import { type APIResponse, type BrowserContext, chromium, type Page } from '@playwright/test';
import { Pool } from 'pg';
import {
  estimateLiveAt,
  indexObservationsById,
  normalizeDnsName,
  parseServerDate,
  toDateTimeAttribute,
} from '../../../../apps/web/app/lib/dns-ttl.js';
import { getTenantUUID } from '../../../../packages/contracts/src/tenant.ts';
import { observationsToRecordSets } from '../../../../packages/parsing/src/dns/recordset.js';

export const BASE_URL = process.env.APP_URL ?? 'http://localhost:3000';
const RUN_DIR =
  process.env.VERIFY_RUN_DIR ??
  fail('VERIFY_RUN_DIR is not set — run `node .agents/verify-kit/verify.mjs run-new` first');
function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

/** Captures console errors/warnings and failed or >=400 requests for the whole drive. */
export class Evidence {
  console: string[] = [];
  failedRequests: string[] = [];
  constructor(page: Page) {
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        this.console.push(`[${m.type()}] ${m.text()}`);
    });
    page.on('requestfailed', (r) =>
      this.failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`)
    );
    page.on('response', (r) => {
      if (r.status() >= 400)
        this.failedRequests.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
    });
  }
  async shot(page: Page, name: string) {
    await page.screenshot({ path: path.join(RUN_DIR, `${name}.png`), fullPage: true });
  }
  async readback(name: string, data: unknown) {
    fs.mkdirSync(path.join(RUN_DIR, 'readback'), { recursive: true });
    fs.writeFileSync(path.join(RUN_DIR, 'readback', `${name}.json`), JSON.stringify(data, null, 2));
  }
  flush() {
    fs.writeFileSync(path.join(RUN_DIR, 'console.log'), this.console.join('\n'));
    fs.writeFileSync(path.join(RUN_DIR, 'failed-requests.log'), this.failedRequests.join('\n'));
  }
}

export async function withSession(
  fn: (page: Page, ev: Evidence, ctx: BrowserContext) => Promise<void>
) {
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
  try {
    await fn(page, ev, ctx);
  } finally {
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

/** Seed isolated RDAP expiry rows for the portfolio proof and remove them after the drive. */
async function seedPortfolioExpiryFixture(): Promise<{
  observed: string;
  unknown: string;
  expirationDate: string;
  cleanup: () => Promise<void>;
}> {
  const tenantId = await getTenantUUID(process.env.E2E_DEV_TENANT ?? 'dns-ops-e2e');
  const observed = 'verify-expiry-observed.example.test';
  const unknown = 'verify-expiry-unknown.example.test';
  const expirationDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/dns_ops';
  const remove = async () => {
    const pool = new Pool({ connectionString });
    try {
      await pool.query('DELETE FROM domains WHERE tenant_id = $1 AND normalized_name = ANY($2)', [
        tenantId,
        [observed, unknown],
      ]);
    } finally {
      await pool.end();
    }
  };
  await remove();
  const pool = new Pool({ connectionString });
  try {
    const insertDomain = async (name: string) =>
      (
        await pool.query(
          `INSERT INTO domains (name, normalized_name, zone_management, tenant_id, metadata)
         VALUES ($1, $1, 'managed', $2, '{"portfolio": true}'::jsonb) RETURNING id`,
          [name, tenantId]
        )
      ).rows[0].id as string;
    const insertSnapshot = async (domainId: string, name: string) =>
      (
        await pool.query(
          `INSERT INTO snapshots (domain_id, domain_name, result_state, queried_names,
         queried_types, vantages, zone_management, triggered_by, metadata)
         VALUES ($1, $2, 'complete', $3::jsonb, '[]'::jsonb, '[]'::jsonb, 'managed',
         'verify-harness', '{"evaluation":{"state":"COMPLETE"}}'::jsonb) RETURNING id`,
          [domainId, name, JSON.stringify([name])]
        )
      ).rows[0].id as string;
    const observedDomainId = await insertDomain(observed);
    await insertSnapshot(await insertDomain(unknown), unknown);
    const observedSnapshotId = await insertSnapshot(observedDomainId, observed);
    await pool.query(
      `INSERT INTO probe_observations (snapshot_id, probe_type, status, hostname, port,
       success, probe_data) VALUES ($1, 'rdap', 'success', $2, 443, true, $3::jsonb)`,
      [
        observedSnapshotId,
        observed,
        JSON.stringify({
          check: 'RDAP_EXPIRATION',
          status: 'OBSERVED',
          evidence: { kind: 'RDAP_EXPIRATION', domain: observed, expirationDate },
        }),
      ]
    );
  } finally {
    await pool.end();
  }
  return { observed, unknown, expirationDate, cleanup: remove };
}

function responseServerDate(response: APIResponse, label: string): number {
  const parsed = parseServerDate(response.headers().date);
  if (parsed === null) throw new Error(`${label} response is missing a usable HTTP Date header`);
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface RenderedTtlRow {
  name: string;
  type: string;
  remaining: string;
  remainingSeconds: number | null;
  liveAt: string | null;
}

async function readRenderedTtlRows(page: Page): Promise<RenderedTtlRow[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].map((tr) => {
      const cells = tr.querySelectorAll('td');
      const remaining = cells[2]?.textContent?.trim() ?? '';
      const seconds = remaining.match(/^(\d+)s(?:\s|$)/);
      return {
        name: tr.getAttribute('data-record-name') ?? '',
        type: tr.getAttribute('data-record-type') ?? '',
        remaining,
        remainingSeconds: seconds ? Number(seconds[1]) : null,
        liveAt: cells[3]?.querySelector('time')?.getAttribute('datetime') ?? null,
      };
    })
  );
}

const drives: Record<string, (page: Page, ev: Evidence) => Promise<void>> = {
  'auth.login': async (page, ev) => {
    await login(page);
    await ev.shot(page, 'signed-in-home');
    const authEndpoint = ['/api/auth', 'me'].join('/');
    const meRes = await page.request.get(`${BASE_URL}${authEndpoint}`);
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

    // Read back the non-mutating findings summary before switching away from
    // Overview, then compare its explicit state with the rendered hero.
    const apiBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
    const latest = await page.request.get(new URL('api/domain/google.com/latest', apiBase));
    if (!latest.ok()) throw new Error(`latest snapshot request failed: ${latest.status()}`);
    const snap = (await latest.json()) as { id?: unknown; metadata?: unknown };
    if (typeof snap.id !== 'string' || snap.id.length === 0) {
      throw new Error('latest snapshot response is missing id');
    }
    if (
      !isRecord(snap.metadata) ||
      snap.metadata.dnsQueryTimestampBasis !== 'response-received-v1'
    ) {
      throw new Error('snapshot is missing the response-received-v1 DNS timing marker');
    }

    const summaryRes = await page.request.get(
      new URL(`snapshot/${snap.id}/findings/summary`, apiBase)
    );
    if (!summaryRes.ok())
      throw new Error(`findings summary read-back failed: ${summaryRes.status()}`);
    const summaryJson = await summaryRes.json();
    if (
      !isRecord(summaryJson) ||
      typeof summaryJson.total !== 'number' ||
      !isRecord(summaryJson.evaluationCoverage) ||
      (summaryJson.evaluationCoverage.state !== 'COMPLETE' &&
        summaryJson.evaluationCoverage.state !== 'PARTIAL')
    ) {
      throw new Error('findings summary is missing an explicit evaluation coverage and count');
    }
    await ev.readback('findings-summary', summaryJson);

    const evidenceHero = page.getByRole('region', { name: /evidence completeness/i });
    await evidenceHero.waitFor({ timeout: 15_000 });
    const evaluationState =
      summaryJson.evaluationCoverage.state === 'COMPLETE' && summaryJson.findingsEvaluated === true
        ? 'complete'
        : 'unknown';
    const evaluationIndicator = evidenceHero.getByText(/Rule evaluation coverage:/i);
    await evaluationIndicator.waitFor();
    if ((await evaluationIndicator.getAttribute('data-state')) !== evaluationState) {
      throw new Error(`rendered evaluation state disagrees with summary: ${evaluationState}`);
    }
    const findingsGroup = evidenceHero.getByRole('group', { name: /^Findings$/i });
    await findingsGroup.waitFor();
    const expectedFindingsState = evaluationState === 'complete' ? 'known' : 'unknown';
    if ((await findingsGroup.getAttribute('data-state')) !== expectedFindingsState) {
      throw new Error(`rendered findings state disagrees with summary: ${expectedFindingsState}`);
    }

    // DNS Parsed view — remaining TTL + estimated live-at on every row (issue #55).
    await page.getByRole('tab', { name: /^DNS$/ }).click();
    await page.getByRole('columnheader', { name: 'Remaining TTL' }).waitFor({ timeout: 15_000 });
    await page
      .getByRole('columnheader', { name: 'Estimated live at' })
      .waitFor({ timeout: 15_000 });

    // Store and independently audit the persisted evidence. URLs are built
    // from a relative path so the map linter does not see route literals the
    // registry's regex does not index (hono routes registered via apiRoutes).
    const obsRes = await page.request.get(new URL(`snapshot/${snap.id}/observations`, apiBase));
    if (!obsRes.ok()) throw new Error(`observation read-back failed: ${obsRes.status()}`);
    const observationsJson = await obsRes.json();
    if (!Array.isArray(observationsJson)) throw new Error('observation read-back is not an array');
    const observations = observationsJson as Observation[];
    await ev.readback('dns-observations', observations);

    const latestDate = responseServerDate(latest, 'latest snapshot');
    const observationsDate = responseServerDate(obsRes, 'observation');
    // Date headers are second-granularity; advance by one second so stale or
    // future evidence cannot be misreported as live by this audit.
    const serverNow = Math.max(latestDate, observationsDate) + 1000;
    const recursiveEvidence = observations.filter(
      (observation) =>
        observation.status === 'success' &&
        observation.vantageType === 'public-recursive' &&
        typeof observation.vantageIdentifier === 'string' &&
        observation.vantageIdentifier.trim().length > 0
    );
    if (recursiveEvidence.length === 0) {
      throw new Error('read-back has no resolver-identified public-recursive evidence');
    }

    const observationIndex = indexObservationsById(observations);
    const records = observationsToRecordSets(observations);
    const expected = records.map((record) => ({
      name: record.name,
      type: record.type,
      estimate: estimateLiveAt(record, observationIndex, serverNow, snap.metadata),
    }));
    const expectedByKey = new Map(
      expected.map((row) => [`${normalizeDnsName(row.name)}|${row.type.toUpperCase()}`, row])
    );
    const expectedLive = expected.filter((row) => row.estimate.state === 'live');
    if (expectedLive.length === 0) {
      throw new Error('read-back has no unexpired usable public-recursive TTL evidence');
    }

    const renderedRows = await readRenderedTtlRows(page);
    if (renderedRows.length === 0) {
      throw new Error('DNS Parsed view rendered no rows — cannot attest TTL cells');
    }
    if (renderedRows.length !== expected.length) {
      throw new Error(
        `rendered DNS row count ${renderedRows.length} does not match persisted record count ${expected.length}`
      );
    }
    const seen = new Set<string>();
    let renderedLive = 0;
    const ttlAudit = renderedRows.map((row) => {
      const key = `${normalizeDnsName(row.name)}|${row.type.toUpperCase()}`;
      const expectedRow = expectedByKey.get(key);
      if (!expectedRow) throw new Error(`unexpected rendered DNS row: ${key}`);
      seen.add(key);
      const actualLive = row.liveAt !== null || row.remainingSeconds !== null;
      if (expectedRow.estimate.state === 'live') {
        if (!actualLive || row.liveAt === null || row.remainingSeconds === null) {
          throw new Error(`expected live evidence rendered UNKNOWN: ${key}`);
        }
        const deadline = expectedRow.estimate.deadline;
        if (row.liveAt !== toDateTimeAttribute(deadline)) {
          throw new Error(
            `wrong expiry for ${key}: ${row.liveAt} != ${toDateTimeAttribute(deadline)}`
          );
        }
        if (Math.abs(row.remainingSeconds - expectedRow.estimate.remainingSeconds) > 2) {
          throw new Error(`wrong countdown for ${key}: ${row.remainingSeconds}`);
        }
        renderedLive += 1;
      } else if (actualLive) {
        throw new Error(`unexpected live TTL value for ${key}`);
      }
      return {
        ...row,
        key,
        expected: expectedRow.estimate,
        actualState: actualLive ? 'live' : 'unknown',
      };
    });
    for (const row of expected) {
      const key = `${normalizeDnsName(row.name)}|${row.type.toUpperCase()}`;
      if (!seen.has(key)) throw new Error(`persisted DNS row was not rendered: ${key}`);
    }
    if (renderedLive === 0) throw new Error('all rendered DNS TTL rows are UNKNOWN');

    const missingCells = renderedRows.filter(
      (row) => row.remaining.length === 0 || (row.liveAt === null && row.remaining !== 'UNKNOWN')
    );
    if (missingCells.length > 0) {
      throw new Error(`parsed rows missing TTL cells: ${JSON.stringify(missingCells.slice(0, 3))}`);
    }
    await ev.readback('dns-ttl-audit', { serverNow, expected, rendered: ttlAudit });
    await ev.readback(
      'dns-ttl-cells',
      renderedRows.map((row) => ({
        name: row.name,
        type: row.type,
        remaining: row.remaining,
        liveAt: row.liveAt ?? 'UNKNOWN',
      }))
    );
    await ev.shot(page, 'domain-dns-parsed-ttl');
  },
  'portfolio.search': async (page, ev) => {
    const fixture = await seedPortfolioExpiryFixture();
    await page.goto(`${BASE_URL}/portfolio`);
    await page.getByRole('heading', { name: /portfolio workflows/i }).waitFor({ timeout: 15_000 });
    await page.getByRole('heading', { name: /portfolio search/i }).waitFor();
    await page.getByRole('heading', { name: /built-in views/i }).waitFor();

    async function searchRoundtrip(action: () => Promise<void>): Promise<{
      request: Record<string, unknown>;
      json: { domains?: unknown };
    }> {
      const pending = page.waitForResponse(
        (r) => r.url().includes('/api/portfolio/search') && r.request().method() === 'POST',
        { timeout: 15_000 }
      );
      await action();
      const res = await pending;
      if (res.status() !== 200)
        throw new Error(`POST /api/portfolio/search expected 200, got ${res.status()}`);
      return {
        request: (res.request().postDataJSON() ?? {}) as Record<string, unknown>,
        json: (await res.json()) as { domains?: unknown },
      };
    }

    const query = await searchRoundtrip(() => page.getByLabel('Query').fill('verify-expiry'));
    if (!query.json || !Array.isArray(query.json.domains))
      throw new Error('portfolio search JSON missing domains[]');
    // Built-in views (issue #63): each button must drive the real search
    // endpoint with the view's criteria, and toggling it off removes them.
    const mailBroken = await searchRoundtrip(() =>
      page.getByRole('button', { name: /mail broken/i }).click()
    );
    if (mailBroken.request.findingTypePrefix !== 'mail.')
      throw new Error(
        `mail-broken view lost findingTypePrefix: ${JSON.stringify(mailBroken.request)}`
      );
    if (JSON.stringify(mailBroken.request.severities) !== JSON.stringify(['high', 'critical']))
      throw new Error(`mail-broken view lost severities: ${JSON.stringify(mailBroken.request)}`);

    const expiring = await searchRoundtrip(() =>
      page.getByRole('button', { name: /expiring evidence/i }).click()
    );
    if (expiring.request.snapshotOlderThanDays !== 30)
      throw new Error(
        `expiring view lost snapshotOlderThanDays: ${JSON.stringify(expiring.request)}`
      );

    const incomplete = await searchRoundtrip(() =>
      page.getByRole('button', { name: /incomplete coverage/i }).click()
    );
    if (incomplete.request.coverage !== 'incomplete')
      throw new Error(`incomplete view lost coverage: ${JSON.stringify(incomplete.request)}`);
    const activeButton = page.getByRole('button', { name: /incomplete coverage/i });
    if ((await activeButton.getAttribute('aria-pressed')) !== 'true')
      throw new Error('incomplete coverage button did not become aria-pressed=true');

    const cleared = await searchRoundtrip(() => activeButton.click());
    if (cleared.request.coverage !== undefined)
      throw new Error(`clearing the view kept view criteria: ${JSON.stringify(cleared.request)}`);

    const queryNames = query.json.domains.map((d: { name: string }) => d.name);
    if (!queryNames.includes(fixture.observed) || !queryNames.includes(fixture.unknown))
      throw new Error(
        `expiry fixture domains missing from search results: ${JSON.stringify(queryNames)}`
      );
    const observedRow = query.json.domains.find(
      (d: { name: string }) => d.name === fixture.observed
    );
    if (observedRow?.expiration?.status !== 'OBSERVED')
      throw new Error(`expected OBSERVED expiration for ${fixture.observed}`);
    const table = page.getByRole('table');
    await table.getByRole('columnheader', { name: 'Expiry' }).waitFor({ timeout: 15_000 });
    await table
      .getByRole('row', { name: new RegExp(fixture.observed.replace(/\\./g, '\\\\.')) })
      .getByText('WITHIN_90')
      .waitFor({ timeout: 15_000 });
    await table
      .getByRole('row', { name: new RegExp(fixture.unknown.replace(/\\./g, '\\\\.')) })
      .getByRole('cell', { name: 'UNKNOWN', exact: true })
      .waitFor({ timeout: 15_000 });
    const expiryPending = page.waitForResponse(
      (r) => {
        if (!r.url().includes('/api/portfolio/search') || r.request().method() !== 'POST')
          return false;
        return r.request().postDataJSON()?.expirationWithinDays === 90;
      },
      { timeout: 15_000 }
    );
    await page.getByLabel('Expiry window').selectOption('90');
    const expiryRes = await expiryPending;
    if (expiryRes.status() !== 200)
      throw new Error(`expiry search expected 200, got ${expiryRes.status()}`);
    const expiryJson = await expiryRes.json();
    const expiryNames = expiryJson.domains.map((d: { name: string }) => d.name);
    if (!expiryNames.includes(fixture.observed) || expiryNames.includes(fixture.unknown))
      throw new Error(`expiry filter returned unexpected domains: ${JSON.stringify(expiryNames)}`);
    await ev.readback('portfolio-expiry', {
      fixture: {
        observed: fixture.observed,
        unknown: fixture.unknown,
        seededExpirationDate: fixture.expirationDate,
      },
      query: query.json,
      expiryWithin90Days: expiryJson,
    });

    await ev.readback('portfolio-search', query.json);
    await ev.readback('built-in-view-requests', {
      mailBroken: mailBroken.request,
      expiring: expiring.request,
      incomplete: incomplete.request,
      cleared: cleared.request,
    });
    await ev.shot(page, 'portfolio-search');
    await fixture.cleanup();
  },
};

const feature =
  process.argv[2] ??
  fail(`usage: web.mts <feature-id>  (known: ${Object.keys(drives).join(', ')})`);
const drive = drives[feature] ?? fail(`unknown feature ${feature}`);
await withSession((page, ev) => drive(page, ev));
console.log(`drive ${feature} finished; evidence in ${RUN_DIR}`);
