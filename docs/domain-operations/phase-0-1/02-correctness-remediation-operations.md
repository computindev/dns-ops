# 7. Correctness foundation

## 7.1 Rule errors cannot disappear

A rule exception must not be reduced to a console log followed by an apparently clean result.

Required behavior:

```text
Rule evaluation failure
→ explicit evaluation error
→ affected check UNKNOWN
→ snapshot partial or equivalent incomplete state
→ retry/setup action
→ visible in UI, API and MCP
```

Tests must prove that an intentionally throwing rule cannot generate a false-green posture.

## 7.2 SPF decision: first-level only

Do not build recursive SPF evaluation.

The current outcome may:

- parse the published SPF record;
- identify direct mechanisms and modifiers;
- count direct terms that cause DNS lookups;
- identify syntactic or directly visible dangerous behavior;
- show includes and redirect targets as unresolved dependencies.

It may not claim:

- complete SPF evaluation;
- compliance with the global ten-term limit;
- absence of cycles;
- void-lookup compliance;
- validity of nested includes;
- real sender authorization.

Required result:

```ts
export type SpfAnalysisScope = "FIRST_LEVEL_ONLY";

export type FirstLevelSpfAssessment = {
  scope: SpfAnalysisScope;
  directDnsLookupTerms: number;
  includeDomains: string[];
  redirectDomain?: string;
  status:
    | "DIRECT_SYNTAX_VALID"
    | "DIRECT_SYNTAX_INVALID"
    | "UNKNOWN";
  completeEvaluation: false;
  limitation: string;
};
```

Rename ambiguous functions where practical, for example:

```text
countSPFLookups
→ countDirectSpfLookupTerms
```

No green label may say “SPF is within the 10 lookup limit.”

Recursive SPF evaluation becomes a separately budgeted backlog outcome.

## 7.3 DMARC decision: RFC 9989 tree walk is required

The outcome must implement current policy discovery, not only parse new tags.

### Parser

Model:

- `p`
- `sp`
- `np`
- `psd`
- `t`
- `rua`
- `ruf`
- `fo`
- `adkim`
- `aspf`

Legacy tags such as `pct`, `rf` and `ri` may be retained only as legacy observations/warnings. They must not drive current policy behavior.

### Policy discovery

Implement:

- direct `_dmarc` query;
- bounded DNS tree walk;
- maximum eight queries;
- `psd=y`;
- `psd=n`;
- organizational-domain determination;
- distinction among NODATA, NXDOMAIN, timeout, SERVFAIL and other transient errors;
- traceable query evidence.

The implementation may reuse existing DNS query primitives, but it may not defer tree walk while claiming RFC 9989 completion.

### Shared primitive

Create or identify one deterministic organizational-domain discovery primitive suitable for future relaxed-alignment use.

This phase does not ingest message streams, but it must not preserve an old PSL-only assumption.

### Required fixtures

- explicit author-domain record;
- inherited organizational policy;
- `psd=y`;
- `psd=n`;
- deep hierarchy reaching the eight-query bound;
- transient DNS error;
- multiple DMARC records;
- `np` behavior for a non-existent subdomain;
- legacy tags;
- strict and relaxed alignment helper cases.

## Gate 2 — End of engineering day 8

Must prove:

- no silent rule failure;
- no false authoritative certainty;
- first-level SPF limitation is visible;
- DMARC tree walk and fixtures pass;
- generic remediation is no longer executable-looking;
- no existing evaluator was weakened.

Do not start additional product surfaces when this gate fails.

---

# 8. Remediation policy

## 8.1 Generic suggestions

Generic suggestions may not contain a record value that appears ready to copy or execute.

Examples currently derived from assumptions about:

- Google SPF;
- generic reporting mailboxes;
- unknown-provider MX;
- placeholder DKIM keys;

must be removed from executable-looking suggestion payloads.

## 8.2 Downgrade target

Downgrade generic guidance to:

```text
playbookRef + non-executable prose
```

Example:

```ts
export type GuidanceOnlySuggestion = {
  kind: "GUIDANCE_ONLY";
  title: string;
  explanation: string;
  playbookId: string;
  requiresProviderConfirmation: boolean;
  executableMutation: null;
};
```

Playbooks may explain conceptual record shape in prose, clearly labeled as an example. They may not present a domain-specific value as approved or safe.

