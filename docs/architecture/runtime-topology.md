# Runtime Topology

**Status:** Authoritative for current deploy shape

## Overview

This document defines the runtime topology for the DNS Ops Workbench: where product data lives and how the two Node services interact.

## Authoritative Data Store

**PostgreSQL is the single source of truth for all product data.**

| Data Type | Store | Notes |
|-----------|-------|-------|
| Domains | PostgreSQL | All domain records |
| Snapshots | PostgreSQL | Collection results |
| Observations | PostgreSQL | Individual DNS queries |
| Findings | PostgreSQL | Rules engine output |
| Suggestions | PostgreSQL | Remediation recommendations |
| Portfolios | PostgreSQL | Domain groupings |
| Audit logs | PostgreSQL | All write operations |

### Why PostgreSQL

1. **Consistency**: Both web and collector need the same data
2. **Transactions**: Complex writes require ACID guarantees
3. **Schema**: Drizzle ORM works identically for both runtimes
4. **Scalability**: Managed PostgreSQL handles our scale

## Runtime Contracts

### Web App (apps/web)

| Property | Value |
|----------|-------|
| Runtime | Railway Node (`node-server`) |
| Framework | TanStack Start + Hono |
| Database Access | Direct PostgreSQL (`DATABASE_URL`) |
| Start | `node apps/web/.output/server/index.mjs` |
| Health | `GET /api/health` — 503 if DB down |
| Schema | `node scripts/run-migrations.mjs` as Railway `releaseCommand` only |
| Primary Role | Dashboard + API |
| Write Scope | Operator-triggered collection requests, portfolio management |

**Connection Flow:**
```
Railway Node (apps/web) → PostgreSQL
```

Current deploy is Railway Node. Edge-worker bindings are not in use.

### Collector (apps/collector)

| Property | Value |
|----------|-------|
| Runtime | Node.js (Docker on Railway) |
| Framework | Hono |
| Database Access | Direct PostgreSQL |
| Queue | Redis (BullMQ) |
| Health | `/healthz` liveness (process-only); `/readyz` dependency-aware (DB/queues, 503 when not ready) |
| Primary Role | DNS collection, rules evaluation, probe execution |
| Write Scope | Snapshots, observations, findings, suggestions |

**Connection Flow:**
```
Node.js Container → PostgreSQL
Node.js Container → Redis (queue-backed jobs)
```

## Environment Matrix

### Local Development

| Variable | Value | Used By |
|----------|-------|---------|
| `DATABASE_URL` | `postgresql://user@localhost:5432/dns_ops` | Both |
| `COLLECTOR_URL` | `http://localhost:3001` | Web |
| `REDIS_URL` | `redis://localhost:6379` | Collector queues |
| `NODE_ENV` | `development` | Both |

### Staging / Production

| Variable | Value | Used By |
|----------|-------|---------|
| `DATABASE_URL` | Managed Postgres URL | Both |
| `COLLECTOR_URL` | Collector public URL | Web |
| `REDIS_URL` | Managed Redis URL | Collector queues |
| `INTERNAL_SECRET` | Shared service secret | Both |
| `NODE_ENV` | `staging` / `production` | Both |

## Railway Configuration

Web (`apps/web/railway.toml`): Dockerfile `apps/web/Dockerfile.railway`, `releaseCommand = node scripts/run-migrations.mjs`, `startCommand = node apps/web/.output/server/index.mjs`, `healthcheckPath = /api/health`.

Collector (`apps/collector/railway.toml`): Dockerfile `apps/collector/Dockerfile.railway`, `healthcheckPath = /readyz`.

HTTP `POST /api/migrate/reset` and `POST /api/migrate/rebuild` return 410.

## Unused edge bindings

Product data is PostgreSQL only. There is no edge-worker config in this repo.

## Invariants

