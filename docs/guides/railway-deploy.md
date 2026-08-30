# Railway Deployment Guide

Deploy the DNS Ops web app, collector, Postgres, and Redis on Railway.

Web is TanStack Start + Hono on Railway Node (`apps/web/app.config.ts` preset `node-server`, `apps/web/railway.toml`).

## Architecture

```
User → Railway (apps/web, Node)
            ↓ COLLECTOR_URL
       Railway (apps/collector + Postgres + Redis)
```

## How Railway builds this repo

Each service uses its own Dockerfile:

- Web: `apps/web/Dockerfile.railway` + `apps/web/railway.toml`
- Collector: `apps/collector/Dockerfile.railway` + `apps/collector/railway.toml`

## 1. Create Railway Project

1. Go to [railway.app](https://railway.app) → New Project
2. Choose "Deploy from GitHub repo" → select `dns-ops`
3. Add **two** services from the same repo (web and collector), each with its Dockerfile path above

## 2. Add Postgres and Redis

1. In the Railway project dashboard → "New" → "Database" → "PostgreSQL"
2. Link `DATABASE_URL` to both web and collector: Variables → Add Reference → `${{Postgres.DATABASE_URL}}`
3. Add Redis and link `REDIS_URL` to the collector

## 3. Set Environment Variables

Collector:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ✅ |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | ✅ for queue-backed jobs |
| `NODE_ENV` | `production` | ✅ |
| `PORT` | `3001` | ✅ |
| `INTERNAL_SECRET` | Generate: `openssl rand -hex 16` | ✅ |
| `ENABLE_ACTIVE_PROBES` | `false` | Default |

Web:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ✅ |
| `COLLECTOR_URL` | Collector public URL | ✅ |
| `INTERNAL_SECRET` | Same value as collector | ✅ |
| `NODE_ENV` | `production` | ✅ |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 16` | ✅ |
| `WEB_DOMAIN` | Public web origin | ✅ |

## 4. Deploy

Railway auto-deploys on push to master.

Web start: `node apps/web/.output/server/index.mjs`  
Collector start: `node apps/collector/dist/index.js` (image `CMD`; `apps/collector/railway.toml` also sets a start command)

## 5. DB Schema (release runner)

The web service `releaseCommand` runs `node scripts/run-migrations.mjs` on every deploy. That runner is the **sole automatic schema writer**. App request routes do not migrate, and `POST /api/migrate/reset` / `POST /api/migrate/rebuild` return 410 directing operators here.

After first deploy, schema should already be applied by release. To run the same runner out-of-band against a disposable/target DB:

```bash
# Using Railway CLI (web service context)
railway run node scripts/run-migrations.mjs

# Or locally with the target DATABASE_URL
DATABASE_URL="postgresql://..." node scripts/run-migrations.mjs
```

Prefer forward SQL migrations under `packages/db/src/migrations` over `drizzle-kit push` for environments that must match production deploy semantics.

## 6. Verify

```bash
WEB_URL=https://your-web.up.railway.app \
COLLECTOR_URL=https://your-collector.up.railway.app \
bun run smoke-test
```

Expected:

```
✅ Web Health Check          # GET /api/health — 503 if DB down
✅ Web Homepage
✅ Collector /healthz        # liveness
✅ Collector /readyz         # dependency-aware
```

## Troubleshooting

**Collector won't start** — Check `DATABASE_URL` is set. Collector validates env at startup and fails with clear messages.

**Web can't reach collector** — Verify `COLLECTOR_URL` matches Railway's public URL. Verify `INTERNAL_SECRET` matches between both services.

**Schema not applied** — Confirm the web service release command ran `node scripts/run-migrations.mjs` successfully, or run it out-of-band with the target `DATABASE_URL`. Do not use `/api/migrate/reset` or `/rebuild` (they are unavailable).

**Health check failing** — Collector `/healthz` = liveness (process alive). Collector `/readyz` = readiness (DB/queues; 503 if dependencies are down). Web `/api/health` = 503 if DB is down.

**Build fails** — Railway needs Node ≥20. The repo specifies `"engines": { "node": ">=20" }`.
