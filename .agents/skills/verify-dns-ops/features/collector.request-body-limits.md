---
id: collector.request-body-limits
surface: api
profile: critical
paths:
  - apps/collector/src/index.ts
  - apps/collector/src/middleware/request-body-limit.ts
  - apps/collector/src/middleware/request-body-limit.test.ts
  - apps/collector/src/jobs/fleet-report.ts
  - apps/collector/src/jobs/fleet-report.test.ts
  - apps/collector/src/jobs/probe-routes.ts
  - apps/collector/src/middleware/request-body-limit.routes.test.ts
  - .agents/skills/verify-dns-ops/harness/collector.mts
always_with: []
---
# Collector request-body limits

The collector accepts bounded request bodies on its JSON and CSV POST APIs. A caller that exceeds the 1,048,576-byte limit receives one stable JSON error before route work begins, while a body at the limit keeps the route's existing validation behavior.

## Sub-features

- Fleet report bodies on `/api/fleet-report/run` and `/api/fleet-report/import-csv`.
- Probe bodies on `/api/probe/mta-sts`, `/api/probe/smtp-starttls`, and `/api/probe/allowlist/generate`.
- Declared `Content-Length` overflow, streamed overflow without `Content-Length`, UTF-8 byte counting, the exact limit boundary, cancellation, and malformed-under-limit validation.

## How to get to it (user POV)

1. Run the collector from this checkout with `NODE_ENV=development`, a local or refused PostgreSQL URL, `ENABLE_ACTIVE_PROBES=true`, and `COLLECTOR_SKIP_LISTEN=true` for the route harness.
2. Send POST requests to the five production collector route boundaries listed above. Use `X-Dev-Tenant` and `X-Dev-Actor` only when driving the network server; the harness invokes the exported production collector app with the same route paths and does not add a test endpoint.

## Driving it with collector.mts

```bash
node .agents/verify-kit/verify.mjs run-new --label collector-request-body-limits
export VERIFY_RUN_DIR=verification/runs/$(node -e "const fs=require('fs'); const p=fs.readdirSync('verification/runs').filter((x)=>x!==''); console.log(p.sort().at(-1))")
NODE_ENV=development DATABASE_URL=postgresql://127.0.0.1:1/collector-body-limit-verification ENABLE_ACTIVE_PROBES=true COLLECTOR_SKIP_LISTEN=true VERIFY_RUN_DIR="$VERIFY_RUN_DIR" bun .agents/skills/verify-dns-ops/harness/collector.mts
```

The harness imports `apps/collector/src/index.ts`, calls its exported `fetch` at the real `/api/...` route boundaries, and records each exchange under `$VERIFY_RUN_DIR/http/`. It uses controlled `ReadableStream` requests so cancellation and the first unconsumed sentinel chunk are observable. It never calls `readRequestBodyBytes` directly, adds a route, or contacts a provider.

## Proof

### Expected observations

- Every one of the five POST paths returns status `413` for a declared `Content-Length` of `1048577` and for a streamed body whose first `1048576` bytes are followed by one extra byte. Every such response JSON is exactly `{ "error": "Request body too large", "maxBytes": 1048576 }`.
- A UTF-8 body made from `é` characters is rejected based on encoded byte length even when its JavaScript character length is below `1048576`; all five POST paths are exercised.
- A body encoded to exactly `1048576` bytes is not rejected as too large on every path. Existing route validation remains observable: fleet run and probe requests return their normal `400` validation response, and CSV import returns its normal `200` response.
- Malformed JSON under the limit returns the existing `400` response on fleet run and each probe path. Malformed CSV under the limit returns the existing missing-column `400` response.
- Declared overflow cancels before route parsing and consumes at most one runtime-prefetched chunk. Streamed overflow cancels the request reader after the first over-limit chunk and never pulls the controlled sentinel chunk, demonstrating bounded consumption rather than unbounded buffering.

### Forbidden observations

- A `413` body with a route-specific message, a character-count limit, a different maximum, or any extra response fields.
- Any `200`, `400`, `500`, or probe execution after a request has exceeded the byte limit.
- A body exactly at the limit being rejected, or malformed-under-limit input being treated as a successful request.
- A declared-overflow stream being consumed beyond the runtime's single possible prefetch, a streamed overflow consuming the sentinel, or a provider/production request being made.

### Read-back

- The harness reparses every actual `Response` body and stores status, headers, parsed JSON, request mode, and byte count in `verification/runs/<run>/http/*.json`.
- `verification/runs/<run>/readback/request-body-limit.json` contains the per-endpoint matrix of statuses, exact response bodies, pull counts, cancellation flags, and sentinel consumption. This is the independent raw-response/read-stream read-back; the feature has no persistent side effect to query.

## Gotchas

- The route harness deliberately uses the exported production collector app with a refused local database URL so early body-limit and validation paths cannot mutate a database. It must not be changed to call a helper directly or to add `/api/test` or `/api/debug` routes.
- `ENABLE_ACTIVE_PROBES=true` is required so probe middleware does not return its unrelated feature-disabled `503` before body parsing. The harness never supplies DNS evidence and stops before any outbound probe operation.
- A receipt is valid only for the exact code tree digest recorded by verify-kit; rerun both critical feature receipts after changing the harness or feature map.
