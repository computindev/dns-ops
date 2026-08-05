# DNS Ops Phase 0–1 — Autonomous Completion Override

**Date:** 2026-07-28
**Authority:** Antonio
**Applies to:** DNS Ops Phase 0–1 V4.1
**Repository:** `computindev/dns-ops`
**Implementation PR:** #3

## Override

- Token count, context-window size, session duration, fifteen engineering days, three calendar weeks, and twenty-four founder hours are not automatic stop conditions.
- Continue until the approved outcome is genuinely complete or a real external approval, credential, asset, or authority boundary prevents progress.
- Original time and attention budgets remain tracking metrics and escalation thresholds.
- Report overruns, but do not stop solely because a budget threshold was crossed.
- Durable checkpoints, repository state, tests, and exact SHAs—not chat memory—must make the work restartable.

## Not overridden

- Product scope.
- Explicit exclusions.
- Tenant isolation.
- Security boundaries.
- No production or client mutation.
- No merge or deployment.
- No external provider write from DNS Ops or MCP.
- No RUA ingestion.
- No recursive SPF evaluator.
- No formal hypothesis graph.
- No built-in reasoning agent.
- No Buzz integration.
- No OAuth product.
- No commercial features.
- No weakening evaluators.
- No fabrication of founder declarations, credentials, evidence, or test results.

## Revised sequencing authority

Incomplete founder worksheet fields do not block work that is independent of external assets or founder declarations. The implementation owner is authorized to continue with:

- Gate 2 deterministic correctness work;
- local, non-destructive migrations;
- deterministic fixtures and the stubbed RFC 9989 resolver;
- rule-failure handling and actionable UNKNOWN propagation;
- first-level SPF scope corrections;
- generic-remediation downgrade;
- application-service contracts and local MCP schemas/tests;
- local signal and case lifecycle tests;
- non-live portions of Gate 3;
- a provider harness that contains no secret and cannot operate outside an explicit allowlist.

The incomplete worksheet continues to block:

- mutation of a real DNS provider;
- use of any provider credential;
- LIVE-01, LIVE-02, and LIVE-03;
- claims about measured manual-time savings;
- final Gate 3 PASS;
- final Gate 4 PASS.

Machine-inferred worksheet values must remain labeled `PROPOSED_NOT_FOUNDER_VERIFIED`. They are not founder declarations.

## Authority boundary

This amendment supersedes only token-, session-, and time-based stopping behavior and the sequencing effect of incomplete Day 0 inputs. It does not expand Phase 0–1 product scope or authorize unsafe actions, production/client mutation, provider writes outside the future isolated allowlisted test harness, merge, or deployment.
