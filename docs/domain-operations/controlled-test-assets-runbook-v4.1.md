# DNS Ops — Controlled Test Asset Runbook V4.1

**Applies to:** DNS Ops Lean Phase 0–1 Execution Contract V4.1  
**Purpose:** make LIVE-01, LIVE-02 and LIVE-03 repeatable without giving DNS Ops or MCP any provider-write capability.

---

# 1. Authority boundary

Provider-side mutations are performed only by the deterministic fault-injection harness.

```text
Implementing/reviewing agent
        ↓ invokes
Deterministic fault harness
        ↓ reads runtime secret
Test-zone provider API
```

The agent may run the harness. It must never receive or print the provider token.

The following are prohibited:

- direct provider API calls by the agent;
- provider credentials in prompts, logs, MCP results or Git;
- mutations outside the designated test zone;
- production or client-domain mutations;
- using the test credential from DNS Ops application code or MCP;
- manually editing the baseline while a fault run is active.

---

# 2. Required test assets and secrets

```text
DNSOPS_TEST_DOMAIN
DNSOPS_TEST_WEB_HOST
DNSOPS_TEST_MAIL_SUBDOMAIN
DNSOPS_TEST_ZONE_ID
DNSOPS_TEST_PROVIDER_KIND
DNSOPS_TEST_PROVIDER_TOKEN
```

The provider credential must:

- be scoped to exactly `DNSOPS_TEST_ZONE_ID`;
- allow only the minimum zone-read and DNS-record mutation operations;
- be stored as a runtime secret;
- be represented in configuration and logs only by a non-secret identifier or SHA-256 fingerprint;
- be revoked after the controlled-test phase.

The harness must allowlist the exact mutable names and record types before any mutation.

Example allowlist shape:

```ts
export type TestMutationAllowlist = {
  zoneId: string;
  records: Array<{
    name: string;
    types: Array<"A" | "AAAA" | "CNAME" | "TXT">;
    mutationIds: Array<"LIVE-01" | "LIVE-02" | "LIVE-03">;
  }>;
};
```

---

# 3. Deterministic harness contract

The implementation may choose file names and internals, but the repository must expose equivalent operator commands for:

```text
status      Show test-zone identity, allowlist and credential fingerprint.
prepare     Capture baseline, validate TTLs and prove rollback capability.
apply       Apply one named seeded fault.
verify      Verify provider state and authoritative DNS/HTTP evidence.
restore     Restore the exact captured baseline.
run         Execute a complete named LIVE scenario.
recover     Retry restoration from a recovery artifact.
```

Every command must emit a structured artifact containing:

```ts
export type FaultRunArtifact = {
  runId: string;
  mutationId: "LIVE-01" | "LIVE-02" | "LIVE-03";
  zoneId: string;
  targetNames: string[];
  baselineHash: string;
  providerCredentialFingerprint: string;
  appliedAt?: string;
  restoredAt?: string;
  providerResponses: string[];
  authoritativeEvidenceIds: string[];
  recursiveEvidenceIds: string[];
  scanTaskIds: string[];
  signalIds: string[];
  caseIds: string[];
  auditEventIds: string[];
  result: "PASS" | "FAIL" | "RECOVERY_REQUIRED";
  recovery?: {
    provider: string;
    zoneId: string;
    records: Array<{
      name: string;
      type: "A" | "AAAA" | "CNAME" | "TXT";
      desiredValue: string;
    }>;
    operatorCommands: string[];
  };
};
```

Secrets and full provider response headers must be redacted.

---

# 4. One-time TTL preparation

For each mutable DNS record:

1. Read and record the current value and TTL.
2. Set TTL to `60` through the harness.
3. Wait at least the **previous TTL plus 60 seconds** before capturing the healthy test baseline.
4. Query the authoritative nameservers directly and verify TTL `60` is being served.
5. Save the original value and TTL in the rollback artifact.

Do not begin LIVE-03 while the previous longer TTL may still be present in recursive caches.

A recursive answer may be observed, but it is not authoritative pass/fail evidence for a DNS mutation test.

---

# 5. Authoritative freshness for live DNS tests

For every DNS mutation and restoration, query the zone’s authoritative nameservers directly.

Persist:

- queried nameserver;
- query name and type;
- timestamp;
- response code;
- answer;
- TTL;
- AA flag when available;
- raw or normalized trace reference;
- any limitation in proving authority.

