# DNS Ops Workbench — Recommended Repo Structure

## Chosen stack

### App shell
- TanStack Start
- Hono
- TanStack Query
- Tailwind + shadcn/ui

### Runtime for app shell
- Cloudflare Workers

### Database
- Postgres
- Drizzle ORM

### Collector / probe runtime
- Separate Node.js worker service

## Why this split exists

The app shell is optimized for a fast internal dashboard and typed app APIs.
The collector/probe runtime is split out because DNS ops evidence collection and future mail probing should not be forced into a pure edge runtime.

## Monorepo structure

```text
.
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   │   ├── __root.tsx
│   │   │   │   ├── index.tsx
│   │   │   │   ├── domains.$domain.tsx
│   │   │   │   ├── domains.$domain.history.tsx
│   │   │   │   └── api/
│   │   │   │       ├── snapshots.ts
│   │   │   │       ├── collect.ts
│   │   │   │       ├── findings.ts
│   │   │   │       └── fleet-report.ts
│   │   │   ├── components/
│   │   │   │   ├── domain/
│   │   │   │   ├── findings/
│   │   │   │   ├── records/
│   │   │   │   └── ui/
│   │   │   ├── lib/
│   │   │   │   ├── query/
│   │   │   │   ├── server/
│   │   │   │   ├── client/
│   │   │   │   └── format/
│   │   │   ├── styles/
│   │   │   └── entry.worker.ts
│   │   ├── hono/
│   │   │   ├── app.ts
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   └── validators/
│   │   ├── drizzle/
│   │   │   ├── config.ts
│   │   │   ├── schema/
│   │   │   ├── migrations/
│   │   │   └── queries/
│   │   ├── public/
│   │   ├── package.json
│   │   ├── wrangler.jsonc
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   └── collector/
│       ├── src/
│       │   ├── index.ts
│       │   ├── jobs/
│       │   │   ├── collect-domain.ts
│       │   │   ├── collect-mail.ts
│       │   │   ├── collect-delegation.ts
│       │   │   └── fleet-report.ts
│       │   ├── dns/
│       │   │   ├── resolvers/
│       │   │   ├── authoritative/
│       │   │   ├── recursive/
│       │   │   └── normalize/
│       │   ├── probes/
│       │   │   ├── policy.ts
│       │   │   ├── mta-sts.ts
│       │   │   └── smtp-starttls.ts
│       │   ├── persistence/
│       │   ├── telemetry/
│       │   └── config/
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
│
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   ├── repos/
│   │   │   ├── migrations/
│   │   │   └── client.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── domain.ts
│   │   │   ├── snapshot.ts
│   │   │   ├── observation.ts
│   │   │   ├── finding.ts
│   │   │   ├── suggestion.ts
│   │   │   ├── template.ts
│   │   │   └── enums.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rules/
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   ├── dns/
│   │   │   ├── mail/
│   │   │   ├── delegation/
│   │   │   ├── templates/
│   │   │   └── version.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── parsing/
│   │   ├── src/
│   │   │   ├── dns/
│   │   │   ├── dig/
│   │   │   ├── mail/
│   │   │   └── idn/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── testkit/
│       ├── src/
│       │   ├── fixtures/
│       │   ├── golden/
│       │   ├── benchmark-corpus/
│       │   └── helpers/
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   ├── memo/
│   ├── beads/
│   ├── benchmark-corpus/
│   └── rules/
│
├── package.json
├── turbo.json
├── tsconfig.base.json
├── biome.json
└── .github/
    └── workflows/
```

## Package responsibilities

### `apps/web`
- TanStack Start app shell
- Hono routes and server functions
- internal dashboard UI
- snapshot read APIs
- operator-triggered collection orchestration

### `apps/collector`
- separate Node runtime
- DNS collection jobs
- mail collection jobs
- delegation collection jobs
- optional non-DNS probes

### `packages/db`
- shared database client and schema

### `packages/contracts`
- shared TypeScript contracts and enums
- source of truth for snapshot/finding/suggestion shapes

### `packages/rules`
- deterministic rules engine
- versioned rule packs
- template-aware findings

### `packages/parsing`
- DNS parsing
- dig-style formatting
- mail-related parsing
- IDN helpers

### `packages/testkit`
- benchmark corpus
- fixtures
- golden tests
- test helpers for rules and parsers

## Initial routes to build

### UI
- `/`
- `/domains/$domain`
- `/domains/$domain?tab=dns`
- `/domains/$domain?tab=mail`
- `/domains/$domain?tab=history`

### API / server endpoints
- `POST /api/collect`
- `GET /api/snapshots/:domain`
- `GET /api/snapshots/:id`
- `GET /api/findings/:snapshotId`
- `POST /api/fleet-report` (later)

## Core tables to create first

- `domains`
- `snapshots`
- `observations`
- `record_sets`
- `findings`
- `suggestions`
- `ruleset_versions`

## Notes

- Start with on-demand collection, not scheduled jobs.
- Keep provider templates narrow and data-backed.
- Keep the collector isolated from the app shell from day one, even if early job execution is still simple.
