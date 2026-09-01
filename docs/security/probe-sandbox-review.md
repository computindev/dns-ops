# Probe Sandbox Security Review

**Document Version:** 2.0.0
**Date:** 2026-04-03
**Status:** Verified — gaps found and mitigated
**Reviewer:** PR-06 automated security audit
**Prior Version:** 1.0.0 (unverified — see §Revision History)

---

## Executive Summary

Version 1.0 of this document stated "no remaining gaps" without verifying the
implementation. **This was incorrect.** PR-06 found and fixed three real
vulnerabilities plus one wiring deficiency:

| Finding | Severity | Status |
|---------|----------|--------|
| IPv6 target policy bypass (including `fec0::/10` and mapped forms) | High | **Fixed — all IPv6 targets fail closed** |
| Redirect-to-private bypass (MTA-STS 3xx) | High | **Fixed** |
| `PROBE_CONCURRENCY` / `PROBE_TIMEOUT_MS` not wired | Medium | **Fixed** |
| No global semaphore (per-request only) | Medium | **Fixed** |
| DNS rebinding / TOCTOU | Medium | **Fixed for active probes** |

The probe sandbox is safe to enable with standard precautions **after** applying
the PR-06 fixes.

---

## Threat Model

### In-Scope Threats

| Threat | Severity | Mitigation | Verified |
|--------|----------|------------|---------|
| SSRF — private network access | Critical | SSRF guard + allowlist | ✅ |
| SSRF — cloud metadata services (169.254.169.254) | Critical | Link-local block | ✅ |
| SSRF — IPv4-mapped IPv6 (`::ffff:x.x.x.x`) | High | IPv6 fail-closed policy | ✅ Fixed in PR-06.1 |
| SSRF — redirect-to-private (HTTP 3xx) | High | Native HTTPS rejects every 3xx | ✅ Fixed |
| DNS rebinding (TOCTOU) | Medium | Checked-address pinning for SMTP and MTA-STS | ✅ Fixed |
| Concurrency abuse (probe flood) | Medium | Global semaphore | ✅ Fixed in PR-06 |
| Timeout exhaustion | Medium | `PROBE_TIMEOUT_MS` enforced | ✅ Fixed in PR-06 |
| Arbitrary target probing | Critical | MX-only allowlist | ✅ |
| Cross-tenant probe leakage | High | Tenant-scoped allowlist | ✅ |
| Allowlist TTL exhaustion | Low | 5-minute TTL auto-expiry | ✅ |

### Out-of-Scope

- DDoS of probe targets (network-level protection; out of application scope)
- Probe result poisoning (results are read-only observations)
- SMTP relay abuse (probes only read server capabilities; no mail sent)

---

## SSRF Attack Surface Analysis

### Private Network Ranges Blocked

All blocking is implemented in `apps/collector/src/probes/ssrf-guard.ts`.

| Range | Description | Covered By |
|-------|-------------|------------|
| `10.0.0.0/8` | RFC 1918 private | `checkIPv4` range table |
| `172.16.0.0/12` | RFC 1918 private | `checkIPv4` range table |
| `192.168.0.0/16` | RFC 1918 private | `checkIPv4` range table |
| `127.0.0.0/8` | Loopback | `checkIPv4` range table |
| `169.254.0.0/16` | Link-local | `checkIPv4` range table |
| `0.0.0.0/8` | This network | `checkIPv4` range table |
| `224.0.0.0/4` | Multicast | `checkIPv4` range table |
| `240.0.0.0/4` | Reserved | `checkIPv4` range table |
| `192.0.2.0/24` | TEST-NET-1 | `checkIPv4` range table |
| `198.51.100.0/24` | TEST-NET-2 | `checkIPv4` range table |
| `203.0.113.0/24` | TEST-NET-3 | `checkIPv4` range table |
| All IPv6 addresses, including `fec0::/10` | IPv6 policy not yet complete and maintained | `checkIPv6` fail-closed policy |
| IPv4-mapped and IPv4-compatible IPv6 forms | IPv6 policy is intentionally fail closed | `checkIPv6` fail-closed policy |

### IPv6 fail-closed policy

The controlled live harness accepts only checked public IPv4 answers. The
active-probe SSRF guard follows the same boundary: every IPv6 literal is
rejected until a complete, maintained IPv6 public-address policy exists. This
includes unique-local, deprecated site-local (`fec0::/10`), documentation,
multicast, IPv4-mapped, and IPv4-compatible forms. SMTP resolution and
MTA-STS resolution both reject such answers before creating a socket or HTTPS
request.