## 8.3 Deterministic simulation

Simulation remains available only when:

- applicability is known;
- required provider/domain context exists;
- proposed values are complete;
- no placeholder remains;
- the action is still local simulation only.

No external execution is included.

---

# 9. Coverage and UNKNOWN UX

Risk and coverage remain independent.

```text
Risk posture = what current known evidence indicates
Coverage = what the system was able to evaluate
```

## 9.1 Coverage gaps do not become signals

Remove:

```text
EVIDENCE_COVERAGE_GAP
```

from `InternalSignalKind`.

Coverage gaps:

- appear in `Needs setup/evidence`;
- include a resolution action;
- affect coverage metrics;
- do not auto-open cases;
- do not generate operational alerts;
- do not mix with regressions.

An operator may later decide to create a manual case, but automatic conversion is outside this outcome.

## 9.2 Required unknown model

```ts
export type UnknownReason =
  | "PURPOSE_UNDECLARED"
  | "EVIDENCE_STALE"
  | "PROBE_FAILED"
  | "AUTHORITATIVE_EVIDENCE_UNAVAILABLE"
  | "PROVIDER_NOT_CONNECTED"
  | "SELECTOR_NOT_DISCOVERED"
  | "UNSUPPORTED_CHECK"
  | "EXTERNAL_DECISION_REQUIRED";

export type UnknownResolutionAction =
  | "DECLARE_PURPOSE"
  | "RUN_FRESH_SCAN"
  | "RETRY_PROBE"
  | "SUPPLY_SELECTOR"
  | "CONNECT_PROVIDER"
  | "REVIEW_MANUALLY"
  | "NOT_CURRENTLY_OBSERVABLE";

export type UnknownResolution = {
  reason: UnknownReason;
  explanation: string;
  action: UnknownResolutionAction;
  actionLabel: string;
  blocking: boolean;
};
```

## 9.3 UI lanes

- Needs attention.
- Needs setup/evidence.
- Healthy with current evidence.
- Accepted/not applicable.

Acceptance test:

> No `UNKNOWN` may render as healthy, and every `UNKNOWN` must have an action or an explicit “not currently observable” explanation.

---

# 10. Signals and cases

## 10.1 Signal set

```ts
export type InternalSignalKind =
  | "DOMAIN_EXPIRING_SOON"
  | "TLS_CERTIFICATE_REGRESSION"
  | "HTTP_ENDPOINT_UNAVAILABLE"
  | "REDIRECT_TOPOLOGY_REGRESSION"
  | "HOMEPAGE_INDEXABILITY_REGRESSION"
  | "MAIL_DNS_CONFIGURATION_REGRESSION";
```

A signal represents:

- a regression;
- a threshold crossing;
- a material conflict;
- or an explicit operator-requested evaluation.

## 10.2 Minimal case lifecycle

```ts
export type InternalCaseStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "BLOCKED"
  | "RESOLVED"
  | "DISMISSED";
```

Required:

- open from one signal;
- deduplicate by stable signal/condition key;
- acknowledge;
- record disposition and note;
- resolve only after fresh evidence;
- reopen when a later scan reproduces the condition;
- preserve audit history.

## 10.3 Legacy alerts converge on signals

Findings remain atomic analysis results.

Signals become the canonical operational trigger for the six migrated conditions.

Existing alerts remain the notification/delivery state, but for migrated conditions they must be produced from the canonical signal path.

Required invariant:

```text
one condition
→ one signal
→ at most one active alert
→ at most one active case
```

Direct finding-to-alert generation must be disabled for migrated conditions.

Conditions not migrated must be explicitly marked `LEGACY_ONLY` or `DISABLED`.

Tests must prove that one seeded fault does not produce duplicate alerts, cases or notifications.

---

# 11. Playbooks

The implementation agent drafts; the founder calibrates and approves.

Required playbooks:

```text
docs/playbooks/
├── domain-expiry.md
├── tls-regression.md
├── redirect-regression.md
├── indexability-regression.md
├── mail-dns-configuration-regression.md
└── unknown-evidence.md
```

Each contains:

- what the condition proves;
- what it does not prove;
- deterministic evidence used;
- expected domain-purpose applicability;
- operator checks;
- safe next action;
- verification condition;
- explicit escalation boundary;
- non-executable examples where useful.

These are human operating guides, not a formal hypothesis graph.
