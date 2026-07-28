# DNS Ops — Lean Phase 0–1 Execution Contract V4.1

**Date:** 2026-07-28  
**Repository:** `computindev/dns-ops`  
**Status:** execution-ready after adversarial budget and test-runbook review  
**Primary classification:** internal infrastructure  
**Commercial status:** option value only  
**Hard cap:** 15 focused engineering days, 3 calendar weeks, 24 founder hours

---

# 1. Outcome

Own a maximum-fifteen-day internal infrastructure outcome for `computindev/dns-ops`.

Make the existing DNS and mail evidence trustworthy, add the smallest useful domain/TLS/web-health operating loop, make every uncertainty actionable, and expose those same application contracts through a minimal internal MCP endpoint proven first by a deterministic harness.

Do not build the commercial Domain Operations vision.

The result must answer:

> Can DNS Ops replace a defined set of manual domain checks, detect seeded failures without false-green results, drive one minimal disposition loop, and prove the same behavior through MCP within three weeks?

---

# 2. Decisions are closed before implementation

The following choices are authoritative. The implementation agent must not reopen them.

| Topic | Decision |
|---|---|
| SPF lookup analysis | **Degrade now.** Keep first-level inspection only. Do not build recursive SPF evaluation in this outcome. |
| DMARC RFC 9989 discovery | **Implement now.** DNS tree walk with a maximum of eight queries is required. |
| MCP fresh evidence | **Include now.** `scan_request` is a required Phase 1 MCP command. |
| Hypothesis graph | Deferred. Use human playbooks only. |
| DMARC RUA ingestion | Deferred to a separate outcome. |
| Agent analyst | Deferred. Human-operated first. |
| Buzz | Deferred until the deterministic MCP harness passes. |
| MCP deployment | `/mcp` inside `apps/web`, behind the internal edge boundary. |
| MCP authorization | Static token-to-principal/scope map. No OAuth, no management UI. |
| Coverage gaps | Separate setup/evidence queue. They do not auto-create signals or cases. |
| Legacy alerts | Must converge on signals or be silenced for migrated conditions. No parallel notification path. |
| Generic remediation | Downgrade to non-executable playbook prose. Never expose a generic record as a ready-to-apply mutation. |
| Controlled provider mutations | Executed only by the deterministic test-fault harness using a credential scoped to the designated test zone. DNS Ops product and MCP retain zero provider-write capability. |
| DNS mutation freshness | Mutable test records use pre-propagated TTL 60, and pass/fail evidence comes from direct authoritative-NS queries rather than recursive cache alone. |
| RFC 9989 fixtures | All tree-walk fixtures use a stubbed resolver with fixed responses and no live-network dependency. |

The hard budget is authoritative both for time and for these scope decisions.

---

# 3. Hard budget

## 3.1 Engineering budget

| Workstream | Maximum |
|---|---:|
| Repository truth and baseline | 3 days |
| DNS/mail correctness foundation | 5 days |
| Minimal internal operating loop | 4 days |
| MCP endpoint and deterministic harness | 3 days |
| **Total** | **15 days** |

These are caps, not targets.

## 3.2 Calendar budget

- Three calendar weeks maximum.
- No automatic extension.
- Any deferred subsystem requires a new outcome contract and budget.
- Work that cannot fit must be represented honestly as deferred or blocked.

## 3.3 Founder-attention budget

Exactly 24 hours are reserved:

| Founder activity | Budget |
|---|---:|
| Day 0 portfolio and current-manual-work baseline | 2.0 h |
| Select and authorize non-production fault-injection assets | 1.0 h |
| Declare purpose/criticality for up to 30 domains | 1.5 h |
| Review and calibrate six playbooks drafted by the agent | 4.0 h |
| Four gate reviews | 3.0 h |
| Review UNKNOWN language and setup UX | 2.0 h |
| Fresh-review setup and adjudication | 2.5 h |
| Standards/product decisions that genuinely require authority | 3.0 h |
| Final internal acceptance on representative domains | 3.0 h |
| Contingency | 2.0 h |
| **Total** | **24.0 h** |

The agent must not consume founder time for implementation-order, naming, file-selection or test decisions it can resolve from the repository.

---

# 4. Day 0 inputs supplied by the founder

These are bounded founder duties, not agent blockers to rediscover.

## 4.1 Internal portfolio

Select a maximum of 30 domains for the initial portfolio.

For each:

```ts
export type DomainPurpose =
  | "WEB"
  | "MAIL"
  | "WEB_AND_MAIL"
  | "REDIRECT"
  | "PARKED"
  | "UNKNOWN";

export type InternalDomainProfile = {
  domainId: string;
  purpose: DomainPurpose;
  responsibleActorId?: string;
  criticality: "HIGH" | "NORMAL" | "LOW";
};
```

No additional commercial ownership roles are authorized.

## 4.2 Controlled test assets

Designate:

```text
DNSOPS_TEST_DOMAIN
DNSOPS_TEST_WEB_HOST
DNSOPS_TEST_MAIL_SUBDOMAIN
DNSOPS_TEST_ZONE_ID
DNSOPS_TEST_PROVIDER_KIND
DNSOPS_TEST_PROVIDER_TOKEN
```

