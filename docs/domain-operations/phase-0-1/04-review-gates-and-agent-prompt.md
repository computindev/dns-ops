# 14. Fresh independent reviewer

“Independent” has an explicit implementation.

## 14.1 Reviewer setup

Use a separate agent session with:

- clean context;
- a disposable checkout or read-only view at the exact final SHA;
- no builder conversation;
- no builder completion summary before verdict;
- this V4 contract;
- the repository’s authoritative references;
- the falsification checklist below.

Prefer a different model or harness when available, but clean context and exact-SHA isolation are mandatory.

## 14.2 Reviewer authority

The reviewer may:

- inspect;
- run tests;
- use the internal MCP harness;
- execute controlled non-production fault fixtures through the deterministic harness only;
- use the harness-bound test-zone secret without receiving its plaintext value;
- inspect database state;
- compare UI/application/MCP behavior.

The reviewer must not:

- fix implementation;
- weaken tests;
- accept the builder’s claims without reproduction.

After the verdict, the builder summary may be supplied only to investigate discrepancies.

## 14.3 Fresh-review output

```ts
export type FreshReviewResult = {
  verdict: "PASS" | "FAIL" | "BLOCKED";
  reviewedSha: string;
  evidence: string[];
  falsificationAttempts: string[];
  findings: Array<{
    severity: "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";
    title: string;
    evidence: string;
  }>;
  residualUncertainty: string[];
  recommendedNextAction: string;
};
```

Founder adjudication time is capped at 2.5 hours.

---

# 15. Adversarial review checklist

The reviewer must try to prove:

- a rule exception still looks healthy;
- a failed query becomes absence rather than UNKNOWN;
- authoritative DNS certainty is overstated;
- SPF is described as completely evaluated;
- direct SPF terms are confused with the ten-term recursive budget;
- RFC 9989 discovery skips or exceeds its eight-query tree-walk bound;
- legacy `pct`, `rf` or `ri` still drive current policy;
- `psd=y`, `psd=n` or `np` behavior is wrong;
- relaxed alignment still depends on an old PSL-only assumption;
- an UNKNOWN renders green;
- an UNKNOWN lacks a resolution action;
- a coverage gap creates a signal or alert;
- a case resolves without a fresh scan;
- a resolved case fails to reopen;
- one fault creates parallel legacy and signal notifications;
- a generic remediation looks executable without sufficient context;
- MCP trusts actor/tenant arguments from the model;
- insufficient scopes are accepted;
- cross-tenant evidence leaks;
- duplicate MCP commands create duplicate state;
- MCP behavior differs from application-service behavior;
- `scan_request` accepts an arbitrary external target;
- the implementation secretly includes RUA, a graph, an agent or commercial scope.

PASS only when no realistic blocking counterexample remains on the exact reviewed SHA.

---

# 16. Gate 4 — End of engineering day 15

Required evidence:

- exact final SHA;
- clean Git state;
- repository-native validation green;
- Gate 2 correctness proof;
- Gate 3 seeded-fault proof;
- twelve MCP tools working;
- static scope model working;
- MCP negative tests green;
- one canonical alert/signal path;
- playbooks approved;
- manual-work baseline comparison;
- fresh independent review PASS.

Buzz, production deployment and commercial work remain separately authorized decisions.

---

# 17. Success and continuation criteria

## 17.1 Phase 0–1 passes when

- all seeded faults are correctly detected;
- no seeded failure is falsely green;
- the live loop resolves and reopens correctly;
- no duplicate operational pipeline exists;
- UNKNOWN is actionable;
- at least four named manual checks are automated or materially shortened;
- the MCP harness proves the same loop through the public application contract;
- maintenance cost appears bounded.

## 17.2 Continue as internal infrastructure when

During the next 30 days:

- scheduled checks replace the named manual baseline;
- signal noise remains acceptable;
- unknown coverage trends downward or has understood causes;
- verification remains reliable;
- maintenance does not demand significant founder attention.

A natural production incident is useful evidence but is not required to pass the implementation phase.

## 17.3 Commercial discovery may begin only when

- one second-human design partner uses it;
- at least one responsibility handoff occurs;
- one client-facing explanation is actually used;
- repeated operational work is visible;
- at least three potential pilots request continued use.

No commercial feature should be built in advance of that evidence.

## 17.4 Freeze expansion when

- most output remains non-actionable;
- false positives or unknowns dominate;
- standards maintenance is unbounded;
- manual work is not measurably reduced;
- DNS Ops materially competes with higher-priority products for founder bandwidth.

---

# 18. Required evidence from the implementation owner

Provide:

- authority and final SHAs;
- baseline command results;
- manual-work baseline;
- selected test assets;
- legacy condition map;
- RFC 9989 mapping and fixtures;
- first-level SPF limitation evidence;
- rule-failure/UNKNOWN evidence;
- seeded-fault matrix results;
- live mutation and rollback evidence;
- case lifecycle database/audit evidence;
- duplicate-path evidence;
- UNKNOWN/setup UX evidence;
- all twelve MCP contract results;
- scope and tenant negative tests;
- idempotency/concurrency evidence;
- playbook list and founder approval;
- deferred-scope confirmation;
- fresh-review verdict;
- residual caveats;
- approvals still required.

---

# 19. Stop conditions

Stop and preserve a restartable checkpoint when:

- the fifteen-day cap is reached;
- the three-week cap is reached;
- the founder’s 24-hour budget is exhausted;
- controlled test assets are unavailable;
- foundational correctness cannot fit the cap;
- work requires recursive SPF evaluation;
- work requires RUA ingestion;
- work requires a formal graph;
- work requires an agent;
- work requires commercial scope;
- work requires a production or client mutation.

A difficult implementation problem alone is not a blocker, but the hard budget and closed scope decisions are authoritative.

---

# 20. Compact prompt for the implementation agent

```text
Own a maximum-fifteen-day internal infrastructure outcome for
computindev/dns-ops.

Make current DNS/mail evidence trustworthy, add the smallest useful
domain/TLS/web-health loop, make every uncertainty actionable, and expose the
same application contracts through an internal MCP endpoint proven first by a
deterministic harness.

The following scope decisions are final:
- SPF remains first-level only; do not build recursive evaluation and do not
  claim compliance with the ten-term recursive lookup budget.
- Implement RFC 9989 DMARC DNS tree walk with a maximum of eight queries.
- Include MCP scan_request so fresh-evidence resolution is tested through MCP.
- Coverage gaps belong to setup/evidence and never auto-create signals or cases.
- Use a static token-hash to tenant/actor/scope map for MCP; build nothing more.
- Converge migrated legacy alerts on the signal path; no duplicate notification
  system.
- Downgrade generic remediations to non-executable playbook prose.
- Use seeded fixtures and authorized non-production mutations; do not wait for
  production to fail. Provider mutations run only through the deterministic
  test harness with a credential scoped to the test zone; the product and MCP
  have no provider-write capability.
- Pre-propagate TTL 60 for mutable test DNS records and use direct authoritative
  NS evidence for DNS mutation pass/fail; recursive cache alone is insufficient.
- Run RFC 9989 fixtures against a stubbed resolver with fixed responses; never
  make the deterministic suite depend on live DNS.
- Do not build RUA ingestion, a hypothesis graph, an agent, Buzz integration,
  OAuth, external writes or commercial features.

The hard cap is fifteen engineering days, three calendar weeks and twenty-four
founder hours. Continue until the evaluators and fresh independent review pass,
or stop at the first authoritative cap or genuine external blocker.
```