**Test coverage:** IPv6 boundary and mapped-form cases in
`ssrf-guard.test.ts`, resolved-address cases in `smtp-starttls.test.ts` and
`mta-sts.test.ts`, and the controlled policy in
`tools/controlled-live-harness/runner.mjs`.

### Gap Fixed: Redirect-to-Private via HTTP 3xx

**What was wrong (v1.0):** the MTA-STS policy fetch followed redirects by
default. A server returning `301 → http://127.0.0.1/exfil` could therefore
bypass the SSRF check on the original URL.

**The fix:** `mta-sts.ts` uses native `https.request`, which does not follow
redirects, and explicitly rejects every 3xx response. MTA-STS policy URLs are
served directly from `https://mta-sts.{domain}/.well-known/mta-sts.txt`.

---

## DNS Rebinding / TOCTOU Protection

### What is DNS rebinding?

An attacker controls a DNS server that returns a public IP on first resolution
(passing the SSRF hostname check) but switches to a private IP on the second
resolution (used by `net.connect` / TLS). Because the check and the connect are
separate operations, the private IP is used without ever being checked.

### Current mitigation

All active outbound paths resolve their target before opening a connection,
reject failed or unsafe resolution, and prevent a second DNS decision:

- **SMTP probe (`smtp-starttls.ts`):** resolves with `dns.promises.lookup`,
  checks the address through `checkSSRF`, and connects to the checked IPv4
  literal. DNS failures and every IPv6 answer fail closed.
- **MTA-STS probe (`mta-sts.ts`):** resolves every address with
  `dns.promises.lookup(..., { all: true })`, rejects unsafe, malformed, and
  IPv6 output, and passes a static `lookup` callback to native
  `https.request`. The request uses `servername` and `Host` for the original
  hostname while the TCP connection remains pinned to the checked address.
- **Webhook delivery (`notifications/webhook.ts`):** resolves a single public
  IPv4, rejects DNS errors, and uses native HTTPS with a static lookup/address
  pin. Redirects are rejected and the response is bounded and consumed under
  one cumulative deadline.


### Hardening note

Native HTTPS is used with `agent: false`, `rejectUnauthorized: true`, and no
redirect following. The request deadline remains active while the response
body is streamed, with a 64 KiB declared and actual body limit.

---

## Allowlist Derivation Strategy

### Authorization source (Issue #67)

Probe routes derive every allowlist entry — and every probe target — from
**fresh persisted DNS evidence only**: the tenant-owned domain → latest
complete snapshot → consistent record set → immutable source observations
chain created by the collector. Caller-supplied DNS-shaped payloads
(`txtRecords`, `mxRecords`, `dnsResults`) are rejected with `403` and never
mixed with trusted evidence.

Every request revalidates the persisted chain and fails closed unless:

- the domain is registered for the requesting tenant;
- the latest snapshot is `complete`;
- the exact MX / `_mta-sts` TXT record set is consistent and has source
  observations;
- each observation is a successful `NOERROR` query from a trusted collector
  vantage (missing, `mock`, and `probe` provenance is rejected, and
  authoritative answers must carry the AA flag);
- every relevant answer is still fresh, where freshness is
  `queriedAt + min(answer TTL, 5 minutes)` — zero TTL, future-dated, and
  boundary-expired evidence all fail;
- an optional SMTP hostname exactly matches a persisted MX target, and only
  port 25 is permitted.

### Derivation rules

| Source | Entry type | Port | TTL |
|--------|-----------|------|-----|
| Persisted DNS MX record answer | `mx` | 25 | 5 min |
| Persisted MTA-STS DNS TXT record | `mta-sts` | 443 | 5 min |

All entries carry a `derivedFrom` audit trail (domain, query type, raw answer
data) for incident investigation. The routes no longer create `custom`
entries; `addCustomEntry` remains available to in-process callers but is not
used by any HTTP route.

### Why persisted MX only?

MX records represent the operator's declared mail infrastructure. They are
authoritative DNS responses that the operator controls. Allowing arbitrary
hostnames would require trusting user-supplied input directly, which is
exactly what the pre-Issue-#67 routes did (caller `mxRecords`/`dnsResults`
and a fabricated `vantageIdentifier: "mock"` result).

### Tenant isolation

Each tenant has an independent `TenantScopedAllowlist` instance. There is no
shared state between tenants. `ProbeAllowlistManager.isAllowed(tenantId, ...)`
always scopes to the per-tenant map.

---

## Rate Limiting and Concurrency

### Configuration

