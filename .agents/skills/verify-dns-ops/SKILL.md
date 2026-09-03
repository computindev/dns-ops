---
name: verify-dns-ops
description: Drive the real dns-ops (web UI + public health APIs) to prove behavior — launch it, run doctor, drive mapped features the way a user would, capture evidence into the run dir, write verify-kit receipts, clean up. Use for any task that changes user-facing behavior in this repo, before claiming a feature works, when reproducing a bug, when verification/pending.json lists features, and whenever someone says "verify", "prove it works", "reproduce", or names a feature id from features/README.md. Read features/README.md and the relevant feature file before driving anything.
---

# verify-dns-ops

Read `features/README.md` first, then the feature file(s) the task names. The map says how to use a feature and what proves it; this file says how to run and drive the app.

Surfaces: web (TanStack Start + Hono on port 3000), public health HTTP (web `/api/health`, collector `/healthz` + `/readyz` on port 3001), and the collector's authenticated programmatic probe API. SMTP STARTTLS is not exposed in the web UI; its safe local verification path drives the real collector route/repository with deterministic fixtures at the DNS, TCP, and TLS external boundaries.

## Launch

From the repo root, with `.env` copied from `.env.example` and Postgres on `DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/dns_ops`):

```bash
bun install
bun run --filter @dns-ops/web dev
```

Ready when: `curl -fsS --max-time 5 http://localhost:3000/api/health` returns JSON with `"status":"healthy"` (HTTP 200). HTTP 503 with `"status":"degraded"` means the process is up but the DB is not — doctor fails; do not drive authenticated features.

Collector (needed for Domain 360 live collection and the probe API, not for health.public / login / portfolio search UI chrome):

```bash
bun run --filter @dns-ops/collector dev
```

Ready when: `curl -fsS --max-time 5 http://localhost:3001/healthz` returns JSON with `"status":"ok"`.

Teardown: kill the pid you started (`kill $APP_PID`), never `pkill` by name.
Isolation: web binds `PORT` (default 3000), collector binds `PORT` (default 3001). Single instance per port — if the port is already taken, refuse to double-drive unless it is this checkout (`reuseExistingServer` is only for Playwright e2e).

## Doctor

```bash
.agents/skills/verify-dns-ops/harness/doctor.sh
```

Read-only. Exit 0 = worth driving. Checks bun/node, web `/api/health`, and (when `COLLECTOR_URL` is set) collector `/healthz`. There is no `/version` endpoint — do not invent one. There is no seeded `verify@example.test` user in this repo; login needs `VERIFY_USER` / `VERIFY_PASS` against a real users row, or local e2e headers `X-Dev-Tenant` + `X-Dev-Actor`. Run doctor first whenever anything looks off; a failing doctor means `blocked`, not `failed`.

## Drive

Harness: `.agents/skills/verify-dns-ops/harness/web.mts` (Playwright) and `.agents/skills/verify-dns-ops/harness/api.mts` (HTTP).
Identity:
- Local e2e: `X-Dev-Tenant=dns-ops-e2e` and `X-Dev-Actor=e2e-bot` (see `apps/web/playwright.config.mjs`). Never live OAuth.
- Login form: `VERIFY_USER` + `VERIFY_PASS` posted to `/api/auth/login` (signup is disabled 403).
Tenant: local drives use the `X-Dev-Tenant` header; there is no public “create tenant” API. Do not invent tenants in GitHub or Railway prod without authorization.
Selectors: ARIA role/label → `data-action-id` → `data-state`. This product has **no** `data-action-id` attributes; drive with roles/labels from the feature files. Class selectors and coordinates are lint errors.
End states: poll headings, URL, or HTTP JSON `status`; never sleep.

```bash
VERIFY_RUN_DIR=<run dir> bun .agents/skills/verify-dns-ops/harness/web.mts <feature-id>
VERIFY_RUN_DIR=<run dir> bun .agents/skills/verify-dns-ops/harness/api.mts <feature-id>
VERIFY_RUN_DIR=<run dir> bun .agents/skills/verify-dns-ops/harness/smtp-starttls-trust.mts
```

For `smtp.starttls-trust`, use the dedicated helper above. It drives the real collector route and persistence code in-process and runs the existing deterministic SMTP/TLS boundary fixtures; it never enables active probing against a provider and accepts no credentials.

## Evidence

Everything goes into `$VERIFY_RUN_DIR/`:
- `*.png` screenshots of the action and the resulting state; `trace.zip`; `console.log`; `failed-requests.log`
- `http/*.json` request/response pairs for API drives; `readback/*.json` for API/DB read-backs
- `cli-transcript.txt` for CLI drives
- `doctor.txt` from `harness/doctor.sh`

Standards: real user path only (no test-only endpoints, no internal setters); verify side effects through an independent read path; mocks only where a production boundary already isolates the external system (Playwright `X-Dev-Tenant` is the local auth boundary; collector probes stay off unless `ENABLE_ACTIVE_PROBES=true`); a dry-run is verified by observing what it skipped.

## Receipts (verify-kit — keep verbatim; in pi the same steps are the tools verify_run_new / verify_receipt)

```bash
node .agents/verify-kit/verify.mjs run-new --label <feature-id>     # → run id + `export VERIFY_RUN_DIR=<abs path>` (run harness from the repo root)
# … launch → doctor → drive → evidence → cleanup …
node .agents/verify-kit/verify.mjs receipt --run <run id> --feature <feature-id> --status passed \
  --notes-file $VERIFY_RUN_DIR/observations.md
# not passed? be explicit, with a reason:
node .agents/verify-kit/verify.mjs receipt --run <run id> --feature <feature-id> --status blocked --reason "<exact reason>"
```

Statuses: `passed` · `failed` · `blocked` · `unreachable` · `not_applicable`. No `skipped`. The receipt is bound to the exact code tree you verified (`code_digest`); you may verify before committing, but commit exactly that content — any later edit needs a new receipt.

## Cleanup

Kill what you started by pid/session. Do not drop the shared `dns_ops` database. Remove scratch files you created. **Never delete `verification/runs/<run_id>/`** — evidence survives cleanup.

## Helpers

| helper | invocation | purpose |
|---|---|---|
| `harness/doctor.sh` | `.agents/skills/verify-dns-ops/harness/doctor.sh` | read-only health |
| `harness/web.mts` | `VERIFY_RUN_DIR=… bun .agents/skills/verify-dns-ops/harness/web.mts <feature-id>` | Playwright driver + evidence capture |
| `harness/api.mts` | `VERIFY_RUN_DIR=… bun .agents/skills/verify-dns-ops/harness/api.mts <feature-id>` | HTTP driver + exchange capture |
| `harness/cli.sh` | `VERIFY_RUN_DIR=… .agents/skills/verify-dns-ops/harness/cli.sh <name> -- <command>` | isolated CLI transcript |
| `harness/smtp-starttls-trust.mts` | `VERIFY_RUN_DIR=… bun .agents/skills/verify-dns-ops/harness/smtp-starttls-trust.mts` | deterministic collector route, persistence, SMTP, and TLS trust proof |
