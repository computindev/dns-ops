# Unknown and missing evidence

## What the condition proves

`UNKNOWN` proves only that DNS Ops could not complete a trustworthy check or lacked required applicability/context evidence.

## What it does not prove

It does not prove safety, failure, regression, absence, or healthy configuration. Coverage gaps must not create automatic signals, alerts, or cases.

## Deterministic evidence

- typed unknown reason and explanation;
- failed or skipped check identifier;
- observation/probe status and timestamp when available;
- required resolution action;
- whether the gap blocks evaluation.

## Purpose applicability

This playbook applies to every portfolio domain. Purpose may determine which missing evidence matters, but an undeclared purpose is itself an actionable setup gap.

## Operator checks

1. Read the typed reason and requested action.
2. Confirm domain purpose and ownership.
3. Check evidence freshness, allowlisting, selector/provider context, and probe health.
4. Retry only when the target and action remain authorized.

## Safe next action

Use the stated action: declare purpose, run a fresh scan, retry a probe, supply a selector, connect/confirm provider context, review manually, or record that the item is not currently observable.

## Verification

Close the setup/evidence item only when a newer check returns a determined result or explicit accepted/not-applicable disposition.

## Escalation boundary

Escalate repeated probe failures, unavailable authoritative evidence, ambiguous ownership, or any request that would require production mutation. Never convert UNKNOWN into a regression automatically.