| Env Var | Default | Min | Max | Enforced at |
|---------|---------|-----|-----|------------|
| `PROBE_CONCURRENCY` | 5 | 1 | 20 | `Semaphore` in probe-routes.ts |
| `PROBE_TIMEOUT_MS` | 30 000 ms | 1 000 | 120 000 | `AbortController` per probe |

### Gap fixed: config not wired (v1.0)

**What was wrong:** `probe-routes.ts` passed hardcoded `timeoutMs: 30000` and
`concurrency: 3` to probe functions — the configured values from `getEnvConfig()`
were never used.

**The fix (PR-06):** All probe calls in `probe-routes.ts` now read
`config.probes.timeoutMs` and `config.probes.concurrency`.

### Gap fixed: no global semaphore (v1.0)

**What was wrong:** `probeMXHosts` had internal batch-size limiting (`concurrency`
option), but single-host SMTP probes and MTA-STS probes had no concurrency limit.
Multiple concurrent HTTP requests each spawning probes could exceed the configured
limit by a factor of N.

**The fix (PR-06):** A module-level `Semaphore` (`apps/collector/src/probes/semaphore.ts`)
is lazily initialized from `PROBE_CONCURRENCY` and used in all probe route
handlers via `getProbeSemaphore().run(...)`.

---

## Egress Identity

| Attribute | Value |
|-----------|-------|
| Source | Collector service egress IP |
| Ports | 25 (SMTP), 443 (MTA-STS HTTPS) |
| User-Agent | `DNS-Ops-Probe/1.0` |
| Protocol | TCP/TLS only (no UDP) |

The web app (Cloudflare Workers) cannot make arbitrary TCP connections and does
not participate in probing. All probes originate from the collector Node.js
service only.

---

## Feature Flag

The probe sandbox is disabled by default:

```
ENABLE_ACTIVE_PROBES=false   # default — safe
ENABLE_ACTIVE_PROBES=true    # required to enable
```

The flag is enforced by middleware in `probe-routes.ts` before any probe handler
runs. Even with the flag disabled, unauthenticated requests are rejected by the
`requireServiceAuthMiddleware` before they reach the feature gate.

See: `apps/collector/src/config/env.ts` (ENABLE_ACTIVE_PROBES definition)

---

## Conclusion

### Recommendation

**Safe to enable in trusted-tenant deployments** after the PR-06 fixes are
deployed, with the following precautions:

```bash
ENABLE_ACTIVE_PROBES=true
PROBE_CONCURRENCY=5        # start conservative
PROBE_TIMEOUT_MS=30000
```

Monitor collector egress logs for anomalous probe volume or destination
patterns.

### Before enabling in untrusted-tenant environments

The active probes now pin their checked DNS results and enforce public-unicast
SSRF policy at the connection layer. Continue to restrict collector egress to
public unicast destinations at the network layer as defense in depth.

### Remaining gaps

| Gap | Severity | Recommendation |
|-----|----------|---------------|
| Complete public IPv6 policy is not yet maintained | Medium | All IPv6 literals and DNS answers fail closed until the policy exists |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-03-24 | Initial (unverified — incorrectly claimed zero remaining gaps) |
| 2.0.0 | 2026-04-04 | PR-06 security audit; fixed IPv4-mapped IPv6, redirect handling, config wiring, semaphore gaps, DNS pinning, and body/deadline limits |
| 2.1.0 | 2026-09-01 | Fail closed for all IPv6 active-probe targets; pin webhook HTTPS delivery and reject DNS failures, redirects, and oversized bodies |

---

## File References

| File | Purpose |
|------|---------|
| `apps/collector/src/probes/ssrf-guard.ts` | SSRF guard — IP/URL validation |
| `apps/collector/src/probes/allowlist.ts` | Tenant-scoped probe allowlist |
| `apps/collector/src/probes/mta-sts.ts` | Pinned MTA-STS policy fetch and body limits |
| `apps/collector/src/probes/semaphore.ts` | Global concurrency semaphore |
| `apps/collector/src/probes/ssrf-guard.test.ts` | SSRF guard unit tests |
| `apps/collector/src/probes/probe-ratelimit.test.ts` | Rate-limit/concurrency tests |
| `apps/collector/src/probes/probe-allowlist-integration.test.ts` | Allowlist integration tests |
| `apps/collector/src/e2e/probe-security.e2e.test.ts` | Full-stack security E2E tests |
| `apps/collector/src/jobs/probe-routes.ts` | Probe API routes (config wired) |
| `apps/collector/src/config/env.ts` | ENABLE_ACTIVE_PROBES + probe config |
