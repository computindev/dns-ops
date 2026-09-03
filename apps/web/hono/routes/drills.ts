/**
 * Live Drill Routes - Issue #62
 *
 * Two-person-confirmed starts of the fail-closed controlled-live harness
 * (tools/controlled-live-harness/runner.mjs) for the asorin.ai tuples pinned
 * in the checked-in mutation manifest. Non-allowlisted domains stay
 * observation-only: the record name always comes from the manifest, never
 * from the request. This module never touches provider or fixture secrets —
 * the runner resolves its own runtime credentials and revalidates the
 * manifest allowlist before every operation, so any missing secret or
 * unauthorized tuple fails closed inside the harness.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTROLLED_FAULT_RECORD_TYPES,
  LIVE_FAULT_MUTATION_IDS,
  type LiveFaultMutationId,
} from '@dns-ops/contracts';
import { AuditEventRepository, type DrillRun, type NewDrillRun } from '@dns-ops/db';
import { drillRuns } from '@dns-ops/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAuth, requireWritePermission } from '../middleware/authorization.js';
import { enumValue, validateBody, validationErrorResponse } from '../middleware/validation.js';
import type { Env } from '../types.js';

/** Statuses that hold the single open-drill slot (mirrors drill_run_open_unique). */
export const OPEN_RUN_STATUSES = ['requested', 'approved', 'started'] as const;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** A manifest-approved drill tuple narrowed to the LIVE mutation IDs. */
export interface DrillTuple {
  name: string;
  types: string[];
  mutationIds: LiveFaultMutationId[];
}

export interface ParsedDrillManifest {
  manifestId: string;
  zone: string;
  tuples: DrillTuple[];
  scenarios: Record<string, { host: string; expectedSignal: string }>;
}

/**
 * Parses the checked-in mutation manifest into the drill tuples an operator
 * may start. Fails closed: unknown mutation IDs, record types outside the
 * contracts allowlist, or duplicate LIVE coverage abort the parse.
 */
export function parseDrillManifest(raw: unknown): ParsedDrillManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('live drill manifest must be a JSON object');
  }
  const manifest = raw as Record<string, unknown>;
  const manifestId = typeof manifest.manifestId === 'string' ? manifest.manifestId : '';
  const zone = typeof manifest.zone === 'string' ? manifest.zone : '';
  if (!manifestId || !zone) {
    throw new Error('live drill manifest is missing manifestId or zone');
  }
  if (!Array.isArray(manifest.allowlist)) {
    throw new Error('live drill manifest is missing its allowlist');
  }

  const tuples: DrillTuple[] = [];
  for (const entry of manifest.allowlist) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('live drill allowlist entries must be objects');
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : '';
    const types = Array.isArray(record.types) ? record.types : [];
    const mutationIds = Array.isArray(record.mutationIds) ? record.mutationIds : [];
    if (!name || types.length === 0 || mutationIds.length === 0) {
      throw new Error('live drill allowlist entries must pin name, types, and mutationIds');
    }
    for (const type of types) {
      if (!CONTROLLED_FAULT_RECORD_TYPES.includes(type as never)) {
        throw new Error(`live drill allowlist record type is not permitted: ${String(type)}`);
      }
    }
    const liveIds = mutationIds.filter((id): id is LiveFaultMutationId =>
      (LIVE_FAULT_MUTATION_IDS as readonly string[]).includes(id as string)
    );
    if (liveIds.length !== mutationIds.length) {
      throw new Error(`live drill allowlist entry has a mutation ID outside LIVE-01–03: ${name}`);
    }
    if (liveIds.length > 0) {
      tuples.push({ name, types: [...types], mutationIds: liveIds });
    }
  }
  if (tuples.length === 0) {
    throw new Error('live drill manifest has no LIVE-01–03 allowlist entries');
  }

  const scenarios: ParsedDrillManifest['scenarios'] = {};
  const rawScenarios =
    typeof manifest.scenarios === 'object' && manifest.scenarios !== null
      ? (manifest.scenarios as Record<string, unknown>)
      : {};
  for (const id of LIVE_FAULT_MUTATION_IDS) {
    const scenario = rawScenarios[id];
    if (typeof scenario !== 'object' || scenario === null) continue;
    const record = scenario as Record<string, unknown>;
    scenarios[id] = {
      host: typeof record.host === 'string' ? record.host : '',
      expectedSignal: typeof record.expectedSignal === 'string' ? record.expectedSignal : '',
    };
  }

  return { manifestId, zone, tuples, scenarios };
}

