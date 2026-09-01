# DNS Ops API Reference

> **Source of Truth**: This document is derived from the actual route definitions in the codebase.
> Last updated: 2026-08-30

## Overview

DNS Ops consists of two services:
- **Web App** (`apps/web`): TanStack Start + Hono configured for Railway Node; UI and primary API at port 3000
- **Collector** (`apps/collector`): Node.js + PostgreSQL + Redis; DNS/mail collection at port 3001

`apps/web` applies `requireAuthMiddleware` to `/api/*` except `/api/health` and `/api/auth/*`. Snapshot, finding, delegation, and shared-report reads are not public. There is no token-only exemption for `/alerts/reports/shared/:token`.

---

## Web App API (`/api/*`)

Base URL: `http://localhost:3000/api`

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Service health check; 503 if DB down |

### Domain Operations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/domain/:domain/latest` | Yes | Get latest snapshot for a domain |
| POST | `/collect/domain` | Yes | Trigger DNS collection for a domain |

### Snapshot Data

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/snapshot/:snapshotId/observations` | Yes | Get raw DNS observations |
| GET | `/snapshot/:snapshotId/recordsets` | Yes | Get aggregated record sets |
| GET | `/snapshot/:snapshotId/delegation` | Yes | Get delegation data |
| GET | `/snapshot/:snapshotId/delegation/issues` | Yes | Get delegation issues |
| GET | `/snapshot/:snapshotId/findings` | Yes | Get findings for a snapshot |
| GET | `/snapshot/:snapshotId/findings/mail` | Yes | Get mail-specific findings |
| GET | `/snapshot/:snapshotId/selectors` | Yes | Get discovered DKIM selectors |
| GET | `/snapshot/:snapshotId/mail/check` | Yes | Get mail check results |
| GET | `/domain/:domain/delegation/latest` | Yes | Get latest delegation for domain |

### Snapshots Management (`/snapshots`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/snapshots` | Yes | List all snapshots (paginated) |
| GET | `/snapshots/:id` | Yes | Get snapshot by ID |
| GET | `/snapshots/domain/:domain` | Yes | Get snapshots for a domain |
| GET | `/snapshots/:id1/diff/:id2` | Yes | Compare two snapshots |

### Portfolio APIs (`/portfolio`)

> Backend portfolio APIs exist beyond the currently mounted `/portfolio` UI.
> The shipped operator surface is currently centered on shared reports; broader portfolio workflows remain phased.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/portfolio/domains` | Yes | List portfolio domains |
| POST | `/portfolio/domains` | Yes | Add domain to portfolio |
| PUT | `/portfolio/domains/:domain` | Yes | Update portfolio domain |
| DELETE | `/portfolio/domains/:domain` | Yes | Remove from portfolio |
| GET | `/portfolio/health` | Yes | Get portfolio health summary |
| POST | `/portfolio/bulk-scan` | Yes | Trigger bulk scan |

### Monitoring (`/monitoring`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/monitoring/domains` | Yes | List monitored domains |
| POST | `/monitoring/domains` | Yes | Add monitored domain |
| PUT | `/monitoring/domains/:id` | Yes | Update monitored domain |
| DELETE | `/monitoring/domains/:id` | Yes | Remove monitored domain |
| POST | `/monitoring/domains/:id/toggle` | Yes | Toggle monitoring status |

### Alerts (`/alerts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/alerts` | Yes | List alerts (with filters) |
| GET | `/alerts/:id` | Yes | Get alert detail |
| POST | `/alerts/:id/acknowledge` | Yes | Acknowledge an alert |
| POST | `/alerts/:id/resolve` | Yes | Resolve an alert |
| POST | `/alerts/:id/suppress` | Yes | Suppress an alert |
| GET | `/alerts/reports` | Yes | List shared reports |
| POST | `/alerts/reports` | Yes | Create shared report |
| POST | `/alerts/reports/:id/expire` | Yes | Expire shared report |
| GET | `/alerts/reports/shared/:token` | Yes | Read shared report (session auth required; token is not a public exemption) |

