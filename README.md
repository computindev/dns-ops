# DNS Ops Workbench

DNS + mail operations platform with deterministic rules engine, guidance-only DNS change simulation, and multi-tenant operator workflows.

## Architecture

Split runtime. Live Railway project is `dns-ops`, environment `production`.

- **`apps/web`** — TanStack Start + Hono on Railway Node (UI + API). Vinxi preset `node-server` in `apps/web/app.config.ts`; deploy via `.railway/railway.ts` against that existing project.
- **`apps/collector`** — Node.js + PostgreSQL + Redis for DNS collection, probes, and background jobs
- **`packages/db`** — PostgreSQL/Drizzle schema + repositories
- **`packages/rules`** — Deterministic rules engine (DNS + mail rules, simulation engine)
- **`packages/contracts`** — Shared TypeScript types, DTOs, enums
- **`packages/parsing`** — DNS/mail/IDN parsing utilities
- **`packages/logging`** — Structured logging + metrics
- **`packages/testkit`** — Benchmark corpus and test fixtures

## Repo layout

```text
dns-ops/
├── apps/
│   ├── web/              # Railway Node web app + API
│   └── collector/        # Node.js DNS collection service
├── packages/
│   ├── contracts/        # Shared types and DTOs
│   ├── db/               # Drizzle ORM schema + repos
│   ├── parsing/          # DNS/mail parsing
│   ├── rules/            # Rules engine + simulation
│   ├── logging/          # Structured logging
│   └── testkit/          # Test fixtures
├── docs/
└── beads/                # Historical specs only
```

## Current product truth

### Domain 360 (`/domain/:domain`)

- **Overview** — stat cards, query scope, notes, tags
- **DNS** — delegation evidence, snapshots, findings, selectors
- **Mail** — mail findings (persisted), DKIM selectors with provider detection, preview badge, live diagnostics

The aggregate Domain 360 Overview simulation panel is gated by `VITE_FEATURE_SIMULATION` (default `false`). Existing actionable finding cards still expose an inline `Simulate` action for guidance-only results; the `/api/simulate` API does not apply DNS changes.

### Portfolio (`/portfolio`)

- Portfolio search with debounced filtering
- Saved filters (create, load, share, metadata-only edit)
- Monitored domains (CRUD, toggle, cross-links to Domain 360)
- Alerts (acknowledge, resolve, suppress, cross-links to Domain 360)
- Fleet reports (same-origin proxy to collector)
- Shared reports (create, expire, token-based sharing)
- Template overrides (provider-aligned override management)
- Audit log (monitoring, alert, remediation, shared-report events)

### DNS Change Simulation Engine

Simulation is a **guidance-only API**. It does not emit executable mutations or dry-run provider-aware record changes. `packages/rules/src/simulation/index.ts` returns `mode: 'GUIDANCE_ONLY'`, `detectedProvider: 'unknown'`, and `proposedChanges: []`.

The aggregate Domain 360 Overview simulation panel stays off unless `VITE_FEATURE_SIMULATION=true`; per-finding guidance on existing actionable cards is available independently of that gate.

- `POST /api/simulate` — returns non-executable guidance for supported finding types
- `GET /api/simulate/actionable-types` — lists finding types that have guidance
- Guidance covers SPF, DMARC, MX, MTA-STS, TLS-RPT, DKIM, SPF malformed, and CNAME conflicts
- No executable mutations, provider-confirmed change sets, or dry-run record writes

### Backend

- Authoritative datastore: **PostgreSQL only**
- Web runtime: configured Railway Node target (`node apps/web/.output/server/index.mjs`) + PostgreSQL
- Collector runtime: Node.js + PostgreSQL + Redis (queue-backed jobs)
- Collector health: `/healthz` liveness (process-only), `/readyz` dependency-aware (DB/queues; 503 when not ready)
- Web health: `GET /api/health` returns 503 if the DB is down
- Collector `/api/*` requires service auth
- All write paths tenant-scoped with actor attribution
- Monitoring, alert, remediation, shared-report mutations emit persisted audit events
- `401` vs `403` properly distinguished across all operator surfaces

### Test coverage

Do not treat hardcoded counts as current truth. Run:

```bash
bun run test
bun run --filter @dns-ops/web e2e
```