function readParsedManifest(manifestPath: string): ParsedDrillManifest | null {
  try {
    return parseDrillManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Exact fail-closed runner invocations for the fault phase of one scenario.
 * Restore stays an explicit operator action using the recorded recovery
 * artifact; the harness remains the only mutation path.
 */
export function planDrillStart(mutationId: LiveFaultMutationId, artifactsDir: string): string[][] {
  switch (mutationId) {
    case 'LIVE-01':
      return [['fixture-apply', 'LIVE-01', join(artifactsDir, 'live-01-recovery.json')]];
    case 'LIVE-02':
      return [['fixture-apply', 'LIVE-02', join(artifactsDir, 'live-02-recovery.json')]];
    case 'LIVE-03':
      return [
        ['bootstrap', join(artifactsDir, 'live-03-bootstrap.json')],
        [
          'apply',
          join(artifactsDir, 'live-03-bootstrap.json'),
          join(artifactsDir, 'live-03-recovery.json'),
        ],
      ];
  }
}

export type RunnerOutcome = { code: number; stderrTail: string };

export type SpawnRunner = (runnerPath: string, args: string[]) => Promise<RunnerOutcome>;

function defaultSpawnRunner(runnerPath: string, args: string[]): Promise<RunnerOutcome> {
  return new Promise((resolvePromise) => {
    // Arguments are a fixed array built from the manifest — no shell, no user
    // input in argv, and the runner reads its own secrets from its own files.
    const child = spawn(process.execPath, [runnerPath, ...args], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });
    child.on('error', (error) => resolvePromise({ code: -1, stderrTail: error.message }));
    child.on('close', (code) =>
      resolvePromise({ code: code ?? -1, stderrTail: stderr.slice(-1024) })
    );
  });
}

/**
 * Persistence for drill runs. The production store uses Drizzle; tests inject
 * an in-memory store with the same open-run uniqueness as the partial unique
 * index `drill_run_open_unique`.
 */
export interface DrillRunStore {
  list(tenantId: string): Promise<DrillRun[]>;
  insert(data: NewDrillRun): Promise<DrillRun>;
  /** Applies patch only when the run is currently in fromStatus. */
  transition(id: string, fromStatus: string, patch: Partial<NewDrillRun>): Promise<DrillRun | null>;
}

function createDrizzleRunStore(db: Env['Variables']['db']): DrillRunStore {
  type DrillDrizzle = {
    query: {
      drillRuns: {
        findMany(args: { where?: unknown; orderBy?: unknown; limit?: number }): Promise<DrillRun[]>;
      };
    };
    insert(table: unknown): {
      values(data: NewDrillRun): { returning(): Promise<DrillRun[]> };
    };
    update(table: unknown): {
      set(patch: Record<string, unknown>): {
        where(condition: unknown): { returning(): Promise<DrillRun[]> };
      };
    };
  };
  // The env database is the Postgres drizzle client at runtime; the union with
  // the legacy D1 client makes writes uncallable without this narrow cast
  // (same pattern as hono/routes/signup.ts AuthDrizzle).
  const drizzle = db.getDrizzle() as unknown as DrillDrizzle;
  return {
    async list(tenantId) {
      return drizzle.query.drillRuns.findMany({
        where: eq(drillRuns.tenantId, tenantId),
        orderBy: [desc(drillRuns.createdAt)],
        limit: 20,
      });
    },
    async insert(data) {
      const [row] = await drizzle.insert(drillRuns).values(data).returning();
      return row;
    },
    async transition(id, fromStatus, patch) {
      const [row] = await drizzle
        .update(drillRuns)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(drillRuns.id, id), eq(drillRuns.status, fromStatus)))
        .returning();
      return row ?? null;
    },
  };
}

export interface DrillRouteOptions {
  manifestPath?: string;
  runnerPath?: string;
  artifactsDir?: string;
  spawnRunner?: SpawnRunner;
  store?: DrillRunStore;
}

