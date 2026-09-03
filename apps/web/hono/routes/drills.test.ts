/**
 * Live Drill Routes Tests - Issue #62
 *
 * Route-level coverage for the two-person-confirmed drill starts:
 * - Only manifest-allowlisted LIVE-01–03 tuples can be requested; the record
 *   name always comes from the manifest, never from the request.
 * - A second, distinct operator must confirm before start; same-actor confirm
 *   is rejected.
 * - Start only runs the exact fail-closed runner argv built from the manifest
 *   scenario, and non-zero runner exits mark the run failed (fail-closed).
 * - A missing harness or manifest makes every start fail closed.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../types.js';
import {
  createDrillRoutes,
  type DrillRunStore,
  OPEN_RUN_STATUSES,
  parseDrillManifest,
  planDrillStart,
  type RunnerOutcome,
  type SpawnRunner,
} from './drills.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

const MANIFEST = {
  manifestId: 'TEST-CONTROLLED-LIVE',
  zone: 'asorin.ai',
  zoneId: 'zone-id',
  provider: 'cloudflare',
  providerCredentialFingerprint: 'sha256:f'.padEnd(71, '0'),
  allowlist: [
    { name: 'www.asorin.ai', types: ['CNAME'], mutationIds: ['LIVE-01'] },
    { name: 'asorin.ai', types: ['CNAME'], mutationIds: ['LIVE-02'] },
    { name: 'mail.asorin.ai', types: ['TXT'], mutationIds: ['LIVE-03'] },
  ],
  scenarios: {
    'LIVE-01': { host: 'www.asorin.ai', expectedSignal: 'REDIRECT_TOPOLOGY_REGRESSION' },
    'LIVE-02': { host: 'asorin.ai', expectedSignal: 'HOMEPAGE_INDEXABILITY_REGRESSION' },
    'LIVE-03': { host: 'mail.asorin.ai', expectedSignal: 'MAIL_DNS_CONFIGURATION_REGRESSION' },
  },
};

type StoreRun = {
  id: string;
  mutationId: string;
  recordName: string;
  status: string;
  requesterActor: string;
  confirmerActor: string | null;
  recoveryArtifact: string | null;
  runnerMessage: string | null;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
};

/** In-memory store mirroring the drill_run_open_unique partial unique index. */
function createMemoryStore(): DrillRunStore & { rows: StoreRun[] } {
  const rows: StoreRun[] = [];
  let nextId = 1;
  return {
    rows,
    async list(tenantId) {
      return rows
        .filter((row) => row.tenantId === tenantId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, 20);
    },
    async insert(data) {
      if (rows.some((row) => (OPEN_RUN_STATUSES as readonly string[]).includes(row.status))) {
        throw Object.assign(new Error('duplicate open drill'), { code: '23505' });
      }
      const now = new Date();
      const row: StoreRun = {
        id: `run-${nextId}`,
        mutationId: String(data.mutationId),
        recordName: String(data.recordName),
        status: 'requested',
        requesterActor: String(data.requesterActor),
        confirmerActor: null,
        recoveryArtifact: null,
        runnerMessage: null,
        tenantId: String(data.tenantId),
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      nextId += 1;
      return row;
    },
    async transition(id, fromStatus, patch) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || row.status !== fromStatus) return null;
      Object.assign(row, patch, { updatedAt: new Date() });
      return row;
    },
  };
}

interface Harness {
  app: Hono<Env>;
  store: ReturnType<typeof createMemoryStore>;
  runnerCalls: Array<{ runnerPath: string; args: string[] }>;
  setRunnerOutcome: (outcome: RunnerOutcome) => void;
  setActor: (actorId: string) => void;
  artifactsDir: string;
}

