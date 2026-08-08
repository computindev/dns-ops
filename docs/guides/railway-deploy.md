# Railway Deployment Guide

Deploy the DNS Ops collector + Postgres on Railway, web app on Cloudflare Pages.

## Architecture

```
User → Cloudflare Pages (apps/web)
            ↓ COLLECTOR_URL
       Railway (apps/collector + Postgres)
```

## How Railway builds this repo

Railway uses [Railpack](https://railpack.com) to auto-detect the monorepo:
- Detects `bun.lock` → uses Bun as package manager
- Reads `railway.toml` for build/start commands
- Falls back to `railpack.json` if using Railpack directly
- Handles workspace resolution automatically

Both config files are provided. Railway uses whichever it detects first.

## 1. Create Railway Project

1. Go to [railway.app](https://railway.app) → New Project
2. Choose "Deploy from GitHub repo" → select `dns-ops`
3. Railway reads `railway.toml` and configures the build automatically

## 2. Add Postgres

1. In the Railway project dashboard → "New" → "Database" → "PostgreSQL"
2. Railway creates the DB and exposes `DATABASE_URL` as a variable
3. Link it to the collector service: Variables → Add Reference → `${{Postgres.DATABASE_URL}}`

## 3. Set Environment Variables

In the collector service settings → Variables:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ✅ Auto from Postgres plugin |
| `NODE_ENV` | `production` | ✅ |
| `PORT` | `3001` | ✅ (Railway maps to public URL) |
| `INTERNAL_SECRET` | Generate: `openssl rand -hex 16` | ✅ |
| `REDIS_URL` | (skip — optional) | ❌ |
| `ENABLE_ACTIVE_PROBES` | `false` | Default |

## 4. Deploy

Railway auto-deploys on push to master. The build:

```
bun install --frozen-lockfile
bun run build --filter=@dns-ops/collector...
```

This installs all workspace deps and builds the collector + its package dependencies (contracts, db, logging, parsing, rules) via turbo.

Start: `node apps/collector/dist/index.js`

## 5. DB Schema (release runner)

The web service `releaseCommand` runs `node scripts/run-migrations.mjs` on every deploy. That runner is the **sole automatic schema writer** (`_migrations_applied` ledger). App request routes do not migrate, and `POST /api/migrate/reset` / `POST /api/migrate/rebuild` return 410 directing operators here.

After first deploy, schema should already be applied by release. To run the same runner out-of-band against a disposable/target DB:

```bash
# Using Railway CLI (web service context)
railway run node scripts/run-migrations.mjs

# Or locally with the target DATABASE_URL
DATABASE_URL="postgresql://..." node scripts/run-migrations.mjs
```

Prefer forward SQL migrations under `packages/db/src/migrations` over `drizzle-kit push` for environments that must match production deploy semantics.

## 6. Deploy Web App (Cloudflare Pages)

```bash
cd apps/web
bun run build
wrangler pages deploy dist
```

Set secrets in Cloudflare:

```bash
wrangler pages secret put COLLECTOR_URL    # → Railway collector public URL
wrangler pages secret put INTERNAL_SECRET  # → same value as Railway
wrangler pages secret put DATABASE_URL     # → Railway Postgres URL (or use Hyperdrive)
```

### Optional: Hyperdrive (recommended for production)

Cloudflare Hyperdrive pools connections to Postgres:

```bash
npx wrangler hyperdrive create dns-ops-db \
  --connection-string="postgresql://..."
```

Update `wrangler.jsonc` with the Hyperdrive binding ID. The app reads `HYPERDRIVE_URL` over `DATABASE_URL` automatically.

## 7. Verify

```bash
WEB_URL=https://your-app.pages.dev \
COLLECTOR_URL=https://your-collector.up.railway.app \
bun run smoke-test
```

Expected:
```
✅ Web Health Check
✅ Web Homepage
✅ Collector /health
✅ Collector /healthz
✅ Collector /readyz
```

## Costs

| Service | Plan | Monthly |
|---------|------|---------|
| Cloudflare Pages | Free | $0 |
| Railway Hobby | $5 credit | ~$5 |
| Railway Postgres | Included | $0 |
| **Total** | | **~$5/mo** |

## Troubleshooting

**Collector won't start** — Check `DATABASE_URL` is set. Collector validates env at startup and fails with clear messages.

**Web can't reach collector** — Verify `COLLECTOR_URL` matches Railway's public URL. Verify `INTERNAL_SECRET` matches between both services.

**Schema not applied** — Confirm the web service release command ran `node scripts/run-migrations.mjs` successfully, or run it out-of-band with the target `DATABASE_URL`. Do not use `/api/migrate/reset` or `/rebuild` (they are unavailable).

**Health check failing** — `/healthz` = liveness (process alive). `/readyz` = readiness (DB connected, may 503 if DB unreachable).

**Build fails** — Railway needs Node ≥20. The repo specifies `"engines": { "node": ">=20" }`. Railpack auto-selects Node 22.
