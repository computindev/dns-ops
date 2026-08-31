# Railway Deployment Guide

Live Railway project is **`dns-ops`**, environment **`production`**, with web, collector, Postgres, and Redis.

Do not create a second app project. Never use `dnsops-live-fixtures` as the app target.

Web is TanStack Start + Hono configured for Railway Node (`apps/web/app.config.ts` preset `node-server`). Project infrastructure lives in `.railway/railway.ts`.

## Architecture

```
User → Railway (apps/web, Node)
            ↓ COLLECTOR_URL
       Railway (apps/collector + Postgres + Redis)
```

## How Railway builds this repo

Infrastructure as Code in `.railway/railway.ts` is the sole Railway config. Do not add `railway.json` or `railway.toml`; those conflict with IaC.

Each service uses its own Dockerfile:

- Web: `apps/web/Dockerfile.railway` — start `node apps/web/.output/server/index.mjs`
- Collector: `apps/collector/Dockerfile.railway` — start `node apps/collector/dist/index.js`

Never start collector with the web Nitro path.

Web and collector `source` is GitHub `computindev/dns-ops` branch `master`. Pushes to master deploy those services. Use `railway up` only when you need a source-less rebuild; that will not set `commitHash`.

## 1. Existing Railway project

Link the CLI to project `dns-ops`, environment `production`. Do not run `railway init` or duplicate Postgres/Redis.

Preview drift with `railway config plan`. Do not `railway config apply` unless authorized.

## 2. Add Postgres and Redis

1. In the Railway project dashboard → "New" → "Database" → "PostgreSQL"
2. Link `DATABASE_URL` to both web and collector: Variables → Add Reference → `${{Postgres.DATABASE_URL}}`
3. Add Redis and link `REDIS_URL` to the collector

Keep existing variable values as `preserve()` in IaC. Do not write secrets or generated domains into source.

## 3. Set Environment Variables

Collector:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ✅ |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | ✅ for queue-backed jobs |
| `NODE_ENV` | `production` | ✅ |
| `DB_TLS_REJECT_UNAUTHORIZED` | `false` | ✅ Railway Postgres self-signed cert |
| `PORT` | `3001` | ✅ |
| `INTERNAL_SECRET` | Generate: `openssl rand -hex 16` | ✅ |
| `WORKER_ENABLED` | `true` | ✅ starts workers/schedules |
| `ENABLE_ACTIVE_PROBES` | `false` | Default |

Web:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ✅ |
| `COLLECTOR_URL` | Collector public URL | ✅ |
| `INTERNAL_SECRET` | Same value as collector | ✅ |
| `NODE_ENV` | `production` | ✅ |
| `DB_TLS_REJECT_UNAUTHORIZED` | `false` | ✅ Railway Postgres self-signed cert |

Do not add `COLLECTOR_URL` to collector.

## 4. Deploy

Preview with `railway config plan` against `dns-ops` / `production`. Do not `railway config apply` or `railway up` unless authorized.

Master GitHub auto-deploy is enabled for web and collector.

Web start: `node apps/web/.output/server/index.mjs`  
Collector start: `node apps/collector/dist/index.js`

Web health: `/api/health` (timeout 60s)  
Collector health: `/readyz` (timeout 60s; dependency-aware)

## 5. DB Schema (release runner)

The web service `preDeploy` command runs `node scripts/run-migrations.mjs` on every deploy. That runner is the **sole automatic schema writer**. App request routes do not migrate, and `POST /api/migrate/reset` / `POST /api/migrate/rebuild` return 410 directing operators here.

After first deploy, schema should already be applied by pre-deploy. To run the same runner out-of-band, first confirm the authorized Railway project, environment, and service. Never point this at `dnsops-live-fixtures`.

```bash
# Using Railway CLI (authorized web service context only)
railway run node scripts/run-migrations.mjs

# Or locally with the authorized target DATABASE_URL
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

**Collector won't start** — Check `DATABASE_URL` is set. Collector validates env at startup and fails with clear messages. Confirm the start command is `node apps/collector/dist/index.js`, not the web Nitro server.

**Web can't reach collector** — Verify `COLLECTOR_URL` matches Railway's public URL. Verify `INTERNAL_SECRET` matches between both services.

**Schema not applied** — Confirm the web service pre-deploy command ran `node scripts/run-migrations.mjs` successfully, or run it out-of-band with the target `DATABASE_URL`. Do not use `/api/migrate/reset` or `/rebuild` (they are unavailable).

**Health check failing** — Collector `/healthz` = liveness (process alive). Collector `/readyz` = readiness (DB/queues; 503 if dependencies are down). Web `/api/health` = 503 if DB is down. Railway rollout uses `/readyz` for collector. If logs show `self-signed certificate in certificate chain`, keep `DB_TLS_REJECT_UNAUTHORIZED=false` on web and collector (not `NODE_TLS_REJECT_UNAUTHORIZED`). Web public domain must target port 8080; collector 3001.

**Build fails** — Railway needs Node ≥20. The repo specifies `"engines": { "node": ">=20" }`.