Requirements:

- non-production;
- no customer traffic;
- no real inbound or outbound mail dependency;
- explicit authorization to mutate during the test;
- baseline configuration captured before mutation;
- rollback procedure available;
- changes limited to the seeded-fault matrix in this contract;
- all changes audited.

### Test-provider credential carve-out

`DNSOPS_TEST_PROVIDER_TOKEN` is a test-harness credential, not a DNS Ops product capability.

It must:

- be scoped to the single designated test zone;
- have only the minimum zone-read and DNS-record mutation permissions needed by the fixtures;
- be stored as a runtime secret and never committed;
- never be returned by MCP, logged, placed in prompts or exposed to the implementing/reviewing agent as plaintext;
- be usable only through the deterministic fault-injection harness;
- be rejected by the harness for record names outside the allowlisted test hosts;
- support deterministic restoration to the captured baseline;
- be revoked when the test phase ends.

The agent and fresh reviewer may run the harness. They may not call the provider API directly.

Controlled mutations on these test assets through that harness are authorized. Production or client mutations are not.

If controlled test assets are not available by Gate 1, report:

```text
BLOCKED_BY_TEST_ASSET
```

Do not substitute a production domain.

## 4.3 Manual-work baseline

Before implementation, record the current manual checks.

Suggested starting set:

| Manual check | Current method | Frequency | Minutes per run | Domains covered |
|---|---|---:|---:|---:|
| Domain expiration | Registrar dashboards / notes |  |  |  |
| DNS delegation and key records | `dig`, provider UI |  |  |  |
| SPF/DKIM/DMARC configuration | Manual DNS inspection |  |  |  |
| TLS validity and expiration | Browser/provider/manual checker |  |  |  |
| HTTP availability and canonical redirects | Browser/curl |  |  |  |
| Homepage noindex/canonical | Source/headers/browser |  |  |  |

The baseline must record:

```ts
export type ManualCheckBaseline = {
  checkId: string;
  description: string;
  frequencyPerMonth: number;
  minutesPerRun: number;
  domainsPerRun: number;
  currentEvidenceLocation: string;
};
```

Phase success measures replacement or reduction of these named checks—not a subjective sense of time saved.

---

# 5. Scope

## 5.1 Included

- exact repository authority SHA and baseline;
- authoritative DNS truth or explicit limitation;
- rule-evaluation failure visibility;
- DMARC RFC 9989 parser and policy discovery;
- first-level SPF analysis with an explicit limited scope;
- removal/downgrade of unsafe generic remediation;
- minimal domain purpose/profile;
- RDAP/expiration evidence when available;
- TLS validity and expiration;
- HTTP reachability;
- HTTP/HTTPS and apex/`www` redirect matrix;
- homepage `noindex`, `X-Robots-Tag` and canonical where applicable;
- deterministic snapshot comparison;
- six bounded operational signals;
- minimal case/disposition lifecycle;
- actionable UNKNOWN/setup queue;
- legacy-alert convergence;
- six human playbooks;
- `/mcp` inside `apps/web`;
- ten required MCP tools;
- static MCP principals/scopes;
- deterministic MCP harness;
- seeded-fault evaluation;
- independent clean-context review.

## 5.2 Explicitly excluded

- recursive SPF evaluation;
- RFC 9990 RUA ingestion;
- RFC 9991 failure-report ingestion;
- formal hypothesis graph;
- built-in Lead Domain Analyst;
- Buzz integration;
- OAuth product;
- MCP management UI;
- public MCP onboarding;
- client portal;
- white label;
- commercial role routing;
- DNS/registrar/hosting/mail-provider writes from the DNS Ops product or MCP; the isolated test-harness carve-out in §4.2 is the only exception;
- deep crawling;
- Lighthouse;
- CrUX;
- broad accessibility analysis;
- privacy compliance;
- WebMCP;
- billing;
- commercial launch.

---

# 6. Repository-truth gate

Before changing product behavior, establish:

- exact authority SHA;
- repository-native validation commands;
- passing/failing test baseline;
- production/runtime architecture;
- current authoritative DNS behavior;
- current SPF and DMARC behavior;
- current alert-generation paths;
- current suggestion/remediation paths;
- current probe boundaries;
- stale or contradictory documentation.

Repository code, tests and migrations override prose claims.

## Gate 1 — End of engineering day 3

Required evidence:

- authority SHA;
- baseline report;
- test-asset authorization;
- manual-work baseline;
- legacy alert/remediation map;
- remaining twelve-day implementation scope.

A legacy condition map is required:

```ts
export type LegacyConditionDisposition =
  | "MAPPED_TO_SIGNAL"
  | "LEGACY_ONLY"
  | "DISABLED";

export type LegacyConditionMapEntry = {
  conditionId: string;
  disposition: LegacyConditionDisposition;
  replacementSignalKind?: InternalSignalKind;
  notificationPath: "SIGNAL_ALERT" | "LEGACY_ALERT" | "NONE";
};
```

Invariant:

> No condition may produce both a legacy notification and a signal-derived notification.