For registered test assets, `scan_request` must include this authoritative vantage even when ordinary portfolio scans operate with degraded authoritative evidence.

A stale recursive result cannot independently cause LIVE-03 to pass or fail.

---

# 6. RFC 9989 deterministic fixture resolver

All unit/integration fixtures for DMARC discovery use a stubbed resolver. They never use live DNS.

Required resolver contract:

```ts
export type DnsFixtureResponse =
  | { kind: "ANSWER"; values: string[] }
  | { kind: "NODATA" }
  | { kind: "NXDOMAIN" }
  | { kind: "SERVFAIL" }
  | { kind: "TIMEOUT" };

export interface DmarcFixtureResolver {
  resolveTxt(name: string): Promise<DnsFixtureResponse>;
  readonly queryTrace: string[];
}
```

Required assertions:

- exact ordered query trace;
- no network access;
- no more than eight tree-walk queries;
- deterministic NODATA/NXDOMAIN/SERVFAIL/timeout behavior;
- deterministic `psd=y`, `psd=n`, `np` and inherited-policy cases;
- multiple-record error behavior.

---

# 7. LIVE-01 — Redirect regression

## Prepare

- Verify `DNSOPS_TEST_WEB_HOST` has the expected canonical redirect.
- Capture healthy HTTP/HTTPS and apex/`www` matrix.
- Capture baseline hash.

## Fault

- Use the harness to apply the allowlisted redirect fault.
- Run MCP `scan_request`.
- Require `REDIRECT_TOPOLOGY_REGRESSION`.
- Open or retrieve the canonical case through MCP.
- Set disposition to acknowledged.

## Restore

- Restore the exact baseline through the harness.
- Run MCP `scan_request`.
- Require fresh evidence and case resolution.

## Reopen proof

- Apply the same fault again.
- Run MCP `scan_request`.
- Require the existing operational condition to reopen without duplicate active cases or alerts.
- Restore again and verify healthy state.

---

# 8. LIVE-02 — Indexability regression

## Prepare

- Verify the test page is expected to be indexable.
- Capture HTML, response headers and canonical baseline.

## Fault

- Introduce an allowlisted `noindex` response/header condition using the test harness or deterministic test-host deployment fixture.
- Run MCP `scan_request`.
- Require `HOMEPAGE_INDEXABILITY_REGRESSION`.

## Restore

- Restore baseline.
- Run MCP `scan_request`.
- Require fresh evidence and resolution.

No production page may be used.

---

# 9. LIVE-03 — Mail DNS configuration regression

## Prepare

- Use only `DNSOPS_TEST_MAIL_SUBDOMAIN`.
- Confirm no real mail flow depends on it.
- Confirm TTL `60` has fully propagated.
- Capture TXT baseline and authoritative evidence.

## Fault

- Apply the allowlisted SPF or DMARC test-record mutation through the harness.
- Verify the provider accepted it.
- Query authoritative NS directly.
- Run MCP `scan_request`.
- Require `MAIL_DNS_CONFIGURATION_REGRESSION`.

## Restore

- Restore the exact baseline.
- Query authoritative NS directly.
- Run MCP `scan_request`.
- Require fresh evidence and resolution.

The result proves only published DNS configuration regression. It must not claim real sender authentication or traffic failure.

---

# 10. Failure and recovery

On any interruption:

1. Stop further mutations.
2. Execute harness `restore`.
3. Query authoritative NS or the test web endpoint.
4. Compare current state with `baselineHash`.
5. If restoration fails, emit `RECOVERY_REQUIRED` with exact provider, zone, records, desired values and operator commands.
6. Do not continue Gate 3 until baseline restoration is proven.

The test provider token must be revoked after final review or immediately after suspected exposure.

---

# 11. Fresh reviewer use

The fresh reviewer may execute LIVE scenarios only through the deterministic harness.

The reviewer receives:

- exact SHA;
- V4.1 contract;
- this runbook;
- test-asset identifiers;
- permission to invoke the harness;
- no plaintext provider token;
- no builder session or claims before verdict.

The reviewer must verify restoration before returning a verdict.

---

# 12. Completion evidence

Gate 3 evidence must include:

- TTL preparation artifact;
- baseline hash;
- provider credential fingerprint;
- allowlist;
- direct authoritative traces;
- recursive traces where collected;
- mutation and restoration provider responses;
- MCP `scan_request` task IDs;
- signal, alert and case IDs;
- audit IDs;
- reopen proof;
- final baseline-restored proof.