Default `bun run test` covers unit/integration plus harness and migration checks. E2E needs a running dev server (see Validation). Coverage emphasis: rules engine, auth, monitoring, alerts, portfolio, parsing. Write paths require auth with tenant isolation at schema, repository, and route layers. Runtime route tests follow mock-DB + `app.request()`.

## Setup

Prereqs:

- Bun 1.3.11+
- PostgreSQL 15+
- Redis 7+ (for queue-backed collector jobs)

```bash
bun install
cp .env.example .env
```

## Database

Schema ownership is the **release migration runner** (`scripts/run-migrations.mjs`) only, invoked automatically as the web service Railway `preDeploy`. Request-path traffic never applies DDL. Destructive HTTP recovery routes (`POST /api/migrate/reset`, `POST /api/migrate/rebuild`) return 410 and direct operators back to this runner.

Local / disposable DB:

```bash
cd packages/db
bun run build
bun run generate
bun run check-drift
DATABASE_URL=postgres://... bun run verify-migrations

# Apply forward migrations to a local or disposable database (same runner as deploy):
DATABASE_URL=postgres://... bun run migrate
# or from repo root:
DATABASE_URL=postgres://... node scripts/run-migrations.mjs
```

Do **not** use app HTTP endpoints to reset/rebuild schema — that path was removed in RT-4.

## Run

```bash
bun dev
# or individually
bun run --filter @dns-ops/web dev
bun run --filter @dns-ops/collector dev
```

## Validation

```bash
bun run lint
bun run typecheck
bun run test
bun run build
bun run smoke-test
```

E2E smoke (requires running dev server):

```bash
E2E_DEV_TENANT=test-tenant E2E_DEV_ACTOR=test-actor bun run --filter @dns-ops/web e2e
```

Optional live-network DNS smoke (opt-in, not in default gate):

```bash
RUN_LIVE_DNS_TESTS=1 bun run test:live-dns
```

Live DNS fixture env vars:

- `LIVE_DNS_RESOLVER_PRIMARY`
- `LIVE_DNS_RESOLVER_SECONDARY`
- `LIVE_DNS_DOMAIN`
- `LIVE_DNS_MAIL_DOMAIN`
- `LIVE_DNS_AUTHORITATIVE_DOMAIN`
- `LIVE_DNS_AUTHORITATIVE_NS_IP`

## API routes

`apps/web` applies `requireAuthMiddleware` to `/api/*` except `/api/health` and `/api/auth/*`. Snapshot, finding, delegation, and shared-report reads are not public.

| Route group | Path prefix | Auth | Description |
|---|---|---|---|
| Health | `/api/health` | Public | Web readiness; 503 if DB down |
| Auth | `/api/auth` | Public login | Session login/logout/me |
| Snapshots | `/api/snapshots` | Required | DNS snapshot CRUD, latest, diff |
| Findings | `/api/findings` | Required | Rule evaluation, acknowledge, false-positive |
| Selectors | `/api/selectors` | Required | Persisted DNS selectors |
| Simulation | `/api/simulate` | Required | Guidance-only simulation; no executable mutations or provider writes |
| Mail | `/api/mail` | Required | Mail diagnostics, remediation |
| Monitoring | `/api/monitoring` | Required | Domain monitoring CRUD + toggle |
| Alerts | `/api/alerts` | Required | Alert lifecycle (ack/resolve/suppress) |
| Shared reports | `/api/alerts/reports/shared/:token` | Required | Session-auth read of a shared report (token is not a public exemption) |
| Portfolio | `/api/portfolio` | Required | Search, filters, tags, reports, overrides, audit |
| Fleet reports | `/api/fleet-report` | Required | Collector proxy for fleet reports |
| Shadow comparison | `/api/shadow` | Required | Provider shadow comparison (API only, no UI) |
| Legacy tools | `/api/legacy-tools` | Required | DMARC/DKIM deeplinks, shadow stats |
| Delegation | `/api/delegation` | Required | NS delegation + DNSSEC evidence |

## Tracking

Live work is tracked in **GitHub issues**. `beads/` is historical specs, not the live tracker.

## Key docs

- `docs/architecture/runtime-topology.md`
- `docs/guides/railway-deploy.md`
- `docs/rules/query-scope.md`
- `docs/rules/trust-boundary.md`