1. **Single Source of Truth**: All product data reads and writes go to PostgreSQL
2. **No Silent Drift**: If PostgreSQL is unavailable, operations fail explicitly (`/api/health` and collector `/readyz` return 503)
3. **Consistent Schema**: Both runtimes use the same Drizzle schema from `@dns-ops/db`
4. **No request-path DDL**: Schema changes go through `scripts/run-migrations.mjs` only

## Startup Validation

Both web and collector must validate their configuration at startup:

```typescript
function validateConfig(config: RuntimeConfig): void {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL required');
  }

  if (config.environment === 'production' && !config.collectorUrl) {
    throw new Error('COLLECTOR_URL required in production');
  }
}
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Railway                                      │
│  ┌─────────────┐         ┌─────────────┐                        │
│  │  Web        │         │  Collector  │                        │
│  │  Node       │──SQL──┐ │  Node       │──SQL──┐                │
│  │  (TanStack  │       │ │  + Redis    │       │                │
│  │   Start)    │       │ └─────────────┘       │                │
│  └─────────────┘       │                       │                │
└────────────────────────┼───────────────────────┼────────────────┘
                         ▼                       ▼
              ┌─────────────────────────────────────────┐
              │           PostgreSQL                    │
              └─────────────────────────────────────────┘
```

## Collection Patterns

### Synchronous vs Asynchronous Collection

The collector supports two patterns for DNS collection:

| Pattern | Endpoint | Use Case | Redis Required |
|---------|----------|----------|----------------|
| Synchronous | `POST /api/collect/domain` | Ad-hoc single domain checks | No |
| Asynchronous | Job Queue | Scheduled monitoring, fleet reports | Yes |

#### Synchronous Single-Domain Collection

Single-domain collection runs synchronously by design. This decision provides:

1. **Immediate Feedback**: Users get instant results without polling or websockets
2. **No Redis Dependency**: Works without infrastructure overhead for basic usage
3. **Simpler Error Handling**: Errors returned directly in HTTP response
4. **Request-Response Semantics**: DNS collection is fast enough (<5s typically)

The job queue (BullMQ) exists but is intentionally NOT used for single-domain ad-hoc
collection. See `apps/collector/src/jobs/collect-domain.ts` for implementation details.

#### When to Use the Job Queue

- Scheduled monitoring refreshes (`scheduleMonitoringJob`)
- Fleet report generation (`getReportsQueue`)
- Bulk domain processing (future: batch collection endpoint)

## Authoritative Querying

### Current Limitation (DNS-001)

**True authoritative DNS querying is NOT yet implemented.**

The current implementation uses Node.js's built-in `dns` module, which has a
critical limitation: it does not expose the AA (Authoritative Answer) flag from
DNS responses. This means:

1. **AA flag is always false** in query results, regardless of whether the
   response actually came from an authoritative server
2. **Lame delegation detection is limited** - we can only detect failures
   (timeouts, refused, errors), not truly non-authoritative responses
3. **DNSSEC validation source metadata is incomplete** - AD (Authentic Data)
   flag is also not reliably available

### Workaround

The current "authoritative" collection strategy uses `dns.setServers()` to
query specific nameservers, but this doesn't guarantee authoritative responses
and cannot verify the AA flag.

### Future Implementation

To enable true authoritative querying with AA flag detection:

1. **Use dns-packet library**: Send raw UDP/TCP DNS queries
2. **Parse response flags directly**: Extract AA, AD, TC bits from response
3. **Implement EDNS0 support**: Handle larger responses and DNSSEC

Until true authoritative querying is implemented:

- `DelegationCollector.detectLameDelegation()` only reports actual failures
  (timeout, refused, error), not non-authoritative responses
- The `not-authoritative` reason code is currently unused
- Users may see "successful" responses from servers that aren't actually
  authoritative for the zone

This is a known limitation tracked as DNS-001.

## Related Documents

- [Query Scope](../rules/query-scope.md) - DNS query policies
- [Trust Boundary](../rules/trust-boundary.md) - Probe policies
- [Railway deploy](../guides/railway-deploy.md) - Current deploy shape
- [README](../../README.md) - Operator entrypoint