function createHarness(tenantId: string, actorId: string): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'drills-test-'));
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(MANIFEST));
  const runnerPath = join(dir, 'runner.mjs');
  writeFileSync(runnerPath, '// fail-closed runner stub\n');

  const store = createMemoryStore();
  const runnerCalls: Array<{ runnerPath: string; args: string[] }> = [];
  let runnerOutcome: RunnerOutcome = { code: 0, stderrTail: '' };
  const spawnRunner: SpawnRunner = async (path, args) => {
    runnerCalls.push({ runnerPath: path, args });
    return runnerOutcome;
  };
  const artifactsDir = join(dir, 'artifacts');
  let currentActor = actorId;

  const routes = createDrillRoutes({
    manifestPath,
    runnerPath,
    artifactsDir,
    spawnRunner,
    store,
  });
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    // AuditEventRepository uses the simple-adapter insert; the drill tables
    // themselves go through the injected in-memory store.
    c.set('db', {
      getDrizzle: () => ({}),
      insert: async (_table: unknown, values: Record<string, unknown>) => ({
        id: 'audit-1',
        ...values,
      }),
    } as unknown as Env['Variables']['db']);
    c.set('tenantId', tenantId);
    c.set('actorId', currentActor);
    await next();
  });
  app.route('/api/drills', routes);
  return {
    app,
    store,
    runnerCalls,
    artifactsDir,
    setRunnerOutcome(outcome) {
      runnerOutcome = outcome;
    },
    setActor(actorId) {
      currentActor = actorId;
    },
  };
}

