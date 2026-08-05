# asorin.ai Controlled-Live Operational PASS — Operator Handoff Runbook

**Status as of 2026-08-05T22:12Z:** BLOCKED pending operator inputs.
**Tracking issue:** https://github.com/computindev/dns-ops/issues/4 (`[BLOCKED]`).
**PASS contract:** `docs/domain-operations/evidence/gate-3/asorin-operational-pass-evidence-manifest.json` (`PENDING_EXTERNAL_DNS_OPS_EVIDENCE`).
**Checkpoint:** `docs/domain-operations/checkpoints/current-state.json` (`RESTORED_PENDING_DNS_OPS_EVIDENCE`).

This runbook is the single durable reference for whoever supplies the authorized
handoff. It records the exact inputs required, the protected runtime-file
contract, and the verified execution sequence. No step below may be skipped,
reordered, or substituted with restoration-only artifacts.

---

## 1. Current verified state (do not redo)

- LIVE-01/02/03 faults were applied and restored through the allowlisted harness;
  restoration baselines confirmed by direct authoritative-DNS and HTTPS header
  rechecks (2026-08-05).
- 12 checkpoint-linked durable JSON artifacts exist, all parse, and passed a
  redaction audit (0 unredacted sensitive-key values, 0 token-like values).
- Merged harness verified on clean `origin/master` (`5a4581f`):
  `bun run test:controlled-live-harness` → **45/45 pass**; both preflight
  commands confirmed fail-closed when their secret-file variables are absent
  (no artifact published, no network call).
- Historical DNS Ops sources are unavailable: May 7 GitHub production deployment
  references Railway project `47a76356-daa1-4409-8578-338550d64a23`, which
  returns project-not-found to the current Railway principal; no new DNS Ops
  project exists. `dnsops-live-fixtures` / `controlled-live-web` must NOT be
  repurposed as evidence infrastructure.
- What is missing is exclusively **operational lifecycle evidence** from an
  authorized DNS Ops deployment: timestamp-correlated scans, signals,
  canonical cases/audits, LIVE-01 reopen proof, and the two preflight artifacts.

## 2. Required operator inputs (all four, or the alternative)

1. **Authorized HTTPS MCP endpoint** (public IPv4-reachable, path `/mcp`) and a
   runtime-only bearer principal limited to exactly these scopes:
   `DOMAIN_READ`, `SIGNAL_READ`, `CASE_READ`, `CASE_WRITE`, `SCAN_REQUEST`.
2. **Isolated tenant/actor** with pre-registered `asorin.ai` `domainId`(s).
3. **Isolated-tenant authenticated web session** (`dns_ops_session`, 64-hex
   token) permitted to call `GET /api/portfolio/audit` and `GET /api/alerts`.
4. **Explicit controlled-run authorization** (approver, window, and run ID).

**Alternative:** explicit written approval to provision the documented isolated
DNS Ops web/collector/Postgres stack (potentially cost-bearing). Without this
approval, no infrastructure may be created.

Secrets, tokens, cookies, and session values must **never** be posted to
GitHub, committed, or logged. Deliver them through the approved secure channel
into the runtime files described below.

## 3. Protected runtime-file contract

Two **separate** files. Each must be: absolute path, regular file, non-symlink,
owner-only mode `0600`. Export variables into:

```bash
# File referenced by DNSOPS_MCP_PREFLIGHT_SECRET_FILE
export DNSOPS_MCP_ENDPOINT='https://<mcp-host>/mcp'
export DNSOPS_MCP_BEARER_TOKEN='<token:^[A-Za-z0-9_-]{32,}$>'

# File referenced by DNSOPS_WEB_EVIDENCE_SECRET_FILE
export DNSOPS_WEB_EVIDENCE_ENDPOINT='https://<web-host>'
export DNSOPS_WEB_EVIDENCE_SESSION_TOKEN='<token:^[a-f0-9]{64}$>'
```

Both files must contain exactly these two lines each (single trailing newline,
no extra lines), matching `parseProtectedValues` in
`tools/controlled-live-harness/runner.mjs`.

## 4. Execution sequence (clean master only)

Run from a clean detached worktree at `origin/master` — **not** the phase
implementation worktree (it carries an untracked legacy runner that shadows the
harness):

```bash
git worktree add --detach /tmp/dns-ops-live-run origin/master
cd /tmp/dns-ops-live-run
bun install --frozen-lockfile            # or symlink a vetted node_modules
bun run --filter @dns-ops/contracts build

# Gate 1 — MCP discovery preflight (initialize + tools/list only; no tool calls)
node tools/controlled-live-harness/runner.mjs mcp-evidence-preflight <redacted-artifact-path>

# Gate 2 — web evidence preflight (GET /api/portfolio/audit?limit=1 + GET /api/alerts?limit=1)
node tools/controlled-live-harness/runner.mjs web-evidence-preflight <redacted-artifact-path>
```

Only after both artifacts publish successfully, execute scenario collection in
manifest order using the closed MCP tool contract (exactly these tools, no
ad-hoc additions):

| Tool | Required scope |
| --- | --- |
| `domain_search`, `domain_get_profile`, `domain_get_posture`, `snapshot_compare`, `evidence_get` | `DOMAIN_READ` |
| `signal_list` | `SIGNAL_READ` |
| `case_get` | `CASE_READ` |
| `case_open`, `case_set_disposition` | `CASE_WRITE` |
| `scan_request` | `SCAN_REQUEST` |

Per scenario, collect timestamp-correlated evidence for every item in the
manifest (`requiredOperationalEvidence`): LIVE-01 (6 items, including the
re-fault reopen / no-duplicate-case-or-alert proof), LIVE-02 (4), LIVE-03 (5).
Use the authenticated web GETs for audit and alert evidence — MCP intentionally
exposes no generic audit/alert reads.

## 5. Redaction and persistence rules

- Persist only redacted artifacts (IDs, statuses, timestamps, fingerprints);
  never response bodies, tokens, cookies, or TXT values beyond fingerprints.
- Write artifacts atomically at mode `0600` via the harness reservation pattern;
  never overwrite an existing artifact.
- Link each artifact from `docs/domain-operations/checkpoints/current-state.json`
  and comment status-only updates on Issue #4.
- Keep every scenario **pending** until all manifest items validate; the
  checkpoint stays `RESTORED_PENDING_DNS_OPS_EVIDENCE` — never set PASS on
  restoration evidence alone.

## 6. Hard prohibitions

- No production/client DNS changes outside the allowlisted harness mutations.
- No retries against the inaccessible historical Railway project.
- No collection from any endpoint not delivered through the authorized handoff.
- No infrastructure provisioning without the explicit alternative approval.
