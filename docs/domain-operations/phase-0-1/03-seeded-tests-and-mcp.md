# 12. Seeded-fault evaluation

Natural production failures are not required for Gate 3.

The phase must use deterministic fixtures and controlled non-production mutations.

## 12.1 Fixture matrix

Required fixture failures:

| ID | Seeded condition | Expected result |
|---|---|---|
| FIX-01 | Rule evaluator throws | Explicit UNKNOWN/partial; never healthy |
| FIX-02 | Authoritative evidence unavailable | Coverage gap with retry/manual action |
| FIX-03 | SPF nested include is present | First-level-only limitation; no complete ten-term claim |
| FIX-04 | RFC 9989 inherited policy | Correct tree-walk result and trace |
| FIX-05 | Stale TLS/HTTP evidence | Needs setup/evidence; not a signal |
| FIX-06 | Duplicate observation/signal attempt | One canonical signal/alert/case |

Required result:

```text
6 / 6 fixtures detected and classified correctly
0 false-green outcomes
0 duplicate operational objects
```

### Deterministic resolver requirement

All RFC 9989/tree-walk fixtures run against a typed stub resolver with fixed scripted responses. They must not query live DNS.

The fixture resolver must support:

- TXT answer;
- NODATA;
- NXDOMAIN;
- SERVFAIL;
- timeout;
- multiple DMARC records;
- ordered query trace;
- assertion that no tree walk exceeds eight queries.

Live DNS is reserved for the separately authorized LIVE cases and is never a dependency of the deterministic unit/integration suite.

## 12.2 Controlled live mutations

Run on authorized non-production assets.

### Execution authority

All provider-side mutations and restorations are executed by the deterministic fault-injection harness using the scoped test-zone credential from §4.2. This capability is test infrastructure only and is not linked to MCP or normal DNS Ops application services.

The harness must:

- capture and hash the pre-test baseline;
- refuse non-allowlisted zones, hosts, record types or mutation IDs;
- write an audit record before and after each mutation;
- verify the provider response;
- restore the exact baseline on normal completion;
- attempt restoration after test failure or interruption;
- emit a manual recovery artifact if automatic restoration fails.

### TTL and cache preparation

For every mutable DNS record:

- configure TTL `60` before the live-test window;
- wait at least the previous TTL plus a safety margin before capturing the healthy baseline;
- record the effective TTL in the test artifact;
- do not begin LIVE-03 while an earlier, longer TTL may still be cached.

### Authoritative freshness requirement

For DNS mutation tests, recursive resolver output may be recorded but cannot be the sole pass/fail evidence.

`scan_request` for registered test assets must include a direct query to the zone's authoritative nameservers and persist:

- nameserver queried;
- response code;
- answer;
- query timestamp;
- AA flag when available;
- trace or explicit limitation.

This test-specific authoritative path is required even when general portfolio authoritative evidence remains in a degraded mode. A cached recursive answer cannot fail or pass LIVE-03 by itself.

Required mutations:

### LIVE-01 — Redirect regression

- capture healthy baseline;
- remove or break expected canonical redirect;
- run `scan_request`;
- detect `REDIRECT_TOPOLOGY_REGRESSION`;
- open case;
- acknowledge;
- restore redirect;
- run `scan_request`;
- resolve from fresh evidence;
- reintroduce fault;
- run `scan_request`;
- reopen the same operational condition without duplicate case creation.

### LIVE-02 — Indexability regression

- capture healthy baseline;
- introduce `noindex` or `X-Robots-Tag: noindex`;
- run `scan_request`;
- detect `HOMEPAGE_INDEXABILITY_REGRESSION`;
- restore;
- verify resolution from fresh evidence.

### LIVE-03 — Mail DNS configuration regression

Use `DNSOPS_TEST_MAIL_SUBDOMAIN`, not a production mail domain.

- capture baseline SPF/DMARC test configuration;
- mutate an approved test record;
- run `scan_request`;
- detect `MAIL_DNS_CONFIGURATION_REGRESSION`;
- restore;
- verify resolution.

No real email flow or sender-authentication claim is permitted.

## 12.3 Gate 3 — End of engineering day 12

Required:

- 6/6 fixtures pass;
- 3/3 controlled mutations detected;
- 3/3 correct signal types;
- 0 coverage gaps incorrectly promoted to signals;
- LIVE-01 completes open → acknowledge → resolve → reopen;
- no duplicate alert/case path;
- manual-work baseline shows which named checks are now automated or shortened;
- false-green count is zero.

The absence of a naturally occurring production failure does not fail Gate 3.

---

# 13. MCP Phase 1

## 13.1 Deployment

- `/mcp` inside `apps/web`;
- protected by Cloudflare Access or the existing internal edge boundary;
- no separate Worker;
- no public exposure;
- no OAuth;
- no management UI.

## 13.2 Phase 1 authorization is deliberately primitive

Use a static secret configuration mapping bearer-token hashes to principals.

```ts
export type Phase1McpScope =
  | "DOMAIN_READ"
  | "SIGNAL_READ"
  | "CASE_READ"
  | "CASE_WRITE"
  | "SCAN_REQUEST";

export type Phase1McpPrincipal = {
  principalId: string;
  actorId: string;
  tenantId: string;
  tokenSha256: string;
  scopes: Phase1McpScope[];
  enabled: boolean;
};
```

Requirements:

- long random bearer tokens;
- only token hashes stored in the map;
- map supplied through secret configuration;
- actor and tenant derived from the matched principal, never from tool arguments;
- application services re-check tenant and scope;
- manual token creation/rotation;
- no refresh tokens;
- no delegated provider credentials;
- no authorization framework beyond this map in Phase 1.

Cloudflare Access authenticates the edge; the application map authorizes DNS Ops tools.

## 13.3 Required tools

Exactly eleven tools (issue #61 added `explain_case`):

### Read

```text
domain_search
domain_get_profile
domain_get_posture
snapshot_compare
evidence_get
signal_list
case_get
explain_case
```

### Commands

```text
case_open
case_set_disposition
scan_request
```

`scan_request` is mandatory because the full MCP loop must be exercised through MCP rather than through an application-service bypass.

## 13.4 Command controls

### `case_get`

- requires `CASE_READ`.

### `explain_case`

- requires `CASE_READ`;
- takes a case kind (closed-world `InternalSignalKind`);
- returns the matching approved playbook excerpt parsed from `docs/playbooks/`;
- deterministic: no LLM and no provider access.

### `case_open`

- requires `CASE_WRITE`;
- stable deduplication key;
- idempotency key;
- returns existing active case for duplicate condition.

### `case_set_disposition`

- requires `CASE_WRITE`;
- accepts `expectedVersion`;
- rejects stale concurrent writes;
- creates an audit event.

### `scan_request`

- requires `SCAN_REQUEST`;
- accepts a registered domain ID, never an arbitrary URL;
- enforces tenant membership;
- has idempotency key;
- applies rate limit;
- returns a task/snapshot reference;
- uses the same collector/probe safety boundaries as the UI.

## 13.5 Internal MCP harness

The first MCP consumer is a deterministic harness.

It must test:

- all ten schemas;
- successful typed results;
- invalid tool input;
- invalid IDs;
- disabled principal;
- insufficient scope;
- cross-tenant denial;
- stale evidence;
- duplicate `case_open`;
- stale `expectedVersion`;
- repeated `scan_request` idempotency;
- rate limiting;
- audit creation;
- application-service/MCP parity;
- no raw internal exception leakage.

Buzz is not connected until this harness and independent review pass.