### Mail & Remediation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/collect/mail` | Yes | Run mail diagnostics |
| POST | `/remediation` | Yes | Create remediation request |
| GET | `/remediation` | Yes | List remediation requests |
| GET | `/remediation/stats` | Yes | Get remediation counts |
| GET | `/remediation/by-id/:id` | Yes | Get remediation request |
| GET | `/remediation/domain/:domain` | Yes | List remediation by domain |
| PATCH | `/remediation/:id` | Yes | Update remediation request |

### Findings & Rules

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/findings/:snapshotId` | Yes | Get findings (alias) |
| GET | `/findings/:snapshotId/summary` | Yes | Get findings summary |

### Ruleset Versions (`/ruleset-versions`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/ruleset-versions` | Yes | List ruleset versions |
| GET | `/ruleset-versions/current` | Yes | Get current ruleset version |
| GET | `/ruleset-versions/:id` | Yes | Get specific version |

### Shadow Comparison (`/shadow-comparison`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/shadow-comparison/run` | Yes | Run shadow comparison |
| GET | `/shadow-comparison/:id` | Yes | Get comparison result |
| GET | `/shadow-comparison/history` | Yes | Get comparison history |

### Provider Templates (`/mail/templates`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/mail/templates` | Yes | List provider templates |
| GET | `/mail/templates/:provider` | Yes | Get template for provider |

### Legacy Tools

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/legacy/log` | Yes | Log legacy tool usage |
| GET | `/legacy/config` | Yes | Get legacy config |
| GET | `/legacy/dmarc/deeplink` | Yes | Generate DMARC deeplink |
| GET | `/legacy/dkim/deeplink` | Yes | Generate DKIM deeplink |
| POST | `/legacy/bulk-deeplinks` | Yes | Generate bulk deeplinks |
| GET | `/legacy/shadow-stats` | Yes | Get shadow statistics |

---

## Collector API

Public health base URL: `http://localhost:3001`
Authenticated collector API base URL: `http://localhost:3001/api`

### Health & Readiness (root endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | No | Liveness probe |
| GET | `/health` | No | Liveness probe (alias) |
| GET | `/readyz` | No | Readiness probe (checks DB, queues) |

### DNS Collection (`/api/collect`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/collect/domain` | Yes | Collect DNS for a domain |
| POST | `/collect/mail` | Yes | Collect mail records |
| POST | `/collect/mail/check` | Yes | Ephemeral mail check (no persistence) |

### Probes (`/api/probe`)

> **Note:** Probes are for programmatic use only (collector, monitoring jobs).
> No operator UI is provided. Results are integrated into snapshot evidence.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/probe/mta-sts` | Yes | Probe MTA-STS policy |
| POST | `/probe/smtp-starttls` | Yes | Probe SMTP STARTTLS |
| GET | `/probe/allowlist` | Yes | Get probe allowlist |

### Fleet Reports (`/api/fleet-report`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/fleet-report/run` | Yes | Run fleet report |
| POST | `/fleet-report/import-csv` | Yes | Import domains from CSV |
| GET | `/fleet-report/:id` | Yes | Get report results |

### Monitoring Jobs (`/api/monitoring`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/monitoring/check/:id` | Yes | Run monitoring check |
| GET | `/monitoring/schedule` | Yes | Get monitoring schedule |

---

## Authentication

All protected endpoints require one of:
- `X-Internal-Secret` header (service-to-service)
- `X-API-Key` header — bare opaque token matched by SHA-256 hash against
  `API_PRINCIPALS_JSON`; tenant/actor come from the stored principal (#66)
- Session cookie (web UI)

The legacy `tenantId:actorId:secret` `X-API-Key` format is accepted only when
`ENABLE_LEGACY_API_KEY_AUTH=true` (literal, one release, default off) — see
`docs/security/api-principal-migration.md`.

In development mode, `X-Dev-Tenant` and `X-Dev-Actor` headers can bypass auth.

---

## Response Formats

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "error": "Error message",
  "message": "Detailed description",
  "code": "ERROR_CODE"
}
```

### Pagination
```json
{
  "items": [...],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Maintaining This Document

This document should be updated whenever:
1. New routes are added
2. Routes are modified or deprecated
3. Authentication requirements change

To verify routes match code, run:
```bash
grep -r "\.get\|\.post\|\.put\|\.delete" apps/*/src --include="*.ts"
```