export function createDrillRoutes(options: DrillRouteOptions = {}) {
  const manifestPath =
    options.manifestPath ??
    process.env.DNSOPS_LIVE_MANIFEST_PATH ??
    join(repoRoot, 'docs/domain-operations/evidence/gate-3/asorin-live-mutation-manifest.json');
  const runnerPath =
    options.runnerPath ?? join(repoRoot, 'tools/controlled-live-harness/runner.mjs');
  const artifactsDir =
    options.artifactsDir ?? process.env.DNSOPS_DRILL_ARTIFACT_DIR ?? join(repoRoot, '.live-drills');
  const execRunner = options.spawnRunner ?? defaultSpawnRunner;

  const routes = new Hono<Env>();

  routes.use('*', requireAuth);

  routes.get('/', async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');
    if (!db || !tenantId) {
      return c.json({ error: 'Database unavailable' }, 503);
    }

    const manifest = readParsedManifest(manifestPath);
    const runs = manifest ? await (options.store ?? createDrizzleRunStore(db)).list(tenantId) : [];
    return c.json({
      harness: {
        available: manifest !== null && existsSync(runnerPath),
        manifestId: manifest?.manifestId ?? null,
        zone: manifest?.zone ?? null,
      },
      tuples: manifest?.tuples ?? [],
      scenarios: manifest?.scenarios ?? {},
      runs,
    });
  });

  routes.post('/', requireWritePermission, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');
    const actorId = c.get('actorId');
    if (!db || !tenantId || !actorId) {
      return c.json({ error: 'Database unavailable' }, 503);
    }

    const validation = await validateBody(c, {
      mutationId: enumValue('mutationId', LIVE_FAULT_MUTATION_IDS),
    });
    if (!validation.success) {
      return validationErrorResponse(c, validation.error);
    }
    const mutationId = validation.data.mutationId;
    if (mutationId === undefined) {
      return c.json({ error: 'mutationId is required' }, 400);
    }

    const manifest = readParsedManifest(manifestPath);
    if (!manifest || !existsSync(runnerPath)) {
      return c.json({ error: 'Live drill harness is not available in this deployment' }, 409);
    }
    const tuple = manifest.tuples.find((entry) => entry.mutationIds.includes(mutationId));
    if (!tuple) {
      // Not on the allowlist: the requested mutation has no pinned record.
      return c.json({ error: 'Mutation is not allowlisted for this zone' }, 403);
    }

    const store = options.store ?? createDrizzleRunStore(db);
    try {
      const run = await store.insert({
        mutationId,
        recordName: tuple.name,
        status: 'requested',
        requesterActor: actorId,
        tenantId,
      });
      await new AuditEventRepository(db).create({
        action: 'live_drill_requested',
        entityType: 'drill_run',
        entityId: run.id,
        newValue: { mutationId, recordName: tuple.name },
        actorId,
        tenantId,
      });
      return c.json({ run }, 201);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return c.json({ error: 'Another drill is already open' }, 409);
      }
      throw error;
    }
  });

  routes.post('/:id/confirm', requireWritePermission, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');
    const actorId = c.get('actorId');
    if (!db || !tenantId || !actorId) {
      return c.json({ error: 'Database unavailable' }, 503);
    }

    const store = options.store ?? createDrizzleRunStore(db);
    const runs = await store.list(tenantId);
    const run = runs.find((candidate) => candidate.id === c.req.param('id'));
    if (!run) {
      return c.json({ error: 'Drill run not found' }, 404);
    }
    if (run.requesterActor === actorId) {
      return c.json({ error: 'A second operator must confirm the drill' }, 403);
    }
    const confirmed = await store.transition(run.id, 'requested', {
      status: 'approved',
      confirmerActor: actorId,
    });
    if (!confirmed) {
      return c.json({ error: 'Drill run is not awaiting confirmation' }, 409);
    }
    await new AuditEventRepository(db).create({
      action: 'live_drill_confirmed',
      entityType: 'drill_run',
      entityId: run.id,
      newValue: { confirmerActor: actorId },
      actorId,
      tenantId,
    });
    return c.json({ run: confirmed });
  });

  routes.post('/:id/start', requireWritePermission, async (c) => {
    const db = c.get('db');
    const tenantId = c.get('tenantId');
    const actorId = c.get('actorId');
    if (!db || !tenantId || !actorId) {
      return c.json({ error: 'Database unavailable' }, 503);
    }
    if (!existsSync(runnerPath) || !readParsedManifest(manifestPath)) {
      return c.json({ error: 'Live drill harness is not available in this deployment' }, 409);
    }

    const store = options.store ?? createDrizzleRunStore(db);
    const runs = await store.list(tenantId);
    const run = runs.find((candidate) => candidate.id === c.req.param('id'));
    if (!run) {
      return c.json({ error: 'Drill run not found' }, 404);
    }
    if (!(LIVE_FAULT_MUTATION_IDS as readonly string[]).includes(run.mutationId)) {
      return c.json({ error: 'Mutation is not allowlisted for this zone' }, 403);
    }
    // Conditional transition doubles as the concurrency guard: exactly one
    // start wins even if two operators click simultaneously.
    const started = await store.transition(run.id, 'approved', { status: 'started' });
    if (!started) {
      return c.json({ error: 'Drill run is not approved for start' }, 409);
    }
    await new AuditEventRepository(db).create({
      action: 'live_drill_started',
      entityType: 'drill_run',
      entityId: run.id,
      newValue: { startedBy: actorId },
      actorId,
      tenantId,
    });

    const steps = planDrillStart(run.mutationId as LiveFaultMutationId, artifactsDir);
    mkdirSync(artifactsDir, { recursive: true });
    void (async () => {
      let recoveryArtifact: string | null = null;
      for (const args of steps) {
        const outcome = await execRunner(runnerPath, args);
        if (outcome.code !== 0) {
          await store.transition(run.id, 'started', {
            status: 'failed',
            runnerMessage: `runner ${args[0]} exited ${outcome.code}: ${outcome.stderrTail}`.slice(
              0,
              1024
            ),
          });
          return;
        }
        const artifactArg = args.at(-1);
        if (artifactArg?.endsWith('recovery.json')) recoveryArtifact = artifactArg;
      }
      await store.transition(run.id, 'started', {
        status: 'fault_applied',
        recoveryArtifact,
        runnerMessage: 'Fault phase applied; restore required before the next drill',
      });
    })().catch(async (error) => {
      await store.transition(run.id, 'started', {
        status: 'failed',
        runnerMessage: `drill execution failed: ${String(error)}`.slice(0, 1024),
      });
    });

    return c.json({ run: started }, 202);
  });

  return routes;
}

export const drillRoutes = createDrillRoutes();