async function post(
  app: Harness['app'],
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await app.request(path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function settle(store: ReturnType<typeof createMemoryStore>): Promise<StoreRun> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = store.rows[0];
    if (run && ['fault_applied', 'failed'].includes(run.status)) return run;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error('drill run never settled');
}

describe('parseDrillManifest', () => {
  it('extracts the LIVE-01–03 tuples with their pinned record names', () => {
    const parsed = parseDrillManifest(MANIFEST);
    expect(parsed.zone).toBe('asorin.ai');
    expect(parsed.tuples).toHaveLength(3);
    expect(parsed.tuples.map((tuple) => tuple.name)).toEqual([
      'www.asorin.ai',
      'asorin.ai',
      'mail.asorin.ai',
    ]);
  });

  it('fails closed on unknown mutation IDs or missing allowlist', () => {
    expect(() =>
      parseDrillManifest({
        ...MANIFEST,
        allowlist: [{ name: 'x.asorin.ai', types: ['TXT'], mutationIds: ['LIVE-99'] }],
      })
    ).toThrow(/outside LIVE-01–03/);
    expect(() => parseDrillManifest({ ...MANIFEST, allowlist: [] })).toThrow(/no LIVE-01–03/);
  });
});

describe('planDrillStart', () => {
  it('plans the exact fail-closed runner invocations per scenario', () => {
    expect(planDrillStart('LIVE-01', '/artifacts')).toEqual([
      ['fixture-apply', 'LIVE-01', join('/artifacts', 'live-01-recovery.json')],
    ]);
    const live03 = planDrillStart('LIVE-03', '/artifacts');
    expect(live03).toHaveLength(2);
    expect(live03[0]).toEqual(['bootstrap', join('/artifacts', 'live-03-bootstrap.json')]);
    expect(live03[1]).toEqual([
      'apply',
      join('/artifacts', 'live-03-bootstrap.json'),
      join('/artifacts', 'live-03-recovery.json'),
    ]);
  });
});

describe('live drill routes', () => {
  it('lists allowlisted tuples and rejects non-allowlisted mutation requests', async () => {
    const harness = createHarness(TENANT_A, 'actor-a');
    const listResponse = await harness.app.request('/api/drills');
    const list = (await listResponse.json()) as Record<string, unknown>;
    expect(listResponse.status).toBe(200);
    expect(list.harness).toMatchObject({ available: true, zone: 'asorin.ai' });
    expect((list.tuples as unknown[]).length).toBe(3);
    expect((list.runs as unknown[]).length).toBe(0);

    const rejected = await post(harness.app, '/api/drills', { mutationId: 'LIVE-04' });
    expect(rejected.status).toBe(400);
  });

  it('requires a second distinct operator before a start is allowed', async () => {
    const harness = createHarness(TENANT_A, 'actor-a');

    const created = await post(harness.app, '/api/drills', { mutationId: 'LIVE-01' });
    expect(created.status).toBe(201);
    const runId = (created.json.run as { id: string }).id;

    const selfConfirm = await post(harness.app, `/api/drills/${runId}/confirm`);
    expect(selfConfirm.status).toBe(403);

    const earlyStart = await post(harness.app, `/api/drills/${runId}/start`);
    expect(earlyStart.status).toBe(409);

    harness.setActor('actor-b');
    const confirm = await post(harness.app, `/api/drills/${runId}/confirm`);
    expect(confirm.status).toBe(200);
    expect((confirm.json.run as { status: string }).status).toBe('approved');
    expect((confirm.json.run as { confirmerActor: string }).confirmerActor).toBe('actor-b');
  });

  it('starts an approved drill with the manifest-pinned argv and records failure fail-closed', async () => {
    const harness = createHarness(TENANT_A, 'actor-a');
    const created = await post(harness.app, '/api/drills', { mutationId: 'LIVE-01' });
    const runId = (created.json.run as { id: string }).id;
    harness.setActor('actor-b');
    await post(harness.app, `/api/drills/${runId}/confirm`);

    harness.setRunnerOutcome({ code: 1, stderrTail: 'fixture control token missing' });
    const started = await post(harness.app, `/api/drills/${runId}/start`);
    expect(started.status).toBe(202);

    const settled = await settle(harness.store);
    expect(settled.status).toBe('failed');
    expect(settled.runnerMessage).toContain('exited 1');
    expect(harness.runnerCalls).toHaveLength(1);
    expect(harness.runnerCalls[0].args[0]).toBe('fixture-apply');
    expect(harness.runnerCalls[0].args[1]).toBe('LIVE-01');
    expect(harness.runnerCalls[0].args[2].endsWith('live-01-recovery.json')).toBe(true);
    // The record name is the manifest pin, never client input.
    expect(settled.recordName).toBe('www.asorin.ai');
  });

  it('marks a successful fault phase with the recovery artifact for operator restore', async () => {
    const harness = createHarness(TENANT_A, 'actor-a');
    const created = await post(harness.app, '/api/drills', { mutationId: 'LIVE-02' });
    const runId = (created.json.run as { id: string }).id;
    harness.setActor('actor-b');
    await post(harness.app, `/api/drills/${runId}/confirm`);
    const started = await post(harness.app, `/api/drills/${runId}/start`);
    expect(started.status).toBe(202);

    const settled = await settle(harness.store);
    expect(settled.status).toBe('fault_applied');
    expect(settled.recoveryArtifact?.endsWith('live-02-recovery.json')).toBe(true);
  });

  it('enforces a single open drill and keeps tenants isolated', async () => {
    const harnessA = createHarness(TENANT_A, 'actor-a');
    const created = await post(harnessA.app, '/api/drills', { mutationId: 'LIVE-03' });
    expect(created.status).toBe(201);
    const runId = (created.json.run as { id: string }).id;
    harnessA.setActor('actor-b');
    await post(harnessA.app, `/api/drills/${runId}/confirm`);

    const duplicate = await post(harnessA.app, '/api/drills', { mutationId: 'LIVE-01' });
    expect(duplicate.status).toBe(409);

    // Another tenant can neither confirm nor start tenant A's run.
    const harnessB = createHarness(TENANT_B, 'actor-b');
    const foreignConfirm = await post(harnessB.app, `/api/drills/${runId}/confirm`);
    expect(foreignConfirm.status).toBe(404);
    const foreignStart = await post(harnessB.app, `/api/drills/${runId}/start`);
    expect(foreignStart.status).toBe(404);
  });

  it('fails closed when the harness or manifest is unavailable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'drills-test-'));
    const store = createMemoryStore();
    const routes = createDrillRoutes({
      manifestPath: join(dir, 'missing-manifest.json'),
      runnerPath: join(dir, 'missing-runner.mjs'),
      artifactsDir: join(dir, 'artifacts'),
      spawnRunner: async () => ({ code: 0, stderrTail: '' }),
      store,
    });
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('db', {
        getDrizzle: () => ({}),
        insert: async (_table: unknown, values: Record<string, unknown>) => ({
          id: 'audit-1',
          ...values,
        }),
      } as unknown as Env['Variables']['db']);
      c.set('tenantId', TENANT_A);
      c.set('actorId', 'actor-a');
      await next();
    });
    app.route('/api/drills', routes);

    const list = await app.request('/api/drills');
    const listJson = (await list.json()) as Record<string, unknown>;
    expect(listJson.harness).toMatchObject({ available: false });
    expect(listJson.tuples).toEqual([]);

    const requested = await post(app, '/api/drills', { mutationId: 'LIVE-01' });
    expect(requested.status).toBe(409);
  });
});
